import { readFileSync, writeFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { JOINTS, MAX_PAUSES, RepCounter, SAMPLE_INTS, countReps, parseRepHabit, parseTrace, repHabitText, traceDigest } from "./reps";
import type { Exercise, RepEvent, RepSample, Trace } from "./reps";
import * as V from "./reps3d.fixtures";

// ── Synthetic poses ──
// Each builder places the 12 JOINTS for a given joint angle and returns the 36-int sample the native view emits
// (x·1000, y·1000, visibility·100). Geometry is done in aspect-corrected units (X = x·aspect, Y = y) so the angle
// in the picture is the angle asked for.

type P = { x: number; y: number }; // normalised image coords, y down (the frame is gravity-aligned: y is "down")
type Vis = { left: number; right: number }; // 0..1
// The native view rotates every frame upright, so the aspect follows how the phone is held: on its side for
// push-ups (a 640×480 upright frame, w/h = 4/3), standing up for squats (480×640, w/h = 3/4). All push-up fixtures
// use LANDSCAPE and all squat fixtures PORTRAIT.
const LANDSCAPE = 4 / 3;
const PORTRAIT = 3 / 4;

const deg = (d: number) => (d * Math.PI) / 180;

function encode(left: P[], right: P[], vis: Vis): number[] {
  // left/right: [shoulder, elbow, wrist, hip, knee, ankle]; JOINTS interleaves them left, right.
  const out: number[] = [];
  for (let j = 0; j < 6; j++) {
    for (const [pts, v] of [[left, vis.left], [right, vis.right]] as const) {
      out.push(Math.round(pts[j]!.x * 1000), Math.round(pts[j]!.y * 1000), Math.round(v * 100));
    }
  }
  return out;
}

/** Side-on plank on the floor, head left: wrist under the shoulder, elbow bending towards the feet. */
function plankLimb(elbowDeg: number, sag: number, aspect: number): P[] {
  const arm = 0.14; // upper arm = forearm, in Y units
  const wrist = { x: 0.3, y: 0.85 };
  const d = 2 * arm * Math.sin(deg(elbowDeg) / 2); // shoulder–wrist distance
  const shoulder = { x: wrist.x, y: wrist.y - d };
  const h = Math.sqrt(Math.max(0, arm * arm - (d / 2) * (d / 2)));
  const elbow = { x: wrist.x + h / aspect, y: wrist.y - d / 2 };
  const ankle = { x: 0.9, y: 0.85 };
  const hip = { x: (shoulder.x + ankle.x) / 2, y: (shoulder.y + ankle.y) / 2 + sag };
  const knee = { x: (hip.x + ankle.x) / 2, y: (hip.y + ankle.y) / 2 };
  return [shoulder, elbow, wrist, hip, knee, ankle];
}

function pushupSample(elbowDeg: number, o: { vis?: Vis; sag?: number; rightDeg?: number } = {}): number[] {
  const vis = o.vis ?? { left: 0.95, right: 0.3 };
  return encode(plankLimb(elbowDeg, o.sag ?? 0, LANDSCAPE), plankLimb(o.rightDeg ?? elbowDeg, o.sag ?? 0, LANDSCAPE), vis);
}

/** Standing side-on, arm hanging and curling forward: elbow angles like a push-up, but the body is vertical. */
function curlSample(elbowDeg: number): number[] {
  const A = LANDSCAPE, fore = 0.13;
  const shoulder = { x: 0.5, y: 0.3 }, elbow = { x: 0.5, y: 0.45 };
  const r = deg(180 - elbowDeg); // forearm swings forward (+x) from straight down
  const wrist = { x: elbow.x + (fore * Math.sin(r)) / A, y: elbow.y + fore * Math.cos(r) };
  const limb = [shoulder, elbow, wrist, { x: 0.5, y: 0.55 }, { x: 0.5, y: 0.72 }, { x: 0.5, y: 0.9 }];
  return encode(limb, limb, { left: 0.95, right: 0.3 });
}

/** Standing side-on facing +x: shin leaning forward (10° unless given), knee angle as given, torso leaning more as the squat deepens. */
function squatLimb(kneeDeg: number, torsoLean?: number, shinLean = 10): P[] {
  const A = PORTRAIT, shin = 0.22, thigh = 0.22, torso = 0.3, lam = deg(shinLean);
  const toP = (X: number, Y: number): P => ({ x: X / A, y: Y });
  const ankle = { X: 0.45 * A, Y: 0.9 };
  const knee = { X: ankle.X + shin * Math.sin(lam), Y: ankle.Y - shin * Math.cos(lam) };
  const u = { X: -Math.sin(lam), Y: Math.cos(lam) }; // knee → ankle
  const th = deg(kneeDeg); // rotate knee→ankle by the knee angle to point knee→hip (backwards and up)
  const hip = { X: knee.X + thigh * (u.X * Math.cos(th) - u.Y * Math.sin(th)), Y: knee.Y + thigh * (u.X * Math.sin(th) + u.Y * Math.cos(th)) };
  const lean = deg(torsoLean ?? 5 + (35 * Math.max(0, 180 - kneeDeg)) / 90); // from vertical
  const shoulder = { X: hip.X + torso * Math.sin(lean), Y: hip.Y - torso * Math.cos(lean) };
  const elbow = { X: shoulder.X + 0.1, Y: shoulder.Y + 0.1 }, wrist = { X: shoulder.X + 0.2, Y: shoulder.Y + 0.1 };
  return [shoulder, elbow, wrist, hip, knee, ankle].map((q) => toP(q.X, q.Y));
}

function squatSample(kneeDeg: number, torsoLean?: number, shinLean?: number): number[] {
  const l = squatLimb(kneeDeg, torsoLean, shinLean);
  return encode(l, l, { left: 0.3, right: 0.9 }); // facing the other way: the right side is the visible one
}

// ── Cheat poses: the elbow or knee angle goes through a full rep but the body doesn't ──
// Built in aspect-corrected units (X = x·A, Y = y) like the real poses, then converted back.

const fromXY = (A: number, pts: { X: number; Y: number }[]): P[] => pts.map((q) => ({ x: q.X / A, y: q.Y }));
const UNUSED = (A: number, X: number, Y: number) => ({ X: X * A, Y }); // a joint the exercise doesn't read

/** Lying on the back, side-on, pressing the arms straight up: wrist above the shoulder, body flat and straight. */
function supinePressSample(elbowDeg: number): number[] {
  const A = LANDSCAPE, arm = 0.14;
  const shoulder = { X: 0.3 * A, Y: 0.8 };
  const d = 2 * arm * Math.sin(deg(elbowDeg) / 2);
  const wrist = { X: shoulder.X, Y: shoulder.Y - d };
  const elbow = { X: shoulder.X + Math.sqrt(Math.max(0, arm * arm - (d / 2) * (d / 2))), Y: shoulder.Y - d / 2 };
  const l = fromXY(A, [shoulder, elbow, wrist, UNUSED(A, 0.6, 0.8), UNUSED(A, 0.75, 0.8), UNUSED(A, 0.9, 0.8)]);
  return encode(l, l, { left: 0.95, right: 0.3 });
}

/**
 * Lying prone on a bench, arm hanging off it: the shoulder never moves. `planted`: the wrist stays put too and the
 * elbow swings out sideways (in 2D that bends the angle just as much); otherwise the forearm curls forward.
 */
function proneBendSample(elbowDeg: number, planted: boolean): number[] {
  const A = LANDSCAPE, arm = 0.14;
  const shoulder = { X: 0.3 * A, Y: 0.45 };
  let elbow: { X: number; Y: number }, wrist: { X: number; Y: number };
  if (planted) {
    const D = 2 * arm * Math.sin(deg(85)); // shoulder–wrist, fixed
    const h = D / 2 / Math.tan(deg(elbowDeg) / 2);
    wrist = { X: shoulder.X, Y: shoulder.Y + D };
    elbow = { X: shoulder.X + h, Y: shoulder.Y + D / 2 };
  } else {
    elbow = { X: shoulder.X, Y: shoulder.Y + arm };
    const r = deg(180 - elbowDeg);
    wrist = { X: elbow.X - arm * Math.sin(r), Y: elbow.Y + arm * Math.cos(r) };
  }
  const l = fromXY(A, [shoulder, elbow, wrist, UNUSED(A, 0.55, 0.45), UNUSED(A, 0.7, 0.45), UNUSED(A, 0.85, 0.45)]);
  return encode(l, l, { left: 0.95, right: 0.3 });
}

/** A real plank push-up except the hands slide along the floor towards the feet as the elbow bends. */
function slidingHandsSample(elbowDeg: number): number[] {
  const slide = (0.14 * 0.9 * (170 - Math.min(170, elbowDeg))) / 100 / LANDSCAPE; // up to 0.9 upper arms at 70°
  const l = plankLimb(elbowDeg, 0, LANDSCAPE).map((q, j) => (j <= 2 ? { x: q.x + slide, y: q.y } : q));
  return encode(l, l, { left: 0.95, right: 0.3 });
}

/**
 * Lying on the belly, propped on straight arms with the hands on the floor in front of the shoulders (head left):
 * the upper body is lifted `liftDeg` off the floor along the shoulder–wrist line, hips and legs stay down. Bending the
 * elbows lowers the chest, so the shoulder drops and the body line stays near straight.
 */
function bellyPropSample(elbowDeg: number, liftDeg: number): number[] {
  const A = LANDSCAPE, arm = 0.14, floor = 0.85;
  const wrist = { X: 0.3 * A, Y: floor };
  const D = 2 * arm * Math.sin(deg(elbowDeg) / 2);
  const shoulder = { X: wrist.X + D * Math.cos(deg(liftDeg)), Y: floor - D * Math.sin(deg(liftDeg)) };
  const m = { X: (shoulder.X + wrist.X) / 2, Y: (shoulder.Y + wrist.Y) / 2 };
  const h = Math.sqrt(Math.max(0, arm * arm - (D / 2) * (D / 2)));
  const u = { X: (wrist.X - shoulder.X) / D, Y: (wrist.Y - shoulder.Y) / D };
  const elbow = { X: m.X + u.Y * h, Y: m.Y - u.X * h }; // bends up, away from the floor
  const hip = { X: shoulder.X + 0.3, Y: floor - 0.02 }, ankle = { X: hip.X + 0.3, Y: floor };
  const l = fromXY(A, [shoulder, elbow, wrist, hip, { X: (hip.X + ankle.X) / 2, Y: floor - 0.01 }, ankle]);
  return encode(l, l, { left: 0.95, right: 0.3 });
}

/**
 * Cobra: a plank push-up from the shoulders up, but the hips stay on the floor (a long torso, so the body line still
 * reads straight enough at the top). The shoulder drops and rises; the hip never moves.
 */
function cobraSample(elbowDeg: number, hipX = 0.72): number[] {
  const l = plankLimb(elbowDeg, 0, LANDSCAPE);
  const ankle = { x: 0.95, y: 0.85 }, hip = { x: hipX, y: 0.83 };
  const out = [l[0]!, l[1]!, l[2]!, hip, { x: (hip.x + ankle.x) / 2, y: 0.84 }, ankle];
  return encode(out, out, { left: 0.95, right: 0.3 });
}

/**
 * Forward-lean dip: a plank with the shoulder behind the wrist (towards the feet) at the top that rocks forward over
 * the hand as the elbow bends, so the elbow passes 90° while the shoulder drops less than half an upper arm.
 */
function leanDipSample(elbowDeg: number, bottom = 87): number[] {
  const A = LANDSCAPE, arm = 0.14;
  const wrist = { X: 0.3 * A, Y: 0.85 };
  const D = 2 * arm * Math.sin(deg(elbowDeg) / 2);
  const s = 0.75 * arm * Math.max(0, Math.min(1, (elbowDeg - bottom) / (170 - bottom)));
  const shoulder = { X: wrist.X + s, Y: wrist.Y - Math.sqrt(D * D - s * s) };
  const m = { X: (shoulder.X + wrist.X) / 2, Y: (shoulder.Y + wrist.Y) / 2 };
  const h = Math.sqrt(Math.max(0, arm * arm - (D / 2) * (D / 2)));
  const u = { X: (wrist.X - shoulder.X) / D, Y: (wrist.Y - shoulder.Y) / D };
  const n = -u.Y >= 0 ? { X: -u.Y, Y: u.X } : { X: u.Y, Y: -u.X }; // the elbow points towards the feet
  const elbow = { X: m.X + n.X * h, Y: m.Y + n.Y * h };
  const ankle = { X: 0.9 * A, Y: 0.85 };
  const hip = { X: (shoulder.X + ankle.X) / 2, Y: (shoulder.Y + ankle.Y) / 2 };
  const l = fromXY(A, [shoulder, elbow, wrist, hip, { X: (hip.X + ankle.X) / 2, Y: (hip.Y + ankle.Y) / 2 }, ankle]);
  return encode(l, l, { left: 0.95, right: 0.3 });
}

/** Standing, thigh vertical, the foot curling up behind (hamstring curl): the hip never moves. */
function hamstringCurlSample(kneeDeg: number): number[] {
  const A = PORTRAIT, shin = 0.22, thigh = 0.22;
  const hip = { X: 0.45 * A, Y: 0.46 }, knee = { X: hip.X, Y: hip.Y + thigh };
  const r = deg(180 - kneeDeg);
  const ankle = { X: knee.X - shin * Math.sin(r), Y: knee.Y + shin * Math.cos(r) };
  const shoulder = { X: hip.X + 0.02, Y: hip.Y - 0.3 };
  const l = fromXY(A, [shoulder, { X: shoulder.X + 0.1, Y: shoulder.Y + 0.1 }, { X: shoulder.X + 0.2, Y: shoulder.Y + 0.1 }, hip, knee, ankle]);
  return encode(l, l, { left: 0.3, right: 0.9 });
}

/** Marching high knees, slowly: the thigh lifts forward, the shin hangs; the hip stays where it is. */
function highKneeSample(kneeDeg: number): number[] {
  const A = PORTRAIT, shin = 0.22, thigh = 0.22;
  const hip = { X: 0.45 * A, Y: 0.46 };
  const phi = deg(180 - kneeDeg); // thigh angle from hanging straight down
  const knee = { X: hip.X + thigh * Math.sin(phi), Y: hip.Y + thigh * Math.cos(phi) };
  const ankle = { X: knee.X, Y: knee.Y + shin };
  const shoulder = { X: hip.X, Y: hip.Y - 0.3 };
  const l = fromXY(A, [shoulder, { X: shoulder.X + 0.1, Y: shoulder.Y + 0.1 }, { X: shoulder.X + 0.2, Y: shoulder.Y + 0.1 }, hip, knee, ankle]);
  return encode(l, l, { left: 0.3, right: 0.9 });
}

/** Lying on the back, side-on: knees rise as the heels slide in; straight, every joint is on one horizontal line. */
function lyingKneeBendSample(kneeDeg: number): number[] {
  const A = PORTRAIT, seg = 0.18, floor = 0.82;
  const hip = { X: 0.4 * A, Y: floor };
  const half = deg(kneeDeg) / 2;
  const ankle = { X: hip.X + 2 * seg * Math.sin(half), Y: floor };
  const knee = { X: hip.X + seg * Math.sin(half), Y: floor - seg * Math.cos(half) };
  const shoulder = { X: hip.X - 0.28, Y: floor - 0.01 };
  const l = fromXY(A, [shoulder, { X: shoulder.X + 0.1, Y: floor }, { X: shoulder.X + 0.2, Y: floor }, hip, knee, ankle]);
  return encode(l, l, { left: 0.3, right: 0.9 });
}

// ── Time series at 20 Hz ──
// A script is a list of segments; each produces one angle (or null for "no pose") per 50 ms tick.

type Seg = { hold: number; ms: number } | { from: number; to: number; ms: number } | { gap: number };
const DT = 50;
const hold = (a: number, ms: number): Seg => ({ hold: a, ms });
const move = (from: number, to: number, ms: number): Seg => ({ from, to, ms });
const gap = (ms: number): Seg => ({ gap: ms });
/** One rep: top → bottom → top on a cosine profile. */
const rep = (bottom: number, periodMs = 1500, top = 170): Seg[] => [move(top, bottom, periodMs / 2), move(bottom, top, periodMs / 2)];
const reps = (n: number, bottom: number, periodMs = 1500, top = 170): Seg[] => Array.from({ length: n }, () => rep(bottom, periodMs, top)).flat();

function angles(script: Seg[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (const s of script) {
    if ("gap" in s) for (let i = 0; i < s.gap / DT; i++) out.push(null);
    else if ("hold" in s) for (let i = 0; i < s.ms / DT; i++) out.push(s.hold);
    else {
      const n = s.ms / DT;
      for (let i = 1; i <= n; i++) out.push(s.from + ((s.to - s.from) * (1 - Math.cos((Math.PI * i) / n))) / 2);
    }
  }
  return out;
}

const EMPTY: number[] = [];
function series(script: Seg[], pose: (a: number) => number[], t0 = 0): RepSample[] {
  return angles(script).map((a, i) => ({ t: t0 + i * DT, p: a === null ? EMPTY : pose(a) }));
}

/** Seeded PRNG (mulberry32) so noisy tests are reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Running ──

function runLive(exercise: Exercise, aspect: number, samples: RepSample[], pauses: [number, number][] = []) {
  const c = new RepCounter(exercise, aspect);
  const events: RepEvent[] = [];
  for (const s of samples) {
    if (pauses.some(([a, b]) => s.t >= a && s.t <= b)) continue; // the phone doesn't feed paused samples
    events.push(...c.push(s));
  }
  return { counter: c, events, count: c.count };
}

function toTrace(exercise: Exercise, aspect: number, samples: RepSample[], pauses: [number, number][] = []): Trace {
  const zeros = new Array<number>(SAMPLE_INTS).fill(0);
  return {
    v: 1, engine: "reps@1", exercise, aspect,
    t: samples.map((s) => s.t),
    p: samples.flatMap((s) => (s.p.length === SAMPLE_INTS ? [...s.p] : zeros)),
    pauses,
  };
}

/** Runs the samples live, then replays the trace the phone would upload, and checks the two agree exactly. */
function run(exercise: Exercise, aspect: number, samples: RepSample[], pauses: [number, number][] = []) {
  const live = runLive(exercise, aspect, samples, pauses);
  const trace = toTrace(exercise, aspect, samples, pauses);
  const parsed = parseTrace(JSON.parse(JSON.stringify(trace)));
  assert.ok(parsed, "the trace survives the wire");
  const server = countReps(parsed);
  assert.equal(server.count, live.count, "server recount equals the live count");
  assert.deepEqual(server.reps, [...live.counter.reps], "same rep timings");
  return { ...live, server };
}

const ofType = <T extends RepEvent["type"]>(events: RepEvent[], type: T) => events.filter((e) => e.type === type) as Extract<RepEvent, { type: T }>[];
const faults = (events: RepEvent[]) => ofType(events, "fault").map((e) => e.fault);

// ── Habit text ──

test("parseRepHabit accepts the rep habit texts and nothing else", () => {
  assert.deepEqual(parseRepHabit("20 push-ups"), { exercise: "pushup", target: 20 });
  assert.deepEqual(parseRepHabit("20 pushups"), { exercise: "pushup", target: 20 });
  assert.deepEqual(parseRepHabit("30 squats"), { exercise: "squat", target: 30 });
  assert.deepEqual(parseRepHabit("  20 Push-Ups "), { exercise: "pushup", target: 20 });
  assert.deepEqual(parseRepHabit("1 SQUATS"), { exercise: "squat", target: 1 });
  assert.deepEqual(parseRepHabit("50 squats"), { exercise: "squat", target: 50 });
  for (const bad of ["0 squats", "51 push-ups", "100 squats", "05 squats", "-5 squats", "2.5 squats", "squats", "20", "20 push ups",
    "20 sit-ups", "20 push-ups daily", "twenty squats", "a book", ""]) {
    assert.equal(parseRepHabit(bad), null, bad);
  }
});

test("repHabitText writes what parseRepHabit reads", () => {
  assert.equal(repHabitText("pushup", 20), "20 push-ups");
  assert.equal(repHabitText("squat", 30), "30 squats");
  for (const ex of ["pushup", "squat"] as const) for (let n = 1; n <= 50; n++) assert.deepEqual(parseRepHabit(repHabitText(ex, n)), { exercise: ex, target: n });
});

// ── Geometry ──

test("the angle the counter reads matches the pose (deterministic maths agrees with Math.atan2)", () => {
  assert.equal(JOINTS.length * 3, SAMPLE_INTS);
  for (const a of [40, 70, 90, 112.5, 130, 160, 175]) {
    const p = pushupSample(a);
    const c = new RepCounter("pushup", LANDSCAPE);
    c.push({ t: 0, p });
    // The same angle from the quantised ints with the platform's atan2 (left shoulder 0, elbow 2, wrist 4).
    const X = (i: number) => p[i * 3]! * LANDSCAPE, Y = (i: number) => p[i * 3 + 1]!;
    const ax = X(0) - X(2), ay = Y(0) - Y(2), cx = X(4) - X(2), cy = Y(4) - Y(2);
    const ref = (Math.atan2(Math.abs(ax * cy - ay * cx), ax * cx + ay * cy) * 180) / Math.PI;
    assert.ok(Math.abs(c.angle! - ref) < 1e-9, `${a}: ${c.angle} vs ${ref}`);
    assert.ok(Math.abs(c.angle! - a) < 1, `${a}: quantisation stays under 1°`);
  }
  const k = new RepCounter("squat", PORTRAIT);
  k.push({ t: 0, p: squatSample(95) });
  assert.ok(Math.abs(k.angle! - 95) < 1);
});

// ── Push-ups ──

test("N full push-ups count N, with ready first and rep timings in order", () => {
  for (const n of [1, 5, 20]) {
    const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(n, 70), hold(170, 500)], (a) => pushupSample(a)));
    assert.equal(r.count, n);
    assert.equal(r.events[0]?.type, "ready");
    const rs = ofType(r.events, "rep");
    assert.deepEqual(rs.map((e) => e.n), Array.from({ length: n }, (_, i) => i + 1));
    for (const e of rs) assert.ok(e.startT < e.bottomT && e.bottomT < e.endT && e.endT - e.startT >= 600);
    assert.deepEqual(faults(r.events), []);
    assert.equal(r.counter.phase, "up");
  }
});

