// Mock Bounties (no backend or program support yet: BACKEND_GAPS P1-10). Seeded from
// design/copy.json › sampleData.bounties plus the details the H screens show; times are relative to
// the virtual clock. A joined Bounty is a mock Oath with `bountyId` (features/oaths/mockStore.ts),
// so daily proof, the grid and claiming reuse the Oath flow.
import { SKR_UNIT } from "@kept/config";
import { bountySplit } from "@kept/engine";
import { clock } from "@/lib/clock";
import { proofTextOf } from "@/features/objects/proof";
import type { BountyFacts, BountyTask, Category } from "./model";

const H = 3600;
const DAY = 86_400;
const now = () => Math.floor(clock.now() / 1000);
const skr = (n: number) => BigInt(n) * SKR_UNIT;

const bounties = new Map<string, BountyFacts>();
let seeded = false;
let counter = 0;

const BRANDS: Record<string, { verified: boolean; palette: number; detail: string; link: string | null }> = {
  Drift: { verified: true, palette: 3, detail: "Two litres a day.\nSeven days. Don't blink.", link: "drift.water" },
  Northbound: { verified: true, palette: 3, detail: "Run 5k every day\nfor 14 days.", link: null },
  Lotus: { verified: true, palette: 1, detail: "Ten minutes on the mat.\nEvery day this month.", link: null },
  "@riffs": { verified: false, palette: 2, detail: "Strum daily.\nTwo weeks, no skipped days.", link: null },
  Inkwell: { verified: true, palette: 0, detail: "Read before your phone.\n14 mornings.", link: "dawnpages.xyz" },
  "Forge Gym": { verified: true, palette: 3, detail: "Lift every day in October.", link: null },
  "Sprout Co": { verified: false, palette: 0, detail: "Water and photograph\nyour plant daily.", link: null },
  SkipLab: { verified: true, palette: 4, detail: "1,000 skips a day.", link: null },
};
const OBJECT: Record<Category, number> = { Fitness: 0, Reading: 1, Hydration: 2, Music: 3, Mind: 7, Outdoors: 5 };

/** A task proven with a catalog entry (features/objects): the photo is checked for that entry's proof text. */
const task = (name: string, entry: string): BountyTask => ({ name, object: proofTextOf(entry) ?? entry });
/** Each sponsor's daily tasks (D-99): one to five, each with its own proof object. */
const TASKS: Record<string, BountyTask[]> = {
  "Hydrate Week": [task("Drink 2 litres of water", "water_bottle"), task("Eat a piece of fruit", "fruit")],
  "Northbound Run Club": [task("Run 5 km", "running_shoe"), task("Stretch for 10 minutes", "yoga_mat"), task("Refill after the run", "water_bottle")],
  "Mat Month": [task("10 minutes on the mat", "yoga_mat"), task("Meditate for 5 minutes", "meditation_cushion")],
  "Sol Strings": [task("Practise for 20 minutes", "guitar")],
  "Dawn Pages": [task("Read 20 pages before your phone", "book"), task("Write one line in your journal", "journal")],
  "Iron October": [
    task("Check in at the gym", "gym"), task("Chest day: bench press", "barbell"), task("Push-ups to finish", "push_ups"),
    task("Lift for 20 minutes", "dumbbell"), task("Protein shake after", "shaker_bottle"),
  ],
  "Green Thumb": [task("Water your plant", "plant")],
  "Rope 1k": [task("1,000 skips", "skipping_rope"), task("Rehydrate", "water_bottle")],
};

function add(b: Omit<BountyFacts, "id">): BountyFacts {
  const full = { ...b, id: `mock-bounty-${++counter}` };
  bounties.set(full.id, full);
  return full;
}

