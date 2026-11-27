// Test-only fixtures for the rep engine (packages/engine/src/reps.test.ts): a 3D stick body (the 12 JOINTS) doing
// push-ups, squats and cheats, seen by a pinhole camera at any azimuth, height, distance and roll, with landmark
// noise, left/right flips, single-joint jumps and the visibility drops MediaPipe gives occluded joints. Not part of
// the engine (nothing imports it outside the tests); Math.sin/cos are fine here.

import type { Exercise, RepSample } from "./reps";

export type V3 = { x: number; y: number; z: number }; // metres; y up, floor at y = 0
/** The 12 joints in JOINTS order pairs: [shoulder, elbow, wrist, hip, knee, ankle] for the left, then the right. */
export type Body = { left: V3[]; right: V3[] };

const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V3, b: V3): V3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: V3, k: number): V3 => v(a.x * k, a.y * k, a.z * k);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const norm = (a: V3) => Math.sqrt(dot(a, a));
const unit = (a: V3) => mul(a, 1 / norm(a));
const mid = (a: V3, b: V3) => mul(add(a, b), 0.5);
const rad = (d: number) => (d * Math.PI) / 180;

/** Two-link IK: the elbow (knee) between root S and end W, bending towards `bend` (any vector off the S–W line). */
function ik(S: V3, W: V3, l1: number, l2: number, bend: V3): V3 {
  const dv = sub(W, S);
  const d = Math.min(norm(dv), l1 + l2 - 1e-6);
  const u = unit(dv);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const n = unit(sub(bend, mul(u, dot(bend, u))));
  return add(add(S, mul(u, a)), mul(n, h));
}

// ── Bodies (person frame: +x is where the head points in a push-up / where the person faces when standing; +z is the
// person's left; y up). ──

export const ARM = { upper: 0.3, fore: 0.27 };
const W = { shoulder: 0.19, hip: 0.13, knee: 0.12, ankle: 0.11, hand: 0.27 };
const TOE_ANKLE_Y = 0.09; // ankle joint height on the toes
const WRIST_Y = 0.04;
const ANKLE_TO_HIP = 0.9;
const ANKLE_TO_SHOULDER = 1.42;
/** Shoulder height at a push-up lockout (arms straight, hands a little wider than the shoulders). */
export const PUSHUP_TOP_Y = WRIST_Y + Math.sqrt((ARM.upper + ARM.fore - 0.01) ** 2 - (W.hand - W.shoulder) ** 2);

function pair(c: V3, half: number): [V3, V3] {
  return [add(c, v(0, 0, half)), add(c, v(0, 0, -half))];
}

function assemble(sh: [V3, V3], el: [V3, V3], wr: [V3, V3], hip: [V3, V3], kn: [V3, V3], an: [V3, V3]): Body {
  return { left: [sh[0], el[0], wr[0], hip[0], kn[0], an[0]], right: [sh[1], el[1], wr[1], hip[1], kn[1], an[1]] };
}

export type PushupOpts = {
  /** Shoulder height at the bottom, metres (full push-up 0.15–0.22, elbows at ~90°: 0.30; half rep: ≥ 0.40). */
  bottomY?: number;
  /** Elbow flare from the body, degrees (0 tucked along the body, 90 straight out sideways). */
  flare?: number;
  /** Hip lowered below the straight body line, metres (> 0 sagging, < 0 piked). */
  sag?: number;
  /** Hands this far in front of (> 0) the shoulders at the lockout, metres. */
  handFwd?: number;
  /** Hands slide this far along the floor towards the head (> 0) or feet over the rep, at the bottom, metres. */
  slide?: number;
  /** Arms stay straight (the shoulders only go down because the hands slide forward: an inchworm). */
  straightArms?: boolean;
  /** Rocking on locked arms: the whole straight body slides this far forward over the planted hands (feet sliding too),
   *  metres at the bottom; the shoulders drop only because the arms tilt. */
  rock?: number;
};

/** A push-up on the toes, e = 1 at the lockout, 0 at the bottom. Ankles at the origin, the head towards +x. */
export function pushupBody(e: number, o: PushupOpts = {}): Body {
  if (o.rock) {
    const betaTop = Math.asin((PUSHUP_TOP_Y - TOE_ANKLE_Y) / ANKLE_TO_SHOULDER);
    const handX = ANKLE_TO_SHOULDER * Math.cos(betaTop), r = o.rock * (1 - e);
    const reach = ARM.upper + ARM.fore - 0.01, dz = W.hand - W.shoulder;
    const sy = WRIST_Y + Math.sqrt(Math.max(0.0001, reach * reach - r * r - dz * dz));
    const beta = Math.asin((sy - TOE_ANKLE_Y) / ANKLE_TO_SHOULDER);
    const sc = v(handX + r, sy, 0), ac = v(handX + r - ANKLE_TO_SHOULDER * Math.cos(beta), TOE_ANKLE_Y, 0);
    const hc = v(ac.x + ANKLE_TO_HIP * Math.cos(beta), TOE_ANKLE_Y + ANKLE_TO_HIP * Math.sin(beta), 0);
    const sh = pair(sc, W.shoulder), wr = pair(v(handX, WRIST_Y, 0), W.hand);
    const el = sh.map((q, i) => mid(q, wr[i]!)) as [V3, V3]; // straight arms
    return assemble(sh, el, wr, pair(hc, W.hip), pair(mid(hc, ac), W.knee), pair(ac, W.ankle));
  }
  const bottomY = o.bottomY ?? 0.18, flare = rad(o.flare ?? 45), sag = o.sag ?? 0;
  const betaTop = Math.asin((PUSHUP_TOP_Y - TOE_ANKLE_Y) / ANKLE_TO_SHOULDER);
  const handX = ANKLE_TO_SHOULDER * Math.cos(betaTop) + (o.handFwd ?? 0) + (o.slide ?? 0) * (1 - e);
  let sy = bottomY + e * (PUSHUP_TOP_Y - bottomY);
  if (o.straightArms) {
    // The shoulder stays over the same floor point; the arm stays straight while the hands move away.
    const reach = ARM.upper + ARM.fore - 0.0005, dx = handX - ANKLE_TO_SHOULDER * Math.cos(betaTop), dz = W.hand - W.shoulder; // elbows ~175°
    sy = WRIST_Y + Math.sqrt(Math.max(0.0001, reach * reach - dx * dx - dz * dz));
  }
  const beta = Math.asin((sy - TOE_ANKLE_Y) / ANKLE_TO_SHOULDER);
  const sc = v(o.straightArms ? ANKLE_TO_SHOULDER * Math.cos(betaTop) : ANKLE_TO_SHOULDER * Math.cos(beta), sy, 0);
  const hc = v(ANKLE_TO_HIP * Math.cos(beta), TOE_ANKLE_Y + ANKLE_TO_HIP * Math.sin(beta) - sag, 0);
  const ac = v(0, TOE_ANKLE_Y, 0);
  const kc = mid(hc, ac); // straight legs: the knee stays on the hip–ankle line (the sag bends the body at the hips)
  const sh = pair(sc, W.shoulder), wr = pair(v(handX, WRIST_Y, 0), W.hand);
  const el = [0, 1].map((i) => ik(sh[i]!, wr[i]!, ARM.upper, ARM.fore, v(-Math.cos(flare), 0.2, (i === 0 ? 1 : -1) * Math.sin(flare)))) as [V3, V3];
  return assemble(sh, el, wr, pair(hc, W.hip), pair(kc, W.knee), pair(ac, W.ankle));
}

