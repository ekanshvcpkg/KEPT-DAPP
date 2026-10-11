// Settlement math, mirroring `calculate_payouts` and settle_oath's success rule in
// kept-example/program/programs/kept_test/src/lib.rs. Keep the two in step: the program decides real
// payouts, this only previews them. Shared by the backend and the app (imported via Metro watchFolders),
// so it must stay dependency-free.

const U64_MAX = (1n << 64n) - 1n;

/** All amounts are mint base units. The treasury receives `fee + dust`. */
export type PayoutResult = { payouts: bigint[]; fee: bigint; dust: bigint };

/**
 * Per-member payouts for one Oath, in member order.
 * - Everyone kept (or no stake): everyone gets their stake back, no fee.
 * - Some missed: the fee is `feeBps` of the missed stakes; keepers get their stake plus an equal
 *   share of the rest. Integer-division remainder (dust) goes to the treasury.
 * - Everyone missed: each member pays `feeBps` of their own stake and gets the rest back.
 * Returns null where the program returns None (no members, fee over 100%, or u64 overflow).
 */
export function calculatePayouts(stake: bigint, feeBps: number, successes: boolean[]): PayoutResult | null {
  if (stake < 0n || stake > U64_MAX || !Number.isInteger(feeBps) || feeBps < 0 || feeBps > 0xffff) return null;
  if (successes.length === 0 || feeBps > 10_000) return null;
  const bps = BigInt(feeBps);
  const members = BigInt(successes.length);
  const keepers = BigInt(successes.filter(Boolean).length);
  const broken = members - keepers;
  const payouts = successes.map(() => 0n);

  if (stake === 0n || broken === 0n) {
    if (stake > 0n) payouts.fill(stake);
    return { payouts, fee: 0n, dust: 0n };
  }

  if (keepers === 0n) {
    const perFee = (stake * bps) / 10_000n;
    payouts.fill(stake - perFee);
    const fee = perFee * members;
    return fee > U64_MAX ? null : { payouts, fee, dust: 0n };
  }

  const lost = stake * broken;
  if (lost > U64_MAX) return null;
  const fee = (lost * bps) / 10_000n;
  const distributable = lost - fee;
  const share = distributable / keepers;
  for (let i = 0; i < successes.length; i++) {
    if (!successes[i]) continue;
    const payout = stake + share;
    if (payout > U64_MAX) return null;
    payouts[i] = payout;
  }
  return { payouts, fee, dust: distributable - share * keepers };
}

/** Bitmask a member's days_kept must equal to have kept every day (settle_oath's `full`). */
export function fullDaysMask(numDays: number): number {
  return numDays === 16 ? 0xffff : (1 << numDays) - 1;
}

// ---- Rules v2 (mirrors kept-example/program/programs/kept_test/src/economics.rs) ----
// Oaths created after `configure_economics` pay a fee on top of the stake at create/join, may buy one freeze
// credit per member, and a member with an uncovered missed day loses 50% of the stake once. Oaths created
// before that keep rules v1 (`calculatePayouts` above) for good.

export const RULES_LEGACY = 1;
export const RULES_V2 = 2;
export const SLASH_BPS = 5_000n;
const BPS = 10_000n;

/** Entry fee for one member's stake, rounded down. Null where the program's `fee_for_stake` returns None. */
export function feeForStake(stake: bigint, feeBps: number): bigint | null {
  if (stake < 0n || stake > U64_MAX || !Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) return null;
  return (stake * BigInt(feeBps)) / BPS;
}

/** Amount slashed from an unsuccessful member under rules v2, rounded down (the member keeps the odd unit). */
export function slashAmount(stake: bigint): bigint {
  return (stake * SLASH_BPS) / BPS;
}

/** Days that count as kept: recorded proofs plus a freeze-covered day. */
export function effectiveDays(daysKept: number, frozenDays: number): number {
  return (daysKept | frozenDays) & 0xffff;
}

/** Earliest unix time settle_oath accepts. Rules v2 wait one more Oath day so the last day can be frozen. */
export function settleAt(oath: { startTs: number; numDays: number; daySeconds: number; rulesVersion: number }): number {
  const end = oath.startTs + oath.numDays * oath.daySeconds;
  return oath.rulesVersion === RULES_V2 ? end + oath.daySeconds : end;
}

/** All amounts are mint base units. The treasury receives `toTreasury` (fees + freeze proceeds + dust). */
export type SettlementV2 = { payouts: bigint[]; slashed: bigint; toTreasury: bigint; carryover: bigint; dust: bigint };

/**
 * Rules v2 settlement, in member order.
 * - Successful members (every day kept or frozen) get their stake back plus an equal share of the slashed stake.
 * - Unsuccessful members get their stake minus one 50% slash, however many days they missed.
 * - With no successful member the slashed stake is carryover for the reserve, not treasury.
 * - Fees and freeze proceeds go to treasury, with the integer remainder of the winners' share (dust).
 * Invariant: sum(payouts) + toTreasury + carryover = stake * members + feesCollected + freezeProceeds.
 * Returns null where the program returns None (no members, or a value outside u64).
 */
