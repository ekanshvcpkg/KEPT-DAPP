// Devnet integration run of the Keeper: the real backend (local Postgres, our program, the verifier key) judges proof
// photos, publishes receipts, records the receipt hash on chain, and publishes a failed verdict in an SPL Memo.
//
//   cd backend && npx tsx scripts/keeper_e2e_devnet.ts
//
// The vision model is replaced by a tiny local stand-in (a photo whose bytes contain "FAIL" is rejected), so the run
// needs no API key; set REAL_VISION=1 to use OPEN_API_KEY/VISION_MODEL from .env instead (then take real photos).
// Needs backend/.env (program, verifier, mint, treasury) and the Solana CLI keypair (funds two throwaway members).
import "dotenv/config";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { once } from "node:events";
import nacl from "tweetnacl";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAccount, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { checkinsFromLogs, combinedHabitsHash, configPda, createOathSolIx, decodeConfig, joinOathSolIx, receiptHashOf, startOathIx } from "../../packages/chain/src";
import { GESTURE_TEXT, type ChallengeGesture } from "../src/v4/rules";

const API_PORT = 3199, VISION_PORT = 3198;
const API = `http://127.0.0.1:${API_PORT}`;
const PROGRAM_ID = new PublicKey(process.env.KEEPER_PROGRAM_ID!);
const conn = new Connection(process.env.DEVNET_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const cliKey = readFileSync(`${homedir()}/.config/solana/cli/config.yml`, "utf8").match(/^keypair_path:\s*(.+)$/m)![1]!.trim().replace(/^~/, homedir());
const funder = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(cliKey, "utf8"))));
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (label: string, ok: boolean, detail = "") => { if (!ok) failures++; log(ok ? "PASS" : "FAIL", label, detail); };
/** A JPEG-looking photo; "FAIL" inside makes the stand-in model reject it. */
const photo = (tag: string) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`${tag}-${Date.now()}-${Math.random()}`), Buffer.alloc(4000, 9)]).toString("base64");

function standInVision() {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const url: string = JSON.parse(body).messages[0].content[1].image_url.url;
      const bytes = Buffer.from(url.slice(url.indexOf(",") + 1), "base64").toString("latin1");
      const pass = !bytes.includes("FAIL");
      const verdict = pass
        ? { objectPresent: true, objectConfidence: 0.93, gestureSeen: "as asked", gestureMatches: true, looksLikeScreenOrPrintout: false, reason: "Object and gesture are clearly visible." }
        : { objectPresent: false, objectConfidence: 0.05, gestureSeen: "none", gestureMatches: false, looksLikeScreenOrPrintout: true, reason: "This is a photo of a screen." };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ model: "stand-in-vision", choices: [{ message: { content: JSON.stringify(verdict) } }] }));
    });
  }).listen(VISION_PORT, "127.0.0.1");
}

