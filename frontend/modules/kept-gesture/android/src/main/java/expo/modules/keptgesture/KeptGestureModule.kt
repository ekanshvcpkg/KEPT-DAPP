package expo.modules.keptgesture

import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.StatFs
import android.os.SystemClock
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.gesturerecognizer.GestureRecognizer
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

private const val GESTURE_URL = "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task"
private const val GEMMA_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/6e5c4f1e395deb959c494953478fa5cec4b8008f/gemma-4-E2B-it.litertlm"
private const val GESTURE_FILE = "gesture_recognizer.task"
private const val GEMMA_FILE = "gemma-4-E2B-it.litertlm"
// Sizes and digests are the hosts' own: Hugging Face's x-linked-size / x-linked-etag (SHA-256) for Gemma, Google Cloud
// Storage's content-length / x-goog-hash (MD5) for the pinned, versioned gesture model.
private const val GESTURE_BYTES = 8_373_440L
private const val GESTURE_MD5 = "4dbf485c473207651100a1895343f35a"
private const val GEMMA_BYTES = 2_588_147_712L
private const val GEMMA_SHA256 = "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c"
private const val STORAGE_MARGIN = 250_000_000L
private const val PROGRESS_EVERY_MS = 250L
private const val MAX_REDIRECTS = 6
private const val LOG_TAG = "KeptProof"
private const val UNSUPPORTED_DEVICE = "On-device proof recognition requires a physical Android device"

/** A model the app needs: where it comes from, and the exact size and digest it must have. */
private class ModelSpec(val url: String, val name: String, val bytes: Long, val algorithm: String, val digest: String)

private class DownloadCancelled : Exception("Model download cancelled")

class KeptGestureModule : Module() {
  private var engine: Engine? = null
  private var engineBackend = "CPU"
  private var conversationPrepared = false
  private val downloading = AtomicBoolean(false)
  @Volatile private var cancelRequested = false
  private val context get() = requireNotNull(appContext.reactContext)
  private val modelDir get() = File(context.noBackupFilesDir, "kept-models").apply { mkdirs() }
  private val gesture = ModelSpec(GESTURE_URL, GESTURE_FILE, GESTURE_BYTES, "MD5", GESTURE_MD5)
  private val gemma = ModelSpec(GEMMA_URL, GEMMA_FILE, GEMMA_BYTES, "SHA-256", GEMMA_SHA256)
  private val models get() = listOf(gesture, gemma)
  private val gemmaFile get() = File(modelDir, GEMMA_FILE)
  private fun fileOf(m: ModelSpec) = File(modelDir, m.name)
  private fun partialOf(m: ModelSpec) = File(modelDir, m.name + ".partial")
  private fun markerOf(m: ModelSpec) = File(modelDir, m.name + ".verified")

  override fun definition() = ModuleDefinition {
    Name("KeptGesture")

    Events("onDownloadProgress")

    AsyncFunction("getModelStatus") {
      status()
    }

    // Resumable: whatever an earlier attempt left on disk is kept, and the next call continues from it.
    AsyncFunction("downloadModels") Coroutine { ->
      withContext(Dispatchers.IO) { downloadAll() }
    }

    AsyncFunction("cancelDownload") {
      cancelRequested = downloading.get()
      cancelRequested
    }

    AsyncFunction("prepareScanner") {
      check(isSupportedDevice()) { UNSUPPORTED_DEVICE }
      check(models.all { isVerified(it) }) { "Download the on-device proof models first" }
      val started = SystemClock.elapsedRealtime()
      ensureScannerReady()
      Log.i(LOG_TAG, "scanner ready backend=$engineBackend load=${SystemClock.elapsedRealtime() - started}ms")
      true
    }

    AsyncFunction("analyze") { uri: String, expectedObject: String, expectedGesture: String ->
      check(isSupportedDevice()) { UNSUPPORTED_DEVICE }
      analyze(uri, expectedObject, expectedGesture)
    }
  }

  private fun isEmulator(): Boolean {
    val fingerprint = Build.FINGERPRINT.lowercase()
    val hardware = Build.HARDWARE.lowercase()
    return fingerprint.contains("generic") || fingerprint.contains("sdk_gphone") ||
      fingerprint.contains("emulator") || hardware in setOf("goldfish", "ranchu", "vbox86", "android_x86")
  }

  /** Physical ARM64 device only: emulators and x86/32-bit ABIs lack the LiteRT LM / MediaPipe native runtimes. */
  private fun isSupportedDevice() = !isEmulator() && Build.SUPPORTED_64_BIT_ABIS.contains("arm64-v8a")

