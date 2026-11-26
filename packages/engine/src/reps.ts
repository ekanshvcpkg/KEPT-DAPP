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
/** A form fault on more than this share of a rep's samples rejects the rep. */
export const FAULT_SHARE = 0.25;
/** Landmarks a little outside the frame are still plausible; further out the joint is guessed. */
const FRAME_SLACK = 20;
/** Push-up top (start pose and the end of every rep): the wrist is more than this many upper-arm lengths below the
 *  shoulder (a straight arm under the shoulder reads 1.6–2; lying on the belly with the arms forward reads about 1). */
export const PUSHUP_REACH_MIN = 1.2;
/** Push-up top: the wrist is at most this many upper-arm lengths in front of or behind the shoulder (under it). */
export const PUSHUP_OFFSET_MAX = 0.8;
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
  /** The counted joint angle (elbow / knee), degrees. */
  primary: number;
  /** Push-up shoulder–hip–ankle angle, degrees (180 for squats). */
  bodyLine: number;
  /** Push-up shoulder–ankle line / squat hip–shoulder line against the horizontal, degrees. */
  incline: number;
  /** Squat: hip height relative to the knee in thigh lengths, > 0 below the knee (0 for push-ups). */
  depth: number;
  /** The reference limb (upper arm / thigh), aspect-corrected thousandths of the frame height. */
  limb: number;
  /** Image y (thousandths, down) of the joint that has to drop: shoulder / hip. */
  dropY: number;
  /** Aspect-corrected position of the joint that has to stay planted: wrist / ankle. */
  anchorX: number;
  anchorY: number;
  /** Push-up: how far the wrist is below the shoulder, in upper-arm lengths (0 for squats). */
  reach: number;
  /** Push-up: how far the wrist is in front of or behind the shoulder, in upper-arm lengths, ≥ 0 (0 for squats). */
  offset: number;
  /** Image y (thousandths, down) of the hip. */
  hipY: number;
};

export type RepRules = {
  /** Joints the angles need; the side score is the weakest of them. */
  needed: readonly Joint[];
  /** A rep starts below this angle, reaches the bottom below `bottom` and counts above `top`. */
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
  features(p: readonly number[], side: Side, aspect: number): RepFeatures;
  /** The start pose (held startHoldMs, or RESUME_HOLD_MS after a gap, before counting); topFault must also be null. */
  startPose(f: RepFeatures): boolean;
  /** Checked on the start pose and on the last sample of every rep (the top): a fault there rejects. Includes `fault`. */
  topFault(f: RepFeatures): RepFault | null;
  /** Per-sample form fault: a hint, and it rejects a rep when it lasts more than FAULT_SHARE of it. */
  fault(f: RepFeatures): RepFault | null;
};

export const RULES: Record<Exercise, Readonly<RepRules>> = {
  pushup: {
    needed: ["shoulder", "elbow", "wrist", "hip", "ankle"],
    start: 130, bottom: 90, top: 155, minRepMs: 600, maxRepMs: 8_000, startHoldMs: 500,
    dropMin: 0.5, dropFault: "no_shoulder_drop", hipDropMin: PUSHUP_HIP_DROP_MIN,
    anchorMax: 0.5, anchorFault: "hands_not_planted",
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
    anchorMax: 0.5, anchorFault: "feet_not_planted",
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
      };
    },
    // Standing tall with the torso near vertical (lying down and bending the knees never starts).
    startPose: (f) => f.primary > RULES.squat.top && f.incline >= 65,
    topFault: (f) => RULES.squat.fault(f),
    fault: (f) => (f.incline < 30 ? "lean" : null),
  },
};

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
 * counter switches to the other side mid-rep (SIDE_SWITCH_SAMPLES), the rep is abandoned silently and the next one
 * starts only after that side has been at the top.
 */
export class RepCounter {
  readonly exercise: Exercise;
  readonly aspect: number;
  private readonly r: Readonly<RepRules>;
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
  // The box the anchor stayed in during the rep.
  private anchorMinX = 0;
  private anchorMaxX = 0;
  private anchorMinY = 0;
  private anchorMaxY = 0;
  private last: RepFeatures | null = null;

  /** aspect = analysis frame width / height (the onPose `w / h`); the trace stores the same number. */
  constructor(exercise: Exercise, aspect: number) {
    this.exercise = exercise;
    this.aspect = aspect;
    this.r = RULES[exercise];
  }

  get count(): number { return this._count; }
  /** The smoothed primary angle (elbow or knee) in degrees, for a depth gauge; null before a usable sample. */
  get angle(): number | null { return this.ema; }
  get phase(): RepPhase { return this._phase; }
  /** Which side the counter is reading, for a framing hint. */
  get side(): "left" | "right" | null { return this._side === null ? null : this._side === 0 ? "left" : "right"; }
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
    }
    this.lastPushT = t;

    const f = this.read(sample.p);
    if (this.switched && (this._phase === "descending" || this._phase === "down" || this._phase === "up")) {
      // The other arm or leg has its own angle and position: whatever was in progress on the old side is dropped,
      // and the new side has to show a top before a rep can start (it may be caught mid-bend).
      this._phase = "up";
      this.armed = false;
    }
    const active = this._phase === "up" || this._phase === "descending" || this._phase === "down";
    if (!f) {
      if (this.lastOkT === null || t - this.lastOkT > LOST_MS) {
        if (active) {
          this._phase = "lost";
          this.ema = null;
          this.lastFault = null;
          ev.push({ type: "lost", t });
        }
        this.setupSince = null;
      }
      return ev;
    }
    if (this.lastOkT !== null && t - this.lastOkT > LOST_MS) this.ema = null; // stale smoothing after a gap
    this.lastOkT = t;
    const a = this.smooth(f.primary, t);
    if (a === null) return ev; // landmark flip dropped
    const fs: RepFeatures = { ...f, primary: a };
    const r = this.r;

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

  /** Picks the side to read (hysteresis) and returns its features, or null when the sample is unusable. */
  private read(raw: readonly number[]): RepFeatures | null {
    const p = raw.length === SAMPLE_INTS ? raw : ZERO_SAMPLE;
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
      this.ema = null; // the other arm or leg has its own angle history
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
      const inFrame = x >= -FRAME_SLACK && x <= 1000 + FRAME_SLACK && y >= -FRAME_SLACK && y <= 1000 + FRAME_SLACK;
      const s = inFrame ? v : 0;
      if (s < min) min = s;
    }
    return min;
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
    const x = this.r.fault(f);
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
    const r = this.r;
    const top = this.last ? r.topFault(this.last) : null;
    if (top) return top;
    const drop = this.bottomY - this.topY;
    if (drop < r.dropMin * this.maxLimb) return r.dropFault;
    if (this.hipBottomY - this.hipTopY < r.hipDropMin * drop) return "hips";
    const mx = this.anchorMaxX - this.anchorMinX, my = this.anchorMaxY - this.anchorMinY, room = r.anchorMax * this.maxLimb;
    if (mx * mx + my * my > room * room) return r.anchorFault;
    if (this.exercise === "squat" && this.minDepth < SQUAT_DEPTH_MIN) return "depth";
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
    if (this._phase === "descending") {
      ev.push({ type: "half_rep", t });
      return;
    }
    if (t - this.repStart < this.r.minRepMs) {
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
    if (this.exercise === "squat") {
      const shallow = this.minDepth < SQUAT_DEPTH_HINT;
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
