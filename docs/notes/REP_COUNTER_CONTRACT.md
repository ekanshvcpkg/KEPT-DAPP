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
    resuming below 16. Not a pause window: the server accepts exactly one pause, the freeze, and no sample gap > 2 s). Within ±20°
    RepSet turns every sample upright by its tilt before the counter and the trace (2026-11-27, "App side: every activity" below). `p` = 36 integers: for each joint
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
- `type Exercise = "pushup" | "squat" | "jumpingjack" | "lunge" | "situp" | "highknee" | "burpee" | "press" | "plank"` (2026-11-27;
  `EXERCISES` lists them in that order, `BaseExercise` = pushup | squat, `MoveExercise` = the other seven); `JOINTS` constant (as above).
- `parseRepHabit(text): { exercise, target } | null` reads the habit texts the catalog stores, case-insensitive, extra spaces ignored,
  hyphen / space variants accepted: "N push-ups" (pushups, push ups), "N squats", "N jumping jacks" (jumping-jacks, jumpingjacks),
  "N lunges", "N sit-ups" (situps, sit ups), "N high knees" (high-knees, highknees), "N burpees", "N overhead presses"
  (overhead-presses, also "overhead press"), "N-second plank" (N second plank, N-sec plank, Ns plank). Targets: reps 1..50, plank
  10..180 seconds (`repTargetMin(ex)`, `REP_TARGET_LIMIT(ex)`; `REP_TARGET_MAX` = 50, `PLANK_TARGET_MIN` / `PLANK_TARGET_MAX` = 10 / 180);
  anything else → null. `repHabitText(exercise, n)` writes exactly "N push-ups", "N squats", "N jumping jacks", "N lunges", "N sit-ups",
  "N high knees", "N burpees", "N overhead presses", "N-second plank". `exerciseUnit(ex)`: "reps", or "seconds" for the plank.