  // ── Integrity ──
  // Hashing 2.6 GB takes seconds, so it happens once: when a download finishes. The result is a marker beside the
  // file recording the size and modification time that were verified. Every later check (each launch) compares those
  // with the file as it is now, which is a stat call. A file that changed size or was written to since fails the
  // check and is verified again (or fetched again) before it is used.
  private fun markerText(m: ModelSpec, file: File) = "${m.bytes}:${file.lastModified()}:${m.algorithm}:${m.digest}"

  private fun isVerified(m: ModelSpec): Boolean {
    val file = fileOf(m)
    val marker = markerOf(m)
    return file.isFile && file.length() == m.bytes && marker.isFile && runCatching { marker.readText() }.getOrNull() == markerText(m, file)
  }

  /** Bytes of this model already on the phone: the finished file, or the half-done download. */
  private fun onDisk(m: ModelSpec): Long {
    val file = fileOf(m)
    if (file.isFile) return file.length().coerceAtMost(m.bytes)
    val partial = partialOf(m)
    return if (partial.isFile) partial.length().coerceAtMost(m.bytes) else 0L
  }

  private fun status() = mapOf(
    "supported" to isSupportedDevice(),
    "gestureReady" to isVerified(gesture),
    "visionReady" to isVerified(gemma),
    "modelBytes" to GEMMA_BYTES,
    "downloadedBytes" to models.sumOf { if (isVerified(it)) it.bytes else onDisk(it) },
    "totalBytes" to models.sumOf { it.bytes }
  )

  private fun digestOf(file: File, algorithm: String, onProgress: (Long) -> Unit): String {
    val digest = MessageDigest.getInstance(algorithm)
    var hashed = 0L
    file.inputStream().buffered().use { input ->
      val buffer = ByteArray(1024 * 1024)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
        hashed += count
        onProgress(hashed)
        if (cancelRequested) throw DownloadCancelled()
      }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
  }

  /** Hashes `file` (a finished download, or a file an earlier build left) and says whether it is the model we pin. */
  private fun matchesDigest(m: ModelSpec, file: File): Boolean {
    if (file.length() != m.bytes) return false
    var lastEmit = 0L
    val actual = digestOf(file, m.algorithm) { hashed ->
      val now = SystemClock.elapsedRealtime()
      if (now - lastEmit >= PROGRESS_EVERY_MS) { lastEmit = now; emitProgress("verifying", hashed, m.bytes) }
    }
    return actual == m.digest
  }

  private fun installAndMark(m: ModelSpec, from: File) {
    val destination = fileOf(m)
    destination.delete()
    if (!from.renameTo(destination)) error("Could not install the downloaded model")
    markerOf(m).writeText(markerText(m, destination))
  }

  // ── Download ──
  private fun emitProgress(phase: String, bytes: Long, total: Long) {
    sendEvent("onDownloadProgress", mapOf("phase" to phase, "bytes" to bytes, "total" to total))
  }

  private fun downloadAll(): Map<String, Any> {
    check(isSupportedDevice()) { UNSUPPORTED_DEVICE }
    check(downloading.compareAndSet(false, true)) { "The models are already downloading" }
    cancelRequested = false
    try {
      val missing = models.sumOf { if (isVerified(it)) 0L else it.bytes - onDisk(it) }
      val free = StatFs(modelDir.absolutePath).availableBytes
      require(missing == 0L || free >= missing + STORAGE_MARGIN) { "Free up at least ${(missing + STORAGE_MARGIN) / 1_000_000_000.0} GB of device storage, then retry the model download." }
      val total = models.sumOf { it.bytes }
      var finished = 0L
      for (m in models) {
        ensureModel(m, finished, total)
        finished += m.bytes
      }
      return status()
    } catch (e: DownloadCancelled) {
      Log.i(LOG_TAG, "model download cancelled; partial files kept for resume")
      return status()
    } finally {
      downloading.set(false)
      cancelRequested = false
    }
  }

  private fun ensureModel(m: ModelSpec, finishedBefore: Long, total: Long) {
    if (isVerified(m)) return
    val file = fileOf(m)
    // Present but not verified: an earlier build's download (it checked the hash then but kept no marker), or a file
    // that changed afterwards. Hash it once; a match is marked and kept, anything else is dropped and fetched again.
    if (file.isFile) {
      if (matchesDigest(m, file)) { markerOf(m).writeText(markerText(m, file)); return }
      Log.w(LOG_TAG, "${m.name} failed its integrity check; downloading it again")
      file.delete()
      markerOf(m).delete()
    }
    val partial = partialOf(m)
    fetch(m, partial) { downloaded -> emitProgress("downloading", finishedBefore + downloaded, total) }
    if (!matchesDigest(m, partial)) {
      partial.delete()
      error("${m.name} failed its integrity check; retry the download")
    }
    installAndMark(m, partial)
  }

