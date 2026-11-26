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
- `class RepCounter(exercise, aspect = w/h)`: `push({ t, p }): RepEvent[]`, getters `count`, `angle` (smoothed primary, degrees | null:
  the elbow / knee angle in the side reading, 180 × the extension in the vertical one, so a gauge reads 180 at the top either way),
  `phase`, `side` ("left" | "right" | null; null in the vertical reading, which reads both sides), `reps`, and (new 2026-11-27)
  `view: "side" | "front" | "oblique" | null` (null before the first pose; see "Views" below) for a framing hint.
  `RepEvent = { type: "ready", t } | { type: "rep", n, startT, bottomT, endT } | { type: "half_rep", t } | { type: "lost", t } |
  { type: "setup", t } | { type: "fault", fault: string, t }`. `setup` (new 2026-11-26) fires on the first sample after a feed gap
  > 400 ms (a pause/freeze, app backgrounded) while counting: the rep in progress is dropped and counting resumes at the next top, so
  the UI can say "hold the top". `lost` keeps its meaning (occlusion: no usable pose for > 400 ms while counting).
- Rules of the side reading (`RULES`; from the design, revised 2026-11-26 after review): aspect-corrected 2D angles; pick the more visible side with hysteresis 0.15,
  switching only after the other side has been better by 0.15 (or usable while the current one is < 50) for `SIDE_SWITCH_SAMPLES` = 5
  samples in a row (a 1–2 frame visibility flicker abandons nothing; meanwhile an unusable current side reads as no pose); visibility < 50
  unusable; EMA α = 1 − exp(−dt/60); drop >45° jumps (`SPIKE_DEG`, ≤2 frames; was 60°, lowered with the 155° count line so a single flip
  can't end or start a rep); lost after 400 ms without usable frames (drops the rep in progress). Start pose: the first time it must be
  held 500 ms; after a loss or a feed gap it only needs `RESUME_HOLD_MS` = 100 ms (the brief top between two reps). Push-up: elbow
  (11-13-15 / 12-14-16) start < 130°, bottom < 100°, count > 150° (as in the code since 2026-11-26; this line said 90° / 155°), rep
  600 ms–8 s, faults not_plank (shoulder–ankle line > 35° from horizontal), hips (shoulder–hip–ankle < 150°). Squat: knee (23-25-27 /
  24-26-28) start < 140°, bottom < 100°, count > 155°, rep 450 ms–10 s (start line to count line; the drop/anchor/depth gates do the
  anti-cheat), faults lean (hip–shoulder line < 30° from horizontal), depth. The start pose's straight-limb condition is the count line.
  New 2026-11-27: a sample whose read wrist / ankle moved more than `ANCHOR_JUMP` = 0.5 limb lengths since the last believed sample is
  a left/right label swap (the far side's landmark under this side's name; up close it moves the anchor ~0.8) and is dropped like an
  angle flip (at most `SPIKE_FRAMES` in a row). None of the 2D fixtures or golden vectors trigger it (their digests are unchanged).
- Anti-cheat gates (updated 2026-11-26; they rely on the frame being gravity-aligned, image y = down). Lengths are in units of the
  reference limb (push-up: upper arm shoulder–elbow; squat: thigh hip–knee), taken as the longest seen during the rep.
  - Push-up: at the top (the start pose, and the last sample of every rep) the wrist must be > 1.0 upper arms below the shoulder in image y
    (`PUSHUP_REACH_MIN`; a straight arm under the shoulder reads 1.6–2) and at most 1.3 upper arms in front of or behind it
    (`PUSHUP_OFFSET_MAX`), else `hands_not_planted` (lying on the back pressing up, or on the belly propped on the arms, never gets
    ready); the top must also be in plank form (not_plank / hips on that sample reject the rep); the wrist must stay in a box with a
    diagonal ≤ 0.8 upper arms for the whole rep, else `hands_not_planted` (1.0 / 1.3 / 0.8 are the code's values since 2026-11-26); the shoulder must drop ≥ 0.5 upper arms between the rep's
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
- Views: the vertical reading (new 2026-11-27, `VERTICAL_RULES`; same trace, same events, no new fault codes). Push-ups and squats count
  from any horizontal angle: side, head-on, from behind, 45°, anything between, and a person turning slowly during the set.
  - Why it works: the frame is gravity-aligned (|tilt| ≤ 20°, see the native view), so vertical image distances barely depend on where
    the camera stands around the person, while 2D joint angles and horizontal distances do. In a push-up the shoulders sit right above
    the wrists, in a squat the hips right above the ankles, each pair at the same distance from the camera, so their vertical gap is
    view-independent (perspective scales it with the distance, which a set doesn't change). A straight limb projects straight from any
    angle, and a vertical one has its gap equal to its 2D length: that is how the counter knows the person is at the top.
  - Levels: each joint's height / position is the midpoint of its left and right landmarks (visibility ≥ `VIS_MIN`); with one side
    hidden the midpoint is rebuilt from the seen side and the last left–right offset seen with both (choosing the label reading, as
    tagged or swapped, nearer the last midpoint). Primary = 180 × extension, extension = gap / calibrated top (clamped to 0–180), gap =
    wrist − shoulder level (push-up) / ankle − hip level (squat), image y in thousandths.
  - Calibration (the scale is the person's own top): a candidate is the median of `CAL_SAMPLES` = 3 samples in a row with the
    straightest visible arm / leg straight in 2D (> 145° / 155°) and vertical (gap ≥ 0.82 / 0.85 × its 2D length). Before counting
    (setup) the top just follows the candidates (walking to the mat changes the distance); once counting, a higher candidate replaces it
    and a lower one ≥ `CAL_FOLLOW_MIN` = 0.85 of it pulls it down by `CAL_FOLLOW` = 5% per sample (a slow turn changes the distance a
    little), so half reps (never straight) can't shrink it. A loss or a feed gap forgets it (the person may come back elsewhere); until
    a candidate exists the scale is a decaying maximum of the gap (`VIEW_SCALE_TAU_MS` = 10 s).
  - Push-up (vertical): rep = extension below 0.8 (start, 144) → below 0.55 (bottom, 99; a full push-up reaches ~0.2–0.35, elbows at 90°
    ~0.5, a half rep at ~120° stays ~0.65 → `half_rep`) → above 0.9 (count line, 162), 600 ms–8 s. Start pose: extended (> 0.9) with the
    arms vertical (gap ≥ 0.82 × the straightest arm's 2D length), in plank form, held 500 ms (100 ms resuming). Top check (start pose and
    every rep's last sample): ankles seen (else not_plank), wrists ≤ `V_PUSHUP_OFFSET_MAX` = 0.45 arm lengths in front of / behind the
    shoulders horizontally (else hands_not_planted), then the form check. Form (per sample, FAULT_SHARE as before): not_plank when the
    torso is upright, i.e. the hip more than `V_PUSHUP_TORSO_MAX` = 0.65 arm lengths below the shoulder with the ankle more than
    `V_PUSHUP_UPRIGHT_FEET` = 1.4 below it (standing / kneeling arm dips, incline presses against a table or chair, curls); else, in the
    upper half of the rep, hips when the hip's height above the floor line (wrist level → ankle level, 40% of the way) is under
    `V_PUSHUP_HIP_MIN` = 0.4 or over `V_PUSHUP_HIP_MAX` = 1.35 of the shoulder's height above the wrists (sag, cobra, belly prop / pike;
    a straight plank reads 0.5–0.85 from every angle); else not_plank when the hip is > 0.65 below the shoulder or the ankle >
    `V_PUSHUP_FEET_MAX` = 2.1 below it. Rep gates, in the side reading's order: top check; shoulder level drop ≥ 0.3 arm lengths
    (no_shoulder_drop); hip drop ≥ 0.3 × the shoulder's (hips: cobra); the wrist midpoint's box ≤ 0.3 arm lengths, kept separately for
    samples read from both wrists and from one (3-sample median within each; hands_not_planted); the wrists' left–right spread (both seen,
    ≥ `SPREAD_MIN` = 0.2 arm lengths apart, 3-sample median) changing ≤ 0.25 arm lengths (hands walking towards / away from the camera;
    hands_not_planted); some visible arm bent below `V_PUSHUP_BEND` = 145° in 2D (3-sample median of the most bent arm) at some point in
    the rep, else hands_not_planted (an inchworm: shoulders going down on straight arms because the hands walk away); form share.
  - Squat (vertical): rep = extension below 0.82 (148) → below 0.7 (126; parallel ≈ 0.5, hip ~10 cm above the knee ≈ 0.6, a quarter
    squat ≈ 0.8 → never) → above 0.9 (162), 450 ms–10 s; a counted squat whose deepest extension stayed above `V_SQUAT_SHALLOW` = 0.6
    gets the one-off `depth` hint. Start pose: extended with the legs vertical (≥ 0.85), the shoulder ≥ `V_SQUAT_TORSO_START` = 0.4 leg
    lengths above the hip. Form: lean when the shoulder is < `V_SQUAT_TORSO_MIN` = 0.15 above the hip (torso near horizontal). Gates:
    top form; hip level drop ≥ 0.15 leg lengths from the rep's highest point (no_hip_drop: lifting a foot raises the ankle level without
    the hips dropping, high knees); ankle midpoint box ≤ 0.25 and ankle spread change ≤ 0.25 leg lengths (feet_not_planted: jumping,
    jumping jacks); depth at the deepest sample (hip − knee level over half the standing gap, ≈ thighs) below `V_SQUAT_DEPTH_MIN` = −0.75
    rejects as `depth` (dropping onto the knees: the knees hit the floor, the hips don't go down between them); form share.
  - The view (`view`, also which reading counts): the hips' horizontal spread over the vertical scale, smoothed (`VIEW_SPREAD_TAU_MS` =
    500 ms; hips with visibility ≥ `VIEW_VIS_MIN` = 35 count for this, a guessed far hip still sits where the body puts it). Head-on it
    reads ~0.3–0.4 (push-ups) / ~0.3 (squats), side-on ~0–0.04. The first sample with both hips decides (below the middle of the band:
    side); without both hips the first decision is the side reading. Side → vertical when it stays above `sideOut` (push-up 0.06,
    squat 0.05, ≈ 10° off the side) for `VIEW_SWITCH_SAMPLES` = 8 samples; vertical → side only in setup (below `sideIn` 0.035 / 0.03),
    so a turn through a side view mid-set keeps the vertical reading (it works there too). "front" vs "oblique" is a label only (above /
    below `frontMin` 0.31 / 0.24 ≈ 55°, ±0.03 hysteresis). A switch while counting drops the rep in progress silently and waits for a
    fresh top, like a side switch. The side reading is kept for real side views because its rules were tuned on real side sets; the 2D
    side-view tests and golden vectors all read side (left and right landmarks coincide there) and behave exactly as before.
  - Measured on the 3D fixtures (packages/engine/src/reps3d.fixtures.ts: a 3D stick body through a pinhole camera at azimuth 0–180°,
    lens 0.05–0.6 m (push-ups) / 0.05–1 m (squats), 1.8–3.3 m away, aimed at the body, roll up to 15°, ±5/1000 landmark noise, 2% label
    flips, 2% single-joint jumps, visibility dips, the far side losing visibility as it turns away, push-up joints hidden behind the body
    near the bottom): honest push-ups (flared, tucked or wide elbows, to ~90° or full depth, 1–3 s) and squats (parallel, deep, 1.2–2 s)
    count fully at every position except exactly side-on (the side reading), where a set can lose one rep in ten; turning sets (up to
    180°, push-ups turning about the hands, squats on the spot) lose at most one; every cheat counts 0 at every position (standing and
    kneeling arm dips, curls, air presses, half reps, shoulder bobs, cobra, belly prop, sagging hips; quarter squats, good mornings,
    jumping jacks, bouncing, dropping to the knees, high knees), out of 810 reps per cheat (81 camera positions × 10), except: hips
    sagging 20 cm 3/810 (exactly side-on from a raised close camera: the side reading's body-line check), high knees with a 12 cm dip
    1/810, the inchworm 25/810 (limit 2), and with stronger noise (far side mostly hidden, 5% flips / jumps) a quarter squat 1/810.
  - Limits (honest): (1) The vertical assumption needs a level camera roughly at body height or below; a camera looking down from above
    (push-ups filmed from ≥ ~1 m, especially from behind the feet) makes depth leak into height: honest push-ups from behind can read
    not_plank, and the posture checks get weaker. Push-ups: phone on the floor or a low step; squats: up to ~1 m is fine. (2) An inchworm
    (hands walking forward on locked arms) filmed from behind the feet (150–180°) slips by up to 4 times in 10 (the arms are hidden
    behind the body, their 2D angle is noise, the hands move along the line of sight); 0 from every other angle. (3) Knees-on-the-floor
    push-ups are refused head-on (hips) but can pass obliquely, from the side and from behind. (4) A shallow push-up with elbows tucked
    tight to the body, seen exactly head-on, bends in the camera's line of sight and can fail the bend gate; with the far arm hidden,
    push-ups only to ~90° filmed from behind at an angle (~120°) lose some reps the same way. (5) The side reading keeps its own limits
    exactly side-on: elbows flared straight out (~80°) or push-ups only to ~90° from a raised close camera read shallow there. (6) If
    MediaPipe hides the far side completely from the first frame at an oblique angle, the counter has no evidence of the view and stays
    in the side reading. (7) Push-ups turning about the body's middle (the hands walk round) trip hands_not_planted. (8) Squats a little
    above parallel are borderline: from close behind and low they can read just short of the bottom. (9) Thresholds are tuned on the
    synthetic body; real traces (backend/scripts/fetch_rep_traces.ts → docs/notes/real-sets/) should be replayed as soon as there are some.
- `RepFault` = not_plank | hips | lean | depth | too_fast | too_slow | no_lockout | hands_not_planted | no_shoulder_drop | no_hip_drop |
  feet_not_planted (the last four are new; UI copy should map them, or fall back to the generic form hint). No new codes on 2026-11-26:
  cobra reuses `hips`, the belly-prop cheat reuses `hands_not_planted`. None on 2026-11-27 either: the vertical reading emits the same
  codes with the meanings above (the inchworm / hands-walking gates reuse `hands_not_planted`, kneeling squats reuse `depth`).
- Exported tuning constants (2026-11-26): VIS_MIN 50, SIDE_MARGIN 15, SIDE_SWITCH_SAMPLES 5, LOST_MS 400, RESUME_HOLD_MS 100,
  EMA_TAU_MS 60, SPIKE_DEG 45, SPIKE_FRAMES 2, FAULT_SHARE 0.25, PUSHUP_REACH_MIN 1.0, PUSHUP_OFFSET_MAX 1.3, PUSHUP_HIP_DROP_MIN 0.3,
  SQUAT_DEPTH_HINT −0.15, SQUAT_DEPTH_MIN −0.5, MAX_PAUSES 16; per-exercise thresholds in `RULES` (RepRules gained `hipDropMin`;
  RepFeatures gained `offset` and `hipY`). Added 2026-11-27 (all additive): ANCHOR_JUMP 0.5; VIEW_SWITCH_SAMPLES 8, VIEW_SCALE_TAU_MS
  10000, VIEW_SPREAD_TAU_MS 500, VIEW_VIS_MIN 35, CAL_SAMPLES 3, CAL_FOLLOW 0.05, CAL_FOLLOW_MIN 0.85, SPREAD_MIN 0.2, V_PUSHUP_TORSO_MAX
  0.65, V_PUSHUP_FEET_MAX 2.1, V_PUSHUP_UPRIGHT_FEET 1.4, V_PUSHUP_HIP_MIN 0.4, V_PUSHUP_HIP_MAX 1.35, V_PUSHUP_BEND 145,
  V_PUSHUP_OFFSET_MAX 0.45, V_SQUAT_TORSO_MIN 0.15, V_SQUAT_TORSO_START 0.4, V_SQUAT_DEPTH_MIN −0.75, V_SQUAT_SHALLOW 0.6;
  `VERTICAL_RULES` (type `VerticalRules` = `RepGates` + sideIn / sideOut / frontMin / straight / upright); `type RepView`. `RepRules` is
  now `RepGates & { needed, features }`, and `RepGates` gained `spreadMax`, `bendMax`, `depthMin`, `shallow(minPrimary, minDepth)` (the
  side rules set them so they behave as before: 0, 181, SQUAT_DEPTH_MIN / null, the old depth-hint test). `RepFeatures` gained the
  vertical reading's `spread`, `bend`, `straight`, `upright`, `torso`, `feet`, `hipRel` (neutral values in the side reading).
- Engine tag: still `REPS_ENGINE = "reps@1"` (the trace format is unchanged). The counting behaviour changed under the same tag, so a
  trace recorded by an app build older than 2026-11-26 may recount differently on a newer server; fine before release, bump the tag if
  that ever matters after it. 2026-11-27: side-view traces recount exactly as before (the seven older golden vectors' digests are
  unchanged); a trace filmed from another angle now counts in the vertical reading where an older engine counted (almost) nothing, so the
  phone and the server must run the same engine build (as always: the two copies are byte-identical).
- `type Trace = { v: 1, engine: "reps@1", exercise, aspect, t: number[], p: number[] /* 36 per sample, empty pose = 36 zeros */, pauses: [number, number][] }`;
  pauses are inclusive windows, at most `MAX_PAUSES` = 16, sorted and non-overlapping (each starts after the previous one ends,
  so [a, b], [b, c] is invalid); `parseTrace` rejects anything else.
  `countReps(trace): { count, reps: { startT, bottomT, endT }[] }` replays RepCounter over the samples (skipping pause windows with one
  forward pointer) — deterministic, so the phone's live count equals the server's recount.
- `traceDigest(trace): { count, reps, faults, samples, angleHash }` — countReps plus every fault event and an FNV-1a 32 hash of the
  little-endian IEEE-754 bytes of the smoothed angle after each pushed sample (0xff×8 for null). Golden vectors:
  `packages/engine/test-vectors/reps-vectors.json` (pushups, squats, cheat-supine-press, paused-session, cheat-belly-prop, cheat-cobra,
  freeze-resume; added 2026-11-27 from the 3D fixtures: front-pushups (6, head-on from the floor), oblique-squats (5, at 45° from 0.9 m),
  cheat-front-arm-dips (0, not_plank), cheat-oblique-good-morning (0)), checked by the engine tests and
  by backend/test/reps.test.ts against the server copy; the app can replay the same file under Hermes and compare `expect`.
  Regenerate only on an intended behaviour change: `REPS_VECTORS_WRITE=1 pnpm --filter @kept/engine exec tsx --test src/reps.test.ts`.

## App voice during a set (frontend only, 2026-11-27; no change to the native view, engine or trace)
- RepSet (frontend/src/screens/proof/RepSet.tsx) counts aloud with bundled clips (features/keeper/countVoice.ts) and, between counts,
  plays the Keeper's hype lines: manifest `features/keeper/hypeLines.ts` (12 situations × clean / noFilter, 3–4 long variants,
  ≤ 60 chars, ~1.3–2.4 s; plus a SHORT tier, ids `<situation>-<lang>-s<n>`, 1–3 words, ≤ 20 chars, ~0.65–1.1 s files (≤ ~0.86 s
  spoken), 10 per language, only for streak / first / halfway / threeLeft / last / slow / halfRep / fault; clips
  `frontend/assets/voice/hype/<id>.mp3`, made by `backend/scripts/keeper_hype_voice.ts` (idempotent: generates only the missing
  ids), which also writes every bundled clip's length to `features/keeper/voiceDurations.gen.json`). Chooser `hypeChooser.ts` (pure,
  injectable rng; cooldowns: start/done always, back/resume/milestones ≥ 3 s, slow/half rep/fault ≥ 6 s, a plain rep every 3–4
  reps ≥ 5 s; never the same line twice in a row, none rather than a repeat); coach `hypeCoach.ts` (waits for the clip playing now,
  drops a line superseded by a newer moment, outside "counting" (the Freeze), and must end before the predicted next rep (median rep
  interval − 200 ms): a long line when one fits, else a short one, else nothing, known when the moment happens, so a half rep falls
  back to the plain jab; a count or set line cuts a hype line off). Every bundled clip ends in ≥ 0.19 s of silence (measured,
  −45 dB), so the coach counts a clip as over 150 ms before its file ends (HYPE_TAIL_MS): a line starts in the count's silent tail
  plus a 150 ms breath, and the next count may land in the line's tail. Measured with the real clip lengths
  (keeperHype.test.tsx): a steady 20-rep set at 2.0 s a rep with the Freeze gets 5–6 mid-set lines in either language (mostly
  short); at 3 s a rep the long lines fit; at ~1.5 s a rep only the shortest clean clips fit, at 1.2 s nothing does.
- Any other Keeper line (`keeperSay`: the spoken verdict, a transaction read aloud, an answer) calls `silenceHype()`: the hype line
  playing stops and a waiting one (the done line after the set) never plays.
- RepSet calls: `ready` → coach.ready() (first: start line; after a `lost`: back line), `rep` → after sayCount, coach.rep(n, endT −
  startT), `half_rep` (8 s jab) → coach.halfRep() else the plain "go lower", `fault` → coach.fault(), the freeze's end → coach.resume()
  (the "after the photo" line; the counter's `setup` right after it is ignored), any other `setup` (a camera stall) → coach.lost() (a
  back line at the next `ready`), finish → coach.done() (replaces the plain "done"). One coach per attempt (restart drops it); closing
  the screen mid-set stops a hype line (the done line plays on). Covered by src/__tests__/keeperHype.test.tsx and repSetHype.test.tsx.
- Settings: `keeperVoice` off silences everything; `hypeLanguage: "clean" | "noFilter"` (default clean; Profile › Settings row
  "The Keeper, no filter", dimmed and locked while the Keeper's voice is off).
