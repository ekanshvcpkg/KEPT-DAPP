// "Audit the Keeper": re-hash a kept day's public receipts and compare them with the proof_hash record_checkin put on
// Solana. Nothing here trusts the server's word: the receipts are hashed on the phone and the chain is read directly.
import { z } from "zod";
import { checkinsFromLogs, combinedHabitsHash, receiptHashOf } from "@kept/chain";
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
export async function auditDay(oath: string, dayIndex: number, wallet: string, http = createHttpClient(() => null)): Promise<KeeperAudit> {
  let day: z.output<typeof DayResponse>;
  try {
    day = await http.get(`/keeper/oaths/${oath}/days/${dayIndex}?wallet=${wallet}`, DayResponse);
  } catch {
    return { status: "unavailable" };
  }
  const receipts = await Promise.all(day.receiptHashes.map(async (hash, habit) => {
    const r = await http.get(`/keeper/receipts/${hash}`, ReceiptResponse);
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