/** The prototype's eight Bounties, joins closing at the times H1 shows. */
export function seedBounties() {
  bounties.clear();
  counter = 0;
  seeded = true;
  const t = now();
  const closesIn: Record<string, number> = {
    "Hydrate Week": 5 * H, "Northbound Run Club": 2 * DAY, "Mat Month": DAY, "Sol Strings": 9 * H, "Dawn Pages": 20 * H,
    "Iron October": 3 * DAY, "Green Thumb": 12 * H, "Rope 1k": 3 * H,
  };
  const rules: Record<string, number | null> = { "Northbound Run Club": 0.8, "Rope 1k": 0.95, "Hydrate Week": 0.7, "Iron October": 0.6 };
  for (const s of [
    { name: "Hydrate Week", by: "Drift", pool: 50000, entrants: 40, category: "Hydration" as Category },
    { name: "Northbound Run Club", by: "Northbound", pool: 120000, entrants: 212, category: "Fitness" as Category },
    { name: "Mat Month", by: "Lotus", pool: 30000, entrants: 88, category: "Mind" as Category },
    { name: "Sol Strings", by: "@riffs", pool: 8000, entrants: 58, category: "Music" as Category },
    { name: "Dawn Pages", by: "Inkwell", pool: 20000, entrants: 58, category: "Reading" as Category },
    { name: "Iron October", by: "Forge Gym", pool: 75000, entrants: 340, category: "Fitness" as Category },
    { name: "Green Thumb", by: "Sprout Co", pool: 12000, entrants: 31, category: "Outdoors" as Category },
    { name: "Rope 1k", by: "SkipLab", pool: 15000, entrants: 120, category: "Fitness" as Category },
  ]) {
    const brand = BRANDS[s.by]!;
    const closes = t + closesIn[s.name]!;
    add({
      name: s.name, brand: { name: s.by, verified: brand.verified, logo: s.by.replace("@", "").slice(0, 1).toUpperCase(), palette: brand.palette },
      message: `${s.name}\n${s.pool.toLocaleString("en-US")} SKR · ${s.category === "Reading" ? 14 : 7} days · free`, detail: brand.detail, link: brand.link,
      objectId: OBJECT[s.category], tasks: TASKS[s.name]!, numDays: s.category === "Reading" || s.category === "Fitness" && s.pool > 100000 ? 14 : 7,
      pool: skr(s.pool), joinClosesAt: closes, startsAt: closes, entrants: s.entrants, remaining: s.entrants, category: s.category,
      minKeptRate: rules[s.name] ?? null, tokenHeld: null, createdBy: null, featured: s.name === "Hydrate Week",
      recentlyOut: [], stillInByDay: [], finishersOptIn: [],
    });
  }
}

const ensure = () => { if (!seeded) seedBounties(); };
const byName = (name: string) => { ensure(); return [...bounties.values()].find((b) => b.name === name); };

export const mockBounties = {
  reset() { bounties.clear(); seeded = false; counter = 0; },
  ensure,
  list(): BountyFacts[] { ensure(); return [...bounties.values()]; },
  get(id: string): BountyFacts | null { ensure(); return bounties.get(id) ?? null; },
  byName,
  /** Puts a Bounty in progress: day `dayIndex` with `left` entrants still in (scenario seeds). */
  running(name: string, dayIndex: number, secondsLeft: number, left: number, out: { name: string; day: number; hoursAgo: number }[] = []) {
    const b = byName(name)!;
    b.startsAt = now() + secondsLeft - (dayIndex + 1) * DAY;
    b.joinClosesAt = b.startsAt;
    b.remaining = left;
    b.recentlyOut = out.map((o) => ({ name: o.name, day: o.day, at: now() - o.hoursAgo * H }));
    b.stillInByDay = Array.from({ length: dayIndex }, (_, d) => Math.round(b.entrants - ((b.entrants - left) * (d + 1)) / Math.max(1, dayIndex)));
    return b;
  },
  /** Ended `daysAgo` with `survivors`. */
  ended(name: string, survivors: number, daysAgo: number) {
    const b = byName(name)!;
    b.startsAt = now() - (b.numDays + daysAgo) * DAY;
    b.joinClosesAt = b.startsAt;
    b.remaining = survivors;
    return b;
  },
  /** Equal share of the pool for each survivor; dust stays with KEPT (D-19). */
  share(id: string): bigint {
    const b = bounties.get(id);
    if (!b || b.remaining <= 0) return 0n;
    return bountySplit(b.pool, b.remaining).each;
  },
  join(id: string) { const b = bounties.get(id); if (b) { b.entrants += 1; b.remaining += 1; } },
  eliminate(id: string) { const b = bounties.get(id); if (b && b.remaining > 0) b.remaining -= 1; },
  create(d: { wallet: string; name: string; objectId: number; tasks: BountyTask[]; numDays: number; pool: bigint; joinWindowHours: number | null; message: string; link: string | null; minKeptRate: number | null; tokenHeld: { symbol: string; amount: number } | null }): BountyFacts {
    ensure();
    const t = now();
    const closes = t + (d.joinWindowHours ?? 24) * H;
    return add({
      name: d.name, brand: { name: "You", verified: false, logo: "Y", palette: 0 }, message: `${d.name}\n${d.message}`, detail: d.message, link: d.link,
      objectId: d.objectId, tasks: d.tasks.map((x) => ({ ...x })), numDays: d.numDays, pool: d.pool, joinClosesAt: closes, startsAt: closes, entrants: 0, remaining: 0,
      category: (Object.keys(OBJECT) as Category[]).find((c) => OBJECT[c] === d.objectId) ?? "Fitness", minKeptRate: d.minKeptRate, tokenHeld: d.tokenHeld,
      createdBy: d.wallet, featured: false, recentlyOut: [], stillInByDay: [], finishersOptIn: [],
    });
  },
  /** The user's created Bounty in the prototype: Dawn Pages, day 4 of 14 (H1·c, H6). */
  seedCreated(wallet: string) {
    const b = byName("Dawn Pages")!;
    b.createdBy = wallet;
    b.brand = { ...b.brand, name: "You" };
    mockBounties.running("Dawn Pages", 3, 10 * H, 41);
    b.finishersOptIn = ["@reads.sol", "@nomi"];
    return b;
  },
};