- `class RepCounter(exercise, aspect = w/h)`: `push({ t, p }): RepEvent[]`, getters `count`, `angle` (smoothed primary, degrees | null:
  the elbow / knee angle in the side reading, 180 × the extension in the vertical one, so a gauge reads 180 at the top either way;
  for the added activities 180 at their rest pose, lower towards the far end of the move; plank: 180 × how vertical the supporting arm
  is), `phase`, `side` ("left" | "right" | null; null in the vertical reading and for the added activities, which read both sides),
  `reps`, and (new 2026-11-27) `view: "side" | "front" | "oblique" | null` (null before the first pose / view decision; see "Views"
  below) for a framing hint (a label only for the added activities).
  `RepEvent = { type: "ready", t } | { type: "rep", n, startT, bottomT, endT } | { type: "half_rep", t } | { type: "lost", t } |
  { type: "setup", t } | { type: "fault", fault: string, t }` (plank: one `rep` per full second held, n = seconds; see "Added
  activities"). `setup` (new 2026-11-26) fires on the first sample after a feed gap
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
  - Push-up (vertical): rep = extension below 0.8 (start, 144) → below 0.55 (bottom, 99; 0.58 / 104 since the overnight review fixes; a full push-up reaches ~0.2–0.35, elbows at 90°
    ~0.5, a half rep at ~120° stays ~0.65 → `half_rep`) → above 0.9 (count line, 162), 600 ms–8 s. Start pose: extended (> 0.9) with the
    arms vertical (gap ≥ 0.82 × the straightest arm's 2D length), in plank form, held 500 ms (100 ms resuming). Top check (start pose and
    every rep's last sample): ankles seen (else not_plank), wrists ≤ `V_PUSHUP_OFFSET_MAX` = 0.45 arm lengths in front of / behind the
    shoulders horizontally (else hands_not_planted), then the form check. Form (per sample, FAULT_SHARE as before): not_plank when the
    torso is upright, i.e. the hip more than `V_PUSHUP_TORSO_MAX` = 0.65 arm lengths below the shoulder with the ankle more than
    `V_PUSHUP_UPRIGHT_FEET` = 1.4 below it (standing / kneeling arm dips, incline presses against a table or chair, curls); else, in the
    upper half of the rep, hips when the hip's height above the floor line (wrist level → ankle level, 40% of the way) is under
    `V_PUSHUP_HIP_MIN` = 0.4 or over `V_PUSHUP_HIP_MAX` = 1.35 (overnight: 0.33 / 0.95 on a perspective-corrected value, see "Review
    fixes") of the shoulder's height above the wrists (sag, cobra, belly prop / pike;
    a straight plank reads 0.5–0.85 from every angle); else hips when the 2D shoulder–hip–ankle angle through the midpoints is
    < 150° (the side reading's body-line rule; added 2026-11-27 after verification: the hip-height band alone let a 20 cm pike
    count from every angle, side-on included), judged only when shoulder→hip→ankle spans ≥ `V_PUSHUP_LINE_SPAN` = 2.2
    calibrated tops in 2D with each segment ≥ 0.4 (the body not end-on; a straight body stays straight in 2D under any
    perspective and roll), `bodyLine` = 180 otherwise; else not_plank when the hip is > 0.65 below the shoulder or the ankle >
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
    reads ~0.3–0.4 (push-ups) / ~0.3 (squats), side-on ~0–0.04. The first sample with both hips decides (overnight: the signed, median-of-3, 800 ms-smoothed measure after 5 such samples
    or 600 ms, see "Review fixes"; below the middle of the band:
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
  - Limits found by an independent probe (2026-11-27: a different 3D body, 1.55 / 1.95 m tall, level or aimed cameras, roll up to 19°,
    time-correlated jitter of 2–5 px, burst label swaps, torso occlusion, 15–20 Hz real-camera sampling): (10) Roll: the app counts
    with |tilt| ≤ 20° and the landmarks are not de-rotated; both readings' posture checks assume image-down = gravity-down, so
    side-on and oblique honest push-ups lose reps from ~12° (side-on at 14°: ~35–55% counted, at 19°: ~30%; the engine before
    2026-11-27 did the same). The fix belongs outside the engine: rotate `p` by −tilt about the frame centre in RepSet before the
    counter and the trace (the server then recounts the same numbers), or gate at ~10°. [Fixed 2026-11-27 in the app: RepSet
    does exactly that, see "App and server side: every live activity" › Roll fix.] (11) The view measure is |left − right hip|
    over the scale, so landmark jitter and perspective (hips off the frame's centre sit at different depths) give it a positive
    floor of ~0.03–0.06 side-on, around `sideOut`: with a few pixels of jitter most side-on push-up sets read in the vertical
    reading (squats less often). It counts there; the gaps in (12)–(14) then apply side-on too. [(11)–(14): see "Review fixes" below.] (12) Piked hips still pass head-on,
    from 30–60° and from behind (150–180°), where the body is too end-on for the 2D body line; the hip-height band is
    perspective-biased (the hips look lower from the head end, higher from the feet), so a slight 6–8 cm sag filmed head-on is
    refused as `hips` on most reps. (13) The wrists' spread gate (0.25 arm lengths) is noise-limited: far away (3+ m) with
    half-hidden wrists (about 135°) honest push-ups lose up to ~35%. (14) Squat depth in the vertical reading is the extension alone
    (< 0.7): hips ~0.55 thighs above the knee, which the side reading refuses as `depth`, count in about one rep in five.
- Review fixes for push-ups and squats (2026-11-27, overnight; supersede the matching lines above; limits (11)–(14) above are
  answered here, with what remains open):
  - View decision (11): the view measure is now the hips' *signed* left − right offset over the scale, through a 3-sample median (a
    whole-body label flip negates one sample) and an 800 ms EMA (`VIEW_SPREAD_TAU_MS`, was 500 on |offset|), then taken absolute:
    jitter averages out of a signed mean, so side-on it reads the true perspective offset (fixtures: 0.02–0.05 exactly side-on, the
    zero sits ~5° off 90° by perspective) instead of a jitter floor. The first decision waits for `VIEW_INIT_SAMPLES` = 5 such samples
    or `VIEW_INIT_MS` = 600 ms after the first usable sample (nothing is read meanwhile, so no side-reading hints flash on a head-on
    set); with the hips never both seen it is the side reading at once, as before (all 2D side fixtures and golden vectors). sideIn /
    sideOut / frontMin unchanged (a trial at sideOut 0.045 put exactly-side-on fixtures into the vertical reading: perspective, not
    jitter). Left/right level offsets (`level`): a reversed left/right order is now accepted after it lasts > `SPIKE_FRAMES` samples
    (a real turn) instead of being kept forever as a flip.
  - Push-up hip height (12): `hipRel` is corrected for perspective. The knee is the middle of the hip–ankle segment, and a segment's 3D
    midpoint splits its projection in the ratio of its end points' distances, so |hip − knee| / |knee − ankle| in the picture =
    Z_ankle / Z_hip (smoothed, `V_PUSHUP_DEPTH_TAU_MS` 1500, each half ≥ `V_PUSHUP_LEG_MIN` 0.12 tops, clamped 0.6–1.6); extending the
    straight body to the shoulders (`V_PUSHUP_BODY_RATIO` 1.58 = ankle–shoulder / ankle–hip) gives κ = Z_shoulder / Z_hip; the floor
    point under the hip (60% from the ankles to the wrists in 3D) is placed in the picture at u = 0.6κ / (0.4·zr + 0.6κ), and the
    hip's height over it, relative to the shoulder gap, is divided by κ. Result: a straight plank reads 0.6–0.65 from every angle
    and height (was 0.5 head-on, 0.75 from the feet), hips 8 cm high ~0.8, 20 cm high ~1.0, 8 cm low ~0.45–0.5, 25 cm low ~0.2 — on
    the engine's fixtures and on the independent probe's different body alike. The band is now `V_PUSHUP_HIP_MIN` 0.33 –
    `V_PUSHUP_HIP_MAX` 0.95 (was 0.4–1.35). New knee check (`V_PUSHUP_KNEE_DROP` 0.17 tops; side reading `PUSHUP_KNEE_DROP` 0.3 upper
    arms): the knee more than that below the middle of the hip and ankle heights is a bent leg, knees down: `not_plank` (straight legs
    read within ±0.05 from any angle in the vertical reading, 0 on every 2D fixture and golden vector; kneeling push-ups 0.17–0.42).
  - Spread gate (13): the wrists' / ankles' spread is only measured with both anchors well seen (`VIS_GOOD` 70; a half-hidden far wrist
    is a noisy guess), and may change by max(spreadMax limbs, `SPREAD_FLOOR` 15 thousandths).
  - Bend gate (nit): an arm that is not well seen reads `BEND_PENALTY` 20° straighter for the bend gate (a hidden arm reads bent by
    noise); new rep gate `V_PUSHUP_TRAVEL` 0.45: the wrists' horizontal offset from the shoulders may change by at most that many tops
    over a rep (rocking forward over locked arms moves it ~0.7, an honest push-up ~0.15; `hands_not_planted`). (Reading the bend only
    on well-seen arms was tried and dropped: from ~120° the near arm bends along the line of sight and 90° push-ups lost most reps.)
  - Squat depth (14): at the deepest sample, where the thigh's 2D length is ≥ `V_SQUAT_THIGH_SEEN` 0.9 of half the standing gap (seen
    across, not end-on), the hip more than `SQUAT_DEPTH_MIN` (−0.5) thighs above the knee rejects as `depth`, as in the side reading
    (`RepGates.repCheck`, aux = that thigh ratio). Wider use (0.7) refused honest "a little above parallel" squats from a high camera
    30° off the front, and a stricter `V_SQUAT_DEPTH_MIN` (−0.55 / −0.65 tried) changed nothing on the probe: open, see below.
  - Push-up bottom line (nit): extension 0.55 → 0.58 (`VERTICAL_RULES.pushup.bottom` 99 → 104).
  - Plumbing (additive): `RepFeatures.aux` (reading-specific, −1 when not available) and `RepGates.repCheck(agg: RepAgg)` (per-rep
    aux range / count, aux and depth at the deepest sample, the previous attempt's aux), `RepGates.spikeDeg` (a reading's own flip
    threshold, judged against the last raw value only), `RepFeatures.depth` carries the knee drop for push-ups.
  - Measured (independent probe, own body model 1.55 / 1.95 m, 13 azimuths 0–340°, lens 0.06–0.55 m, 1.9–3.6 m, aimed and level
    cameras, AR(0.65) jitter σ 3.5 px (×2.5 occluded), burst label swaps, drops, 24–60 fps resampled to ≥ 50 ms, roll 0; reps counted,
    before → after): honest push-ups full 13405 → 13505 / 13940, to ~90° tucked 8008 → 8793 / 9290, wide 8838 → 8930 / 9270, hands
    forward 4483 → 4545 / 4620, hips 8 cm high 4538 → 4574 / 4660, hips 6 cm low 4188 → 4547 / 4660, heavy occlusion 4531 → 4533 /
    4660; cheats pike 20 cm 2486 → 36 / 4660, pike 35 cm 1118 → 0, knee push-ups 794 → 0, inchworm 1 → 0, half reps 11 → 42 / 13940,
    straight-arm rocking 165 → 177 / 8610, the rest 0 → 0; squats parallel 12182 → 12153 / 12250, deep 4040 → 4032 / 4060, heavy
    occlusion 4005 → 3995 / 4060, hips 0.55 thighs above the knee (borderline) 536 → 482 / 4070, other cheats unchanged (quarter 8 →
    7 / 8260, kneeling 24 → 24 / 4010, high knees 1 → 1). With roll ±8° the same picture: to ~90° 7831 → 8769 / 9280, hips 6 cm low
    4171 → 4520 / 4630, pike 20 cm 2397 → 33, pike 35 cm 1094 → 0, knee push-ups 780 → 0, rocking 336 → 160 / 8600, half reps 16 → 45 /
    13890, inchworm 2 → 5 / 8620, squats unchanged within 0.3%. On the engine's own fixtures (81 positions × 10): hips 8 cm low 543 →
    810 / 810, pike 20 cm 415 → 0, knee push-ups 415 → 0.
  - Still open: (a) straight-arm rocking filmed from behind (135–180°) passes ~2% (the arms are hidden, their 2D angle is noise and the
    sliding is along the line of sight); (b) half push-ups filmed 15° off the side now stay in the side reading more often, where the
    foreshortened elbow reads deep: 42 / 13940; (c) squats with the hips ~0.55 thighs above the knee still pass ~12% (borderline by
    design: the extension bottom line 0.7 sits right there); (d) the perspective correction assumes straight legs and the body's
    ankle–hip / ankle–shoulder proportion (±10% between people moves κ by a few %); (e) roll is the app's job (RepSet now turns
    samples upright by `tilt`, see the app section below).
- Added activities (2026-11-27, overnight; `MOVE_RULES`, `RepCounter.readMove` / `readSitup` / `readPlank` / `stepPlank`): jumping
  jacks, overhead presses, lunges, high knees, burpees, sit-ups (reps) and the plank (seconds). Same trace, same events, same pause /
  freeze / loss semantics (a feed gap > 400 ms → `setup`, no pose > 400 ms → `lost`, resume on `RESUME_HOLD_MS` 100 ms of the rest
  pose, the first start on 500 ms), same timing gates (`too_fast`, `too_slow`, `half_rep`, `no_lockout` for a second dip), counted
  from any horizontal angle the same way as the vertical reading: every measure is a height difference over one of the person's own
  lengths, calibrated in the rest pose (median of 3 samples, followed in setup, slowly while counting like `vref`): T = hip → shoulder
  gap with the torso vertical in 2D (≥ `MOVE_TORSO_UPRIGHT` 0.85 of its 2D length; standing or sitting), G = ankles → hips standing tall
  (the straightest leg > `MOVE_LEG_STRAIGHT` 155° and vertical ≥ `MOVE_LEG_UPRIGHT` 0.85, torso ≥ `MOVE_TORSO_MIN` 0.45 G), S = ankles →
  shoulders standing tall. Where one side's joint is compared with another (a wrist over its shoulder, a knee over its hip), each side
  is read against its own side (the same distance from the camera; seen from the side the far side sits ~0.4 m further away and looks
  lower or higher by perspective). There is no side reading for these: `side` is null, `view` is a label from the same signed hip
  measure. Each one's `primary` is 180 at rest and falls towards the far end; a rep starts below `start`, must pass below `bottom`, and
  counts back above `top` (all in MOVE_RULES), then its gates:
  - jumpingjack (rest: standing tall, arms down): h = each wrist's height over its own shoulder in its own side's torso lengths, the
    lower of the two seen (VIEW_VIS_MIN) arms counts: primary = 180 × (1 − (h + 1) / 2). Start above `JJ_START` −0.5 (from hanging,
    −1.1), far end both wrists above `JJ_UP` 0.5 (over the head), counts back below `JJ_DOWN` −0.67; 250 ms–5 s (was 400 ms, see
    "Verification" below); spikeDeg 90 (the arms swing ~60°/sample; scaled by the time since the last usable sample, `SPIKE_STEP_MS`). Form: `lean` with the torso under `MOVE_LEAN` 0.6 T. Legs (a bonus where they show): with the hips' view
    measure ≥ `JJ_LEGS_VIEW` 0.2 of G (within ~50° of the front or back) and both ankles seen on ≥ `JJ_LEGS_SEEN` 70% of the rep, the
    ankles' spread must change by ≥ `JJ_LEGS_MIN` 0.25 G, else `legs`. One arm only / waving: the lower arm never goes up (half_rep at
    most); arms only to shoulder height: h ≈ 0, never the far end (half_rep).
  - press (rest: the rack, every seen wrist within `PRESS_RACK_BAND` ±0.45 T of shoulder height, torso upright; standing or sitting):
    h as for jacks; primary = 180 × (1 − h / `PRESS_SCALE` 1.1); start above `PRESS_START` 0.3, far end above `PRESS_UP` 0.8 (a
    locked-out arm reads ~1.05 from a level camera, ~0.93 from the floor aimed up; elbows at 90° ~0.7), counts back below `PRESS_RACK`
    0.21; 600 ms–8 s. Lockout: some visible arm straight in 2D (> `PRESS_LOCK_DEG` 150°) on a sample with h > `PRESS_LOCK_H` 0.7, else
    `no_lockout`. Half presses never reach the far end; one arm leaves the lower wrist at the rack.
  - lunge (rest: standing tall): primary = 180 × the ankle-midpoint-to-hip gap over G (like a squat's extension; a full lunge reads
    ~0.5, a quarter dip ~0.8): start < 0.82, far end < 0.68, counts > 0.9; 600 ms–10 s; the hip itself must drop ≥ 0.15 G
    (`no_hip_drop`); `lean` with the shoulder under `LUNGE_TORSO_MIN` 0.2 G above the hip (bending at the waist); at the deepest
    sample the knees must differ in height by ≥ `LUNGE_STAGGER` 0.12 G when both are seen (`stance`: a feet-together dip is a squat).
    Either leg forward counts; the feet may step (no anchor gate); standing is reached between reps (the count line).
  - highknee (rest: standing tall, both knees down): each knee's lift L = 1 + (its hip − knee height) / (G / 2): 0 hanging, 1 at hip
    height, read down to `KNEE_VIS_MIN` 20 (the far leg is a guess, but where the body puts it). The counter follows one leg (the better
    seen one while standing) and moves to the other once the followed one is down (L < 0.3) and the other is higher by `KNEE_SWITCH`
    0.15 on two samples in a row; primary = 180 × (1 − L): start L > 0.35, far end L > 0.62 (thigh ~68° up), counts L < 0.25; 120 ms–4 s
    (was 200 ms); spikeDeg 90 (time-scaled as for jacks). Each knee lift is one rep ("N high knees" = N knee lifts). `same_leg`: a lift
    of the same leg as the previous attempt (counted, rejected or half) — one leg only counts its first lift, then nothing; after a
    loss or a feed gap either leg may come next. Since the verification: the other leg seen lifted ≥ `KNEE_OTHER` 0.5 on two samples
    in a row since the last counted lift stands in for the previous attempt (a lift the counter missed, a label swap, doesn't also
    cost the next lift), and the counter also moves to the other leg while a weak lift of the followed one is starting (descending,
    the other ≥ KNEE_OTHER and higher by 2 × KNEE_SWITCH: side-on, the hidden far leg's landmarks are dragged along by the near one).
    `lean` with the torso under `KNEE_TORSO_MIN` 0.4 G. Marching lifts (~45°) never reach the far end.
  - burpee (rest: standing tall): primary = 180 × the shoulders' height over the ankle level / S (a plank reads ~0.35, a parallel squat
    ~0.6): start < 0.8, far end < 0.5, counts > 0.9; 1–12 s. The rep must pass a hands-down, legs-back sample (else `not_plank`): hips
    within `BURPEE_HIP_LOW` 0.45 G of the ankle level, wrists within `BURPEE_HAND_LOW` 0.25 S of it, knees not above the hips by more
    than `BURPEE_KNEE_UP` 0.1 G. The top (last sample) must be standing upright (torso ≥ 0.4 G, `lean`). The jump is optional.
  - situp (rest: lying on the back, knees bent or straight): the lying torso length is estimated from its 2D length and the shoulders'
    2D width over `SITUP_SHOULDER_RATIO` 0.73 (the torso shows across the view, the shoulders along it), calibrated on flat samples;
    lying flat, a raised camera sees the shoulders a little above or below the hips (they are at different distances along the floor),
    so that rest offset r0 is learnt too and mapped out linearly: rise = (raw − r0) / (1 − r0), raw = (hip − shoulder height) / torso.
    primary = 180 × (1 − rise): start > 0.2, far end > `SITUP_UP` 0.62, counts < 0.15; 700 ms–8 s. Rest / top: |rise| ≤ `SITUP_FLAT`
    0.25 (0.45 before r0 is known) with the hips ≤ `SITUP_HIP_FLOOR` 0.75 torso above the ankle level (`not_lying`, also per sample:
    standing up or bending over isn't a sit-up). `twist`: the shoulders' own-side rises differing by > `SITUP_TWIST` 0.4 at the top
    (rolling onto a side). Neck curls (~15°) never reach the far end.
  - plank (seconds): a valid plank is the push-up top on straight arms (wrists under the shoulders, the arm vertical ≥ 0.82 of its 2D
    length) or on the forearms (the arm not straight: elbows under the shoulders, upper arm vertical ≥ `PLANK_FOREARM_UPRIGHT` 0.75,
    the wrist not above the elbow by more than `PLANK_FOREARM_FLAT` 0.35 and not below by more than twice that, of the shoulder's
    height), the support within `PLANK_OFFSET_MAX` 0.5 shoulder heights of under the shoulders, ankles seen, and the push-up's body
    checks in units of a high plank's shoulder height (perspective-corrected hip band 0.33–0.95 `hips`, knee drop `not_plank`, the 2D
    body line where not end-on `hips`, not upright `not_plank`). Held 500 ms (100 ms after a break, a gap or a loss) → `ready`; then
    one `rep` per full second (startT / endT = the second's bounds, bottomT the middle; consecutive, non-overlapping; n = seconds held)
    whose bad samples stay within FAULT_SHARE (else a `fault` for that second, uncounted); a bad run of `PLANK_BREAK_MS` 300 ms stops
    the clock (its `fault` fired when it began) and the plank must be held again (`ready` again); no pose for 400 ms is `lost`; a
    feed gap (the freeze) is `setup` and the second in progress is dropped, so the freeze sits between seconds k and k + 1 as
    checkRepEvidence expects.
  - Measured on the engine's fixtures (reps3d.fixtures.ts, new bodies jackBody / pressBody / lungeBody / kneesBody / burpeeBody /
    situpBody / plankBody, `alternate()` for the legs; 12 azimuths 0–330° × lens 0.05 / 0.5 / 1.0 m (floor activities 0.05 / 0.3 / 0.6)
    × 2.2 / 2.8 / 3.5 m (floor 1.8 / 2.5 / 3.3), body sizes 0.9 / 1 / 1.1, ±5/1000 noise, 2% flips, jumps and visibility dips, far side
    at ~0.5 visibility side-on): jumping jacks 1080 / 1080, presses 1080 / 1080, lunges 1080 / 1080, high knees 1071–1072 / 1080 (700
    and 1000 ms a lift; no run short by more than 1), burpees 1079 / 1080, sit-ups 1080 / 1080, plank 1619 / 1620 s (high) and 1620 /
    1620 s (forearms); cheats (reps counted out of 1080 attempts): jacks to shoulder height 0, one-arm jacks 0, half presses 0, one-arm
    presses 0, quarter lunges 0, waist bends 0, marching knees 0, one-leg knees 107 (the first lift of each set), squat-burpees 0,
    bend-over burpees 0, neck curls 0, rolling sit-ups 0, planks with hips 25 cm low / 30 cm high / knees down / lying flat / standing
    0 s. With the far side mostly hidden (occlusion 0.65 → ~0.3 visibility, 8 px, 5% flips / jumps / dips): jacks 1070, presses 965,
    lunges 1070, high knees ~1010, burpees 1080, sit-ups 1080 / 1080, plank 1618–1619 / 1620 s; cheats then leak a little: one-arm jacks
    90, shoulder-height jacks 56, half presses 62, one-arm presses 30 / 1080, rolling sit-ups 8, quarter lunges 1.
  - Limits (honest): (A) all of it needs a roughly level, gravity-aligned camera (|roll| corrected by the app); a camera on the floor
    tilted up at a standing person close by compresses the upper body (presses read lower; thresholds leave room for it down to
    ~2.2 m). (B) Seen exactly from the side, "both arms" (jacks, presses) can only be checked as well as MediaPipe guesses the far arm:
    with the far side hidden, one-arm cheats can pass on the near arm (numbers above). (C) The jacks' legs check only works within ~50°
    of the front or back; from the side, arms-only jacks count. (D) High knees filmed from behind by a phone on the floor: the knee
    rising away from the camera reads low, a set can lose two in ten; a far leg MediaPipe can't see at all can't be counted (its
    lifts are missed and the alternation check then refuses the next lift of the seen leg). (E) A burpee that only crouches with the
    hands on the floor and never kicks the legs back passes (1018 / 1080): front-on, a crouch and a plank differ mostly in depth, and
    the knee-above-hip test that separates them from the side refused honest burpees from behind and above (tried at 0.02 G). (F)
    Sit-ups: a phone on the floor right behind the head (≤ 1.8 m) sees the shoulders big and close and may overestimate the torso;
    sit-ups to only ~40° can pass where the shoulder-width ratio of the person differs from 0.73 by a lot. (G) Lunges: a dip with the
    feet together is refused (`stance`) only when both knees are seen; up to ~1% slip on a noisy knee. (H) The plank's straight-arm vs
    forearm choice follows the 2D elbow angle; a forearm plank with the wrists hidden still counts (the flatness check needs them).
    (I) Thresholds are tuned on synthetic bodies; replay real traces (backend/scripts/fetch_rep_traces.ts) as soon as there are some.
  - Verification (2026-11-27, independent probe: own body model, three people 1.58 / 1.75 / 1.93 m with different leg / torso /
    shoulder-width proportions (shoulder width / torso 0.66 / 0.73 / 0.8, hip landmarks 0.104 H apart), own kinematics, pinhole
    camera with 62–74° long-side FOV, portrait / landscape, aimed or level, residual roll ±3°, 13 azimuths 0–330° incl. 20 / 75 / 110 /
    160 / 250, lens 0.08 / 0.5 / 0.9 / 1.25 m (floor moves 0.04 / 0.2 / 0.45 m), 2.4–3.6 m (floor 1.6–3.0 m), AR(0.6) jitter 3.5 px
    (×2.2 for hidden joints), the hidden far side pulled 25% towards the near side, whole-body label swaps of 1–3 samples (persistent
    mirroring from behind in half the runs), joint jumps, dropped poses, 15–24 fps with 3% stalls of 110–190 ms):
    - Found and fixed: (1) brisk jumping jacks (~0.65 s a jack) were refused as `too_fast` (start → count line ~400 ms = minRepMs):
      honest jacks 11209 / 12890 → 12620 / 12890 after minRepMs 400 → 250 and the time-scaled flip threshold (a dropped pose plus a
      stall made the next swing look like a flip, the rep then started late and read too fast); cheats unchanged (shoulder-height,
      one arm, legs only: 0). (2) High knees at a realistic 2–3 lifts a second: honest 450 ms / lift 4922 → 6159 / 7344, 330 ms
      2676 → 4943, 700 ms 6262 → 6699, far side hidden 3151 → 4613 (the leg switch starts a rep late, then `too_fast`; a missed lift
      or a crosstalk half rep of the followed leg also cost the next lift as `same_leg`); cheats: marching 1 → 6 / 7344, butt kicks
      0 → 2, one leg 423 → 642 / 7376 (~1.4 per 16-lift set instead of ~0.9: a label swap at a lift's peak now and then reads as the
      other leg). On the engine's own fixtures, high knees at 450 / 350 ms a lift: 985 → 1062 and 810 → 1029 / 1080 (test "brisk
      jumping jacks and high knees"); `alternate()` in reps3d.fixtures.ts flipped legs only on e leaving exactly 1, so sets whose half
      period isn't a multiple of 50 ms were one leg only (fixed; no golden-vector trace changes, they are stored).
    - Confirmed as reported: presses 12736 / 12970 honest, half / one-arm presses 0; lunges 13600 / 13770, waist bends 0; burpees
      5142 / 5166; sit-ups 6959 / 7000; planks (high, forearms, 5 cm sag, 7 cm pike) all seconds; plank cheats sag 20 cm 25 / 6900 s,
      knees down 0, forearm sag 0, standing / sitting / lying 0. Push-ups and squats: the earlier probe re-run on HEAD 29cbe87 and now
      reproduces the "Review fixes" table exactly.
    - Still open (measured here): (J) high knees filmed side-on with the far leg's landmarks dragged by the near leg (as modelled)
      still lose 25–30% at 450 ms a lift and ~50% at 330 ms (front / back views 90–96%); only real traces can say how strong that
      crosstalk is. (K) Plank piked 30 cm with straight legs, filmed from the head end (0–45°, 330°) with the lens ≤ 0.2 m: 351 /
      6900 s pass (hip height reads ~0.88 < 0.95; the body is end-on, so no 2D body line; the perspective correction lowers a pike
      because the hips move towards the feet). (L) The jacks' legs check works within ~15–20° of the front / back on this body
      (hip landmarks 0.18 m apart for 1.75 m: the view measure head-on is ~0.21, just over JJ_LEGS_VIEW 0.2), not ~50°: arms-only
      jacks 3696 / 4220 count overall. (M) Sit-up crunches to ~32° pass 193 / 3500 (from 45°, 160–200°, 330°; limit F). (N) Lunges
      with the feet together pass 81 / 4590 with a camera at 0.9–1.25 m (limit G), quarter dips 32 / 4550 (mostly from behind).
      (O) A floor-level phone (≤ 0.1 m) 2.4 m from a tall person compresses the torso below MOVE_TORSO_MIN × G, so the standing rest
      pose may never be seen (jacks there 92%, some sets 0); the app's placement (a chair, 2.5–3 m) avoids it.
