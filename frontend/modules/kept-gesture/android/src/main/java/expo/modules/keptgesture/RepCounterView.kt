package expo.modules.keptgesture

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Matrix
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.util.Size
import android.view.Surface
import android.view.View
import android.view.ViewGroup
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.UseCase
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.framework.image.MPImage
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.concurrent.ConcurrentSkipListMap
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.roundToInt
import kotlin.math.sqrt

private const val POSE_MODEL_ASSET = "pose_landmarker_lite.task"
/** BlazePose indices the rep engine reads (packages/engine/src/reps.ts JOINTS): shoulders, elbows, wrists, hips, knees, ankles, left then right. */
private val JOINTS = intArrayOf(11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28)
private const val POSE_LANDMARKS = 33
private const val CAPTURE_MAX_EDGE = 640
private const val CAPTURE_QUALITY = 80
const val DEFAULT_SAMPLE_INTERVAL_MS = 50L
/** Watchdog: a (re)bound camera must deliver its first frame within this… */
private const val FIRST_FRAME_TIMEOUT_MS = 3000L
/** …and then never go this long without one. */
private const val STALL_TIMEOUT_MS = 1500L
private const val WATCHDOG_PERIOD_MS = 500L
/** At most this many rebinds within [REBIND_WINDOW_MS] (the budget also resets when the camera reaches OPEN or frames flow)… */
private const val MAX_REBINDS = 3
private const val REBIND_WINDOW_MS = 10_000L
/** …the n-th of them (0-based, within the window) waits n × this long… */
private const val REBIND_BACKOFF_MS = 500L
/** …and a camera that has delivered nothing for this long despite them is reported (onError "camera") anyway. */
private const val GIVE_UP_MS = 10_000L
/** After onError("camera"): how often the watchdog looks again and rebinds, so the view recovers when the camera frees up. */
private const val RETRY_PERIOD_MS = 2000L
/** Degrees past a 45° bucket edge the device must turn before the analysis rotation follows it. */
private const val ROTATION_HYSTERESIS_DEG = 10f
/**
 * The phone's roll is only read while gravity's component in the screen plane is at least this fraction of g (≈ 10° from
 * lying flat; OrientationEventListener needs ≈ 27°), so a phone propped at a shallow angle still gets the right bucket.
 */
private const val MIN_IN_PLANE_G = 0.17f
/** Low-pass factor for the accelerometer fallback (no TYPE_GRAVITY sensor): per sample, the share of the new reading. */
private const val ACCEL_LOW_PASS = 0.2f
/** A frame timestamp this close behind a known clock (ms) is taken to be on that clock. */
private const val MAX_FRAME_LAG_MS = 1000L

/** An upright analysis frame and its time since activation. The bitmap is never recycled: capture() may still be encoding it. */
private class Frame(val bitmap: Bitmap, val t: Long)

/** What analyze() needs to know about one bind of the camera. */
private class Session(val id: Int, val back: Boolean, val sensorDegrees: Int)

/** Per submitted frame, until its result arrives: the bucket it was made for and the phone's residual roll from it. */
private class FrameMeta(val rot: Int, val tilt: Int)

/**
 * Live rep counter camera (docs/notes/REP_COUNTER_CONTRACT.md): a CameraX preview plus an analysis stream fed to MediaPipe's
 * Pose Landmarker. It only reports 12 joints per sample; counting happens in TypeScript (packages/engine reps.ts), so the
 * phone and the server replay exactly the same samples.
 *
 * Gravity: the app is portrait-locked, but for push-ups the phone stands landscape on the floor. A gravity sensor listener
 * (TYPE_GRAVITY, else a low-passed accelerometer) computes the phone's exact roll, picks the nearest 90° bucket (with
 * hysteresis) and sets the analysis use case's targetRotation, so the analysis frame (rotated by imageInfo.rotationDegrees)
 * has image-down ≈ gravity-down, which the engine's plank/standing incline checks rely on. What is left over (a phone leaning
 * against a wall at 30°) is reported per sample as `tilt`, and the app refuses to count while it is large. The preview keeps
 * the display rotation: the UI stays portrait.
 *
 * Threads: props, binding, the gravity listener, the watchdog and every event dispatch run on the main thread. CameraX
 * calls analyze() on [analysisExecutor], which also owns the landmarker. MediaPipe calls onResult() on its own thread.
 * capture() encodes on [io].
 */
