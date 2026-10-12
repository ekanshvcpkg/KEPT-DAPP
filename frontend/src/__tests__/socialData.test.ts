import { SKR_UNIT } from "@kept/config";
import { createMockApi } from "@/api";
import { clock } from "@/lib/clock";
import { MOCK_WALLET } from "@/api/mock/slices";
import type { Scenario } from "@/api/mock/scenarios";
import { mockOaths, PEOPLE } from "@/features/oaths/mockStore";
import { mockReviews } from "@/features/reviews/mockStore";
import { oathView } from "@/features/oaths/model";

let scenario: Scenario = "broken";
const api = createMockApi({ scenario: () => scenario, wallet: () => MOCK_WALLET, latencyMs: 0 });
const now = () => Math.floor(clock.now() / 1000);

beforeEach(() => { mockOaths.reset(); mockReviews.reset(); clock.reset(); });
afterAll(() => clock.reset());

describe("Rematch (mock)", () => {
  it("holds half of each balance at the break and pays it back to members who keep every day", async () => {
    scenario = "broken";
    const [guitar] = await api.oaths.list(MOCK_WALLET);
    const v = oathView(guitar!, now(), MOCK_WALLET);
    expect(v.life).toBe("broken");
    const held = v.state.held[v.me]!;
    expect(held).toBeGreaterThan(0n);
    const offer = await api.rematch.offer(guitar!.id);
    expect(offer.rematch?.members).toHaveLength(2); // Riya and Dev already in
    const r = await api.rematch.join(guitar!.id, MOCK_WALLET);
    expect(r.recovery?.[MOCK_WALLET]).toBe(held);
    mockOaths.start(r.id);
    for (let d = 0; d <= r.numDays; d++) {
      clock.endDay();
      const cur = mockOaths.get(r.id)!;
      if (cur.status === "active") mockOaths.prove(r.id, MOCK_WALLET, "kept");
    }
    const done = oathView(mockOaths.get(r.id)!, now(), MOCK_WALLET);
    expect(done.facts.status).toBe("settled");
    expect(done.claimable).toBe(done.state.balances[done.me]! + held);
  });
});