test("no count before the start pose is held for 500 ms", () => {
  // 200 ms at the top, then the first rep: its descent stays above 155° for about another 200 ms, so the start pose
  // is held ~400 ms (under 500) and rep 1 is not counted. The 600 ms hold after it (plus the end of rep 1's
  // rise above 155°) arms the counter, so ready fires after rep 1 and the next three count.
  const r = run("pushup", LANDSCAPE, series([hold(170, 200), ...rep(70), hold(170, 600), ...reps(3, 70)], (a) => pushupSample(a)));
  assert.equal(r.count, 3);
  const [ready] = ofType(r.events, "ready");
  assert.ok(ready && ready.t > 200 + 1500, "ready comes after the first rep");
});

test("half push-ups (never below 90°) count nothing and say half_rep", () => {
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(5, 105)], (a) => pushupSample(a)));
  assert.equal(r.count, 0);
  assert.equal(ofType(r.events, "half_rep").length, 5);
});

test("push-ups faster than 600 ms are rejected as too_fast", () => {
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(5, 70, 700)], (a) => pushupSample(a)));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), ["too_fast", "too_fast", "too_fast", "too_fast", "too_fast"]);
});

test("a rep slower than 8 s is too_slow and the start pose is needed again", () => {
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), move(170, 70, 1000), hold(70, 8000), move(70, 170, 1000), hold(170, 1000), ...rep(70)], (a) => pushupSample(a)));
  assert.ok(faults(r.events).includes("too_slow"));
  assert.equal(r.count, 1);
  assert.equal(ofType(r.events, "ready").length, 2);
});

