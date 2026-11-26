// RepSet end to end on a recorded set: the golden vector "freeze-resume" (8 push-ups) fed through the screen in real
// time, with "Freeze!" at the server's pick (rep 4). The evidence it hands over must be what the server's recount
// accepts (backend/src/v4/repProof.ts): one pause (the freeze) of 1.5–8 s holding the freeze photo, no gap over 2 s,
// the freeze between rep 4 and rep 5.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { t } from "@/copy";
import type { RepEvidence } from "@/api";
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
  await fireEvent.press(screen.getByText(t("additions.reps.start", { target: 8, label: t("additions.reps.pushups") })));
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
