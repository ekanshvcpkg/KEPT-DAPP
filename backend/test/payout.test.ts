import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { calculatePayouts, calculatePayoutsV2, effectiveDays, feeForStake, fullDaysMask, settleAt, slashAmount } from "../src/shared/payout.js";

const FEE = 1_000; // 10%, the fee initialize_config is set up with
const pot = (stake: bigint, members: number) => stake * BigInt(members);
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

function assertBalanced(stake: bigint, successes: boolean[], feeBps = FEE) {
  const r = calculatePayouts(stake, feeBps, successes);
  assert.ok(r);
  assert.equal(sum(r.payouts) + r.fee + r.dust, pot(stake, successes.length), "payouts + fee + dust = pot");
  return r;
}

// Same vectors as `payout_tests` in lib.rs.
test("all kept: everyone gets 100% back, no fee", () => {
  const r = assertBalanced(1_250n, [true, true, true, true]);
  assert.deepEqual(r, { payouts: [1_250n, 1_250n, 1_250n, 1_250n], fee: 0n, dust: 0n });
});

test("some missed: fee is 10% of missed stakes, keepers split the other 90%", () => {
  assert.deepEqual(assertBalanced(1_250n, [true, true, true, false]), { payouts: [1_625n, 1_625n, 1_625n, 0n], fee: 125n, dust: 0n });
  assert.deepEqual(assertBalanced(1_250n, [true, true, false, false]), { payouts: [2_375n, 2_375n, 0n, 0n], fee: 250n, dust: 0n });
});

test("some missed with an uneven split: the remainder is dust for the treasury", () => {
  assert.deepEqual(assertBalanced(1_001n, [true, true, true, false]), { payouts: [1_301n, 1_301n, 1_301n, 0n], fee: 100n, dust: 1n });
});

test("all missed: each member gets 90% back", () => {
  assert.deepEqual(assertBalanced(1_250n, [false, false, false, false]), { payouts: [1_125n, 1_125n, 1_125n, 1_125n], fee: 500n, dust: 0n });
});

test("solo / zero stake pays nothing and charges nothing", () => {
  assert.deepEqual(calculatePayouts(0n, FEE, [false]), { payouts: [0n], fee: 0n, dust: 0n });
  assert.deepEqual(calculatePayouts(0n, FEE, [true]), { payouts: [0n], fee: 0n, dust: 0n });
});

test("payouts + fee + dust = pot for every group size, outcome and app stake", () => {
  for (const stake of [1n, 7n, 999n, 500_000_000n, 1_000_000_000n, 2_500_000_000n]) {
    for (let n = 1; n <= 4; n++) {
      for (let mask = 0; mask < 1 << n; mask++) {
        const successes = Array.from({ length: n }, (_, i) => (mask & (1 << i)) !== 0);
        const r = assertBalanced(stake, successes);
        const kept = successes.filter(Boolean).length;
        if (kept === n) assert.equal(r.fee, 0n);
        else if (kept === 0) assert.equal(r.fee, (stake * 1_000n / 10_000n) * BigInt(n));
        else assert.equal(r.fee, (stake * BigInt(n - kept) * 1_000n) / 10_000n);
        assert.ok(r.dust < BigInt(Math.max(kept, 1)), "dust is only the division remainder");
      }
    }
  }
});

test("invalid input matches the program returning None", () => {
  assert.equal(calculatePayouts(100n, 10_001, [true]), null);
  assert.equal(calculatePayouts(100n, FEE, []), null);
  assert.equal(calculatePayouts((1n << 64n) - 1n, FEE, [true, false, false]), null, "lost stake overflows u64");
  assert.equal(calculatePayouts(1n << 64n, FEE, [true]), null, "stake above u64");
});

test("a member succeeds only by keeping every day (settle_oath's full mask)", () => {
  assert.equal(fullDaysMask(3), 0b111);
  assert.equal(fullDaysMask(7), 0x7f);
  assert.equal(fullDaysMask(14), 0x3fff);
  assert.equal(fullDaysMask(16), 0xffff);
});

// ---- Rules v2: same vectors as `economics::tests` in economics.rs ----
const settleV2 = (stake: bigint, successes: boolean[], fees: bigint, freeze: bigint) => {
  const r = calculatePayoutsV2(stake, successes, fees, freeze);
  assert.ok(r);
  assert.equal(sum(r.payouts) + r.toTreasury + r.carryover, stake * BigInt(successes.length) + fees + freeze, "conservation");
  return [r.payouts, r.toTreasury, r.carryover, r.dust];
};