- `RepFault` = not_plank | hips | lean | depth | too_fast | too_slow | no_lockout | hands_not_planted | no_shoulder_drop | no_hip_drop |
  feet_not_planted (the last four are new; UI copy should map them, or fall back to the generic form hint). No new codes on 2026-11-26:
  cobra reuses `hips`, the belly-prop cheat reuses `hands_not_planted`. None on 2026-11-27 either: the vertical reading emits the same
  codes with the meanings above (the inchworm / hands-walking gates reuse `hands_not_planted`, kneeling squats reuse `depth`).
  Added 2026-11-27 (overnight) with the new activities: `legs` (jumping jacks, the feet never spread where that shows), `stance` (a
  lunge without a staggered stance), `same_leg` (high knees, the same leg twice), `twist` (a sit-up rolled onto a side), `not_lying` (a
  sit-up's rest pose / hips off the floor). The new activities also use `lean`, `no_hip_drop` (lunge), `no_lockout` (press: no straight
  arm overhead), `not_plank` (burpee without the hands-down plank; plank), `hips` / `hands_not_planted` (plank). Push-ups also emit
  `not_plank` for knees down and `hands_not_planted` for rocking over locked arms (V_PUSHUP_TRAVEL). The app maps the codes it knows
  and falls back to the generic form hint for the rest (RepSet does exactly that today).