/** Knees on the floor push-up (a limit: it may pass from some angles). */
export function kneePushupBody(e: number): Body {
  const kneeY = 0.07, kneeToShoulder = 0.95, kneeToHip = 0.45;
  const topY = PUSHUP_TOP_Y, sy = 0.2 + e * (topY - 0.2);
  const betaTop = Math.asin((topY - kneeY) / kneeToShoulder), beta = Math.asin((sy - kneeY) / kneeToShoulder);
  const kc = v(0, kneeY, 0), sc = v(kneeToShoulder * Math.cos(beta), sy, 0);
  const hc = v(kneeToHip * Math.cos(beta), kneeY + kneeToHip * Math.sin(beta), 0);
  const ac = v(-0.4, 0.12, 0);
  const sh = pair(sc, W.shoulder), wr = pair(v(kneeToShoulder * Math.cos(betaTop), WRIST_Y, 0), W.hand);
  const el = [0, 1].map((i) => ik(sh[i]!, wr[i]!, ARM.upper, ARM.fore, v(-0.7, 0.2, (i === 0 ? 0.7 : -0.7)))) as [V3, V3];
  return assemble(sh, el, wr, pair(hc, W.hip), pair(kc, W.knee), pair(ac, W.ankle));
}

/**
 * Upright arm dips against a support: standing with the hands on a table edge (0.85 m) or kneeling with them on a
 * chair seat (0.45 m), the body a straight line from the ankles (knees) leaning onto the arms. At the top the arms
 * are straight and square to the body; bending them brings the chest down towards the hands (the body pivots).
 */
export function uprightDipBody(e: number, o: { kneeling?: boolean; supportY?: number } = {}): Body {
  const kneeling = o.kneeling ?? false;
  const pivotY = kneeling ? 0.07 : TOE_ANKLE_Y; // knees or ankles
  const R = kneeling ? 0.95 : ANKLE_TO_SHOULDER, Rh = kneeling ? 0.45 : ANKLE_TO_HIP;
  const supportY = o.supportY ?? (kneeling ? 0.45 : 0.85);
  const reach = Math.sqrt((ARM.upper + ARM.fore - 0.01) ** 2 - (W.hand - W.shoulder) ** 2); // in the body's plane
  // Top: the shoulder on the circle of radius R about the pivot, the arm square to the body, the hands at supportY.
  // Solve for the body angle where shoulder + reach·(sin β, −cos β) lands at the support's height.
  let beta = Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const y = pivotY + R * Math.sin(beta) - reach * Math.cos(beta);
    beta += (supportY - y) * 0.5;
  }
  const S0 = v(R * Math.cos(beta), pivotY + R * Math.sin(beta), 0);
  const hand = v(S0.x + reach * Math.sin(beta), supportY, 0);
  // Lower: the shoulder slides down the same circle until it is d from the hands (d from reach at the top to 0.22).
  const d = 0.22 + e * (reach - 0.22);
  let b = beta;
  for (let i = 0; i < 400; i++) {
    const S = v(R * Math.cos(b), pivotY + R * Math.sin(b), 0);
    if (Math.hypot(S.x - hand.x, S.y - hand.y) <= d) break;
    b -= 0.002;
  }
  const sc = v(R * Math.cos(b), pivotY + R * Math.sin(b), 0);
  const hc = v(Rh * Math.cos(b), pivotY + Rh * Math.sin(b), 0);
  const pc = v(0, pivotY, 0);
  const sh = pair(sc, W.shoulder), wr = pair(hand, W.hand);
  const el = [0, 1].map((i) => ik(sh[i]!, wr[i]!, ARM.upper, ARM.fore, v(-0.6, -0.2, (i === 0 ? 0.8 : -0.8)))) as [V3, V3];
  const kc = kneeling ? pc : mid(hc, pc);
  const ac = kneeling ? v(-0.42, 0.1, 0) : pc;
  return assemble(sh, el, wr, pair(hc, W.hip), pair(kc, W.knee), pair(ac, W.ankle));
}

