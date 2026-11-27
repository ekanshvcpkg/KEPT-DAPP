// The Keeper's check of a live set ("20 push-ups", "20 jumping jacks", "60-second plank"). The phone's count is only a
// display: the server recounts the uploaded pose trace with the same engine (shared/reps.ts, byte-identical to
// packages/engine), checks the timing and the "Freeze!" liveness moment, and the photo it judges is the freeze frame
// (the challenge gesture, mid-workout). The checks are the same for every activity: a plank's "reps" are its seconds held
// (the engine emits one per full second in a valid plank), so its target, its freeze rep and its count are in seconds.
import { createHash } from "node:crypto";
import { countReps, exerciseUnit, parseTrace, REPS_ENGINE, type Exercise } from "../shared/reps.js";
import { canonicalJson } from "./keeper.js";

/** A set may take up to 4 minutes after its challenge was issued. */
export const REP_SET_MAX_MS = 240_000;
/**
 * The freeze move: one hand raised. The freeze frame is the pose camera's frame (640×480): from 2 m away a finger sign
 * is a few pixels and can't be read, a raised hand can. Freshness comes from the rep the freeze follows (the server's
 * pick from the challenge's blockhash) and the trace being usable once, not from which hand sign it is.
 */
export const REP_FREEZE_GESTURE = "one hand raised (lifted off the floor or held up in the air; any hand shape counts)";
export const REP_FREEZE_MOVE = "hand_up";

/**
 * What the vision model is asked to see in the freeze frame (with REP_FREEZE_GESTURE), per activity: the body position
 * the person is in when "Freeze!" comes between two reps (or seconds of a plank), never a specific moment of the move.
 */
const FREEZE_OBJECT: Record<Exercise, string> = {
  pushup: "a person mid push-up workout: on the floor in a plank or push-up position (one hand may be raised)",
  squat: "a person mid squat workout: standing with bent knees or in a squat (one hand may be raised)",
  jumpingjack: "a person mid jumping-jack workout, standing (one hand may be raised)",
  lunge: "a person mid lunge workout: standing, or in a lunge with one leg forward and both knees bent (one hand may be raised)",
  situp: "a person mid sit-up workout: on the floor, lying back or sitting up with knees bent (one hand may be raised)",
  highknee: "a person mid high-knees workout, standing or with one knee raised (one hand may be raised)",
  burpee: "a person mid burpee workout: standing, crouching or in a plank on the floor (one hand may be raised)",
  press: "a person mid overhead-press workout, standing, hands at the shoulders or overhead, with or without weights (one hand may be raised)",
  plank: "a person holding a plank on the floor (one hand may be raised)",
};
export const repFreezeObject = (exercise: Exercise): string => FREEZE_OBJECT[exercise];

/**
 * The rep after which the app calls "Freeze!": picked by the server from the challenge (its Solana blockhash and time),
 * between 30% and 70% of the set, so a recorded set can't be replayed for a new challenge without a freeze at a
 * different rep. The app gets it with the challenge (POST /api/proof/challenge `freezeAfter`).
 */
export function freezeAfterRep(challenge: { blockhash?: string | null; issuedAt: Date }, target: number): number {
  if (target < 2) return 0;
  const byte = createHash("sha256").update(`kept:freeze:${challenge.blockhash ?? ""}:${challenge.issuedAt.toISOString()}`).digest()[0]!;
  const lo = Math.max(1, Math.ceil(target * 0.3)), hi = Math.max(lo, Math.min(target - 1, Math.floor(target * 0.7)));
  return lo + (byte % (hi - lo + 1));
}

export type RepReceipt = {
  engine: string; exercise: Exercise; target: number; repCount: number; phoneCount: number | null; durationMs: number;
  traceSha256: string; freeze: { afterRep: number; gesture: string; t: number } | null;
  keyframes: { kind: string; t: number; sha256: string }[];
};

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** Width and height from a JPEG's SOF marker, or null if it isn't a readable JPEG. */
export function jpegSize(b: Buffer): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1]!;
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Checks the evidence of a set against its rep habit and challenge. `photoHash` is the uploaded photo's SHA-256, which
 * must be the freeze frame. Returns the receipt part, or why the set doesn't count.
 */
