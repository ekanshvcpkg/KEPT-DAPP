// C2's habit list rules, below the screen: what counts as a saved habit, what blocks Next, that every habit keeps its own
// proof object, and that saving commits a habit's name and proof object together.
import { OBJECTS } from "@kept/config";
import { QUICK_PICK_OBJECTS } from "@/features/objects/catalog";
import { habitEntries, habitPatch, habitProblem, habitProofTexts, habitsReady, programIdOf, removeHabit, saveHabit, savedHabits, validObjectId } from "@/features/oaths/habits";

const draft = (habits: string[], entries?: string[], ids?: number[]) => ({ habits, ...(entries ? { habitObjectEntries: entries } : {}), ...(ids ? { habitObjectIds: ids } : {}) });

describe("what is a saved habit", () => {
  it("the empty placeholder is not a habit", () => {
    expect(habitEntries(draft([""]))).toEqual([]);
    expect(habitEntries(draft(["   ", ""]))).toEqual([]);
    expect(savedHabits(draft([""]))).toEqual([]);
    expect(habitProblem(draft([""]))).toBe("none");
    expect(habitsReady(draft([""]))).toBe(false);
  });

  it("needs a name AND a proof object", () => {
    expect(savedHabits(draft(["read"], ["book"]))).toEqual([{ name: "read", entry: "book" }]);
    expect(savedHabits(draft(["read"]))).toEqual([]); // a name with no proof isn't saved
    expect(savedHabits(draft(["read"], [""]))).toEqual([]);
    expect(savedHabits(draft(["read"], ["not_an_object"]))).toEqual([]);
    expect(habitProblem(draft(["read"], [""]))).toBe("unfinished");
    expect(habitsReady(draft(["read"], [""]))).toBe(false);
    expect(habitsReady(draft(["read"], ["book"]))).toBe(true);
  });

  it("a draft saved before entries still reads: the program id names the object", () => {
    expect(savedHabits(draft(["read"], undefined, [1]))).toEqual([{ name: "read", entry: "book" }]);
    expect(savedHabits(draft(["read"], undefined, [8]))).toEqual([]);
    expect(validObjectId(7)).toBe(true);
    expect(validObjectId(8)).toBe(false);
  });

  it("every habit has its own proof object: going to the gym with a dumbbell and reading with a book is fine", () => {
    const d = draft(["go to the gym", "read 10 pages"], ["dumbbell", "book"]);
    expect(habitProblem(d)).toBeNull();
    expect(habitsReady(d)).toBe(true);
    expect(habitProofTexts(d)).toEqual(["dumbbell", "book"]);
  });

  it("any catalog object is a proof object, not only the program's eight", () => {
    const d = draft(["swing", "practise", "sketch"], ["kettlebell", "sheet_music", "sketchbook"]);
    expect(habitsReady(d)).toBe(true);
    expect(habitProofTexts(d)).toEqual(["kettlebell", "sheet music", "sketchbook"]);
  });

  it("at most eight habits", () => {
    const names = Array.from({ length: 9 }, (_, i) => `habit ${i}`);
    expect(habitsReady(draft(names, names.map(() => "book")))).toBe(false);
    expect(habitsReady(draft(names.slice(0, 8), names.slice(0, 8).map(() => "book")))).toBe(true);
  });
});

describe("saving and removing", () => {
  it("Save commits the name and the proof object together", () => {
    const patch = saveHabit(draft([""]), null, { name: "  read 10 pages ", entry: "book" });
    expect(patch).toEqual({ habits: ["read 10 pages"], habitObjectIds: [1], habitObjectEntries: ["book"], objectId: 1, objectEntry: "book" });
    // Editing replaces the habit in place; the others are untouched, and each keeps its own object.
    const two = saveHabit({ habits: patch.habits, habitObjectIds: patch.habitObjectIds, habitObjectEntries: patch.habitObjectEntries }, null, { name: "lift", entry: "dumbbell" });
    expect(two.habits).toEqual(["read 10 pages", "lift"]);
    expect(two.habitObjectEntries).toEqual(["book", "dumbbell"]);
    const edited = saveHabit(two, 1, { name: "lift for 20 minutes", entry: "kettlebell" });
    expect(edited.habits).toEqual(["read 10 pages", "lift for 20 minutes"]);
    expect(edited.habitObjectEntries).toEqual(["book", "kettlebell"]);
  });

  it("the program's object_id is only a tag: the first of the eight among the habits' objects, else 0", () => {
    expect(saveHabit(draft([""]), null, { name: "swing", entry: "kettlebell" })).toMatchObject({ habitObjectIds: [-1], objectId: 0 });
    const d = saveHabit(draft([""]), null, { name: "swing", entry: "kettlebell" });
    expect(saveHabit(d, null, { name: "read", entry: "book" })).toMatchObject({ habitObjectIds: [-1, 1], objectId: 1 });
    expect(programIdOf("yoga_mat")).toBe(7);
    expect(programIdOf("kettlebell")).toBe(-1);
    expect(programIdOf(null)).toBe(-1);
  });

  it("removing the last habit leaves the empty placeholder, not a saved habit", () => {
    const p = removeHabit(draft(["read"], ["book"]), 0);
    expect(p).toMatchObject({ habits: [""], habitObjectIds: [], habitObjectEntries: [] });
    expect(savedHabits({ habits: p.habits, habitObjectEntries: p.habitObjectEntries })).toEqual([]);
  });

  it("habitPatch of nothing is the draft's blank state", () => {
    expect(habitPatch([])).toMatchObject({ habits: [""], habitObjectIds: [], objectId: 0 });
  });
});

describe("quick picks", () => {
  it("are six of the program's eight objects, in the program's order", () => {
    expect(QUICK_PICK_OBJECTS).toHaveLength(6);
    const ids = QUICK_PICK_OBJECTS.map((id) => OBJECTS.findIndex((o) => o.id === id));
    expect(ids.every((i) => i >= 0)).toBe(true);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });
});
