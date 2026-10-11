// The mock "chain + backend" for Oaths: in-memory, seeded per Dev scenario relative to the virtual
// clock, and mutated by the mock TxService and the mock proof API. Days roll forward on read (other
// members prove on their own), and an Oath settles with the engine's numbers once its last day ends.
import { SKR_UNIT, STAKES_SKR } from "@kept/config";
import { nextMidnight, simulate, marksFromBitmasks, settlement } from "@kept/engine";
import { clock } from "@/lib/clock";
import type { Scenario } from "@/api/mock/scenarios";
import type { MemberFacts, OathFacts, ProofToday, ReviewMode } from "./model";
import { oathName } from "./names";
import { mockBounties, seedBounties } from "../bounties/mockStore";
import type { BountyFacts } from "../bounties/model";

const DAY = 86_400;
const now = () => Math.floor(clock.now() / 1000);
const tz = () => -new Date(clock.now()).getTimezoneOffset();
const skr = (n: number) => BigInt(n) * SKR_UNIT;

/** The other people in the prototype, with their kept rates from copy.json (D2 › KEEPERS). */
export const PEOPLE = {
  riya: { wallet: "RiyaQ9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", name: "Riya", avatar: "61302120", keptRate: 0.94, rateDays: 71, reliable: true },
  arjun: { wallet: "ArjunZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9qm", name: "Arjun", avatar: "22413031", keptRate: 0.78, rateDays: 40, reliable: false },
  dev: { wallet: "DevQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9", name: "Dev", avatar: "70114253", keptRate: 0.88, rateDays: 52, reliable: true },
} as const;
type Person = keyof typeof PEOPLE;

interface MockMember extends MemberFacts { reliable: boolean; proofDay: number }
interface MockOath extends Omit<OathFacts, "members"> { members: MockMember[]; seeded: boolean; eliminated?: boolean }

const oaths = new Map<string, MockOath>();
let seededFor: string | null = null;
let counter = 0;

function me(wallet: string, extra: Partial<MockMember> = {}): MockMember {
  return { wallet, name: null, avatar: null, keptRate: 0.91, rateDays: 64, daysKept: 0, proofToday: "none", proofDay: -1, claimed: false, payout: null, reliable: false, ...extra };
}
function person(p: Person, daysKept: number, today: ProofToday = "none", day = -1): MockMember {
  const x = PEOPLE[p];
  return { wallet: x.wallet, name: x.name, avatar: x.avatar, keptRate: x.keptRate, rateDays: x.rateDays, daysKept, proofToday: today, proofDay: day, claimed: false, payout: null, reliable: x.reliable };
}

/** A day-1 start time that puts "now" `dayIndex` days in, with `secondsLeft` left in today. */
function startFor(dayIndex: number, secondsLeft: number): number {
  return now() + secondsLeft - (dayIndex + 1) * DAY;
}
const mask = (pattern: string) => [...pattern].reduce((m, c, d) => (c === "k" ? m | (1 << d) : m), 0);

function add(o: Omit<MockOath, "id" | "createdAt" | "source" | "inviteCode" | "daySeconds" | "oathId"> & Partial<Pick<MockOath, "inviteCode">>): MockOath {
  const id = `mock-oath-${++counter}`;
  const full: MockOath = { id, source: "mock", oathId: null, createdAt: now() - counter, daySeconds: DAY, inviteCode: o.inviteCode ?? `${o.name.split(" ")[0]!.toUpperCase()}-${(1000 + counter).toString(36).toUpperCase()}`, ...o };
  oaths.set(id, full);
  return full;
}

const group = (name: string, objectId: number, numDays: number, stakeSkr: number, wallet: string, members: MockMember[], extra: Partial<MockOath> = {}) =>
  add({ name, goal: null, objectId, numDays, stake: skr(stakeSkr), isSolo: false, reviewMode: "ai_group", status: "active", day1StartsAt: null, creator: PEOPLE.riya.wallet, members, seeded: true, ...extra });

