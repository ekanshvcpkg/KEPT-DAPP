// The Keeper speaks (ElevenLabs, via GET /api/keeper/say on the backend, which holds the key and caches every line).
// Live only: Demo has no network. Best effort: a voice that can't play never blocks or breaks a screen.
import { createAudioPlayer } from "expo-audio";
import type { AudioPlayer } from "expo-audio";
import { env } from "@/config/env";
import { useMode } from "@/state/mode";
import { useSession } from "@/state/session";
import { useSettings } from "@/state/settings";

const MAX_CHARS = 220;
let player: AudioPlayer | null = null;

export function keeperSay(text: string | undefined | null): void {
  const line = (text ?? "").trim().slice(0, MAX_CHARS);
  const token = useSession.getState().token;
  if (!line || !token || useMode.getState().mode !== "live" || !useSettings.getState().keeperVoice) {
    if (__DEV__) console.warn("[kept] keeperSay skipped", { line: !!line, token: !!token, mode: useMode.getState().mode });
    return;
  }
  if (__DEV__) console.warn("[kept] keeperSay", line);
  try {
    const source = { uri: `${env.apiUrl}/api/keeper/say?text=${encodeURIComponent(line)}`, headers: { authorization: `Bearer ${token}` } };
    if (player) player.replace(source);
    else player = createAudioPlayer(source);
    player.play();
  } catch (e) {
    // no audio: the screen already says it in text
    if (__DEV__) console.warn("[kept] keeperSay failed", e instanceof Error ? e.message : String(e));
  }
}
