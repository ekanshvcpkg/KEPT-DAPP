// Live Oath updates through Supabase Realtime Broadcast. When a member's proof lands or a day is recorded on chain, the
// server pings channel `oath:<address>`; every phone in that Oath refetches it (from the chain and this API), so HP bars
// and the members' days move without pulling to refresh. The channel is public, so the app treats a ping as a hint:
// it refetches (coalesced) and only names real members in its toast. Best effort, never awaited by the request.
import { config } from "../config.js";

export type OathChange = "proof" | "checkin";

export async function broadcastOathChanged(oath: string, reason: OathChange, wallet: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!config.supabaseUrl || !config.supabaseSecretKey) return false;
  const res = await fetchImpl(`${config.supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: config.supabaseSecretKey, authorization: `Bearer ${config.supabaseSecretKey}`, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ topic: `oath:${oath}`, event: "oath_changed", payload: { reason, wallet }, private: false }] }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  return !!res?.ok;
}