/** Standing tall, arms bending in front of the body (curls / air presses): the wrists move, the body doesn't. */
export function standingArmsBody(e: number, o: { press?: boolean } = {}): Body {
  const hc = v(0, 0.93, 0), sc = v(0, 1.45, 0), ac = v(0, 0.08, 0);
  const sh = pair(sc, W.shoulder);
  const ang = rad(10 + (1 - e) * 120); // elbow bend
  const el = sh.map((s) => (o.press ? add(s, v(0.15, -0.25, 0)) : add(s, v(0, -ARM.upper, 0)))) as [V3, V3];
  const wr = el.map((q) => add(q, v(ARM.fore * Math.sin(ang), -ARM.fore * Math.cos(ang), 0))) as [V3, V3];
  return assemble(sh, el, wr, pair(hc, W.hip), pair(mid(hc, ac), W.knee), pair(ac, W.ankle));
}

/** Hips on the floor (cobra), or propped on straight arms with the hands in front (belly prop). */
export function proneBody(e: number, o: { belly?: boolean } = {}): Body {
  const hipY = 0.12, ac = v(0, 0.07, 0), hc = v(0.95, hipY, 0), kc = v(0.48, 0.06, 0);
  const reach = ARM.upper + ARM.fore - 0.01;
  let sc: V3, wrX: number;
  if (o.belly) {
    // Hands 0.45 m in front of the shoulders' floor point, the arms at the top straight at ~35°.
    const wristX = hc.x + 0.52 * Math.cos(rad(25)) + 0.45;
    const sy = 0.17 + e * 0.12;
    const torso = 0.52, sx = hc.x + Math.sqrt(Math.max(0, torso * torso - (sy - hipY) ** 2));
    sc = v(sx, sy, 0);
    wrX = wristX;
  } else {
    // Cobra: the torso pivots at the hip, the hands under the shoulders at the top.
    const torso = 0.52, topY = Math.min(hipY + torso * 0.98, WRIST_Y + reach * 0.97);
    const sy = 0.16 + e * (topY - 0.16);
    sc = v(hc.x + Math.sqrt(Math.max(0, torso * torso - (sy - hipY) ** 2)), sy, 0);
    const topX = hc.x + Math.sqrt(Math.max(0, torso * torso - (topY - hipY) ** 2));
    wrX = topX;
  }
  const sh = pair(sc, W.shoulder), wr = pair(v(wrX, WRIST_Y, 0), W.hand);
  const el = [0, 1].map((i) => ik(sh[i]!, wr[i]!, ARM.upper, ARM.fore, v(-0.7, 0.3, (i === 0 ? 0.7 : -0.7)))) as [V3, V3];
  return assemble(sh, el, wr, pair(hc, W.hip), pair(kc, W.knee), pair(ac, W.ankle));
}

export const LEG = { thigh: 0.43, shin: 0.43 };
const SQUAT_TOP_HIP_Y = 0.08 + LEG.shin + LEG.thigh - 0.004;

export type SquatOpts = {
  /** Hip height at the bottom, metres (parallel ≈ 0.5, a bit above 0.6, quarter squat 0.75). */
  bottomY?: number;
  /** Shin lean forward at the bottom, degrees. */
  shin?: number;
  /** Torso lean forward from vertical at the bottom, degrees. */
  torso?: number;
  /** Feet half-width, metres. */
  stance?: number;
};

/** A squat, e = 1 standing, 0 at the bottom. Feet at the origin, facing +x. */
export function squatBody(e: number, o: SquatOpts = {}): Body {
  const bottomY = o.bottomY ?? 0.5, stance = o.stance ?? 0.15;
  const hy = bottomY + e * (SQUAT_TOP_HIP_Y - bottomY);
  const depth = (SQUAT_TOP_HIP_Y - hy) / (SQUAT_TOP_HIP_Y - 0.5); // 0 standing, 1 at parallel
  const lam = rad((o.shin ?? 30) * Math.min(1.2, depth)), tau = rad(5 + ((o.torso ?? 40) - 5) * Math.min(1.2, depth));
  const out = 0.04 * depth; // knees track out over the toes
  const ac = v(0, 0.08, 0);
  const kc = add(ac, v(LEG.shin * Math.sin(lam), LEG.shin * Math.cos(lam), 0));
  const dyThigh = Math.min(LEG.thigh, Math.max(-LEG.thigh, hy - kc.y));
  const hc = v(kc.x - Math.sqrt(Math.max(0, LEG.thigh * LEG.thigh - dyThigh * dyThigh)), hy, 0);
  const sc = add(hc, v(0.52 * Math.sin(tau), 0.52 * Math.cos(tau), 0));
  const sh = pair(sc, W.shoulder);
  const el = sh.map((s) => add(s, v(0.27, -0.05, 0))) as [V3, V3];
  const wr = el.map((q) => add(q, v(0.25, 0, 0))) as [V3, V3];
  const kn = pair(kc, stance - 0.02 + out), an = pair(ac, stance);
  return assemble(sh, el, wr, pair(hc, W.hip), kn, an);
}

/** Good morning: legs (nearly) straight, the hips hinge back and the torso goes down towards horizontal. */
export function goodMorningBody(e: number, o: { torso?: number; kneeBend?: number } = {}): Body {
  const tau = rad(5 + ((o.torso ?? 85) - 5) * (1 - e));
  const kneeBend = rad((o.kneeBend ?? 20) * (1 - e)); // shin forward
  const ac = v(0, 0.08, 0);
  const kc = add(ac, v(LEG.shin * Math.sin(kneeBend), LEG.shin * Math.cos(kneeBend), 0));
  const thighBack = rad(8 + 22 * (1 - e)); // thigh from vertical, backwards
  const hc = add(kc, v(-LEG.thigh * Math.sin(thighBack), LEG.thigh * Math.cos(thighBack), 0));
  const sc = add(hc, v(0.52 * Math.sin(tau), 0.52 * Math.cos(tau), 0));
  const sh = pair(sc, W.shoulder);
  const wr = sh.map((s) => add(s, v(0.1, -0.5, 0))) as [V3, V3];
  const el = sh.map((s, i) => mid(s, wr[i]!)) as [V3, V3];
  return assemble(sh, el, wr, pair(hc, W.hip), pair(kc, 0.13), pair(ac, 0.15));
}