test("standing arm curls (not a plank) never count", () => {
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(10, 40)], curlSample));
  assert.equal(r.count, 0);
  assert.equal(ofType(r.events, "ready").length, 0);
  assert.ok(faults(r.events).includes("not_plank"));
});

test("pressing the arms up lying on the back never counts: hands_not_planted", () => {
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(8, 60)], supinePressSample));
  assert.equal(r.count, 0);
  assert.equal(ofType(r.events, "ready").length, 0, "the start pose needs the wrist below the shoulder");
  assert.deepEqual(faults(r.events), ["hands_not_planted"]);
});

test("pressing up on the back after a real start pose still never counts", () => {
  // Ready from a real plank, then roll over and press: every rep ends with the wrist above the shoulder.
  const r = run("pushup", LANDSCAPE, [
    ...series([hold(170, 1000)], (a) => pushupSample(a)),
    ...series([hold(170, 100), ...reps(5, 60)], supinePressSample, 1000),
  ]);
  assert.equal(ofType(r.events, "ready").length, 1);
  assert.equal(r.count, 0);
  assert.ok(faults(r.events).includes("hands_not_planted"));
});

test("arm bends lying prone (the shoulder never drops) never count: no_shoulder_drop", () => {
  for (const planted of [true, false]) {
    const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(6, 60)], (a) => proneBendSample(a, planted)));
    assert.equal(ofType(r.events, "ready").length, 1, `planted ${planted}: the pose looks like a plank top`);
    assert.equal(r.count, 0, `planted ${planted}`);
    assert.deepEqual(faults(r.events), new Array(6).fill("no_shoulder_drop"), `planted ${planted}`);
  }
});

test("hands sliding along the floor during the rep are hands_not_planted", () => {
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(4, 70)], slidingHandsSample));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), new Array(4).fill("hands_not_planted"));
});

test("lying on the belly propped on the arms (hands in front of the shoulders) never counts: hands_not_planted", () => {
  // liftDeg 20 / 30 / 45: the wrist is 0.7 / 1.0 / 1.4 upper arms below the shoulder and 1.9 / 1.7 / 1.4 in front.
  for (const lift of [20, 30, 45]) {
    const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(6, 60)], (a) => bellyPropSample(a, lift)));
    assert.equal(r.count, 0, `lift ${lift}°`);
    assert.equal(ofType(r.events, "ready").length, 0, `lift ${lift}°: never ready`);
    assert.deepEqual(faults(r.events), ["hands_not_planted"], `lift ${lift}°`);
    // Ready from a real plank first, then down on the belly: every rep ends with the hands forward.
    const after = run("pushup", LANDSCAPE, [...series([hold(170, 1000)], (a) => pushupSample(a)),
      ...series([hold(170, 100), ...reps(6, 60)], (a) => bellyPropSample(a, lift), 1000)]);
    assert.equal(after.count, 0, `lift ${lift}° after a plank`);
    assert.deepEqual(faults(after.events), new Array(6).fill("hands_not_planted"), `lift ${lift}° after a plank`);
  }
});

test("cobra push-ups (hips left on the floor) never count: hips", () => {
  // A long torso keeps the body line just inside 150° at the top, so the start pose holds; the hip never drops.
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(6, 70)], (a) => cobraSample(a)));
  assert.equal(ofType(r.events, "ready").length, 1);
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), new Array(6).fill("hips"));
  // Usual proportions after a real plank start: the top itself is out of line (and the hip still doesn't drop).
  const after = run("pushup", LANDSCAPE, [...series([hold(170, 1000)], (a) => pushupSample(a)), ...series(reps(6, 70), (a) => cobraSample(a, 0.6), 1000)]);
  assert.equal(after.count, 0);
  assert.ok(faults(after.events).every((f) => f === "hips"));
});

test("a rep that ends out of plank (hips sagging at the lockout) is rejected as hips", () => {
  // The sag is on only a few rising samples near the top (well under FAULT_SHARE), but one of them is the rep's last.
  const a = angles([hold(170, 1000), ...reps(5, 70)]);
  const r = run("pushup", LANDSCAPE, a.map((x, i) => ({ t: i * DT, p: pushupSample(x!, { sag: i > 20 && x! > a[i - 1]! && x! > 145 ? 0.15 : 0 }) })));
  assert.equal(r.count, 0);
  assert.ok(faults(r.events).filter((f) => f === "hips").length >= 5);
});

test("form faults count together against FAULT_SHARE", () => {
  // Hips sag on the way down and the feet go up on a box on the way up, each on under a quarter of the rep's samples.
  const feetUp = (x: number) => {
    const l = plankLimb(x, 0, LANDSCAPE), ankle = { x: 0.9, y: 0.05 };
    const hip = { x: (l[0]!.x + ankle.x) / 2, y: (l[0]!.y + ankle.y) / 2 };
    const o = [l[0]!, l[1]!, l[2]!, hip, { x: (hip.x + ankle.x) / 2, y: (hip.y + ankle.y) / 2 }, ankle];
    return encode(o, o, { left: 0.95, right: 0.3 });
  };
  const a = angles([hold(170, 1000), ...reps(4, 70)]);
  const pose = (both: boolean) => a.map((x, i) => {
    const down = i > 20 && x! < a[i - 1]!, mid = x! > 85 && x! < 145;
    return { t: i * DT, p: !mid ? pushupSample(x!) : down ? pushupSample(x!, { sag: 0.15 }) : both ? feetUp(x!) : pushupSample(x!) };
  });
  assert.equal(run("pushup", LANDSCAPE, pose(false)).count, 4, "the sag alone stays under the share");
  const r = run("pushup", LANDSCAPE, pose(true));
  assert.equal(r.count, 0, "sag + feet up together are over it");
  assert.ok(faults(r.events).includes("hips"));
});

test("a forward-lean dip (elbow past 90°, shoulder barely drops) is no_shoulder_drop", () => {
  // The shoulder rocks forward over the hand: about 0.47 upper arms of drop with the elbow at 87°.
  const dip = [move(170, 87, 750), hold(87, 200), move(87, 170, 750)];
  const script = [hold(170, 1000), ...dip, ...dip, ...dip, ...dip, hold(170, 500)];
  const r = run("pushup", LANDSCAPE, series(script, (a) => leanDipSample(a)));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), new Array(4).fill("no_shoulder_drop"));
  // The same timing done honestly (shoulder straight down over the hand) counts.
  assert.equal(run("pushup", LANDSCAPE, series(script, (a) => pushupSample(a))).count, 4);
});

test("the anti-cheat gates leave real push-ups alone, deep or just past 90°", () => {
  for (const bottom of [45, 70, 85]) {
    const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(4, bottom), hold(170, 500)], (a) => pushupSample(a)));
    assert.equal(r.count, 4, `bottom ${bottom}°`);
    assert.deepEqual(faults(r.events), [], `bottom ${bottom}°`);
  }
});

test("a lockout that only reaches ~161° (2D landmarks) still counts every rep", () => {
  for (let seed = 1; seed <= 5; seed++) {
    const rand = rng(seed);
    const p = angles([hold(161, 1000), ...reps(10, 70, 1500, 161), hold(161, 500)]).map((x) => x! + (rand() * 2 - 1) * 5);
    assert.equal(run("pushup", LANDSCAPE, p.map((x, i) => ({ t: i * DT, p: pushupSample(x) }))).count, 10, `push-ups, seed ${seed}`);
    const q = angles([hold(161, 1000), ...reps(10, 80, 2000, 161), hold(161, 500)]).map((x) => x! + (rand() * 2 - 1) * 5);
    assert.equal(run("squat", PORTRAIT, q.map((x, i) => ({ t: i * DT, p: squatSample(x) }))).count, 10, `squats, seed ${seed}`);
  }
});

test("sagging hips: the plank never starts and the hint is hips", () => {
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(5, 70)], (a) => pushupSample(a, { sag: 0.15 })));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), ["hips"]);
});

test("hips sagging through most of the rep reject it as hips", () => {
  // Straight at the top (so the start pose holds), sagging once the elbow bends past 120°.
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(3, 70)], (a) => pushupSample(a, { sag: a < 150 ? 0.15 : 0 })));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events).filter((f) => f === "hips").length >= 3, true);
});