  /** Opens `source` at byte `from`, following redirects by hand so the Range header survives the hop to the CDN. */
  private fun open(source: String, from: Long): HttpURLConnection {
    var target = source
    for (hop in 0..MAX_REDIRECTS) {
      require(target.startsWith("https://")) { "Model downloads must use https" }
      val connection = URL(target).openConnection() as HttpURLConnection
      connection.connectTimeout = 20_000
      connection.readTimeout = 60_000
      connection.instanceFollowRedirects = false
      connection.setRequestProperty("Accept-Encoding", "identity")
      if (from > 0L) connection.setRequestProperty("Range", "bytes=$from-")
      val code = connection.responseCode
      if (code in setOf(301, 302, 303, 307, 308)) {
        val location = connection.getHeaderField("Location")
        connection.disconnect()
        target = URL(URL(target), location ?: error("Model download redirect had no target")).toString()
        continue
      }
      return connection
    }
    error("Model download was redirected too many times")
  }

  /** Writes `destination` (a .partial file) to the model's full size, continuing from what is already there. */
  private fun fetch(m: ModelSpec, destination: File, onBytes: (Long) -> Unit) {
    var have = if (destination.isFile) destination.length() else 0L
    if (have > m.bytes) { destination.delete(); have = 0L }
    if (have == m.bytes) { onBytes(have); return }
    val connection = open(m.url, have)
    try {
      val append: Boolean
      when (connection.responseCode) {
        206 -> {
          // The server must resume exactly where we asked, for exactly this file.
          val range = Regex("""bytes (\d+)-(\d+)/(\d+)""").find(connection.getHeaderField("Content-Range") ?: "")
          val ok = range != null && range.groupValues[1].toLong() == have && range.groupValues[3].toLong() == m.bytes
          if (!ok) { destination.delete(); error("The server could not resume the download; retry it") }
          append = true
        }
        200 -> {
          // The server ignored Range (or this is a first attempt): start from the top.
          val length = connection.contentLengthLong
          if (length >= 0 && length != m.bytes) error("${m.name} has an unexpected size on the server")
          append = false
          have = 0L
        }
        416 -> { destination.delete(); error("The partial download was out of range; retry the download") }
        else -> error("Model download failed (${connection.responseCode})")
      }
      var written = have
      var lastEmit = 0L
      onBytes(written)
      try {
        FileOutputStream(destination, append).use { output ->
          connection.inputStream.use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              if (cancelRequested) throw DownloadCancelled()
              val count = input.read(buffer)
              if (count < 0) break
              output.write(buffer, 0, count)
              written += count
              val now = SystemClock.elapsedRealtime()
              if (now - lastEmit >= PROGRESS_EVERY_MS) { lastEmit = now; onBytes(written) }
            }
          }
        }
      } catch (e: IOException) {
        // Dropped connection or no space left: the bytes written so far are kept, and the next attempt resumes.
        throw IOException("The download was interrupted (${written - have} bytes this time). Retry to continue.", e)
      }
      onBytes(written)
      if (destination.length() != m.bytes) error("The download ended early (${destination.length()} of ${m.bytes} bytes). Retry to continue.")
    } finally { connection.disconnect() }
  }

  @Synchronized
  private fun ensureEngine(): Engine {
    engine?.let { return it }
    val cacheDir = File(context.cacheDir, "litert-lm").apply { mkdirs() }.absolutePath
    if (shouldUseCpuBackend()) {
      Log.i(LOG_TAG, "Using CPU backend fingerprint=${Build.FINGERPRINT} hardware=${Build.HARDWARE}")
      val loaded = Engine(EngineConfig(modelPath = gemmaFile.absolutePath, backend = Backend.CPU(), visionBackend = Backend.CPU(), cacheDir = cacheDir))
      loaded.initialize()
      engineBackend = "CPU"
      engine = loaded
      return loaded
    }

    try {
      val loaded = Engine(EngineConfig(modelPath = gemmaFile.absolutePath, backend = Backend.GPU(), visionBackend = Backend.GPU(), cacheDir = cacheDir))
      try { loaded.initialize() } catch (e: Exception) { loaded.close(); throw e }
      engineBackend = "GPU"
      engine = loaded
      return loaded
    } catch (e: Exception) {
      Log.w(LOG_TAG, "GPU initialization failed; using CPU", e)
      engineBackend = "CPU"
      val loaded = Engine(EngineConfig(modelPath = gemmaFile.absolutePath, backend = Backend.CPU(), visionBackend = Backend.CPU(), cacheDir = cacheDir))
      loaded.initialize()
      engine = loaded
      return loaded
    }
  }

  /** GPU backend startup can terminate the process with SIGILL on emulators or without OpenCL. */
  private fun shouldUseCpuBackend(): Boolean {
    val fingerprint = Build.FINGERPRINT.lowercase()
    val hardware = Build.HARDWARE.lowercase()
    val emulator = fingerprint.contains("generic") || fingerprint.contains("sdk_gphone") ||
      fingerprint.contains("emulator") || hardware in setOf("goldfish", "ranchu", "vbox86", "android_x86")
    if (emulator) return true

    // Android has no public OpenCL capability flag. Only try GPU when a system/vendor OpenCL
    // runtime is present; otherwise LiteRT LM's GPU initialization may fault before Kotlin can catch it.
    val openClLibraries = listOf(
      "/vendor/lib64/libOpenCL.so", "/system/vendor/lib64/libOpenCL.so", "/system/lib64/libOpenCL.so",
      "/vendor/lib/libOpenCL.so", "/system/vendor/lib/libOpenCL.so", "/system/lib/libOpenCL.so"
    )
    return openClLibraries.none { File(it).isFile }
  }

  @Synchronized
  private fun ensureScannerReady(): Engine {
    val loaded = ensureEngine()
    if (!conversationPrepared) {
      loaded.createConversation().close()
      conversationPrepared = true
    }
    return loaded
  }

  private fun analyze(uri: String, expectedObject: String, expectedGesture: String): Map<String, Any> {
    check(models.all { isVerified(it) }) { "Download the on-device proof models first" }
    val started = SystemClock.elapsedRealtime()
    val photoFile = when (Uri.parse(uri).scheme) {
      "file" -> File(requireNotNull(Uri.parse(uri).path))
      else -> File(uri)
    }
    require(photoFile.isFile) { "Captured photo is unavailable on this device" }
    val proofHash = MessageDigest.getInstance("SHA-256").digest(photoFile.readBytes()).joinToString("") { "%02x".format(it) }
    val hashedAt = SystemClock.elapsedRealtime()

    val bitmap = BitmapFactory.decodeFile(photoFile.absolutePath) ?: error("Could not decode captured photo")
    val mpImage = BitmapImageBuilder(bitmap).build()
    val recognizer = GestureRecognizer.createFromOptions(
      context,
      GestureRecognizer.GestureRecognizerOptions.builder()
        .setBaseOptions(BaseOptions.builder().setModelAssetPath(fileOf(gesture).absolutePath).setDelegate(Delegate.CPU).build())
        .setRunningMode(RunningMode.IMAGE)
        .setNumHands(2)
        .build()
    )
    val gestureName = try {
      recognizer.recognize(mpImage).gestures().flatten().maxByOrNull { it.score() }?.categoryName() ?: "None"
    } finally { recognizer.close(); bitmap.recycle() }
    val gestureAt = SystemClock.elapsedRealtime()

    val prompt = """Check this camera photo for a real $expectedObject. Is it shown on a screen or printout? Reply only as compact JSON: {"objectPresent":boolean,"objectConfidence":number,"looksLikeScreenOrPrintout":boolean,"reason":"at most 8 words"}. Confidence is 0 to 1. A screen or printout is not live."""
    val conversation = ensureScannerReady().createConversation()
    val engineAt = SystemClock.elapsedRealtime()
    val response = try {
      conversation.sendMessage(Contents.of(Content.ImageFile(photoFile.absolutePath), Content.Text(prompt)))
        .contents.contents.filterIsInstance<Content.Text>().joinToString("") { it.text }
    } finally { conversation.close() }
    val inferenceAt = SystemClock.elapsedRealtime()
    Log.i(LOG_TAG, "backend=$engineBackend hash=${hashedAt - started}ms gesture=${gestureAt - hashedAt}ms engine=${engineAt - gestureAt}ms inference=${inferenceAt - engineAt}ms answerChars=${response.length}")
    // The model's text and MediaPipe's label go back as they are. Reading the answer and comparing the gesture
    // happen in TypeScript (kept-gesture/src/verdict.ts), where they are tested and cannot crash this bridge.
    return mapOf(
      "proofHash" to proofHash,
      "gestureSeen" to gestureName,
      "modelText" to response.take(4000),
      "model" to "Gemma 4 E2B + MediaPipe Gesture Recognizer",
      "ms" to (SystemClock.elapsedRealtime() - started)
    )
  }
}
