// Public copies of the Keeper's receipts in Supabase Storage (bucket keeper-receipts, public read). Each file is the
// receipt's canonical JSON, byte for byte: its SHA-256 IS the hash on chain, so anyone can download it and check it
// against Solana without going through KEPT's server. Best effort: the receipt also lives in the backend's database.
import { config } from "../config.js";
import { canonicalJson, type Receipt } from "./keeper.js";

export const receiptPath = (hash: string) => `receipts/${hash}.json`;
export const publicReceiptUrl = (hash: string): string | null =>
  config.supabaseUrl ? `${config.supabaseUrl}/storage/v1/object/public/${config.receiptsBucket}/${receiptPath(hash)}` : null;

/** Uploads the receipt's canonical bytes; returns the public URL, or null when Supabase isn't configured or it fails. */
export async function publishReceipt(hash: string, receipt: Receipt, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!config.supabaseUrl || !config.supabaseSecretKey) return null;
  const res = await fetchImpl(`${config.supabaseUrl}/storage/v1/object/${config.receiptsBucket}/${receiptPath(hash)}`, {
    method: "POST",
    headers: { apikey: config.supabaseSecretKey, authorization: `Bearer ${config.supabaseSecretKey}`, "content-type": "application/json", "x-upsert": "true", "cache-control": "public, max-age=31536000, immutable" },
    body: canonicalJson(receipt),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return res?.ok ? publicReceiptUrl(hash) : null;
}

/**
 * A rep set's pose trace, kept privately (bucket rep-traces, not public) so the counter can be tuned on real sets: body
 * keypoints and timings only (no image, no wallet), named by the receipt hash so its verdict can be looked up. Best effort.
 */
export async function storeRepTrace(hash: string, data: { trace: unknown; exercise: string; target: number; repCount: number; phoneCount: number | null; pass: boolean; reason: string }, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!config.supabaseUrl || !config.supabaseSecretKey) return false;
  const res = await fetchImpl(`${config.supabaseUrl}/storage/v1/object/${config.repTracesBucket}/traces/${hash}.json`, {
    method: "POST",
    headers: { apikey: config.supabaseSecretKey, authorization: `Bearer ${config.supabaseSecretKey}`, "content-type": "application/json", "x-upsert": "true" },
    body: JSON.stringify({ ...data, storedAt: new Date().toISOString() }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return !!res?.ok;
}
