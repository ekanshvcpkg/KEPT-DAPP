# Live rep counter: contract between the pieces (2026-11-26)

Design notes: scratchpad rep-native-sketch / rep-algo (session); this file is the agreed interface.

## Native view (frontend/modules/kept-gesture, Kotlin, Expo module view `RepCounterView` inside KeptGestureModule)
- CameraX 1.6.0 Preview (PreviewView, ImplementationMode.COMPATIBLE, 4:3, uncapped size, display rotation: the UI stays portrait)
  + ImageAnalysis (KEEP_ONLY_LATEST, RGBA_8888, ~640x480 4:3), MediaPipe PoseLandmarker LIVE_STREAM, CPU, numPoses 1, model bundled
  at android/src/main/assets/pose_landmarker_lite.task.
- Gravity (updated 2026-11-26): a SensorManager listener (active with the camera; TYPE_GRAVITY, else a low-passed accelerometer)
  computes the phone's exact roll = atan2(-gx, gy) (0 portrait, 90 left edge up), read whenever gravity's in-screen-plane part is
  ≥ 0.17 g (≈ 10° from flat, so a phone propped at a shallow angle still switches; flatter keeps the last roll and bucket). The
  0/90/180/270 bucket follows the roll with 10° hysteresis (switches once the roll is > 55° from the current bucket) and sets the
  analysis use case's targetRotation, so the analysis frame (rotated by imageInfo.rotationDegrees) has image-down ≈ gravity-down, also
  with the phone standing landscape on the floor for push-ups. w/h swap when the bucket changes portrait <-> landscape. The residual
  roll is reported per sample as `tilt`.
- Props: `active: boolean` (bind camera when true), `facing: "front" | "back"` (default "front"), `sampleIntervalMs: number` (default 50).
- Activation: from `active` turning true until it turns false (or the view is destroyed). A detach/re-attach while `active` stays true
  keeps the activation (`t` goes on, no second onReady); turning `active` off and on again starts a new one (`t` from 0, onReady again).
