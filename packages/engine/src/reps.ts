// Live rep counting (push-ups, squats) from MediaPipe Pose landmarks (docs/notes/REP_COUNTER_CONTRACT.md).
// The phone runs RepCounter on every pose sample for the live count; the Keeper replays the uploaded trace with
// countReps for the count that goes in the receipt. Both feed the same quantised integers through the same code,
// so both get the same number.
//
// This file is pure and dependency-free, and it exists twice, byte for byte: packages/engine/src/reps.ts (the app)
// and backend/src/shared/reps.ts (the server). backend/test/reps.test.ts fails when the two differ, so edit one
// and copy it over the other.
//
// Determinism: the phone (Hermes) and the server (V8) must make the same decision on every sample. JS + - * / and
// Math.sqrt are exactly rounded IEEE-754 everywhere, but Math.acos/atan2/exp may differ in the last bit between
// engines, and a last-bit difference right at a threshold would flip a count. So the angle and smoothing maths
// below use only basic arithmetic (atanDeg, expNeg), never the transcendental Math functions. No clocks, no
// randomness: the output depends only on the samples.
//
// Views (2026-11-27): the camera may see the person from any horizontal angle. From the side the counter reads one
// side's 2D elbow / knee angle (the original rules, `RULES`). From the front, the back or anything in between a 2D
// angle means little, but the frame is gravity-aligned, so vertical image distances barely depend on where the
// camera stands: the counter then reads how far the shoulders sit above the wrists (push-ups) or the hips above the
// ankles (squats), as a share of that gap at the person's own top, plus posture checks built from heights
// (`VERTICAL_RULES`). Which reading is used follows the view (`view`), decided from how far apart the left and right
// shoulders and hips are horizontally compared with the vertical scale, with hysteresis.

export type Exercise = "pushup" | "squat";

/** MediaPipe Pose indices carried in each sample, in this order: shoulders, elbows, wrists, hips, knees, ankles (left, right). */
export const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
/** Integers per sample: x·1000, y·1000, visibility·100 for each joint in JOINTS order. */
export const SAMPLE_INTS = JOINTS.length * 3;
export const REPS_ENGINE = "reps@1";
/** Count clips exist for 1–50 and a set has to fit the challenge window. */
export const REP_TARGET_MAX = 50;

// ── Rep habit text: "20 push-ups" / "30 squats" ──

const REP_HABIT_RE = /^([1-9][0-9]?)\s+(push-ups|pushups|squats)$/;

/** The only way to tell a rep habit from a photo habit, on the phone and on the server. */
export function parseRepHabit(text: string): { exercise: Exercise; target: number } | null {
  const m = REP_HABIT_RE.exec(text.trim().toLowerCase());
  if (!m) return null;
  const target = Number(m[1]);
  if (target < 1 || target > REP_TARGET_MAX) return null;
  return { exercise: m[2] === "squats" ? "squat" : "pushup", target };
}

export const repHabitText = (exercise: Exercise, target: number): string =>
  `${target} ${exercise === "pushup" ? "push-ups" : "squats"}`;

// ── Deterministic geometry (basic arithmetic only, see the header) ──

const PI = 3.141592653589793;
const SQRT3 = 1.7320508075688772;
const TAN15 = 0.2679491924311227;

/** atan(z) in radians for |z| ≤ tan 15°: the alternating series is below 1e-16 after 13 terms there. */
function atanSeries(z: number): number {
  const z2 = z * z;
  let term = z;
  let sum = z;
  for (let k = 3; k <= 27; k += 2) {
    term = -term * z2;
    sum += term / k;
  }
  return sum;
}

/** atan(r) in degrees for r ≥ 0, reduced to the series range with atan r = 90° − atan(1/r) and the 30° shift. */
function atanPosDeg(r: number): number {
  if (r > 1) return 90 - atanPosDeg(1 / r);
  const rad = r > TAN15 ? PI / 6 + atanSeries((r * SQRT3 - 1) / (r + SQRT3)) : atanSeries(r);
  return (rad * 180) / PI;
}

/** The angle in [0°, 180°] whose sine and cosine are proportional to y ≥ 0 and x (atan2 for the upper half plane). */
function atanDeg(y: number, x: number): number {
  if (x > 0) return atanPosDeg(y / x);
  if (x < 0) return 180 - atanPosDeg(y / -x);
  return y > 0 ? 90 : NaN;
}

/** e^(−x) for x ≥ 0: halve until x ≤ 0.5, Taylor series, then square back (all exact-rounded operations). */
function expNeg(x: number): number {
  if (!(x > 0)) return 1;
  if (x > 40) return 0;
  let k = 0;
  while (x > 0.5) {
    x /= 2;
    k += 1;
  }
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 18; n++) {
    term = (-term * x) / n;
    sum += term;
  }
  for (let i = 0; i < k; i++) sum *= sum;
  return sum;
}

// A sample is read in its integer units (x, y in thousandths of the frame, visibility in percent). x is scaled by
// the aspect ratio (width / height) so a 45° line in the picture is 45° here too.

type Joint = "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle";
const JOINT_SLOT: Record<Joint, number> = { shoulder: 0, elbow: 2, wrist: 4, hip: 6, knee: 8, ankle: 10 };
type Side = 0 | 1; // 0 = the person's left, 1 = right (MediaPipe's naming)

const ZERO_SAMPLE: readonly number[] = new Array<number>(SAMPLE_INTS).fill(0);
const at = (p: readonly number[], side: Side, j: Joint, k: 0 | 1 | 2): number => p[(JOINT_SLOT[j] + side) * 3 + k]!;

/** Angle at b between b→a and b→c, in degrees; NaN when either limb has zero length. */
function jointAngle(p: readonly number[], side: Side, a: Joint, b: Joint, c: Joint, aspect: number): number {
  const bx = at(p, side, b, 0), by = at(p, side, b, 1);
  const ax = (at(p, side, a, 0) - bx) * aspect, ay = at(p, side, a, 1) - by;
  const cx = (at(p, side, c, 0) - bx) * aspect, cy = at(p, side, c, 1) - by;
  const cross = ax * cy - ay * cx;
  if ((ax === 0 && ay === 0) || (cx === 0 && cy === 0)) return NaN;
  return atanDeg(cross < 0 ? -cross : cross, ax * cx + ay * cy);
}

/** The line a→b against the horizontal: 0° flat, 90° vertical. */
function inclineDeg(p: readonly number[], side: Side, a: Joint, b: Joint, aspect: number): number {
  const dx = (at(p, side, b, 0) - at(p, side, a, 0)) * aspect, dy = at(p, side, b, 1) - at(p, side, a, 1);
  return atanDeg(dy < 0 ? -dy : dy, dx < 0 ? -dx : dx);
}