- Exported tuning constants (2026-11-26): VIS_MIN 50, SIDE_MARGIN 15, SIDE_SWITCH_SAMPLES 5, LOST_MS 400, RESUME_HOLD_MS 100,
  EMA_TAU_MS 60, SPIKE_DEG 45, SPIKE_FRAMES 2, FAULT_SHARE 0.25, PUSHUP_REACH_MIN 1.0, PUSHUP_OFFSET_MAX 1.3, PUSHUP_HIP_DROP_MIN 0.3,
  SQUAT_DEPTH_HINT −0.15, SQUAT_DEPTH_MIN −0.5, MAX_PAUSES 16; per-exercise thresholds in `RULES` (RepRules gained `hipDropMin`;
  RepFeatures gained `offset` and `hipY`). Added 2026-11-27 (all additive): ANCHOR_JUMP 0.5; VIEW_SWITCH_SAMPLES 8, VIEW_SCALE_TAU_MS
  10000, VIEW_SPREAD_TAU_MS 500, VIEW_VIS_MIN 35, CAL_SAMPLES 3, CAL_FOLLOW 0.05, CAL_FOLLOW_MIN 0.85, SPREAD_MIN 0.2, V_PUSHUP_TORSO_MAX
  0.65, V_PUSHUP_FEET_MAX 2.1, V_PUSHUP_UPRIGHT_FEET 1.4, V_PUSHUP_HIP_MIN 0.4, V_PUSHUP_HIP_MAX 1.35, V_PUSHUP_BEND 145,
  V_PUSHUP_OFFSET_MAX 0.45, V_PUSHUP_LINE_SPAN 2.2, V_SQUAT_TORSO_MIN 0.15, V_SQUAT_TORSO_START 0.4, V_SQUAT_DEPTH_MIN −0.75, V_SQUAT_SHALLOW 0.6;
  `VERTICAL_RULES` (type `VerticalRules` = `RepGates` + sideIn / sideOut / frontMin / straight / upright); `type RepView`. `RepRules` is
  now `RepGates & { needed, features }`, and `RepGates` gained `spreadMax`, `bendMax`, `depthMin`, `shallow(minPrimary, minDepth)` (the
  side rules set them so they behave as before: 0, 181, SQUAT_DEPTH_MIN / null, the old depth-hint test). `RepFeatures` gained the
  vertical reading's `spread`, `bend`, `straight`, `upright`, `torso`, `feet`, `hipRel` (neutral values in the side reading);
  in the vertical reading `bodyLine` is the midpoints' 2D shoulder–hip–ankle angle when not end-on, else 180. Changed / added
  2026-11-27 (overnight): VIEW_SPREAD_TAU_MS 500 → 800, V_PUSHUP_HIP_MIN 0.4 → 0.33, V_PUSHUP_HIP_MAX 1.35 → 0.95, push-up vertical
  bottom 99 → 104; new VIEW_INIT_SAMPLES 5, VIEW_INIT_MS 600, VIS_GOOD 70, SPREAD_FLOOR 15, BEND_PENALTY 20, PUSHUP_KNEE_DROP 0.3,
  V_PUSHUP_BODY_RATIO 1.58, V_PUSHUP_DEPTH_TAU_MS 1500, V_PUSHUP_LEG_MIN 0.12, V_PUSHUP_KNEE_DROP 0.17, V_PUSHUP_TRAVEL 0.45,
  V_SQUAT_THIGH_SEEN 0.9; the moves' MOVE_LEG_STRAIGHT 155, MOVE_LEG_UPRIGHT 0.85, MOVE_TORSO_UPRIGHT 0.85, MOVE_TORSO_MIN 0.45,
  MOVE_LEAN 0.6, JJ_UP 0.5, JJ_START −0.5, JJ_DOWN −0.67, JJ_LEGS_VIEW 0.2, JJ_LEGS_MIN 0.25, JJ_LEGS_SEEN 0.7, PRESS_SCALE 1.1,
  PRESS_START 0.3, PRESS_UP 0.8, PRESS_RACK 0.21, PRESS_RACK_BAND 0.45, PRESS_LOCK_DEG 150, PRESS_LOCK_H 0.7, LUNGE_STAGGER 0.12,
  LUNGE_TORSO_MIN 0.2, KNEE_SWITCH 0.15, KNEE_VIS_MIN 20, KNEE_OTHER 0.5 (verification), KNEE_TORSO_MIN 0.4, BURPEE_HIP_LOW 0.45, BURPEE_HAND_LOW 0.25,
  BURPEE_KNEE_UP 0.1, SITUP_SHOULDER_RATIO 0.73, SITUP_FLAT 0.25, SITUP_FLAT_FIRST 0.45, SITUP_HIP_FLOOR 0.75, SITUP_UP 0.62,
  SITUP_TWIST 0.4, PLANK_BREAK_MS 300, PLANK_OFFSET_MAX 0.5, PLANK_FOREARM_FLAT 0.35, PLANK_FOREARM_UPRIGHT 0.75, PLANK_TARGET_MIN 10,
  PLANK_TARGET_MAX 180; `MOVE_RULES` (Record<MoveExercise, RepGates>), `RepAgg`, `EXERCISES`, `exerciseUnit`, `REP_TARGET_LIMIT`,
  `repTargetMin`. `RULES` / `VERTICAL_RULES` are now `Record<BaseExercise, …>`. Verification (2026-11-27): SPIKE_STEP_MS 70 (a
  reading with its own spikeDeg allows spikeDeg × (ms since the last usable sample) / 70 when that is over 70 ms; push-ups and
  squats keep SPIKE_DEG unscaled), MOVE_RULES jumpingjack minRepMs 400 → 250, highknee 200 → 120.