test("v2 fee is 15% of the stake, charged on top and rounded down", () => {
  assert.equal(feeForStake(1_000n, 1_500), 150n);
  assert.equal(feeForStake(1_250n, 1_500), 187n);
  assert.equal(feeForStake(1n, 1_500), 0n);
  assert.equal(feeForStake(500_000_000n, 1_500), 75_000_000n, "500 SKR at 6 decimals");
  assert.equal(feeForStake((1n << 64n) - 1n, 10_000), (1n << 64n) - 1n);
  assert.equal(feeForStake(1_000n, 10_001), null);
});

test("v2 all succeed: full stake back, treasury gets only the fees", () => {
  assert.deepEqual(settleV2(1_000n, [true, true, true, true], 600n, 0n), [[1_000n, 1_000n, 1_000n, 1_000n], 600n, 0n, 0n]);
});

test("v2 one unsuccessful member: 50% back, the other 50% split among successful members; remainder is dust", () => {
  assert.deepEqual(settleV2(1_000n, [true, true, true, false], 600n, 0n), [[1_166n, 1_166n, 1_166n, 500n], 602n, 0n, 2n]);
  assert.deepEqual(settleV2(1_000n, [true, true, false, false], 600n, 0n), [[1_500n, 1_500n, 500n, 500n], 600n, 0n, 0n]);
});

test("v2 no successful member: slashed half goes to carryover, not treasury", () => {
  assert.deepEqual(settleV2(1_000n, [false, false, false, false], 600n, 0n), [[500n, 500n, 500n, 500n], 600n, 2_000n, 0n]);
});

test("v2 odd stakes round the slash in the member's favour; freeze proceeds go to treasury", () => {
  assert.deepEqual(settleV2(1_001n, [true, false], 300n, 0n), [[1_501n, 501n], 300n, 0n, 0n]);
  assert.deepEqual(settleV2(1_000n, [true, false], 300n, 50n), [[1_500n, 500n], 350n, 0n, 0n]);
  assert.deepEqual(settleV2(0n, [false], 0n, 50n), [[0n], 50n, 0n, 0n], "zero-stake solo");
});

test("v2 overflow and empty input match the program returning None", () => {
  assert.equal(calculatePayoutsV2((1n << 64n) - 1n, [true, false], 0n, 0n), null);
  assert.equal(calculatePayoutsV2(1n, [true], (1n << 64n) - 1n, 1n), null);
  assert.equal(calculatePayoutsV2(1n, [], 0n, 0n), null);
});

test("v2 conservation, one slash per unsuccessful member, and carryover only with no winner, for every outcome", () => {
  for (const stake of [0n, 1n, 7n, 999n, 1_001n, 500_000_000n, 1_000_000_000n, 2_500_000_000n]) {
    const fee = feeForStake(stake, 1_500)!;
    for (let n = 1; n <= 4; n++) {
      for (let mask = 0; mask < 1 << n; mask++) {
        const successes = Array.from({ length: n }, (_, i) => (mask & (1 << i)) !== 0);
        for (const freeze of [0n, 3n, 1_000n]) {
          const r = calculatePayoutsV2(stake, successes, fee * BigInt(n), freeze)!;
          const keepers = BigInt(successes.filter(Boolean).length);
          assert.equal(sum(r.payouts) + r.toTreasury + r.carryover, stake * BigInt(n) + fee * BigInt(n) + freeze);
          assert.equal(r.slashed, slashAmount(stake) * (BigInt(n) - keepers));
          assert.ok(r.dust < (keepers > 0n ? keepers : 1n));
          assert.equal(r.carryover, keepers === 0n ? r.slashed : 0n);
          successes.forEach((won, i) => won ? assert.ok(r.payouts[i] >= stake) : assert.equal(r.payouts[i], stake - stake / 2n));
        }
      }
    }
  }
});

test("a freeze-covered day counts toward the full mask; v2 settles one Oath day after the end", () => {
  assert.equal(effectiveDays(0b101, 0b010), 0b111);
  assert.equal(effectiveDays(0b101, 0b010) === fullDaysMask(3), true);
  assert.equal(settleAt({ startTs: 1_000, numDays: 3, daySeconds: 100, rulesVersion: 1 }), 1_300);
  assert.equal(settleAt({ startTs: 1_000, numDays: 3, daySeconds: 100, rulesVersion: 2 }), 1_400);
});


