// The Keeper counting reps out loud: clips pre-generated in the custom KEPT Keeper voice (ElevenLabs,
// backend/scripts/keeper_count_voice.ts) and bundled, so counting is instant and offline. Metro needs static requires.
// Hype lines (hypeLines.ts, backend/scripts/keeper_hype_voice.ts) play on their own player and never over a count or a
// set line: those cut a hype line off, and the coach (hypeCoach.ts) waits for the clip playing now (keeperBusyMs). Any
// other Keeper line (voice.ts) silences them, waiting ones included (silenceHype).
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { useSettings } from "@/state/settings";
import { HypeCoach } from "./hypeCoach";
import type { HypeCoachDeps } from "./hypeCoach";
import { HYPE_SOURCES } from "./hypeSources";
import durations from "./voiceDurations.gen.json";

const COUNTS: Record<number, number> = {
  1: require("../../../assets/voice/count-1.mp3") as number,
  2: require("../../../assets/voice/count-2.mp3") as number,
  3: require("../../../assets/voice/count-3.mp3") as number,
  4: require("../../../assets/voice/count-4.mp3") as number,
  5: require("../../../assets/voice/count-5.mp3") as number,
  6: require("../../../assets/voice/count-6.mp3") as number,
  7: require("../../../assets/voice/count-7.mp3") as number,
  8: require("../../../assets/voice/count-8.mp3") as number,
  9: require("../../../assets/voice/count-9.mp3") as number,
  10: require("../../../assets/voice/count-10.mp3") as number,
  11: require("../../../assets/voice/count-11.mp3") as number,
  12: require("../../../assets/voice/count-12.mp3") as number,
  13: require("../../../assets/voice/count-13.mp3") as number,
  14: require("../../../assets/voice/count-14.mp3") as number,
  15: require("../../../assets/voice/count-15.mp3") as number,
  16: require("../../../assets/voice/count-16.mp3") as number,
  17: require("../../../assets/voice/count-17.mp3") as number,
  18: require("../../../assets/voice/count-18.mp3") as number,
  19: require("../../../assets/voice/count-19.mp3") as number,
  20: require("../../../assets/voice/count-20.mp3") as number,
  21: require("../../../assets/voice/count-21.mp3") as number,
  22: require("../../../assets/voice/count-22.mp3") as number,
  23: require("../../../assets/voice/count-23.mp3") as number,
  24: require("../../../assets/voice/count-24.mp3") as number,
  25: require("../../../assets/voice/count-25.mp3") as number,
  26: require("../../../assets/voice/count-26.mp3") as number,
  27: require("../../../assets/voice/count-27.mp3") as number,
  28: require("../../../assets/voice/count-28.mp3") as number,
  29: require("../../../assets/voice/count-29.mp3") as number,
  30: require("../../../assets/voice/count-30.mp3") as number,
  31: require("../../../assets/voice/count-31.mp3") as number,
  32: require("../../../assets/voice/count-32.mp3") as number,
  33: require("../../../assets/voice/count-33.mp3") as number,
  34: require("../../../assets/voice/count-34.mp3") as number,
  35: require("../../../assets/voice/count-35.mp3") as number,
  36: require("../../../assets/voice/count-36.mp3") as number,
  37: require("../../../assets/voice/count-37.mp3") as number,
  38: require("../../../assets/voice/count-38.mp3") as number,
  39: require("../../../assets/voice/count-39.mp3") as number,
  40: require("../../../assets/voice/count-40.mp3") as number,
  41: require("../../../assets/voice/count-41.mp3") as number,
  42: require("../../../assets/voice/count-42.mp3") as number,
  43: require("../../../assets/voice/count-43.mp3") as number,
  44: require("../../../assets/voice/count-44.mp3") as number,
  45: require("../../../assets/voice/count-45.mp3") as number,
  46: require("../../../assets/voice/count-46.mp3") as number,
  47: require("../../../assets/voice/count-47.mp3") as number,
  48: require("../../../assets/voice/count-48.mp3") as number,
  49: require("../../../assets/voice/count-49.mp3") as number,
  50: require("../../../assets/voice/count-50.mp3") as number,
};
const LINES = {
  go: require("../../../assets/voice/go.mp3") as number,
  done: require("../../../assets/voice/done.mp3") as number,
  freeze: require("../../../assets/voice/freeze.mp3") as number,
  halfRep: require("../../../assets/voice/half-rep.mp3") as number,
  lost: require("../../../assets/voice/lost.mp3") as number,
} as const;
export type KeeperLine = keyof typeof LINES;
const LINE_FILE: Record<KeeperLine, string> = { go: "go", done: "done", freeze: "freeze", halfRep: "half-rep", lost: "lost" };
/** Each bundled clip's length in ms (written by keeper_hype_voice.ts): "count-7", "go", "hype/start-clean-1". */
const MS = durations as Record<string, number>;