- Engine tag: still `REPS_ENGINE = "reps@1"` (the trace format is unchanged). The counting behaviour changed under the same tag, so a
  trace recorded by an app build older than 2026-11-26 may recount differently on a newer server; fine before release, bump the tag if
  that ever matters after it. 2026-11-27: side-view traces recount exactly as before (the seven older golden vectors' digests are
  unchanged); a trace filmed from another angle now counts in the vertical reading where an older engine counted (almost) nothing, so the
  phone and the server must run the same engine build (as always: the two copies are byte-identical). 2026-11-27 overnight: still
  reps@1 (the trace format only gained exercise names, which `parseTrace` accepts); the seven side-view vectors' digests are again
  unchanged, the four 3D push-up / squat vectors changed on purpose (below), so the app build and the server must be deployed together.
- `type Trace = { v: 1, engine: "reps@1", exercise, aspect, t: number[], p: number[] /* 36 per sample, empty pose = 36 zeros */, pauses: [number, number][] }`;
  pauses are inclusive windows, at most `MAX_PAUSES` = 16, sorted and non-overlapping (each starts after the previous one ends,
  so [a, b], [b, c] is invalid); `parseTrace` rejects anything else.
  `countReps(trace): { count, reps: { startT, bottomT, endT }[] }` replays RepCounter over the samples (skipping pause windows with one
  forward pointer) — deterministic, so the phone's live count equals the server's recount.
