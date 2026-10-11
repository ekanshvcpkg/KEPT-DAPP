// Devnet end-to-end settlement of the rules v3 money model (DECISIONS D-93), verified from chain data.
//
//   cd onchain && npx tsx scripts/e2e_devnet_v3.ts [--keys <file>]
//
// Needs: the upgraded program on Devnet, and the program's upgrade authority wallet (the Solana CLI keypair, which is
// also the verifier and the SKR test mint's authority) with a little SOL. Members are throwaway keypairs (saved to --keys
// so a stopped run can be resumed); they are funded with SOL and test SKR from the authority.
//
// Two Oaths run in parallel with 2-minute days (the program's debug-tools build accepts day_seconds = 120):
//   A. 4 x 100 SKR, 3 days: one miss, then two misses, then everyone keeps  -> settles after day 3.
//   B. 4 x 100 SKR, 7 days: three members miss days 1 and 2 -> HP 0 -> settles as soon as day 2 closes; the held half is
//      swept to the treasury 7 Oath days (14 minutes) later.
// Every figure is read back from the Oath, vault and treasury accounts and compared with the payouts the rules give.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync, getAccount,
} from "@solana/spl-token";
import { claimIx, configPda, createOathIx, decodeOath, decodeOathTerms, joinOathIx, oathPda, settleOathIx, startOathIx, sweepHeldIx, vaultPda } from "../../packages/chain/src";
import type { ProgramEnv } from "../../packages/chain/src";
import { replayV3 } from "../../backend/src/shared/payout";

const PROGRAM_ID = new PublicKey("6iXXBqsdiCnUTSVf8CW3Uuw8c7iYvZSj5haz64QMuMUh");
const TREASURY_OWNER = new PublicKey("52eWttmzYBJn4awLjEMB42bw5oTFvL4XC1gDqFAQgPxJ");
const DAY_SECONDS = 120;
const SKR = 1_000_000n;
const STAKE = 100n * SKR;

