// The Keeper's hype lines in a live rep set: the manifest and its bundled clips, the chooser (cooldowns, variety,
// language), the coach's timing (never over a count, never in the Freeze, skipped when the next rep comes first), the
// player (Keeper voice setting) and the Settings switch for the "no filter" set.
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { t } from "@/copy";
import { I4 } from "@/screens/profile/Profile";
import { useSettings } from "@/state/settings";
import { HYPE_LANGS, HYPE_LINES, HYPE_MAX_CHARS, HYPE_SITUATIONS, hypeIds } from "@/features/keeper/hypeLines";
import { HYPE_GAP_MS, SLOW_REP_MS, chooseHype, hypeSituation, repMilestone } from "@/features/keeper/hypeChooser";
import type { HypeInput } from "@/features/keeper/hypeChooser";
import { HYPE_AFTER_MS, HypeCoach } from "@/features/keeper/hypeCoach";
import type { HypeCoachDeps } from "@/features/keeper/hypeCoach";
import { HYPE_SOURCES } from "@/features/keeper/hypeSources";
import durations from "@/features/keeper/voiceDurations.gen.json";
import { keeperBusyMs, repSetHype, sayCount, sayHype } from "@/features/keeper/countVoice";

const HYPE_DIR = join(__dirname, "../../assets/voice/hype");
const SWEAR = /\b(fuck\w*|shit\w*|shite|bloody|damn\w*|arse\w*|crap|hell|bollocks|sod|bastard\w*)\b/i;
const player = (jest.requireMock("expo-audio") as { __player: { play: jest.Mock; pause: jest.Mock; replace: jest.Mock } }).__player;
/** A deterministic rng cycling through the given values. */
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };
const input = (p: Partial<HypeInput> & Pick<HypeInput, "event">): HypeInput =>
  ({ target: 10, sinceLastMs: Infinity, repsSinceHype: 0, lang: "clean", ...p });

describe("hype manifest", () => {
  it("has 3–4 short variants per situation in both languages, unique ids and texts", () => {
    for (const s of HYPE_SITUATIONS) for (const lang of HYPE_LANGS) {
      const n = hypeIds(s, lang).length;
      expect([s, lang, n >= 3 && n <= 4]).toEqual([s, lang, true]);
    }
    for (const l of HYPE_LINES) {
      expect(l.text.trim()).toBe(l.text);
      expect([l.id, l.text.length <= HYPE_MAX_CHARS && l.text.length > 0]).toEqual([l.id, true]);
    }
    expect(new Set(HYPE_LINES.map((l) => l.id)).size).toBe(HYPE_LINES.length);
    expect(new Set(HYPE_LINES.map((l) => l.text)).size).toBe(HYPE_LINES.length);
  });

  it("keeps the clean set clean, and the no-filter set actually swears", () => {
    expect(HYPE_LINES.filter((l) => l.lang === "clean" && SWEAR.test(l.text)).map((l) => l.text)).toEqual([]);
    const raw = HYPE_LINES.filter((l) => l.lang === "noFilter");
    expect(raw.filter((l) => SWEAR.test(l.text)).length).toBeGreaterThanOrEqual(raw.length * 0.8);
  });

  it("never crosses the line in either set: no slurs, nothing about identity, body, sex or self-harm", () => {
    const OFF_LIMITS = /\b(cunt\w*|twat\w*|bitch\w*|whore\w*|slut\w*|dick(s|head\w*)?|cock(s|suck\w*)?|puss(y|ies)|wank\w*|prick\w*|retard\w*|fag\w*|gay|homo\w*|tranny|spaz\w*|cripple\w*|midget|fat|ugly|stupid|idiot\w*|moron\w*|loser\w*|worthless|pathetic|kill (yourself|urself)|kys|suicid\w*|die|dead|cut yourself|sex\w*|horny|naked|virgin\w*|ass|asshole\w*|bastard\w*)\b/i;
    expect(HYPE_LINES.filter((l) => OFF_LIMITS.test(l.text)).map((l) => l.text)).toEqual([]);
  });

  it("bundles a clip per id: a file on disk, a static require, a length, nothing extra, small in total", () => {
    const files = readdirSync(HYPE_DIR).filter((f) => f.endsWith(".mp3")).sort();
    expect(files).toEqual(HYPE_LINES.map((l) => `${l.id}.mp3`).sort());
    expect(Object.keys(HYPE_SOURCES).sort()).toEqual(HYPE_LINES.map((l) => l.id).sort());
    const ms = durations as Record<string, number>;
    let bytes = 0;
    for (const l of HYPE_LINES) {
      const file = join(HYPE_DIR, `${l.id}.mp3`);
      expect(existsSync(file)).toBe(true);
      bytes += statSync(file).size;
      expect(HYPE_SOURCES[l.id]).toBeTruthy();
      // 1–2 s spoken (a little slack for the voice's pauses), so a line fits between two reps.
      expect([l.id, ms[`hype/${l.id}`]! >= 600 && ms[`hype/${l.id}`]! <= 3000]).toEqual([l.id, true]);
    }
    expect(bytes).toBeLessThan(1.5 * 1024 * 1024);
  });
});