/** Seeds the store for a scenario (docs/ARCHITECTURE.md §6). Keeps Oaths the user created. */
function seed(scenario: Scenario, wallet: string) {
  for (const [id, o] of oaths) if (o.seeded) oaths.delete(id);
  seededFor = `${scenario}:${wallet}`;
  seedBounties();
  const t = now();
  const today = 2; // "Day 3/7"
  const left = (h: number, m = 0) => h * 3600 + m * 60;
  if (scenario === "fresh") return;
  mockBounties.seedCreated(wallet);

  if (scenario === "settledKept" || scenario === "settledMissed") {
    const missed = scenario === "settledMissed";
    group("Iron Week", 0, 7, 1000, wallet, [me(wallet, { daysKept: mask(missed ? "kkkmkmk" : "kkkkkkk") }), person("riya", mask("kkkkkkk")), person("arjun", mask("kmkkkkm")), person("dev", mask("kkkkkkk"))],
      { creator: wallet, goal: "lift for 20 minutes", day1StartsAt: t - 7 * DAY - 60 });
    return;
  }
  if (scenario === "soloKept" || scenario === "soloMissed" || scenario === "soloBroken") {
    // L4 / L4·m / L4·b: Read 20 pages, finished. Like D-55, the design's "three misses" can't break a
    // solo Oath (−35 then +10 a day), so the broken one misses days 6–9.
    const pattern = scenario === "soloKept" ? "kkkkkkkkkkkkkk" : scenario === "soloMissed" ? "kkkkmkkkkkmkkk" : "kkkkkmmmm";
    add({ name: "Read 20 pages", goal: "read 20 pages", objectId: 1, numDays: 14, stake: skr(500), isSolo: true, reviewMode: "ai", status: "active", creator: wallet,
      day1StartsAt: t - pattern.length * DAY - 60, members: [me(wallet, { daysKept: mask(pattern) })], seeded: true });
    return;
  }
  if (scenario === "broken" || scenario === "rematchActive" || scenario === "rematchKept" || scenario === "rematchLost") {
    const finished = scenario === "rematchKept" || scenario === "rematchLost";
    const guitar = group("Guitar Days", 3, 7, 1000, wallet, [me(wallet, { daysKept: mask("kkkkkk") }), person("riya", mask("kkkkkk")), person("arjun", mask("kmkmkm")), person("dev", mask("kmkmmm"))],
      // HP 100 → 70 → 70 → 40 → 30 → break on day 6 (−40 from 30): the design's "Dev missed day 5,
      // Arjun missed day 6" alone can't reach 0 HP with four members.
      { goal: "practise guitar for 30 min", day1StartsAt: t - (scenario === "broken" ? 6 * DAY + 60 : finished ? 16 * DAY : 9 * DAY) });
    // R1: Riya and Dev are already in the Rematch; the user decides. R·act: it's on day 3.
    const r = rematchOf(guitar, [PEOPLE.riya.wallet, PEOPLE.dev.wallet], true);
    if (scenario === "rematchActive") {
      r.members.unshift(me(wallet, { daysKept: mask("kk"), proofToday: "none", proofDay: today }));
      r.recovery = heldOf(guitar);
      r.members.find((m) => m.wallet === PEOPLE.riya.wallet)!.daysKept = mask("km");
      r.members.find((m) => m.wallet === PEOPLE.dev.wallet)!.daysKept = mask("kk");
      r.status = "active";
      r.day1StartsAt = startFor(today, left(9, 18));
    }
    if (finished) {
      // R4 / L6: all 7 days kept, Riya missed day 2. R4·lost: the user missed day 2 instead.
      const lost = scenario === "rematchLost";
      r.members.unshift(me(wallet, { daysKept: mask(lost ? "kmkkkkk" : "kkkkkkk") }));
      r.recovery = heldOf(guitar);
      r.members.find((m) => m.wallet === PEOPLE.riya.wallet)!.daysKept = mask(lost ? "kkkkkkk" : "kmkkkkk");
      r.members.find((m) => m.wallet === PEOPLE.dev.wallet)!.daysKept = mask("kkkkkkk");
      r.status = "active";
      r.day1StartsAt = t - 7 * DAY - 60;
    }
    return;
  }

  // The prototype's Today: Iron Week (group, day 3), Read 20 pages (solo, day 9), a waiting Oath and a claim.
  const deadline = scenario === "deadlineClose";
  const allDone = scenario === "allDone";
  const low = scenario === "lowHp";
  const secondsLeft = deadline ? left(1, 42) : allDone ? left(5, 2) : left(9, 18);
  if (low) {
    group("Iron Week", 0, 7, 1000, wallet, [me(wallet, { daysKept: mask("kkkk") }), person("riya", mask("kkkk"), "kept", 4), person("arjun", mask("mmkm")), person("dev", mask("mmmk"))],
      { creator: PEOPLE.riya.wallet, goal: "lift for 20 minutes", day1StartsAt: startFor(4, secondsLeft) });
  } else {
    group("Iron Week", 0, 7, 1000, wallet, [
      me(wallet, { daysKept: mask("kk"), proofToday: allDone ? "kept" : deadline ? "none" : "partial", habitsDone: allDone ? [0, 1] : deadline ? [] : [0], proofDay: today }),
      person("riya", mask("kk"), "kept", today), person("arjun", mask("km"), allDone ? "kept" : "none", today), person("dev", mask("kk"), allDone ? "kept" : "review", today),
    ], { creator: PEOPLE.riya.wallet, goal: "lift for 20 minutes · read 10 pages", habits: ["lift for 20 minutes", "read 10 pages"], habitObjects: ["dumbbell", "book"], day1StartsAt: startFor(today, secondsLeft) });
  }
  if (!deadline) {
    add({ name: "Read 20 pages", goal: "read 20 pages", objectId: 1, numDays: 14, stake: skr(500), isSolo: true, reviewMode: "ai", status: "active", creator: wallet,
      day1StartsAt: startFor(8, secondsLeft), members: [me(wallet, { daysKept: mask("kkkkkkkk"), proofToday: "kept", proofDay: 8 })], seeded: true });
  }
  group("Iron Week", 0, 7, 1000, wallet, [me(wallet), person("riya", 0)], { status: "open", creator: wallet, goal: "lift for 20 minutes", inviteCode: "IRON-7K2Q" });
  group("Hydra 14", 2, 14, 1000, wallet, [me(wallet, { daysKept: mask("kkkkkkkkkkkkkk") }), person("riya", mask("kkkkkkkkkkkkkk")), person("arjun", mask("kkkmkkkkkmkkkk")), person("dev", mask("kkkkkkkkkkkkkk"))],
    { goal: "drink 2 litres of water", day1StartsAt: t - 16 * DAY });

  // Bounties the user is in: Hydrate Week on day 3 (B1, H3), plus a finished and a lost one.
  const hydrate = mockBounties.running("Hydrate Week", today, secondsLeft, 31, [
    { name: "Marco", day: 2, hoursAgo: 2 }, { name: "Lena", day: 2, hoursAgo: 2 }, { name: "Kai", day: 1, hoursAgo: 26 },
  ]);
  const out = scenario === "bountyOut";
  bountyOath(hydrate, wallet, { daysKept: mask(out ? "km" : "kk"), proofToday: allDone ? "kept" : "none", proofDay: today }, true);
  if (scenario === "bountyJoined") {
    const sol = mockBounties.ended("Sol Strings", 27, 1);
    bountyOath(sol, wallet, { daysKept: (1 << sol.numDays) - 1 }, true);
    // …and one the user was knocked out of on day 3 (L5's "Eliminated" row).
    const lost = mockBounties.ended("Green Thumb", 12, 2);
    bountyOath(lost, wallet, { daysKept: mask("kk") }, true);
  }
  // N1's invite: Riya's Dawn Run, Dev already in, the user not yet. Seeded last so earlier ids stay put.
  group("Dawn Run", 4, 7, 1000, wallet, [person("riya", 0), person("dev", 0)], { status: "open", goal: "run 3 km before 8", inviteCode: "DAWN-R7Q2" });
  if (scenario === "judges") {
    // Demo (D-80): the same Today, plus a broken Oath with a Rematch offer (D3 → R1) in the Oaths tab.
    const guitar = group("Guitar Days", 3, 7, 1000, wallet, [me(wallet, { daysKept: mask("kkkkkk") }), person("riya", mask("kkkkkk")), person("arjun", mask("kmkmkm")), person("dev", mask("kmkmmm"))],
      { goal: "practise guitar for 30 min", day1StartsAt: t - 6 * DAY - 60 });
    rematchOf(guitar, [PEOPLE.riya.wallet, PEOPLE.dev.wallet], true);
  }
}