const solanaConfig = (key: string) => {
  const f = readFileSync(`${homedir()}/.config/solana/cli/config.yml`, "utf8");
  const m = f.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!m?.[1]) throw new Error(`${key} missing from the Solana CLI config`);
  return m[1].trim().replace(/^['"]|['"]$/g, "");
};
const loadKeypair = (path: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const skr = (n: bigint) => `${n / SKR}.${(n % SKR).toString().padStart(6, "0")}`;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

const connection = new Connection(process.env.RPC_URL ?? solanaConfig("json_rpc_url"), "confirmed");
const admin = loadKeypair(solanaConfig("keypair_path").replace(/^~/, homedir()));
const keysFile = process.argv.includes("--keys") ? process.argv[process.argv.indexOf("--keys") + 1]! : "";

/** Chain time (what the program's Clock says), not the local clock. */
async function chainNow(): Promise<number> {
  const slot = await connection.getSlot("confirmed");
  return (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
}
async function waitUntilChain(ts: number, label: string) {
  for (;;) {
    const now = await chainNow();
    if (now >= ts) return;
    log(`waiting ${ts - now}s for ${label}`);
    await sleep(Math.min(10_000, Math.max(1_000, (ts - now) * 1000)));
  }
}
const send = (tx: Transaction, signers: Keypair[]) => sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" });

async function main() {
  const members: Keypair[] = (() => {
    if (keysFile && existsSync(keysFile)) return (JSON.parse(readFileSync(keysFile, "utf8")) as number[][]).map((k) => Keypair.fromSecretKey(Uint8Array.from(k)));
    const fresh = Array.from({ length: 4 }, () => Keypair.generate());
    if (keysFile) writeFileSync(keysFile, JSON.stringify(fresh.map((k) => Array.from(k.secretKey))), { mode: 0o600 });
    return fresh;
  })();

  // ---- the program, its config and the treasury, as the chain has them ----
  const programInfo = await connection.getAccountInfo(PROGRAM_ID);
  if (!programInfo?.executable) throw new Error("program is not deployed on this cluster");
  const configInfo = await connection.getAccountInfo(configPda(PROGRAM_ID));
  if (!configInfo) throw new Error("Config is not initialized");
  const cfg = { admin: new PublicKey(configInfo.data.subarray(8, 40)), verifier: new PublicKey(configInfo.data.subarray(40, 72)), treasury: new PublicKey(configInfo.data.subarray(72, 104)), mint: new PublicKey(configInfo.data.subarray(106, 138)) };
  if (!cfg.verifier.equals(admin.publicKey)) throw new Error(`the verifier is ${cfg.verifier.toBase58()}, not this wallet`);
  const treasuryAccount = await getAccount(connection, cfg.treasury, "confirmed", TOKEN_2022_PROGRAM_ID);
  if (!treasuryAccount.owner.equals(TREASURY_OWNER)) throw new Error(`the configured treasury token account is owned by ${treasuryAccount.owner.toBase58()}, not ${TREASURY_OWNER.toBase58()}`);
  log("program", PROGRAM_ID.toBase58(), "| treasury token account", cfg.treasury.toBase58(), "(owner", treasuryAccount.owner.toBase58() + ")");
  const env: ProgramEnv = { programId: PROGRAM_ID, stakeMint: cfg.mint, treasury: cfg.treasury, tokenProgram: TOKEN_2022_PROGRAM_ID };
  const treasuryBalance = async () => (await getAccount(connection, cfg.treasury, "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
  const treasury0 = await treasuryBalance();

  // ---- fund the members: SOL for rent and fees, and test SKR for two Oaths ----
  const atas = members.map((m) => getAssociatedTokenAddressSync(cfg.mint, m.publicKey, false, TOKEN_2022_PROGRAM_ID));
  const fund = new Transaction();
  members.forEach((m, i) => {
    fund.add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: m.publicKey, lamports: 30_000_000 }));
    fund.add(createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, atas[i]!, m.publicKey, cfg.mint, TOKEN_2022_PROGRAM_ID));
  });
  await send(fund, [admin]);
  const mintTx = new Transaction();
  members.forEach((_, i) => mintTx.add(createMintToInstruction(cfg.mint, atas[i]!, admin.publicKey, 2n * STAKE, [], TOKEN_2022_PROGRAM_ID)));
  await send(mintTx, [admin]);
  const before = await Promise.all(atas.map(async (a) => (await getAccount(connection, a, "confirmed", TOKEN_2022_PROGRAM_ID)).amount));
  log("members funded; SKR each:", before.map(skr).join(", "));

  // ---- create, fill and start the two Oaths ----
  const base = BigInt(Date.now());
  const setups = [
    { name: "A (settles after day 3)", id: base, days: 3, marks: ["kkkm", "kkmm", "kkkk"] },
    { name: "B (breaks on day 2)", id: base + 1n, days: 7, marks: ["kmmm", "kmmm"] },
  ];
  const oaths: { name: string; oath: PublicKey; startTs: number; marks: string[]; days: number }[] = [];
  for (const s of setups) {
    const { ix, oath } = createOathIx(env, { creator: members[0]!.publicKey, creatorToken: atas[0]!, oathId: s.id, goalText: `e2e ${s.name}`, objectId: 1, numDays: s.days, daySeconds: DAY_SECONDS, tzOffsetMinutes: 0, stake: STAKE, isSolo: false });
    const sig = await send(new Transaction().add(ix), [members[0]!]);
    log(s.name, "created", oath.toBase58(), sig);
    for (let i = 1; i < 4; i++) await send(new Transaction().add(joinOathIx(env, { oath, member: members[i]!.publicKey, memberToken: atas[i]! })), [members[i]!]);
    await send(new Transaction().add(startOathIx(env, { oath, creator: members[0]!.publicKey })), [members[0]!]);
    const o = decodeOath((await connection.getAccountInfo(oath, "confirmed"))!.data);
    const terms = decodeOathTerms((await connection.getAccountInfo(oath, "confirmed"))!.data)!;
    if (terms.rulesVersion !== 3) throw new Error(`new Oath recorded rules v${terms.rulesVersion}, expected 3`);
    log(s.name, `started at ${o.startTs}; rules v${terms.rulesVersion}, miss ${terms.missBps} bps; vault holds`, skr((await getAccount(connection, vaultPda(PROGRAM_ID, oath), "confirmed", TOKEN_2022_PROGRAM_ID)).amount), "SKR (stakes only, no entry fee)");
    oaths.push({ name: s.name, oath, startTs: o.startTs, marks: s.marks, days: s.days });
  }

  // ---- the verifier records each day's check-ins inside that day's window ----
  const checkin = (oath: PublicKey, member: PublicKey, day: number) => new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [{ pubkey: configPda(PROGRAM_ID), isSigner: false, isWritable: false }, { pubkey: oath, isSigner: false, isWritable: true }, { pubkey: admin.publicKey, isSigner: true, isWritable: false }, { pubkey: member, isSigner: false, isWritable: false }],
    data: Buffer.concat([createHash("sha256").update("global:record_checkin").digest().subarray(0, 8), Buffer.from([day]), createHash("sha256").update(`e2e-${oath.toBase58()}-${member.toBase58()}-${day}`).digest()]),
  });
  const maxDay = Math.max(...oaths.map((o) => o.marks.length));
  for (let d = 0; d < maxDay; d++) {
    for (const o of oaths) {
      if (d >= o.marks.length) continue;
      await waitUntilChain(o.startTs + d * DAY_SECONDS + 1, `${o.name} day ${d + 1} to open`);
      const tx = new Transaction();
      [...o.marks[d]!].forEach((c, i) => { if (c === "k") tx.add(checkin(o.oath, members[i]!.publicKey, d)); });
      if (tx.instructions.length) await send(tx, [admin]);
      log(o.name, `day ${d + 1} recorded: ${o.marks[d]}`);
    }
  }

  // ---- expected results from the rules (backend/src/shared/payout.ts, which the program, engine and vectors all match) ----
  const masks = (marks: string[]) => [0, 1, 2, 3].map((i) => marks.reduce((m, day, d) => (day[i] === "k" ? m | (1 << d) : m), 0));
  let failures = 0;
  const check = (label: string, actual: unknown, expected: unknown) => {
    const ok = JSON.stringify(actual, (_, v) => (typeof v === "bigint" ? v.toString() : v)) === JSON.stringify(expected, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    log(ok ? "PASS" : "FAIL", label, ok ? "" : `chain=${JSON.stringify(actual, (_, v) => (typeof v === "bigint" ? v.toString() : v))} expected=${JSON.stringify(expected, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    if (!ok) failures++;
  };

  // ---- settle ----
  const report: Record<string, unknown> = {};
  for (const o of oaths) {
    const broke = o.name.startsWith("B");
    // A breaks early: settle as soon as the breaking day (day 2) has closed. A settles once all 3 days have closed.
    const closeAt = broke ? o.startTs + 2 * DAY_SECONDS : o.startTs + o.days * DAY_SECONDS;
    await waitUntilChain(closeAt + 1, `${o.name} to be settleable`);
    const t0 = await treasuryBalance();
    const expected = replayV3(STAKE, 1_000, false, masks(o.marks), o.days)!;
    const settleSig = await send(new Transaction().add(settleOathIx(env, { oath: o.oath, members: members.map((m) => m.publicKey) })), [admin]);
    log(o.name, "settled", settleSig);
    const data = (await connection.getAccountInfo(o.oath, "confirmed"))!.data;
    const chain = decodeOath(data), terms = decodeOathTerms(data)!;
    const vault = (await getAccount(connection, vaultPda(PROGRAM_ID, o.oath), "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
    const t1 = await treasuryBalance();
    check(`${o.name}: status`, chain.status, "settled");
    check(`${o.name}: member payouts (SKR base units)`, chain.members.map((m) => m.payout), expected.payouts);
    check(`${o.name}: treasury transfer at settlement`, t1 - t0, expected.toTreasury);
    check(`${o.name}: held in the vault`, terms.heldTotal, expected.held);
    check(`${o.name}: vault after settlement = payouts + held`, vault, expected.payouts.reduce((a, b) => a + b, 0n) + expected.held);
    check(`${o.name}: break day`, terms.brokeDay, expected.brokeDay);
    report[o.name] = { settleSig, payouts: chain.members.map((m) => skr(m.payout)), toTreasury: skr(t1 - t0), held: skr(terms.heldTotal), brokeDay: terms.brokeDay, heldReleaseTs: terms.heldReleaseTs };
    // Members claim; every payout leaves the vault.
    for (let i = 0; i < 4; i++) await send(new Transaction().add(claimIx(env, { oath: o.oath, member: members[i]!.publicKey, destination: atas[i]! })), [members[i]!]);
    const vaultAfter = (await getAccount(connection, vaultPath(o.oath), "confirmed", TOKEN_2022_PROGRAM_ID)).amount;
    check(`${o.name}: vault after claims = held only`, vaultAfter, expected.held);
    if (broke) {
      // The held half stays until the Rematch window (7 Oath days) has passed, then anyone may sweep it to the treasury.
      let tooEarly = false;
      try { await send(new Transaction().add(sweepHeldIx(env, { oath: o.oath })), [admin]); } catch { tooEarly = true; }
      check(`${o.name}: sweep_held before the window is rejected`, tooEarly, true);
      await waitUntilChain(terms.heldReleaseTs + 1, `${o.name} held window`);
      const t2 = await treasuryBalance();
      const sweepSig = await send(new Transaction().add(sweepHeldIx(env, { oath: o.oath })), [admin]);
      const t3 = await treasuryBalance();
      check(`${o.name}: swept amount reaches the treasury`, t3 - t2, expected.held);
      check(`${o.name}: vault is empty after the sweep`, (await getAccount(connection, vaultPath(o.oath), "confirmed", TOKEN_2022_PROGRAM_ID)).amount, 0n);
      (report[o.name] as Record<string, unknown>).sweepSig = sweepSig;
    } else {
      check(`${o.name}: vault is empty after claims`, vaultAfter, 0n);
    }
  }
  function vaultPath(oath: PublicKey) { return vaultPda(PROGRAM_ID, oath); }

  const after = await Promise.all(atas.map(async (a) => (await getAccount(connection, a, "confirmed", TOKEN_2022_PROGRAM_ID)).amount));
  const treasuryEnd = await treasuryBalance();
  const net = after.map((a, i) => a - before[i]!);
  log("members' net SKR over both Oaths:", net.map((n) => (n < 0n ? "-" : "") + skr(n < 0n ? -n : n)).join(", "));
  log("treasury net SKR:", skr(treasuryEnd - treasury0));
  check("conservation: members' net + treasury's = 0", net.reduce((a, b) => a + b, 0n) + (treasuryEnd - treasury0), 0n);
  console.log(JSON.stringify({ program: PROGRAM_ID.toBase58(), treasury: cfg.treasury.toBase58(), treasuryOwner: TREASURY_OWNER.toBase58(), oaths: oaths.map((o) => ({ name: o.name, oath: o.oath.toBase58() })), report, failures }, null, 2));
  if (failures) process.exit(1);
  void oathPda;
}

main().catch((e) => { console.error(e); process.exit(1); });
