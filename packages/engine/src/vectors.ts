// Scenarios exported as JSON test vectors (test-vectors/oath-vectors.json) so the Rust program can be
// tested against the same numbers (BACKEND_GAPS P0-6). Marks: one string per day, one char per member.

import { stakeUnits } from "@kept/config";
import type { DayMark, OathState, OathTerms } from "./oath";
import { simulate } from "./oath";

interface Scenario {
  name: string;
  description: string;
  terms: OathTerms;
  /** e.g. ["kmkm", "kkkk", "kkkm"]: day by day, member by member. */
  marks: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    name: "worked-example",
    description: "rules.md §3: 4 × 1,000 SKR, 3 days. Day 1 B and D miss; day 2 all keep; day 3 D misses.",
    terms: { stake: stakeUnits(1000), days: 3, members: 4, solo: false },
    marks: ["kmkm", "kkkk", "kkkm"],
  },
  {
    name: "all-keep-7",
    description: "Everyone keeps every day: no money moves, HP stays 100.",
    terms: { stake: stakeUnits(1000), days: 7, members: 3, solo: false },
    marks: ["kkk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk"],
  },
  {
    name: "miss-cost-sequence-7",
    description: "1,000 / 7 days: one member misses three times (143, 214, 321 rounded) while HP survives.",
    terms: { stake: stakeUnits(1000), days: 7, members: 4, solo: false },
    marks: ["kkkm", "kkkk", "kkkm", "kkkk", "kkkm", "kkkk", "kkkk"],
  },
  {
    name: "cap-at-balance",
    description: "D-3: 3-day, 2 members; B misses every day so the 3rd miss (750) is capped at B's remaining balance (166.67).",
    terms: { stake: stakeUnits(1000), days: 3, members: 2, solo: false },
    marks: ["km", "km", "km"],
  },
  {
    name: "nobody-keeps-day",
    description: "D-15: everyone misses day 1: the lost money goes to the treasury with no fee.",
    terms: { stake: stakeUnits(500), days: 3, members: 2, solo: false },
    marks: ["mm", "kk", "kk"],
  },
  {
    name: "solo-kept",
    description: "Solo, kept every day.",
    terms: { stake: stakeUnits(2500), days: 3, members: 1, solo: true },
    marks: ["k", "k", "k"],
  },
  {
    name: "solo-missed-some",
    description: "D-1: solo misses go to the treasury, −35 HP each.",
    terms: { stake: stakeUnits(1000), days: 7, members: 1, solo: true },
    marks: ["k", "m", "k", "k", "m", "k", "k"],
  },
  {
    name: "solo-break",
    description: "Solo misses every day: 100→75→50→25→break on day 4 (−35 from 25). Half the remaining balance held for the Rematch.",
    terms: { stake: stakeUnits(1000), days: 7, members: 1, solo: true },
    marks: ["m", "m", "m", "m", "k", "k", "k"],
  },
  {
    name: "group-break",
    description: "Amendment 2: 4 members, 3 miss on day 1 and day 2: 100−60+10=50, 50−60 ≤ 0 → break on day 2: no heal, no payout, no fee.",
    terms: { stake: stakeUnits(1000), days: 7, members: 4, solo: false },
    marks: ["kmmm", "kmmm", "kkkk"],
  },
  {
    name: "fourteen-days",
    description: "14-day Oath with scattered misses (weights by days kept so far).",
    terms: { stake: stakeUnits(2500), days: 14, members: 3, solo: false },
    marks: ["kkk", "kmk", "kkk", "kkm", "kkk", "kkk", "mkk", "kkk", "kkk", "kmk", "kkk", "kkk", "kkk", "kkk"],
  },
];

export const parseMarks = (marks: string[]): DayMark[][] =>
  marks.map((d) => [...d].map((c) => {
    if (c !== "k" && c !== "m") throw new Error(`bad mark ${c}`);
    return c;
  }));

const s = (xs: bigint[]) => xs.map(String);

/** The JSON shape written to test-vectors/oath-vectors.json (all amounts as base-unit strings). */
export function vectorOf(sc: Scenario) {
  const st: OathState = simulate(sc.terms, parseMarks(sc.marks));
  return {
    name: sc.name,
    description: sc.description,
    terms: { stake: String(sc.terms.stake), days: sc.terms.days, members: sc.terms.members, solo: sc.terms.solo, feeBps: Number(sc.terms.feeBps ?? 1000n) },
    marks: sc.marks,
    expected: {
      hp: st.hp,
      broken: st.broken,
      brokeOnDay: st.brokeOnDay,
      balances: s(st.balances),
      lost: s(st.lost),
      won: s(st.won),
      held: s(st.held),
      fee: String(st.feeTotal),
      toTreasury: String(st.toTreasuryTotal),
      days: st.dayResults.map((d) => ({
        day: d.day, hpBefore: d.hpBefore, damage: d.damage, hpAfter: d.hpAfter, broken: d.broken,
        lost: s(d.lost), won: s(d.won), fee: String(d.fee), toTreasury: String(d.toTreasury), held: s(d.held),
      })),
    },
  };
}