// ---- Rules v3 (owner money model, D-91): the same numbers as the program and the app's engine ----
import { closedDayCount, missCostV3, replayV3 } from "../src/shared/payout.js";

test("v3: the owner's examples", () => {
  const SKR = 1_000_000n;
  assert.deepEqual(replayV3(100n * SKR, 1_000, false, [7, 7, 7, 0b110], 3), { payouts: [102_500_000n, 102_500_000n, 102_500_000n, 90_000_000n], toTreasury: 2_500_000n, held: 0n, brokeDay: null, hp: 100 });
  const two = replayV3(100n * SKR, 1_000, false, [7, 7, 0b110, 0b110], 3)!;
  assert.deepEqual(two.payouts, [106_666_666n, 106_666_666n, 90_000_000n, 90_000_000n]);
  assert.equal(two.toTreasury, 6_666_668n);
  assert.deepEqual(replayV3(100n * SKR, 1_000, false, [7, 7, 7, 7], 3)!.payouts, Array(4).fill(100n * SKR));
});

test("v3: each forfeiture rounds on its own, remainders go to KEPT, a day nobody kept goes to KEPT", () => {
  const r = replayV3(30n, 1_000, false, [7, 0b110, 0b110], 3)!;
  assert.deepEqual(r.payouts, [32n, 27n, 27n]); assert.equal(r.toTreasury, 4n);
  const none = replayV3(50_000_000n, 1_000, false, [0b110, 0b110], 3)!;
  assert.equal(none.toTreasury, 10_000_000n); assert.deepEqual(none.payouts, [45_000_000n, 45_000_000n]);
  assert.equal(missCostV3(1_001n, 1_000), 100n);
});

test("v3: a break holds half and sends half to the treasury; later days are not played", () => {
  const r = replayV3(1_000_000_000n, 1_000, false, [7, 0b100, 0b100, 0b100], 3)!;
  assert.equal(r.brokeDay, 1); assert.deepEqual(r.payouts, [0n, 0n, 0n, 0n]);
  assert.equal(r.held + r.toTreasury, 4_000_000_000n);
  assert.equal(replayV3(1_000n, 1_000, true, [0], 7)!.brokeDay, 3, "solo: 100 -> 65 -> 30 (+10) ... breaks on the fourth miss");
});

test("v3: replays only the closed days", () => {
  assert.equal(closedDayCount({ startTs: 1_000, daySeconds: 120, numDays: 3 }, 1_000 + 250), 2);
  assert.equal(closedDayCount({ startTs: 1_000, daySeconds: 120, numDays: 3 }, 99_999), 3);
  assert.equal(closedDayCount({ startTs: 0, daySeconds: 120, numDays: 3 }, 99_999), 0);
  assert.deepEqual(replayV3(100n, 1_000, false, [0, 7], 0)!.payouts, [100n, 100n]);
});

test("v3: every scenario in the shared engine vectors (what the app and the program also test against)", () => {
  const file = JSON.parse(readFileSync(new URL("../../packages/engine/test-vectors/oath-vectors.json", import.meta.url), "utf8"));
  assert.ok(file.vectors.length >= 14);
  for (const v of file.vectors) {
    const members = v.terms.members as number;
    const kept = Array.from({ length: members }, (_, i) => (v.marks as string[]).reduce((m, day, d) => (day[i] === "k" ? m | (1 << d) : m), 0));
    const r = replayV3(BigInt(v.terms.stake), v.terms.missBps, v.terms.solo, kept, v.terms.days)!;
    assert.deepEqual(r.payouts.map(String), v.expected.balances, v.name);
    assert.equal(r.toTreasury, BigInt(v.expected.fee) + BigInt(v.expected.toTreasury), v.name);
    assert.equal(r.held, v.expected.held.reduce((a: bigint, x: string) => a + BigInt(x), 0n), v.name);
    assert.equal(r.brokeDay, v.expected.brokeOnDay, v.name);
    assert.equal(r.hp, v.expected.hp, v.name);
  }
});

test("v3: every token is accounted for in every 3-member pattern", () => {
  for (const stake of [0n, 7n, 999n, 1_000_000_007n]) {
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      const r = replayV3(stake, 1_000, false, [7, a, b], 3)!;
      assert.equal(r.payouts.reduce((x, y) => x + y, 0n) + r.toTreasury + r.held, stake * 3n);
    }
  }
});