export function calculatePayoutsV2(stake: bigint, successes: boolean[], feesCollected: bigint, freezeProceeds: bigint): SettlementV2 | null {
  for (const v of [stake, feesCollected, freezeProceeds]) if (v < 0n || v > U64_MAX) return null;
  if (successes.length === 0) return null;
  const members = BigInt(successes.length);
  const keepers = BigInt(successes.filter(Boolean).length);
  const slash = slashAmount(stake);
  const slashed = slash * (members - keepers);
  const share = keepers === 0n ? 0n : slashed / keepers;
  const carryover = keepers === 0n ? slashed : 0n;
  const dust = keepers === 0n ? 0n : slashed - share * keepers;
  const payouts = successes.map((won) => (won ? stake + share : stake - slash));
  const toTreasury = feesCollected + freezeProceeds + dust;
  const collected = stake * members + feesCollected + freezeProceeds;
  // Every partial sum the program checks is bounded by one of these, so checking them matches its overflow cases.
  if (slashed > U64_MAX || toTreasury > U64_MAX || collected > U64_MAX || payouts.some((p) => p > U64_MAX)) return null;
  if (payouts.reduce((a, b) => a + b, 0n) + toTreasury + carryover !== collected) return null;
  return { payouts, slashed, toTreasury, carryover, dust };
}

// ---- Rules v3: the owner's money model (docs/DECISIONS.md D-93). Mirrors `replay_v3` in the program's economics.rs ----
// Every new Oath records rules v3: no entry fee; each missed day costs 10% of the original stake (capped at the
// balance); each member's forfeiture is split on its own into k + 1 equal shares between that day's k keepers and
// KEPT, with every remainder going to KEPT; a day nobody kept goes to KEPT; HP as in design/rules.md, and on a break
// the balances are half held for the Rematch window and half sent to KEPT.

export const RULES_V3 = 3;
export const MISS_BPS = 1_000;
export const BREAK_HOLD_BPS = 5_000n;
/** Oath days after a break settles before the held half is released to the treasury. */
export const HELD_WINDOW_DAYS = 7;
const HP = { start: 100, max: 100, heal: 10, missGroup: 20, missSolo: 35 } as const;

/** All amounts are mint base units. `toTreasury` is sent at settlement; `held` stays in the vault until `sweep_held`. */
export type SettlementV3 = { payouts: bigint[]; toTreasury: bigint; held: bigint; brokeDay: number | null; hp: number };

/** Cost of one miss: `missBps` of the original stake, rounded down. */
export function missCostV3(stake: bigint, missBps: number): bigint {
  return (stake * BigInt(missBps)) / BPS;
}

/** Oath days that have fully ended at `now`, never more than `numDays`. */
export function closedDayCount(oath: { startTs: number; daySeconds: number; numDays: number }, now: number): number {
  if (oath.startTs <= 0 || oath.daySeconds <= 0 || now < oath.startTs) return 0;
  return Math.max(0, Math.min(oath.numDays, Math.floor((now - oath.startTs) / oath.daySeconds)));
}

/**
 * Replays the first `days` days from the members' `days_kept` bitmasks (bit d = day d kept). Returns null where the
 * program returns None (no members, more than four, a value outside u64, or a failed conservation check).
 */
export function replayV3(stake: bigint, missBps: number, solo: boolean, daysKept: number[], days: number): SettlementV3 | null {
  const n = daysKept.length;
  if (n === 0 || n > 4 || days < 0 || days > 16 || stake < 0n || stake > U64_MAX) return null;
  const cost = missCostV3(stake, missBps);
  const damagePerMiss = solo ? HP.missSolo : HP.missGroup;
  let balances = daysKept.map(() => stake);
  let toTreasury = 0n;
  let held = 0n;
  let hp: number = HP.start;
  for (let d = 0; d < days; d++) {
    const start = balances;
    const kept = daysKept.map((m) => (m & (1 << d)) !== 0);
    const lost = balances.map((b, i) => (kept[i] ? 0n : cost < b ? cost : b));
    balances = balances.map((b, i) => b - lost[i]);
    const missed = kept.filter((k) => !k).length;
    const after = hp - missed * damagePerMiss;
    if (after <= 0) {
      held = start.reduce((a, b) => a + (b * BREAK_HOLD_BPS) / BPS, 0n);
      toTreasury += start.reduce((a, b) => a + b, 0n) - held;
      if (toTreasury + held !== stake * BigInt(n)) return null;
      return { payouts: daysKept.map(() => 0n), toTreasury, held, brokeDay: d, hp: 0 };
    }
    const keepers = kept.flatMap((k, i) => (k ? [i] : []));
    for (const p of lost) {
      if (p === 0n) continue;
      if (keepers.length === 0) { toTreasury += p; continue; }
      const each = p / BigInt(keepers.length + 1);
      for (const i of keepers) balances[i] += each;
      toTreasury += p - each * BigInt(keepers.length);
    }
    hp = Math.min(HP.max, after + HP.heal);
  }
  const paid = balances.reduce((a, b) => a + b, 0n);
  if (paid + toTreasury + held !== stake * BigInt(n)) return null;
  return { payouts: balances, toTreasury, held, brokeDay: null, hp };
}
