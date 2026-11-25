// "Audit the Keeper": receipts are hashed on the phone and compared with the CheckinRecorded proof_hash read from chain.
import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { combinedHabitsHash, receiptHashOf } from "@kept/chain";
import { auditDay } from "@/features/keeper/audit";
import { createHttpClient } from "@/api/http/client";
import { connection } from "@/chain/connection";

jest.mock("@/chain/connection", () => ({ connection: jest.fn() }));

const OATH = "2CN2S6K8CU97M3SkShsETNFm6GZWvyYsxiF6HSonxcpJ";
const WALLET = "1TJw11wfUfYFm7R3kcKwQwkMagTvvZJ6tZNieY7yqPo";
const receipt = (habit: number) => ({ v: 1, kind: "oath", wallet: WALLET, target: OATH, dayIndex: 1, habit, photoSha256: String(habit).repeat(64), expected: { object: "book", gesture: "thumbs up" }, challenge: { gesture: "Thumb_Up", slot: 500 + habit, blockhash: "bh", issuedAt: "2026-11-26T00:00:00.000Z" }, model: "vision-1", verdict: { objectPresent: true, objectConfidence: 0.9, gestureSeen: "thumbs up", gestureMatches: true, looksLikeScreenOrPrintout: false, reason: "ok" }, pass: true, checkedAt: "2026-11-26T00:00:01.000Z" });

/** Anchor's event encoding: sha256("event:CheckinRecorded")[0..8] + oath + member + day + proof_hash, base64. */
const eventLog = (proofHash: string, day = 1) => "Program data: " + Buffer.concat([
  createHash("sha256").update("event:CheckinRecorded").digest().subarray(0, 8),
  new PublicKey(OATH).toBuffer(), new PublicKey(WALLET).toBuffer(), Buffer.from([day]), Buffer.from(proofHash, "hex"),
]).toString("base64");

function setup(opts: { tamper?: boolean; chainHash?: string; signature?: string | null; missing?: boolean } = {}) {
  const receipts = [receipt(0), receipt(1)];
  const hashes = receipts.map(receiptHashOf);
  const served = opts.tamper ? [{ ...receipts[0], pass: false }, receipts[1]] : receipts;
  const f = (async (url: string) => {
    const path = new URL(url).pathname;
    if (path.startsWith("/keeper/oaths/")) {
      if (opts.missing) return new Response(JSON.stringify({ error: "No Keeper receipts for that day" }), { status: 404 });
      return new Response(JSON.stringify({ receiptHashes: hashes, dayHash: combinedHabitsHash(hashes), signature: opts.signature === undefined ? "sig1" : opts.signature }), { status: 200 });
    }
    const i = hashes.indexOf(path.split("/").pop()!);
    return new Response(JSON.stringify({ receipt: served[i], receiptHash: hashes[i] }), { status: 200 });
  }) as unknown as typeof fetch;
  const getTransaction = jest.fn(async () => ({ meta: { logMessages: ["Program log: Instruction: RecordCheckin", eventLog(opts.chainHash ?? combinedHabitsHash(hashes))] } }));
  (connection as jest.Mock).mockReturnValue({ getTransaction });
  return { http: createHttpClient(() => null, "http://api", f), getTransaction, hashes };
}

it("verified: every receipt re-hashes to its published hash and their combination is the on-chain proof_hash", async () => {
  const { http, getTransaction, hashes } = setup();
  const r = await auditDay(OATH, 1, WALLET, http);
  expect(r).toEqual({ status: "verified", signature: "sig1", receipts: hashes.map((hash, i) => ({ hash, model: "vision-1", slot: 500 + i, matches: true })) });
  expect(getTransaction).toHaveBeenCalledWith("sig1", expect.anything());
});

it("a receipt edited after the fact no longer matches its hash", async () => {
  const { http } = setup({ tamper: true });
  const r = await auditDay(OATH, 1, WALLET, http);
  expect(r.status).toBe("mismatch");
  expect(r.status !== "unavailable" && r.receipts.map((x) => x.matches)).toEqual([false, true]);
});

it("receipts that don't combine to what the chain recorded are a mismatch", async () => {
  const { http } = setup({ chainHash: "f".repeat(64) });
  expect((await auditDay(OATH, 1, WALLET, http)).status).toBe("mismatch");
});

it("no check-in transaction yet is pending; no receipts at all is unavailable", async () => {
  expect((await auditDay(OATH, 1, WALLET, setup({ signature: null }).http)).status).toBe("pending");
  expect(await auditDay(OATH, 1, WALLET, setup({ missing: true }).http)).toEqual({ status: "unavailable" });
});