@SuppressLint("ViewConstructor")
class RepCounterView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  // Names must match Events(...) in KeptGestureModule's View block. No type argument: Map<String, Any> payloads.
  private val onReady by EventDispatcher()
  private val onPose by EventDispatcher()
  private val onError by EventDispatcher()

  // Props (main thread). The camera follows them in syncCamera(), called after every prop batch and on attach/detach.
  var active = false
  var facing = "front"
  @Volatile var sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS

  private val main = Handler(Looper.getMainLooper())
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private val analysisExecutor = Executors.newSingleThreadExecutor()
  private val io = Executors.newSingleThreadExecutor()
  @Volatile private var released = false

  private val previewView = PreviewView(context).apply {
    // TextureView, not SurfaceView: React Native overlays (the count, the hints) must draw on top of the preview.
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    scaleType = PreviewView.ScaleType.FILL_CENTER
  }

  // Main thread only.
  private var provider: ProcessCameraProvider? = null
  private var preview: Preview? = null
  private var analysis: ImageAnalysis? = null
  private var camera: Camera? = null
  private var boundOwner: LifecycleOwner? = null
  private var boundFacing: String? = null
  private var bindJob: Job? = null
  private var bindingFacing: String? = null
  private var sessions = 0
  private var readyFor = -1L
  private val sentErrors = HashSet<String>()
  /** Physical rotation bucket in degrees clockwise from portrait (0/90/180/270, OrientationEventListener's convention); -1 = not known yet. */
  private var deviceRot = -1
  /** Watchdog: when the current wait for frames began (bind, return to the foreground, or the landmarker coming up). */
  private var watchFrom = 0L
  /** Watchdog: when this view's recent rebinds happened (sliding [REBIND_WINDOW_MS] window). */
  private val rebindTimes = ArrayDeque<Long>()
  /** Watchdog: when the next (backed-off) rebind may run; 0 = none pending. */
  private var rebindDueAt = 0L
  /** Watchdog: when the current run of failures began; 0 = frames are flowing (or none was expected yet). */
  private var failingSince = 0L
  /** onError("camera") was sent for this activation: the watchdog keeps retrying slowly and recovers when frames flow again. */
  private var cameraFailed = false
  /** The bound camera has reached OPEN since the bind (or since the app came back), so a later CLOSED means it was taken away. */
  private var sawOpen = false

  private val watchdog = Runnable { checkCamera() }
  // observeForever, not observe(owner): a lifecycle-bound observer would replay a stale CLOSED on resume. Removed in unbindOwnUseCases().
  private val cameraStateObserver = Observer<CameraState> { state ->
    if (state.type == CameraState.Type.OPEN) {
      sawOpen = true
      // The camera came back (e.g. another camera user let go): earlier failures no longer count against the rebind budget.
      rebindTimes.clear()
    } else if (sawOpen && (state.type == CameraState.Type.CLOSED || state.error?.type == CameraState.ErrorType.CRITICAL)) {
      checkCamera()
    }
  }

  // Gravity (main thread; [rollDeg] is also read by analyze()).
  private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
  private val gravitySensor: Sensor? = sensorManager?.let { it.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: it.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) }
  private var gravityListening = false
  private val smoothed = FloatArray(3)
  private var smoothedPrimed = false
  /** The phone's exact roll, degrees clockwise from portrait in [0, 360); NaN = not known (no sensor, or flat since enabled). */
  @Volatile private var rollDeg = Float.NaN
  private val gravityListener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) = onGravity(event)
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
  }

  // One activation = from active turning true until it turns false (or the view is destroyed). A detach while active only
  // unbinds the camera: on re-attach the same activation goes on, `t` keeps counting and onReady is not sent again.
  // Worker threads read these to stamp samples and to drop frames and results that belong to an earlier activation.
  @Volatile private var running = false
  /** Activation base on the elapsedRealtime() clock: every `t` is measured from here, and MediaPipe gets `activatedAt + t`. */
  @Volatile private var activatedAt = 0L
  @Volatile private var latest: Frame? = null
  /** elapsedRealtime() of the last frame CameraX delivered, sampled or not (watchdog). */
  @Volatile private var lastFrameAt = 0L
  /** The last MediaPipe timestamp submitted. LIVE_STREAM wants them strictly increasing, across activations too. */
  @Volatile private var lastDetectTs = 0L
  /** MediaPipe timestamp → `rot` and `tilt` of that frame, until its result arrives. */
  private val pendingMeta = ConcurrentSkipListMap<Long, FrameMeta>()

  // analysisExecutor only.
  private var landmarker: PoseLandmarker? = null
  /** The model bytes stay referenced while the landmarker lives: MediaPipe may read the direct buffer without copying it. */
  private var modelBuffer: ByteBuffer? = null
  @Volatile private var modelFailed = false
  /** The landmarker exists. Until then the analysis thread is busy loading it, so the watchdog's first-frame clock waits. */
  @Volatile private var landmarkerReady = false
  /** The sample clock: per activation, re-anchored at the first frame of every bind (a new camera session may use a new time base). */
  private var clockActivation = Long.MIN_VALUE
  private var clockSession = -1
  private var anchorFrameMs = 0L
  private var anchorT = 0L
  private var lastT = -1L

  init {
    // React Native lays out only its own children. PreviewView adds its TextureView later, after RN's layout pass,
    // so lay it out by hand when that happens (the same handling as expo-camera's ExpoCameraView).
    previewView.setOnHierarchyChangeListener(object : OnHierarchyChangeListener {
      override fun onChildViewAdded(parent: View?, child: View?) {
        parent?.measure(
          MeasureSpec.makeMeasureSpec(measuredWidth, MeasureSpec.EXACTLY),
          MeasureSpec.makeMeasureSpec(measuredHeight, MeasureSpec.EXACTLY)
        )
        parent?.layout(0, 0, parent.measuredWidth, parent.measuredHeight)
      }

      override fun onChildViewRemoved(parent: View?, child: View?) = Unit
    })
    addView(previewView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    val width = right - left
    val height = bottom - top
    previewView.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    previewView.layout(0, 0, width, height)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    syncCamera()
  }

  override fun onDetachedFromWindow() {
    // Not syncCamera(): isAttachedToWindow is still true until this returns. Still active: keep the activation for re-attach.
    if (active) suspendCamera() else stopCamera()
    super.onDetachedFromWindow()
  }

  /** Brings the camera in line with `active`, `facing` and attachment. Main thread (OnViewDidUpdateProps, attach). */
  fun syncCamera() {
    if (released) return
    when {
      !active -> stopCamera()
      // Still active: keep the activation (and its clock) for when the view comes back.
      !isAttachedToWindow -> suspendCamera()
      else -> bindCamera()
    }
  }

  private fun bindCamera() {
    if (analysis != null && boundFacing == facing) return
    if (bindJob?.isActive == true && bindingFacing == facing) return
    // The activation starts even if the camera can't: errors are then sent once for it, not on every prop update.
    if (!running) beginActivation()
    val owner = appContext.currentActivity as? LifecycleOwner
      ?: return failCamera("The rep counter needs a foreground activity")
    if (owner.lifecycle.currentState == Lifecycle.State.DESTROYED) {
      // The activity is being recreated and the new one isn't current yet: look again shortly (not an error).
      return scheduleWatchdog(WATCHDOG_PERIOD_MS)
    }
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      emitError("permission", "Camera permission is not granted")
      // Granted later (from Settings, say): the camera starts on its own.
      return scheduleWatchdog(RETRY_PERIOD_MS)
    }
    // Load the model while the camera opens rather than on the first frame.
    executeOrIgnore(analysisExecutor) { if (landmarker == null) createLandmarker() }
    enableGravity()

    val wanted = facing
    bindJob?.cancel()
    bindingFacing = wanted
    bindJob = scope.launch {
      val self = coroutineContext[Job]
      try {
        val cameraProvider = provider ?: ProcessCameraProvider.awaitInstance(context.applicationContext).also { provider = it }
        if (released || !active || !running || !isAttachedToWindow || facing != wanted) return@launch
        unbindOwnUseCases()
        val selector = if (wanted == "back") CameraSelector.DEFAULT_BACK_CAMERA else CameraSelector.DEFAULT_FRONT_CAMERA
        val session = Session(++sessions, wanted == "back", cameraProvider.getCameraInfo(selector).sensorRotationDegrees)
        // Preview: 4:3 like the analysis frame (so what the user sees matches what is analysed), any size, for a sharp image.
        val newPreview = Preview.Builder()
          .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build())
          .build()
        newPreview.setSurfaceProvider(previewView.surfaceProvider)
        // Analysis: ~640x480 4:3. The pose model runs at 256 px anyway, and capture() wants ≤ 640 px.
        val newAnalysis = ImageAnalysis.Builder()
          .setResolutionSelector(
            ResolutionSelector.Builder()
              .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
              .setResolutionStrategy(ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
              .build()
          )
          .setTargetRotation(surfaceRotation(deviceRot))
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .build()
        newAnalysis.setAnalyzer(analysisExecutor) { proxy -> analyze(proxy, session) }
        // Never unbindAll(): ProcessCameraProvider is process-wide, and other camera views own their own use cases.
        val newCamera = cameraProvider.bindToLifecycle(owner, selector, newPreview, newAnalysis)
        preview = newPreview
        analysis = newAnalysis
        camera = newCamera
        boundOwner = owner
        boundFacing = wanted
        sawOpen = false
        newCamera.cameraInfo.cameraState.observeForever(cameraStateObserver)
        watchFrom = SystemClock.elapsedRealtime()
        // Verifies isBound right away, then every WATCHDOG_PERIOD_MS.
        checkCamera()
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        // E.g. the camera is held by another app: report it, and keep trying slowly.
        failCamera("The camera could not start: ${e.message ?: e.javaClass.simpleName}")
      } finally {
        // Only if no newer bind replaced this one meanwhile.
        if (bindJob === self) {
          bindJob = null
          bindingFacing = null
        }
      }
    }
  }

  /** A new activation: `t` restarts at 0, onReady is sent again, and the previous activation's frame is dropped. */
  private fun beginActivation() {
    // After the last MediaPipe timestamp, so that `activatedAt + t` keeps increasing even across activations.
    activatedAt = maxOf(SystemClock.elapsedRealtime(), lastDetectTs + 1)
    latest = null
    readyFor = -1L
    sentErrors.clear()
    rebindTimes.clear()
    rebindDueAt = 0L
    failingSince = 0L
    cameraFailed = false
    // A model that failed to load is tried again once per activation (the failure is then reported again, as onError "model").
    modelFailed = false
    running = true
  }

  /** Ends the activation and releases the camera. */
  private fun stopCamera() {
    running = false
    suspendCamera()
  }

  /** Releases the camera but keeps the activation. */
  private fun suspendCamera() {
    bindJob?.cancel()
    bindJob = null
    bindingFacing = null
    disableGravity()
    unbindOwnUseCases()
  }

  private fun unbindOwnUseCases() {
    main.removeCallbacks(watchdog)
    camera?.cameraInfo?.cameraState?.removeObserver(cameraStateObserver)
    camera = null
    boundOwner = null
    analysis?.clearAnalyzer()
    val own = listOfNotNull<UseCase>(preview, analysis)
    if (own.isNotEmpty()) provider?.unbind(*own.toTypedArray())
    preview = null
    analysis = null
    boundFacing = null
  }

  // ── watchdog (main thread) ──

  /**
   * Is the bound camera still delivering? expo-camera's CameraView calls unbindAll() when it mounts or unmounts, which
   * silently drops this view's use cases; the camera can also be closed, stall, or be held by another app. Rebinds up to
   * [MAX_REBINDS] times within [REBIND_WINDOW_MS] (backing off), then reports onError("camera") and goes on retrying every
   * [RETRY_PERIOD_MS]; when frames flow again the error is cleared and onReady is sent again. Runs right after a bind, every
   * WATCHDOG_PERIOD_MS, and on a CLOSED / critical camera state.
   */
  private fun checkCamera() {
    main.removeCallbacks(watchdog)
    if (released || !running || !isAttachedToWindow) return
    val ownAnalysis = analysis
    val owner = boundOwner
    if (ownAnalysis == null || owner == null) {
      // Nothing bound (a failed bind, or given up after being unbound): try again, unless a bind is already on its way.
      if (bindJob?.isActive != true) bindCamera()
      return
    }
    val now = SystemClock.elapsedRealtime()
    val lifecycleState = owner.lifecycle.currentState
    if (lifecycleState == Lifecycle.State.DESTROYED) {
      // The activity was recreated: CameraX dropped the use cases with it. Bind again, to the current activity.
      unbindOwnUseCases()
      bindCamera()
      return
    }
    if (!lifecycleState.isAtLeast(Lifecycle.State.STARTED)) {
      // In the background CameraX closes the camera itself and reopens it on return: time the first frame from then.
      watchFrom = now
      sawOpen = false
      // Time away doesn't count towards GIVE_UP_MS: a stall after the return gets its rebinds again.
      failingSince = 0L
      rebindDueAt = 0L
      scheduleWatchdog(WATCHDOG_PERIOD_MS)
      return
    }
    // The model loads on the analysis thread, which holds frames back meanwhile: the first-frame clock starts once it is in.
    if (!landmarkerReady && !modelFailed) watchFrom = now
    val bound = provider?.isBound(ownAnalysis) == true
    val last = lastFrameAt
    val flowing = last > watchFrom
    val state = camera?.cameraInfo?.cameraState?.value
    val closed = sawOpen && (state?.type == CameraState.Type.CLOSED || state?.error?.type == CameraState.ErrorType.CRITICAL)
    val stalled = if (flowing) now - last > STALL_TIMEOUT_MS else now - watchFrom > FIRST_FRAME_TIMEOUT_MS
    if (bound && !closed && !stalled) {
      if (flowing) onFramesFlowing()
      scheduleWatchdog(if (cameraFailed) RETRY_PERIOD_MS else WATCHDOG_PERIOD_MS)
      return
    }
    if (failingSince == 0L) failingSince = now
    if (cameraFailed) {
      // Already reported: rebind if the camera may be back (unbound or closed), or once the last rebind had its chance.
      if (!bound || closed || now - watchFrom > FIRST_FRAME_TIMEOUT_MS) rebind() else scheduleWatchdog(RETRY_PERIOD_MS)
      return
    }
    while (rebindTimes.isNotEmpty() && now - rebindTimes.first() > REBIND_WINDOW_MS) rebindTimes.removeFirst()
    if (rebindTimes.size < MAX_REBINDS && now - failingSince < GIVE_UP_MS) {
      if (rebindDueAt == 0L) rebindDueAt = now + REBIND_BACKOFF_MS * rebindTimes.size
      if (now >= rebindDueAt) {
        rebindTimes.addLast(now)
        rebind()
      } else {
        scheduleWatchdog(rebindDueAt - now)
      }
      return
    }
    val reason = when {
      !bound -> "its use cases were unbound (another camera took over)"
      closed -> "the camera was closed${state?.error?.let { " (error ${it.code})" } ?: ""}"
      else -> "no frames for ${now - maxOf(last, watchFrom)} ms"
    }
    // Still bound but silent: leave it bound, CameraX may yet reopen it. Unbound: nothing left to keep.
    if (!bound) unbindOwnUseCases()
    failCamera("The camera stopped: $reason")
  }

  private fun rebind() {
    rebindDueAt = 0L
    unbindOwnUseCases()
    bindCamera()
  }

  /** Frames are flowing from a bound camera: the failure run is over, and a reported camera error is cleared. */
  private fun onFramesFlowing() {
    failingSince = 0L
    rebindDueAt = 0L
    rebindTimes.clear()
    if (cameraFailed) {
      cameraFailed = false
      // A later failure is reported again, and the next pose result sends onReady again (the camera is back).
      sentErrors.remove("camera")
      readyFor = -1L
    }
  }

  /** Reports onError("camera") (once per activation until it recovers) and keeps the watchdog retrying slowly. */
  private fun failCamera(message: String) {
    cameraFailed = true
    rebindDueAt = 0L
    emitError("camera", message)
    scheduleWatchdog(RETRY_PERIOD_MS)
  }

  private fun scheduleWatchdog(delayMs: Long) {
    main.removeCallbacks(watchdog)
    if (released || !running) return
    main.postDelayed(watchdog, delayMs)
  }

  // ── device rotation (main thread) ──

  private fun enableGravity() {
    if (gravityListening) return
    val manager = sensorManager ?: return
    val sensor = gravitySensor ?: return
    smoothedPrimed = false
    rollDeg = Float.NaN
    gravityListening = manager.registerListener(gravityListener, sensor, SensorManager.SENSOR_DELAY_UI, main)
  }

  private fun disableGravity() {
    if (!gravityListening) return
    sensorManager?.unregisterListener(gravityListener)
    gravityListening = false
  }

  /**
   * Gravity in device coordinates (x right, y up the screen, z out of it; the sensor reports the reaction, +g pointing up).
   * Roll = atan2(-x, y): 0 upright portrait, 90 with the left edge up (top pointing right), as OrientationEventListener.
   */
  private fun onGravity(event: SensorEvent) {
    var gx = event.values[0]
    var gy = event.values[1]
    var gz = event.values[2]
    if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
      // No gravity sensor: a low-pass filter keeps gravity and drops most of the phone's own motion.
      if (!smoothedPrimed) {
        smoothed[0] = gx; smoothed[1] = gy; smoothed[2] = gz
        smoothedPrimed = true
      } else {
        smoothed[0] += ACCEL_LOW_PASS * (gx - smoothed[0])
        smoothed[1] += ACCEL_LOW_PASS * (gy - smoothed[1])
        smoothed[2] += ACCEL_LOW_PASS * (gz - smoothed[2])
      }
      gx = smoothed[0]; gy = smoothed[1]; gz = smoothed[2]
    }
    val inPlane = sqrt(gx * gx + gy * gy)
    val total = sqrt(gx * gx + gy * gy + gz * gz)
    // Lying (nearly) flat: no usable direction of gravity in the screen plane, keep the last roll and rotation.
    if (total < 1f || inPlane < MIN_IN_PLANE_G * total) return
    val roll = ((Math.toDegrees(atan2(-gx, gy).toDouble()) + 360.0) % 360.0).toFloat()
    rollDeg = roll
    val current = deviceRot
    if (current >= 0 && abs(signedDegrees(roll - current)) <= 45f + ROTATION_HYSTERESIS_DEG) return
    val nearest = ((roll / 90f).roundToInt() % 4) * 90
    if (nearest == current) return
    deviceRot = nearest
    // Applies to the next frames; each frame's imageInfo.rotationDegrees says which rotation it was made for.
    analysis?.targetRotation = surfaceRotation(nearest)
  }

  /** An angle difference folded into [-180, 180). */
  private fun signedDegrees(diff: Float): Float = ((diff % 360f) + 540f) % 360f - 180f

  /** The phone's roll relative to a frame's bucket, whole degrees (positive: turned further clockwise); 0 if unknown. */
  private fun tiltFrom(rot: Int): Int {
    val roll = rollDeg
    if (roll.isNaN()) return 0
    val tilt = signedDegrees(roll - rot).roundToInt()
    return if (tilt >= 180) tilt - 360 else tilt // rounding 179.6 gives 180: keep the contract's [-180, 180)
  }

  /** Physical clockwise rotation → the display rotation an unlocked UI would have, which is what targetRotation means. */
  private fun surfaceRotation(rot: Int): Int = when (rot) {
    90 -> Surface.ROTATION_270
    180 -> Surface.ROTATION_180
    270 -> Surface.ROTATION_90
    else -> Surface.ROTATION_0
  }

  // ── analysis thread ──

  private fun analyze(proxy: ImageProxy, session: Session) {
    val now = SystemClock.elapsedRealtime()
    lastFrameAt = now
    val since = activatedAt
    if (released || !running || modelFailed) {
      proxy.close()
      return
    }
    // `t` comes from the sensor timestamp (exact frame spacing), anchored to the activation clock at each bind's first frame.
    val frameMs = proxy.imageInfo.timestamp / 1_000_000L
    if (since != clockActivation) {
      clockActivation = since
      clockSession = -1
      lastT = -1L
    }
    if (session.id != clockSession) {
      clockSession = session.id
      anchorFrameMs = frameMs
      anchorT = maxOf(now - since - frameLag(frameMs, now), lastT + 1)
    }
    val t = maxOf(anchorT + (frameMs - anchorFrameMs), lastT + 1)
    val detectTs = since + t
    // Throttle before converting: a skipped frame costs nothing, and onPose can't be more frequent than its frames.
    if ((lastT >= 0 && t - lastT < sampleIntervalMs) || detectTs <= lastDetectTs) {
      proxy.close()
      return
    }
    val lm = landmarker ?: createLandmarker()
    if (lm == null) {
      proxy.close()
      return
    }
    val rotation = proxy.imageInfo.rotationDegrees
    val raw = try { proxy.toBitmap() } catch (e: Exception) { null } finally { proxy.close() } // free the camera buffer before inference
    if (raw == null) return
    // The model and the rep engine both want the frame gravity-upright; capture() hands out this same frame.
    val upright = if (rotation == 0) raw
      else Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
    if (upright !== raw) raw.recycle()
    lastT = t
    lastDetectTs = detectTs
    val rot = deviceRotationOf(rotation, session)
    pendingMeta[detectTs] = FrameMeta(rot, tiltFrom(rot))
    latest = Frame(upright, t)
    try {
      // Not closing the MPImage: closing a bitmap-backed MPImage recycles the bitmap, which `latest` still holds.
      lm.detectAsync(BitmapImageBuilder(upright).build(), detectTs)
    } catch (e: RuntimeException) {
      pendingMeta.remove(detectTs)
      emitError("internal", "Pose detection failed: ${e.message ?: e.javaClass.simpleName}")
    }
  }

  /** How long ago the frame was captured, if its timestamp is on a clock we can read (elapsedRealtime or uptime); else 0. */
  private fun frameLag(frameMs: Long, elapsedNow: Long): Long {
    val onElapsed = elapsedNow - frameMs
    if (onElapsed in 0..MAX_FRAME_LAG_MS) return onElapsed
    val onUptime = SystemClock.uptimeMillis() - frameMs
    if (onUptime in 0..MAX_FRAME_LAG_MS) return onUptime
    return 0L
  }

  /**
   * The physical device rotation a frame was produced for, from its rotationDegrees (CameraX: back = sensor − display,
   * front = sensor + display, mod 360), so `rot` always matches the frame even right after a rotation change.
   */
  private fun deviceRotationOf(rotationDegrees: Int, session: Session): Int {
    val display = if (session.back) session.sensorDegrees - rotationDegrees else rotationDegrees - session.sensorDegrees
    return (360 - Math.floorMod(display, 360)) % 360
  }

  private fun createLandmarker(): PoseLandmarker? {
    if (modelFailed || released) return null
    return try {
      // From a direct buffer rather than setModelAssetPath: the asset may be stored compressed in the APK.
      val bytes = context.assets.open(POSE_MODEL_ASSET).use { it.readBytes() }
      val buffer = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
      buffer.put(bytes)
      buffer.rewind()
      val options = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetBuffer(buffer).setDelegate(Delegate.CPU).build())
        .setRunningMode(RunningMode.LIVE_STREAM)
        .setNumPoses(1)
        .setMinPoseDetectionConfidence(0.5f)
        .setMinPosePresenceConfidence(0.5f)
        .setMinTrackingConfidence(0.5f)
        .setOutputSegmentationMasks(false)
        .setResultListener { result: PoseLandmarkerResult, input: MPImage -> onResult(result, input) }
        .setErrorListener { e: RuntimeException -> emitError("internal", "Pose landmarker error: ${e.message ?: e.javaClass.simpleName}") }
        .build()
      PoseLandmarker.createFromOptions(context, options).also {
        modelBuffer = buffer
        landmarker = it
        landmarkerReady = true
      }
    } catch (e: Exception) {
      modelFailed = true
      emitError("model", "The pose model failed to load: ${e.message ?: e.javaClass.simpleName}")
      null
    }
  }

  // ── MediaPipe result thread ──

  private fun onResult(result: PoseLandmarkerResult, input: MPImage) {
    val since = activatedAt
    val ts = result.timestampMs()
    val meta = pendingMeta.remove(ts)
    pendingMeta.headMap(ts).clear() // frames MediaPipe dropped without a result
    if (released || !running || ts < since) return
    val pose = result.landmarks().firstOrNull()
    // 36 ints, joint by joint: x‰, y‰ (normalized to the upright frame), visibility %. Empty when nobody is in frame.
    val p = ArrayList<Int>(JOINTS.size * 3)
    if (pose != null && pose.size >= POSE_LANDMARKS) {
      for (j in JOINTS) {
        val landmark = pose[j]
        p.add(Math.round(landmark.x() * 1000f))
        p.add(Math.round(landmark.y() * 1000f))
        p.add(Math.round(landmark.visibility().orElse(0f) * 100f))
      }
    }
    val payload = mapOf<String, Any>(
      "t" to (ts - since).toInt(), "w" to input.width, "h" to input.height,
      "rot" to (meta?.rot ?: 0), "tilt" to (meta?.tilt ?: 0), "p" to p
    )
    main.post {
      if (released || !running || activatedAt != since) return@post
      // Ready = the camera delivers frames and the landmarker answers: the first result of this activation.
      if (readyFor != since) {
        readyFor = since
        onReady(emptyMap())
      }
      onPose(payload)
    }
  }

  // ── errors (any thread) ──

  /** Sent on the main thread, once per code per activation: a failing frame loop must not flood the JS thread. */
  private fun emitError(code: String, message: String) {
    main.post {
      if (released || !sentErrors.add(code)) return@post
      onError(mapOf("code" to code, "message" to message))
    }
  }

  private fun executeOrIgnore(executor: java.util.concurrent.Executor, task: () -> Unit) {
    try { executor.execute(Runnable { task() }) } catch (_: RejectedExecutionException) { /* released meanwhile */ }
  }

  // ── view function ──

  /** The latest upright analysis frame as a JPEG (≤ 640 px, q80, base64), its SHA-256, and its `t`. Encoded off the UI thread. */
  fun capture(promise: Promise) {
    val frame = latest ?: return promise.reject("ERR_NO_FRAME", "The rep counter has no camera frame yet", null)
    try {
      io.execute {
        try {
          val source = frame.bitmap
          val edge = maxOf(source.width, source.height)
          val scaled = if (edge > CAPTURE_MAX_EDGE) {
            val ratio = CAPTURE_MAX_EDGE.toFloat() / edge
            Bitmap.createScaledBitmap(source, Math.round(source.width * ratio), Math.round(source.height * ratio), true)
          } else source
          val jpeg = ByteArrayOutputStream().use { out ->
            check(scaled.compress(Bitmap.CompressFormat.JPEG, CAPTURE_QUALITY, out)) { "JPEG encoding failed" }
            out.toByteArray()
          }
          if (scaled !== source) scaled.recycle()
          val sha256 = MessageDigest.getInstance("SHA-256").digest(jpeg).joinToString("") { "%02x".format(it) }
          promise.resolve(mapOf("jpeg" to Base64.encodeToString(jpeg, Base64.NO_WRAP), "sha256" to sha256, "t" to frame.t.toInt()))
        } catch (e: Exception) {
          promise.reject("ERR_CAPTURE", "The frame could not be encoded: ${e.message ?: e.javaClass.simpleName}", e)
        }
      }
    } catch (e: RejectedExecutionException) {
      promise.reject("ERR_RELEASED", "The rep counter was closed", e)
    }
  }

  /** OnViewDestroys: ends the activation, unbinds this view's use cases and closes the landmarker on its own thread. Idempotent. */
  fun release() {
    if (released) return
    stopCamera()
    released = true
    scope.cancel()
    main.removeCallbacksAndMessages(null)
    executeOrIgnore(analysisExecutor) {
      runCatching { landmarker?.close() }
      landmarker = null
      landmarkerReady = false
      modelBuffer = null
    }
    analysisExecutor.shutdown()
    io.shutdown()
  }
}