- `traceDigest(trace): { count, reps, faults, samples, angleHash }` — countReps plus every fault event and an FNV-1a 32 hash of the
  little-endian IEEE-754 bytes of the smoothed angle after each pushed sample (0xff×8 for null). Golden vectors:
  `packages/engine/test-vectors/reps-vectors.json` (pushups, squats, cheat-supine-press, paused-session, cheat-belly-prop, cheat-cobra,
  freeze-resume; added 2026-11-27 from the 3D fixtures: front-pushups (6, head-on from the floor), oblique-squats (5, at 45° from 0.9 m),
  cheat-front-arm-dips (0, not_plank), cheat-oblique-good-morning (0); added 2026-11-27 overnight, one honest set and one cheat per new
  activity: jumping-jacks (5, at 30°), cheat-jacks-one-arm (0), overhead-presses (4, head-on), cheat-half-presses (0, at 60°), lunges (4,
  at 60°, legs alternating), cheat-quarter-lunges (0, side-on), high-knees (8, from behind at 150°), cheat-marching-knees (0), burpees
  (3, at 45°), cheat-squat-burpees (0), sit-ups (4, side-on from the floor), cheat-neck-curls (0, from the feet), plank-freeze (8 s:
  5 + 3 around a 3 s freeze pause), cheat-plank-sag (0, hips)), checked by the engine tests and
  by backend/test/reps.test.ts against the server copy; the app can replay the same file under Hermes and compare `expect`.
  Digest changes 2026-11-27 overnight (traces identical, counts and faults identical): front-pushups (angleHash, and rep 3's endT 5350 →
  5300), oblique-squats, cheat-front-arm-dips, cheat-oblique-good-morning (angleHash only). Why: the first view decision now waits
  ~5 samples (VIEW_INIT_SAMPLES; the smoothed angle is null meanwhile, which the hash records), and the push-up bottom line / view
  measure changes move the smoothed angle slightly. The seven 2D vectors are unchanged.
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

