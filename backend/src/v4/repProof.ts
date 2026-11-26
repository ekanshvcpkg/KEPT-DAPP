// The Keeper's check of a live rep set ("20 push-ups"). The phone's count is only a display: the server recounts the
// uploaded pose trace with the same engine (shared/reps.ts, byte-identical to packages/engine), checks the timing and
// the "Freeze!" liveness moment, and the photo it judges is the freeze frame (the challenge gesture, mid-workout).
import { createHash } from "node:crypto";
import { countReps, parseTrace, REPS_ENGINE, type Exercise } from "../shared/reps.js";
import { canonicalJson } from "./keeper.js";

/** A set may take up to 4 minutes after its challenge was issued. */
export const REP_SET_MAX_MS = 240_000;
/** What the vision model is asked to see in the freeze frame (with the challenge gesture). */
export const REP_FREEZE_OBJECT = "a person exercising";

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
  raw: unknown, habit: { exercise: Exercise; target: number }, challenge: { gesture: string; issuedAt: Date }, photo: Buffer, nowMs = Date.now(),
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
  if (count < habit.target) return { error: `The Keeper counted ${count} of ${habit.target}` };

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
    if (f.gesture !== challenge.gesture) return { error: "The freeze gesture isn't the challenge's" };
    if (f.sha256 !== photoHash) return { error: "The photo isn't the freeze frame" };
    freeze = { afterRep: k, gesture: challenge.gesture, t: f.t };
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
