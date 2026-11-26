// KEPT's sound design, generated once with ElevenLabs Sound Effects (backend/scripts/keeper_sfx.ts) and bundled with the
// app, so it plays in Demo too and offline. Played from the FX moments (state/ui.ts) and a rejected photo.
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { useSettings } from "@/state/settings";

export type Sfx = "kept" | "rejected" | "payout" | "broken";
const SOURCES: Record<Sfx, number> = {
  kept: require("../../../assets/sfx/kept.mp3") as number,
  rejected: require("../../../assets/sfx/rejected.mp3") as number,
  payout: require("../../../assets/sfx/payout.mp3") as number,
  broken: require("../../../assets/sfx/broken.mp3") as number,
};
const players: Partial<Record<Sfx, AudioPlayer>> = {};

export function playSfx(name: Sfx): void {
  if (!useSettings.getState().keeperVoice) return;
  try {
    const p = (players[name] ??= createAudioPlayer(SOURCES[name]));
    void p.seekTo(0);
    p.play();
  } catch {
    // sound is decoration: never break a screen over it
  }
}
