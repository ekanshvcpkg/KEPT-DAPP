import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { decodeConfigEconomics, decodeOathTerms, oathEconomics, OATH_BASE_LEN, type OathTerms } from "../src/v4/terms.js";
import { frozenDayList, needsCarryoverSweep, needsHeldSweep, settleDecision } from "../src/v4/jobs.js";

// OathTerms as economics.rs serializes it after the 316-byte Oath.
function termsBytes(t: { missBps?: number; held?: bigint; releaseTs?: bigint; heldSwept?: boolean; brokePlusOne?: number; version?: number; feeBps?: number; fee?: bigint; price?: bigint; fees?: bigint; freeze?: bigint; bought?: number; used?: number; frozen?: number[]; treasury?: bigint; carryover?: bigint; swept?: boolean; dust?: bigint; tag?: string }) {
  const b = Buffer.alloc(110);
  b.write(t.tag ?? "KEPTTRM1", 0, "latin1"); b[8] = t.version ?? 2; b.writeUInt16LE(t.feeBps ?? 1_500, 9);
  b.writeBigUInt64LE(t.fee ?? 150n, 11); b.writeBigUInt64LE(t.price ?? 25n, 19); b.writeBigUInt64LE(t.fees ?? 300n, 27); b.writeBigUInt64LE(t.freeze ?? 0n, 35);
  b[43] = t.bought ?? 0; b[44] = t.used ?? 0; (t.frozen ?? [0, 0, 0, 0]).forEach((m, i) => b.writeUInt16LE(m, 45 + i * 2));
  b.writeBigUInt64LE(t.treasury ?? 0n, 53); b.writeBigUInt64LE(t.carryover ?? 0n, 61); b[69] = t.swept ? 1 : 0; b.writeBigUInt64LE(t.dust ?? 0n, 70);
  b.writeUInt16LE(t.missBps ?? 0, 78); b.writeBigUInt64LE(t.held ?? 0n, 80); b.writeBigInt64LE(t.releaseTs ?? 0n, 88); b[96] = t.heldSwept ? 1 : 0; b[97] = t.brokePlusOne ?? 0;
  return Buffer.concat([Buffer.alloc(OATH_BASE_LEN), b]);
}

test("an Oath account without a terms region is legacy (rules v1) and never read as v2", () => {
  const legacy = decodeOathTerms(Buffer.alloc(OATH_BASE_LEN))!;
  assert.equal(legacy.rulesVersion, 1);
  assert.equal(legacy.feePerMember, "0");
  assert.equal(decodeOathTerms(termsBytes({ tag: "XXXXXXXX" })), null, "malformed region is rejected, as the program does");
  assert.equal(decodeOathTerms(termsBytes({ version: 4 })), null, "unknown rules versions are rejected");
});

test("terms decode at the program's offsets", () => {
  const t = decodeOathTerms(termsBytes({ bought: 0b0011, used: 0b0010, frozen: [0, 0b100, 0, 0], freeze: 50n, treasury: 352n, carryover: 0n, dust: 2n }))!;
  assert.equal(t.rulesVersion, 2); assert.equal(t.feeBps, 1_500); assert.equal(t.feePerMember, "150"); assert.equal(t.freezePrice, "25");
  assert.equal(t.feesCollected, "300"); assert.equal(t.freezeProceeds, "50");
  assert.deepEqual(t.freezeBought, [true, true, false, false]); assert.deepEqual(t.freezeUsed, [false, true, false, false]);
  assert.deepEqual(t.frozenDays, [0, 4, 0, 0]); assert.equal(t.treasuryPaid, "352"); assert.equal(t.dust, "2");
});

test("config economics: absent until configured; then fee, price and reserve are read", () => {
  const base = Buffer.alloc(139); base.writeUInt16LE(1_000, 104);
  assert.deepEqual(decodeConfigEconomics(base), { legacyFeeBps: 1_000, economics: null });
  const e = Buffer.alloc(90); e.write("KEPTECO1", 0, "latin1"); e.writeUInt16LE(1_500, 8); e.writeBigUInt64LE(10_000_000n, 10);
  const reserve = PublicKey.unique(); reserve.toBuffer().copy(e, 18); e.writeBigUInt64LE(2_000n, 50);
  assert.deepEqual(decodeConfigEconomics(Buffer.concat([base, e])), { legacyFeeBps: 1_000, economics: { feeBps: 1_500, freezePrice: "10000000", carryoverVault: reserve.toBase58(), carryoverTotal: "2000" } });
});

const v2Terms = (over: Partial<OathTerms> = {}): OathTerms => ({ ...decodeOathTerms(termsBytes({}))!, ...over });
const active = (terms: OathTerms, daysKept: Record<string, number>) => ({
  status: 1, startTs: 1_000, numDays: 3, daySeconds: 100, stakeAmount: "1000", members: ["A", "B"], daysKept, payouts: { A: "0", B: "0" }, terms,
});