## App and server side: every live activity (2026-11-27)
- Activities (engine `Exercise`): pushup, squat, jumpingjack, lunge, situp, highknee, burpee, press (reps) and plank (seconds:
  one `rep` per full second held in a valid plank, n = seconds held; `exerciseUnit(ex)`, `REP_TARGET_LIMIT(ex)`). Habit texts, as
  the catalog stores them (its label lower-cased) and `parseRepHabit` reads them: "N push-ups", "N squats", "N jumping jacks",
  "N lunges", "N sit-ups", "N high knees", "N burpees", "N overhead presses", "N-second plank".
- Catalog (frontend/src/features/objects/catalog.ts): keys `reps_<exercise>_<n>`: push-ups and squats 10/20/30/50, jumping jacks
  20/30/50, lunges 10/20, sit-ups 10/20/30, high knees 20/40, burpees 5/10/15, overhead presses 10/20, plank 30/60/90 s. A plain
  activity word leads to its first count ("plank" → 30 s; push-ups and squats keep theirs on 20), a count to its own entry; the
  photo entry "Push-ups and planks" lost the words "plank", "sit ups", "burpees" to the live ones. Older drafts' `reps_pushups_N` /
  `reps_squats_N` load as `reps_pushup_N` / `reps_squat_N` (proof.ts › savedEntry). Icons (proof.ts › REP_ICON): arm-flex,
  human-handsdown, human-handsup, kabaddi, seat-recline-normal, run, gymnastics, weight-lifter, timer-sand. QUICK_PICK_OBJECTS: the
  nine activities first (10 push-ups, 10 squats, 20 jumping jacks, 10 lunges, 10 sit-ups, 20 high knees, 5 burpees, 10 overhead
  presses, 30-second plank), then dumbbell, book, water bottle, guitar, running shoes, plant (15, a full 3-column grid).