async function api(path: string, body?: unknown, token?: string) {
  const r = await fetch(API + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
}
async function signIn(k: Keypair) {
  const wallet = k.publicKey.toBase58();
  const { body: { message } } = await api("/api/auth/nonce", { wallet });
  const signature = Buffer.from(nacl.sign.detached(Buffer.from(message, "utf8"), k.secretKey)).toString("base64");
  const r = await api("/api/auth/verify", { wallet, message, signature });
  if (!r.body?.token) throw new Error(`sign-in failed: ${JSON.stringify(r.body)}`);
  return r.body.token as string;
}

async function main() {
  const members = [Keypair.generate(), Keypair.generate()];
  const vision = process.env.REAL_VISION ? null : standInVision();
  const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env, PORT: String(API_PORT), SGT_MOCK: "true", SGT_MOCK_ALLOWLIST: members.map((m) => m.publicKey.toBase58()).join(","),
      ...(vision ? { VISION_API_URL: `http://127.0.0.1:${VISION_PORT}/v1/chat/completions`, OPEN_API_KEY: "stand-in", VISION_MODEL: "stand-in-vision" } : {}),
    },
  });
  try {
    await once(server.stdout!, "data");
    log("backend up on", API, "| program", PROGRAM_ID.toBase58(), vision ? "| stand-in vision model" : "| REAL vision model");

    // ---- an Oath on chain: two members, 2-minute days ----
    const cfg = decodeConfig((await conn.getAccountInfo(configPda(PROGRAM_ID)))!.data);
    const treasury = new PublicKey(cfg.treasury);
    const env = { programId: PROGRAM_ID, stakeMint: new PublicKey(cfg.stakeMint), treasury, treasuryAuthority: (await getAccount(conn, treasury, "confirmed", TOKEN_2022_PROGRAM_ID)).owner, tokenProgram: TOKEN_2022_PROGRAM_ID };
    const fund = new Transaction();
    for (const m of members) fund.add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: m.publicKey, lamports: 15_000_000 }));
    await sendAndConfirmTransaction(conn, fund, [funder]);
    const { ix, oath } = createOathSolIx(env, { creator: members[0]!.publicKey, oathId: BigInt(Date.now()), goalText: "keeper e2e", objectId: 1, numDays: 3, daySeconds: 120, tzOffsetMinutes: 0, stake: 5_000_000n, isSolo: false });
    await sendAndConfirmTransaction(conn, new Transaction().add(ix), [members[0]!]);
    await sendAndConfirmTransaction(conn, new Transaction().add(joinOathSolIx(env, { oath, member: members[1]!.publicKey })), [members[1]!]);
    await sendAndConfirmTransaction(conn, new Transaction().add(startOathIx(env, { oath, creator: members[0]!.publicKey })), [members[0]!]);
    log("Oath started", `https://explorer.solana.com/address/${oath.toBase58()}?cluster=devnet`);
    await sleep(3000); // let the RPC catch up before the backend reads the Oath

    const [tokenA, tokenB] = [await signIn(members[0]!), await signIn(members[1]!)];
    const o = oath.toBase58();

    // ---- the audit's forgery: a made-up verdict with no photo ----
    const forged = await api("/proof/verify", { proofHash: "a".repeat(64), objectPresent: true, objectConfidence: 1, gestureSeen: "x", gestureMatches: true, looksLikeScreenOrPrintout: false, reason: "trust me", expectedObject: "book", expectedGesture: "thumbs up", oath: o, dayIndex: 0, habit: 0 }, tokenA);
    check("forged verdict without a photo is refused", forged.status === 400 && !forged.body.verificationId, `HTTP ${forged.status}`);

    // ---- member A proves day 1 with a photo the Keeper accepts ----
    const ch = await api("/api/proof/challenge", { oath: o, dayIndex: 0, habit: 0 }, tokenA);
    check("challenge issued from a Solana slot", ch.status === 200 && typeof ch.body.slot === "number", `slot ${ch.body.slot}, gesture ${ch.body.gesture}, object ${ch.body.object}`);
    const expectedGesture = GESTURE_TEXT[ch.body.gesture as ChallengeGesture];
    const ok = await api("/proof/verify", { photo: photo("ok"), expectedObject: ch.body.object, expectedGesture, oath: o, dayIndex: 0, habit: 0 }, tokenA);
    check("the Keeper passes the photo and returns a receipt", ok.status === 200 && ok.body.pass === true && /^[a-f0-9]{64}$/.test(ok.body.receiptHash), `receipt ${ok.body.receiptHash}`);
    const recorded = await api("/api/proof/habit", { oath: o, dayIndex: 0, habit: 0, verificationId: ok.body.verificationId }, tokenA);
    check("the day is recorded on chain by the verifier", recorded.status === 201 && recorded.body.dayKept === true, `https://explorer.solana.com/tx/${recorded.body.signature}?cluster=devnet`);

    // ---- audit: re-hash the public receipt and compare with the chain ----
    const day = await api(`/keeper/oaths/${o}/days/0?wallet=${members[0]!.publicKey.toBase58()}`);
    const rec = await api(`/keeper/receipts/${day.body.receiptHashes[0]}`);
    check("the public receipt re-hashes to its published hash", receiptHashOf(rec.body.receipt) === day.body.receiptHashes[0]);
    let onChain: string | undefined;
    for (let i = 0; i < 20 && !onChain; i++) {
      const tx = await conn.getTransaction(recorded.body.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
      onChain = checkinsFromLogs(tx?.meta?.logMessages ?? []).find((e) => e.member === members[0]!.publicKey.toBase58() && e.dayIndex === 0)?.proofHash;
      if (!onChain) await sleep(1000);
    }
    check("the on-chain proof_hash equals the combined receipt hashes", onChain === combinedHabitsHash(day.body.receiptHashes), `chain ${onChain}`);
    check("the receipt names the photo hash, the slot challenge and the model", rec.body.receipt.challenge.slot === ch.body.slot && rec.body.receipt.model === (vision ? "stand-in-vision" : rec.body.receipt.model) && rec.body.receipt.pass === true);

    // ---- member B sends a photo of a screen: rejected, and the rejection is published in a Memo ----
    const chB = await api("/api/proof/challenge", { oath: o, dayIndex: 0, habit: 0 }, tokenB);
    const bad = await api("/proof/verify", { photo: photo("FAIL"), expectedObject: chB.body.object, expectedGesture: GESTURE_TEXT[chB.body.gesture as ChallengeGesture], oath: o, dayIndex: 0, habit: 0, objectPresent: true, gestureMatches: true }, tokenB);
    check("a rejected photo stays rejected whatever the app claims", bad.status === 200 && bad.body.pass === false && bad.body.verificationId === null, bad.body.reason);
    let memo: string | null = null;
    for (let i = 0; i < 30 && !memo; i++) { memo = (await api(`/keeper/receipts/${bad.body.receiptHash}`)).body?.memoSignature ?? null; if (!memo) await sleep(1000); }
    const memoTx = memo ? await conn.getTransaction(memo, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }) : null;
    check("the failed verdict's receipt hash is published in an SPL Memo", !!memoTx?.meta?.logMessages?.some((l) => l.includes(`kept:fail:${bad.body.receiptHash}`)), memo ? `https://explorer.solana.com/tx/${memo}?cluster=devnet` : "no memo");

    log(failures ? `${failures} check(s) FAILED` : "ALL KEEPER CHECKS PASSED");
  } finally {
    server.kill();
    vision?.close();
  }
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
