import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stakeUnits } from "@kept/config";
import {
  applyDay, initialState, missCost, nextMissBreaks, nextMissCost, previewMiss, rematchRecovery, settlement, simulate, splitLost,
  bountyFunding, bountySplit, marksFromBitmasks,
} from "./oath";
import { keptRate, keptRatePercent, odds } from "./reputation";
import { dayPhase, localDay, nextMidnight, DAY_SECONDS } from "./time";
import { hpFilledSegments, hpLostSegments, hpTone } from "./hp";
import { oathNameParts } from "./names";
import { SCENARIOS, parseMarks, vectorOf } from "./vectors";

const SKR = stakeUnits(1);
/** Base units → SKR rounded half-up to 2 decimals, as rules.md displays them. */
const skr2 = (u: bigint) => (Number((u * 100n + SKR / 2n) / SKR) / 100).toFixed(2);

test("worked example (D-91): 4 × 1,000 SKR over 3 days, B and D miss day 1, D misses day 3", () => {
  const s = simulate({ stake: stakeUnits(1000), days: 3, members: 4, solo: false }, parseMarks(["kmkm", "kkkk", "kkkm"]));
  // Day 1: B and D lose 100 each; 200 splits in 3 (A, C, KEPT). Day 3: D loses 100 again (flat); 100 splits in 4 (A, B, C, KEPT).
  assert.deepEqual(s.balances, [1_091_666_666n, 925_000_000n, 1_091_666_666n, 800_000_000n]);
  assert.equal(s.feeTotal, 91_666_668n); // KEPT: 66.666668 (66.666666 + 2 dust) + 25
  assert.equal(s.toTreasuryTotal, 0n);
  assert.equal(s.balances.reduce((a, b) => a + b, 0n) + s.feeTotal, 4_000_000_000n);
  const [d1, d2, d3] = s.dayResults;
  assert.equal(d1!.lostTotal, 200_000_000n);
  assert.deepEqual(d1!.won, [66_666_666n, 0n, 66_666_666n, 0n]);
  assert.equal(d1!.fee, 66_666_668n);
  assert.equal(d1!.hpAfter, 70);
  assert.equal(d2!.lostTotal, 0n);
  assert.equal(d2!.hpAfter, 80);
  assert.equal(d3!.lostTotal, 100_000_000n);
  assert.deepEqual(d3!.won, [25_000_000n, 25_000_000n, 25_000_000n, 0n]);
  assert.equal(d3!.fee, 25_000_000n);
  assert.equal(d3!.hpAfter, 70);
  assert.deepEqual(d3!.keptSoFar, [3, 2, 3, 1]);
  const b = settlement(s);
  assert.deepEqual(b.map((m) => [m.lost, m.won]), [[0n, 91_666_666n], [100_000_000n, 25_000_000n], [0n, 91_666_666n], [200_000_000n, 0n]]);
});

test("the owner's example (D-91): 100 SKR stake, one miss costs 10 SKR, split between 3 keepers and KEPT", () => {
  const s = simulate({ stake: stakeUnits(100), days: 3, members: 4, solo: false }, parseMarks(["kkkm"]));
  assert.equal(s.dayResults[0]!.lostTotal, 10_000_000n);
  assert.deepEqual(s.dayResults[0]!.won, [2_500_000n, 2_500_000n, 2_500_000n, 0n]);
  assert.equal(s.dayResults[0]!.fee, 2_500_000n);
  assert.deepEqual(s.balances, [102_500_000n, 102_500_000n, 102_500_000n, 90_000_000n]);
});

test("all keep: nobody pays, nobody wins, full stakes back", () => {
  const s = simulate({ stake: stakeUnits(1000), days: 7, members: 3, solo: false }, parseMarks(Array(7).fill("kkk")));
  assert.deepEqual(s.balances, Array(3).fill(stakeUnits(1000)));
  assert.equal(s.feeTotal, 0n);
  assert.equal(s.toTreasuryTotal, 0n);
  assert.equal(s.hp, 100);
});