test("bouncing at the bottom without locking out is no_lockout; the next full rep counts", () => {
  const r = run("pushup", LANDSCAPE, series([hold(170, 1000), move(170, 75, 750), move(75, 140, 500), move(140, 75, 500), move(75, 170, 750), hold(170, 500)], (a) => pushupSample(a)));
  assert.deepEqual(faults(r.events), ["no_lockout"]);
  assert.equal(r.count, 1);
  const [only] = ofType(r.events, "rep");
  assert.ok(only!.startT > 1000 + 750, "the counted rep starts at the second dip");
});

test("occlusion for more than 400 ms drops the rep in progress; counting resumes after the start pose", () => {
  const script = [hold(170, 1000), ...reps(2, 70), move(170, 70, 750), gap(600), move(70, 170, 750), hold(170, 800), ...reps(2, 70)];
  const r = run("pushup", LANDSCAPE, series(script, (a) => pushupSample(a)));
  assert.equal(r.count, 4);
  assert.equal(ofType(r.events, "lost").length, 1);
  assert.equal(ofType(r.events, "ready").length, 2);
});

test("a short dropout (under 400 ms) keeps the rep", () => {
  const script = [hold(170, 1000), ...reps(2, 70), move(170, 70, 750), gap(300), move(70, 170, 750), hold(170, 200), ...reps(2, 70)];
  const r = run("pushup", LANDSCAPE, series(script, (a) => pushupSample(a)));
  assert.equal(r.count, 5);
  assert.equal(ofType(r.events, "lost").length, 0);
});

test("after occlusion, counting resumes at the next top without a still hold", () => {
  // The repper never pauses: a rep is lost to the occlusion, the next ones count from the first top.
  const script = [hold(170, 1000), ...reps(5, 70), move(170, 70, 750), gap(600), move(70, 170, 750), ...reps(5, 70), hold(170, 500)];
  const r = run("pushup", LANDSCAPE, series(script, (a) => pushupSample(a)));
  assert.equal(r.count, 10);
  assert.equal(ofType(r.events, "lost").length, 1);
  assert.deepEqual(faults(r.events), []);
});

test("a 450 ms feed stall costs only the rep it lands in, and says setup", () => {
  const samples = series([hold(170, 1000), ...reps(20, 70), hold(170, 500)], (a) => pushupSample(a));
  for (const at of [1000 + 4 * 1500 + 200, 1000 + 4 * 1500 + 700, 1000 + 12 * 1500 + 1000]) {
    const r = run("pushup", LANDSCAPE, samples.filter((s) => s.t < at || s.t >= at + 450));
    assert.equal(r.count, 19, `stall at ${at}`);
    assert.equal(ofType(r.events, "setup").length, 1, `stall at ${at}`);
    assert.equal(ofType(r.events, "lost").length, 0, `stall at ${at}`);
    assert.deepEqual(faults(r.events), [], `stall at ${at}`);
  }
});

test("after a freeze (3.5 s pause) reps go on counting straight away", () => {
  const fr = 1000 + 10 * 1500;
  const pauses: [number, number][] = [[fr + DT, fr + 3500]];
  // Holding the plank through the freeze.
  const held = series([hold(170, 1000), ...reps(10, 70), hold(170, 3500), ...reps(10, 70), hold(170, 500)], (a) => pushupSample(a));
  const r1 = run("pushup", LANDSCAPE, held, pauses);
  assert.equal(r1.count, 20);
  assert.equal(ofType(r1.events, "setup").length, 1);
  // Standing up for the gesture, then straight back into reps after 150 ms at the top.
  const stood = [...series([hold(170, 1000), ...reps(10, 70)], (a) => pushupSample(a)), ...series([hold(170, 3500)], curlSample, fr + DT),
    ...series([hold(170, 150), ...reps(10, 70), hold(170, 500)], (a) => pushupSample(a), fr + 3550)];
  const r2 = run("pushup", LANDSCAPE, stood, pauses);
  assert.equal(r2.count, 20);
  assert.equal(ofType(r2.events, "ready").length, 2);
});

test("a gap before the first ready still needs the full 500 ms start hold", () => {
  // 300 ms at the top, a 500 ms stall, then reps with only the brief top between them: never ready.
  const samples = series([hold(170, 300), hold(170, 500), ...reps(4, 70)], (a) => pushupSample(a)).filter((s) => s.t < 300 || s.t >= 800);
  const r = run("pushup", LANDSCAPE, samples);
  assert.equal(ofType(r.events, "ready").length, 0);
  assert.equal(ofType(r.events, "setup").length, 0);
  assert.equal(r.count, 0);
});

test("low visibility on both sides is the same as no pose", () => {
  const script = [hold(170, 1000), ...reps(2, 70), move(170, 70, 750), hold(70, 600), move(70, 170, 750), hold(170, 800), ...reps(2, 70)];
  // During the 600 ms hold at the bottom the landmarks are there but only 40% visible.
  const samples = series(script, (a) => pushupSample(a));
  const start = (1000 + 2 * 1500 + 750) / DT;
  for (let i = start; i < start + 12; i++) samples[i] = { t: samples[i]!.t, p: pushupSample(70, { vis: { left: 0.4, right: 0.35 } }) };
  const r = run("pushup", LANDSCAPE, samples);
  assert.equal(r.count, 4);
  assert.equal(ofType(r.events, "lost").length, 1);
});

test("jitter (±5° noise and single-frame 70° spikes) adds no reps and loses none", () => {
  const jitter = (seed: number, script: Seg[], every: number) => {
    const rand = rng(seed);
    return angles(script).map((x, i) => {
      const noisy = x! + (rand() * 2 - 1) * 5;
      // A landmark flip: 70° off, away from the middle of the range (the harmful direction), or at random.
      const away = rand() < 0.7 ? (noisy > 120 ? -70 : 70) : rand() < 0.5 ? -70 : 70;
      return Math.max(5, Math.min(180, i > 0 && i % every === 0 ? noisy + away : noisy));
    });
  };
  for (let seed = 1; seed <= 25; seed++) {
    const a = jitter(seed, [hold(170, 1000), ...reps(12, 70), hold(170, 500)], 7 + (seed % 11));
    const r = run("pushup", LANDSCAPE, a.map((x, i) => ({ t: i * DT, p: pushupSample(x) })));
    assert.equal(r.count, 12, `push-ups, seed ${seed}`);
    assert.equal(ofType(r.events, "half_rep").length, 0, `push-ups, seed ${seed}`);
    const q = jitter(seed, [hold(172, 1000), ...reps(10, 78, 2000, 172), hold(172, 500)], 7 + (seed % 11));
    const k = run("squat", PORTRAIT, q.map((x, i) => ({ t: i * DT, p: squatSample(x) })));
    assert.equal(k.count, 10, `squats, seed ${seed}`);
  }
});

test("landmark position jitter (±8 thousandths on every joint) doesn't trip the anti-cheat gates", () => {
  // The drop and planted gates read raw positions, not the smoothed angle: MediaPipe's few-pixel wobble must not
  // look like moving hands or feet, nor hide a real shoulder or hip drop.
  for (let seed = 1; seed <= 10; seed++) {
    const rand = rng(seed);
    const wobble = (p: number[]) => p.map((v, i) => (i % 3 === 2 ? v : v + Math.round((rand() * 2 - 1) * 8)));
    const r = run("pushup", LANDSCAPE, series([hold(170, 1000), ...reps(8, 75), hold(170, 500)], (a) => wobble(pushupSample(a))));
    assert.equal(r.count, 8, `push-ups, seed ${seed}`);
    assert.deepEqual(faults(r.events), [], `push-ups, seed ${seed}`);
    const k = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(6, 85, 2000, 172), hold(172, 500)], (a) => wobble(squatSample(a))));
    assert.equal(k.count, 6, `squats, seed ${seed}`);
  }
});

test("two spikes in a row are dropped, a third consecutive one is believed (a real jump)", () => {
  const c = new RepCounter("pushup", LANDSCAPE);
  for (let t = 0; t <= 1000; t += DT) c.push({ t, p: pushupSample(170) });
  c.push({ t: 1050, p: pushupSample(80) });
  c.push({ t: 1100, p: pushupSample(80) });
  assert.ok(c.angle! > 165, "two flips ignored");
  c.push({ t: 1150, p: pushupSample(80) });
  assert.ok(c.angle! < 140, "the third sample moves the angle");
});

test("side choice: the more visible side, switching only when the other is better by 0.15", () => {
  // The left arm does the push-ups; the right "arm" stays straight at 170°. Counting works only while the
  // counter reads the left side.
  const script = [hold(170, 1000), ...reps(6, 70), hold(170, 500)];
  const near = series(script, (a) => pushupSample(a, { rightDeg: 170, vis: { left: 0.9, right: 0.8 } }));
  // After the first second the right side becomes a bit more visible (by 0.10): no switch, all 6 count.
  const closer = near.map((s, i) => (i < 20 ? s : { t: s.t, p: pushupSample(angles(script)[i]!, { rightDeg: 170, vis: { left: 0.85, right: 0.95 } }) }));
  const r1 = run("pushup", LANDSCAPE, closer);
  assert.equal(r1.counter.side, "left");
  assert.equal(r1.count, 6);
  // Better by 0.25: it switches to the straight right arm and nothing more counts.
  const switched = near.map((s, i) => (i < 20 ? s : { t: s.t, p: pushupSample(angles(script)[i]!, { rightDeg: 170, vis: { left: 0.7, right: 0.95 } }) }));
  const r2 = run("pushup", LANDSCAPE, switched);
  assert.equal(r2.counter.side, "right");
  assert.equal(r2.count, 0);
  // Starting with the right side clearly better picks it straight away.
  const c = new RepCounter("pushup", LANDSCAPE);
  c.push({ t: 0, p: pushupSample(170, { vis: { left: 0.6, right: 0.9 } }) });
  assert.equal(c.side, "right");
});

test("switching sides mid-rep abandons that rep; the new side needs a top before the next one", () => {
  // Both arms do the same push-ups. At the bottom of rep 3 the right side becomes clearly more visible. Rep 3 is
  // dropped (it would mix two arms), and the counter must not start a rep from the bottom on the new side either:
  // it waits for the right arm's lockout, then reps 4 and 5 count.
  const script = [hold(170, 1000), ...reps(5, 70), hold(170, 500)];
  const switchT = 1000 + 2 * 1500 + 750;
  const samples = series(script, (a) => pushupSample(a)).map((s) =>
    s.t < switchT ? s : { t: s.t, p: pushupSample(angles(script)[s.t / DT]!, { vis: { left: 0.6, right: 0.95 } }) });
  const r = run("pushup", LANDSCAPE, samples);
  assert.equal(r.counter.side, "right");
  assert.equal(r.count, 4);
  for (const e of ofType(r.events, "rep")) assert.ok(e.endT < switchT || e.startT > switchT, `rep ${e.n} does not span the switch`);
  assert.equal(ofType(r.events, "half_rep").length, 0);
  // The same session read from one side throughout counts all five.
  assert.equal(run("pushup", LANDSCAPE, series(script, (a) => pushupSample(a))).count, 5);
});

