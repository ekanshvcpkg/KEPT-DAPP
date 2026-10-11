// Decoding the Rules v2 regions appended to on-chain accounts (economics.rs), and the Oath economics view.
// Pure so it can be tested without RPC.
import { PublicKey } from "@solana/web3.js";
import { calculatePayouts, calculatePayoutsV2, closedDayCount, effectiveDays, fullDaysMask, HELD_WINDOW_DAYS, MISS_BPS, replayV3, RULES_LEGACY, RULES_V2, RULES_V3, settleAt } from "../shared/payout.js";

/** Size of the `Oath` struct with its discriminator; an account of exactly this size predates terms (rules v1). */
export const OATH_BASE_LEN = 316;
/** Size of the `Config` struct with its discriminator; `Economics` follows once configured. */
export const CONFIG_BASE_LEN = 139;
const TERMS_TAG = "KEPTTRM1";
const ECONOMICS_TAG = "KEPTECO1";
const MAX_MEMBERS = 4;

/** `OathTerms`. Amounts are base-unit decimal strings (JSON-safe). */
export type OathTerms = {
  rulesVersion: number; feeBps: number; feePerMember: string; freezePrice: string; feesCollected: string; freezeProceeds: string;
  /** Per member slot. */
  freezeBought: boolean[]; freezeUsed: boolean[]; frozenDays: number[];
  treasuryPaid: string; carryover: string; carryoverSwept: boolean; dust: string;
  /** Rules v3: cost of a miss in basis points of the original stake (0 for v1 / v2). */
  missBps: number;
  /** Rules v3: held after a break, released to the treasury by `sweep_held` once `heldReleaseTs` has passed. */
  heldTotal: string; heldReleaseTs: number; heldSwept: boolean;
  /** Rules v3: 0-based day the HP reached 0, or null. */
  brokeDay: number | null;
};

const LEGACY_TERMS: OathTerms = {
  rulesVersion: RULES_LEGACY, feeBps: 0, feePerMember: "0", freezePrice: "0", feesCollected: "0", freezeProceeds: "0",
  freezeBought: [false, false, false, false], freezeUsed: [false, false, false, false], frozenDays: [0, 0, 0, 0],
  treasuryPaid: "0", carryover: "0", carryoverSwept: false, dust: "0",
  missBps: 0, heldTotal: "0", heldReleaseTs: 0, heldSwept: false, brokeDay: null,
};

/** Terms of an Oath account; null if the region is present but malformed (the program rejects such accounts). */
export function decodeOathTerms(data: Buffer): OathTerms | null {
  if (data.length === OATH_BASE_LEN) return LEGACY_TERMS;
  const t = data.subarray(OATH_BASE_LEN);
  if (t.length < 110 || t.subarray(0, 8).toString("latin1") !== TERMS_TAG) return null;
  const rulesVersion = t[8];
  if (rulesVersion !== RULES_LEGACY && rulesVersion !== RULES_V2 && rulesVersion !== RULES_V3) return null;
  const bits = (mask: number) => Array.from({ length: MAX_MEMBERS }, (_, i) => (mask & (1 << i)) !== 0);
  return {
    rulesVersion, feeBps: t.readUInt16LE(9), feePerMember: t.readBigUInt64LE(11).toString(), freezePrice: t.readBigUInt64LE(19).toString(),
    feesCollected: t.readBigUInt64LE(27).toString(), freezeProceeds: t.readBigUInt64LE(35).toString(),
    freezeBought: bits(t[43]), freezeUsed: bits(t[44]), frozenDays: Array.from({ length: MAX_MEMBERS }, (_, i) => t.readUInt16LE(45 + i * 2)),
    treasuryPaid: t.readBigUInt64LE(53).toString(), carryover: t.readBigUInt64LE(61).toString(), carryoverSwept: t[69] === 1, dust: t.readBigUInt64LE(70).toString(),
    missBps: t.readUInt16LE(78), heldTotal: t.readBigUInt64LE(80).toString(), heldReleaseTs: Number(t.readBigInt64LE(88)), heldSwept: t[96] === 1,
    brokeDay: t[97] === 0 ? null : t[97] - 1,
  };
}

