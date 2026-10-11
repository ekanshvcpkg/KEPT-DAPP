// The habits an Oath is created with, as C2 edits them. Pure, so the rules are tested without a screen.
//
// A habit is a name plus the object its proof photo shows, and every habit has its own: "go to the gym" is proven with
// a dumbbell, "read 20 pages" with a book. The proof object can be any catalog entry (features/objects): the local model
// is asked for it by name, so it is not limited to the program's eight. The draft keeps the habits as parallel arrays
// (`habits`, `habitObjectEntries`, plus `habitObjectIds` for the entries that are one of the eight) so older saved
// drafts keep loading. The program's single `object_id` is only a tag now (see `habitPatch`).
import { HABIT_COUNT_MAX, OBJECTS } from "@kept/config";
import type { OathDraft } from "@/state/drafts";
import { catalogEntry, proofTextOf, validEntry } from "@/features/objects/proof";

type Parallel = Pick<OathDraft, "habits" | "habitObjectIds" | "habitObjectEntries">;

/** A habit as C2 lists it. `entry` is the catalog entry of its proof object, null while none is chosen. */
export interface HabitEntry { name: string; entry: string | null }
export interface Habit { name: string; entry: string }

export const validObjectId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < OBJECTS.length;

/** The proof object of habit `i`: its entry, or (a draft saved before entries) the one of the eight its id names. */
function entryAt(d: Parallel, i: number): string | null {
  const key = d.habitObjectEntries?.[i];
  if (validEntry(key)) return key;
  const id = d.habitObjectIds?.[i];
  return validObjectId(id) ? OBJECTS[id]!.id : null;
}

/** Every habit with a name, in order. A blank name is the draft's empty placeholder, not a habit. */
export function habitEntries(d: Parallel): HabitEntry[] {
  return d.habits.flatMap((raw, i) => {
    const name = raw.trim();
    return name ? [{ name, entry: entryAt(d, i) }] : [];
  });
}

/** The habits that are really saved: a name and a proof object. */
export const savedHabits = (d: Parallel): Habit[] => habitEntries(d).flatMap((h) => (h.entry === null ? [] : [{ name: h.name, entry: h.entry }]));

/** What each saved habit is proven with, as text: what the model is asked for and the backend stores. */
export const habitProofTexts = (d: Parallel): string[] => savedHabits(d).map((h) => proofTextOf(h.entry)!);

/** What stops C2's Next, or null when the list can be created. */
export type HabitProblem = "none" | "unfinished";
export function habitProblem(d: Parallel): HabitProblem | null {
  const entries = habitEntries(d);
  if (entries.length === 0 || entries.length > HABIT_COUNT_MAX) return "none";
  return entries.some((h) => h.entry === null) ? "unfinished" : null;
}
export const habitsReady = (d: Parallel) => habitProblem(d) === null;

/** The program's id of an entry that is one of its eight, else -1. */
export const programIdOf = (entry: string | null): number => {
  const object = entry ? catalogEntry(entry)?.object : null;
  return object ? OBJECTS.findIndex((o) => o.id === object) : -1;
};

/**
 * The draft fields for a habit list. `objectId` is the program's `object_id`, which every Oath must carry (0–7) but which
 * no longer says what the proofs check: each habit's own object does, stored with the Oath's details. It follows the first
 * habit whose object is one of the eight, else it is 0.
 */
export function habitPatch(entries: readonly HabitEntry[]): Pick<OathDraft, "habits" | "habitObjectIds" | "habitObjectEntries" | "objectId" | "objectEntry"> {
  const ids = entries.map((h) => programIdOf(h.entry));
  const firstEntry = entries.find((h) => h.entry !== null)?.entry;
  return {
    habits: entries.length ? entries.map((h) => h.name) : [""],
    habitObjectIds: ids,
    habitObjectEntries: entries.map((h) => h.entry ?? ""),
    objectId: Math.max(0, ids.find((id) => id >= 0) ?? 0),
    objectEntry: firstEntry ?? OBJECTS[0].id,
  };
}

/** Saves a habit: replaces the one at `index`, or adds it (`null`). Name and proof object go in together. */
export function saveHabit(d: Parallel, index: number | null, habit: Habit): ReturnType<typeof habitPatch> {
  const entries = habitEntries(d);
  const next: HabitEntry = { name: habit.name.trim(), entry: habit.entry };
  if (index === null) entries.push(next);
  else entries[index] = next;
  return habitPatch(entries);
}

export function removeHabit(d: Parallel, index: number): ReturnType<typeof habitPatch> {
  return habitPatch(habitEntries(d).filter((_, i) => i !== index));
}