test("cost of a miss: 10% of the original stake, the same for every miss and every Oath length", () => {
  assert.equal(missCost(stakeUnits(100)), 10_000_000n);
  assert.equal(missCost(stakeUnits(1000)), 100_000_000n);
  assert.equal(missCost(stakeUnits(2500)), 250_000_000n);
  assert.equal(missCost(stakeUnits(1000) + 7n), 100_000_000n, "rounds down");
  assert.equal(missCost(0n), 0n);
  assert.throws(() => missCost(-1n), RangeError);
});

test("multiple misses on one day are each charged, and the pool splits between the keepers left and KEPT", () => {
  const s = simulate({ stake: stakeUnits(1000), days: 3, members: 4, solo: false }, parseMarks(["kkmm"]));
  const d = s.dayResults[0]!;
  assert.deepEqual(d.lost, [0n, 0n, 100_000_000n, 100_000_000n]);
  assert.deepEqual(d.won, [66_666_666n, 66_666_666n, 0n, 0n]);
  assert.equal(d.fee, 66_666_668n);
  assert.equal(d.hpAfter, 70);
  assert.equal(d.won.reduce((a, b) => a + b, 0n) + d.fee, d.lostTotal);
});

test("repeated misses by one member each cost the same 10% (no 1.5× escalation)", () => {
  const s = simulate({ stake: stakeUnits(1000), days: 7, members: 4, solo: false }, parseMarks(["kkkm", "kkkk", "kkkm", "kkkk", "kkkm"]));
  assert.deepEqual(s.dayResults.map((d) => d.lost[3]), [100_000_000n, 0n, 100_000_000n, 0n, 100_000_000n]);
  assert.equal(s.misses[3], 3);
  assert.equal(s.balances[3], 700_000_000n);
  assert.equal(s.lost[3], 300_000_000n);
  // Each 100 splits 4 ways: 25 to each keeper, 25 to KEPT.
  assert.deepEqual(s.balances.slice(0, 3), [1_075_000_000n, 1_075_000_000n, 1_075_000_000n]);
  assert.equal(s.feeTotal, 75_000_000n);
});

test("a miss is capped at the remaining balance (D-3)", () => {
  const s = simulate({ stake: stakeUnits(1000), days: 3, members: 2, solo: false }, parseMarks(["km"]));
  const poor = { ...s, balances: [s.balances[0]!, 40_000_000n] };
  assert.equal(nextMissCost(poor, 1), 40_000_000n);
  const next = applyDay(poor, ["k", "m"]);
  assert.equal(next.dayResults[1]!.lost[1], 40_000_000n); // 100 due, 40 left
  assert.equal(next.balances[1], 0n);
  assert.equal(next.dayResults[1]!.won[0]! + next.dayResults[1]!.fee, 40_000_000n);
  // A group can't reach the cap by itself: eight misses (the most HP allows: the ninth breaks the Oath) leave 20% of the stake.
  const eight = simulate({ stake: stakeUnits(1000), days: 14, members: 2, solo: false }, parseMarks(Array(8).fill("km")));
  assert.equal(eight.broken, false);
  assert.equal(eight.balances[1], 200_000_000n);
  assert.equal(simulate({ stake: stakeUnits(1000), days: 14, members: 2, solo: false }, parseMarks(Array(9).fill("km"))).broken, true);
});

test("the owner's second example: two of four miss, each keeper and KEPT get 6.666666 / 6.666668 SKR over both forfeitures", () => {
  const s = simulate({ stake: stakeUnits(100), days: 3, members: 4, solo: false }, parseMarks(["kkmm"]));
  const d = s.dayResults[0]!;
  assert.deepEqual(d.lost, [0n, 0n, 10_000_000n, 10_000_000n]);
  // Per forfeiture: 10 SKR in 3 shares = 3.333333 each, the odd unit to KEPT; twice.
  assert.deepEqual(d.won, [6_666_666n, 6_666_666n, 0n, 0n]);
  assert.equal(d.fee, 6_666_668n);
  assert.deepEqual(s.balances, [106_666_666n, 106_666_666n, 90_000_000n, 90_000_000n]);
});

