// Pure helpers for the background job in routes/v4.ts.
import { createHash, timingSafeEqual } from "node:crypto";
import { RULES_LEGACY, RULES_V2, settleAt } from "../shared/payout.js";
import { heldSweepDue, settleAtFor, type OathTerms } from "./terms.js";

/** Index of the last Oath day whose window has fully ended at `now`, or -1. Never past the last day. */
export function lastClosedDay(oath: { startTs: number; daySeconds: number; numDays: number }, now: number): number {
  if (oath.startTs <= 0 || oath.daySeconds <= 0 || now < oath.startTs) return -1;
  return Math.min(oath.numDays, Math.floor((now - oath.startTs) / oath.daySeconds)) - 1;
}

/** Members missing each closed day after `from` up to and including `through`. */
export function missedDays(daysKept: Record<string, number>, from: number, through: number): Array<{ wallet: string; dayIndex: number }> {
  const out: Array<{ wallet: string; dayIndex: number }> = [];
  for (let day = Math.max(0, from + 1); day <= through; day++) {
    for (const [wallet, mask] of Object.entries(daysKept)) if ((mask & (1 << day)) === 0) out.push({ wallet, dayIndex: day });
  }
  return out;
}

/** Constant-time check of the admin secret header; no secret configured means admin is disabled. */
export function adminSecretMatches(configured: string, provided: unknown): boolean {
  if (!configured || typeof provided !== "string") return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(configured), digest(provided));
}

/** What `settleDecision` needs. Rules v3 also needs the members' proofs, because a break lets an Oath settle early. */
export type SettleInput = {
  status: number; startTs: number; numDays: number; daySeconds: number; rulesVersion?: number;
  terms?: OathTerms; members?: string[]; daysKept?: Record<string, number>; stakeAmount?: string; isSolo?: boolean;
};

/** Earliest unix time `settle_oath` is accepted for this read of an Oath. */
export function settleDueAt(o: SettleInput): number {
  if (o.terms && o.members && o.daysKept && o.stakeAmount !== undefined) return settleAtFor({ ...o, terms: o.terms, members: o.members, daysKept: o.daysKept, stakeAmount: o.stakeAmount });
  return settleAt({ ...o, rulesVersion: o.rulesVersion ?? RULES_LEGACY });
}

/**
 * Decides from a fresh on-chain read, taken right before settling, whether to send settle_oath.
 * Rules v2 Oaths are due one Oath day after the end (the freeze window for the last day); rules v3 Oaths whose HP
 * reached 0 are due as soon as the breaking day has closed.
 */
export function settleDecision(fresh: SettleInput | null, now: number): "settle" | "skip_settled" | "skip_not_active" | "skip_not_due" {
  if (!fresh) return "skip_not_active";
  if (fresh.status === 2) return "skip_settled";
  if (fresh.status !== 1) return "skip_not_active";
  return now >= settleDueAt(fresh) ? "settle" : "skip_not_due";
}

/** Whether a settled rules v3 Oath's held money can be released to the treasury now. */
export const needsHeldSweep = (fresh: { status: number; terms: OathTerms } | null, now: number): boolean => !!fresh && heldSweepDue(fresh, now);

/** Whether a settled rules v2 Oath still has carryover to move into the reserve. */
export function needsCarryoverSweep(fresh: { status: number; terms: { rulesVersion: number; carryover: string; carryoverSwept: boolean } } | null): boolean {
  return !!fresh && fresh.status === 2 && fresh.terms.rulesVersion === RULES_V2 && BigInt(fresh.terms.carryover) > 0n && !fresh.terms.carryoverSwept;
}

/** (wallet, day) pairs covered by a used freeze, from per-member-slot frozen-day bitmasks. */
export function frozenDayList(members: string[], frozenDays: number[]): Array<{ wallet: string; dayIndex: number }> {
  const out: Array<{ wallet: string; dayIndex: number }> = [];
  members.forEach((wallet, i) => { for (let d = 0; d < 16; d++) if ((frozenDays[i] ?? 0) & (1 << d)) out.push({ wallet, dayIndex: d }); });
  return out;
}
