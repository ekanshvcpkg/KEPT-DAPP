// RepSet end to end on a recorded set: the golden vector "freeze-resume" (8 push-ups) fed through the screen in real
// time, with "Freeze!" at the server's pick (rep 4). The evidence it hands over must be what the server's recount
// accepts (backend/src/v4/repProof.ts): one pause (the freeze) of 1.5–8 s holding the freeze photo, no gap over 2 s,
// the freeze between rep 4 and rep 5.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { t } from "@/copy";
import type { RepEvidence } from "@/api";
import { countReps, parseTrace } from "@kept/engine";
import { RepSet } from "@/screens/proof/RepSet";

let mockClockT = 0;
jest.mock("kept-gesture", () => {
  const React = require("react");
  return {
    RepCounterView: React.forwardRef(function RepCounterView(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ capture: async () => ({ jpeg: "/9j/freeze", sha256: "c".repeat(64), t: mockClockT }) }), []);
      return React.createElement("View", { testID: "rep-counter", ...props });
    }),
  };
});

const vector = JSON.parse(readFileSync(join(__dirname, "../../../packages/engine/test-vectors/reps-vectors.json"), "utf8"))
  .vectors.find((v: { name: string }) => v.name === "freeze-resume");

test("a recorded 8 push-up set yields evidence the server's recount accepts", async () => {
  jest.useFakeTimers();
  const done = jest.fn<void, [RepEvidence, string | null]>();
  await render(<RepSet exercise="pushup" target={8} gesture="thumbs_up" freezeAfter={4}
    secondsLeft={() => 300} onNoTime={jest.fn()} onDone={done} onAbort={jest.fn()} />);
  const pose = async (ts: number, p: number[]) => {
    mockClockT = ts;
    await act(async () => { (screen.getByTestId("rep-counter").props.onPose as (e: object) => void)({ nativeEvent: { t: ts, w: 640, h: 480, rot: 90, tilt: 0, p } }); });
  };
  const { t: ts, p } = vector.trace as { t: number[]; p: number[] };
  await pose(-100, p.slice(0, 36)); // a level phone enables Start
  await fireEvent.press(screen.getByText(t("additions.reps.start", { target: 8, label: t("additions.reps.ex.pushup.label") })));
  for (let i = 0; i < ts.length && !done.mock.calls.length; i++) {
    if (i > 0) await act(async () => { jest.advanceTimersByTime(ts[i]! - ts[i - 1]!); });
    await pose(ts[i]!, p.slice(i * 36, i * 36 + 36));
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  jest.useRealTimers();

  expect(done).toHaveBeenCalledTimes(1);
  const [ev, jpeg] = done.mock.calls[0]!;
  expect(jpeg).toBe("/9j/freeze");
  expect(ev.phoneCount).toBe(8);
  expect(ev.trace.pauses).toHaveLength(1);
  const [a, b] = ev.trace.pauses[0]!;
  expect(b - a).toBeGreaterThanOrEqual(1500); expect(b - a).toBeLessThanOrEqual(8000);
  expect(ev.freeze).toMatchObject({ afterRep: 4, sha256: "c".repeat(64) });
  expect(ev.freeze!.t).toBeGreaterThanOrEqual(a); expect(ev.freeze!.t).toBeLessThanOrEqual(b);
  expect(ev.reps[3]!.endT).toBeLessThan(a); expect(ev.reps[4]!.startT).toBeGreaterThan(b);
  const gaps = ev.trace.t.slice(1).map((x, i) => x - ev.trace.t[i]!);
  expect(Math.max(...gaps)).toBeLessThanOrEqual(2000);
  expect(ev.trace.aspect).toBeCloseTo(640 / 480);
  if (process.env.REPSET_DUMP) require("fs").writeFileSync(process.env.REPSET_DUMP, JSON.stringify(ev));
});

test("the same set filmed with the phone rolled 16° counts in full: RepSet turns each sample upright before counting", async () => {
  // Uncorrected, this side-on set counts 0 of 8 at +16° (the contract's limit 10). The camera's frame shows the scene
  // turned clockwise by the tilt (front camera, RepCounterView.kt's sign); RepSet turns it back.
  const TILT = 16, aspect = 640 / 480;
  const turn = (s: number[]) => {
    if (s.every((x) => x === 0)) return s;
    const a = (TILT * Math.PI) / 180, o = s.slice();
    for (let j = 0; j < 36; j += 3) {
      const x = (s[j]! - 500) * aspect, y = s[j + 1]! - 500;
      o[j] = Math.round(500 + (x * Math.cos(a) - y * Math.sin(a)) / aspect);
      o[j + 1] = Math.round(500 + x * Math.sin(a) + y * Math.cos(a));
    }
    return o;
  };
  jest.useFakeTimers();
  const done = jest.fn<void, [RepEvidence, string | null]>();
  await render(<RepSet exercise="pushup" target={8} gesture="thumbs_up" freezeAfter={4}
    secondsLeft={() => 300} onNoTime={jest.fn()} onDone={done} onAbort={jest.fn()} />);
  const pose = async (ts: number, p: number[]) => {
    mockClockT = ts;
    await act(async () => { (screen.getByTestId("rep-counter").props.onPose as (e: object) => void)({ nativeEvent: { t: ts, w: 640, h: 480, rot: 90, tilt: TILT, p } }); });
  };
  const { t: ts, p } = vector.trace as { t: number[]; p: number[] };
  await pose(-100, turn(p.slice(0, 36)));
  await fireEvent.press(screen.getByText(t("additions.reps.start", { target: 8, label: t("additions.reps.ex.pushup.label") })));
  for (let i = 0; i < ts.length && !done.mock.calls.length; i++) {
    if (i > 0) await act(async () => { jest.advanceTimersByTime(ts[i]! - ts[i - 1]!); });
    await pose(ts[i]!, turn(p.slice(i * 36, i * 36 + 36)));
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  jest.useRealTimers();
  expect(done).toHaveBeenCalledTimes(1);
  const [ev] = done.mock.calls[0]!;
  expect(ev.phoneCount).toBe(8);
  // The trace holds the upright numbers (within rounding of the original), so the server's recount sees the same.
  const diffs = ev.trace.p.map((v, i) => Math.abs(v - p[i]!));
  expect(Math.max(...diffs.filter((_, i) => i % 3 !== 2))).toBeLessThanOrEqual(2);
  expect(parseTrace(JSON.parse(JSON.stringify(ev.trace)))).not.toBeNull();
  expect(countReps(ev.trace).count).toBe(8);
});

test("a jumping-jack set on the real engine (the golden vector with a freeze after rep 2), phone rolled 12°", async () => {
  // "jumping-jacks" (5 reps, portrait) with a 4 s stretch after rep 2 holding its last pose: the Freeze's time (RepSet
  // freezes for 3.5 s). The frames are turned by the tilt as the front camera would see them; RepSet turns them back.
  const jj = JSON.parse(readFileSync(join(__dirname, "../../../packages/engine/test-vectors/reps-vectors.json"), "utf8"))
    .vectors.find((v: { name: string }) => v.name === "jumping-jacks").trace as { t: number[]; p: number[]; aspect: number };
  const end = countReps({ ...jj, v: 1, engine: "reps@1", exercise: "jumpingjack", pauses: [] } as never).reps[1]!.endT;
  const i0 = jj.t.indexOf(end), TILT = 12, aspect = 480 / 640;
  const ts: number[] = [], ps: number[][] = [];
  for (let i = 0; i < jj.t.length; i++) {
    ts.push(jj.t[i]! + (i > i0 ? 4000 : 0)); ps.push(jj.p.slice(i * 36, i * 36 + 36));
    if (i === i0) for (let x = end + 50; x < end + 4000; x += 50) { ts.push(x); ps.push(jj.p.slice(i0 * 36, i0 * 36 + 36)); }
  }
  const turn = (s: number[]) => {
    const a = (TILT * Math.PI) / 180, o = s.slice();
    for (let j = 0; j < 36; j += 3) {
      const x = (s[j]! - 500) * aspect, y = s[j + 1]! - 500;
      o[j] = Math.round(500 + (x * Math.cos(a) - y * Math.sin(a)) / aspect);
      o[j + 1] = Math.round(500 + x * Math.sin(a) + y * Math.cos(a));
    }
    return s.every((v) => v === 0) ? s : o;
  };
  jest.useFakeTimers();
  const done = jest.fn<void, [RepEvidence, string | null]>();
  await render(<RepSet exercise="jumpingjack" target={5} gesture="thumbs_up" freezeAfter={2}
    secondsLeft={() => 300} onNoTime={jest.fn()} onDone={done} onAbort={jest.fn()} />);
  const pose = async (at: number, p: number[]) => {
    mockClockT = at;
    await act(async () => { (screen.getByTestId("rep-counter").props.onPose as (e: object) => void)({ nativeEvent: { t: at, w: 480, h: 640, rot: 0, tilt: TILT, p } }); });
  };
  expect(screen.getByText(t("additions.reps.frameArms"))).toBeTruthy();
  await pose(-100, turn(ps[0]!));
  await fireEvent.press(screen.getByText(t("additions.reps.start", { target: 5, label: t("additions.reps.ex.jumpingjack.label") })));
  for (let i = 0; i < ts.length && !done.mock.calls.length; i++) {
    if (i > 0) await act(async () => { jest.advanceTimersByTime(ts[i]! - ts[i - 1]!); });
    await pose(ts[i]!, turn(ps[i]!));
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  jest.useRealTimers();
  expect(done).toHaveBeenCalledTimes(1);
  const [ev] = done.mock.calls[0]!;
  expect(ev.trace.exercise).toBe("jumpingjack");
  expect(ev.phoneCount).toBe(5);
  expect(parseTrace(JSON.parse(JSON.stringify(ev.trace)))).not.toBeNull(); // the server reads it
  expect(countReps(ev.trace).count).toBe(5); // what the server recounts
  expect(ev.freeze).toMatchObject({ afterRep: 2 });
  const [a, b] = ev.trace.pauses[0]!;
  expect(b - a).toBeGreaterThanOrEqual(1500);
  expect(ev.reps[1]!.endT).toBeLessThan(a); expect(ev.reps[2]!.startT).toBeGreaterThan(b);
});