/** Jumping jacks (legs spread, small jump) or bouncing in place (e: 1 on the floor, 0 mid-air / spread). */
export function jumpBody(e: number, o: { jacks?: boolean } = {}): Body {
  const air = 0.12 * (1 - e);
  const spread = o.jacks ? 0.15 + 0.35 * (1 - e) : 0.15;
  const legLen = LEG.thigh + LEG.shin - 0.004;
  const ankleY = 0.08 + air;
  const hipHalf = W.hip;
  const dz = spread - hipHalf;
  const hy = ankleY + Math.sqrt(legLen * legLen - dz * dz) - (o.jacks ? 0 : 0.08 * (1 - e)); // bounce: knees flex a bit
  const hc = v(0, hy, 0), ac = v(0, ankleY, 0);
  const an = pair(ac, spread), hp = pair(hc, hipHalf);
  const kn = [mid(hp[0], an[0]), mid(hp[1], an[1])] as [V3, V3];
  const sh = pair(add(hc, v(0.02, 0.52, 0)), W.shoulder);
  const up = o.jacks ? 1 - e : 0;
  const el = sh.map((s, i) => add(s, v(0, -0.28 + 0.56 * up, (i === 0 ? 1 : -1) * 0.2))) as [V3, V3];
  const wr = el.map((q, i) => add(q, v(0, -0.26 + 0.52 * up, (i === 0 ? 1 : -1) * 0.1))) as [V3, V3];
  return assemble(sh, el, wr, hp, kn, an);
}

/** Marching high knees (e: 1 both feet down, 0 a knee up; legs alternate each rep): the hips stay where they are. */
export function highKneeBody(e: number, i: number, o: { periodMs?: number; dip?: number } = {}): Body {
  const period = o.periodMs ?? 1600;
  const leftUp = Math.floor((i * 50) / period) % 2 === 0;
  const lift = 1 - e;
  const hy = SQUAT_TOP_HIP_Y - (o.dip ?? 0.04) * lift; // the standing knee softens a little
  const hc = v(0, hy, 0);
  const hp = pair(hc, W.hip);
  const leg = (hipP: V3, up: boolean, z: number): [V3, V3] => {
    if (!up) {
      const ankle = v(0, 0.08, z);
      return [ik(hipP, ankle, LEG.thigh, LEG.shin, v(1, 0, 0)), ankle];
    }
    const th = rad(90 * lift); // thigh forward from hanging
    const knee = add(hipP, v(LEG.thigh * Math.sin(th), -LEG.thigh * Math.cos(th), 0));
    return [knee, add(knee, v(0, -LEG.shin, 0))];
  };
  const [lk, la] = leg(hp[0], leftUp, 0.15), [rk, ra] = leg(hp[1], !leftUp, -0.15);
  const sh = pair(add(hc, v(0.02, 0.52, 0)), W.shoulder);
  const el = sh.map((s) => add(s, v(0.05, -0.28, 0))) as [V3, V3];
  const wr = el.map((q) => add(q, v(0.2, -0.1, 0))) as [V3, V3];
  return assemble(sh, el, wr, hp, [lk, rk], [la, ra]);
}

/** Dropping onto the knees and standing back up (not a squat: the knees hit the floor). */
export function kneelBody(e: number): Body {
  // e = 1 standing, 0 kneeling upright (knees on the floor, shins flat behind).
  const ac = v(-0.35 * (1 - e), 0.08, 0);
  const kneeY = 0.08 + (LEG.shin - 0.0) * e;
  const kc = v(0.0, Math.max(0.07, kneeY), 0);
  const hy = kc.y + LEG.thigh - 0.004;
  const hc = v(-0.02, hy, 0);
  const sc = add(hc, v(0.03, 0.52, 0));
  const sh = pair(sc, W.shoulder);
  const el = sh.map((s) => add(s, v(0.27, -0.05, 0))) as [V3, V3];
  const wr = el.map((q) => add(q, v(0.25, 0, 0))) as [V3, V3];
  return assemble(sh, el, wr, pair(hc, W.hip), pair(kc, 0.13), pair(ac, 0.15));
}

// ── Camera ──

export type Cam = {
  /** Degrees around the person: 0 in front (push-up: the head end), 90 the person's left side, 180 behind. */
  azimuth: number;
  /** Lens height above the floor, metres. */
  height: number;
  /** Horizontal distance from the orbit centre, metres. */
  distance: number;
  /** Residual roll, degrees (the app allows up to 20). */
  roll?: number;
  /** Point the camera orbits and aims at (person frame); defaults per exercise. */
  center?: V3;
  /** Frame orientation: landscape (push-ups, 640×480) or portrait (squats, 480×640). */
  landscape: boolean;
  /** Horizontal shift of the person in the frame, metres (off-centre framing). */
  shift?: number;
};

const HFOV_LONG = 64; // degrees across the long side of the frame

export type Noise = {
  seed?: number;
  /** Uniform landmark noise, ± thousandths of the frame. */
  px?: number;
  /** Far-side visibility loss at a pure side view (0.35: far side ~0.6; 0.65: ~0.3, unusable). */
  occlusion?: number;
  /** Probability per sample of a left/right label flip (the whole body). */
  flip?: number;
  /** Probability per sample of one joint jumping by up to ±jumpPx thousandths. */
  jump?: number;
  jumpPx?: number;
  /** Probability per sample of one joint's visibility dipping by 0.3–0.5. */
  dip?: number;
  /** Push-ups: joints hidden behind the body near the bottom in head-on / feet-on views lose this much visibility. */
  bodyOcclusion?: number;
  /** Time-correlated landmark noise: each coordinate's offset follows an AR(1) process with this coefficient (0: the
   *  uniform ±px noise, independent per sample), scaled to the same spread. Real landmarks wobble, they don't hop. */
  ar?: number;
};

/** Seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

type Projected = { x: number; y: number; z: number; vis: number }[];

/** Projects a body (person frame) to normalised image coordinates; visibility by occlusion (no noise). */
/** Floor-level activities (filmed like push-ups: centre 0.7 m from the feet, aimed low, joints hidden near the bottom). */
const FLOOR_KINDS: readonly Exercise[] = ["pushup", "plank"];
export function project(body: Body, cam: Cam, kind: Exercise, depth01 = 0, occlusion = 0.4, bodyOcclusion = 0.25): { left: Projected; right: Projected } {
  const floor = FLOOR_KINDS.includes(kind);
  const center = cam.center ?? (floor ? v(0.7, 0, 0) : kind === "situp" ? v(0.3, 0, 0) : kind === "burpee" ? v(-0.25, 0, 0) : v(0, 0, 0));
  const aimY = floor ? 0.28 : kind === "situp" ? 0.3 : kind === "burpee" ? 0.6 : kind === "jumpingjack" || kind === "press" ? 1.0 : 0.85;
  const az = rad(cam.azimuth);
  const dir = v(Math.cos(az), 0, Math.sin(az)); // centre → camera, horizontal
  const C = add(add(center, mul(dir, cam.distance)), v(0, cam.height, 0));
  const side = cross(dir, v(0, 1, 0)); // horizontal, perpendicular to the view
  const target = add(add(center, v(0, aimY, 0)), mul(side, cam.shift ?? 0));
  const f = unit(sub(target, C));
  let r = unit(cross(f, v(0, 1, 0)));
  let d = cross(f, r);
  const roll = rad(cam.roll ?? 0);
  if (roll !== 0) {
    const r2 = add(mul(r, Math.cos(roll)), mul(d, Math.sin(roll)));
    d = sub(mul(d, Math.cos(roll)), mul(r, Math.sin(roll)));
    r = r2;
  }
  const [Wpx, Hpx] = cam.landscape ? [640, 480] : [480, 640];
  const F = (0.5 * Math.max(Wpx, Hpx)) / Math.tan(rad(HFOV_LONG / 2));
  const facingLeft = dir.z; // > 0: the camera sees the person's left side
  const facingHead = dir.x; // > 0: in front (head end / the person's front)
  const one = (pts: V3[], sideSign: 1 | -1): Projected => pts.map((P, j) => {
    const q = sub(P, C);
    const Zc = dot(q, f);
    const x = 0.5 + (F * dot(q, r)) / (Zc * Wpx), y = 0.5 + (F * dot(q, d)) / (Zc * Hpx);
    let vis = 0.97;
    const far = -sideSign * facingLeft; // > 0: this side faces away from the camera
    if (far > 0) vis -= occlusion * far;
    if (floor) {
      // Head-on, the hips and legs hide behind the chest near the bottom; from the feet, the arms behind the legs.
      if (facingHead > 0 && j >= 3) vis -= bodyOcclusion * facingHead * depth01;
      if (facingHead < 0 && j <= 2) vis -= bodyOcclusion * -facingHead * depth01;
    }
    return { x, y, z: Zc, vis };
  });
  return { left: one(body.left, 1), right: one(body.right, -1) };
}

/** Encodes projected joints as the 36-int sample (x·1000, y·1000, visibility·100), with noise from `rand` (`state` carries
 *  the AR noise between samples, see Noise.ar). */
export function encodeProjected(pr: { left: Projected; right: Projected }, rand: () => number, n: Noise, state?: number[]): number[] {
  const px = n.px ?? 5, jumpPx = n.jumpPx ?? 40;
  let { left, right } = pr;
  if (rand() < (n.flip ?? 0)) [left, right] = [right, left];
  const jumpAt = rand() < (n.jump ?? 0) ? Math.floor(rand() * 12) : -1;
  const jx = (rand() * 2 - 1) * jumpPx, jy = (rand() * 2 - 1) * jumpPx;
  const dipAt = rand() < (n.dip ?? 0) ? Math.floor(rand() * 12) : -1;
  const dipBy = 0.3 + rand() * 0.2;
  const out: number[] = [];
  for (let j = 0; j < 6; j++) {
    for (const [pts, s] of [[left, 0], [right, 1]] as const) {
      const q = pts[j]!, k = j * 2 + s;
      // Occluded joints are guessed: noisier.
      const extra = q.vis < 0.8 ? 1 + (0.8 - q.vis) * 3 : 1;
      let nx = (rand() * 2 - 1) * px * extra, ny = (rand() * 2 - 1) * px * extra;
      if (n.ar && state) {
        const a = n.ar, g = Math.sqrt(1 - a * a);
        state[2 * k] = a * (state[2 * k] ?? 0) + g * nx;
        state[2 * k + 1] = a * (state[2 * k + 1] ?? 0) + g * ny;
        nx = state[2 * k]!;
        ny = state[2 * k + 1]!;
      }
      let x = q.x * 1000 + nx, y = q.y * 1000 + ny;
      if (k === jumpAt) { x += jx; y += jy; }
      let vis = q.vis + (rand() * 2 - 1) * 0.03;
      if (k === dipAt) vis -= dipBy;
      out.push(Math.round(x), Math.round(y), Math.max(0, Math.min(100, Math.round(vis * 100))));
    }
  }
  return out;
}

// ── Motion scripts (e per 50 ms sample: 1 at the top / standing, 0 at the bottom) ──