- Proof (F1) shows RepSet for any challenge object `parseRepHabit` accepts, so every text above routes there.
- RepSet per activity (frontend/src/features/reps/activity.ts, copy additions.reps.*): set-up steps = placement (floor, landscape,
  ~2 m: push-ups, plank, sit-ups; upright on the floor ~3 m: burpees; upright on a chair at knee–waist height 2.5–3 m: squats,
  lunges, high knees, jumping jacks, presses), "whole body in view, from any angle" (raised hands too for jumping jacks and
  presses), then how to begin (`additions.reps.ex.<ex>.begin`); status "Get into position: …" (`ex.<ex>.position`) until the
  counter's `ready`, then "Go!" (plank: "Hold it!"); count label "of N <label>" (plank: "of N seconds"); Start "Start: N <label>"
  (plank: "Start: N-second plank"); half-rep hint per activity (`ex.<ex>.halfRep`); the plank's form hint says the clock stops;
  the added faults have their own hint (`additions.reps.fault.<code>`: legs, stance, same_leg, twist, not_lying, no_lockout), the
  others keep the generic form hint.
  The plank says only its whole tens that have a count clip (10–50; 60+ silent) and buzzes on them; the hype coach fills in. A set
  must fit the challenge: reps × 3 s + 20 s, plank N + 45 s (≤ 225 s for the 180 s maximum, inside REP_SET_MAX_MS = 240 s).
  While counting a small chip shows the counter's `view` (Side / Front / Angle view).
- Roll fix (limit 10 above): for |tilt| ≤ 20 each sample's (x, y) is rotated by −tilt about the frame centre (x × aspect before,
  ÷ aspect after; rounded, clamped to 0..1000; visibility, `[]` and 36 zeros untouched) by features/reps/upright.ts, before
  `counter.push` and the trace, so the server recounts the same upright numbers. Sign, from RepCounterView.kt (roll =
  atan2(−gx, gy), tilt = roll − bucket, positive = turned further clockwise seen from the screen): the front camera's analysis
  frame is not mirrored, so a clockwise roll turns the scene clockwise in it and gravity-down lands at (−sin t, cos t) (x right,
  y down, pixel proportions); rotating by −t brings it back to (0, 1). (The back camera would need +t; RepSet always uses the
  front.) Tested: a synthetic body tilted by +t and fed with tilt = t comes out upright within 2/1000; the golden vectors
  (pushups, squats, front-pushups, oblique-squats) rolled ±12–19° count exactly their expected reps once turned back (uncorrected
  the side-on push-ups count 0 of 5 at +16°, the squats 0 of 4 at +19°); through RepSet, freeze-resume rolled 16° counts 8 of 8
  and jumping-jacks (with a freeze) rolled 12° 5 of 5, and both traces recount the same and parse on the server.
- Hype lines (hypeLines.ts › hypeFits, hypeChooser.ts): a line whose words need the effort to go down ("Deeper", "Lower", "get all
  the way down", "curtsy": every halfRep line) plays only for push-ups, squats, lunges and burpees; a half jumping jack, sit-up,
  high knee or press gets a form ("fault") line instead and never the "go lower" clip. A plank (unit seconds) never gets reps-only
  lines (slow, "final rep", "the reps" after the photo, "again", "move", "go", "the pace", and the welcome back "The clock didn't stop":
  a plank's clock does stop while it is lost; fixed on verification), no first/last milestones, no slow
  line, and a streak line once ≥ 8 s passed without one; its lines must end before its next spoken count (coach option
  `speaksAt`), not the next second. No new audio. The plain "done" clip ("every rep kept") isn't used for a plank.
- Server (backend/src/v4/repProof.ts): `checkRepEvidence` is unchanged and generic (a plank's target, freeze rep and count are
  seconds; a short plank's error says "… of N seconds"); `repFreezeObject(ex)` describes the freeze frame per activity (plank: "a
  person holding a plank on the floor (one hand may be raised)"). keeperAgent.ts describes every activity (label, unit, how to
  prove it, phone placement) and `get_rules rep_sets` lists them; ask.ts's system line names them.