export type ConfigEconomics = {
  /** Fee rate rules v1 Oaths settle with (read at settlement time, as the program does). */
  legacyFeeBps: number;
  /** Rules v2 settings for Oaths created now; null until `configure_economics` has run. */
  economics: { feeBps: number; freezePrice: string; carryoverVault: string; carryoverTotal: string } | null;
};

export function decodeConfigEconomics(data: Buffer): ConfigEconomics {
  const legacyFeeBps = data.readUInt16LE(104);
  const e = data.subarray(CONFIG_BASE_LEN);
  if (e.length < 90 || e.subarray(0, 8).toString("latin1") !== ECONOMICS_TAG) return { legacyFeeBps, economics: null };
  return { legacyFeeBps, economics: { feeBps: e.readUInt16LE(8), freezePrice: e.readBigUInt64LE(10).toString(), carryoverVault: new PublicKey(e.subarray(18, 50)).toBase58(), carryoverTotal: e.readBigUInt64LE(50).toString() } };
}

export type EconomicsInput = {
  isSolo?: boolean; status: number; startTs: number; numDays: number; daySeconds: number; stakeAmount: string;
  members: string[]; daysKept: Record<string, number>; payouts: Record<string, string>; terms: OathTerms;
};

/** Closed days (0-based) with no proof and no freeze. */
function uncoveredClosedDays(kept: number, numDays: number, closedThrough: number): number[] {
  const out: number[] = [];
  for (let d = 0; d <= Math.min(closedThrough, numDays - 1); d++) if ((kept & (1 << d)) === 0) out.push(d);
  return out;
}

/**
 * Fee, freeze and payout view of an Oath for `viewer`. On-chain state is authoritative: once settled the
 * recorded payouts are shown; before that `estimatedPayout` assumes every member keeps all remaining days.
 */
export function oathEconomics(o: EconomicsInput, viewer: string, now: number, legacyFeeBps: number) {
  const v2 = o.terms.rulesVersion === RULES_V2;
  const v3 = o.terms.rulesVersion === RULES_V3;
  const stake = BigInt(o.stakeAmount);
  const fee = BigInt(o.terms.feePerMember);
  const started = o.status !== 0 && o.startTs > 0;
  const closedThrough = started ? Math.min(o.numDays, Math.floor((now - o.startTs) / o.daySeconds)) - 1 : -1;
  const members = o.members.map((wallet, i) => {
    const frozen = v2 ? o.terms.frozenDays[i] : 0;
    const kept = effectiveDays(o.daysKept[wallet] ?? 0, frozen);
    const missed = uncoveredClosedDays(kept, o.numDays, closedThrough);
    const canFreeze = v2 && o.status === 1 && o.terms.freezeBought[i] && !o.terms.freezeUsed[i];
    return {
      wallet,
      freezeBought: v2 && o.terms.freezeBought[i], freezeUsed: v2 && o.terms.freezeUsed[i],
      frozenDays: Array.from({ length: o.numDays }, (_, d) => d).filter((d) => (frozen & (1 << d)) !== 0),
      missedDays: missed,
      /** Days this member could cover with their freeze now (buy one first if `freezeBought` is false). */
      freezeEligibleDays: v2 && o.status === 1 && !o.terms.freezeUsed[i] ? missed : [],
      canUseFreeze: canFreeze && missed.length > 0,
      onTrack: missed.length === 0,
      fullyKept: kept === fullDaysMask(o.numDays),
    };
  });
  const successes = members.map((m) => m.onTrack);
  let estimated: bigint[] | null = null;
  // Rules v3: the replay of what is on chain so far, with every day still to come assumed kept. A projection until the program settles.
  const projected = v3 && o.members.length ? replayV3(stake, o.terms.missBps || MISS_BPS, !!o.isSolo, o.members.map((w) => (o.daysKept[w] ?? 0) | futureDaysMask(o.numDays, closedThrough)), o.numDays) : null;
  if (o.status === 2 || o.status === 3) estimated = o.members.map((w) => BigInt(o.payouts[w] ?? "0"));
  else if (v3) estimated = projected?.payouts ?? null;
  else if (o.members.length && v2) estimated = calculatePayoutsV2(stake, successes, BigInt(o.terms.feesCollected), BigInt(o.terms.freezeProceeds))?.payouts ?? null;
  else if (o.members.length) estimated = calculatePayouts(stake, legacyFeeBps, successes)?.payouts ?? null;
  const me = o.members.indexOf(viewer);
  return {
    rulesVersion: o.terms.rulesVersion,
    stakeAmount: stake.toString(),
    feeBps: v2 ? o.terms.feeBps : 0,
    /** Rules v3 only: what one miss costs (basis points of the original stake), and the day the Oath broke, if it did. */
    missBps: v3 ? o.terms.missBps : null,
    brokeDay: v3 ? (o.status === 2 ? o.terms.brokeDay : projected?.brokeDay ?? null) : null,
    feeAmount: fee.toString(),
    /** What one member pays to create or join: stake plus fee. */
    totalDue: (stake + fee).toString(),
    freezePrice: v2 ? o.terms.freezePrice : null,
    feesCollected: o.terms.feesCollected,
    freezeProceeds: o.terms.freezeProceeds,
    settleAt: started ? settleAtFor(o) : null,
    settlement: o.status === 2 && v2 ? { treasuryPaid: o.terms.treasuryPaid, carryover: o.terms.carryover, carryoverSwept: o.terms.carryoverSwept, dust: o.terms.dust }
      : o.status === 2 && v3 ? { treasuryPaid: o.terms.treasuryPaid, held: o.terms.heldTotal, heldReleaseTs: o.terms.heldTotal !== "0" ? o.terms.heldReleaseTs : null, heldSwept: o.terms.heldSwept, brokeDay: o.terms.brokeDay } : null,
    members: members.map((m, i) => ({ ...m, estimatedPayout: estimated?.[i]?.toString() ?? null })),
    viewer: me >= 0 ? { ...members[me], estimatedPayout: estimated?.[me]?.toString() ?? null } : null,
  };
}