test("each forfeiture is split on its own: the rounding of every one ends up with KEPT", () => {
  // 0.00003 SKR stake: a miss is 3 units. One keeper + KEPT: 3 → 1 + 2 per forfeiture, so 2 and 4 over two (not 3 and 3).
  const s = simulate({ stake: 30n, days: 3, members: 3, solo: false }, parseMarks(["kmm"]));
  assert.deepEqual(s.dayResults[0]!.won, [2n, 0n, 0n]);
  assert.equal(s.dayResults[0]!.fee, 4n);
  assert.equal(s.balances.reduce((a, b) => a + b, 0n) + s.feeTotal, 90n);
});

test("everyone keeps every day: full stake back, no KEPT share, no entry fee in the model", () => {
  const s = simulate({ stake: stakeUnits(100), days: 3, members: 4, solo: false }, parseMarks(["kkkk", "kkkk", "kkkk"]));
  assert.deepEqual(s.balances, Array(4).fill(stakeUnits(100)));
  assert.equal(s.feeTotal + s.toTreasuryTotal, 0n);
});

test("splitLost: equal shares for the keepers and KEPT, rounded down, dust to KEPT", () => {
  assert.deepEqual(splitLost(10_000_000n, 3), { each: 2_500_000n, kept: 2_500_000n });
  assert.deepEqual(splitLost(200_000_000n, 2), { each: 66_666_666n, kept: 66_666_668n });
  assert.deepEqual(splitLost(100_000_000n, 0), { each: 0n, kept: 100_000_000n });
  assert.deepEqual(splitLost(0n, 3), { each: 0n, kept: 0n });
  assert.deepEqual(splitLost(1n, 3), { each: 0n, kept: 1n });
  for (const [lost, keepers] of [[999_999_999n, 3], [7n, 2], [1_000_000_007n, 6]] as const) {
    const r = splitLost(lost, keepers);
    assert.equal(r.each * BigInt(keepers) + r.kept, lost);
    assert.ok(r.kept >= r.each && r.kept - r.each <= BigInt(keepers));
  }
  assert.throws(() => splitLost(1n, -1), RangeError);
});

test("rounding: odd stakes lose nothing to dust, KEPT takes the leftover units", () => {
  const s = simulate({ stake: stakeUnits(1000) + 7n, days: 3, members: 3, solo: false }, parseMarks(["kkm"]));
  const d = s.dayResults[0]!;
  assert.equal(d.lostTotal, 100_000_000n);
  assert.deepEqual(d.won, [33_333_333n, 33_333_333n, 0n]);
  assert.equal(d.fee, 33_333_334n);
  assert.equal(s.balances.reduce((a, b) => a + b, 0n) + s.feeTotal, 3n * (stakeUnits(1000) + 7n));
});

test("HP: −20 per missed member, +10 heal, capped at 100; −35 solo", () => {
  let s = initialState({ stake: stakeUnits(1000), days: 7, members: 4, solo: false });
  s = applyDay(s, ["k", "k", "k", "m"]);
  assert.equal(s.hp, 90); // rules.md §2 example: 100 − 20 → 80 → +10 → 90
  s = applyDay(s, ["k", "k", "k", "k"]);
  assert.equal(s.hp, 100);
  s = applyDay(s, ["k", "k", "k", "k"]);
  assert.equal(s.hp, 100);
  const solo = applyDay(initialState({ stake: stakeUnits(500), days: 3, members: 1, solo: true }), ["m"]);
  assert.equal(solo.hp, 75);
});