/** Held per wallet at the original break (D-9): what a Rematch can win back. */
function heldOf(source: MockOath): Record<string, bigint> {
  const st = simulate({ stake: source.stake, days: source.numDays, members: source.members.length, solo: source.isSolo }, marksFromBitmasks(source.members.map((m) => m.daysKept), source.numDays));
  return Object.fromEntries(source.members.map((m, i) => [m.wallet, st.held[i] ?? 0n]));
}

/** A Rematch (Open) of a broken Oath with these wallets in (BACKEND_GAPS P1-2). */
function rematchOf(source: MockOath, wallets: string[], seeded: boolean): MockOath {
  const held = heldOf(source);
  const members = source.members.filter((m) => wallets.includes(m.wallet)).map((m) => ({ ...m, daysKept: 0, proofToday: "none" as ProofToday, proofDay: -1, claimed: false, payout: null }));
  return add({ name: source.name, goal: source.goal, objectId: source.objectId, numDays: source.numDays, stake: source.stake, isSolo: source.isSolo, reviewMode: source.reviewMode,
    status: "open", creator: wallets[0] ?? source.creator, day1StartsAt: null, members, seeded, rematchOf: source.id, recovery: held, inviteCode: null });
}

/** The user's participation in a Bounty: a stake-0 solo Oath that follows the Bounty's days. */
function bountyOath(b: BountyFacts, wallet: string, m: Partial<MockMember>, seeded: boolean): MockOath {
  return add({ name: b.name, goal: null, objectId: b.objectId, numDays: b.numDays, stake: 0n, isSolo: true, reviewMode: "ai", status: "active", creator: wallet,
    day1StartsAt: b.startsAt, members: [me(wallet, m)], seeded, bountyId: b.id, inviteCode: null });
}