/** Bits for every day that has not closed yet (kept by assumption in a projection). */
function futureDaysMask(numDays: number, closedThrough: number): number {
  let mask = 0;
  for (let d = Math.max(0, closedThrough + 1); d < numDays; d++) mask |= 1 << d;
  return mask;
}

/**
 * Earliest unix time the program accepts settle_oath for this Oath. Rules v3 settle an Oath whose HP reached 0 as soon
 * as the breaking day has closed; every other Oath after its last day (rules v2 one day later).
 */
export function settleAtFor(o: Pick<EconomicsInput, "startTs" | "numDays" | "daySeconds" | "stakeAmount" | "members" | "daysKept" | "terms"> & { isSolo?: boolean }): number {
  const end = o.startTs + o.numDays * o.daySeconds;
  if (o.terms.rulesVersion !== RULES_V3) return settleAt({ ...o, rulesVersion: o.terms.rulesVersion });
  if (!o.members.length || o.startTs <= 0) return end;
  // The break can only come from days already closed; replay as if every closed day had been recorded.
  const replay = replayV3(BigInt(o.stakeAmount), o.terms.missBps || MISS_BPS, !!o.isSolo, o.members.map((w) => o.daysKept[w] ?? 0), o.numDays);
  return replay?.brokeDay != null ? o.startTs + (replay.brokeDay + 1) * o.daySeconds : end;
}

/** True once the held half of a broken rules v3 Oath may be released to the treasury. */
export function heldSweepDue(o: { status: number; terms: OathTerms }, now: number): boolean {
  return o.status === 2 && o.terms.rulesVersion === RULES_V3 && BigInt(o.terms.heldTotal) > 0n && !o.terms.heldSwept && now >= o.terms.heldReleaseTs;
}

/** Whether a settled rules v3 Oath still has held money waiting for its window to pass. */
export function heldSweepPending(o: { status: number; terms: OathTerms } | null): boolean {
  return !!o && o.status === 2 && o.terms.rulesVersion === RULES_V3 && BigInt(o.terms.heldTotal) > 0n && !o.terms.heldSwept;
}

export { HELD_WINDOW_DAYS, closedDayCount };
