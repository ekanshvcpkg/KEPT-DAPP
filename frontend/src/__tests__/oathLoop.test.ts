import { SKR_UNIT } from "@kept/config";
import { createMockApi } from "@/api";
import { clock } from "@/lib/clock";
import { MOCK_WALLET } from "@/api/mock/slices";
import { createMockTx } from "@/chain/mock";
import { mockOaths, PEOPLE } from "@/features/oaths/mockStore";
import { oathView } from "@/features/oaths/model";
import type { Scenario } from "@/api/mock/scenarios";

let scenario: Scenario = "fresh";
const api = createMockApi({ scenario: () => scenario, wallet: () => MOCK_WALLET, latencyMs: 0 });
const tx = createMockTx(() => scenario, () => MOCK_WALLET, 0);
const now = () => Math.floor(clock.now() / 1000);

beforeEach(() => { mockOaths.reset(); clock.reset(); scenario = "fresh"; });
afterAll(() => clock.reset());

describe("mock Oath loop", () => {
  it("create → join → start → prove the day → settle → claim", async () => {
    const { oath: id } = await tx.createOath({ objectId: 0, numDays: 3, stake: 1000n * SKR_UNIT, goalText: "lift", tzOffsetMinutes: 0, isSolo: false, reviewMode: "ai" });
    mockOaths.join(id, PEOPLE.riya.wallet);
    let o = await api.oaths.get(id);
    expect(oathView(o, now(), MOCK_WALLET).life).toBe("open");
    await tx.startOath(id);
    o = await api.oaths.get(id);
    expect(oathView(o, now(), MOCK_WALLET).life).toBe("waiting"); // day 1 starts at the next midnight (D-6)

    clock.endDay();
    o = await api.oaths.get(id);
    let v = oathView(o, now(), MOCK_WALLET);
    expect(v.life).toBe("active");
    expect(v.dayNumber).toBe(1);
    // One photo proves the day: a single-habit Oath is kept by its one habit's photo.
    const c1 = await api.proof.challenge(o, 0, 0);
    expect(c1).toMatchObject({ habit: 0, dayIndex: 0, object: "dumbbell" });
    await expect(api.proof.submit(o, c1, "img")).resolves.toEqual({ status: "pass", dayKept: true });
    expect(oathView(await api.oaths.get(id), now(), MOCK_WALLET).members[0]!.cells[0]).toBe("k");

    for (let d = 0; d < 3; d++) clock.endDay(); // Riya (reliable) keeps the rest; we miss days 2–3
    o = await api.oaths.get(id);
    v = oathView(o, now(), MOCK_WALLET);
    expect(o.status).toBe("settled");
    expect(v.claimable).toBeGreaterThan(0n);
    const { amount } = await tx.claim(id);
    expect(amount).toBe(v.claimable);
    expect(oathView(await api.oaths.get(id), now(), MOCK_WALLET).claimable).toBe(0n);
  });

  it("every habit has its own object and its own photo; the day is kept once all of them are in", async () => {
    const { oath: id } = await tx.createOath({ objectId: 0, numDays: 3, stake: 1000n * SKR_UNIT, goalText: "lift · read", habits: ["lift", "read"], habitObjects: ["dumbbell", "kettlebell"], tzOffsetMinutes: 0, isSolo: true, reviewMode: "ai" });
    await tx.startOath(id);
    clock.endDay();
    let o = await api.oaths.get(id);
    expect(oathView(o, now(), MOCK_WALLET).habits.map((h) => [h.name, h.object, h.done])).toEqual([["lift", "dumbbell", false], ["read", "kettlebell", false]]);

    const first = await api.proof.challenge(o, 1, 0); // any order: the second habit first
    expect(first.object).toBe("kettlebell");
    await expect(api.proof.submit(o, first, "img")).resolves.toEqual({ status: "pass", dayKept: false });
    o = await api.oaths.get(id);
    let v = oathView(o, now(), MOCK_WALLET);
    expect(v.members[0]!.cells[0]).toBe("h"); // partly proven
    expect(v.members[0]!.facts.proofToday).toBe("partial");
    expect(v.habits.map((h) => h.done)).toEqual([false, true]);

    const second = await api.proof.challenge(o, 0, 0, first.gesture);
    expect(second.object).toBe("dumbbell");
    await expect(api.proof.submit(o, second, "img")).resolves.toEqual({ status: "pass", dayKept: true });
    v = oathView(await api.oaths.get(id), now(), MOCK_WALLET);
    expect(v.members[0]!.cells[0]).toBe("k");
    expect(v.habits.every((h) => h.done)).toBe(true);
  });

  it("scenarios seed the prototype's Today", async () => {
    scenario = "activeGroup";
    const list = await api.oaths.list(MOCK_WALLET);
    const views = list.map((f) => oathView(f, now(), MOCK_WALLET));
    const iron = views.find((v) => v.life === "active" && !v.facts.isSolo)!;
    expect(iron.dayNumber).toBe(3);
    expect(iron.members.map((m) => m.cells.slice(0, 3))).toEqual(["kkh", "kkk", "kmp", "kkr"]);
    expect(views.some((v) => v.life === "open")).toBe(true);
    expect(views.some((v) => v.claimable > 0n)).toBe(true);
    scenario = "lowHp";
    const low = (await api.oaths.list(MOCK_WALLET)).map((f) => oathView(f, now(), MOCK_WALLET));
    expect(low[0]!.hp).toBe(20);
  });

  it("forced failures come from the scenario", async () => {
    scenario = "walletRejected";
    await expect(tx.startOath("x")).rejects.toMatchObject({ kind: "rejected" });
    scenario = "noSkr";
    await expect(tx.joinOath("x")).rejects.toMatchObject({ kind: "insufficientSkr" });
  });
});
