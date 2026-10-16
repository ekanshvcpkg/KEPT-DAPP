import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import BN from "bn.js";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { accountsCoder, IDL, PROGRAM_ERRORS } from "./idl";
import { decodeOath, decodeOathTerms, memberSlotOffset, OATH_BASE_LEN, oathDiscriminator } from "./accounts";
import { cancelOathIx, claimIx, claimSolIx, createOathIx, createOathSolIx, goalHash, joinOathIx, joinOathSolIx, settleOathIx, settleOathSolIx, startOathIx, sweepHeldIx, sweepHeldSolIx } from "./instructions";
import type { ProgramEnv } from "./instructions";
import { configPda, keeperPda, oathPda, vaultPda } from "./pda";
import { classifyTxError } from "./errors";

const programId = new PublicKey("6iXXBqsdiCnUTSVf8CW3Uuw8c7iYvZSj5haz64QMuMUh");
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const env: ProgramEnv = { programId, stakeMint: Keypair.generate().publicKey, treasury: Keypair.generate().publicKey, treasuryAuthority: Keypair.generate().publicKey, tokenProgram: TOKEN_2022 };
const disc = (s: string) => createHash("sha256").update(s).digest().subarray(0, 8);

const creator = Keypair.generate().publicKey;
const bob = Keypair.generate().publicKey;
const member = (pk: PublicKey, daysKept: number, payout: number, claimed = false) => ({ authority: pk, staked: true, days_kept: daysKept, claimed, payout: new BN(payout) });
const empty = { authority: PublicKey.default, staked: false, days_kept: 0, claimed: false, payout: new BN(0) };

async function fixture() {
  return accountsCoder.encode("Oath", {
    creator, oath_id: new BN(42), stake_amount: new BN(1_000_000_000), mint: env.stakeMint,
    goal_hash: Array.from(goalHash("lift for 20 minutes")), object_id: 3, num_days: 7, day_seconds: 86_400,
    start_ts: new BN(1_791_500_000), tz_offset_minutes: 330, status: { Active: {} }, is_solo: false, member_count: 2,
    members: [member(creator, 0b101, 0), member(bob, 0b011, 1_250_000_000, true), empty, empty], bump: 254,
  });
}

/** backend/src/routes/v4.ts:363-376, the backend's hand-written decoder, reproduced to prove layout parity. */
function apiReadOath(d: Buffer) {
  const count = d[138]!;
  const members: string[] = [], daysKept: Record<string, number> = {};
  for (let i = 0; i < count; i++) { const o = 139 + i * 44; const w = new PublicKey(d.subarray(o, o + 32)).toBase58(); members.push(w); daysKept[w] = d.readUInt16LE(o + 33); }
  return { oathId: d.readBigUInt64LE(40).toString(), creator: new PublicKey(d.subarray(8, 40)).toBase58(), goalHash: d.subarray(88, 120).toString("hex"), objectId: d[120], numDays: d[121], daySeconds: d.readUInt32LE(122), startTs: Number(d.readBigInt64LE(126)), status: d[136], members, daysKept };
}

test("Oath decode via the IDL matches the API's byte-offset decoder (316-byte layout)", async () => {
  const data = await fixture();
  assert.equal(data.length, 316);
  assert.deepEqual([...data.subarray(0, 8)], [...disc("account:Oath")]);
  const o = decodeOath(data);
  const api = apiReadOath(data);
  assert.equal(o.creator, api.creator);
  assert.equal(o.oathId.toString(), api.oathId);
  assert.equal(o.goalHash, api.goalHash);
  assert.equal(o.goalHash, createHash("sha256").update("lift for 20 minutes").digest("hex"));
  assert.deepEqual([o.objectId, o.numDays, o.daySeconds, o.startTs], [api.objectId, api.numDays, api.daySeconds, api.startTs]);
  assert.equal(o.status, "active");
  assert.equal(api.status, 1);
  assert.equal(o.tzOffsetMinutes, 330);
  assert.deepEqual(o.members.map((m) => m.wallet), api.members);
  assert.deepEqual(Object.fromEntries(o.members.map((m) => [m.wallet, m.daysKept])), api.daysKept);
  assert.equal(o.members[1]!.payout, 1_250_000_000n);
  assert.equal(o.members[1]!.claimed, true);
  assert.equal(new PublicKey(data.subarray(memberSlotOffset(1), memberSlotOffset(1) + 32)).toBase58(), bob.toBase58());
  assert.deepEqual([...oathDiscriminator()], [...disc("account:Oath")]);
});

