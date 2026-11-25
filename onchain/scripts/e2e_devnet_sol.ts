// Devnet end-to-end run of a native-SOL Oath (the path the app uses), checked against the rules v3 payout replay.
//
//   cd onchain && npx tsx scripts/e2e_devnet_sol.ts            (a new run)
//   cd onchain && npx tsx scripts/e2e_devnet_sol.ts --resume   (settle and claim the last run's Oath, e.g. after a crash)
//
// Needs the program deployed and configured (backend/scripts/v4-setup.ts), the Solana CLI keypair as the funder, and the
// verifier keypair (VERIFIER_KEYPAIR, default ~/.config/solana/kept-verifier.json). Three throwaway members stake 0.01 SOL
// each in a group Oath with 2-minute days (the debug-tools build accepts day_seconds = 120):
//   day 1: everyone keeps; day 2: member C misses; day 3: everyone keeps.
// The script then settles (permissionless), every member claims, and each figure is compared with replayV3.
// It prints Explorer links for each step, which serve as on-chain evidence.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { claimSolIx, configPda, createOathSolIx, decodeConfig, decodeOath, decodeOathTerms, joinOathSolIx, settleOathSolIx, startOathIx } from "../../packages/chain/src";
import type { ProgramEnv } from "../../packages/chain/src";
import { replayV3 } from "../../backend/src/shared/payout";
import { TOKEN_2022_PROGRAM_ID, unpackAccount } from "@solana/spl-token";

const PROGRAM_ID = new PublicKey(process.env.KEEPER_PROGRAM_ID ?? "7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj");
const DAY_SECONDS = 120;
const STAKE = 10_000_000n; // 0.01 SOL
const MARKS = ["kkk", "kkm", "kkk"]; // per day, one char per member: k = kept, m = missed

const cli = (key: string) => {
  const m = readFileSync(`${homedir()}/.config/solana/cli/config.yml`, "utf8").match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!m?.[1]) throw new Error(`${key} missing from the Solana CLI config`);
  return m[1].trim().replace(/^['"]|['"]$/g, "").replace(/^~/, homedir());
};
const load = (p: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sol = (n: bigint) => `${Number(n) / LAMPORTS_PER_SOL} SOL`;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const tx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

const connection = new Connection(process.env.RPC_URL ?? cli("json_rpc_url"), "confirmed");
const funder = load(cli("keypair_path"));
const verifier = load(process.env.VERIFIER_KEYPAIR ?? `${homedir()}/.config/solana/kept-verifier.json`);
// Member keys and the Oath are saved here so a stopped run can still settle and claim (members must sign their claims).
const STATE = `${homedir()}/.config/solana/kept-e2e-last.json`;
const resume = process.argv.includes("--resume");

async function chainNow() {
  const slot = await connection.getSlot("confirmed");
  return (await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000);
}
async function waitUntil(ts: number, label: string) {
  for (;;) {
    const now = await chainNow();
    if (now >= ts) return;
    log(`waiting ${ts - now}s for ${label}`);
    await sleep(Math.min(10_000, Math.max(1_000, (ts - now) * 1000)));
  }
}
let minSlot = 0;
async function send(t: Transaction, signers: Keypair[]) {
  const sig = await sendAndConfirmTransaction(connection, t, signers, { commitment: "confirmed" });
  const st = await connection.getSignatureStatus(sig, { searchTransactionHistory: true });
  if (st.value?.slot) minSlot = Math.max(minSlot, st.value.slot);
  return sig;
}
async function read(pubkey: PublicKey) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await connection.getAccountInfoAndContext(pubkey, { commitment: "confirmed", minContextSlot: minSlot });
      if (r.value) return r.value;
    } catch { /* RPC node behind the pinned slot */ }
    await sleep(500);
  }
  throw new Error(`could not read ${pubkey.toBase58()}`);
}
/** Lamports a transaction moved into `account`, from the transaction's own metadata. */
async function lamportDelta(sig: string, account: PublicKey): Promise<bigint> {
  for (let i = 0; i < 40; i++) {
    const t = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (t?.meta) {
      const idx = t.transaction.message.staticAccountKeys.findIndex((k) => k.equals(account));
      return idx < 0 ? 0n : BigInt(t.meta.postBalances[idx]! - t.meta.preBalances[idx]!);
    }
    await sleep(500);
  }
  throw new Error(`transaction ${sig} not found`);
}

