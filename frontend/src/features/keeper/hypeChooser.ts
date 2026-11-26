// Which hype line the Keeper says (or none), from what just happened in a rep set. Pure and deterministic given `rng`:
// the coach (hypeCoach.ts) supplies the clock-derived inputs and plays the clip.
import { hypeIds } from "./hypeLines";
import type { HypeLang, HypeSituation } from "./hypeLines";

export type HypeEvent =
  | { kind: "start" } // the counter saw the start position for the first time
  | { kind: "rep"; n: number; ms: number } // rep n of the target was counted; it took ms (start line to count line)
  | { kind: "halfRep" }
  | { kind: "fault" }
  | { kind: "back" } // back in frame after the counter lost you
  | { kind: "resume" } // counting again after the Freeze photo (a camera stall is a "back" instead)
  | { kind: "done" };

export interface HypeInput {
  event: HypeEvent;
  target: number;
  /** ms since the last hype line was played (Infinity before the first). */
  sinceLastMs: number;
  /** Reps counted since the last hype line (since the set began before the first). */
  repsSinceHype: number;
  lang: HypeLang;
  /** The line played last: never the same one twice in a row. */
  lastId?: string | null;
  /** Lines already played this set: a fresh one is picked while there is one. */
  used?: ReadonlySet<string>;
}

/** Minimum quiet time since the last hype line, per kind of moment (start and done always speak). */
export const HYPE_GAP_MS = { event: 3000, milestone: 3000, shame: 6000, streak: 5000 } as const;
/** A rep slower than this (start line to count line) gets the "slow" line. */
export const SLOW_REP_MS = 4500;
/** A plain rep gets a line once this many reps passed without one: half the time at 3, always from 4. */
export const STREAK_REPS = 3;

/** The rep milestone for rep n of target, if any (the last rep itself is the set's "done"). */
export function repMilestone(n: number, target: number): HypeSituation | null {
  if (n >= target) return null;
  if (target >= 3 && n === target - 1) return "last";
  if (target >= 6 && n === target - 3) return "threeLeft";
  if (target >= 6 && n === Math.ceil(target / 2)) return "halfway";
  if (target >= 4 && n === 1) return "first";
  return null;
}

/** The situation a moment calls for, or null when the Keeper keeps quiet (cooldowns). Uses rng for the streak. */
export function hypeSituation(input: Omit<HypeInput, "lang" | "lastId" | "used">, rng: () => number = Math.random): HypeSituation | null {
  const { event: e, target, sinceLastMs: since, repsSinceHype } = input;
  switch (e.kind) {
    case "start": return "start";
    case "done": return "done";
    case "back": case "resume": return since >= HYPE_GAP_MS.event ? e.kind : null;
    case "halfRep": case "fault": return since >= HYPE_GAP_MS.shame ? e.kind : null;
    case "rep": {
      if (e.n >= target) return null;
      const milestone = repMilestone(e.n, target);
      if (milestone) return since >= HYPE_GAP_MS.milestone ? milestone : null;
      if (e.ms >= SLOW_REP_MS) return since >= HYPE_GAP_MS.shame ? "slow" : null;
      if (since < HYPE_GAP_MS.streak) return null;
      if (repsSinceHype > STREAK_REPS || (repsSinceHype === STREAK_REPS && rng() < 0.5)) return "streak";
      return null;
    }
  }
}

/** Picks a line for the moment: a random variant of its situation in the chosen language, never the last one again. */
export function chooseHype(input: HypeInput, rng: () => number = Math.random): string | null {
  const situation = hypeSituation(input, rng);
  if (!situation) return null;
  const ids = hypeIds(situation, input.lang);
  const pool = ids.length > 1 ? ids.filter((id) => id !== input.lastId) : ids;
  const fresh = input.used ? pool.filter((id) => !input.used!.has(id)) : pool;
  const from = fresh.length ? fresh : pool;
  if (!from.length) return null;
  return from[Math.min(from.length - 1, Math.floor(rng() * from.length))]!;
}