test("breaking day: no heal, no payout, no fee; half held, half to the treasury (amendment 2)", () => {
  const terms = { stake: stakeUnits(1000), days: 7, members: 4, solo: false } as const;
  const s = simulate(terms, parseMarks(["kmmm", "kmmm", "kkkk"]));
  assert.equal(s.broken, true);
  assert.equal(s.brokeOnDay, 1);
  assert.equal(s.dayResults.length, 2, "days after the break are not applied");
  const d = s.dayResults[1]!;
  assert.equal(d.fee, 0n);
  assert.deepEqual(d.won, [0n, 0n, 0n, 0n]);
  assert.equal(d.hpAfter, 0);
  const before = simulate(terms, parseMarks(["kmmm"])).balances;
  assert.deepEqual(s.held, before.map((x) => x / 2n));
  assert.deepEqual(s.balances, [0n, 0n, 0n, 0n]);
  assert.equal(nextMissBreaks(simulate(terms, parseMarks(["kmmm"]))), false);
});

test("solo: losses go to the treasury; breaks on the 4th straight miss", () => {
  const some = simulate({ stake: stakeUnits(1000), days: 7, members: 1, solo: true }, parseMarks(["k", "m", "k", "k", "m", "k", "k"]));
  assert.equal(some.feeTotal, 0n);
  assert.equal(some.toTreasuryTotal, 2n * missCost(stakeUnits(1000)));
  const broke = simulate({ stake: stakeUnits(1000), days: 7, members: 1, solo: true }, parseMarks(["m", "m", "m", "m"]));
  assert.deepEqual(broke.dayResults.map((d) => d.hpAfter), [75, 50, 25, 0]);
  assert.equal(broke.brokeOnDay, 3);
});

test("nobody keeps: all the day's losses go to KEPT (owner-confirmed, D-91)", () => {
  const s = simulate({ stake: stakeUnits(500), days: 3, members: 2, solo: false }, parseMarks(["mm"]));
  assert.equal(s.feeTotal, 0n);
  assert.equal(s.toTreasuryTotal, 2n * missCost(stakeUnits(500)));
  assert.deepEqual(s.balances, [stakeUnits(500) - 50_000_000n, stakeUnits(500) - 50_000_000n]);
});

test("conservation: balances + fee + treasury + held = total staked, in every scenario", () => {
  for (const sc of SCENARIOS) {
    const s = simulate(sc.terms, parseMarks(sc.marks));
    const total = s.balances.reduce((a, b) => a + b, 0n) + s.feeTotal + s.toTreasuryTotal + s.held.reduce((a, b) => a + b, 0n);
    assert.equal(total, sc.terms.stake * BigInt(sc.terms.members), sc.name);
  }
});

test("test vectors on disk match the engine (regenerate with `pnpm --filter @kept/engine vectors`)", () => {
  const file = JSON.parse(readFileSync(new URL("../test-vectors/oath-vectors.json", import.meta.url), "utf8"));
  assert.deepEqual(file.vectors, SCENARIOS.map(vectorOf));
});

test("live-view helpers: next miss cost, preview, bitmasks", () => {
  const s = simulate({ stake: stakeUnits(1000), days: 3, members: 4, solo: false }, parseMarks(["kmkm"]));
  assert.equal(nextMissCost(s, 3), 100_000_000n);
  const p = previewMiss(s, 3);
  assert.equal(p.lostTotal, 100_000_000n);
  assert.equal(p.won[3], 0n);
  assert.deepEqual(p.won.slice(0, 3), [25_000_000n, 25_000_000n, 25_000_000n]);
  assert.equal(p.fee, 25_000_000n);
  assert.deepEqual(marksFromBitmasks([0b101, 0b110], 3), [["k", "m"], ["m", "k"], ["k", "k"]]);
});

test("Rematch recovery and Bounty money", () => {
  assert.equal(rematchRecovery(250n, true, false), 250n);
  assert.equal(rematchRecovery(250n, false, false), 0n);
  assert.equal(rematchRecovery(250n, true, true), 0n);
  assert.deepEqual(bountyFunding(stakeUnits(50_000)), { pool: stakeUnits(50_000), fee: stakeUnits(5_000), total: stakeUnits(55_000) });
  assert.deepEqual(bountySplit(100n, 3), { each: 33n, dust: 1n, returnedToCreator: 0n });
  assert.deepEqual(bountySplit(100n, 0), { each: 0n, dust: 0n, returnedToCreator: 100n });
});