export type Seg = { hold: number; ms: number } | { from: number; to: number; ms: number } | { gap: number };
export const DT = 50;
export const hold = (e: number, ms: number): Seg => ({ hold: e, ms });
export const move = (from: number, to: number, ms: number): Seg => ({ from, to, ms });
export const gap = (ms: number): Seg => ({ gap: ms });
/** One rep, top → bottom → top on a cosine profile. */
export const rep = (periodMs = 1500, bottom = 0, top = 1): Seg[] => [move(top, bottom, periodMs / 2), move(bottom, top, periodMs / 2)];
export const reps = (n: number, periodMs = 1500, bottom = 0, top = 1): Seg[] => Array.from({ length: n }, () => rep(periodMs, bottom, top)).flat();

export function motion(script: Seg[]): (number | null)[] {
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

export type Scene = {
  kind: Exercise;
  body: (e: number, i: number) => Body;
  cam: Cam;
  /** Optional azimuth at the last sample (a slow turn during the set). */
  azimuthTo?: number;
  noise?: Noise;
  /** Body size: every joint position scaled by this about the feet (1 = the 1.75 m stick body). */
  scale?: number;
};

/** Renders a motion script through a scene into the samples the native view would emit. */
export function film(script: Seg[], scene: Scene, t0 = 0): RepSample[] {
  const es = motion(script);
  const n = scene.noise ?? {};
  const rand = rng(n.seed ?? 1);
  const state: number[] = [];
  return es.map((e, i) => {
    if (e === null) return { t: t0 + i * DT, p: [] };
    const az = scene.azimuthTo === undefined ? scene.cam.azimuth : scene.cam.azimuth + ((scene.azimuthTo - scene.cam.azimuth) * i) / Math.max(1, es.length - 1);
    const b = scene.body(e, i), k = scene.scale ?? 1;
    const body = k === 1 ? b : { left: b.left.map((q) => mul(q, k)), right: b.right.map((q) => mul(q, k)) };
    const pr = project(body, { ...scene.cam, azimuth: az }, scene.kind, 1 - e, n.occlusion ?? 0.4, n.bodyOcclusion ?? 0.25);
    return { t: t0 + i * DT, p: encodeProjected(pr, rand, n, state) };
  });
}

/** Aspect ratio (w / h) of the frame a scene is filmed in. */
export const aspectOf = (cam: Cam) => (cam.landscape ? 4 / 3 : 3 / 4);

// ── The added activities (2026-11-27): jumping jacks, presses, lunges, high knees, burpees, sit-ups, planks ──
// Standing bodies face +x with the ankles at the origin; e = 1 is the rest pose, 0 the far end of the movement.

/** Leg lengths of the standing bodies: ankle joint 0.08 m up, hip SQUAT_TOP_HIP_Y. */
const STAND_ANKLE_Y = 0.08;

/** A standing body (legs straight, torso upright) with the given arm joints relative to each shoulder. */
function standing(arm: (side: 1 | -1, sh: V3) => [V3, V3], o: { stance?: number; air?: number; hipY?: number } = {}): Body {
  const air = o.air ?? 0, stance = o.stance ?? 0.12;
  const ac = v(0, STAND_ANKLE_Y + air, 0);
  const hy = (o.hipY ?? SQUAT_TOP_HIP_Y) + air;
  const an = pair(ac, stance), hp = pair(v(0, hy, 0), W.hip);
  const kn = [ik(hp[0], an[0], LEG.thigh, LEG.shin, v(1, 0, 0)), ik(hp[1], an[1], LEG.thigh, LEG.shin, v(1, 0, 0))] as [V3, V3];
  const sh = pair(v(0.02, hy + 0.52, 0), W.shoulder);
  const [el0, wr0] = arm(1, sh[0]), [el1, wr1] = arm(-1, sh[1]);
  return assemble(sh, [el0, el1], [wr0, wr1], hp, kn, an);
}

/** A straight arm from the shoulder at `deg` from hanging, swung out sideways (in the frontal plane). */
const sideArm = (side: 1 | -1, s: V3, deg: number): [V3, V3] => {
  const a = rad(deg), d = v(0, -Math.cos(a), side * Math.sin(a));
  return [add(s, mul(d, ARM.upper)), add(s, mul(d, ARM.upper + ARM.fore))];
};

export type JackOpts = { /** Highest arm angle from hanging (165 overhead, 90 shoulder height). */ arms?: number; /** Only the left arm moves. */ oneArm?: boolean;
  /** Legs stay together (arms only). */ noLegs?: boolean };
/** Jumping jacks: arms swing out and up overhead while the feet jump out, and back. */
export function jackBody(e: number, o: JackOpts = {}): Body {
  const up = 1 - e, top = o.arms ?? 165;
  const stance = o.noLegs ? 0.12 : 0.12 + 0.33 * up;
  const legLen = LEG.thigh + LEG.shin - 0.004, dz = stance - W.hip;
  const hipY = STAND_ANKLE_Y + Math.sqrt(legLen * legLen - dz * dz);
  return standing((side, s) => sideArm(side, s, side === -1 && o.oneArm ? 8 : 8 + (top - 8) * up), { stance, hipY, air: o.noLegs ? 0 : 0.05 * Math.sin(Math.PI * up) });
}

export type PressOpts = { /** Stop with the elbows at ~90° (half press). */ half?: boolean; /** Only the left arm presses. */ oneArm?: boolean };
/** Overhead press: from the rack (wrists at shoulder height, elbows out and forward) to straight arms overhead. */
export function pressBody(e: number, o: PressOpts = {}): Body {
  const up = 1 - e;
  return standing((side, s) => {
    const k = side === -1 && o.oneArm ? 0 : up;
    const rack = add(s, v(0.1, 0.03, side * 0.17));
    const lock = o.half ? add(s, v(0.06, 0.37, side * 0.14)) : add(s, v(0.03, ARM.upper + ARM.fore - 0.015, side * 0.07));
    const wr = add(mul(rack, 1 - k), mul(lock, k));
    return [ik(s, wr, ARM.upper, ARM.fore, v(-0.3, -1, side * 1.2)), wr];
  });
}

/** Hands on the hips (lunges, high knees). */
const handsOnHips = (side: 1 | -1, s: V3): [V3, V3] => [add(s, v(-0.08, -0.25, side * 0.12)), add(s, v(0.02, -0.5, side * 0.06))];

/** Calls the body with which leg leads (0 left, 1 right), flipping at the start of every rep: e turning from rising
 *  to falling in the upper half (verification 2026-11-27: the first version flipped on e leaving exactly 1, which a
 *  rep whose half period isn't a multiple of the 50 ms step never samples, so brisk sets were one leg only). */
export function alternate(body: (e: number, leg: 0 | 1) => Body, oneLeg = false): (e: number, i: number) => Body {
  let leg: 0 | 1 = 1, prev = 1, rising = true;
  return (e) => {
    if (e < prev && rising && prev > 0.5 && !oneLeg) leg = leg === 0 ? 1 : 0;
    if (e > prev) rising = true;
    else if (e < prev) rising = false;
    if (oneLeg) leg = 0;
    prev = e;
    return body(e, leg);
  };
}

export type LungeOpts = { /** Hip height at the bottom, metres (full lunge ~0.52, quarter dip 0.8). */ bottomY?: number;
  /** Bend at the waist instead (the hips stay up, the torso goes forward). */ waist?: boolean; /** Feet side by side (a squat-like dip). */ noStep?: boolean };
/** Forward lunge: the leading foot steps out 0.75 m, the hips drop between the feet (back knee towards the floor), back up and step in. */
export function lungeBody(e: number, leg: 0 | 1, o: LungeOpts = {}): Body {
  const d = 1 - e, step = o.noStep ? 0 : 0.75 * Math.min(1, 2.5 * d);
  const bottomY = o.waist ? SQUAT_TOP_HIP_Y - 0.03 : o.bottomY ?? 0.52;
  const hy = SQUAT_TOP_HIP_Y - (SQUAT_TOP_HIP_Y - bottomY) * Math.min(1, d * 1.25);
  const fz = leg === 0 ? 1 : -1;
  const front = v(step, STAND_ANKLE_Y, fz * 0.12), back = v(0, STAND_ANKLE_Y + 0.05 * Math.min(1, 2 * d) * (o.noStep ? 0 : 1), -fz * 0.12);
  const hc = v(step * 0.42, hy, 0);
  const hp = pair(hc, W.hip);
  const hipF = leg === 0 ? hp[0] : hp[1], hipB = leg === 0 ? hp[1] : hp[0];
  const kF = ik(hipF, front, LEG.thigh, LEG.shin, v(1, 0.2, 0)), kB = ik(hipB, back, LEG.thigh, LEG.shin, v(1, -0.3, 0));
  const lean = o.waist ? rad(75 * Math.min(1, d * 1.25)) : rad(5);
  const sc = add(hc, v(0.52 * Math.sin(lean), 0.52 * Math.cos(lean), 0));
  const sh = pair(sc, W.shoulder);
  const arms = sh.map((s, i) => handsOnHips(i === 0 ? 1 : -1, s)) as [[V3, V3], [V3, V3]];
  const kn: [V3, V3] = leg === 0 ? [kF, kB] : [kB, kF];
  const an: [V3, V3] = leg === 0 ? [front, back] : [back, front];
  return assemble(sh, [arms[0][0], arms[1][0]], [arms[0][1], arms[1][1]], hp, kn, an);
}

export type KneeOpts = { /** Highest thigh angle from hanging, degrees (95 honest, 45 marching). */ lift?: number };
/** High knees: the leading leg's thigh swings up in front (knee to hip height), the other leg stands. */
export function kneesBody(e: number, leg: 0 | 1, o: KneeOpts = {}): Body {
  const th = rad((o.lift ?? 95) * (1 - e));
  const hc = v(0, SQUAT_TOP_HIP_Y, 0);
  const hp = pair(hc, W.hip);
  const legAt = (h: V3, up: boolean, z: number): [V3, V3] => {
    if (!up) { const ankle = v(0, STAND_ANKLE_Y, z); return [ik(h, ankle, LEG.thigh, LEG.shin, v(1, 0, 0)), ankle]; }
    const knee = add(h, v(LEG.thigh * Math.sin(th), -LEG.thigh * Math.cos(th), 0));
    return [knee, add(knee, v(-0.05 * Math.sin(th), -LEG.shin, 0))];
  };
  const [lk, la] = legAt(hp[0], leg === 0, 0.12), [rk, ra] = legAt(hp[1], leg === 1, -0.12);
  const sh = pair(add(hc, v(0.02, 0.52, 0)), W.shoulder);
  const arms = sh.map((s, i) => sideArm(i === 0 ? 1 : -1, s, 15)) as [[V3, V3], [V3, V3]];
  return assemble(sh, [arms[0][0], arms[1][0]], [arms[0][1], arms[1][1]], hp, [lk, rk], [la, ra]);
}

const lerpBody = (a: Body, b: Body, k: number): Body => ({
  left: a.left.map((p, j) => add(mul(p, 1 - k), mul(b.left[j]!, k))),
  right: a.right.map((p, j) => add(mul(p, 1 - k), mul(b.right[j]!, k))),
});
const sym = (sh: V3, el: V3, wr: V3, hip: V3, kn: V3, an: V3, w: number[]): Body => {
  const m = (p: V3, h: number, s: 1 | -1) => add(p, v(0, 0, s * h));
  return { left: [m(sh, w[0]!, 1), m(el, w[1]!, 1), m(wr, w[2]!, 1), m(hip, w[3]!, 1), m(kn, w[4]!, 1), m(an, w[5]!, 1)],
    right: [m(sh, w[0]!, -1), m(el, w[1]!, -1), m(wr, w[2]!, -1), m(hip, w[3]!, -1), m(kn, w[4]!, -1), m(an, w[5]!, -1)] };
};
const WIDTHS = [W.shoulder, 0.21, 0.24, W.hip, W.knee, 0.12];
const BURPEE_STAND = sym(v(0.02, SQUAT_TOP_HIP_Y + 0.52, 0), v(0.03, SQUAT_TOP_HIP_Y + 0.22, 0), v(0.05, SQUAT_TOP_HIP_Y - 0.04, 0),
  v(0, SQUAT_TOP_HIP_Y, 0), v(0.01, 0.51, 0), v(0, STAND_ANKLE_Y, 0), WIDTHS);
const BURPEE_CROUCH = sym(v(0.3, 0.6, 0), v(0.38, 0.32, 0), v(0.42, 0.04, 0), v(-0.12, 0.38, 0), v(0.24, 0.47, 0), v(0, STAND_ANKLE_Y, 0), WIDTHS);
const BURPEE_PLANK = sym(v(0.42, PUSHUP_TOP_Y, 0), v(0.38, 0.32, 0), v(0.42, WRIST_Y, 0), v(-0.07, 0.38, 0), v(-0.5, 0.235, 0), v(-0.92, TOE_ANKLE_Y, 0), WIDTHS);

export type BurpeeOpts = { /** Only squat down (hands never reach the floor). */ squatOnly?: boolean; /** Bend over to the floor with straight legs. */ bendOnly?: boolean;
  /** Crouch with the hands on the floor but never kick the legs back. */ crouchOnly?: boolean };
/** Burpee: stand → crouch, hands on the floor → kick back to a plank → and back up (e: 1 standing, 0 the plank). */
export function burpeeBody(e: number, o: BurpeeOpts = {}): Body {
  const d = 1 - e;
  if (o.squatOnly) return squatBody(e, { bottomY: 0.48 });
  if (o.bendOnly) return goodMorningBody(e, { torso: 110, kneeBend: 10 });
  if (o.crouchOnly || d <= 0.5) return lerpBody(BURPEE_STAND, BURPEE_CROUCH, Math.min(1, d * 2));
  return lerpBody(BURPEE_CROUCH, BURPEE_PLANK, (d - 0.5) * 2);
}

export type SitupOpts = { /** Highest torso angle above the floor, degrees (80 honest, 15 a neck curl). */ top?: number; /** Roll onto the side instead. */ roll?: boolean };
/** Sit-up: lying on the back, knees bent and feet flat; the torso rises about the hips (head towards −x). */
export function situpBody(e: number, o: SitupOpts = {}): Body {
  const d = 1 - e;
  const hc = v(0, 0.1, 0);
  const kn = pair(v(0.3, 0.42, 0), W.knee), an = pair(v(0.55, STAND_ANKLE_Y, 0), 0.12);
  let sh: [V3, V3];
  if (o.roll) {
    const psi = rad(75 * d), base = add(hc, v(-0.52, 0, 0));
    sh = [add(base, v(0, W.shoulder * Math.sin(psi), W.shoulder * Math.cos(psi))), add(base, v(0, -W.shoulder * Math.sin(psi), -W.shoulder * Math.cos(psi)))];
    const lift = Math.max(0, 0.06 - sh[1].y);
    sh = [add(sh[0], v(0, lift, 0)), add(sh[1], v(0, lift, 0))];
  } else {
    const phi = rad((o.top ?? 80) * d + 2);
    sh = pair(add(hc, v(-0.52 * Math.cos(phi), 0.52 * Math.sin(phi), 0)), W.shoulder);
  }
  // Hands crossed on the chest.
  const mid = mul(add(sh[0], sh[1]), 0.5), toHip = unit(sub(hc, mid));
  const wr = [add(add(mid, mul(toHip, 0.15)), v(0, 0.06, -0.04)), add(add(mid, mul(toHip, 0.15)), v(0, 0.06, 0.04))] as [V3, V3];
  const el = [add(mid, add(mul(toHip, 0.2), v(0, 0.02, 0.2))), add(mid, add(mul(toHip, 0.2), v(0, 0.02, -0.2)))] as [V3, V3];
  return assemble(sh, el, wr, pair(hc, W.hip), kn, an);
}

export type PlankOpts = { /** On the forearms. */ forearm?: boolean; /** Hips below (> 0) or above (< 0) the straight line, metres. */ sag?: number;
  /** Knees on the floor. */ knees?: boolean; /** Lying flat on the belly. */ prone?: boolean };
/** A plank held still (e is ignored unless `broken` is given: then e < 0.5 is that posture instead). */
export function plankBody(e: number, o: PlankOpts = {}, broken?: PlankOpts): Body {
  const p = broken && e < 0.5 ? broken : o;
  if (p.knees) return kneePushupBody(1);
  if (p.prone) return proneBody(0, { belly: false });
  if (!p.forearm) return pushupBody(1, { sag: p.sag ?? 0 });
  // Forearm plank: elbows under the shoulders on the floor, forearms flat forward, body straight from the ankles.
  const sy = 0.05 + ARM.upper;
  const beta = Math.asin((sy - TOE_ANKLE_Y) / ANKLE_TO_SHOULDER);
  const sc = v(ANKLE_TO_SHOULDER * Math.cos(beta), sy, 0);
  const hc = v(ANKLE_TO_HIP * Math.cos(beta), TOE_ANKLE_Y + ANKLE_TO_HIP * Math.sin(beta) - (p.sag ?? 0), 0);
  const ac = v(0, TOE_ANKLE_Y, 0);
  const sh = pair(sc, W.shoulder);
  const el = pair(v(sc.x, 0.05, 0), W.shoulder - 0.02);
  const wr = pair(v(sc.x + ARM.fore, 0.04, 0), 0.08);
  return assemble(sh, el, wr, pair(hc, W.hip), pair(mid(hc, ac), W.knee), pair(ac, W.ankle));
}