/** Length of the segment a–b in aspect-corrected thousandths (Math.sqrt is exactly rounded everywhere). */
function segment(p: readonly number[], side: Side, a: Joint, b: Joint, aspect: number): number {
  const dx = (at(p, side, b, 0) - at(p, side, a, 0)) * aspect, dy = at(p, side, b, 1) - at(p, side, a, 1);
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Rules (docs/notes/rep-algo-design.json, thresholds fixed by the contract) ──
// The analysis frame is gravity-aligned (the native view rotates it upright), so image y points down towards the
// floor. The anti-cheat gates lean on that: in a push-up the hands are on the floor below the shoulders and the
// shoulders travel down and up; in a squat the hips do. An elbow or knee that only bends (curls, presses lying on
// the back, hamstring curls, high knees) moves the angle without moving the body, and never counts.

/** Visibility (percent) below which a joint can't be trusted. */
export const VIS_MIN = 50;
/** The other side must be this much more visible (percent) before the counter switches to it. */
export const SIDE_MARGIN = 15;
/**
 * ...and it must stay that much better (or the current side unusable while the other is usable) for this many
 * samples in a row: a one- or two-frame visibility flicker must not abandon the rep in progress.
 */
export const SIDE_SWITCH_SAMPLES = 5;
/** No usable sample for this long means lost: the rep in progress is dropped and the start pose is needed again. */
export const LOST_MS = 400;
/**
 * After a feed gap (a pause) or a loss (occlusion), counting resumes once the start pose has been held this long:
 * the brief top between two reps is enough, so a steady repper doesn't have to stop. The first start of a set still
 * needs the rule's full startHoldMs.
 */
export const RESUME_HOLD_MS = 100;
/** Smoothing time constant: α = 1 − e^(−dt/τ), about 0.57 at 20 Hz. */
export const EMA_TAU_MS = 60;
/**
 * A jump this big from the smoothed angle is a landmark flip, dropped for up to SPIKE_FRAMES samples in a row. A real
 * rep moves at most ~26° per 50 ms sample (a 600 ms push-up), so 45° leaves room for noise while a flip that lands
 * just past the count line (155°, close to the start line) can't end or start a rep on its own.
 */
export const SPIKE_DEG = 45;
export const SPIKE_FRAMES = 2;
/** Side reading: the anchor (wrist / ankle) moving more than this many limb lengths in one sample is a left/right label
 *  swap, dropped like an angle flip (hands and feet are planted; a swap seen up close moves them by ~0.8). */
export const ANCHOR_JUMP = 0.5;
/** A form fault on more than this share of a rep's samples rejects the rep. */
export const FAULT_SHARE = 0.25;
/** Landmarks a little outside the frame are still plausible; further out the joint is guessed. */
const FRAME_SLACK = 20;
const inFrame = (x: number, y: number): boolean =>
  x >= -FRAME_SLACK && x <= 1000 + FRAME_SLACK && y >= -FRAME_SLACK && y <= 1000 + FRAME_SLACK;
/** Push-up top (start pose and the end of every rep): the wrist is more than this many upper-arm lengths below the
 *  shoulder (a straight arm under the shoulder reads 1.6–2; lying on the belly with the arms forward reads about 1). */
export const PUSHUP_REACH_MIN = 1.0;
/** Push-up top: the wrist is at most this many upper-arm lengths in front of or behind the shoulder (under it). */
export const PUSHUP_OFFSET_MAX = 1.3;
/** Push-up: the hip must drop at least this share of the shoulder's drop (hips left on the floor: cobra). */
export const PUSHUP_HIP_DROP_MIN = 0.3;
/** Squat depth, in thigh lengths of hip height relative to the knee at the deepest sample (negative = above). */
export const SQUAT_DEPTH_HINT = -0.15; // above this: counts with a depth hint
export const SQUAT_DEPTH_MIN = -0.5; // above this: clearly shallow, rejected as depth

/**
 * Fault codes in `fault` events. Form faults (not_plank, hips, lean) fire when they start (a hint chip) and again
 * when they reject a rep: on more than FAULT_SHARE of its samples (all form faults together), or on its last sample
 * (the top). Push-up `hips` also rejects a rep whose hip didn't go down with the shoulders (PUSHUP_HIP_DROP_MIN:
 * cobra, hips left on the floor). too_fast / too_slow / no_lockout fire when a rep is rejected for its timing or a
 * missed lockout. The anti-cheat faults fire when they reject a rep: hands_not_planted (push-up: at the top the wrist
 * is not well below and roughly under the shoulder, or it moved during the rep; also the setup hint when lying on the
 * back or on the belly), no_shoulder_drop (push-up: the elbow bent but the shoulder didn't go down far enough),
 * no_hip_drop (squat: the knee bent but the hip never went down), feet_not_planted (squat: the ankle moved during the
 * rep). depth rejects a clearly shallow squat (hip still well above the knee) and is a one-off hint on a counted
 * squat that stopped a little above parallel.
 */
export type RepFault =
  | "not_plank" | "hips" | "lean" | "depth" | "too_fast" | "too_slow" | "no_lockout"
  | "hands_not_planted" | "no_shoulder_drop" | "no_hip_drop" | "feet_not_planted";

export type RepFeatures = {
  /** The counted signal, degrees: the elbow / knee angle (side view), or 180 × the extension (other views). */
  primary: number;
  /** Push-up shoulder–hip–ankle angle, degrees (180 for squats; in the vertical reading through the midpoints, 180 when the body is seen end-on, see V_PUSHUP_LINE_SPAN). */
  bodyLine: number;
  /** Push-up shoulder–ankle line / squat hip–shoulder line against the horizontal, degrees (0 in the vertical reading). */
  incline: number;
  /** Squat: hip height relative to the knee in thigh lengths, > 0 below the knee (0 for push-ups, or no knee seen). */
  depth: number;
  /** The reference length: upper arm / thigh (side), the calibrated top gap (vertical); thousandths of the frame height. */
  limb: number;
  /** Image y (thousandths, down) of the joint that has to drop: shoulder / hip. */
  dropY: number;
  /** Aspect-corrected position of the joint that has to stay planted: wrist / ankle. */
  anchorX: number;
  anchorY: number;
  /** Push-up: how far the wrist is below the shoulder, in limb lengths (0 for squats). */
  reach: number;
  /** How far the wrist (push-up) / hip (squat, vertical only) is in front of or behind the shoulder / ankle, in limb lengths, ≥ 0. */
  offset: number;
  /** Image y (thousandths, down) of the hip. */
  hipY: number;
  // Vertical reading only (neutral values in the side reading):
  /** The left–right distance between the anchors (wrists / ankles), aspect-corrected thousandths, 3-sample median; −1 unless both are seen and at least SPREAD_MIN limb lengths apart. */
  spread: number;
  /** Push-up: the smallest 2D elbow angle of the visible arms, 3-sample median, degrees (180 when none, and for squats). */
  bend: number;
  /** 1 when the straightest visible arm (push-up) / leg (squat) reads straight in 2D, else 0. */
  straight: number;
  /** The vertical gap over the limb's 2D length (1 for a vertical limb). */
  upright: number;
  /** Push-up: how far the hip is below the shoulder; squat: how far the shoulder is above the hip; in limb lengths. */
  torso: number;
  /** Push-up: how far the ankle is below the shoulder in limb lengths, −1 when no ankle is seen (0 for squats). */
  feet: number;
  /** Push-up: hip height above the floor line between the wrists and the ankles, over the shoulder's height above the wrists, −1 when no ankle is seen (0 for squats). */
  hipRel: number;
};

/** What the counting state machine needs from a reading, whichever view it comes from. */
export type RepGates = {
  /** A rep starts below this primary, reaches the bottom below `bottom` and counts above `top`. */
  start: number;
  bottom: number;
  top: number;
  minRepMs: number;
  maxRepMs: number;
  startHoldMs: number;
  /** dropY must go down (grow) by at least this many limb lengths from the rep's highest point to its bottom. */
  dropMin: number;
  dropFault: RepFault;
  /** hipY must go down by at least this share of dropY's drop (0: not checked), else `hips`. */
  hipDropMin: number;
  /** The anchor must stay within a box whose diagonal is at most this many limb lengths for the whole rep. */
  anchorMax: number;
  anchorFault: RepFault;
  /** The anchors' spread (`spread`) may change by at most this many limb lengths over a rep (0: not checked). */
  spreadMax: number;
  /** The rep is rejected (anchorFault) unless `bend` went below this at some sample (181: not checked). */
  bendMax: number;
  /** A rep whose deepest sample has `depth` below this is rejected as depth (null: not checked, no depth hint). */
  depthMin: number | null;
  /** A counted rep this shallow (deepest primary, depth there) gets the one-off depth hint. */
  shallow(minPrimary: number, minDepth: number): boolean;
  /** The start pose (held startHoldMs, or RESUME_HOLD_MS after a gap, before counting); topFault must also be null. */
  startPose(f: RepFeatures): boolean;
  /** Checked on the start pose and on the last sample of every rep (the top): a fault there rejects. Includes `fault`. */
  topFault(f: RepFeatures): RepFault | null;
  /** Per-sample form fault: a hint, and it rejects a rep when it lasts more than FAULT_SHARE of it. */
  fault(f: RepFeatures): RepFault | null;
};

/** The side-view reading: one side's 2D joint angles. */
export type RepRules = RepGates & {
  /** Joints the angles need; the side score is the weakest of them. */
  needed: readonly Joint[];
  features(p: readonly number[], side: Side, aspect: number): RepFeatures;
};

/** The vertical fields of RepFeatures, neutral (the side reading doesn't use them). */
const SIDE_ONLY = { spread: -1, bend: 180, straight: 0, upright: 0, torso: 0, feet: 0, hipRel: 0 } as const;

export const RULES: Record<Exercise, Readonly<RepRules>> = {
  pushup: {
    needed: ["shoulder", "elbow", "wrist", "hip", "ankle"],
    start: 130, bottom: 100, top: 150, minRepMs: 600, maxRepMs: 8_000, startHoldMs: 500,
    dropMin: 0.5, dropFault: "no_shoulder_drop", hipDropMin: PUSHUP_HIP_DROP_MIN,
    anchorMax: 0.8, anchorFault: "hands_not_planted", spreadMax: 0, bendMax: 181, depthMin: null, shallow: () => false,
    features: (p, s, aspect) => {
      const limb = segment(p, s, "shoulder", "elbow", aspect);
      const sy = at(p, s, "shoulder", 1), wy = at(p, s, "wrist", 1);
      const dx = (at(p, s, "wrist", 0) - at(p, s, "shoulder", 0)) * aspect;
      return {
        primary: jointAngle(p, s, "shoulder", "elbow", "wrist", aspect),
        bodyLine: jointAngle(p, s, "shoulder", "hip", "ankle", aspect),
        incline: inclineDeg(p, s, "shoulder", "ankle", aspect),
        depth: 0,
        limb,
        dropY: sy,
        anchorX: at(p, s, "wrist", 0) * aspect,
        anchorY: wy,
        reach: limb > 0 ? (wy - sy) / limb : NaN,
        offset: limb > 0 ? (dx < 0 ? -dx : dx) / limb : NaN,
        hipY: at(p, s, "hip", 1),
        ...SIDE_ONLY,
      };
    },
    // Arms locked, body roughly horizontal (this is what stops standing elbow bends from counting) and straight.
    startPose: (f) => f.primary > RULES.pushup.top && f.incline <= 35 && f.bodyLine >= 150,
    // Hands on the floor under the shoulders, arms straight down: lying on the back and pressing the arms up has the
    // wrists above; lying on the belly propped on the arms has them forward and barely below. Then the plank form.
    topFault: (f) => (f.reach > PUSHUP_REACH_MIN && f.offset <= PUSHUP_OFFSET_MAX ? RULES.pushup.fault(f) : "hands_not_planted"),
    fault: (f) => (f.incline > 35 ? "not_plank" : f.bodyLine < 150 ? "hips" : null),
  },
  squat: {
    needed: ["shoulder", "hip", "knee", "ankle"],
    start: 140, bottom: 100, top: 155, minRepMs: 450, maxRepMs: 10_000, startHoldMs: 500,
    dropMin: 0.4, dropFault: "no_hip_drop", hipDropMin: 0,
    anchorMax: 0.5, anchorFault: "feet_not_planted", spreadMax: 0, bendMax: 181,
    depthMin: SQUAT_DEPTH_MIN, shallow: (_, minDepth) => minDepth < SQUAT_DEPTH_HINT,
    features: (p, s, aspect) => {
      const hy = at(p, s, "hip", 1), ky = at(p, s, "knee", 1);
      const thigh = segment(p, s, "hip", "knee", aspect);
      return {
        primary: jointAngle(p, s, "hip", "knee", "ankle", aspect),
        bodyLine: 180,
        incline: inclineDeg(p, s, "hip", "shoulder", aspect),
        depth: thigh > 0 ? (hy - ky) / thigh : NaN,
        limb: thigh,
        dropY: hy,
        anchorX: at(p, s, "ankle", 0) * aspect,
        anchorY: at(p, s, "ankle", 1),
        reach: 0,
        offset: 0,
        hipY: hy,
        ...SIDE_ONLY,
      };
    },
    // Standing tall with the torso near vertical (lying down and bending the knees never starts).
    startPose: (f) => f.primary > RULES.squat.top && f.incline >= 65,
    topFault: (f) => RULES.squat.fault(f),
    fault: (f) => (f.incline < 30 ? "lean" : null),
  },
};

// ── The vertical reading (front, back, oblique views) ──
// In a push-up the shoulders sit right above the wrists and in a squat the hips right above the ankles, at the same
// distance from the camera, so their vertical gap in a gravity-aligned frame is the same from every horizontal angle
// (perspective scales it with the distance, which a set doesn't change). The counter calibrates that gap at the
// person's own top (arms / legs straight: a straight limb projects straight from any angle, and vertical: its gap
// equals its 2D length) and counts the extension, gap / calibrated top, as primary = 180 × extension. Posture is read
// from heights: the hip relative to the shoulder and to the floor line between hands and feet (push-ups), the
// shoulder over the hip and the knee off the floor (squats). Deterministic arithmetic only, like the rest.

/** The view must call for the other reading this many usable samples in a row before the counter switches. */
export const VIEW_SWITCH_SAMPLES = 8;
/** The vertical scale the view is judged against decays with this time constant (a decaying maximum of the gap). */
export const VIEW_SCALE_TAU_MS = 10_000;
/** The view measure (hip spread over the scale) is smoothed with this time constant. */
export const VIEW_SPREAD_TAU_MS = 500;
/** Visibility (percent) a hip needs for the view measure (lower than VIS_MIN: see viewSpread). */
export const VIEW_VIS_MIN = 35;
/** Calibration: this many samples in a row with the limbs straight and vertical give a candidate top (their median). */
export const CAL_SAMPLES = 3;
/**
 * A candidate above the calibrated top replaces it; one below pulls it down by this share per sample, so the top
 * follows the person's distance slowly (turning during a set) while a few shallow straight-arm samples can't drag it.
 */
export const CAL_FOLLOW = 0.05;
/** ...and only from candidates at least this share of the top (a top, not a straight-looking arm mid-rep). */
export const CAL_FOLLOW_MIN = 0.85;
/** The anchor-spread check needs the anchors (wrists / ankles) at least this many limb lengths apart (not side-on). */
export const SPREAD_MIN = 0.2;

export type VerticalRules = RepGates & {
  /** View: the hips' horizontal spread over the vertical scale, smoothed. Below sideIn the view turns side, above
   *  sideOut it turns vertical (front / oblique); above frontMin it is called front. Head-on it reads ~0.3–0.4. */
  sideIn: number;
  sideOut: number;
  frontMin: number;
  /** The straightest visible limb's 2D angle (elbow / knee) above this reads straight (calibration needs it). */
  straight: number;
  /** The gap is at least this share of the straightest limb's 2D length: it reads vertical (start pose, calibration). */
  upright: number;
};

/** Push-up (vertical): the hip below the shoulder by more than this many arm lengths is an upright torso: not_plank. */
export const V_PUSHUP_TORSO_MAX = 0.65;
/** Push-up (vertical): the ankle below the shoulder by more than this many arm lengths (standing, kneeling up): not_plank. */
export const V_PUSHUP_FEET_MAX = 2.1;
/** ...and with the torso upright (V_PUSHUP_TORSO_MAX) the feet this far below already make it not_plank rather than hips. */
export const V_PUSHUP_UPRIGHT_FEET = 1.4;
/** Push-up (vertical): the hip's height over the floor line relative to the shoulder's height (straight plank ≈ 0.5–0.85). */
export const V_PUSHUP_HIP_MIN = 0.4; // below: sagging / hips on the floor
export const V_PUSHUP_HIP_MAX = 1.35; // above: piked
/** Push-up (vertical): some visible arm must read bent below this (2D elbow angle) during the rep. Elbows tucked
 *  tight to the body bend in the plane of a head-on camera's view, so a shallow tucked push-up seen exactly head-on
 *  can fail this (a limit); flared elbows (≥ ~20°) or full depth read well under it from every angle. */
export const V_PUSHUP_BEND = 145;
/** Push-up (vertical): the wrist at most this many arm lengths in front of or behind the shoulder at the top. */
export const V_PUSHUP_OFFSET_MAX = 0.45;
/**
 * Push-up (vertical): the side reading's body-line rule (shoulder–hip–ankle under 150° is `hips`) is applied to the
 * midpoints whenever shoulder→hip→ankle spans at least this many calibrated tops in 2D (each segment ≥ 0.4), i.e.
 * the body is not seen end-on. A straight body stays straight in 2D under any perspective and roll, so this catches
 * piked or sagging hips from the side and obliquely, where the hip-height check (V_PUSHUP_HIP_MAX) is too lenient.
 */
export const V_PUSHUP_LINE_SPAN = 2.2;
/** Squat (vertical): the shoulder above the hip by less than this many leg lengths is a torso near horizontal: lean. */
export const V_SQUAT_TORSO_MIN = 0.15;
/** Squat (vertical): the start pose needs the shoulder this far above the hip (standing tall). */
export const V_SQUAT_TORSO_START = 0.4;
/** Squat (vertical): depth (hip relative to the knee in units of half the standing leg gap ≈ a thigh) below this at the
 *  deepest sample rejects the rep as depth: the knees went to the floor (kneeling), not the hips down. */
export const V_SQUAT_DEPTH_MIN = -0.75;
/** Squat (vertical): a counted squat whose deepest extension stayed above this gets the one-off depth hint. */
export const V_SQUAT_SHALLOW = 0.6;

export const VERTICAL_RULES: Record<Exercise, Readonly<VerticalRules>> = {
  pushup: {
    // Extension 0.9 / 0.8 / 0.55 of the calibrated top: a full push-up goes to ~0.2–0.35, elbows at 90° to ~0.5.
    start: 144, bottom: 99, top: 162, minRepMs: 600, maxRepMs: 8_000, startHoldMs: 500,
    dropMin: 0.3, dropFault: "no_shoulder_drop", hipDropMin: PUSHUP_HIP_DROP_MIN,
    anchorMax: 0.3, anchorFault: "hands_not_planted", spreadMax: 0.25, bendMax: V_PUSHUP_BEND, depthMin: null, shallow: () => false,
    sideIn: 0.035, sideOut: 0.06, frontMin: 0.31, straight: 145, upright: 0.82,
    // Extended with the arms vertical (gap ≈ the straightest arm's 2D length). Straightness itself is only demanded
    // for calibrating the top, so resuming at the brief top after a freeze works like in the side reading.
    startPose: (f) => f.primary > VERTICAL_RULES.pushup.top && f.upright >= VERTICAL_RULES.pushup.upright,
    // At the top the legs must be seen (the posture checks need the ankles) and the hands under the shoulders.
    topFault: (f) => (f.feet < 0 ? "not_plank" : f.offset > V_PUSHUP_OFFSET_MAX ? "hands_not_planted" : VERTICAL_RULES.pushup.fault(f)),
    fault: (f) => {
      // Clearly upright (hips well below the shoulders and the feet further still): not_plank, whatever the hips say.
      if (f.torso > V_PUSHUP_TORSO_MAX && f.feet > V_PUSHUP_UPRIGHT_FEET) return "not_plank";
      // The hip's height is only judged in the upper half of the rep (near the floor everything is a few pixels).
      if (f.hipRel >= 0 && f.reach >= 0.5 && (f.hipRel < V_PUSHUP_HIP_MIN || f.hipRel > V_PUSHUP_HIP_MAX)) return "hips";
      // The side reading's body line, where the 2D geometry shows it (bodyLine is 180 when seen end-on).
      if (f.bodyLine < 150) return "hips";
      return f.torso > V_PUSHUP_TORSO_MAX || f.feet > V_PUSHUP_FEET_MAX ? "not_plank" : null;
    },
  },
  squat: {
    // Extension 0.9 / 0.82 / 0.7 of standing: parallel is ~0.5, a hip a little above the knee ~0.6, a quarter squat ~0.8.
    start: 148, bottom: 126, top: 162, minRepMs: 450, maxRepMs: 10_000, startHoldMs: 500,
    // The hip itself must drop (from the rep's highest point, ~0.9, to its bottom): lifting a foot raises the ankle
    // level and shrinks the gap without the hips going anywhere (high knees).
    dropMin: 0.15, dropFault: "no_hip_drop", hipDropMin: 0,
    anchorMax: 0.25, anchorFault: "feet_not_planted", spreadMax: 0.25, bendMax: 181,
    depthMin: V_SQUAT_DEPTH_MIN, shallow: (minPrimary) => minPrimary > 180 * V_SQUAT_SHALLOW,
    sideIn: 0.03, sideOut: 0.05, frontMin: 0.24, straight: 155, upright: 0.85,
    startPose: (f) => f.primary > VERTICAL_RULES.squat.top && f.upright >= VERTICAL_RULES.squat.upright && f.torso >= V_SQUAT_TORSO_START,
    topFault: (f) => VERTICAL_RULES.squat.fault(f),
    fault: (f) => (f.torso < V_SQUAT_TORSO_MIN ? "lean" : null),
  },
};

export type RepView = "side" | "front" | "oblique";

type Level = { y: number; x: number; n: number; spread: number };

const usable = (p: readonly number[], s: Side, j: Joint): boolean => {
  const x = at(p, s, j, 0), y = at(p, s, j, 1);
  return at(p, s, j, 2) >= VIS_MIN && inFrame(x, y);
};

/**
 * A joint's position as the midpoint of its left and right landmarks (n = how many are usable). With one side
 * hidden, the midpoint is rebuilt from the seen side and the last left–right offset seen with both, so a side
 * dropping in and out doesn't move the level, the anchor or the drop by half the body's width; of the two ways to
 * read the seen landmark (as labelled, or a left/right label flip) the one nearer the last midpoint wins.
 * `lr` holds per joint [dx, dy, x, y]: the last offset (left − right) and the last midpoint; updated here.
 */
function level(p: readonly number[], j: Joint, aspect: number, lr: Map<Joint, [number, number, number, number]>): Level {
  const l = usable(p, 0, j), r = usable(p, 1, j);
  if (!l && !r) return { y: 0, x: 0, n: 0, spread: -1 };
  const lx = at(p, 0, j, 0) * aspect, ly = at(p, 0, j, 1), rx = at(p, 1, j, 0) * aspect, ry = at(p, 1, j, 1);
  const prev = lr.get(j);
  let x: number, y: number;
  if (l && r) {
    x = (lx + rx) / 2;
    y = (ly + ry) / 2;
    const dx = lx - rx;
    // A flip reverses the left/right order across the frame: keep the offset learnt before it.
    const keep = prev !== undefined && dx * prev[0] < 0;
    lr.set(j, keep ? [prev[0], prev[1], x, y] : [dx, ly - ry, x, y]);
    return { y, x, n: 2, spread: dx < 0 ? -dx : dx };
  }
  const sx = l ? lx : rx, sy = l ? ly : ry, sign = l ? -0.5 : 0.5;
  const dx = prev ? prev[0] : 0, dy = prev ? prev[1] : 0;
  x = sx + sign * dx;
  y = sy + sign * dy;
  if (prev) {
    const fx = sx - sign * dx, fy = sy - sign * dy; // the seen landmark is really the other side
    const a = (x - prev[2]) * (x - prev[2]) + (y - prev[3]) * (y - prev[3]), b = (fx - prev[2]) * (fx - prev[2]) + (fy - prev[3]) * (fy - prev[3]);
    if (b < a) { x = fx; y = fy; }
    lr.set(j, [dx, dy, x, y]);
  }
  return { y, x, n: 1, spread: -1 };
}

/**
 * The limb a–b–c (arm / leg) on the sides where it is fully seen: is the straightest one straight in 2D (a straight
 * limb projects straight from any angle; the far one is often a noisy guess), that limb's 2D length, and the
 * smallest angle of them (180 when none is seen).
 */
function limbs(p: readonly number[], a: Joint, b: Joint, c: Joint, straightDeg: number, aspect: number): { straight: boolean; length: number; bend: number } {
  let best = -1, length = 0, bend = 180;
  for (const s of [0, 1] as const) {
    if (!usable(p, s, a) || !usable(p, s, b) || !usable(p, s, c)) continue;
    const ang = jointAngle(p, s, a, b, c, aspect);
    if (ang > best) {
      best = ang;
      length = segment(p, s, a, b, aspect) + segment(p, s, b, c, aspect);
    }
    if (ang < bend) bend = ang;
  }
  return { straight: best > straightDeg, length, bend };
}

/** The middle of three numbers. */
function median3(a: number, b: number, c: number): number {
  return a > b ? (b > c ? b : a > c ? c : a) : a > c ? a : b > c ? c : b;
}

// ── Counter ──

export type RepPhase = "setup" | "up" | "descending" | "down" | "lost";
export type RepTiming = { startT: number; bottomT: number; endT: number };
export type RepEvent =
  | { type: "ready"; t: number }
  | ({ type: "rep"; n: number } & RepTiming)
  | { type: "half_rep"; t: number }
  | { type: "lost"; t: number }
  /** The feed paused for more than LOST_MS (e.g. a freeze) while counting: back to setup, hold the top to go on. */
  | { type: "setup"; t: number }
  | { type: "fault"; fault: RepFault; t: number };

/** One pose sample: t in integer ms (strictly increasing), p = SAMPLE_INTS integers, or empty / zeros when no pose. */
export type RepSample = { t: number; p: readonly number[] };

/**
 * Turns pose samples into reps. Feed it every sample that should count, in time order; samples that are not
 * pushed (a pause) leave a gap, and a gap longer than LOST_MS resets the counter to setup (a `setup` event when it
 * was counting; a rep in progress is dropped). Empty or all-zero samples are occlusion: after LOST_MS of them a rep
 * in progress is dropped with a `lost` event. After either, counting resumes once the start pose has been seen for
 * RESUME_HOLD_MS (the top between two reps is enough); the very first start needs the full startHoldMs. When the
 * counter switches to the other side mid-rep (SIDE_SWITCH_SAMPLES), or between the side and the vertical reading
 * (VIEW_SWITCH_SAMPLES), the rep is abandoned silently and the next one starts only after a fresh top.
 */
export class RepCounter {
  readonly exercise: Exercise;
  readonly aspect: number;
  private readonly r: Readonly<RepRules>;
  private readonly v: Readonly<VerticalRules>;
  private _phase: RepPhase = "setup";
  private _count = 0;
  private readonly _reps: RepTiming[] = [];
  private _side: Side | null = null;
  private switched = false;
  /** Samples in a row the other side has been the better one (see SIDE_SWITCH_SAMPLES). */
  private sideStreak = 0;
  /** In setup: true when coming back from a gap or a loss after counting started (short hold). */
  private resume = false;
  /** In "up": false until the angle has been above `top` on the current side (after a side switch). */
  private armed = true;
  private lastPushT: number | null = null;
  private lastOkT: number | null = null;
  private setupSince: number | null = null;
  private ema: number | null = null;
  private emaT = 0;
  private spikes = 0;
  private lastRaw = 0;
  private lastFault: RepFault | null = null;
  private depthAdvised = false;
  // The view and the vertical reading.
  /** true: the side reading (RULES); false: the vertical one (VERTICAL_RULES); null before the first decision. */
  private sideView: boolean | null = null;
  private viewStreak = 0;
  private front = false;
  /** Calibrated top gap (shoulder–wrist / hip–ankle, thousandths), null until the limbs have been seen straight. */
  private vref: number | null = null;
  /** Decaying maximum of the gap: the scale before calibration and for judging the view. */
  private vscale = 0;
  private vscaleT = 0;
  /** Smoothed view measure, −1 before the hips have been seen on both sides. */
  private vspread = -1;
  private vspreadT = 0;
  /** The last CAL_SAMPLES gaps, −1 for a sample that was not straight and vertical. */
  private readonly cal: number[] = [];
  /** The anchors' spread on the last three samples (−1: not both seen); the features carry their median. */
  private readonly spreads: number[] = [];
  /** The elbow bend on the last three samples; the features carry their median. */
  private readonly bends: number[] = [];
  /** Per joint, the last left − right offset (x, y) seen with both sides usable. */
  private readonly lr = new Map<Joint, [number, number, number, number]>();
  // The rep in progress.
  private repStart = 0;
  private minAngle = 180;
  private minT = 0;
  private minDepth = 0;
  private rose = false;
  private redipT: number | null = null;
  private frames = 0;
  private readonly faults = new Map<RepFault, number>();
  private topY = 0; // highest (smallest) dropY of the rep
  private bottomY = 0; // dropY at the deepest angle
  private hipTopY = 0; // highest (smallest) hipY of the rep
  private hipBottomY = 0; // hipY at the deepest angle
  private maxLimb = 0;
  // The box the anchor stayed in during the rep, and the range of the anchors' spread.
  private anchorMinX = 0;
  private anchorMaxX = 0;
  private anchorMinY = 0;
  private anchorMaxY = 0;
  private spreadMin = -1;
  private spreadMax = -1;
  private minBend = 180;
  /** The last believed sample's raw anchor (side reading: ANCHOR_JUMP). */
  private okAnchorX = 0;
  private okAnchorY = 0;
  /** Vertical reading: how many sides the anchor (wrist / ankle midpoint) was read from on this sample (1, 2). */
  private ancN = 2;
  private readonly ancHist: number[] = [];
  /** Vertical reading: the box of the anchor midpoint over the rep's samples read from one side (rebuilt with the
   *  last offset) and from both, kept apart: while the far side is hidden its rebuilt midpoint drifts as the person
   *  turns, which moves nothing within either box. minX, maxX, minY, maxY; null before the first such sample. */
  private readonly vbox: [[number, number, number, number] | null, [number, number, number, number] | null] = [null, null];
  private last: RepFeatures | null = null;

  /** aspect = analysis frame width / height (the onPose `w / h`); the trace stores the same number. */
  constructor(exercise: Exercise, aspect: number) {
    this.exercise = exercise;
    this.aspect = aspect;
    this.r = RULES[exercise];
    this.v = VERTICAL_RULES[exercise];
  }

  get count(): number { return this._count; }
  /**
   * The smoothed primary in degrees, for a depth gauge; null before a usable sample. From the side it is the elbow /
   * knee angle; from other views 180 × the extension (gap over the calibrated top): 180 at the top, lower going down.
   */
  get angle(): number | null { return this.ema; }
  get phase(): RepPhase { return this._phase; }
  /** Which side the counter is reading, for a framing hint (null in the vertical reading: both sides count). */
  get side(): "left" | "right" | null {
    if (this.sideView === false) return null;
    return this._side === null ? null : this._side === 0 ? "left" : "right";
  }
  /** How the counter sees the person: from the side (2D angles), the front / back, or obliquely; null before a pose. */
  get view(): RepView | null { return this.sideView === null ? null : this.sideView ? "side" : this.front ? "front" : "oblique"; }
  /** Every counted rep so far, in order. */
  get reps(): readonly RepTiming[] { return this._reps; }

  push(sample: RepSample): RepEvent[] {
    const { t } = sample;
    const ev: RepEvent[] = [];
    if (!Number.isFinite(t) || (this.lastPushT !== null && t <= this.lastPushT)) return ev; // out of order: ignored
    if (this.lastPushT !== null && t - this.lastPushT > LOST_MS) {
      // The feed paused (a freeze, the app in the background): whatever was in progress is dropped.
      if (this._phase !== "setup") {
        this.resume = true;
        if (this._phase !== "lost") ev.push({ type: "setup", t });
      }
      this.resetToSetup();
      this.forgetTop(); // the person may come back elsewhere
    }
    this.lastPushT = t;

    const p = sample.p.length === SAMPLE_INTS ? sample.p : ZERO_SAMPLE;
    const sf = this.read(p);
    const vr = this.readVertical(p, t);
    const wasSide = this.sideView;
    this.decideView(sf !== null, vr);
    if (wasSide !== null && this.sideView !== wasSide) {
      // The other reading has its own primary: like a side switch, whatever was in progress is dropped and the next
      // rep needs a top first.
      this.ema = null;
      if (this._phase === "descending" || this._phase === "down" || this._phase === "up") {
        this._phase = "up";
        this.armed = false;
      }
      if (this._phase === "setup") this.setupSince = null;
    }
    const side = this.sideView !== false;
    let f: RepFeatures | null;
    if (side) {
      if (this.switched) this.ema = null; // the other arm or leg has its own angle history
      if (this.switched && (this._phase === "descending" || this._phase === "down" || this._phase === "up")) {
        // The other arm or leg has its own angle and position: whatever was in progress on the old side is dropped,
        // and the new side has to show a top before a rep can start (it may be caught mid-bend).
        this._phase = "up";
        this.armed = false;
      }
      f = sf;
    } else f = vr.f;
    const active = this._phase === "up" || this._phase === "descending" || this._phase === "down";
    if (!f) {
      if (this.lastOkT === null || t - this.lastOkT > LOST_MS) {
        if (active) {
          this._phase = "lost";
          this.ema = null;
          this.lastFault = null;
          this.forgetTop();
          ev.push({ type: "lost", t });
        }
        this.setupSince = null;
      }
      return ev;
    }
    if (this.lastOkT !== null && t - this.lastOkT > LOST_MS) this.ema = null; // stale smoothing after a gap
    this.lastOkT = t;
    // Side reading: the read wrist / ankle jumping more than ANCHOR_JUMP limbs in one sample is a left/right label
    // swap (the far side's landmark under this side's name), dropped like an angle flip (at most SPIKE_FRAMES).
    if (side && this.ema !== null && this.spikes < SPIKE_FRAMES) {
      const dx = f.anchorX - this.okAnchorX, dy = f.anchorY - this.okAnchorY, lim = ANCHOR_JUMP * f.limb;
      if (dx * dx + dy * dy > lim * lim) {
        this.spikes += 1;
        return ev;
      }
    }
    const a = this.smooth(f.primary, t);
    if (a === null) return ev; // landmark flip dropped
    this.okAnchorX = f.anchorX;
    this.okAnchorY = f.anchorY;
    const fs: RepFeatures = { ...f, primary: a };
    const r = this.gates;

    if (this._phase === "lost") {
      this._phase = "setup";
      this.setupSince = null;
      this.resume = true;
    }
    if (this._phase === "setup") {
      if (r.startPose(fs) && r.topFault(fs) === null) {
        this.setupSince ??= t;
        this.lastFault = null;
        if (t - this.setupSince >= (this.resume ? RESUME_HOLD_MS : r.startHoldMs)) {
          this._phase = "up";
          this.armed = true;
          this.resume = false;
          ev.push({ type: "ready", t });
        }
      } else {
        this.setupSince = null;
        // The top check is a hint only with the arms or legs straight: mid-rep (e.g. coming back from a pause) the
        // wrist is legitimately less far below the shoulder, so a bent sample neither raises nor clears it.
        const x = r.fault(fs);
        if (x || a > r.top) this.noteFault(x ?? r.topFault(fs), t, ev);
      }
      return ev;
    }
    if (this._phase === "up") {
      if (!this.armed) {
        if (a > r.top) this.armed = true;
      } else if (a < r.start) {
        this._phase = "descending";
        this.startRep(t);
        this.track(fs, t, ev);
      }
      return ev;
    }

    // descending or down: a rep is in progress.
    this.track(fs, t, ev);
    if (a > r.top) {
      this.finish(t, ev);
      this._phase = "up";
    } else if (t - this.repStart > r.maxRepMs) {
      ev.push({ type: "fault", fault: "too_slow", t });
      this.resetToSetup();
    } else {
      if (this._phase === "down") {
        // Came back up past the start line and down to the bottom again without locking out: the first dip was
        // not a rep, the second one starts a new rep where it crossed the start line. Only a real second bottom
        // counts as a dip, so a flicker around the start line can't reject a good rep.
        if (a > r.start) {
          this.rose = true;
          this.redipT = null;
        } else if (this.rose) {
          this.redipT ??= t;
          if (a < r.bottom) {
            ev.push({ type: "fault", fault: "no_lockout", t });
            this.startRep(this.redipT);
            this.track(fs, t, ev);
          }
        }
      }
      if (this._phase === "descending" && a < r.bottom) this._phase = "down";
    }
    return ev;
  }

  /** The rules of the reading in use. */
  private get gates(): Readonly<RepGates> { return this.sideView === false ? this.v : this.r; }

  /** Picks the side to read (hysteresis) and returns its features, or null when the sample is unusable. */
  private read(p: readonly number[]): RepFeatures | null {
    const score: [number, number] = [this.sideScore(p, 0), this.sideScore(p, 1)];
    let side: Side = this._side ?? (score[1] > score[0] ? 1 : 0);
    const other: Side = side === 0 ? 1 : 0;
    this.switched = false;
    // The other side is better: clearly more visible, or usable while this one isn't. Switch only when that lasts
    // SIDE_SWITCH_SAMPLES samples in a row (a short flicker leaves the rep alone; meanwhile an unusable current side
    // reads as no pose). The first sample just takes the better side.
    const better = score[other] >= VIS_MIN && (score[other] > score[side] + SIDE_MARGIN || score[side] < VIS_MIN);
    this.sideStreak = better ? this.sideStreak + 1 : 0;
    if (better && (this._side === null || this.sideStreak >= SIDE_SWITCH_SAMPLES)) {
      side = other;
      this.switched = this._side !== null;
      this.sideStreak = 0;
    }
    this._side = side;
    if (score[side] < VIS_MIN) return null;
    const f = this.r.features(p, side, this.aspect);
    for (const k in f) if (!Number.isFinite(f[k as keyof RepFeatures])) return null;
    return f.limb > 0 ? f : null;
  }

  /** The weakest needed joint's visibility, 0 when one is out of frame: one bad joint breaks the angle. */
  private sideScore(p: readonly number[], side: Side): number {
    let min = 100;
    for (const j of this.r.needed) {
      const x = at(p, side, j, 0), y = at(p, side, j, 1), v = at(p, side, j, 2);
      const s = inFrame(x, y) ? v : 0;
      if (s < min) min = s;
    }
    return min;
  }

  /**
   * The vertical reading of a sample: updates the scale and the calibrated top, and returns the features (null when
   * the joints it needs aren't seen) and the view measure (the smoothed hip spread over the scale, −1 when a hip
   * isn't seen).
   */
  private readVertical(p: readonly number[], t: number): { f: RepFeatures | null; spread: number } {
    const A = this.aspect, push = this.exercise === "pushup", v = this.v;
    const lr = this.lr;
    const sh = level(p, "shoulder", A, lr), hip = level(p, "hip", A, lr), an = level(p, "ankle", A, lr);
    const top = push ? sh : hip, bottom = push ? level(p, "wrist", A, lr) : an; // the gap: top joint above bottom joint
    const lm = push ? limbs(p, "shoulder", "elbow", "wrist", v.straight, A) : limbs(p, "hip", "knee", "ankle", v.straight, A);
    const none = { f: null, spread: -1 };
    const seen = top.n > 0 && bottom.n > 0;
    const gap = seen ? bottom.y - top.y : 0;
    // Calibration: CAL_SAMPLES in a row with the limbs straight and vertical give a candidate top (their median). A
    // higher one replaces the top; a lower one pulls it down slowly (CAL_FOLLOW). Only straight, vertical limbs
    // count, so a half rep never calibrates.
    const calOk = seen && lm.straight && gap > 0 && gap >= v.upright * lm.length;
    this.cal.push(calOk ? gap : -1);
    if (this.cal.length > CAL_SAMPLES) this.cal.shift();
    if (this.cal.length === CAL_SAMPLES && this.cal[0]! >= 0 && this.cal[1]! >= 0 && this.cal[2]! >= 0) {
      const cand = median3(this.cal[0]!, this.cal[1]!, this.cal[2]!);
      // Before counting (setup) the top just follows the person (they may walk to the mat, nothing counts yet).
      if (this.vref === null || cand > this.vref || this._phase === "setup") this.vref = cand;
      else if (cand >= CAL_FOLLOW_MIN * this.vref) this.vref -= (this.vref - cand) * CAL_FOLLOW;
    }
    if (!seen) return none;
    if (gap > 0) {
      const decayed = this.vscale * expNeg((t - this.vscaleT) / VIEW_SCALE_TAU_MS);
      this.vscale = gap > decayed ? gap : decayed;
      this.vscaleT = t;
    }
    const ref = this.vref ?? this.vscale;
    if (!(ref > 0)) return none;
    // The view: the hips' horizontal spread over the scale, smoothed (VIEW_SPREAD_TAU_MS). The hips sit near the
    // middle of the frame in both exercises, so perspective barely spreads them side-on (the shoulders of a push-up,
    // near the frame's edge, can read wide from the pure side and narrow 20° off it).
    let spread = -1;
    const hipSpread = this.viewSpread(p);
    if (hipSpread >= 0) {
      const s = hipSpread / ref;
      this.vspread = this.vspread < 0 ? s : this.vspread + (1 - expNeg((t - this.vspreadT) / VIEW_SPREAD_TAU_MS)) * (s - this.vspread);
      this.vspreadT = t;
      spread = this.vspread;
    }
    if (hip.n === 0 || (!push && sh.n === 0)) return { f: null, spread };
    // The anchor midpoint through a 3-sample median within a run of samples read from the same number of sides (a
    // landmark jumping for a frame moves a one-side midpoint by its whole jump).
    if (bottom.n !== this.ancN) this.ancHist.length = 0;
    this.ancN = bottom.n;
    this.ancHist.push(bottom.x, bottom.y);
    if (this.ancHist.length > 6) this.ancHist.splice(0, 2);
    const ah = this.ancHist, am = ah.length === 6;
    const ax = am ? median3(ah[0]!, ah[2]!, ah[4]!) : bottom.x, ay = am ? median3(ah[1]!, ah[3]!, ah[5]!) : bottom.y;
    // The anchors' left–right spread (wrists / ankles), both seen and not side-on: hands or feet moving towards or
    // away from the camera change it, which the boxes can't see head-on. Through a 3-sample median, so one landmark
    // jumping for a frame doesn't look like a hand moving.
    this.spreads.push(bottom.spread >= SPREAD_MIN * ref ? bottom.spread : -1);
    if (this.spreads.length > 3) this.spreads.shift();
    const sp = this.spreads.length === 3 && this.spreads[0]! >= 0 && this.spreads[1]! >= 0 && this.spreads[2]! >= 0
      ? median3(this.spreads[0]!, this.spreads[1]!, this.spreads[2]!) : -1;
    // The elbow bend through a 3-sample median too: a guessed far arm can read bent for a frame.
    this.bends.push(lm.bend);
    if (this.bends.length > 3) this.bends.shift();
    const bend = this.bends.length === 3 ? median3(this.bends[0]!, this.bends[1]!, this.bends[2]!) : 180;
    const ext = gap / ref;
    const primary = ext <= 0 ? 0 : ext >= 1 ? 180 : 180 * ext;
    let f: RepFeatures;
    if (push) {
      const dx = bottom.x - top.x;
      // Hip height above the floor under it (the line from the wrists to the ankles, ~40% of the way to the feet),
      // relative to the shoulder's height above the wrists.
      const hipRel = an.n > 0 && gap > 0 ? (bottom.y + (an.y - bottom.y) * 0.4 - hip.y) / gap : -1;
      // The 2D shoulder–hip–ankle angle through the midpoints, only when the body is not end-on (V_PUSHUP_LINE_SPAN).
      let bodyLine = 180;
      if (an.n > 0) {
        const ux = top.x - hip.x, uy = top.y - hip.y, wx = an.x - hip.x, wy = an.y - hip.y;
        const lu = Math.sqrt(ux * ux + uy * uy), lw = Math.sqrt(wx * wx + wy * wy);
        if (lu >= 0.4 * ref && lw >= 0.4 * ref && lu + lw >= V_PUSHUP_LINE_SPAN * ref) {
          const cross = ux * wy - uy * wx;
          bodyLine = atanDeg(cross < 0 ? -cross : cross, ux * wx + uy * wy);
        }
      }
      f = {
        primary, bodyLine, incline: 0, depth: 0, limb: ref, dropY: top.y, anchorX: ax, anchorY: ay,
        reach: ext, offset: (dx < 0 ? -dx : dx) / ref, hipY: hip.y, spread: sp, bend,
        straight: lm.straight ? 1 : 0, upright: lm.length > 0 ? gap / lm.length : 0,
        torso: (hip.y - top.y) / ref, feet: an.n > 0 ? (an.y - top.y) / ref : -1, hipRel,
      };
    } else {
      const kn = level(p, "knee", A, lr);
      const dx = hip.x - an.x;
      f = {
        primary, bodyLine: 180, incline: 0, depth: kn.n > 0 ? (hip.y - kn.y) / (0.5 * ref) : 0, limb: ref, dropY: hip.y,
        anchorX: ax, anchorY: ay, reach: 0, offset: (dx < 0 ? -dx : dx) / ref, hipY: hip.y, spread: sp, bend: 180,
        straight: lm.straight ? 1 : 0, upright: lm.length > 0 ? gap / lm.length : 0,
        torso: (hip.y - sh.y) / ref, feet: 0, hipRel: 0,
      };
    }
    return { f, spread };
  }

  /**
   * Side or vertical reading, with hysteresis: the hips' horizontal spread over the vertical scale (smoothed) must
   * stay past the other threshold for VIEW_SWITCH_SAMPLES samples; back into the side reading only in setup. Without
   * both hips seen there is no evidence and the view stays; the very first decision without it is the side reading
   * (one side is all there is).
   */
  private decideView(sideUsable: boolean, vr: { f: RepFeatures | null; spread: number }): void {
    const v = this.v, s = vr.spread;
    if (this.sideView === null) {
      if (s >= 0) this.sideView = s < (v.sideIn + v.sideOut) / 2;
      else if (sideUsable || vr.f) this.sideView = true;
      this.front = s > v.frontMin;
      return;
    }
    if (s < 0) return;
    // Into the side reading only before counting starts: once counting in the vertical reading, a turn through a
    // side view keeps it (it works there too) instead of dropping a rep at each switch.
    const want = this.sideView ? s > v.sideOut : s < v.sideIn && this._phase === "setup";
    this.viewStreak = want ? this.viewStreak + 1 : 0;
    if (this.viewStreak >= VIEW_SWITCH_SAMPLES) {
      this.sideView = !this.sideView;
      this.viewStreak = 0;
    }
    // Front or oblique is only a label for the UI (both use the vertical reading).
    if (this.front ? s < v.frontMin - 0.03 : s > v.frontMin + 0.03) this.front = !this.front;
  }

  /** The hips' horizontal spread for judging the view, −1 unless both are seen with VIEW_VIS_MIN (a guessed far
   *  hip, too uncertain to count with, still sits where the body puts it). */
  private viewSpread(p: readonly number[]): number {
    for (const s of [0, 1] as const) {
      const x = at(p, s, "hip", 0), y = at(p, s, "hip", 1);
      if (!(at(p, s, "hip", 2) >= VIEW_VIS_MIN && inFrame(x, y))) return -1;
    }
    const dx = (at(p, 0, "hip", 0) - at(p, 1, "hip", 0)) * this.aspect;
    return dx < 0 ? -dx : dx;
  }

  /** After a loss or a feed gap the person may be elsewhere: calibrate the top again. */
  private forgetTop(): void {
    this.vref = null;
    this.ancHist.length = 0;
    this.cal.length = 0;
    this.spreads.length = 0;
    this.bends.length = 0;
  }

  private smooth(x: number, t: number): number | null {
    if (this.ema === null) {
      this.ema = x;
      this.emaT = t;
      this.lastRaw = x;
      this.spikes = 0;
      return x;
    }
    // A flip is judged against both the smoothed angle and the last raw angle believed: the smoothed one lags a
    // fast movement, so a flip against the direction of travel can sit under SPIKE_DEG from it alone.
    const d = x - this.ema, j = x - this.lastRaw;
    if ((d > SPIKE_DEG || d < -SPIKE_DEG || j > SPIKE_DEG || j < -SPIKE_DEG) && this.spikes < SPIKE_FRAMES) {
      this.spikes += 1;
      return null;
    }
    this.spikes = 0;
    this.lastRaw = x;
    this.ema += (1 - expNeg((t - this.emaT) / EMA_TAU_MS)) * d;
    this.emaT = t;
    return this.ema;
  }

  private resetToSetup(): void {
    this._phase = "setup";
    this.setupSince = null;
    this.ema = null;
    this.lastOkT = null;
    this.lastFault = null;
  }

  private startRep(t: number): void {
    this.repStart = t;
    this.minAngle = 180;
    this.minT = t;
    this.minDepth = 0;
    this.rose = false;
    this.redipT = null;
    this.frames = 0;
    this.faults.clear();
  }

  private track(f: RepFeatures, t: number, ev: RepEvent[]): void {
    if (this.frames === 0) {
      this.topY = f.dropY;
      this.bottomY = f.dropY;
      this.hipTopY = f.hipY;
      this.hipBottomY = f.hipY;
      this.maxLimb = f.limb;
      this.anchorMinX = this.anchorMaxX = f.anchorX;
      this.anchorMinY = this.anchorMaxY = f.anchorY;
      this.vbox[0] = this.vbox[1] = null;
      this.spreadMin = this.spreadMax = f.spread;
      this.minBend = f.bend;
    }
    this.frames += 1;
    this.last = f;
    if (f.primary < this.minAngle) {
      this.minAngle = f.primary;
      this.minT = t;
      this.minDepth = f.depth;
      this.bottomY = f.dropY;
      this.hipBottomY = f.hipY;
    }
    if (f.dropY < this.topY) this.topY = f.dropY;
    if (f.hipY < this.hipTopY) this.hipTopY = f.hipY;
    if (f.limb > this.maxLimb) this.maxLimb = f.limb;
    if (f.anchorX < this.anchorMinX) this.anchorMinX = f.anchorX;
    if (f.anchorX > this.anchorMaxX) this.anchorMaxX = f.anchorX;
    if (f.anchorY < this.anchorMinY) this.anchorMinY = f.anchorY;
    if (f.anchorY > this.anchorMaxY) this.anchorMaxY = f.anchorY;
    if (this.sideView === false) {
      const k = this.ancN === 2 ? 1 : 0, b = this.vbox[k], x = f.anchorX, y = f.anchorY;
      if (b === null) this.vbox[k] = [x, x, y, y];
      else {
        if (x < b[0]) b[0] = x;
        if (x > b[1]) b[1] = x;
        if (y < b[2]) b[2] = y;
        if (y > b[3]) b[3] = y;
      }
    }
    if (f.bend < this.minBend) this.minBend = f.bend;
    if (f.spread >= 0) {
      if (this.spreadMin < 0 || f.spread < this.spreadMin) this.spreadMin = f.spread;
      if (f.spread > this.spreadMax) this.spreadMax = f.spread;
    }
    const x = this.gates.fault(f);
    if (x) this.faults.set(x, (this.faults.get(x) ?? 0) + 1);
    this.noteFault(x, t, ev);
  }

  /** Fires a fault event when a fault starts, not on every sample it lasts. */
  private noteFault(x: RepFault | null, t: number, ev: RepEvent[]): void {
    if (x && x !== this.lastFault) ev.push({ type: "fault", fault: x, t });
    this.lastFault = x;
  }

  /** Why the finished rep doesn't count, or null when it does. */
  private reject(): RepFault | null {
    const r = this.gates;
    const top = this.last ? r.topFault(this.last) : null;
    if (top) return top;
    const drop = this.bottomY - this.topY;
    if (drop < r.dropMin * this.maxLimb) return r.dropFault;
    if (this.hipBottomY - this.hipTopY < r.hipDropMin * drop) return "hips";
    const room = r.anchorMax * this.maxLimb;
    if (this.sideView === false) {
      // Vertical reading: the one-side and both-sides boxes of the anchor midpoint (see vbox).
      for (const b of this.vbox) {
        if (b === null) continue;
        const mx = b[1] - b[0], my = b[3] - b[2];
        if (mx * mx + my * my > room * room) return r.anchorFault;
      }
    } else {
      const mx = this.anchorMaxX - this.anchorMinX, my = this.anchorMaxY - this.anchorMinY;
      if (mx * mx + my * my > room * room) return r.anchorFault;
    }
    // Both anchors seen: their spread changes when the hands or feet move towards or away from the camera, which
    // the box can't see from the front.
    if (r.spreadMax > 0 && this.spreadMin >= 0 && this.spreadMax - this.spreadMin > r.spreadMax * this.maxLimb) return r.anchorFault;
    // Push-up, vertical: the arms must visibly bend at some point (a straight arm projects straight from any angle);
    // shoulders that go down on straight arms are hands walking away (an inchworm).
    if (this.minBend >= r.bendMax) return r.anchorFault;
    if (r.depthMin !== null && this.minDepth < r.depthMin) return "depth";
    // All form faults together against the share (a rep half not_plank and half hips is out of form); the most
    // frequent one (the first seen on a tie) names it.
    let worst: RepFault | null = null;
    let worstN = 0;
    let total = 0;
    for (const [fault, n] of this.faults) {
      total += n;
      if (n > worstN) { worst = fault; worstN = n; }
    }
    return worst && total > FAULT_SHARE * this.frames ? worst : null;
  }

  private finish(t: number, ev: RepEvent[]): void {
    const r = this.gates;
    if (this._phase === "descending") {
      ev.push({ type: "half_rep", t });
      return;
    }
    if (t - this.repStart < r.minRepMs) {
      ev.push({ type: "fault", fault: "too_fast", t });
      return;
    }
    const why = this.reject();
    if (why) {
      ev.push({ type: "fault", fault: why, t });
      return;
    }
    this._count += 1;
    const rep: RepTiming = { startT: this.repStart, bottomT: this.minT, endT: t };
    this._reps.push(rep);
    ev.push({ type: "rep", n: this._count, ...rep });
    if (r.depthMin !== null) {
      const shallow = r.shallow(this.minAngle, this.minDepth);
      if (shallow && !this.depthAdvised) ev.push({ type: "fault", fault: "depth", t });
      this.depthAdvised = shallow;
    }
  }
}

// ── Trace: what the phone records and the server recounts ──

/** At most this many pause windows per trace (a set has one freeze; the rest is headroom). */
export const MAX_PAUSES = 16;

/**
 * t: integer ms, strictly increasing. p: SAMPLE_INTS integers per sample (36 zeros when no pose was seen).
 * pauses: at most MAX_PAUSES [from, to] windows, inclusive at both ends, sorted and non-overlapping (each starts
 * after the previous one ends); samples inside one were recorded but not counted.
 */
export type Trace = {
  v: 1;
  engine: typeof REPS_ENGINE;
  exercise: Exercise;
  aspect: number;
  t: number[];
  p: number[];
  pauses: [number, number][];
};

/** Replays RepCounter over the trace's samples outside the pause windows (sorted, disjoint: one forward pointer). */
function replay(trace: Trace, each?: (c: RepCounter, ev: RepEvent[]) => void): RepCounter {
  const c = new RepCounter(trace.exercise, trace.aspect);
  const { pauses } = trace;
  let k = 0;
  for (let i = 0; i < trace.t.length; i++) {
    const t = trace.t[i]!;
    while (k < pauses.length && pauses[k]![1] < t) k++;
    if (k < pauses.length && t >= pauses[k]![0]) continue;
    const ev = c.push({ t, p: trace.p.slice(i * SAMPLE_INTS, (i + 1) * SAMPLE_INTS) });
    each?.(c, ev);
  }
  return c;
}

/** Replays RepCounter over a trace, skipping the pause windows: the same count the phone showed. */
export function countReps(trace: Trace): { count: number; reps: RepTiming[] } {
  const c = replay(trace);
  return { count: c.count, reps: [...c.reps] };
}

export type TraceDigest = {
  count: number;
  reps: RepTiming[];
  /** Every fault event, in order. */
  faults: RepFault[];
  /** Samples pushed (outside the pauses). */
  samples: number;
  /** FNV-1a 32 (hex) over the IEEE-754 bytes (little-endian) of the smoothed angle after each pushed sample,
   *  8 bytes of 0xff for null. Equal digests mean the engines agreed on every angle to the last bit. */
  angleHash: string;
};

/** countReps plus a bit-exact fingerprint of the replay, for golden vectors run on V8 and on Hermes. */
export function traceDigest(trace: Trace): TraceDigest {
  const faults: RepFault[] = [];
  const view = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  let samples = 0;
  const c = replay(trace, (counter, ev) => {
    samples += 1;
    for (const e of ev) if (e.type === "fault") faults.push(e.fault);
    const angle = counter.angle;
    if (angle === null) {
      view.setUint32(0, 0xffffffff, true);
      view.setUint32(4, 0xffffffff, true);
    } else view.setFloat64(0, angle, true);
    for (let b = 0; b < 8; b++) h = Math.imul(h ^ view.getUint8(b), 0x01000193) >>> 0;
  });
  return { count: c.count, reps: [...c.reps], faults, samples, angleHash: h.toString(16).padStart(8, "0") };
}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/**
 * Checks a trace from the wire and returns it typed, or null when it is malformed. Bounds are deliberately loose
 * (structure, integers, ordering); plausibility checks such as duration and gaps belong to the caller.
 */
export function parseTrace(raw: unknown, maxSamples = 20_000): Trace | null {
  if (typeof raw !== "object" || raw === null) return null;
  const tr = raw as Record<string, unknown>;
  const { t, p, pauses, aspect, exercise } = tr;
  if (tr.v !== 1 || tr.engine !== REPS_ENGINE || (exercise !== "pushup" && exercise !== "squat")) return null;
  if (typeof aspect !== "number" || !(aspect >= 0.2 && aspect <= 5)) return null;
  if (!Array.isArray(t) || !Array.isArray(p) || !Array.isArray(pauses)) return null;
  if (t.length > maxSamples || p.length !== t.length * SAMPLE_INTS || pauses.length > MAX_PAUSES) return null;
  for (let i = 0; i < t.length; i++) {
    const ti: unknown = t[i];
    if (!isInt(ti) || ti < 0 || (i > 0 && ti <= (t[i - 1] as number))) return null;
  }
  for (let i = 0; i < p.length; i++) {
    const v: unknown = p[i];
    if (!isInt(v)) return null;
    if (i % 3 === 2 ? v < 0 || v > 100 : v < -10_000 || v > 10_000) return null;
  }
  let prevEnd = -1;
  for (const w of pauses as unknown[]) {
    if (!Array.isArray(w) || w.length !== 2 || !isInt(w[0]) || !isInt(w[1]) || w[1] < w[0] || w[0] <= prevEnd) return null;
    prevEnd = w[1];
  }
  return { v: 1, engine: REPS_ENGINE, exercise, aspect, t: t as number[], p: p as number[], pauses: pauses as [number, number][] };
}