describe("Bounties (mock)", () => {
  it("joins free, eliminates on a missed day, and pays survivors an equal share", async () => {
    scenario = "fresh";
    const list = await api.bounties.list();
    expect(list).toHaveLength(8);
    const hydrate = list.find((b) => b.name === "Hydrate Week")!;
    const entrants = hydrate.entrants;
    const mine = await api.bounties.join(hydrate.id, MOCK_WALLET);
    expect(mine.bountyId).toBe(hydrate.id);
    expect((await api.bounties.get(hydrate.id)).entrants).toBe(entrants + 1);
    clock.set((hydrate.startsAt + 3600) * 1000); // day 1
    mockOaths.prove(mine.id, MOCK_WALLET, "kept");
    clock.set((hydrate.startsAt + 86_400 + 3600) * 1000); // day 2: nothing proved
    clock.set((hydrate.startsAt + 2 * 86_400 + 3600) * 1000); // day 3: day 2 was missed → out
    await api.bounties.mine(hydrate.id, MOCK_WALLET);
    expect((await api.bounties.get(hydrate.id)).remaining).toBe(entrants);
  });
  it("a sponsor's Bounty has several tasks; joining makes one habit per task, and the day is kept only when every task is proven (D-99)", async () => {
    scenario = "fresh";
    const iron = (await api.bounties.list()).find((b) => b.name === "Iron October")!;
    expect(iron.tasks.map((x) => x.name)).toEqual(["Check in at the gym", "Chest day: bench press", "Push-ups to finish", "Lift for 20 minutes", "Protein shake after"]);
    expect(iron.tasks.map((x) => x.object)).toEqual(["gym workout", "barbell", "push-ups and planks", "dumbbell", "protein shaker"]);
    const mine = await api.bounties.join(iron.id, MOCK_WALLET);
    expect(mine.habits).toEqual(iron.tasks.map((x) => x.name));
    expect(mine.habitObjects).toEqual(iron.tasks.map((x) => x.object));
    clock.set((iron.startsAt + 3600) * 1000); // day 1
    for (const habit of [0, 1, 2, 3]) expect(mockOaths.proveHabit(mine.id, MOCK_WALLET, habit)).toBe(false);
    const partial = oathView(mockOaths.get(mine.id)!, now(), MOCK_WALLET);
    expect(partial.habits.filter((h) => h.done)).toHaveLength(4);
    expect(partial.members[partial.me]!.pendingToday).toBe(true);
    expect(mockOaths.proveHabit(mine.id, MOCK_WALLET, 4)).toBe(true);
    expect(oathView(mockOaths.get(mine.id)!, now(), MOCK_WALLET).members[0]!.pendingToday).toBe(false);
  });
  it("a created Bounty keeps its tasks, and its entrants prove each one", async () => {
    scenario = "fresh";
    const b = await api.bounties.create({
      name: "Chest Week", objectId: 0, tasks: [{ name: "Bench press", object: "barbell" }, { name: "Drink water", object: "water bottle" }], numDays: 7,
      pool: 10_000n * SKR_UNIT, joinWindowHours: 24, message: "", link: null, minKeptRate: null, tokenHeld: null,
    }, MOCK_WALLET);
    expect(b.tasks).toHaveLength(2);
    const mine = await api.bounties.join(b.id, MOCK_WALLET);
    expect(mine.habits).toEqual(["Bench press", "Drink water"]);
    expect(mine.habitObjects).toEqual(["barbell", "water bottle"]);
  });
  it("a survivor's payout is the pool split by survivors", async () => {
    scenario = "bountyJoined";
    const list = await api.oaths.list(MOCK_WALLET);
    const sol = list.find((o) => o.name === "Sol Strings")!;
    const b = await api.bounties.get(sol.bountyId!);
    expect(oathView(sol, now(), MOCK_WALLET).claimable).toBe(b.pool / BigInt(b.remaining));
  });
});

describe("Group review (mock)", () => {
  it("my request is decided by the others' votes", async () => {
    scenario = "activeGroup";
    const iron = (await api.oaths.list(MOCK_WALLET)).find((o) => o.name === "Iron Week" && o.status === "active" && !o.bountyId)!;
    const r = await api.reviews.request(iron, MOCK_WALLET, 2, "open_palm");
    expect((await api.oaths.get(iron.id)).members[0]!.proofToday).toBe("review");
    clock.set(clock.now() + 30_000);
    expect((await api.reviews.get(r.id, MOCK_WALLET)).status).toBe("approved");
    expect(oathView(await api.oaths.get(iron.id), now(), MOCK_WALLET).members[0]!.cells[2]).toBe("k");
  });
  it("I can vote on someone else's review", async () => {
    scenario = "activeGroup";
    const iron = (await api.oaths.list(MOCK_WALLET)).find((o) => o.name === "Iron Week" && o.status === "active" && !o.bountyId)!;
    const [open] = await api.reviews.openFor(iron.id, MOCK_WALLET);
    expect(open?.by).toBe(PEOPLE.dev.wallet);
    await api.reviews.vote(open!.id, MOCK_WALLET, true);
    expect((await api.reviews.get(open!.id, MOCK_WALLET)).status).toBe("approved");
  });
});

describe("wallet (mock)", () => {
  it("faucet and swap add SKR", async () => {
    scenario = "fresh";
    const before = (await api.wallet.balances(MOCK_WALLET)).skr;
    await api.wallet.faucet();
    const out = await api.wallet.swap(500_000_000n);
    expect(out.skr).toBe(4950n * SKR_UNIT);
    expect((await api.wallet.balances(MOCK_WALLET)).skr).toBe(before + 5000n * SKR_UNIT + out.skr);
  });
});
