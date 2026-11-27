// RepSet for the activities beyond push-ups and squats, on a scripted counter (the engine is replaced by one that
// emits "ready", then a "rep" per second of samples, so the screen's own logic is what's tested): a plank shows and
// starts in seconds, says only its tens, freezes after the server's second and hands over a plank trace; every sample
// is turned upright by the camera's tilt before the counter and the trace; a half jumping jack gets its own hint and
// never the "go lower" clip.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "@/copy";
import type { RepEvidence } from "@/api";
import { RepSet } from "@/screens/proof/RepSet";
import { uprightPose } from "@/features/reps/upright";

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

jest.mock("@kept/engine", () => {
  const actual = jest.requireActual("@kept/engine");
  /**
   * "ready" on the first sample (and after a feed gap, with "setup"), then one "rep" per second; a jumping jack's 3rd rep
   * is preceded by a half rep, a high knee's by a same_leg fault.
   */
  class MockCounter {
    static fed: number[][] = [];
    private n = 0; private ready = false; private last = -1; private since = 0; private halfSaid = false;
    private readonly ex: string;
    constructor(ex: string) { this.ex = ex; MockCounter.fed = []; }
    get view() { return this.ready ? "front" : null; }
    push(s: { t: number; p: number[] }) {
      MockCounter.fed.push(s.p);
      const out: object[] = [];
      if (this.last >= 0 && s.t - this.last > 400) { this.ready = false; out.push({ type: "setup", t: s.t }); }
      this.last = s.t;
      if (!this.ready) { this.ready = true; this.since = s.t; out.push({ type: "ready", t: s.t }); return out; }
      if (this.ex === "jumpingjack" && this.n === 2 && !this.halfSaid && s.t - this.since >= 500) { this.halfSaid = true; out.push({ type: "half_rep", t: s.t }); }
      if (this.ex === "highknee" && this.n === 2 && !this.halfSaid && s.t - this.since >= 500) { this.halfSaid = true; out.push({ type: "fault", fault: "same_leg", t: s.t }); }
      if (s.t - this.since >= 1000) { const start = this.since; this.since = s.t; this.n++; out.push({ type: "rep", n: this.n, startT: start, bottomT: start + 500, endT: s.t }); }
      return out;
    }
  }
  return { ...actual, RepCounter: MockCounter };
});

jest.mock("@/features/keeper/countVoice", () => {
  const actual = jest.requireActual("@/features/keeper/countVoice");
  return { ...actual, sayCount: jest.fn(actual.sayCount), sayLine: jest.fn(actual.sayLine) };
});
const voice = jest.requireMock("@/features/keeper/countVoice") as { sayCount: jest.Mock; sayLine: jest.Mock };
const fed = () => (jest.requireMock("@kept/engine") as { RepCounter: { fed: number[][] } }).RepCounter.fed;

// Any 36-int pose with visible joints: what the camera sent, with the phone rolled 10° past its bucket.
const POSE = Array.from({ length: 12 }, (_, j) => [300 + j * 30, 400 + (j % 4) * 50, 90]).flat();
const TILT = 10;

async function runSet(exercise: "plank" | "jumpingjack" | "highknee", target: number, freezeAfter: number, o: { onHalf?: () => void } = {}) {
  jest.useFakeTimers();
  voice.sayCount.mockClear(); voice.sayLine.mockClear();
  const done = jest.fn<void, [RepEvidence, string | null]>();
  const view = await render(<RepSet exercise={exercise} target={target} gesture="thumbs_up" freezeAfter={freezeAfter}
    secondsLeft={() => 600} onNoTime={jest.fn()} onDone={done} onAbort={jest.fn()} />);
  const pose = async (ts: number) => {
    mockClockT = ts;
    await act(async () => { (screen.getByTestId("rep-counter").props.onPose as (e: object) => void)({ nativeEvent: { t: ts, w: 640, h: 480, rot: 90, tilt: TILT, p: POSE } }); });
  };
  await pose(-100);
  return { done, view, pose };
}

afterEach(() => { jest.useRealTimers(); });

