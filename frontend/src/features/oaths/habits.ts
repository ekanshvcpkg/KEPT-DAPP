// The habits an Oath is created with, as C2 edits them. Pure, so the rules are tested without a screen.
//
// A habit is a name plus the object its proof photo shows. The draft keeps them as parallel arrays
// (`habits`, `habitObjectIds`, `habitObjectEntries`) so older saved drafts keep loading. The program, though, has ONE
// `object_id` per Oath: the two daily photos are checked for that object, whatever the habit list says. So every
// habit of an Oath must use the same proof object (`sharedProofObject`), and C2 stops a habit from naming another
// one (BACKEND_GAPS P1-26 lists what a per-habit object would take).
import { HABIT_COUNT_MAX, OBJECTS } from "@kept/config";
import type { OathDraft } from "@/state/drafts";

type Parallel = Pick<OathDraft, "habits" | "habitObjectIds" | "habitObjectEntries">;

/** A habit as C2 lists it. `objectId` is null while no valid proof object is chosen. */
export interface HabitEntry { name: string; objectId: number | null; entry: string | undefined }
export interface Habit { name: string; objectId: number; entry: string }

export const validObjectId = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < OBJECTS.length;

/** Every habit with a name, in order. A blank name is the draft's empty placeholder, not a habit. */
export function habitEntries(d: Parallel): HabitEntry[] {
  return d.habits.flatMap((raw, i) => {
    const name = raw.trim();
    if (!name) return [];
    const id = d.habitObjectIds?.[i];
    return [{ name, objectId: validObjectId(id) ? id : null, entry: d.habitObjectEntries?.[i] }];
  });
}

/** The habits that are really saved: a name and a valid proof object. */
export const savedHabits = (d: Parallel): Habit[] =>
  habitEntries(d).flatMap((h) => (h.objectId === null ? [] : [{ name: h.name, objectId: h.objectId, entry: h.entry ?? OBJECTS[h.objectId]!.id }]));

/** The one proof object of the Oath, or null with no habits or habits that disagree. */
export const sharedProofObject = (habits: readonly { objectId: number | null }[]): number | null => {
  const first = habits[0]?.objectId;
  return first !== undefined && first !== null && habits.every((h) => h.objectId === first) ? first : null;
};

/** What stops C2's Next, or null when the list can be created. */
export type HabitProblem = "none" | "unfinished" | "mixed";
export function habitProblem(d: Parallel): HabitProblem | null {
  const entries = habitEntries(d);
  if (entries.length === 0) return "none";
  if (entries.some((h) => h.objectId === null)) return "unfinished";
  if (entries.length > HABIT_COUNT_MAX) return "none";
  return sharedProofObject(entries) === null ? "mixed" : null;
}
export const habitsReady = (d: Parallel) => habitProblem(d) === null;

/** The object the Oath's other habits use, if one differs from `candidate`: choosing it for this habit would mix proof objects. */
export function proofConflict(others: readonly HabitEntry[], candidate: number): number | null {
  const shared = others.find((h) => h.objectId !== null)?.objectId ?? null;
  return shared !== null && shared !== candidate ? shared : null;
}

/** The draft fields for a habit list. `objectId` follows the list: it is the Oath's single proof object. */
export function habitPatch(entries: readonly HabitEntry[]): Pick<OathDraft, "habits" | "habitObjectIds" | "habitObjectEntries" | "objectId" | "objectEntry"> {
  const first = entries.find((h) => h.objectId !== null);
  return {
    habits: entries.length ? entries.map((h) => h.name) : [""],
    habitObjectIds: entries.map((h) => h.objectId ?? -1),
    habitObjectEntries: entries.map((h) => h.entry ?? (h.objectId === null ? "" : OBJECTS[h.objectId]!.id)),
    objectId: first?.objectId ?? 0,
    objectEntry: first ? (first.entry ?? OBJECTS[first.objectId!]!.id) : OBJECTS[0].id,
  };
}

/** Saves a habit: replaces the one at `index`, or adds it (`null`). Name and proof object go in together. */
export function saveHabit(d: Parallel, index: number | null, habit: Habit): ReturnType<typeof habitPatch> {
  const entries = habitEntries(d);
  const next: HabitEntry = { name: habit.name.trim(), objectId: habit.objectId, entry: habit.entry };
  if (index === null) entries.push(next);
  else entries[index] = next;
  return habitPatch(entries);
}

export function removeHabit(d: Parallel, index: number): ReturnType<typeof habitPatch> {
  return habitPatch(habitEntries(d).filter((_, i) => i !== index));
}

/** One proof object for every habit (C2's way out of a mix): `habit` replaces the one being edited, if any. */
export function switchAllHabits(d: Parallel, index: number | null, habit: Habit): ReturnType<typeof habitPatch> {
  const entries = habitEntries(d).map((h): HabitEntry => ({ ...h, objectId: habit.objectId, entry: habit.entry }));
  const next: HabitEntry = { name: habit.name.trim(), objectId: habit.objectId, entry: habit.entry };
  if (index === null) entries.push(next);
  else entries[index] = next;
  return habitPatch(entries);
}