describe("hype chooser", () => {
  it("maps reps to milestones (the last rep is the set's done)", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => repMilestone(n, 10)))
      .toEqual(["first", null, null, null, "halfway", null, "threeLeft", null, "last", null]);
    expect([1, 2, 3, 4].map((n) => repMilestone(n, 4))).toEqual(["first", null, "last", null]);
    expect(repMilestone(1, 2)).toBeNull();
    expect(repMilestone(3, 6)).toBe("threeLeft"); // three left wins over halfway
  });

  it("always opens and closes the set; other moments wait out their cooldown", () => {
    expect(hypeSituation(input({ event: { kind: "start" }, sinceLastMs: 0 }))).toBe("start");
    expect(hypeSituation(input({ event: { kind: "done" }, sinceLastMs: 0 }))).toBe("done");
    expect(hypeSituation(input({ event: { kind: "back" }, sinceLastMs: HYPE_GAP_MS.event - 1 }))).toBeNull();
    expect(hypeSituation(input({ event: { kind: "back" }, sinceLastMs: HYPE_GAP_MS.event }))).toBe("back");
    expect(hypeSituation(input({ event: { kind: "resume" }, sinceLastMs: HYPE_GAP_MS.event }))).toBe("resume");
    expect(hypeSituation(input({ event: { kind: "halfRep" }, sinceLastMs: HYPE_GAP_MS.shame - 1 }))).toBeNull();
    expect(hypeSituation(input({ event: { kind: "halfRep" }, sinceLastMs: HYPE_GAP_MS.shame }))).toBe("halfRep");
    expect(hypeSituation(input({ event: { kind: "fault" }, sinceLastMs: HYPE_GAP_MS.shame }))).toBe("fault");
    expect(hypeSituation(input({ event: { kind: "rep", n: 5, ms: 1500 }, sinceLastMs: HYPE_GAP_MS.milestone - 1 }))).toBeNull();
    expect(hypeSituation(input({ event: { kind: "rep", n: 5, ms: 1500 }, sinceLastMs: HYPE_GAP_MS.milestone }))).toBe("halfway");
    expect(hypeSituation(input({ event: { kind: "rep", n: 10, ms: 1500 } }))).toBeNull();
  });

  it("shames a slow rep, and hypes a plain rep roughly every 3–4 reps", () => {
    expect(hypeSituation(input({ event: { kind: "rep", n: 3, ms: SLOW_REP_MS }, sinceLastMs: HYPE_GAP_MS.shame }))).toBe("slow");
    expect(hypeSituation(input({ event: { kind: "rep", n: 3, ms: SLOW_REP_MS }, sinceLastMs: HYPE_GAP_MS.shame - 1 }))).toBeNull();
    const plain = (repsSinceHype: number, r: number, sinceLastMs = 10_000) =>
      hypeSituation(input({ event: { kind: "rep", n: 3, ms: 1500 }, repsSinceHype, sinceLastMs }), () => r);
    expect(plain(2, 0)).toBeNull();
    expect(plain(3, 0.4)).toBe("streak");
    expect(plain(3, 0.6)).toBeNull();
    expect(plain(4, 0.99)).toBe("streak");
    expect(plain(6, 0, HYPE_GAP_MS.streak - 1)).toBeNull();
  });

  it("picks a random variant in the chosen language, never the same line twice in a row, fresh ones first", () => {
    const ids = hypeIds("start", "clean");
    expect(chooseHype(input({ event: { kind: "start" } }), () => 0)).toBe(ids[0]);
    expect(chooseHype(input({ event: { kind: "start" } }), () => 0.99)).toBe(ids[ids.length - 1]);
    for (const r of [0, 0.3, 0.5, 0.7, 0.99]) {
      expect(chooseHype(input({ event: { kind: "start" }, lastId: ids[0] }), () => r)).not.toBe(ids[0]);
      expect(chooseHype(input({ event: { kind: "start" }, lang: "noFilter" }), () => r)).toMatch(/^start-nofilter-\d$/);
    }
    // With all but one used, the unused one comes next.
    expect(chooseHype(input({ event: { kind: "start" }, used: new Set(ids.slice(1)) }), () => 0.99)).toBe(ids[0]);
    // All used: still never the last one.
    expect(chooseHype(input({ event: { kind: "start" }, used: new Set(ids), lastId: ids[1] }), () => 0.5)).not.toBe(ids[1]);
  });
});