test("a 2-frame visibility flicker to the other side every 3 s abandons nothing", () => {
  const a = angles([hold(172, 1000), ...reps(20, 80, 2000, 172), hold(172, 500)]);
  for (const off of [0, 7, 13, 21, 33]) {
    for (const otherStraight of [false, true]) {
      const samples = a.map((x, i) => {
        const l = squatLimb(x!), flip = i > 20 && (i + off) % 60 < 2;
        return { t: i * DT, p: encode(otherStraight ? squatLimb(172) : l, l, flip ? { left: 0.9, right: 0.3 } : { left: 0.3, right: 0.9 }) };
      });
      const r = run("squat", PORTRAIT, samples);
      assert.equal(r.count, 20, `offset ${off}, other leg ${otherStraight ? "straight" : "the same"}`);
      assert.equal(r.counter.side, "right");
    }
  }
});

test("the read side going unusable switches to a usable other side even when it is less than 0.15 better", () => {
  // Left 0.95 / right 0.6 at first; then the left drops to 0.45 (unusable) while the right stays 0.6. Without the
  // switch the counter would read no pose for the rest of the set.
  const script = [hold(170, 1000), ...reps(10, 70), hold(170, 500)];
  const a = angles(script);
  const samples = a.map((x, i) => ({ t: i * DT, p: pushupSample(x!, { vis: i < 30 ? { left: 0.95, right: 0.6 } : { left: 0.45, right: 0.6 } }) }));
  const r = run("pushup", LANDSCAPE, samples);
  assert.equal(r.counter.side, "right");
  assert.ok(r.count >= 9, `counted ${r.count}`);
});

test("a joint out of frame makes its side unusable", () => {
  const p = pushupSample(170, { vis: { left: 0.95, right: 0.95 } });
  const left = [...p];
  left[10 * 3] = 1100; // left ankle 10% past the right edge
  const c = new RepCounter("pushup", LANDSCAPE);
  c.push({ t: 0, p: left });
  assert.equal(c.side, "right");
});

// ── Squats ──

test("N squats count N", () => {
  for (const n of [1, 8, 30]) {
    const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(n, 80, 2000, 172), hold(172, 500)], (a) => squatSample(a)));
    assert.equal(r.count, n);
    assert.equal(r.counter.side, "right");
    assert.deepEqual(faults(r.events), []);
  }
});

test("shallow squats (knee never below 100°) count nothing", () => {
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(6, 115, 2000, 172)], (a) => squatSample(a)));
  assert.equal(r.count, 0);
  assert.equal(ofType(r.events, "half_rep").length, 6);
});

test("squats faster than 450 ms from the start line to the count line are too_fast", () => {
  // A 500 ms squat spends about 350 ms between 140° on the way down and 155° on the way up.
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(4, 80, 500, 172)], (a) => squatSample(a)));
  assert.equal(r.count, 0);
  assert.equal(faults(r.events).filter((f) => f === "too_fast").length, 4);
});

test("brisk honest squats (0.6–1.2 s each) count fully", () => {
  for (const period of [600, 900, 1200]) {
    const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(10, 80, period, 172), hold(172, 500)], (a) => squatSample(a)));
    assert.equal(r.count, 10, `${period} ms squats`);
    assert.deepEqual(faults(r.events), [], `${period} ms squats`);
  }
});

test("knee bends lying down (torso flat) never start: lean", () => {
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(5, 80, 2000, 172)], (a) => squatSample(a, 80)));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), ["lean"]);
});

test("knee bends lying on the back, every joint near one horizontal line, never count", () => {
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(5, 60, 2000, 172)], lyingKneeBendSample));
  assert.equal(r.count, 0);
  assert.equal(ofType(r.events, "ready").length, 0);
  assert.deepEqual(faults(r.events), ["lean"]);
});

test("standing hamstring curls never count: no_hip_drop", () => {
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(6, 50, 2000, 172)], hamstringCurlSample));
  assert.equal(ofType(r.events, "ready").length, 1, "standing tall is a valid start pose");
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), new Array(6).fill("no_hip_drop"));
});

test("high knees (even slow ones) never count: no_hip_drop", () => {
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(6, 85, 1600, 172)], highKneeSample));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), new Array(6).fill("no_hip_drop"));
});

test("a clearly shallow squat (knee shoved forward, hip well above the knee) is rejected as depth", () => {
  // The shin leans from 5° at the top to 40° at the bottom: the knee angle reaches 95° but the hip stays ~0.7 thigh
  // lengths above the knee. The hip still drops (so this is depth, not no_hip_drop).
  const shin = (a: number) => 5 + (35 * (172 - a)) / (172 - 95);
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(4, 95, 2000, 172)], (a) => squatSample(a, undefined, shin(a))));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), new Array(4).fill("depth"));
});

test("squatting while the feet drift across the floor is feet_not_planted", () => {
  const drift = (a: number) => (0.22 * 0.8 * (172 - Math.min(172, a))) / 92 / PORTRAIT; // up to 0.8 thighs at 80°
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(3, 80, 2000, 172)], (a) => {
    const l = squatLimb(a).map((q) => ({ x: q.x + drift(a), y: q.y }));
    return encode(l, l, { left: 0.3, right: 0.9 });
  }));
  assert.equal(r.count, 0);
  assert.deepEqual(faults(r.events), new Array(3).fill("feet_not_planted"));
});

test("squats that bottom out above parallel count but get one depth hint", () => {
  // Knee 95° with the shin leaning forward leaves the hip above the knee.
  const r = run("squat", PORTRAIT, series([hold(172, 1000), ...reps(3, 95, 2000, 172)], (a) => squatSample(a)));
  assert.equal(r.count, 3);
  assert.deepEqual(faults(r.events), ["depth"]);
});

// ── Any viewing angle: a 3D stick body through a pinhole camera (reps3d.fixtures.ts) ──
// The fixtures above are 2D side views. These place the 12 joints in 3D (push-ups on the toes, squats, and the
// cheats), film them with a camera at any azimuth around the person (0 = in front: the head end of a push-up, the
// face of a squatter; 90 = the person's left side; 180 = behind), at a lens height from the floor up and 1.8–3.3 m
// away, aimed at the body, with ±5/1000 landmark noise, left/right flips, single-joint jumps, visibility dips, the
// far side losing visibility as it turns away and, in push-ups, the joints behind the body near the bottom. The
// counter must count honest sets from every angle and nothing from the cheats.

const AZIMUTHS = [0, 30, 45, 60, 90, 120, 135, 150, 180];
const PUSH_HEIGHTS = [0.05, 0.3, 0.6]; // a phone on the floor, on a step, on a chair seat
const SQUAT_HEIGHTS = [0.05, 0.5, 1.0];
const DISTANCES = [1.8, 2.5, 3.3];
const NOISE_3D: V.Noise = { px: 5, occlusion: 0.45, flip: 0.02, jump: 0.02, dip: 0.02 };
const N3 = 10;
const PUSH_SET = [V.hold(1, 1000), ...V.reps(N3, 1500), V.hold(1, 500)];
const SQUAT_SET = [V.hold(1, 1000), ...V.reps(N3, 2000), V.hold(1, 500)];

type Grid = { kind: Exercise; body: (e: number, i: number) => V.Body; script: V.Seg[]; azimuths?: number[]; heights?: number[]; distances?: number[];
  noise?: V.Noise; cam?: Partial<V.Cam> };

/** Films the set from every camera position of the grid; each result also checks live count = server recount. */
function grid(g: Grid): { where: string; count: number; events: RepEvent[]; view: string | null }[] {
  const out: { where: string; count: number; events: RepEvent[]; view: string | null }[] = [];
  const heights = g.heights ?? (g.kind === "pushup" ? PUSH_HEIGHTS : SQUAT_HEIGHTS);
  for (const azimuth of g.azimuths ?? AZIMUTHS) for (const height of heights) for (const distance of g.distances ?? DISTANCES) {
    const cam: V.Cam = { azimuth, height, distance, landscape: g.kind === "pushup", ...g.cam };
    const samples = V.film(g.script, { kind: g.kind, body: g.body, cam, noise: { ...NOISE_3D, ...g.noise, seed: azimuth * 7 + height * 100 + distance * 10 } });
    const r = run(g.kind, V.aspectOf(cam), samples);
    out.push({ where: `az ${azimuth}° h ${height} m d ${distance} m`, count: r.count, events: r.events, view: r.counter.view });
  }
  return out;
}

const counted = (rs: { count: number }[]) => rs.reduce((s, r) => s + r.count, 0);
const misses = (rs: { where: string; count: number }[], n = N3) => rs.filter((r) => r.count !== n).map((r) => `${r.where}: ${r.count}`);
const cheats = (rs: { where: string; count: number }[]) => rs.filter((r) => r.count > 0).map((r) => `${r.where}: ${r.count}`);

/** Exactly side-on the counter uses the side reading (the original 2D-angle rules, unchanged): there it can lose a rep
 *  in ten to a run of visibility flicker that makes it switch arms (it then waits for a fresh top). */
const sideOn = (where: string) => where.startsWith("az 90°");

test("3D: honest push-ups count fully from every horizontal angle, camera height and distance", () => {
  const rs = grid({ kind: "pushup", body: (e) => V.pushupBody(e), script: PUSH_SET });
  assert.deepEqual(misses(rs.filter((r) => !sideOn(r.where))), []);
  assert.deepEqual(misses(rs.filter((r) => sideOn(r.where)), N3).filter((m) => !m.endsWith(`: ${N3 - 1}`)), [], "side-on: at most one miss");
  // The reading follows the view: the side reading only straight from the side, the vertical one elsewhere.
  for (const r of rs) {
    if (r.where.startsWith("az 0°") || r.where.startsWith("az 180°")) assert.equal(r.view, "front", r.where);
    if (r.where.startsWith("az 45°")) assert.notEqual(r.view, "side", r.where);
  }
});

