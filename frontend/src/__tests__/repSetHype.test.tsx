// The Keeper's hype lines through the real set screen: the golden vector "freeze-resume" (8 push-ups, "Freeze!" after
// rep 4) fed through RepSet in real time, with the expo-audio mock recording which clip plays when. Never a hype line in
// the Freeze, never with the Keeper voice off, the opener and the done line in the chosen language, a camera stall
// mid-set never gets the "after the photo" line, and a hype line still playing when the screen closes mid-set stops.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { readFileSync } from "fs";
import { join } from "path";
import { t } from "@/copy";
import type { RepEvidence } from "@/api";
import { RepSet } from "@/screens/proof/RepSet";
import { useSettings } from "@/state/settings";

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

// Every mp3 is the same stub in Jest: the hype clips get their id as the source, so a play says which line it was.
jest.mock("@/features/keeper/hypeSources", () => {
  const { HYPE_LINES } = jest.requireActual("@/features/keeper/hypeLines");
  return { HYPE_SOURCES: Object.fromEntries(HYPE_LINES.map((l: { id: string }) => [l.id, `hype/${l.id}`])) };
});

const audio = jest.requireMock("expo-audio") as { createAudioPlayer: jest.Mock; __player: { play: jest.Mock; pause: jest.Mock; replace: jest.Mock } };
const vector = JSON.parse(readFileSync(join(__dirname, "../../../packages/engine/test-vectors/reps-vectors.json"), "utf8"))
  .vectors.find((v: { name: string }) => v.name === "freeze-resume");

/** What a play was: a hype line ("hype/start-clean-1", from the mock above) or a count / set line ("voice"). */
const clipOf = (src: unknown): string => (typeof src === "string" && src.startsWith("hype/") ? src : "voice");

/**
 * Runs the vector through RepSet (samples whose t is in `skip` are left out: a camera stall); returns what was played,
 * on the trace clock (each play's t), and the evidence if the set finished.
 */
async function runSet(o: { freezeAfter: number; skip?: [number, number]; until?: number; unmountAt?: number } ) {
  jest.useFakeTimers();
  jest.clearAllMocks();
  const plays: { clip: string; t: number }[] = [];
  const pauses: { t: number }[] = [];
  let src: unknown = null, t0 = 0, d0 = 0;
  const traceNow = () => t0 + (Date.now() - d0);
  audio.createAudioPlayer.mockImplementation((s: unknown) => { src = s; return audio.__player; });
  audio.__player.replace.mockImplementation((s: unknown) => { src = s; });
  audio.__player.play.mockImplementation(() => { plays.push({ clip: clipOf(src), t: traceNow() }); });
  audio.__player.pause.mockImplementation(() => { pauses.push({ t: traceNow() }); });
  const done = jest.fn<void, [RepEvidence, string | null]>();
  const view = await render(<RepSet exercise="pushup" target={8} gesture="thumbs_up" freezeAfter={o.freezeAfter}
    secondsLeft={() => 300} onNoTime={jest.fn()} onDone={done} onAbort={jest.fn()} />);
  const pose = async (ts: number, p: number[]) => {
    mockClockT = ts;
    await act(async () => { (screen.getByTestId("rep-counter").props.onPose as (e: object) => void)({ nativeEvent: { t: ts, w: 640, h: 480, rot: 90, tilt: 0, p } }); });
  };
  const { t: ts, p } = vector.trace as { t: number[]; p: number[] };
  await pose(-100, p.slice(0, 36));
  t0 = -100; d0 = Date.now();
  await fireEvent.press(screen.getByText(t("additions.reps.start", { target: 8, label: t("additions.reps.pushups") })));
  let unmounted = false;
  for (let i = 0; i < ts.length && !done.mock.calls.length; i++) {
    const at = ts[i]!;
    if (o.until !== undefined && at > o.until) break;
    await act(async () => { jest.advanceTimersByTime(at - traceNow()); });
    if (o.unmountAt !== undefined && at >= o.unmountAt) { await act(async () => { view.unmount(); }); unmounted = true; break; }
    if (o.skip && at >= o.skip[0] && at <= o.skip[1]) continue;
    await pose(at, p.slice(i * 36, i * 36 + 36));
  }
  await act(async () => { jest.advanceTimersByTime(5000); });
  if (!unmounted) await act(async () => { view.unmount(); });
  jest.useRealTimers();
  return { plays, hype: plays.filter((x) => x.clip.startsWith("hype/")), pauses, evidence: done.mock.calls[0]?.[0] ?? null };
}

