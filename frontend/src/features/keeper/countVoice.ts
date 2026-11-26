// The Keeper counting reps out loud: clips pre-generated in the custom KEPT Keeper voice (ElevenLabs,
// backend/scripts/keeper_count_voice.ts) and bundled, so counting is instant and offline. Metro needs static requires.
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { useSettings } from "@/state/settings";

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

// Three players in rotation: a new number replaces one still playing instead of queueing behind it.
const pool: AudioPlayer[] = [];
let next = 0;
function play(source: number): void {
  if (!useSettings.getState().keeperVoice) return;
  try {
    let p = pool[next];
    if (!p) { p = createAudioPlayer(source); pool[next] = p; } else p.replace(source);
    next = (next + 1) % 3;
    p.play();
  } catch {
    // counting aloud is a bonus; the number is on screen
  }
}

/** The Keeper says the rep number (1–50; above 50 stays silent). */
export function sayCount(n: number): void {
  const src = COUNTS[n];
  if (src) play(src);
}

export function sayLine(line: KeeperLine): void {
  play(LINES[line]);
}