async function main() {
  const program = await connection.getAccountInfo(PROGRAM_ID);
  if (!program?.executable) throw new Error("program is not deployed");
  const cfg = decodeConfig((await read(configPda(PROGRAM_ID))).data);
  if (cfg.verifier !== verifier.publicKey.toBase58()) throw new Error(`Config verifier is ${cfg.verifier}, not ${verifier.publicKey.toBase58()}`);
  const treasury = new PublicKey(cfg.treasury);
  const treasuryAuthority = unpackAccount(treasury, await read(treasury), TOKEN_2022_PROGRAM_ID).owner;
  const env: ProgramEnv = { programId: PROGRAM_ID, stakeMint: new PublicKey(cfg.stakeMint), treasury, treasuryAuthority, tokenProgram: TOKEN_2022_PROGRAM_ID };
  log("program", PROGRAM_ID.toBase58(), "| verifier", verifier.publicKey.toBase58(), "| treasury wallet", treasuryAuthority.toBase58());

  // settle_oath_sol pays the protocol share into the treasury wallet. If that wallet is below the rent-exempt minimum
  // (a fresh, unfunded key), a small share leaves it under rent and the whole settlement fails. Keep it funded.
  const rentMin = await connection.getMinimumBalanceForRentExemption(0);
  const treasuryLamports = await connection.getBalance(treasuryAuthority, "confirmed");
  if (treasuryLamports < rentMin) {
    const t = new Transaction().add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: treasuryAuthority, lamports: rentMin - treasuryLamports }));
    log("topped up the treasury wallet to the rent-exempt minimum", tx(await send(t, [funder])));
  }

  if (resume) {
    if (!existsSync(STATE)) throw new Error(`no saved run at ${STATE}`);
    const saved = JSON.parse(readFileSync(STATE, "utf8")) as { oath: string; members: number[][] };
    return finish(env, treasuryAuthority, new PublicKey(saved.oath), saved.members.map((k) => Keypair.fromSecretKey(Uint8Array.from(k))));
  }

  const members = MARKS[0]!.split("").map(() => Keypair.generate());
  const fund = new Transaction();
  for (const m of members) fund.add(SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: m.publicKey, lamports: 20_000_000 }));
  log("funded members", tx(await send(fund, [funder])));

  const { ix, oath } = createOathSolIx(env, { creator: members[0]!.publicKey, oathId: BigInt(Date.now()), goalText: "e2e native SOL", objectId: 1, numDays: MARKS.length, daySeconds: DAY_SECONDS, tzOffsetMinutes: 0, stake: STAKE, isSolo: false });
  writeFileSync(STATE, JSON.stringify({ oath: oath.toBase58(), members: members.map((m) => Array.from(m.secretKey)) }), { mode: 0o600 });
  log("create_oath_sol", oath.toBase58(), tx(await send(new Transaction().add(ix), [members[0]!])));
  for (const m of members.slice(1)) log("join_oath_sol", tx(await send(new Transaction().add(joinOathSolIx(env, { oath, member: m.publicKey })), [m])));
  log("start_oath", tx(await send(new Transaction().add(startOathIx(env, { oath, creator: members[0]!.publicKey })), [members[0]!])));
  const started = decodeOath((await read(oath)).data);

  const disc = createHash("sha256").update("global:record_checkin").digest().subarray(0, 8);
  const checkin = (member: PublicKey, day: number) => new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [{ pubkey: configPda(PROGRAM_ID), isSigner: false, isWritable: false }, { pubkey: oath, isSigner: false, isWritable: true },
      { pubkey: verifier.publicKey, isSigner: true, isWritable: false }, { pubkey: member, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc, Buffer.from([day]), createHash("sha256").update(`e2e-${oath.toBase58()}-${member.toBase58()}-${day}`).digest()]),
  });
  for (let d = 0; d < MARKS.length; d++) {
    await waitUntil(started.startTs + d * DAY_SECONDS + 1, `day ${d + 1}`);
    const t = new Transaction();
    [...MARKS[d]!].forEach((c, i) => { if (c === "k") t.add(checkin(members[i]!.publicKey, d)); });
    log(`record_checkin day ${d + 1} (${MARKS[d]})`, tx(await send(t, [verifier])));
  }

  return finish(env, treasuryAuthority, oath, members);
}

async function finish(env: ProgramEnv, treasuryAuthority: PublicKey, oath: PublicKey, members: Keypair[]) {
  const started = decodeOath((await read(oath)).data);
  const terms = decodeOathTerms((await read(oath)).data);
  if (!terms || terms.rulesVersion !== 3) throw new Error(`expected rules v3, got ${terms?.rulesVersion}`);
  await waitUntil(started.startTs + MARKS.length * DAY_SECONDS + 1, "the Oath to end");
  const settleSig = await send(new Transaction().add(settleOathSolIx(env, { oath, members: members.map((m) => m.publicKey) })), [funder]);
  log("settle_oath_sol", tx(settleSig));

  const masks = members.map((_, i) => MARKS.reduce((acc, day, d) => (day[i] === "k" ? acc | (1 << d) : acc), 0));
  const expected = replayV3(STAKE, terms.missBps, false, masks, MARKS.length);
  if (!expected) throw new Error("replayV3 returned null");
  const settled = decodeOath((await read(oath)).data);
  let failures = 0;
  const check = (label: string, actual: bigint, want: bigint) => {
    const ok = actual === want;
    if (!ok) failures++;
    log(ok ? "PASS" : "FAIL", label, ok ? sol(actual) : `chain=${actual} expected=${want}`);
  };
  members.forEach((m, i) => check(`payout ${"ABC"[i]}`, settled.members.find((x) => x.wallet === m.publicKey.toBase58())!.payout, expected.payouts[i]!));
  check("treasury wallet received", await lamportDelta(settleSig, treasuryAuthority), expected.toTreasury);

  let claimed = 0n;
  for (const [i, m] of members.entries()) {
    const sig = await send(new Transaction().add(claimSolIx(env, { oath, member: m.publicKey })), [m]);
    const got = await lamportDelta(sig, m.publicKey);
    claimed += expected.payouts[i]!;
    log(`claim_sol ${"ABC"[i]}`, tx(sig), `(wallet change ${sol(got)}, includes fee)`);
  }
  check("conservation: payouts + treasury = all stakes", claimed + expected.toTreasury + expected.held, STAKE * BigInt(members.length));
  log(failures ? `${failures} check(s) FAILED` : "ALL CHECKS PASSED", "| Oath", `https://explorer.solana.com/address/${oath.toBase58()}?cluster=devnet`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