test("details: fee, total due, freeze-eligible closed days and an estimate under v2", () => {
  // Day 0 and 1 closed at t=1_250; B missed day 1 and has a freeze credit.
  const e = oathEconomics(active(v2Terms({ freezeBought: [false, true, false, false] }), { A: 0b011, B: 0b001 }), "B", 1_250, 1_000);
  assert.equal(e.rulesVersion, 2); assert.equal(e.feeAmount, "150"); assert.equal(e.totalDue, "1150"); assert.equal(e.freezePrice, "25");
  assert.equal(e.settleAt, 1_400, "one Oath day after the end");
  assert.deepEqual(e.viewer?.missedDays, [1]); assert.deepEqual(e.viewer?.freezeEligibleDays, [1]); assert.equal(e.viewer?.canUseFreeze, true);
  assert.deepEqual(e.members.map((m) => m.estimatedPayout), ["1500", "500"], "B unsuccessful unless the freeze is used");
  assert.deepEqual(e.members[0].freezeEligibleDays, [], "A has no uncovered closed day");
});

test("details: a used freeze makes the day kept and the member successful", () => {
  const e = oathEconomics(active(v2Terms({ freezeBought: [false, true, false, false], freezeUsed: [false, true, false, false], frozenDays: [0, 0b010, 0, 0] }), { A: 0b011, B: 0b001 }), "B", 1_250, 1_000);
  assert.deepEqual(e.viewer?.frozenDays, [1]); assert.deepEqual(e.viewer?.missedDays, []); assert.equal(e.viewer?.canUseFreeze, false);
  assert.deepEqual(e.viewer?.freezeEligibleDays, [], "credit already spent");
  assert.deepEqual(e.members.map((m) => m.estimatedPayout), ["1000", "1000"]);
});

test("details: legacy Oaths show no fee, no freezes and the v1 estimate", () => {
  const e = oathEconomics(active(decodeOathTerms(Buffer.alloc(OATH_BASE_LEN))!, { A: 0b011, B: 0b001 }), "A", 1_250, 1_000);
  assert.equal(e.rulesVersion, 1); assert.equal(e.feeBps, 0); assert.equal(e.totalDue, "1000"); assert.equal(e.freezePrice, null); assert.equal(e.settleAt, 1_300);
  assert.deepEqual(e.viewer?.freezeEligibleDays, []);
  assert.deepEqual(e.members.map((m) => m.estimatedPayout), ["1900", "0"], "v1: loser forfeits, 10% of it to treasury");
});

test("details: once settled, the on-chain payouts and accounting are shown, not an estimate", () => {
  const settled = { ...active(v2Terms({ treasuryPaid: "300", carryover: "1000", carryoverSwept: false }), { A: 0, B: 0 }), status: 2, payouts: { A: "500", B: "500" } };
  const e = oathEconomics(settled, "A", 9_999, 1_000);
  assert.deepEqual(e.members.map((m) => m.estimatedPayout), ["500", "500"]);
  assert.deepEqual(e.settlement, { treasuryPaid: "300", carryover: "1000", carryoverSwept: false, dust: "0" });
});

test("settlement waits for the v2 grace day; legacy Oaths settle at the end as before", () => {
  const oath = { status: 1, startTs: 1_000, numDays: 3, daySeconds: 100 };
  assert.equal(settleDecision({ ...oath, rulesVersion: 1 }, 1_300), "settle");
  assert.equal(settleDecision({ ...oath, rulesVersion: 2 }, 1_300), "skip_not_due");
  assert.equal(settleDecision({ ...oath, rulesVersion: 2 }, 1_399), "skip_not_due");
  assert.equal(settleDecision({ ...oath, rulesVersion: 2 }, 1_400), "settle");
  assert.equal(settleDecision({ ...oath, rulesVersion: 2, status: 2 }, 1_400), "skip_settled", "retry after a settle that already landed");
});

test("carryover is swept once: only a settled v2 Oath with unswept carryover needs it", () => {
  const t = (over: Partial<OathTerms>) => v2Terms({ carryover: "2000", ...over });
  assert.equal(needsCarryoverSweep({ status: 2, terms: t({}) }), true);
  assert.equal(needsCarryoverSweep({ status: 2, terms: t({ carryoverSwept: true }) }), false, "already swept (retry)");
  assert.equal(needsCarryoverSweep({ status: 2, terms: t({ carryover: "0" }) }), false, "someone succeeded");
  assert.equal(needsCarryoverSweep({ status: 1, terms: t({}) }), false, "not settled");
  assert.equal(needsCarryoverSweep({ status: 2, terms: { ...t({}), rulesVersion: 1 } }), false, "legacy");
  assert.equal(needsCarryoverSweep(null), false);
});

