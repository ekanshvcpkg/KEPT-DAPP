// Checking the Keeper: re-hash its public receipts and compare them with what record_checkin put on chain.
// Mirrors backend/src/v4/keeper.ts (canonicalJson, receiptHash) and backend/src/v4/habits.ts (combinedHabitsHash);
// test vectors in keeper.test.ts pin both sides to the same bytes.
import { BorshEventCoder } from "@anchor-lang/core";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { IDL } from "./idl";

/** JSON with object keys sorted at every level (undefined values dropped), so a receipt always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** SHA-256 (hex) of a receipt's canonical JSON: the hash the Keeper publishes. */
export const receiptHashOf = (receipt: unknown): string => bytesToHex(sha256(utf8ToBytes(canonicalJson(receipt))));

/** A kept day's on-chain proof_hash: SHA-256 of the habits' receipt hashes, concatenated in habit order. */
export function combinedHabitsHash(hashesInHabitOrder: readonly string[]): string {
  const bytes = hashesInHabitOrder.map((h) => hexToBytes(h));
  const all = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of bytes) { all.set(b, at); at += b.length; }
  return bytesToHex(sha256(all));
}

const eventCoder = new BorshEventCoder(IDL);

export type CheckinRecorded = { oath: string; member: string; dayIndex: number; proofHash: string };

/** The CheckinRecorded events in a transaction's log messages (Anchor's "Program data: <base64>" lines). */
export function checkinsFromLogs(logs: readonly string[]): CheckinRecorded[] {
  const out: CheckinRecorded[] = [];
  for (const line of logs) {
    if (!line.startsWith("Program data: ")) continue;
    let ev: ReturnType<typeof eventCoder.decode> = null;
    try { ev = eventCoder.decode(line.slice("Program data: ".length)); } catch { continue; }
    if (!ev || ev.name !== "CheckinRecorded") continue;
    const d = ev.data as { oath: { toBase58(): string }; member: { toBase58(): string }; day_index: number; proof_hash: number[] };
    out.push({ oath: d.oath.toBase58(), member: d.member.toBase58(), dayIndex: d.day_index, proofHash: bytesToHex(Uint8Array.from(d.proof_hash)) });
  }
  return out;
}
