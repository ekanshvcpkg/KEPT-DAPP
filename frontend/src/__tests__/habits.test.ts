// C2's habit list rules, below the screen: what counts as a saved habit, what blocks Next, and that saving commits a
// habit's name and proof object together.
import { OBJECTS } from "@kept/config";
import { QUICK_PICK_OBJECTS } from "@/features/objects/catalog";
import { habitEntries, habitPatch, habitProblem, habitsReady, proofConflict, removeHabit, saveHabit, savedHabits, sharedProofObject, switchAllHabits, validObjectId } from "@/features/oaths/habits";

const draft = (habits: string[], ids?: number[], entries?: string[]) => ({ habits, ...(ids ? { habitObjectIds: ids } : {}), ...(entries ? { habitObjectEntries: entries } : {}) });
const BOOK = 1, PLANT = 5, YOGA = 7;

describe("what is a saved habit", () => {
  it("the empty placeholder is not a habit", () => {
    expect(habitEntries(draft([""]))).toEqual([]);
    expect(habitEntries(draft(["   ", ""]))).toEqual([]);
    expect(savedHabits(draft([""]))).toEqual([]);
    expect(habitProblem(draft([""]))).toBe("none");
    expect(habitsReady(draft([""]))).toBe(false);
  });

  it("needs a name AND a valid proof object", () => {
    expect(savedHabits(draft(["read"], [BOOK]))).toEqual([{ name: "read", objectId: BOOK, entry: "book" }]);
    expect(savedHabits(draft(["read"]))).toEqual([]); // a name with no proof isn't saved
    expect(savedHabits(draft(["read"], [-1]))).toEqual([]);
    expect(savedHabits(draft(["read"], [8]))).toEqual([]); // the program has eight objects, 0 to 7
    expect(savedHabits(draft(["read"], [1.5]))).toEqual([]);
    expect(validObjectId(7)).toBe(true);
    expect(validObjectId(8)).toBe(false);
    expect(validObjectId(undefined)).toBe(false);
    expect(habitProblem(draft(["read"], [-1]))).toBe("unfinished");
    expect(habitsReady(draft(["read"], [-1]))).toBe(false);
    expect(habitsReady(draft(["read"], [BOOK]))).toBe(true);
  });

  it("every habit shares the Oath's one proof object (the program has a single object_id)", () => {
    expect(sharedProofObject([{ objectId: BOOK }, { objectId: BOOK }])).toBe(BOOK);
    expect(sharedProofObject([{ objectId: BOOK }, { objectId: PLANT }])).toBeNull();
    expect(sharedProofObject([])).toBeNull();
    expect(habitProblem(draft(["read", "water"], [BOOK, PLANT]))).toBe("mixed");
    expect(habitsReady(draft(["read", "water"], [BOOK, PLANT]))).toBe(false);
    expect(habitsReady(draft(["read", "water"], [BOOK, BOOK]))).toBe(true);
  });

  it("at most eight habits", () => {
    const names = Array.from({ length: 9 }, (_, i) => `habit ${i}`);
    expect(habitsReady(draft(names, names.map(() => BOOK)))).toBe(false);
    expect(habitsReady(draft(names.slice(0, 8), names.slice(0, 8).map(() => BOOK)))).toBe(true);
  });
});

describe("saving, removing and switching", () => {
  it("Save commits the name and the proof object together, and the Oath's object follows the list", () => {
    const patch = saveHabit(draft([""]), null, { name: "  read 10 pages ", objectId: BOOK, entry: "book" });
    expect(patch).toEqual({ habits: ["read 10 pages"], habitObjectIds: [BOOK], habitObjectEntries: ["book"], objectId: BOOK, objectEntry: "book" });
    // Editing replaces the habit in place; the others are untouched.
    const two = { ...patch, habits: [...patch.habits, "stretch"], habitObjectIds: [BOOK, BOOK], habitObjectEntries: ["book", "book"] };
    const edited = saveHabit(two, 1, { name: "stretch for 5 minutes", objectId: BOOK, entry: "book" });
    expect(edited.habits).toEqual(["read 10 pages", "stretch for 5 minutes"]);
    expect(edited.habitObjectIds).toEqual([BOOK, BOOK]);
  });

  it("a saved habit keeps the catalog entry it was picked from", () => {
    const p = saveHabit(draft([""]), null, { name: "yoga", objectId: YOGA, entry: "yoga_mat" });
    expect(p.habitObjectEntries).toEqual(["yoga_mat"]);
    expect(p.objectId).toBe(YOGA);
  });

  it("removing the last habit leaves the empty placeholder, not a saved habit", () => {
    const p = removeHabit(draft(["read"], [BOOK], ["book"]), 0);
    expect(p).toMatchObject({ habits: [""], habitObjectIds: [], habitObjectEntries: [] });
    expect(savedHabits({ habits: p.habits, habitObjectIds: p.habitObjectIds })).toEqual([]);
  });

  it("a different proof object for one habit is a conflict, and switching moves every habit", () => {
    const d = draft(["read", "write"], [BOOK, BOOK], ["book", "book"]);
    expect(proofConflict(habitEntries(d), BOOK)).toBeNull();
    expect(proofConflict(habitEntries(d), PLANT)).toBe(BOOK);
    expect(proofConflict([], PLANT)).toBeNull(); // the only habit may name any object
    const all = switchAllHabits(d, 0, { name: "read", objectId: PLANT, entry: "plant" });
    expect(all.habitObjectIds).toEqual([PLANT, PLANT]);
    expect(all.objectId).toBe(PLANT);
    expect(habitsReady({ habits: all.habits, habitObjectIds: all.habitObjectIds })).toBe(true);
    // Switching while adding a new habit includes it.
    expect(switchAllHabits(d, null, { name: "walk", objectId: PLANT, entry: "plant" }).habits).toEqual(["read", "write", "walk"]);
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
    // The other two stay reachable by search.
    expect(OBJECTS.map((o) => o.id).filter((id) => !(QUICK_PICK_OBJECTS as readonly string[]).includes(id))).toEqual(["skipping_rope", "yoga_mat"]);
  });
});
