import { SKR_UNIT } from "@kept/config";
import { oathView } from "@/features/oaths/model";
import type { MemberFacts, OathFacts } from "@/features/oaths/model";

const DAY = 86_400;
const W = ["A111111111111111111111111111111111111111111", "B111111111111111111111111111111111111111111", "C111111111111111111111111111111111111111111", "D111111111111111111111111111111111111111111"];
const member = (wallet: string, daysKept: number, extra: Partial<MemberFacts> = {}): MemberFacts => ({
  wallet, name: null, avatar: null, keptRate: 0.9, rateDays: 20, daysKept, proofToday: "none", claimed: false, payout: null, ...extra,
});
const oath = (o: Partial<OathFacts> = {}): OathFacts => ({
  id: "o", source: "mock", oathId: null, creator: W[0]!, name: "Iron 3", goal: "lift", objectId: 0, numDays: 3, stake: 1000n * SKR_UNIT,
  isSolo: false, reviewMode: "ai", status: "active", day1StartsAt: 0, daySeconds: DAY,
  members: [member(W[0]!, 0b111), member(W[1]!, 0b110), member(W[2]!, 0b111), member(W[3]!, 0b010)],
  inviteCode: null, createdAt: 0, ...o,
});

describe("oathView", () => {
  it("reproduces the D-93 worked example (engine test vectors) once all 3 days are over", () => {
    const v = oathView(oath(), 3 * DAY + 10, W[0]!);
    expect(v.life).toBe("over");
    expect(v.results.map((r) => r.final)).toEqual([1_091_666_666n, 925_000_000n, 1_091_666_666n, 800_000_000n]);
    expect(v.state.feeTotal).toBe(91_666_668n);
  });

  it("mid-Oath: day number, grid cells, today's pending members and the miss preview", () => {
    const f = oath();
    f.members[1] = { ...f.members[1]!, daysKept: 0, proofToday: "partial" }; // B hasn't kept day 2 yet
    const v = oathView(f, DAY + 3600, W[0]!); // day 2 (index 1), 1 h in
    expect(v.dayNumber).toBe(2);
    expect(v.members.map((m) => m.cells)).toEqual(["kkf", "mhf", "kkf", "mkf"]);
    expect(v.hp).toBe(70); // day 1: B and D missed → −40, +10
    expect(v.members[0]!.pendingToday).toBe(false);
    expect(v.preview?.member).toBe(1);
    expect(v.myMissCost).toBe(100_000_000n); // 10% of 1,000 SKR, whatever the length (D-93)
    // If B misses today, A / C / D (the keepers) and KEPT split B's 100.
    expect(v.preview?.result.fee).toBe(25_000_000n);
  });

  it("an Open Oath has no day yet; a waiting one counts down to its first midnight", () => {
    expect(oathView(oath({ status: "open", day1StartsAt: null }), 0, W[0]!).life).toBe("open");
    const w = oathView(oath({ day1StartsAt: 5000 }), 1000, W[0]!);
    expect(w.life).toBe("waiting");
    expect(w.secondsToStart).toBe(4000);
  });

  it("shows the chain's payout for a settled chain Oath (D-14), not the engine estimate", () => {
    const f = oath({ source: "chain", status: "settled" });
    f.members = f.members.map((m, i) => ({ ...m, payout: [1_333_333_333n, 0n, 1_333_333_333n, 0n][i]! }));
    const v = oathView(f, 4 * DAY, W[1]!);
    expect(v.results[1]).toMatchObject({ final: 0n, lost: 1_000_000_000n });
    expect(v.claimable).toBe(0n);
    expect(oathView(f, 4 * DAY, W[0]!).claimable).toBe(1_333_333_333n);
  });

  it("a chain Oath that hasn't settled never shows the engine's projection as money: in play = the stake, estimated", () => {
    const f = oath({ source: "chain", status: "active" });
    const v = oathView(f, 3 * DAY + 10, W[0]!);
    expect(v.estimated).toBe(true);
    expect(v.members[0]!.balance).toBe(1_091_666_666n); // the projection (D-93), for D2's "estimate" row
    expect(v.members.map((m) => m.inPlay)).toEqual(Array(4).fill(1000n * SKR_UNIT));
    expect(v.claimable).toBe(0n);
    const demo = oathView(oath(), 3 * DAY + 10, W[0]!);
    expect(demo.estimated).toBe(false);
    expect(demo.members[0]!.inPlay).toBe(1_091_666_666n);
    // Once the chain has settled, the payout is what counts and nothing is an estimate.
    expect(oathView(oath({ source: "chain", status: "settled" }), 4 * DAY, W[0]!).estimated).toBe(false);
  });

  it("a cancelled Oath refunds the stake", () => {
    const v = oathView(oath({ status: "cancelled", day1StartsAt: null }), 0, W[2]!);
    expect(v.life).toBe("cancelled");
    expect(v.claimable).toBe(1000n * SKR_UNIT);
  });

  it("breaks at 0 HP and marks the breaking day", () => {
    const f = oath({ numDays: 7, isSolo: true, members: [member(W[0]!, 0b0000000)] });
    const v = oathView(f, 4 * DAY + 5, W[0]!); // solo misses: 100 → 75 → 50 → 25 → break
    expect(v.life).toBe("broken");
    expect(v.members[0]!.cells).toBe("mmmxfff");
  });
});
