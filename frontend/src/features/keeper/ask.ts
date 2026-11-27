// "Ask the Keeper": the recorded question goes to POST /api/keeper/ask (ElevenLabs Speech to Text → an answer from the
// asker's own Oaths and receipts → the Keeper's voice). The app then plays the answer via /api/keeper/say (cached).
import { z } from "zod";
import { createHttpClient } from "@/api/http/client";
import { useSession } from "@/state/session";
import { useDeviceOaths } from "@/features/oaths/device";
import { queryClient } from "@/api/queries";

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
 * the name the user sees. The agent may look several things up: the app waits longer than the server's whole answer
 * (transcription + a 28 s agent deadline including its fallback + speech).
 */
export function askKeeper(audio: string, mime = "audio/mp4", http = createHttpClient(() => useSession.getState().token, undefined, undefined, 60_000)): Promise<KeeperAnswer> {
  const names = Object.fromEntries(Object.entries(useDeviceOaths.getState().names).slice(0, 20));
  // The Oaths this phone is showing (its own chain reads): the server reads them directly, so the Keeper still knows
  // them when the RPC throttles its own search for the wallet's Oaths. The server checks membership itself.
  const shown = queryClient.getQueriesData<{ id: string; source?: string }[]>({ queryKey: ["oaths", "list"] })
    .flatMap(([, data]) => data ?? []).filter((o) => o.source === "chain").map((o) => o.id);
  const oaths = [...new Set(shown)].slice(0, 12);
  return http.post("/api/keeper/ask", { audio, mime, names, oaths }, AskResponse);
}