export function checkRepEvidence(
  raw: unknown, habit: { exercise: Exercise; target: number }, challenge: { gesture: string; issuedAt: Date; blockhash?: string | null }, photo: Buffer, nowMs = Date.now(),
): { receipt: RepReceipt } | { error: string } {
  const photoHash = sha(photo);
  const ev = (raw ?? {}) as { trace?: unknown; phoneCount?: unknown; freeze?: unknown; keyframes?: unknown };
  const trace = parseTrace(ev.trace);
  if (!trace) return { error: "The rep set's trace is missing or malformed" };
  if (trace.exercise !== habit.exercise) return { error: "The set was for a different exercise" };
  const n = trace.t.length;
  if (n < 2) return { error: "The set is too short" };
  const durationMs = trace.t[n - 1]! - trace.t[0]!;
  if (durationMs > REP_SET_MAX_MS || durationMs > nowMs - challenge.issuedAt.getTime() + 5_000) return { error: "The set took longer than its challenge allows" };
  const gaps: number[] = [];
  for (let i = 1; i < n; i++) gaps.push(trace.t[i]! - trace.t[i - 1]!);
  if (gaps.some((g) => g > 2_000)) return { error: "The set has a gap: the camera stopped seeing it" };
  // The camera samples every ~50 ms; a trace far off that rate wasn't recorded live by the app.
  const median = [...gaps].sort((x, y) => x - y)[gaps.length >> 1]!;
  if (median < 30 || median > 150) return { error: "The set's sample rate is off" };
  // The trace's aspect rescales every angle, so it must be the camera frame's: the freeze photo is that frame.
  const size = jpegSize(photo);
  if (!size || Math.abs(size.w / size.h - trace.aspect) > 0.02) return { error: "The set's frame shape doesn't match its photo" };

  const { count, reps } = countReps(trace);
  if (count < habit.target) return { error: `The Keeper counted ${count} of ${habit.target}${exerciseUnit(habit.exercise) === "seconds" ? " seconds" : ""}` };

  // The freeze: one pause, after a counted rep and before the next, with the freeze frame inside it.
  let freeze: RepReceipt["freeze"] = null;
  if (habit.target < 2 && trace.pauses.length > 0) return { error: "The set has an unexpected pause" };
  if (habit.target >= 2) {
    const f = (ev.freeze ?? {}) as { afterRep?: unknown; t?: unknown; gesture?: unknown; sha256?: unknown };
    if (trace.pauses.length !== 1 || !num(f.afterRep) || !num(f.t)) return { error: "The set has no freeze moment" };
    const [a, b] = trace.pauses[0]!;
    if (b - a < 1_500 || b - a > 8_000) return { error: "The freeze lasted too short or too long" };
    if (f.t < a || f.t > b) return { error: "The freeze photo wasn't taken during the freeze" };
    const k = f.afterRep;
    if (!Number.isInteger(k) || k < 1 || k > reps.length || reps[k - 1]!.endT >= a || (k < reps.length && reps[k]!.startT <= b)) return { error: "The freeze doesn't sit between two reps" };
    // The gesture to hold is the challenge's (the app's own label in f.gesture is not trusted or compared); the vision model
    // checks the freeze frame for it. The rep it comes after is the server's pick.
    if (k !== freezeAfterRep(challenge, habit.target)) return { error: "The freeze came at the wrong rep" };
    if (f.sha256 !== photoHash) return { error: "The photo isn't the freeze frame" };
    freeze = { afterRep: k, gesture: REP_FREEZE_MOVE, t: f.t };
  }

  const keyframes = (Array.isArray(ev.keyframes) ? ev.keyframes : []).slice(0, 4).flatMap((k: { kind?: unknown; t?: unknown; jpeg?: unknown }) =>
    typeof k?.jpeg === "string" && typeof k.kind === "string" && num(k.t) ? [{ kind: k.kind.slice(0, 16), t: k.t, sha256: sha(Buffer.from(k.jpeg, "base64")) }] : []);
  return {
    receipt: {
      engine: REPS_ENGINE, exercise: habit.exercise, target: habit.target, repCount: count,
      phoneCount: num(ev.phoneCount) ? ev.phoneCount : null, durationMs, traceSha256: sha(canonicalJson(trace)), freeze, keyframes,
    },
  };
}