test("3D: honest push-up variants (elbows to ~90°, tucked or flared elbows, 1 s and 3 s reps) count", () => {
  const variants: [string, (e: number) => V.Body, V.Seg[]][] = [
    ["elbows to ~90°", (e) => V.pushupBody(e, { bottomY: 0.3 }), PUSH_SET],
    ["tucked elbows", (e) => V.pushupBody(e, { flare: 10 }), PUSH_SET],
    ["brisk 1 s reps", (e) => V.pushupBody(e), [V.hold(1, 1000), ...V.reps(N3, 1000), V.hold(1, 500)]],
    ["slow 3 s reps", (e) => V.pushupBody(e), [V.hold(1, 1000), ...V.reps(N3, 3000), V.hold(1, 500)]],
  ];
  for (const [name, body, script] of variants) {
    const rs = grid({ kind: "pushup", body, script });
    // Every angle but side-on counts fully. Side-on is the side reading (unchanged): brisk and slow sets can lose a
    // rep in ten there, and push-ups only to ~90° filmed side-on from a raised (0.6 m), close (1.8 m) camera read
    // ~102° at the bottom and never reach its 100° bottom line (as before this change).
    assert.deepEqual(misses(rs.filter((r) => !sideOn(r.where))), [], name);
    for (const r of rs.filter((x) => sideOn(x.where))) {
      if (name === "elbows to ~90°" && r.where === "az 90° h 0.6 m d 1.8 m") continue;
      assert.ok(r.count >= N3 - 1, `${name}, ${r.where}: ${r.count}`);
    }
  }
  // Elbows flared straight out (80°): every angle except exactly side-on, where the side reading sees the elbow
  // swing towards the camera rather than bend (a limit of the side reading, unchanged).
  const wide = grid({ kind: "pushup", body: (e) => V.pushupBody(e, { flare: 80 }), script: PUSH_SET, azimuths: [0, 30, 45, 60, 120, 135, 150, 180] });
  assert.deepEqual(misses(wide), []);
});

test("3D: honest squats count fully from every horizontal angle, camera height and distance", () => {
  const rs = grid({ kind: "squat", body: (e) => V.squatBody(e), script: SQUAT_SET });
  assert.deepEqual(misses(rs.filter((r) => !sideOn(r.where))), []);
  for (const r of rs.filter((x) => sideOn(x.where))) assert.ok(r.count >= N3 - 1, `side-on ${r.where}: ${r.count}`);
  for (const r of rs) assert.deepEqual(faults(r.events).filter((f) => f !== "depth"), [], r.where);
});

test("3D: squat variants (1.2 s reps, deep with more lean, a little above parallel with a depth hint) count", () => {
  const variants: [string, (e: number) => V.Body, V.Seg[]][] = [
    ["1.2 s reps", (e) => V.squatBody(e), [V.hold(1, 1000), ...V.reps(N3, 1200), V.hold(1, 500)]],
    ["deep, more lean", (e) => V.squatBody(e, { bottomY: 0.4, torso: 45 }), SQUAT_SET],
  ];
  for (const [name, body, script] of variants) {
    const rs = grid({ kind: "squat", body, script });
    assert.deepEqual(misses(rs.filter((r) => !sideOn(r.where))), [], name);
    for (const r of rs.filter((x) => sideOn(x.where))) assert.ok(r.count >= N3 - 1, `${name}, side-on ${r.where}: ${r.count}`);
  }
  // Hip ~10 cm above the knee: counted, mostly with the one-off depth hint (where perspective puts the extension
  // under 0.6 it reads as deep enough for no hint). From close behind and low it can read just short of the bottom.
  const above = grid({ kind: "squat", body: (e) => V.squatBody(e, { bottomY: 0.6 }), script: SQUAT_SET, azimuths: [0, 30, 45, 60, 90, 120], heights: [0.5, 1.0] });
  for (const r of above) assert.ok(r.count >= N3 - 1, `${r.where}: ${r.count}`);
  assert.ok(above.filter((r) => faults(r.events).includes("depth")).length >= above.length * 0.8, "the depth hint, mostly");
});

test("3D: a person turning slowly during the set (up to 180°, camera rolled up to 15°) still counts", () => {
  const turns: [number, number][] = [[0, 90], [90, 0], [45, 135], [90, 180], [180, 90], [0, 180], [-45, 45], [30, 60]];
  for (const roll of [0, 10, -15]) for (const [from, to] of turns) {
    for (const kind of ["pushup", "squat"] as const) {
      const height = kind === "pushup" ? 0.1 : 0.9;
      // Push-ups turn about the hands (they stay planted, the feet walk round); squats turn on the spot.
      const cam: V.Cam = { azimuth: from, height, distance: 2.5, landscape: kind === "pushup", roll, ...(kind === "pushup" ? { center: { x: 1.33, y: 0, z: 0 } } : {}) };
      const body = kind === "pushup" ? (e: number) => V.pushupBody(e) : (e: number) => V.squatBody(e);
      const samples = V.film(kind === "pushup" ? PUSH_SET : SQUAT_SET, { kind, body, cam, azimuthTo: to, noise: { ...NOISE_3D, seed: from + to + roll } });
      const r = run(kind, V.aspectOf(cam), samples);
      // Starting side-on, the counter switches from the side reading to the vertical one once, which can cost the
      // rep in progress: at most one in ten.
      assert.ok(r.count >= N3 - 1, `${kind} ${from}° → ${to}°, roll ${roll}°: ${r.count}`);
    }
  }
});

test("3D: push-up cheats count nothing from any angle", () => {
  const set = PUSH_SET;
  const none: [string, (e: number) => V.Body][] = [
    ["standing arm dips against a table", (e) => V.uprightDipBody(e)],
    ["kneeling arm dips against a chair", (e) => V.uprightDipBody(e, { kneeling: true })],
    ["standing arm curls", (e) => V.standingArmsBody(e)],
    ["standing air presses", (e) => V.standingArmsBody(e, { press: true })],
    ["half reps (elbows to ~120°)", (e) => V.pushupBody(e, { bottomY: 0.42 })],
    ["shoulder bob on straight arms", (e) => V.pushupBody(e, { bottomY: V.PUSHUP_TOP_Y - 0.08 })],
    ["cobra (hips on the floor)", (e) => V.proneBody(e)],
    ["lying on the belly propped on the hands", (e) => V.proneBody(e, { belly: true })],
    ["hips sagging 20 cm", (e) => V.pushupBody(e, { sag: 0.2 })],
  ];
  for (const [name, body] of none) {
    const rs = grid({ kind: "pushup", body, script: set });
    // Sagging hips seen exactly side-on from a close, raised camera go through the side reading's body-line check,
    // which lets a few by there (as before this change).
    if (name.startsWith("hips sagging")) assert.ok(counted(rs) <= 5, `${name}: ${cheats(rs).join(", ")}`);
    else assert.deepEqual(cheats(rs), [], name);
  }
  // Hands walking forward on straight arms (an inchworm): caught by the arms never bending, the hands' box and
  // their spread. A limit: filmed from behind the feet (150–180°) the arms are hidden behind the body and their 2D
  // angle is mostly noise, and the hands move along the line of sight: up to 4 in 10 slip by there.
  const inch = grid({ kind: "pushup", body: (e) => V.pushupBody(e, { straightArms: true, slide: 0.5 }), script: set });
  assert.ok(counted(inch) <= 30, `inchworm: ${counted(inch)}: ${cheats(inch).join(", ")}`);
  for (const r of inch) {
    const az = Number(r.where.split(" ")[1]!.replace("°", ""));
    assert.ok(az >= 150 ? r.count <= 4 : r.count === 0, `inchworm ${r.where}: ${r.count}`);
  }
});

test("3D: squat cheats count nothing from any angle", () => {
  const none: [string, (e: number, i: number) => V.Body, V.Seg[]][] = [
    ["quarter squats", (e) => V.squatBody(e, { bottomY: 0.75 }), SQUAT_SET],
    ["good mornings (waist bend, straight legs)", (e) => V.goodMorningBody(e), SQUAT_SET],
    ["good mornings with bent knees", (e) => V.goodMorningBody(e, { kneeBend: 45, torso: 90 }), SQUAT_SET],
    ["jumping jacks", (e) => V.jumpBody(e, { jacks: true }), [V.hold(1, 1000), ...V.reps(N3, 900), V.hold(1, 500)]],
    ["bouncing in place", (e) => V.jumpBody(e), [V.hold(1, 1000), ...V.reps(N3, 700), V.hold(1, 500)]],
    ["dropping to the knees", (e) => V.kneelBody(e), [V.hold(1, 1000), ...V.reps(N3, 3000), V.hold(1, 500)]],
    ["high knees", (e, i) => V.highKneeBody(e, i), [V.hold(1, 1000), ...V.reps(N3, 1600), V.hold(1, 500)]],
    ["high knees with a dip", (e, i) => V.highKneeBody(e, i, { dip: 0.12 }), [V.hold(1, 1000), ...V.reps(N3, 1600), V.hold(1, 500)]],
  ];
  for (const [name, body, script] of none) {
    const rs = grid({ kind: "squat", body, script });
    if (name === "high knees with a dip") assert.ok(counted(rs) <= 1, `${name}: ${cheats(rs).join(", ")}`);
    else assert.deepEqual(cheats(rs), [], name);
  }
});

test("3D: a cheat after a real start pose still counts nothing (front, oblique, behind)", () => {
  for (const azimuth of [0, 45, 135]) {
    const cam: V.Cam = { azimuth, height: 0.1, distance: 2.5, landscape: true };
    const real = { kind: "pushup" as const, body: (e: number) => V.pushupBody(e), cam, noise: { ...NOISE_3D, seed: azimuth + 1 } };
    const after = (body: (e: number) => V.Body) => run("pushup", 4 / 3, [...V.film([V.hold(1, 1000)], real), ...V.film(V.reps(6), { ...real, body }, 1000)]);
    const cobra = after((e) => V.proneBody(e));
    assert.equal(ofType(cobra.events, "ready").length, 1, `${azimuth}°: ready from the real plank`);
    assert.equal(cobra.count, 0, `${azimuth}°: cobra`);
    assert.ok(faults(cobra.events).includes("hips"), `${azimuth}°: cobra is hips`);
    const half = after((e) => V.pushupBody(e, { bottomY: 0.42 }));
    assert.equal(half.count, 0, `${azimuth}°: half reps`);
    assert.equal(ofType(half.events, "half_rep").length, 6, `${azimuth}°: six half reps`);
    const inch = after((e) => V.pushupBody(e, { straightArms: true, slide: 0.5 }));
    assert.equal(inch.count, 0, `${azimuth}°: inchworm`);
    assert.deepEqual(faults(inch.events), new Array(6).fill("hands_not_planted"), `${azimuth}°: inchworm`);
  }
});

