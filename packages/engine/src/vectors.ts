// Scenarios exported as JSON test vectors (test-vectors/oath-vectors.json) so the Rust program can be
// tested against the same numbers (BACKEND_GAPS P0-6). Marks: one string per day, one char per member.

import { MISS_BPS, stakeUnits } from "@kept/config";
import type { DayMark, OathState, OathTerms } from "./oath";
import { simulate } from "./oath";

export interface Scenario {
  name: string;
  description: string;
  terms: OathTerms;
  /** e.g. ["kmkm", "kkkk", "kkkm"]: day by day, member by member. */
  marks: string[];
}

export const SCENARIOS: Scenario[] = [
  {
    name: "all-keep-7",
    description: "Everyone keeps every day: no money moves, everyone gets their full stake back, HP stays 100.",
    terms: { stake: stakeUnits(1000), days: 7, members: 3, solo: false },
    marks: ["kkk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk"],
  },
  {
    name: "owner-example-one-miss",
    description: "D-91: 4 × 100 SKR, one member misses once. The miss costs 10 SKR, split between the 3 keepers and KEPT: 2.5 each.",
    terms: { stake: stakeUnits(100), days: 3, members: 4, solo: false },
    marks: ["kkkm", "kkkk", "kkkk"],
  },
  {
    name: "two-misses-one-day",
    description: "D-91: 4 × 1,000 SKR, two members miss the same day: 200 SKR split 3 ways (2 keepers + KEPT). Not divisible: 66.666666 each, the dust goes to KEPT.",
    terms: { stake: stakeUnits(1000), days: 3, members: 4, solo: false },
    marks: ["kkmm", "kkkk", "kkkk"],
  },
  {
    name: "worked-example",
    description: "D-91 version of the rules.md §3 example: 4 × 1,000 SKR, 3 days. Day 1 B and D miss (200 split 3 ways); day 2 all keep; day 3 D misses again (100 split 4 ways, still 100: no escalation).",
    terms: { stake: stakeUnits(1000), days: 3, members: 4, solo: false },
    marks: ["kmkm", "kkkk", "kkkm"],
  },
  {
    name: "repeated-misses-7",
    description: "D-91: 1,000 SKR / 7 days. One member misses three times and pays 100 SKR each time (flat, not 143 / 214 / 321); the others split each 100 four ways.",
    terms: { stake: stakeUnits(1000), days: 7, members: 4, solo: false },
    marks: ["kkkm", "kkkk", "kkkm", "kkkk", "kkkm", "kkkk", "kkkk"],
  },
  {
    name: "miss-cost-ignores-length-14",
    description: "D-91: a 14-day Oath costs the same per miss as a 3-day one (10% of 2,500 = 250 SKR); the 250 is split 3 ways (2 keepers + KEPT).",
    terms: { stake: stakeUnits(2500), days: 14, members: 3, solo: false },
    marks: ["kkk", "kmk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk", "kkk"],
  },
  {
    name: "nobody-keeps-day",
    description: "D-91 (owner-confirmed): everyone misses day 1, so there are no keepers. All of the lost money (2 × 50 SKR) goes to KEPT.",
    terms: { stake: stakeUnits(500), days: 3, members: 2, solo: false },
    marks: ["mm", "kk", "kk"],
  },
  {
    name: "rounding-dust",
    description: "D-91: stake 1,000.000007 SKR, so a miss is floor(10%) = 100.000000 SKR; split 3 ways (2 keepers + KEPT) = 33.333333 each, the 1 dust unit goes to KEPT.",
    terms: { stake: stakeUnits(1000) + 7n, days: 3, members: 3, solo: false },
    marks: ["kkm", "kkk", "kkk"],
  },
  {
    name: "owner-example-two-misses",
    description: "D-91: 4 × 100 SKR, two members miss: each forfeits 10 SKR; each forfeiture is split 3 ways (2 keepers + KEPT). Keepers get 6.666666 each over both, KEPT 6.666668.",
    terms: { stake: stakeUnits(100), days: 3, members: 4, solo: false },
    marks: ["kkmm", "kkkk", "kkkk"],
  },
  {
    name: "rounding-per-forfeiture",
    description: "D-91: stake 30 base units (a miss is 3), 3 members, two miss: each 3-unit forfeiture is split 2 ways (1 keeper + KEPT) = 1 + 2, so the keeper gets 2 and KEPT 4 (not 3 and 3 from splitting the 6 once).",
    terms: { stake: 30n, days: 3, members: 3, solo: false },
    marks: ["kmm", "kkk", "kkk"],
  },
  {
    name: "solo-kept",
    description: "Solo, kept every day.",
    terms: { stake: stakeUnits(2500), days: 3, members: 1, solo: true },
    marks: ["k", "k", "k"],
  },
  {
    name: "solo-missed-some",
    description: "D-1 / D-91: solo misses cost 10% each (flat) and go to KEPT, −35 HP each.",
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
    description: "Amendment 2: 4 members, 3 miss on day 1 and day 2: 100−60+10=50, 50−60 ≤ 0 → break on day 2: no heal, no payout, no KEPT share.",
    terms: { stake: stakeUnits(1000), days: 7, members: 4, solo: false },
    marks: ["kmmm", "kmmm", "kkkk"],
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
    terms: { stake: String(sc.terms.stake), days: sc.terms.days, members: sc.terms.members, solo: sc.terms.solo, missBps: Number(MISS_BPS) },
    marks: sc.marks,
    expected: {
      hp: st.hp,
      broken: st.broken,
      brokeOnDay: st.brokeOnDay,
      balances: s(st.balances),
      lost: s(st.lost),
      won: s(st.won),
      held: s(st.held),
      /** KEPT's equal shares of the days' lost money, dust included. */
      fee: String(st.feeTotal),
      toTreasury: String(st.toTreasuryTotal),
      days: st.dayResults.map((d) => ({
        day: d.day, hpBefore: d.hpBefore, damage: d.damage, hpAfter: d.hpAfter, broken: d.broken,
        lost: s(d.lost), won: s(d.won), fee: String(d.fee), toTreasury: String(d.toTreasury), held: s(d.held),
      })),
    },
  };
}