/** How many habits the Oath has (an Oath from before habit lists has its goal as the one). */
const habitCount = (o: Pick<MockOath, "habits">) => Math.max(1, o.habits?.length ?? 1);

/** Rolls every Oath forward to "now": other members prove, finished Oaths settle (engine numbers). */
function roll(o: MockOath) {
  if (o.status !== "active" || o.day1StartsAt === null) return;
  const t = now();
  const day = Math.floor((t - o.day1StartsAt) / o.daySeconds);
  const all = (1 << o.numDays) - 1;
  if (o.bountyId && !o.eliminated && day > 0 && o.members.some((m) => (m.daysKept & ((1 << Math.min(day, o.numDays)) - 1)) !== (1 << Math.min(day, o.numDays)) - 1)) {
    // Miss a day and you're out of the Bounty pool.
    o.eliminated = true;
    mockBounties.eliminate(o.bountyId);
  }
  if (day >= o.numDays) {
    const st = simulate({ stake: o.stake, days: o.numDays, members: o.members.length, solo: o.isSolo }, marksFromBitmasks(o.members.map((m) => m.daysKept), o.numDays));
    const finals = settlement(st);
    o.status = "settled";
    o.members.forEach((m, i) => {
      const keptAll = (m.daysKept & all) === all && !st.broken;
      let payout = finals[i]!.final;
      if (o.rematchOf && keptAll) payout += o.recovery?.[m.wallet] ?? 0n; // the Rematch held: recover (D-9)
      if (o.bountyId) payout = keptAll ? mockBounties.share(o.bountyId) : 0n;
      m.payout = payout;
      m.proofToday = "none";
    });
    return;
  }
  for (const m of o.members) {
    if (day < 0) continue;
    if (m.proofDay !== day) {
      // The day that ended keeps what was proved in it (a seeded "kept today" has no day bit yet).
      if (m.proofDay >= 0 && m.proofToday === "kept") m.daysKept |= 1 << m.proofDay;
      // A new day: reliable people keep straight away, everyone else starts from nothing.
      m.proofDay = day;
      m.proofToday = m.reliable ? "kept" : "none";
      m.habitsDone = m.reliable ? Array.from({ length: habitCount(o) }, (_, i) => i) : [];
      if (m.reliable) m.daysKept |= 1 << day;
    }
  }
}

function facts(o: MockOath): OathFacts {
  roll(o);
  const t = now();
  const day = o.day1StartsAt === null ? -1 : Math.floor((t - o.day1StartsAt) / o.daySeconds);
  return { ...o, members: o.members.map(({ reliable: _r, proofDay, ...m }) => (proofDay === day ? m : { ...m, proofToday: "none" as ProofToday, habitsDone: [] })) };
}