test("3D: freezes, stand-ups during the freeze, occlusion and walking to the mat work from the front too", () => {
  for (const azimuth of [0, 45, 135]) {
    const cam: V.Cam = { azimuth, height: 0.1, distance: 2.5, landscape: true };
    const sc: V.Scene = { kind: "pushup", body: (e) => V.pushupBody(e), cam, noise: { ...NOISE_3D, seed: azimuth + 2 } };
    const fr = 1000 + 4 * 1500;
    const pauses: [number, number][] = [[fr + DT, fr + 3500]];
    const held = run("pushup", 4 / 3, V.film([V.hold(1, 1000), ...V.reps(4), V.hold(1, 3500), ...V.reps(4), V.hold(1, 500)], sc), pauses);
    assert.equal(held.count, 8, `${azimuth}°: held through the freeze`);
    assert.equal(ofType(held.events, "setup").length, 1);
    // Standing up for the freeze gesture, then straight back into reps after 150 ms at the top.
    const stood = run("pushup", 4 / 3, [...V.film([V.hold(1, 1000), ...V.reps(4)], sc), ...V.film([V.hold(1, 3500)], { ...sc, body: (e) => V.standingArmsBody(e) }, fr + DT),
      ...V.film([V.hold(1, 150), ...V.reps(4), V.hold(1, 500)], sc, fr + 3550)], pauses);
    assert.equal(stood.count, 8, `${azimuth}°: stood up during the freeze`);
    // 600 ms without a pose at the bottom of rep 4: that rep is lost, the rest count.
    const lost = run("pushup", 4 / 3, V.film([V.hold(1, 1000), ...V.reps(3), V.move(1, 0, 750), V.gap(600), V.move(0, 1, 750), V.hold(1, 800), ...V.reps(3), V.hold(1, 500)], sc));
    assert.equal(lost.count, 6, `${azimuth}°: occlusion`);
    assert.equal(ofType(lost.events, "lost").length, 1);
    // Standing close to the phone first (arms hanging straight: a bigger gap than the plank's), then down on the mat.
    const walk = run("pushup", 4 / 3, [...V.film([V.hold(1, 2000)], { ...sc, body: (e) => V.standingArmsBody(e), cam: { ...cam, distance: 1.6 } }),
      ...V.film([V.gap(1000), V.hold(1, 1000), ...V.reps(5), V.hold(1, 500)], sc, 2000)]);
    assert.equal(walk.count, 5, `${azimuth}°: walked to the mat`);
  }
  const sq: V.Scene = { kind: "squat", body: (e) => V.squatBody(e), cam: { azimuth: 0, height: 0.8, distance: 2.5, landscape: false }, noise: { ...NOISE_3D, seed: 5 } };
  const fr = 1000 + 4 * 2000;
  const r = run("squat", 3 / 4, V.film([V.hold(1, 1000), ...V.reps(4, 2000), V.hold(1, 3500), ...V.reps(4, 2000), V.hold(1, 500)], sq), [[fr + DT, fr + 3500]]);
  assert.equal(r.count, 8, "squats through a freeze, head-on");
});

test("3D: when the far side is hidden more (stronger occlusion, more flips and jumps) honest sets still count", () => {
  const hard: V.Noise = { px: 8, occlusion: 0.65, flip: 0.05, jump: 0.05, dip: 0.05, bodyOcclusion: 0.35 };
  const push = grid({ kind: "pushup", body: (e) => V.pushupBody(e), script: PUSH_SET, noise: hard });
  assert.ok(counted(push) >= push.length * N3 - 9, `push-ups: ${misses(push).join(", ")}`);
  for (const r of push) assert.ok(r.count >= N3 - 1, `push-ups ${r.where}: ${r.count}`);
  const squat = grid({ kind: "squat", body: (e) => V.squatBody(e), script: SQUAT_SET, noise: hard });
  // From close behind and low (1.8 m, lens on the floor) the far hip and knee are guesses: the worst case loses 7.
  assert.ok(counted(squat) >= squat.length * N3 - 12, `squats: ${misses(squat).join(", ")}`);
  for (const [kind, body, script] of [["pushup", (e: number) => V.uprightDipBody(e), PUSH_SET], ["pushup", (e: number) => V.proneBody(e), PUSH_SET],
    ["squat", (e: number) => V.squatBody(e, { bottomY: 0.75 }), SQUAT_SET], ["squat", (e: number) => V.goodMorningBody(e), SQUAT_SET]] as const) {
    const rs = grid({ kind, body, script, noise: hard });
    assert.ok(counted(rs) <= 1, `${kind} cheat, hard noise: ${cheats(rs).join(", ")}`);
  }
});

test("3D: piked hips are refused from the side and obliquely, as the side reading refuses them; slight form still counts", () => {
  // The hips 20 cm above the straight line through the whole set. The hip-height check alone let this by from every
  // angle (perspective changes the hip's apparent height); the side reading's body line, applied to the midpoints
  // wherever the body is not seen end-on (V_PUSHUP_LINE_SPAN), refuses it from 75° to 135°. A limit: head-on, from
  // 30–60° and from behind (150–180°) the body is too end-on for a 2D line and a pike can still pass.
  const piked = grid({ kind: "pushup", body: (e) => V.pushupBody(e, { sag: -0.2 }), script: PUSH_SET, azimuths: [75, 90, 105, 120, 135] });
  assert.deepEqual(cheats(piked), []);
  // Hips 8 cm high (ordinary form) still count from every angle.
  const slight = grid({ kind: "pushup", body: (e) => V.pushupBody(e, { sag: -0.08 }), script: PUSH_SET });
  assert.deepEqual(misses(slight.filter((r) => !sideOn(r.where))), []);
  for (const r of slight.filter((x) => sideOn(x.where))) assert.ok(r.count >= N3 - 1, `side-on ${r.where}: ${r.count}`);
});

test("3D: knees-on-the-floor push-ups are refused head-on (a limit: obliquely, from the side and from behind they can pass)", () => {
  const rs = grid({ kind: "pushup", body: (e) => V.kneePushupBody(e), script: PUSH_SET, azimuths: [0] });
  assert.deepEqual(cheats(rs), []);
});

test("view: side for the side-on fixtures, front head-on, oblique at 45°, null before a pose", () => {
  const c = new RepCounter("pushup", LANDSCAPE);
  assert.equal(c.view, null);
  c.push({ t: 0, p: [] });
  assert.equal(c.view, null);
  c.push({ t: 50, p: pushupSample(170) });
  assert.equal(c.view, "side");
  assert.equal(c.side, "left");
  const at = (azimuth: number, kind: Exercise) => {
    const cam: V.Cam = { azimuth, height: kind === "pushup" ? 0.1 : 0.9, distance: 2.5, landscape: kind === "pushup" };
    const k = new RepCounter(kind, V.aspectOf(cam));
    for (const s of V.film([V.hold(1, 1500)], { kind, body: (e) => (kind === "pushup" ? V.pushupBody(e) : V.squatBody(e)), cam, noise: { seed: 1, px: 2, occlusion: 0.3 } })) k.push(s);
    return { view: k.view, side: k.side };
  };
  for (const kind of ["pushup", "squat"] as const) {
    assert.deepEqual(at(0, kind), { view: "front", side: null }, kind);
    assert.deepEqual(at(180, kind), { view: "front", side: null }, kind);
    assert.equal(at(45, kind).view, "oblique", kind);
    assert.equal(at(90, kind).view, "side", kind);
  }
});

// ── Trace and replay ──

test("pause windows are skipped: movement during a pause never counts, live or on the server", () => {
  const script = [hold(170, 1000), ...reps(2, 70), ...reps(3, 70), hold(170, 1000), ...reps(2, 70)];
  const samples = series(script, (a) => pushupSample(a));
  const from = 1000 + 2 * 1500 + DT, to = 1000 + 5 * 1500; // inclusive window over the middle three reps
  const r = run("pushup", LANDSCAPE, samples, [[from, to]]);
  assert.equal(r.count, 4);
  assert.equal(r.server.count, 4);
  // Without the pause all seven count: the window is what removes them.
  assert.equal(countReps(toTrace("pushup", LANDSCAPE, samples)).count, 7);
});

test("a pause right after a rep needs the start pose again, with a setup event and no lost event", () => {
  const script = [hold(170, 1000), ...reps(3, 70), hold(170, 3000), hold(170, 600), ...reps(2, 70)];
  const samples = series(script, (a) => pushupSample(a));
  const r = run("pushup", LANDSCAPE, samples, [[1000 + 3 * 1500 + DT, 1000 + 3 * 1500 + 3000]]);
  assert.equal(r.count, 5);
  assert.equal(ofType(r.events, "lost").length, 0);
  assert.equal(ofType(r.events, "setup").length, 1);
  assert.equal(ofType(r.events, "ready").length, 2);
});

test("countReps is deterministic and equals the live count across a mixed session", () => {
  const rand = rng(42);
  // 3 good, 2 half, 2 too fast, 1 lost to occlusion, then 2 good, 1 inside a pause, a hold, 2 good.
  const script = [hold(170, 1000), ...reps(3, 70), ...reps(2, 105), ...reps(2, 70, 700), move(170, 70, 750), gap(600), move(70, 170, 750),
    hold(170, 800), ...reps(2, 65, 1800), ...rep(65, 1800), hold(170, 800), ...reps(2, 65, 1800), hold(170, 300)];
  const samples = series(script, (a) => pushupSample(Math.max(5, Math.min(180, a + (rand() * 2 - 1) * 4))));
  const pausedFrom = 1000 + 3 * 1500 + 2 * 1500 + 2 * 700 + 750 + 600 + 750 + 800 + 2 * 1800; // the third rep after the occlusion
  const pauses: [number, number][] = [[pausedFrom + DT, pausedFrom + 1800]];
  assert.ok(samples.some((s) => s.t >= pauses[0]![0] && s.t <= pauses[0]![1]), "the pause covers samples");
  const a = run("pushup", LANDSCAPE, samples, pauses);
  const trace = toTrace("pushup", LANDSCAPE, samples, pauses);
  assert.deepEqual(countReps(trace), countReps(structuredClone(trace)));
  assert.equal(a.count, 7, "3 + 2 + 2: the paused rep is not counted");
  assert.equal(countReps({ ...trace, pauses: [] }).count, 8, "without the pause it would have counted");
});

test("empty samples and 36 zeros are the same (live sees [], the trace stores zeros)", () => {
  const script = [hold(170, 1000), ...reps(2, 70), gap(1000), hold(170, 800), ...reps(2, 70)];
  const samples = series(script, (a) => pushupSample(a));
  const r = run("pushup", LANDSCAPE, samples);
  assert.equal(r.count, 4);
});

test("out-of-order and duplicate timestamps are ignored", () => {
  const c = new RepCounter("pushup", LANDSCAPE);
  c.push({ t: 100, p: pushupSample(170) });
  assert.deepEqual(c.push({ t: 100, p: pushupSample(60) }), []);
  assert.deepEqual(c.push({ t: 50, p: pushupSample(60) }), []);
  assert.ok(c.angle! > 165);
});