/** A coach on a fake clock: schedule() queues, flush() runs what's due, play() records and makes the Keeper busy. */
function fakeCoach(target: number, o: { canSpeak?: () => boolean; play?: (id: string) => number; lang?: "clean" | "noFilter"; rng?: () => number } = {}) {
  let now = 0, busyUntil = 0;
  const queue: { at: number; fn: () => void; keep: boolean }[] = [];
  const played: { id: string; at: number }[] = [];
  const deps: HypeCoachDeps = {
    now: () => now,
    schedule: (ms, fn, keep) => { queue.push({ at: now + ms, fn, keep: !!keep }); },
    busyMs: () => Math.max(0, busyUntil - now),
    canSpeak: o.canSpeak ?? (() => true),
    play: o.play ?? ((id) => { played.push({ id, at: now }); busyUntil = now + 1500; return 1500; }),
    clipMs: () => 1500,
    lang: () => o.lang ?? "clean",
    rng: o.rng ?? seq(0.1, 0.7, 0.4, 0.9, 0.2),
  };
  const coach = new HypeCoach(target, deps);
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = queue.filter((q) => q.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      queue.splice(queue.indexOf(due), 1);
      now = Math.max(now, due.at);
      due.fn();
    }
    now = end;
  };
  /** The Keeper says a count of ms (what sayCount does to the busy clock). */
  const count = (ms = 700) => { busyUntil = now + ms; };
  return { coach, advance, count, played, queue, setBusy: (ms: number) => { busyUntil = now + ms; } };
}

describe("hype coach", () => {
  it("opens the set after the clip playing now, and welcomes you back only after losing you", () => {
    const f = fakeCoach(10);
    f.setBusy(1358); // "Begin. I'm counting."
    f.coach.ready();
    expect(f.queue[0]!.at).toBe(1358 + HYPE_AFTER_MS);
    f.advance(1000);
    expect(f.played).toEqual([]);
    f.advance(1000);
    expect(f.played.map((p) => p.id)).toEqual([expect.stringMatching(/^start-clean-/)]);
    f.advance(10_000);
    f.coach.ready(); // a resume after a stall: nothing new to say
    f.advance(5000);
    expect(f.played).toHaveLength(1);
    f.coach.lost(); f.advance(4000); f.coach.ready(); f.advance(3000);
    expect(f.played.map((p) => p.id)[1]).toMatch(/^back-clean-/);
  });

  it("speaks after the count, never during the Freeze, and not when the next rep would cut it off", () => {
    let freeze = false;
    const f = fakeCoach(10, { canSpeak: () => !freeze });
    f.coach.ready(); f.advance(5000);
    // Rep 1 of a slow, steady set: "first" fits after the count.
    f.count(); f.coach.rep(1, 3000); f.advance(3500);
    expect(f.played.map((p) => p.id)[1]).toMatch(/^first-clean-/);
    expect(f.played[1]!.at).toBeGreaterThanOrEqual(5000 + 700 + HYPE_AFTER_MS);
    // Halfway at the freeze: the line is dropped.
    f.count(); f.coach.rep(4, 3000); f.advance(3500); f.count(); freeze = true; f.coach.rep(5, 3000); f.advance(5000);
    expect(f.played.some((p) => p.id.startsWith("halfway"))).toBe(false);
    freeze = false;
    f.coach.resume(); f.advance(2000);
    expect(f.played.at(-1)!.id).toMatch(/^resume-clean-/);
    // A fast set (1.2 s a rep): the count plus a 1.5 s line doesn't fit before the next rep.
    const fast = fakeCoach(10);
    fast.coach.ready(); fast.advance(5000);
    for (let n = 1; n <= 9; n++) { fast.count(); fast.coach.rep(n, 1000); fast.advance(1200); }
    expect(fast.played.map((p) => p.id)).toEqual([expect.stringMatching(/^start-/)]);
  });

  it("a newer moment replaces a pending line; a line that didn't play doesn't count", () => {
    const f = fakeCoach(10);
    f.coach.ready(); f.advance(5000);
    f.setBusy(1306); // "Freeze!" just started
    f.coach.resume(); f.coach.resume(); // the freeze end and the counter's "setup" right after
    f.advance(3000);
    expect(f.played.filter((p) => p.id.startsWith("resume"))).toHaveLength(1);
    // Voice off: nothing plays, and the next moment isn't held back by a cooldown.
    let on = false;
    const heard: string[] = [];
    const g = fakeCoach(10, { play: (id) => { if (!on) return 0; heard.push(id); return 1500; } });
    g.coach.ready(); g.advance(1000);
    on = true;
    g.coach.lost(); g.coach.ready(); g.advance(1000);
    expect(heard).toEqual([expect.stringMatching(/^back-/)]);
  });

  it("over a steady 20-rep set: a line every few reps, never the same twice in a row, in the chosen language", () => {
    const f = fakeCoach(20, { lang: "noFilter", rng: seq(0.13, 0.62, 0.38, 0.91, 0.27, 0.55, 0.05, 0.77) });
    f.coach.ready(); f.advance(4000);
    for (let n = 1; n <= 20; n++) {
      f.count(); f.coach.rep(n, 2200); f.advance(n === 20 ? 0 : 3200);
    }
    expect(f.coach.done()).toBe(true);
    f.advance(4000);
    const ids = f.played.map((p) => p.id);
    expect(ids.every((id) => id.includes("-nofilter-"))).toBe(true);
    expect(ids.slice(1).every((id, i) => id !== ids[i])).toBe(true);
    const during = ids.filter((id) => !/^(start|done)-/.test(id));
    expect(during.length).toBeGreaterThanOrEqual(5); // first, halfway, three left, last + streaks
    expect(during.length).toBeLessThanOrEqual(9); // not every rep
    expect(ids.at(-1)).toMatch(/^done-nofilter-/);
    // No two lines closer than the shortest cooldown.
    const at = f.played.map((p) => p.at);
    expect(at.slice(1).every((a, i) => a - at[i]! >= HYPE_GAP_MS.milestone)).toBe(true);
  });

  it("shames a half rep only once the set is under way", () => {
    const f = fakeCoach(10);
    expect(f.coach.halfRep()).toBe(false);
    f.coach.ready(); f.advance(10_000);
    expect(f.coach.halfRep()).toBe(true);
    f.advance(2000);
    expect(f.played.at(-1)!.id).toMatch(/^halfRep-clean-/);
    expect(f.coach.fault()).toBe(false); // within the shame cooldown
  });

  it("answers false for a shaming line that can't end before the next rep, so the plain jab plays instead", () => {
    const f = fakeCoach(10);
    f.coach.ready(); f.advance(5000);
    // A brisk set: a rep every 1.6 s, so count + breath + a 1.5 s line never fits.
    for (let n = 1; n <= 3; n++) { f.count(); f.coach.rep(n, 1200); f.advance(1600); }
    f.advance(6000);
    const before = f.played.length;
    expect(f.coach.halfRep()).toBe(false);
    expect(f.queue).toEqual([]);
    f.advance(3000);
    expect(f.played).toHaveLength(before);
  });
});