test("frozen-day bitmasks map to wallet/day pairs by member slot", () => {
  assert.deepEqual(frozenDayList(["A", "B"], [0, 0b100, 0, 0]), [{ wallet: "B", dayIndex: 2 }]);
  assert.deepEqual(frozenDayList(["A"], []), []);
});

test("rules v3 terms decode, including the held amount and the break day", () => {
  const t = decodeOathTerms(termsBytes({ version: 3, feeBps: 0, fee: 0n, price: 0n, fees: 0n, missBps: 1_000, held: 1_900n, releaseTs: 5_000n, brokePlusOne: 2, treasury: 2_100n }))!;
  assert.equal(t.rulesVersion, 3); assert.equal(t.missBps, 1_000); assert.equal(t.feePerMember, "0");
  assert.equal(t.heldTotal, "1900"); assert.equal(t.heldReleaseTs, 5_000); assert.equal(t.heldSwept, false); assert.equal(t.brokeDay, 1);
  assert.equal(decodeOathTerms(termsBytes({ version: 3, missBps: 1_000 }))!.brokeDay, null);
  assert.equal(decodeOathTerms(Buffer.alloc(OATH_BASE_LEN))!.missBps, 0, "legacy accounts have no v3 fields");
});

test("rules v3 economics: no entry fee, a projection that assumes the days to come are kept, and the chain's payouts once settled", () => {
  const terms = decodeOathTerms(termsBytes({ version: 3, feeBps: 0, fee: 0n, price: 0n, fees: 0n, missBps: 1_000 }))! as OathTerms;
  const members = ["A", "B", "C", "D"];
  const base = { status: 1, startTs: 1_000, numDays: 3, daySeconds: 100, stakeAmount: "100000000", members, terms, payouts: {} };
  // Day 1 closed (now = 1_150): D missed it. Days 2-3 are assumed kept.
  const e = oathEconomics({ ...base, daysKept: { A: 0b111, B: 0b111, C: 0b111, D: 0b110 } }, "A", 1_150, 0);
  assert.equal(e.rulesVersion, 3); assert.equal(e.feeAmount, "0"); assert.equal(e.totalDue, "100000000"); assert.equal(e.missBps, 1_000);
  assert.deepEqual(e.members.map((m) => m.estimatedPayout), ["102500000", "102500000", "102500000", "90000000"]);
  assert.equal(e.settleAt, 1_300);
  assert.equal(e.settlement, null);
  const done = oathEconomics({ ...base, status: 2, daysKept: { A: 7, B: 7, C: 7, D: 6 }, payouts: { A: "1", B: "2", C: "3", D: "4" } }, "A", 9_999, 0);
  assert.deepEqual(done.members.map((m) => m.estimatedPayout), ["1", "2", "3", "4"], "settled: the recorded payouts, never the projection");
  assert.deepEqual(done.settlement, { treasuryPaid: "0", held: "0", heldReleaseTs: null, heldSwept: false, brokeDay: null });
});

test("a rules v3 Oath whose HP reached 0 is due the moment the breaking day closes, not at the end", () => {
  const terms = decodeOathTerms(termsBytes({ version: 3, feeBps: 0, fee: 0n, price: 0n, fees: 0n, missBps: 1_000 }))! as OathTerms;
  const members = ["A", "B", "C", "D"];
  // B, C, D miss days 0 and 1 of a 7-day Oath: 100 - 60 + 10 = 50, then 50 - 60 <= 0: it breaks on day 1.
  const oath = { status: 1, startTs: 1_000, numDays: 7, daySeconds: 100, stakeAmount: "1000000000", members, terms, isSolo: false, daysKept: { A: 0x7f, B: 0b1111100, C: 0b1111100, D: 0b1111100 } };
  assert.equal(settleDecision(oath, 1_199), "skip_not_due");
  assert.equal(settleDecision(oath, 1_200), "settle", "day 1 closed at 1_200");
  const fine = { ...oath, daysKept: { A: 0x7f, B: 0x7f, C: 0x7f, D: 0x7f } };
  assert.equal(settleDecision(fine, 1_200), "skip_not_due");
  assert.equal(settleDecision(fine, 1_700), "settle");
  assert.equal(needsHeldSweep({ status: 2, terms: { ...terms, heldTotal: "5", heldReleaseTs: 3_000, heldSwept: false } }, 2_999), false);
  assert.equal(needsHeldSweep({ status: 2, terms: { ...terms, heldTotal: "5", heldReleaseTs: 3_000, heldSwept: false } }, 3_000), true);
  assert.equal(needsHeldSweep({ status: 2, terms: { ...terms, heldTotal: "5", heldReleaseTs: 3_000, heldSwept: true } }, 3_000), false);
  assert.equal(needsHeldSweep({ status: 2, terms: { ...terms, heldTotal: "0" } }, 9_999), false);
});
