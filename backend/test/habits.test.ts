import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { combinedHabitsHash, habitChallengeKey, habitCount, habitObjectTexts, habitRejection, parseHabitObjects } from "../src/v4/habits.js";

test("habit objects are one plain short text per habit, trimmed and lower case", () => {
  assert.deepEqual(parseHabitObjects(["Dumbbell ", "BOOK", "running shoes"], 3), ["dumbbell", "book", "running shoes"]);
  assert.ok("error" in (parseHabitObjects(["dumbbell"], 2) as object), "one per habit");
  assert.ok("error" in (parseHabitObjects([], 0) as object));
  assert.ok("error" in (parseHabitObjects(["ok", "<script>"], 2) as object), "plain text only");
  assert.ok("error" in (parseHabitObjects(["ok", ""], 2) as object));
  assert.ok("error" in (parseHabitObjects(["x".repeat(81)], 1) as object));
  assert.ok("error" in (parseHabitObjects("dumbbell", 1) as object));
  assert.ok("error" in (parseHabitObjects(Array(9).fill("book"), 9) as object), "at most eight");
  assert.deepEqual(parseHabitObjects(["kettlebell", "sheet music"], 2), ["kettlebell", "sheet music"], "not limited to the program's eight objects");
});

test("each habit is proven with its own object; a habit with none stored uses the Oath's own", () => {
  const two = { habits: ["lift", "read"], habitObjects: ["dumbbell", "kettlebell"] };
  assert.deepEqual(habitObjectTexts(two, 4), ["dumbbell", "kettlebell"]);
  assert.equal(habitCount(two), 2);
  // An Oath from before per-habit objects: the program's object_id (4 = running shoes) is every habit's object.
  assert.deepEqual(habitObjectTexts({ habits: ["run", "stretch"], habitObjects: [] }, 4), ["running shoes", "running shoes"]);
  assert.deepEqual(habitObjectTexts({ habits: ["run"], habitObjects: [] }, 99), ["dumbbell"], "an unknown object_id is never invented");
  // No details at all: one habit with the Oath's object.
  assert.deepEqual(habitObjectTexts(null, 1), ["book"]);
  assert.equal(habitCount(null), 1);
});

test("a day's on-chain hash covers every habit's photo, in habit order", () => {
  const a = "a".repeat(64), b = "b".repeat(64);
  assert.equal(combinedHabitsHash([a, b]), createHash("sha256").update(Buffer.concat([Buffer.from(a, "hex"), Buffer.from(b, "hex")])).digest("hex"));
  assert.notEqual(combinedHabitsHash([a, b]), combinedHabitsHash([b, a]));
  assert.notEqual(combinedHabitsHash([a, b]), combinedHabitsHash([a]));
});

test("a habit can be proven once a day, and must exist", () => {
  assert.equal(habitRejection({ habit: 0, count: 2, done: [] }), null);
  assert.equal(habitRejection({ habit: 1, count: 2, done: [0] }), null);
  assert.equal(habitRejection({ habit: 0, count: 2, done: [0] })?.status, 409);
  assert.equal(habitRejection({ habit: 2, count: 2, done: [] })?.status, 400);
  assert.equal(habitRejection({ habit: -1, count: 2, done: [] })?.status, 400);
  assert.equal(habitRejection({ habit: 1.5, count: 2, done: [] })?.status, 400);
  assert.equal(habitRejection({ habit: "0", count: 2, done: [] })?.status, 400);
  assert.equal(habitRejection({ habit: undefined, count: 2, done: [] })?.status, 400);
});

test("each habit draws its own gesture challenge", () => {
  assert.notEqual(habitChallengeKey("Oath", 0), habitChallengeKey("Oath", 1));
});
