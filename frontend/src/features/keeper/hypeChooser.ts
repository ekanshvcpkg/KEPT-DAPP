// Which hype line the Keeper says (or none), from what just happened in a rep set. Pure and deterministic given `rng`:
// the coach (hypeCoach.ts) supplies the clock-derived inputs, picks the tier that fits (pickHype) and plays the clip.
import { REPS_DOWN, hypeFits, hypeIds } from "./hypeLines";
import type { HypeActivity, HypeLang, HypeSituation, HypeTier } from "./hypeLines";

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
  /** The set's activity (hypeLines.ts › HypeActivity); push-ups when not said. No line contradicts it. */
  activity?: HypeActivity;
}

/** Minimum quiet time since the last hype line, per kind of moment (start and done always speak). */
export const HYPE_GAP_MS = { event: 3000, milestone: 3000, shame: 6000, streak: 5000 } as const;
/** A rep slower than this (start line to count line) gets the "slow" line. */
export const SLOW_REP_MS = 4500;
/** A plain rep gets a line once this many reps passed without one: half the time at 3, always from 4. */
export const STREAK_REPS = 3;
/** A held plank (one "rep" a second) gets a line once this many seconds passed without one. */
export const STREAK_SECONDS = 8;

/**
 * The rep milestone for rep n of target, if any (the last rep itself is the set's "done"). A held plank counts seconds:
 * only halfway and three left (its first and last second come and go in a blink, and "last one" / "one down" mean reps).
 */
export function repMilestone(n: number, target: number, unit: HypeActivity["unit"] = "reps"): HypeSituation | null {
  if (n >= target) return null;
  if (unit === "reps" && target >= 3 && n === target - 1) return "last";
  if (target >= 6 && n === target - 3) return "threeLeft";
  if (target >= 6 && n === Math.ceil(target / 2)) return "halfway";
  if (unit === "reps" && target >= 4 && n === 1) return "first";
  return null;
}

/** The situation a moment calls for, or null when the Keeper keeps quiet (cooldowns). Uses rng for the streak. */
export function hypeSituation(input: Omit<HypeInput, "lang" | "lastId" | "used">, rng: () => number = Math.random): HypeSituation | null {
  const { event: e, target, sinceLastMs: since, repsSinceHype } = input;
  const a = input.activity ?? REPS_DOWN;
  switch (e.kind) {
    case "start": return "start";
    case "done": return "done";
    case "back": case "resume": return since >= HYPE_GAP_MS.event ? e.kind : null;
    // A half rep of an activity that isn't short going down (a jumping jack, a sit-up) gets a form jab, not "deeper".
    case "halfRep": return since >= HYPE_GAP_MS.shame ? (a.down && a.unit === "reps" ? "halfRep" : "fault") : null;
    case "fault": return since >= HYPE_GAP_MS.shame ? "fault" : null;
    case "rep": {
      if (e.n >= target) return null;
      const milestone = repMilestone(e.n, target, a.unit);
      if (milestone) return since >= HYPE_GAP_MS.milestone ? milestone : null;
      if (a.unit === "seconds") return since >= HYPE_GAP_MS.streak && repsSinceHype >= STREAK_SECONDS ? "streak" : null;
      if (e.ms >= SLOW_REP_MS) return since >= HYPE_GAP_MS.shame ? "slow" : null;
      if (since < HYPE_GAP_MS.streak) return null;
      if (repsSinceHype > STREAK_REPS || (repsSinceHype === STREAK_REPS && rng() < 0.5)) return "streak";
      return null;
    }
  }
}

export interface HypePick extends Pick<HypeInput, "lang" | "lastId" | "used" | "activity"> {
  /** "long" (default) or "short" (hypeLines.ts: only the moments inside the rep rhythm have short lines). */
  tier?: HypeTier;
  /** Only lines that fit (the coach: ends before the next rep). */
  fits?: (id: string) => boolean;
}

/**
 * A random line of the situation in the language and tier that fits (in time, and in words for the activity): never
 * the last one again (none, rather than a repeat), fresh ones first.
 */
export function pickHype(situation: HypeSituation, o: HypePick, rng: () => number = Math.random): string | null {
  const activity = o.activity ?? REPS_DOWN;
  const pool = hypeIds(situation, o.lang, o.tier).filter((id) => id !== o.lastId && hypeFits(id, activity) && (!o.fits || o.fits(id)));
  const fresh = o.used ? pool.filter((id) => !o.used!.has(id)) : pool;
  const from = fresh.length ? fresh : pool;
  if (!from.length) return null;
  return from[Math.min(from.length - 1, Math.floor(rng() * from.length))]!;
}

/** Picks a long line for the moment: a random variant of its situation in the chosen language, never the last one again. */
export function chooseHype(input: HypeInput, rng: () => number = Math.random): string | null {
  const situation = hypeSituation(input, rng);
  return situation ? pickHype(situation, input, rng) : null;
}
