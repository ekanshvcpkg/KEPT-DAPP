# Live rep counter: contract between the pieces (2026-11-26)

Design notes: scratchpad rep-native-sketch / rep-algo (session); this file is the agreed interface.

## Native view (frontend/modules/kept-gesture, Kotlin, Expo module view `RepCounterView` inside KeptGestureModule)
- CameraX 1.6.0 Preview (PreviewView, ImplementationMode.COMPATIBLE) + ImageAnalysis (KEEP_ONLY_LATEST, RGBA_8888, ~640x480 4:3),
  MediaPipe PoseLandmarker LIVE_STREAM, CPU, numPoses 1, model bundled at android/src/main/assets/pose_landmarker_lite.task.
- Props: `active: boolean` (bind camera when true), `facing: "front" | "back"` (default "front"), `sampleIntervalMs: number` (default 50).
- Events:
  - `onReady {}` when the camera and the landmarker are running.
  - `onPose { t: number, w: number, h: number, p: number[] }` at most every sampleIntervalMs. `t` = ms since the view became active
    (integer). `w`,`h` = upright analysis frame size in px. `p` = 36 integers: for each joint in JOINTS order
    [11,12,13,14,15,16,23,24,25,26,27,28] (shoulders, elbows, wrists, hips, knees, ankles, left then right),
    `round(x*1000), round(y*1000), round(visibility*100)` with x,y the normalized image landmarks (0..1, may exceed slightly).
    No pose detected → `p` is an empty array.
  - `onError { code: string, message: string }` (codes: permission, camera, model, internal).
- View function (via ref): `capture(): Promise<{ jpeg: string, sha256: string, t: number }>` — the latest upright analysis frame as a
  JPEG (longest side ≤ 640 px, quality 80), base64 without data: prefix; sha256 hex of the JPEG bytes; t as in onPose.
- JS: `frontend/modules/kept-gesture/src/RepCounterView.tsx` exports `RepCounterView` (requireNativeViewManager("KeptGesture")) with typed
  props/events and a ref type `RepCounterHandle { capture(): Promise<...> }`; re-exported from the module index. jest.setup.js mock must
  export RepCounterView too.

## Rep engine (packages/engine/src/reps.ts, pure TS, no deps; identical copy backend/src/shared/reps.ts)
- `type Exercise = "pushup" | "squat"`; `JOINTS` constant (as above).
- `parseRepHabit(text): { exercise, target } | null` — accepts "20 push-ups", "20 pushups", "30 squats" (1..50, case-insensitive);
  `repHabitText(exercise, target)` → "20 push-ups" / "30 squats".
- `class RepCounter(exercise, aspect = w/h)`: `push({ t, p }): RepEvent[]`, getters `count`, `angle` (smoothed, degrees | null), `phase`.
  `RepEvent = { type: "ready", t } | { type: "rep", n, startT, bottomT, endT } | { type: "half_rep", t } | { type: "lost", t } |
  { type: "fault", fault: string, t }`.
- Rules (from the design): aspect-corrected 2D angles; pick the more visible side with hysteresis 0.15; visibility < 50 unusable; EMA
  α = 1 − exp(−dt/60); drop >60° jumps (≤2 frames); lost after 400 ms without usable frames (drops the rep in progress; needs the start
  pose for 500 ms again). Push-up: elbow (11-13-15 / 12-14-16) start < 130°, bottom < 90°, count > 160°, rep 600 ms–8 s, faults
  not_plank (shoulder–ankle line > 35° from horizontal), hips (shoulder–hip–ankle < 150°). Squat: knee (23-25-27 / 24-26-28) start < 140°,
  bottom < 100°, count > 160°, rep 800 ms–10 s, faults lean (hip–shoulder line < 30° from horizontal), depth. Start pose held 500 ms.
- `type Trace = { v: 1, engine: "reps@1", exercise, aspect, t: number[], p: number[] /* 36 per sample, empty pose = 36 zeros */, pauses: [number, number][] }`;
  `countReps(trace): { count, reps: { startT, bottomT, endT }[] }` replays RepCounter over the samples (skipping pause windows) —
  deterministic, so the phone's live count equals the server's recount.