- Events:
  - `onReady {}` when the camera and the landmarker are running (first pose result of the activation; once per activation, and once
    more each time the camera recovers after an `onError { code: "camera" }`).
  - `onPose { t: number, w: number, h: number, rot: number, tilt: number, p: number[] }` at most every sampleIntervalMs. `t` = ms since the activation
    began (integer, strictly increasing), taken from the camera frame timestamps (re-anchored to the activation clock at each camera
    bind). `w`,`h` = gravity-upright analysis frame size in px. `rot` = the phone's physical rotation the frame was made for, degrees
    clockwise from portrait: 0, 90 (left edge up), 180, 270 (informational; not part of the Trace). `tilt` = integer degrees in
    [-180, 180): the exact roll when the frame was submitted minus `rot` (positive = turned further clockwise than the bucket), i.e.
    how far image-down is from gravity-down; 0 when the roll is unknown (no gravity sensor, or flat since the camera started). Not part
    of the Trace. The app must not count while |tilt| > 20 (RepSet: Start stays disabled until an onPose with |tilt| ≤ 20; mid-set the
    tilted samples go into the trace and the counter as empty poses (36 zeros = occlusion, so the server's recount sees the same),
    resuming below 16. Not a pause window: the server accepts exactly one pause, the freeze, and no sample gap > 2 s). `p` = 36 integers: for each joint
    in JOINTS order [11,12,13,14,15,16,23,24,25,26,27,28] (shoulders, elbows, wrists, hips, knees, ankles, left then right),
    `round(x*1000), round(y*1000), round(visibility*100)` with x,y the normalized image landmarks (0..1, may exceed slightly).
    No pose detected → `p` is an empty array.
  - `onError { code: string, message: string }` (codes: permission, camera, model, internal), each code at most once per activation
    (exceptions: "camera" can come again after the camera recovered; a failed model load is retried once per activation and so
    reported again in each new activation).
    Camera watchdog: after binding, isBound is verified; while active and in the foreground, if no frame arrives within 3 s of a bind
    (the clock starts only once the landmarker is loaded: the model loads on the analysis thread) or 1.5 s after the last frame, or the
    opened camera goes CLOSED / critical error (e.g. expo-camera's CameraView calling unbindAll() on mount/unmount), the view rebinds:
    up to 3 rebinds within 10 s, backing off 0 / 0.5 / 1 s; the budget resets when frames flow or the camera reaches OPEN. When the
    budget is spent, or after 10 s of failure without a frame, `onError { code: "camera" }`; the watchdog then keeps checking every 2 s
    and rebinds (unbound / closed / silent for 3 s), and when frames flow again it clears the error and sends onReady again. A failed
    bind (no activity, exception) also reports "camera" and retries every 2 s; missing permission reports "permission" and re-checks
    every 2 s. If the bound activity is DESTROYED (recreated), the view unbinds and binds to the current activity.
  - Never mount an expo-camera `CameraView` while a `RepCounterView` is active (same screen or one underneath): CameraView calls
    ProcessCameraProvider.unbindAll() on mount/unmount, which drops this view's use cases; the watchdog only recovers from that after the
    fact (a gap in the samples, possibly `lost` events or a "camera" error).
- View function (via ref): `capture(): Promise<{ jpeg: string, sha256: string, t: number }>` — the latest upright analysis frame as a
  JPEG (longest side ≤ 640 px, quality 80), base64 without data: prefix; sha256 hex of the JPEG bytes; t as in onPose.
- JS: `frontend/modules/kept-gesture/src/RepCounterView.tsx` exports `RepCounterView` (requireNativeViewManager("KeptGesture")) with typed
  props/events and a ref type `RepCounterHandle { capture(): Promise<...> }`; re-exported from the module index. Native availability is
  decided at import (Android + KeptGesture module with the view's config and a `capture` view prototype); otherwise a plain View
  fallback whose capture() rejects. capture() always returns a promise (rejects if the native view isn't mounted). jest.setup.js mock must
  export RepCounterView too.

## Rep engine (packages/engine/src/reps.ts, pure TS, no deps; identical copy backend/src/shared/reps.ts)
- `type Exercise = "pushup" | "squat"`; `JOINTS` constant (as above).
- `parseRepHabit(text): { exercise, target } | null` — accepts "20 push-ups", "20 pushups", "30 squats" (1..50, case-insensitive);
  `repHabitText(exercise, target)` → "20 push-ups" / "30 squats".
- `class RepCounter(exercise, aspect = w/h)`: `push({ t, p }): RepEvent[]`, getters `count`, `angle` (smoothed, degrees | null), `phase`.
  `RepEvent = { type: "ready", t } | { type: "rep", n, startT, bottomT, endT } | { type: "half_rep", t } | { type: "lost", t } |
  { type: "setup", t } | { type: "fault", fault: string, t }`. `setup` (new 2026-11-26) fires on the first sample after a feed gap
  > 400 ms (a pause/freeze, app backgrounded) while counting: the rep in progress is dropped and counting resumes at the next top, so
  the UI can say "hold the top". `lost` keeps its meaning (occlusion: no usable pose for > 400 ms while counting).
- Rules (from the design, revised 2026-11-26 after review): aspect-corrected 2D angles; pick the more visible side with hysteresis 0.15,
  switching only after the other side has been better by 0.15 (or usable while the current one is < 50) for `SIDE_SWITCH_SAMPLES` = 5
  samples in a row (a 1–2 frame visibility flicker abandons nothing; meanwhile an unusable current side reads as no pose); visibility < 50
  unusable; EMA α = 1 − exp(−dt/60); drop >45° jumps (`SPIKE_DEG`, ≤2 frames; was 60°, lowered with the 155° count line so a single flip
  can't end or start a rep); lost after 400 ms without usable frames (drops the rep in progress). Start pose: the first time it must be
  held 500 ms; after a loss or a feed gap it only needs `RESUME_HOLD_MS` = 100 ms (the brief top between two reps). Push-up: elbow
  (11-13-15 / 12-14-16) start < 130°, bottom < 90°, count > 155°, rep 600 ms–8 s, faults not_plank (shoulder–ankle line > 35° from
  horizontal), hips (shoulder–hip–ankle < 150°). Squat: knee (23-25-27 / 24-26-28) start < 140°, bottom < 100°, count > 155°, rep
  450 ms–10 s (start line to count line; the drop/anchor/depth gates do the anti-cheat), faults lean (hip–shoulder line < 30° from
  horizontal), depth. The start pose's straight-limb condition is the count line (> 155°).
- Anti-cheat gates (updated 2026-11-26; they rely on the frame being gravity-aligned, image y = down). Lengths are in units of the
  reference limb (push-up: upper arm shoulder–elbow; squat: thigh hip–knee), taken as the longest seen during the rep.
  - Push-up: at the top (the start pose, and the last sample of every rep) the wrist must be > 1.2 upper arms below the shoulder in image y
    (`PUSHUP_REACH_MIN`; a straight arm under the shoulder reads 1.6–2) and at most 0.8 upper arms in front of or behind it
    (`PUSHUP_OFFSET_MAX`), else `hands_not_planted` (lying on the back pressing up, or on the belly propped on the arms, never gets
    ready); the top must also be in plank form (not_plank / hips on that sample reject the rep); the wrist must stay in a box with a
    diagonal ≤ 0.5 upper arms for the whole rep, else `hands_not_planted`; the shoulder must drop ≥ 0.5 upper arms between the rep's
    highest point and its bottom (deepest elbow angle), else `no_shoulder_drop` (forward-lean dips); the hip must drop ≥ 0.3 × the
    shoulder's drop over the same span (`PUSHUP_HIP_DROP_MIN`), else `hips` (cobra / hips left on the floor).
  - Squat: the hip must drop ≥ 0.4 thighs between the rep's highest point and its bottom, else `no_hip_drop` (hamstring curls, high
    knees); the ankle must stay in a box with a diagonal ≤ 0.5 thighs, else `feet_not_planted`; hip more than 0.5 thighs above the knee
    at the bottom (`SQUAT_DEPTH_MIN`) rejects the rep as `depth`; between 0.5 and 0.15 above (`SQUAT_DEPTH_HINT`) it counts with a one-off
    `depth` hint.
  - Squat top: the last sample must also be in form (lean rejects).
  - A finished rep is checked in this order: half_rep, too_fast, top (hands_not_planted, then the form fault on the last sample), drop,
    push-up hip drop (hips), anchor, squat depth, form-fault share (all form faults together on > 25% of samples; the most frequent one
    is reported). The rejecting code is emitted as a `fault` event.
  - Setup hints: a form fault is hinted whenever it starts; the top check (hands_not_planted) only on samples with the limb straight
    (> the count line), so coming back mid-rep after a pause doesn't flash it.
  - Side switch: if the chosen side changes while a rep is in progress (or in `up`), the rep is abandoned silently (phase back to `up`)
    and no rep starts until the new side's angle has been above the count line (a fresh top).
- `RepFault` = not_plank | hips | lean | depth | too_fast | too_slow | no_lockout | hands_not_planted | no_shoulder_drop | no_hip_drop |
  feet_not_planted (the last four are new; UI copy should map them, or fall back to the generic form hint). No new codes on 2026-11-26:
  cobra reuses `hips`, the belly-prop cheat reuses `hands_not_planted`.
- Exported tuning constants (2026-11-26): VIS_MIN 50, SIDE_MARGIN 15, SIDE_SWITCH_SAMPLES 5, LOST_MS 400, RESUME_HOLD_MS 100,
  EMA_TAU_MS 60, SPIKE_DEG 45, SPIKE_FRAMES 2, FAULT_SHARE 0.25, PUSHUP_REACH_MIN 1.2, PUSHUP_OFFSET_MAX 0.8, PUSHUP_HIP_DROP_MIN 0.3,
  SQUAT_DEPTH_HINT −0.15, SQUAT_DEPTH_MIN −0.5, MAX_PAUSES 16; per-exercise thresholds in `RULES` (RepRules gained `hipDropMin`;
  RepFeatures gained `offset` and `hipY`).
- Engine tag: still `REPS_ENGINE = "reps@1"` (the trace format is unchanged). The counting behaviour changed under the same tag, so a
  trace recorded by an app build older than 2026-11-26 may recount differently on a newer server; fine before release, bump the tag if
  that ever matters after it.
- `type Trace = { v: 1, engine: "reps@1", exercise, aspect, t: number[], p: number[] /* 36 per sample, empty pose = 36 zeros */, pauses: [number, number][] }`;
  pauses are inclusive windows, at most `MAX_PAUSES` = 16, sorted and non-overlapping (each starts after the previous one ends,
  so [a, b], [b, c] is invalid); `parseTrace` rejects anything else.
  `countReps(trace): { count, reps: { startT, bottomT, endT }[] }` replays RepCounter over the samples (skipping pause windows with one
  forward pointer) — deterministic, so the phone's live count equals the server's recount.
- `traceDigest(trace): { count, reps, faults, samples, angleHash }` — countReps plus every fault event and an FNV-1a 32 hash of the
  little-endian IEEE-754 bytes of the smoothed angle after each pushed sample (0xff×8 for null). Golden vectors:
  `packages/engine/test-vectors/reps-vectors.json` (pushups, squats, cheat-supine-press, paused-session, cheat-belly-prop, cheat-cobra,
  freeze-resume), checked by the engine tests and
  by backend/test/reps.test.ts against the server copy; the app can replay the same file under Hermes and compare `expect`.
  Regenerate only on an intended behaviour change: `REPS_VECTORS_WRITE=1 pnpm --filter @kept/engine exec tsx --test src/reps.test.ts`.
