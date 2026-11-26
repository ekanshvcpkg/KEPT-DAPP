// "Audit the Keeper": re-hash a kept day's public receipts and compare them with the proof_hash record_checkin put on
// Solana. Nothing here trusts the server's word: the receipts are hashed on the phone and the chain is read directly.
import { z } from "zod";
import { checkinsFromLogs, combinedHabitsHash, receiptHashOf, sha256HexOfText } from "@kept/chain";
import { createHttpClient } from "@/api/http/client";
import { connection } from "@/chain/connection";
import { env } from "@/config/env";

const Hex = z.string().regex(/^[a-f0-9]{64}$/);
const DayResponse = z.object({ receiptHashes: z.array(Hex).min(1), dayHash: Hex, signature: z.string().nullable() });
const ReceiptResponse = z.object({
  receipt: z.object({
    model: z.string(), pass: z.boolean(), wallet: z.string(), target: z.string().nullable(), dayIndex: z.number().nullable(), habit: z.number().nullable(),
    challenge: z.object({ slot: z.number().nullable() }).passthrough(),
  }).passthrough(),
  receiptHash: Hex,
});

export type KeeperAudit =
  | { status: "verified" | "mismatch" | "pending"; receipts: { hash: string; model: string; slot: number | null; matches: boolean }[]; signature: string | null }
  | { status: "unavailable" };

export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=${env.cluster}`;

/** Fetches the day's receipts (public, no sign-in), hashes each on the phone, and checks the combined hash against the chain. */
/** The receipt file from the public bucket, if its bytes hash to `hash` (else null, so the caller falls back). */
async function publicReceipt(hash: string): Promise<z.output<typeof ReceiptResponse> | null> {
  try {
    // React Native's fetch has no timeout of its own: a stalled Supabase must fall back to the backend, not hang the audit.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/public/keeper-receipts/receipts/${hash}.json`, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const text = await res.text();
    if (sha256HexOfText(text) !== hash) return null;
    const parsed = ReceiptResponse.safeParse({ receipt: JSON.parse(text), receiptHash: hash });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function auditDay(oath: string, dayIndex: number, wallet: string, http = createHttpClient(() => null)): Promise<KeeperAudit> {
  let day: z.output<typeof DayResponse>;
  try {
    day = await http.get(`/keeper/oaths/${oath}/days/${dayIndex}?wallet=${wallet}`, DayResponse);
  } catch {
    return { status: "unavailable" };
  }
  const receipts = await Promise.all(day.receiptHashes.map(async (hash, habit) => {
    // Prefer the public copy on Supabase Storage: its raw bytes must hash to the on-chain hash, with no KEPT server
    // involved. Fall back to the backend's copy (re-hashed as canonical JSON) if Supabase isn't set or unreachable.
    const fromSupabase = env.supabaseUrl ? await publicReceipt(hash) : null;
    const r = fromSupabase ?? await http.get(`/keeper/receipts/${hash}`, ReceiptResponse);
    // The receipt must hash to its published hash AND say what this day needs: a pass, for this wallet, Oath, day and habit.
    const says = r.receipt.pass && r.receipt.wallet === wallet && r.receipt.target === oath && r.receipt.dayIndex === dayIndex && r.receipt.habit === habit;
    return { hash, model: r.receipt.model, slot: r.receipt.challenge.slot, matches: receiptHashOf(r.receipt) === hash && says };
  }));
  const combined = combinedHabitsHash(day.receiptHashes);
  if (!day.signature) return { status: "pending", receipts, signature: null };
  const tx = await connection().getTransaction(day.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx?.meta) return { status: "pending", receipts, signature: day.signature }; // the RPC hasn't indexed it yet
  const onChain = checkinsFromLogs(tx?.meta?.logMessages ?? []).find((e) => e.oath === oath && e.member === wallet && e.dayIndex === dayIndex);
  const ok = receipts.every((r) => r.matches) && combined === day.dayHash && onChain?.proofHash === combined;
  return { status: ok ? "verified" : "mismatch", receipts, signature: day.signature };
}