export const mockOaths = {
  ensureSeeded(scenario: Scenario, wallet: string) { if (seededFor !== `${scenario}:${wallet}`) seed(scenario, wallet); },
  /** Oaths `wallet` is in. */
  list(wallet: string): OathFacts[] {
    return [...oaths.values()].filter((o) => o.members.some((m) => m.wallet === wallet)).map(facts);
  },
  get(id: string): OathFacts | null { const o = oaths.get(id); return o ? facts(o) : null; },
  byCode(code: string): OathFacts | null {
    const o = [...oaths.values()].find((x) => x.inviteCode?.toUpperCase() === code.toUpperCase());
    return o ? facts(o) : null;
  },
  /** The newest seeded Oath with this name that `wallet` is in, or any if `wallet` is null (the mock inbox's refs). */
  byName(name: string, wallet: string | null): OathFacts | null {
    const o = [...oaths.values()].reverse().find((x) => x.name === name && !x.bountyId && !x.rematchOf && (!wallet || x.members.some((m) => m.wallet === wallet)));
    return o ? facts(o) : null;
  },
  /** For the E1 mock: an Open group Oath anyone can join with this code. */
  inviteFor(code: string, wallet: string): OathFacts {
    const existing = mockOaths.byCode(code);
    if (existing) return existing;
    const o = group("Iron Week", 0, 7, STAKES_SKR[1], wallet, [person("riya", 0), person("dev", 0), person("arjun", 0)], { status: "open", creator: PEOPLE.riya.wallet, goal: "lift for 20 minutes", inviteCode: code.toUpperCase() });
    return facts(o);
  },

  /** What this session's stakes, refunds and claims did to a wallet's SKR (the mock wallet adds it to its balance). */
  walletDelta(wallet: string): bigint { return deltas.get(wallet) ?? 0n; },

  create(d: { wallet: string; goal: string; name?: string; habits?: string[]; habitObjects?: string[]; objectId: number; numDays: number; stake: bigint; isSolo: boolean; reviewMode: ReviewMode }): OathFacts {
    const o = add({ name: d.name || oathName(d.objectId, d.numDays), goal: d.goal, ...(d.habits ? { habits: d.habits.slice() } : {}), ...(d.habitObjects ? { habitObjects: d.habitObjects.slice() } : {}), objectId: d.objectId, numDays: d.numDays, stake: d.stake, isSolo: d.isSolo, reviewMode: d.reviewMode,
      status: "open", creator: d.wallet, day1StartsAt: null, members: [me(d.wallet)], seeded: false });
    move(d.wallet, -d.stake);
    return facts(o);
  },
  join(id: string, wallet: string) { const o = need(id); if (!o.members.some((m) => m.wallet === wallet)) { o.members.push(me(wallet)); move(wallet, -o.stake); } },
  leave(id: string, wallet: string) {
    const o = need(id);
    if (o.members.some((m) => m.wallet === wallet)) move(wallet, o.stake);
    o.members = o.members.filter((m) => m.wallet !== wallet);
  },
  /** Start: day 1 begins at the first midnight after Start (D-6). */
  start(id: string) { const o = need(id); o.status = "active"; o.day1StartsAt = nextMidnight(now(), tz()); },
  cancel(id: string) { const o = need(id); o.status = "cancelled"; o.members.forEach((m) => { m.payout = o.stake; }); },
  claim(id: string, wallet: string): bigint {
    const m = need(id).members.find((x) => x.wallet === wallet);
    if (!m || m.claimed || m.payout === null) throw new Error("nothing to claim");
    m.claimed = true;
    move(wallet, m.payout);
    return m.payout;
  },
  /** Proof progress for the user today. */
  prove(id: string, wallet: string, status: ProofToday) {
    const o = need(id);
    roll(o);
    const m = o.members.find((x) => x.wallet === wallet);
    if (!m || o.day1StartsAt === null) return;
    const day = Math.floor((now() - o.day1StartsAt) / o.daySeconds);
    m.proofDay = day;
    m.proofToday = status;
    m.habitsDone = status === "kept" ? Array.from({ length: habitCount(o) }, (_, i) => i) : [];
    if (status === "kept") m.daysKept |= 1 << day;
  },
  /**
   * One habit's photo passed. The day is kept once every habit has one; until then the day is partly proven. Returns whether
   * the day is kept now.
   */
  proveHabit(id: string, wallet: string, habit: number): boolean {
    const o = need(id);
    roll(o);
    const m = o.members.find((x) => x.wallet === wallet);
    if (!m || o.day1StartsAt === null) return false;
    const day = Math.floor((now() - o.day1StartsAt) / o.daySeconds);
    if (m.proofDay !== day) { m.proofDay = day; m.proofToday = "none"; m.habitsDone = []; }
    const done = new Set(m.habitsDone ?? []);
    done.add(habit);
    m.habitsDone = [...done].sort((a, b) => a - b);
    const kept = m.habitsDone.length >= habitCount(o);
    m.proofToday = kept ? "kept" : "partial";
    if (kept) m.daysKept |= 1 << day;
    return kept;
  },
  /** The Rematch of a broken Oath, if anyone started one. */
  rematchFor(sourceId: string): OathFacts | null {
    const r = [...oaths.values()].find((o) => o.rematchOf === sourceId);
    return r ? facts(r) : null;
  },
  /** Join (or open) the Rematch of a broken Oath. One Rematch per broken Oath. */
  joinRematch(sourceId: string, wallet: string): OathFacts {
    let r = [...oaths.values()].find((o) => o.rematchOf === sourceId);
    if (!r) r = rematchOf(need(sourceId), [], false);
    if (!r.members.some((m) => m.wallet === wallet)) { r.members.push(me(wallet)); move(wallet, -r.stake); }
    return facts(r);
  },
  /** Join a Bounty: my participation becomes a mock Oath on the Bounty's days. */
  joinBounty(b: BountyFacts, wallet: string): OathFacts {
    const existing = [...oaths.values()].find((o) => o.bountyId === b.id && o.members.some((m) => m.wallet === wallet));
    if (existing) return facts(existing);
    mockBounties.join(b.id);
    return facts(bountyOath(b, wallet, {}, false));
  },
  forBounty(bountyId: string, wallet: string): OathFacts | null {
    const o = [...oaths.values()].find((x) => x.bountyId === bountyId && x.members.some((m) => m.wallet === wallet));
    return o ? facts(o) : null;
  },
  /** Group review settled a day (P1-1): approved counts as kept, rejected as missed. */
  decideReview(id: string, wallet: string, approved: boolean) { mockOaths.prove(id, wallet, approved ? "kept" : "none"); },
  /** Tests only. */
  reset() { oaths.clear(); deltas.clear(); seededFor = null; counter = 0; mockBounties.reset(); },
  /**
   * Dev screenshots only (kept://dev/open/B1?cards=N): `n` more Oaths due today, alternating group Oaths
   * with a long goal and the Keeper-kept float, and solo ones with a short goal.
   */
  addDueForDev(wallet: string, n: number) {
    const goals = ["take a cold shower before breakfast and log how long it lasted", "stretch", "practise guitar scales for fifteen minutes", "walk 5 km", "write one page of the journal before bed", "meditate"];
    for (let i = 0; i < n; i++) {
      const day = 2, left = 6 * 3600;
      const extra = { goal: goals[i % goals.length]!, day1StartsAt: startFor(day, left), creator: wallet };
      if (i % 2 === 0) {
        group(`Dev Oath ${i + 1}`, (i + 2) % 6, 7, 500, wallet, [me(wallet, { daysKept: mask("kk"), proofDay: day }), person("riya", mask("kk"), "kept", day), person("arjun", mask("kk"), "none", day)], extra);
      } else {
        add({ name: `Dev Solo ${i + 1}`, objectId: (i + 2) % 6, numDays: 14, stake: skr(300), isSolo: true, reviewMode: "ai", status: "active", members: [me(wallet, { daysKept: mask("kk"), proofDay: day })], seeded: true, ...extra });
      }
    }
  },
};

const deltas = new Map<string, bigint>();
function move(wallet: string, by: bigint) { deltas.set(wallet, (deltas.get(wallet) ?? 0n) + by); }

function need(id: string): MockOath {
  const o = oaths.get(id);
  if (!o) throw new Error(`mock: no Oath ${id}`);
  return o;
}
