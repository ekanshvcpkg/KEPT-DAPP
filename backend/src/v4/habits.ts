// One photo proves one habit (DECISIONS D-98). An Oath has 1–8 habits, each proven every day with a single live photo of
// that habit's own object and the gesture the server picks. The day is kept (recorded on chain) once every habit has its
// photo. The program still carries a single `object_id` per Oath; it is only a tag now, and what a photo is checked for is
// the habit's object stored with the Oath's details.
import { createHash } from "node:crypto";
import { OBJECT_IDS, OBJECT_TEXT } from "./rules.js";

export const MAX_HABITS = 8;
/** What /proof/verify accepts as expectedObject: short plain text. */
export const OBJECT_TEXT_RE = /^[\p{L}\p{N} ,.'()\-]{1,80}$/u;

/** The object texts sent with an Oath's details: one per habit, plain short text. Trimmed and lower case. */
export function parseHabitObjects(raw: unknown, habitCount: number): string[] | { error: string } {
  if (!Array.isArray(raw) || raw.length !== habitCount || raw.length < 1 || raw.length > MAX_HABITS) {
    return { error: `habitObjects must have one object per habit (${habitCount})` };
  }
  const out: string[] = [];
  for (const o of raw) {
    const text = typeof o === "string" ? o.trim().toLowerCase() : "";
    if (!OBJECT_TEXT_RE.test(text)) return { error: "Each habit object must be short plain text (letters, digits, spaces and , . ' ( ) -)" };
    out.push(text);
  }
  return out;
}

type DetailsLike = { habits: string[]; habitObjects: string[] } | null;

/** How many habits the Oath has: its habit list, or one (an Oath from before habit lists, or with no details). */
export const habitCount = (details: DetailsLike): number => Math.max(1, details?.habits.length ?? 0);

/** What each habit is proven with. A habit with no stored object uses the Oath's own (the program's object_id). */
export function habitObjectTexts(details: DetailsLike, oathObjectId: number): string[] {
  const own = OBJECT_TEXT[OBJECT_IDS[oathObjectId] ?? OBJECT_IDS[0]!]!;
  return Array.from({ length: habitCount(details) }, (_, i) => details?.habitObjects[i] ?? own);
}

/** The hash recorded on chain for a day: sha256 of every habit's photo hash (32-byte hex each), in habit order. */
export function combinedHabitsHash(hashesInHabitOrder: readonly string[]): string {
  return createHash("sha256").update(Buffer.concat(hashesInHabitOrder.map((h) => Buffer.from(h, "hex")))).digest("hex");
}

/** Why a habit's photo can't be taken or recorded now, or null. */
export function habitRejection(input: { habit: unknown; count: number; done: readonly number[] }): { status: number; error: string } | null {
  const { habit, count, done } = input;
  if (typeof habit !== "number" || !Number.isInteger(habit) || habit < 0) return { status: 400, error: "Expected habit: the habit's position, from 0" };
  if (habit >= count) return { status: 400, error: `This Oath has ${count} habit${count === 1 ? "" : "s"}` };
  if (done.includes(habit)) return { status: 409, error: "That habit is already proven today" };
  return null;
}

/** The challenge key of one habit: gestures are drawn per habit, so each photo gets its own. */
export const habitChallengeKey = (oath: string, habit: number): string => `${oath}:h${habit}`;