test("parseTrace rejects malformed traces", () => {
  const good = toTrace("squat", PORTRAIT, series([hold(172, 500)], (a) => squatSample(a)), [[100, 200]]);
  assert.ok(parseTrace(good));
  const bad: unknown[] = [
    null, 7, "trace", { ...good, v: 2 }, { ...good, engine: "reps@2" }, { ...good, exercise: "situp" }, { ...good, aspect: 0 },
    { ...good, aspect: Number.NaN }, { ...good, t: good.t.slice(1) }, { ...good, t: [...good.t].reverse() },
    { ...good, t: good.t.map((t, i) => (i === 3 ? t + 0.5 : t)) }, { ...good, p: good.p.map((x, i) => (i === 2 ? 101 : x)) },
    { ...good, p: good.p.map((x, i) => (i === 0 ? 1.5 : x)) }, { ...good, pauses: [[200, 100]] }, { ...good, pauses: [[1]] },
    { ...good, pauses: "none" },
    { ...good, pauses: [[300, 400], [100, 200]] }, // unsorted
    { ...good, pauses: [[100, 300], [200, 400]] }, // overlapping
    { ...good, pauses: [[100, 200], [200, 300]] }, // inclusive windows sharing a millisecond overlap
    { ...good, pauses: Array.from({ length: MAX_PAUSES + 1 }, (_, i) => [i * 10, i * 10 + 5]) },
  ];
  for (const b of bad) assert.equal(parseTrace(b), null, JSON.stringify(b)?.slice(0, 80));
  assert.ok(parseTrace({ ...good, pauses: Array.from({ length: MAX_PAUSES }, (_, i) => [i * 10, i * 10 + 5]) }), "16 disjoint pauses are fine");
  assert.ok(parseTrace({ ...good, pauses: [[100, 200], [201, 300]] }), "adjacent pauses are fine");
  assert.equal(parseTrace(good, 5), null, "sample cap");
});

// ── Golden vectors (test-vectors/reps-vectors.json) ──
// Recorded traces with their expected count, rep timings, faults and a bit-exact hash of every smoothed angle, so
// another JS engine (the app's Hermes) can be checked against V8 on the same inputs. The traces are generated by
// the fixtures above; regenerate the file only when the engine's behaviour is meant to change:
//   REPS_VECTORS_WRITE=1 pnpm --filter @kept/engine exec tsx --test src/reps.test.ts

const VECTORS_URL = new URL("../test-vectors/reps-vectors.json", import.meta.url);

function vectorTraces(): { name: string; about: string; count: number; trace: Trace }[] {
  const noisy = (seed: number, script: Seg[], amp: number, spikeEvery: number) => {
    const rand = rng(seed);
    return angles(script).map((x, i) => {
      if (x === null) return null;
      const n = x + (rand() * 2 - 1) * amp;
      return Math.max(5, Math.min(180, i > 0 && i % spikeEvery === 0 ? n + (n > 120 ? -70 : 70) : n));
    });
  };
  const sampled = (a: (number | null)[], pose: (x: number) => number[]): RepSample[] => a.map((x, i) => ({ t: i * DT, p: x === null ? EMPTY : pose(x) }));
  const pushups = sampled(noisy(7, [hold(170, 1000), ...reps(5, 70), hold(170, 500)], 3, 13), (x) => pushupSample(x));
  const squats = sampled(noisy(11, [hold(172, 1000), ...reps(3, 80, 2000, 172), ...rep(95, 2000, 172), hold(172, 500)], 3, 17), (x) => squatSample(x));
  const cheat = sampled(noisy(5, [hold(170, 1000), ...reps(4, 60)], 2, 1000), supinePressSample);
  const pausedScript = [hold(170, 1000), ...reps(3, 70), ...rep(70), hold(170, 800), move(170, 70, 750), gap(300), move(70, 170, 750), ...rep(70), hold(170, 500)];
  const paused = sampled(noisy(3, pausedScript, 3, 11), (x) => pushupSample(x));
  const pauseFrom = 1000 + 3 * 1500;
  const belly = sampled(noisy(9, [hold(170, 1000), ...reps(4, 60)], 2, 1000), (x) => bellyPropSample(x, 30));
  const cobra = sampled(noisy(13, [hold(170, 1000), ...reps(4, 70)], 2, 1000), (x) => cobraSample(x));
  // 4 reps, a 3.5 s freeze (pause window) holding the plank, then 4 more with no still hold.
  const freezeAt = 1000 + 4 * 1500;
  const frozen = sampled(noisy(17, [hold(170, 1000), ...reps(4, 70), hold(170, 3500), ...reps(4, 70), hold(170, 500)], 3, 19), (x) => pushupSample(x));
  // The vertical reading (3D fixtures, reps3d.fixtures.ts): head-on and 45° sets, honest and cheating.
  const film3 = (kind: Exercise, body: (e: number, i: number) => V.Body, script: V.Seg[], cam: V.Cam, seed: number) =>
    toTrace(kind, V.aspectOf(cam), V.film(script, { kind, body, cam, noise: { ...NOISE_3D, seed } }));
  const frontCam: V.Cam = { azimuth: 0, height: 0.1, distance: 2.5, landscape: true };
  const obliqueSquatCam: V.Cam = { azimuth: 45, height: 0.9, distance: 2.5, landscape: false };
  return [
    { name: "pushups", about: "5 push-ups, ±3° noise and a 70° landmark flip every 13 samples", count: 5, trace: toTrace("pushup", LANDSCAPE, pushups) },
    { name: "squats", about: "3 deep squats and one above parallel (counts, depth hint), ±3° noise, flips every 17 samples", count: 4, trace: toTrace("squat", PORTRAIT, squats) },
    { name: "cheat-supine-press", about: "lying on the back pressing the arms up: never ready, hands_not_planted", count: 0, trace: toTrace("pushup", LANDSCAPE, cheat) },
    { name: "paused-session", about: "3 push-ups, one inside a pause window, a hold, one with a 300 ms dropout, one more", count: 5,
      trace: toTrace("pushup", LANDSCAPE, paused, [[pauseFrom + DT, pauseFrom + 1500]]) },
    { name: "cheat-belly-prop", about: "lying on the belly propped on the arms, hands in front of the shoulders: never ready, hands_not_planted", count: 0,
      trace: toTrace("pushup", LANDSCAPE, belly) },
    { name: "cheat-cobra", about: "cobra push-ups, hips on the floor (long torso, so ready): every rep rejected as hips", count: 0,
      trace: toTrace("pushup", LANDSCAPE, cobra) },
    { name: "freeze-resume", about: "4 push-ups, a 3.5 s freeze pause (setup), 4 more resumed at the first top without a still hold", count: 8,
      trace: toTrace("pushup", LANDSCAPE, frozen, [[freezeAt + DT, freezeAt + 3500]]) },
    { name: "front-pushups", about: "6 push-ups filmed head-on from the floor (3D fixture, vertical reading), landmark noise, flips and jumps", count: 6,
      trace: film3("pushup", (e) => V.pushupBody(e), [V.hold(1, 1000), ...V.reps(6, 1500), V.hold(1, 500)], frontCam, 101) },
    { name: "oblique-squats", about: "5 squats filmed at 45° from 0.9 m (3D fixture, vertical reading), landmark noise, flips and jumps", count: 5,
      trace: film3("squat", (e) => V.squatBody(e), [V.hold(1, 1000), ...V.reps(5, 2000), V.hold(1, 500)], obliqueSquatCam, 102) },
    { name: "cheat-front-arm-dips", about: "standing arm dips against a table, filmed head-on: never ready, not_plank", count: 0,
      trace: film3("pushup", (e) => V.uprightDipBody(e), [V.hold(1, 1000), ...V.reps(5, 1500), V.hold(1, 500)], frontCam, 103) },
    { name: "cheat-oblique-good-morning", about: "good mornings (waist bend, legs straight) filmed at 45°: the hips never drop, nothing counts", count: 0,
      trace: film3("squat", (e) => V.goodMorningBody(e), [V.hold(1, 1000), ...V.reps(5, 2000), V.hold(1, 500)], obliqueSquatCam, 104) },
  ];
}

/** JSON with every array of numbers on one line (the traces are long). */
const compactJson = (x: unknown) => JSON.stringify(x, null, 2).replace(/\[\s*(-?[\d.]+(?:,\s*-?[\d.]+)*)\s*\]/g, (_, body: string) => `[${body.replace(/\s+/g, "")}]`);

if (process.env.REPS_VECTORS_WRITE === "1") {
  const vectors = vectorTraces().map(({ name, about, count, trace }) => {
    const expect = traceDigest(trace);
    assert.equal(expect.count, count, `${name}: the fixture does what it says`);
    return { name, about, trace, expect };
  });
  writeFileSync(VECTORS_URL, compactJson({
    $meta: {
      about: "Rep engine golden vectors (docs/notes/REP_COUNTER_CONTRACT.md). Replay each trace with traceDigest(trace) and compare with expect: count, rep timings, fault events and angleHash (FNV-1a 32 over the little-endian IEEE-754 bytes of the smoothed angle after every pushed sample, 0xff×8 for null).",
      engine: "reps@1",
      generatedBy: "REPS_VECTORS_WRITE=1 pnpm --filter @kept/engine exec tsx --test src/reps.test.ts",
    },
    vectors,
  }) + "\n");
}

test("golden vectors on disk replay to the same digest (regenerate: see the comment above)", () => {
  const file = JSON.parse(readFileSync(VECTORS_URL, "utf8")) as { vectors: { name: string; trace: unknown; expect: unknown }[] };
  assert.deepEqual(file.vectors.map((v) => v.name),
    ["pushups", "squats", "cheat-supine-press", "paused-session", "cheat-belly-prop", "cheat-cobra", "freeze-resume",
      "front-pushups", "oblique-squats", "cheat-front-arm-dips", "cheat-oblique-good-morning"]);
  const intended: Record<string, number> = { pushups: 5, squats: 4, "cheat-supine-press": 0, "paused-session": 5, "cheat-belly-prop": 0,
    "cheat-cobra": 0, "freeze-resume": 8, "front-pushups": 6, "oblique-squats": 5, "cheat-front-arm-dips": 0, "cheat-oblique-good-morning": 0 };
  for (const v of file.vectors) {
    const trace = parseTrace(v.trace);
    assert.ok(trace, `${v.name}: a valid trace`);
    const d = traceDigest(trace);
    assert.deepEqual(d, v.expect, v.name);
    assert.equal(d.count, intended[v.name], `${v.name}: count`);
    assert.deepEqual(countReps(trace), { count: d.count, reps: d.reps }, `${v.name}: countReps agrees`);
  }
});

test("traceDigest notices a one-ulp change in a single angle input", () => {
  const [v] = vectorTraces();
  const a = traceDigest(v!.trace);
  const p = [...v!.trace.p];
  p[60 * SAMPLE_INTS + 4 * 3] = p[60 * SAMPLE_INTS + 4 * 3]! + 1; // one thousandth of the frame on the wrist at sample 60
  const b = traceDigest({ ...v!.trace, p });
  assert.equal(a.count, b.count);
  assert.notEqual(a.angleHash, b.angleHash);
});
