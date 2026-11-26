// "Ask the Keeper": the recorded question goes to POST /api/keeper/ask (ElevenLabs Speech to Text → an answer from the
// asker's own Oaths and receipts → the Keeper's voice). The app then plays the answer via /api/keeper/say (cached).
import { z } from "zod";
import { createHttpClient } from "@/api/http/client";
import { useSession } from "@/state/session";
import { useDeviceOaths } from "@/features/oaths/device";

const AskResponse = z.object({ question: z.string(), answer: z.string() });
export type KeeperAnswer = z.output<typeof AskResponse>;

/** Reads a local recording (file:// URI) as base64; React Native's fetch + FileReader need no extra native module. */
export async function fileToBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the recording"));
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/**
 * Asks the Keeper. The Oath names this device gave (they live on the phone) go along, so the Keeper calls each Oath by
 * the name the user sees. The agent may look several things up, so it gets longer than other requests.
 */
export function askKeeper(audio: string, mime = "audio/mp4", http = createHttpClient(() => useSession.getState().token, undefined, undefined, 40_000)): Promise<KeeperAnswer> {
  const names = Object.fromEntries(Object.entries(useDeviceOaths.getState().names).slice(0, 20));
  return http.post("/api/keeper/ask", { audio, mime, names }, AskResponse);
}