describe("hype player", () => {
  beforeEach(() => { jest.clearAllMocks(); useSettings.getState().set({ keeperVoice: true, hypeLanguage: "clean" }); });

  it("plays only with the Keeper voice on, and a count cuts a hype line off", () => {
    useSettings.getState().set({ keeperVoice: false });
    expect(sayHype("start-clean-1")).toBe(0);
    expect(player.play).not.toHaveBeenCalled();
    useSettings.getState().set({ keeperVoice: true });
    const ms = sayHype("start-clean-1");
    expect(ms).toBe((durations as Record<string, number>)["hype/start-clean-1"]);
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(keeperBusyMs()).toBeGreaterThan(0);
    sayCount(3);
    expect(player.pause).toHaveBeenCalled();
  });

  it("speaks in the language picked in Settings", () => {
    jest.useFakeTimers();
    try {
      const heard: string[] = [];
      const hype = () => repSetHype(10, { schedule: (ms, fn) => { setTimeout(fn, ms); }, canSpeak: () => true, play: (id) => { heard.push(id); return sayHype(id); } });
      useSettings.getState().set({ hypeLanguage: "noFilter" });
      hype().ready();
      jest.advanceTimersByTime(5000);
      useSettings.getState().set({ hypeLanguage: "clean" });
      hype().ready();
      jest.advanceTimersByTime(5000);
      expect(heard).toEqual([expect.stringMatching(/^start-nofilter-\d$/), expect.stringMatching(/^start-clean-\d$/)]);
      expect(player.play).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("Settings › The Keeper, no filter", () => {
  const Stack = createNativeStackNavigator();
  const safe = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };

  it("is off (clean) by default and switches the hype language", async () => {
    useSettings.getState().set({ hypeLanguage: "clean" });
    // No retries, no garbage-collection timers: nothing outlives the test.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const view = await render(
      <SafeAreaProvider initialMetrics={safe}>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="I4" component={I4} />
            </Stack.Navigator>
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    const toggle = await screen.findByRole("switch", { name: t("additions.keeper.hypeSetting") });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText(t("additions.keeper.hypeSettingSub"))).toBeTruthy();
    await fireEvent.press(toggle);
    expect(useSettings.getState().hypeLanguage).toBe("noFilter");
    await fireEvent.press(screen.getByRole("switch", { name: t("additions.keeper.hypeSetting") }));
    expect(useSettings.getState().hypeLanguage).toBe("clean");
    await act(async () => { view.unmount(); });
    queryClient.clear();
  });
});