const reps = vector.expect.reps as { startT: number; endT: number }[];

describe("RepSet › the Keeper's hype lines", () => {
  beforeEach(() => { useSettings.getState().set({ keeperVoice: true, hypeLanguage: "clean" }); });

  it("opens and closes the set, says one line after the Freeze photo, nothing in the Freeze or over a count", async () => {
    const r = await runSet({ freezeAfter: 4 });
    expect(r.evidence?.phoneCount).toBe(8);
    const ids = r.hype.map((x) => x.clip);
    expect(ids[0]).toMatch(/^hype\/start-clean-\d$/);
    expect(ids.at(-1)).toMatch(/^hype\/done-clean-\d$/);
    expect(ids.filter((id) => id.startsWith("hype/resume-"))).toHaveLength(1);
    // The Freeze: from the count of rep 4 until counting resumes 3.5 s later, no hype line starts.
    const freezeAt = reps[3]!.endT;
    expect(r.hype.filter((x) => x.t >= freezeAt && x.t < freezeAt + 3500)).toEqual([]);
    // No hype line starts while a count or a set line is still playing (they're ≤ 1.4 s; the coach waits for them).
    for (const h of r.hype) {
      const before = r.plays.filter((x) => !x.clip.startsWith("hype/") && x.t <= h.t).at(-1);
      if (before) expect([h.clip, h.t - before.t >= 150]).toEqual([h.clip, true]);
    }
    // Once a hype line has played, every count and set line first cuts it off, so the Keeper never talks over himself.
    const voice = r.plays.filter((x) => !x.clip.startsWith("hype/") && x.t >= r.hype[0]!.t);
    expect(voice.length).toBeGreaterThanOrEqual(9);
    for (const v of voice) expect(r.pauses.some((x) => x.t === v.t)).toBe(true);
  });

  it("swears in the no-filter set, and stays silent with the Keeper voice off", async () => {
    useSettings.getState().set({ hypeLanguage: "noFilter" });
    const raw = await runSet({ freezeAfter: 4 });
    expect(raw.hype.length).toBeGreaterThanOrEqual(3);
    expect(raw.hype.every((x) => /^hype\/\w+-nofilter-\d$/.test(x.clip))).toBe(true);
    useSettings.getState().set({ keeperVoice: false });
    const off = await runSet({ freezeAfter: 4 });
    expect(off.evidence?.phoneCount).toBe(8);
    expect(off.plays).toEqual([]);
  });

  it("a camera stall mid-set gets a welcome back, never the line about the Freeze photo", async () => {
    // A 1.3 s gap in the feed after rep 4 (the counter's "setup"), the Freeze moved to rep 7.
    const r = await runSet({ freezeAfter: 7, skip: [7050, 8350], until: 14_000 });
    expect(r.hype.filter((x) => x.clip.startsWith("hype/resume-"))).toEqual([]);
    expect(r.hype.map((x) => x.clip)).toContainEqual(expect.stringMatching(/^hype\/back-clean-\d$/));
  });

  it("stops a hype line still playing when the screen closes mid-set", async () => {
    const r = await runSet({ freezeAfter: 4, unmountAt: 11_000 });
    const last = r.hype.at(-1)!;
    expect(last.clip).toMatch(/^hype\/resume-clean-\d$/);
    expect(r.pauses.some((x) => x.t >= 11_000)).toBe(true);
    expect(r.evidence).toBeNull();
  });
});
