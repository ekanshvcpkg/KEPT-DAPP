// The Keeper speaks (ElevenLabs, via GET /api/keeper/say on the backend, which holds the key and caches every line).
// Live only: Demo has no network. Best effort: a voice that can't play never blocks or breaks a screen.
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { env } from "@/config/env";
import { useMode } from "@/state/mode";
import { useSession } from "@/state/session";
import { useSettings } from "@/state/settings";
import { create } from "zustand";
import { silenceHype } from "./countVoice";

/** Whether the Keeper is speaking a line right now (a Stop pill shows while it is: KeeperStopHost). */
export const useKeeperSpeaking = create<{ speaking: boolean }>(() => ({ speaking: false }));
let endTimer: ReturnType<typeof setTimeout> | null = null;
const setSpeaking = (speaking: boolean, lineChars = 0) => {
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  // A fallback end in case the player never reports one (a failed load): about 75 ms a character plus the fetch.
  if (speaking) endTimer = setTimeout(() => useKeeperSpeaking.setState({ speaking: false }), 4000 + lineChars * 75);
  useKeeperSpeaking.setState({ speaking });
};

/** Stops the Keeper mid-line (the Stop pill), and any rep-set hype line with it. */
export function stopKeeper(): void {
  try { player?.pause(); } catch { /* nothing playing */ }
  silenceHype();
  setSpeaking(false);
}

/** Same as the backend (backend/src/v4/voice.ts › MAX_LINE_CHARS): longer lines would be cut and never cached. */
const MAX_CHARS = 320;
let player: AudioPlayer | null = null;

export function keeperSay(text: string | undefined | null): void {
  const line = (text ?? "").trim().slice(0, MAX_CHARS);
  const token = useSession.getState().token;
  if (!line || !token || useMode.getState().mode !== "live" || !useSettings.getState().keeperVoice) {
    if (__DEV__) console.warn("[kept] keeperSay skipped", { line: !!line, token: !!token, mode: useMode.getState().mode });
    return;
  }
  if (__DEV__) console.warn("[kept] keeperSay", line);
  silenceHype(); // one Keeper at a time: a rep set's hype line (the done line still playing) stops for this one
  try {
    const source = { uri: `${env.apiUrl}/api/keeper/say?text=${encodeURIComponent(line)}`, headers: { authorization: `Bearer ${token}` } };
    if (player) player.replace(source);
    else {
      player = createAudioPlayer(source);
      // When the line ends the Stop pill goes (a player without events falls back to setSpeaking's timer).
      player.addListener?.("playbackStatusUpdate", (s) => { if (s.didJustFinish) setSpeaking(false); });
    }
    player.play();
    setSpeaking(true, line.length);
  } catch (e) {
    // no audio: the screen already says it in text
    if (__DEV__) console.warn("[kept] keeperSay failed", e instanceof Error ? e.message : String(e));
  }
}