test("a 20-second plank: seconds on screen, only its tens spoken, the freeze after the server's second, a plank trace", async () => {
  const { done, view, pose } = await runSet("plank", 20, 8);
  expect(screen.getByText(t("additions.reps.ofTargetSeconds", { target: 20 }))).toBeTruthy();
  expect(screen.getByText(t("additions.reps.ex.plank.begin"))).toBeTruthy();
  expect(screen.getByText(t("additions.reps.placeFloor"))).toBeTruthy();
  await fireEvent.press(screen.getByText("Start: 20-second plank"));
  let sawHold = false, sawView = false;
  for (let ts = 0; ts < 40_000 && !done.mock.calls.length; ts += 50) {
    await act(async () => { jest.advanceTimersByTime(50); });
    await pose(ts);
    sawHold ||= !!screen.queryByText(t("additions.reps.statusHold"));
    sawView ||= !!screen.queryByText(t("additions.reps.view.front"));
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(sawHold).toBe(true);
  expect(sawView).toBe(true);
  expect(done).toHaveBeenCalledTimes(1);
  const [ev] = done.mock.calls[0]!;
  expect(ev.trace.exercise).toBe("plank");
  expect(ev.phoneCount).toBe(20);
  expect(voice.sayCount.mock.calls.map((c) => c[0])).toEqual([10, 20]);
  expect(voice.sayLine.mock.calls.map((c) => c[0])).not.toContain("done"); // "every rep kept" isn't a plank's line
  expect(ev.freeze).toMatchObject({ afterRep: 8 });
  expect(ev.trace.pauses).toHaveLength(1);
  const [a, b] = ev.trace.pauses[0]!;
  expect(ev.reps[7]!.endT).toBeLessThan(a); expect(ev.reps[8]!.startT).toBeGreaterThan(b);
  // Every sample was turned upright by the tilt, the same numbers in the trace and in the counter.
  const upright = uprightPose(POSE, TILT, 640 / 480);
  expect(upright).not.toEqual(POSE);
  expect(ev.trace.p.slice(0, 36)).toEqual(upright);
  expect(ev.trace.p.slice(-36)).toEqual(upright);
  expect(fed().every((p) => p.every((v, i) => v === upright[i]))).toBe(true);
  await act(async () => { view.unmount(); });
});

test("a half jumping jack gets its own hint, and never the 'go lower' clip", async () => {
  const { done, view, pose } = await runSet("jumpingjack", 6, 3);
  await fireEvent.press(screen.getByText(t("additions.reps.start", { target: 6, label: t("additions.reps.ex.jumpingjack.label") })));
  let sawHint = false;
  for (let ts = 0; ts < 20_000 && !done.mock.calls.length; ts += 50) {
    await act(async () => { jest.advanceTimersByTime(50); });
    await pose(ts);
    sawHint ||= !!screen.queryByText(t("additions.reps.ex.jumpingjack.halfRep"));
  }
  await act(async () => { jest.advanceTimersByTime(100); });
  expect(sawHint).toBe(true);
  expect(voice.sayLine.mock.calls.map((c) => c[0])).not.toContain("halfRep");
  expect(voice.sayCount.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5, 6]);
  expect(done.mock.calls[0]![0].phoneCount).toBe(6);
  await act(async () => { view.unmount(); });
});

test("a fault of the added activities gets its own hint (high knees on one leg)", async () => {
  const { done, view, pose } = await runSet("highknee", 4, 2);
  expect(screen.getByText(t("additions.reps.placeChair"))).toBeTruthy();
  await fireEvent.press(screen.getByText(t("additions.reps.start", { target: 4, label: t("additions.reps.ex.highknee.label") })));
  let sawHint = false;
  for (let ts = 0; ts < 20_000 && !done.mock.calls.length; ts += 50) {
    await act(async () => { jest.advanceTimersByTime(50); });
    await pose(ts);
    sawHint ||= !!screen.queryByText(t("additions.reps.fault.same_leg"));
  }
  expect(sawHint).toBe(true);
  expect(done.mock.calls[0]![0].trace.exercise).toBe("highknee");
  await act(async () => { view.unmount(); });
});