// When the clip the Keeper is saying now ends (Date.now() ms).
let busyUntil = 0;
let hypePlayer: AudioPlayer | null = null;
// Bumped by silenceHype(): a hype line scheduled before it never plays.
let hypeEpoch = 0;
// When the hype line playing now ends (busyUntil, unless a count or set line came after it).
let hypeUntil = -1;

/** Cuts off a hype line that is playing. */
export function stopHype(): void {
  try { hypePlayer?.pause(); } catch { /* nothing playing */ }
}

/**
 * Another Keeper line is starting (the spoken verdict, a transaction read aloud, an answer: voice.ts): the hype line
 * playing stops and the ones still waiting (the done line after the set) never play.
 */
export function silenceHype(): void {
  hypeEpoch++;
  stopHype();
  if (busyUntil === hypeUntil) busyUntil = 0; // the line stopped: the Keeper isn't saying it any more
}

// Three players in rotation: a new number replaces one still playing instead of queueing behind it.
const pool: AudioPlayer[] = [];
let next = 0;
function play(source: number, ms: number): void {
  if (!useSettings.getState().keeperVoice) return;
  stopHype(); // the count and the set lines always win over a hype line
  try {
    let p = pool[next];
    if (!p) { p = createAudioPlayer(source); pool[next] = p; } else p.replace(source);
    next = (next + 1) % 3;
    p.play();
    busyUntil = Date.now() + ms;
  } catch {
    // counting aloud is a bonus; the number is on screen
  }
}

/** The Keeper says the rep number (1–50; above 50 stays silent). */
export function sayCount(n: number): void {
  const src = COUNTS[n];
  if (src) play(src, MS[`count-${n}`] ?? 900);
}

export function sayLine(line: KeeperLine): void {
  play(LINES[line], MS[LINE_FILE[line]] ?? 2000);
}

/** ms until the clip the Keeper is saying now (count, line or hype) ends; 0 when he's quiet. */
export function keeperBusyMs(now: number = Date.now()): number {
  return Math.max(0, busyUntil - now);
}

/** A hype clip's length in ms. */
export const hypeMs = (id: string): number => MS[`hype/${id}`] ?? 2500;

/** Plays a hype line (Keeper voice setting on); its length in ms, or 0 when it didn't play. */
export function sayHype(id: string): number {
  const src = HYPE_SOURCES[id];
  if (!src || !useSettings.getState().keeperVoice) return 0;
  try {
    if (hypePlayer) hypePlayer.replace(src);
    else hypePlayer = createAudioPlayer(src);
    hypePlayer.play();
  } catch {
    return 0;
  }
  const ms = hypeMs(id);
  busyUntil = hypeUntil = Date.now() + ms;
  return ms;
}

/**
 * The hype coach for one rep set, on the bundled clips, in the language picked in Settings (clean unless "no filter").
 * `schedule` and `canSpeak` come from the set screen (its attempt-scoped timers, its phase); the rest can be overridden
 * (tests).
 */
export function repSetHype(target: number, set: Pick<HypeCoachDeps, "schedule" | "canSpeak"> & Partial<HypeCoachDeps>): HypeCoach {
  const { schedule, ...rest } = set;
  return new HypeCoach(target, {
    now: Date.now, busyMs: () => keeperBusyMs(), play: sayHype, clipMs: hypeMs,
    lang: () => useSettings.getState().hypeLanguage, ...rest,
    // A line waiting when another Keeper line starts (silenceHype) is dropped.
    schedule: (ms, fn, keep) => { const epoch = hypeEpoch; schedule(ms, () => { if (epoch === hypeEpoch) fn(); }, keep); },
  });
}