test("instruction data uses Anchor discriminators (same as the API's hand-hashed ones)", () => {
  const { ix, oath } = createOathIx(env, {
    creator, creatorToken: Keypair.generate().publicKey, oathId: 7n, goalText: " read 20 pages ", objectId: 1,
    numDays: 3, daySeconds: 86_400, tzOffsetMinutes: -300, stake: 500_000_000n, isSolo: false,
  });
  assert.deepEqual([...ix.data.subarray(0, 8)], [...disc("global:create_oath")]);
  // Args: oath_id u64, goal_hash [32], object_id u8, num_days u8, day_seconds u32, tz i16, stake u64, is_solo bool.
  const d = ix.data;
  assert.equal(d.readBigUInt64LE(8), 7n);
  assert.deepEqual([...d.subarray(16, 48)], [...goalHash("read 20 pages")]);
  assert.deepEqual([d[48], d[49], d.readUInt32LE(50), d.readInt16LE(54), d.readBigUInt64LE(56), d[64]], [1, 3, 86_400, -300, 500_000_000n, 0]);
  assert.equal(d.length, 65);
  assert.ok(oath.equals(oathPda(programId, creator, 7n)));
  assert.deepEqual(ix.keys.map((k) => k.pubkey.toBase58()).slice(0, 4), [configPda(programId), oath, vaultPda(programId, oath), keeperPda(programId, creator)].map((p) => p.toBase58()));
  assert.ok(ix.keys[4]!.isSigner && ix.keys[4]!.isWritable);
  assert.ok(ix.keys[9]!.pubkey.equals(SystemProgram.programId));
  for (const [name, i] of [["join_oath", joinOathIx(env, { oath, member: bob, memberToken: bob })], ["start_oath", startOathIx(env, { oath, creator })], ["cancel_oath", cancelOathIx(env, { oath, creator })], ["claim", claimIx(env, { oath, member: bob, destination: bob })]] as const) {
    assert.deepEqual([...i.data], [...disc(`global:${name}`)], name);
  }
  const settle = settleOathIx(env, { oath, members: [creator, bob] });
  assert.equal(settle.keys.length, 6 + 2);
  assert.ok(settle.keys.every((k) => !k.isSigner), "settle_oath is permissionless");
  assert.ok(settle.keys[7]!.pubkey.equals(keeperPda(programId, bob)) && settle.keys[7]!.isWritable);
});

test("IDL is the current program (rules v3 and native SOL included) and errors map by code", () => {
  assert.deepEqual(IDL.instructions.map((i) => i.name).sort(), ["buy_freeze", "cancel_oath", "claim", "claim_sol", "configure_economics", "create_oath", "create_oath_sol", "initialize_config", "join_oath", "join_oath_sol", "migrate_keeper", "record_checkin", "settle_oath", "settle_oath_sol", "start_oath", "sweep_carryover", "sweep_held", "sweep_held_sol", "update_treasury", "use_freeze"]);
  assert.equal(PROGRAM_ERRORS.get(6009)?.name, "NotOpen");
});

test("sweep_held is permissionless and pays only the configured treasury", () => {
  const oath = oathPda(programId, creator, 7n);
  const ix = sweepHeldIx(env, { oath });
  assert.deepEqual([...ix.data], [...disc("global:sweep_held")]);
  assert.ok(ix.keys.every((k) => !k.isSigner));
  assert.ok(ix.keys[3]!.pubkey.equals(env.treasury) && ix.keys[3]!.isWritable);
  assert.ok(ix.keys[2]!.pubkey.equals(vaultPda(programId, oath)));
});

test("native SOL Oath instructions use separate discriminators and the configured treasury authority", () => {
  const oath = oathPda(programId, creator, 9n);
  const created = createOathSolIx(env, { creator, oathId: 9n, goalText: "walk daily", objectId: 3, numDays: 7, daySeconds: 86_400, tzOffsetMinutes: 330, stake: 50_000_000n, isSolo: false });
  assert.deepEqual([...created.ix.data.subarray(0, 8)], [...disc("global:create_oath_sol")]);
  assert.ok(created.oath.equals(oath));
  assert.ok(created.ix.keys.some((k) => k.pubkey.equals(SystemProgram.programId)));
  assert.deepEqual([...joinOathSolIx(env, { oath, member: bob }).data], [...disc("global:join_oath_sol")]);
  assert.deepEqual([...claimSolIx(env, { oath, member: bob }).data], [...disc("global:claim_sol")]);
  const settle = settleOathSolIx(env, { oath, members: [creator, bob] });
  assert.deepEqual([...settle.data], [...disc("global:settle_oath_sol")]);
  assert.ok(settle.keys.some((k) => k.pubkey.equals(env.treasuryAuthority)));
  assert.deepEqual([...sweepHeldSolIx(env, { oath }).data], [...disc("global:sweep_held_sol")]);
});

test("Oath terms decode: no region is rules v1; v3 carries the miss rate, the held amount and the break day", () => {
  assert.equal(decodeOathTerms(new Uint8Array(OATH_BASE_LEN))!.rulesVersion, 1);
  const t = Buffer.alloc(110); t.write("KEPTTRM1", 0, "latin1"); t[8] = 3; t.writeUInt16LE(1_000, 78); t.writeBigUInt64LE(1_900n, 80); t.writeBigInt64LE(5_000n, 88); t[97] = 2; t.writeBigUInt64LE(2_100n, 53);
  const d = decodeOathTerms(Buffer.concat([Buffer.alloc(OATH_BASE_LEN), t]))!;
  assert.deepEqual([d.rulesVersion, d.missBps, d.heldTotal, d.heldReleaseTs, d.heldSwept, d.brokeDay, d.treasuryPaid], [3, 1_000, 1_900n, 5_000, false, 1, 2_100n]);
  t[8] = 9; assert.equal(decodeOathTerms(Buffer.concat([Buffer.alloc(OATH_BASE_LEN), t])), null);
});

test("tx errors classify into the screens' outcomes", () => {
  assert.equal(classifyTxError(new Error("CancellationException: User declined the request")).kind, "rejected");
  assert.equal(classifyTxError(new Error("Network request failed")).kind, "offline");
  assert.equal(classifyTxError(new Error("Simulation failed: Attempt to debit an account but found no record of a prior credit.")).kind, "insufficientSol");
  const prog = classifyTxError(new Error("Simulation failed: custom program error: 0x1779"));
  assert.deepEqual([prog.kind, prog.programError], ["failed", "NotOpen"]);
});
