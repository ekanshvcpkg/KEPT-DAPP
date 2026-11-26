import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { RepCounter, SAMPLE_INTS, countReps, parseRepHabit, parseTrace, repHabitText, traceDigest } from "../src/shared/reps.js";

// The rep engine exists twice, byte for byte: the app counts live with packages/engine/src/reps.ts and the server
// recounts the uploaded trace with this copy. If they drift, the phone and the receipt can disagree on a count.
// The behaviour itself is tested in packages/engine/src/reps.test.ts.
test("backend/src/shared/reps.ts is a byte-identical copy of packages/engine/src/reps.ts", () => {
  const sha = (rel: string) => createHash("sha256").update(readFileSync(new URL(rel, import.meta.url))).digest("hex");
  assert.equal(sha("../src/shared/reps.ts"), sha("../../packages/engine/src/reps.ts"),
    "copy packages/engine/src/reps.ts over backend/src/shared/reps.ts (or the other way round) so both count the same");
});

test("the server copy reads rep habits and recounts a trace", () => {
  assert.deepEqual(parseRepHabit("20 push-ups"), { exercise: "pushup", target: 20 });
  assert.equal(parseRepHabit("a book"), null);
  assert.equal(repHabitText("squat", 30), "30 squats");
  const empty = { v: 1, engine: "reps@1", exercise: "squat", aspect: 0.75, t: [0, 50, 100], p: new Array(3 * SAMPLE_INTS).fill(0), pauses: [] };
  const trace = parseTrace(empty);
  assert.ok(trace);
  assert.deepEqual(countReps(trace), { count: 0, reps: [] });
  assert.equal(parseTrace({ ...empty, engine: "reps@2" }), null);
  assert.equal(new RepCounter("pushup", 4 / 3).count, 0);
});

test("the server copy replays the engine's golden vectors to the same digest", () => {
  const file = JSON.parse(readFileSync(new URL("../../packages/engine/test-vectors/reps-vectors.json", import.meta.url), "utf8")) as
    { vectors: { name: string; trace: unknown; expect: unknown }[] };
  assert.ok(file.vectors.length >= 4);
  for (const v of file.vectors) {
    const trace = parseTrace(v.trace);
    assert.ok(trace, v.name);
    assert.deepEqual(traceDigest(trace), v.expect, v.name);
  }
});