test("kept rate: New under 10 days, recency-weighted after", () => {
  assert.equal(keptRate(Array.from({ length: 9 }, (_, i) => ({ ageDays: i, kept: true }))).isNew, true);
  const good = keptRate(Array.from({ length: 64 }, (_, i) => ({ ageDays: i, kept: i % 12 !== 0 })));
  assert.equal(good.days, 64);
  assert.ok(keptRatePercent(good)! >= 85 && keptRatePercent(good)! <= 95);
  const recentMisses = keptRate(Array.from({ length: 30 }, (_, i) => ({ ageDays: i, kept: i > 3 })));
  const oldMisses = keptRate(Array.from({ length: 30 }, (_, i) => ({ ageDays: i, kept: i < 26 })));
  assert.ok(recentMisses.rate! < oldMisses.rate!, "recent days count more");
});

test("odds: 1-to-n when likely to keep, n-to-1 to miss when not", () => {
  assert.deepEqual(odds(0.9, "none", false), { kind: "keep", against: 9 });
  assert.deepEqual(odds(0.4, "none", true), { kind: "miss", for: 3 });
  assert.deepEqual(odds(0.9, "kept", false), { kind: "none" });
  assert.deepEqual(odds(0.9, "review", false), { kind: "review" });
});

test("day boundaries: day 1 at the first midnight after Start, in the creator's time zone", () => {
  const ist = 330; // UTC+5:30
  const midnightUtc = 10 * DAY_SECONDS - ist * 60; // local midnight starting local day 10
  assert.equal(localDay(midnightUtc - 1, ist), 9);
  assert.equal(localDay(midnightUtc, ist), 10);
  const start = midnightUtc - 3 * 3600; // pressed Start at 21:00 local
  assert.equal(nextMidnight(start, ist), midnightUtc);
  assert.deepEqual(dayPhase(midnightUtc, 3, start), { phase: "waiting", startsAt: midnightUtc, secondsToStart: 3 * 3600 });
  const p = dayPhase(midnightUtc, 3, midnightUtc + DAY_SECONDS + 23 * 3600);
  assert.equal(p.phase, "day");
  if (p.phase === "day") {
    assert.equal(p.dayIndex, 1);
    assert.equal(p.secondsToReset, 3600);
    assert.equal(p.deadlineClose, true);
  }
  assert.equal(dayPhase(midnightUtc, 3, midnightUtc + 3 * DAY_SECONDS).phase, "over");
  assert.equal(nextMidnight(0, -300), 5 * 3600); // UTC−5: local midnight is 05:00 UTC
  // Debug program builds use 120 s days; the deadline warning scales (2 h of 24 h → 10 s of 120 s).
  const short = dayPhase(1000, 3, 1000 + 120 + 115, 120);
  assert.equal(short.phase, "day");
  if (short.phase === "day") {
    assert.equal(short.dayIndex, 1);
    assert.equal(short.secondsToReset, 5);
    assert.equal(short.deadlineClose, true);
  }
  assert.equal(dayPhase(1000, 3, 1000 + 360, 120).phase, "over");
});

test("HP display helpers and generated names", () => {
  assert.deepEqual([100, 41, 40, 21, 20, 1, 0].map(hpTone), ["full", "full", "warn", "warn", "danger", "danger", "danger"]);
  assert.deepEqual([100, 90, 70, 1, 0].map(hpFilledSegments), [20, 18, 14, 1, 0]);
  assert.equal(hpLostSegments(80, 20), 4);
  assert.deepEqual(oathNameParts(0, 7), { word: "iron", length: "week" });
  assert.deepEqual(oathNameParts(1, 14), { word: "page", length: 14 });
});
