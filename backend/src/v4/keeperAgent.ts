// "Ask the Keeper" as an agent: the model answers the user's spoken question by calling read-only tools over the user's
// own Oaths (on chain), their habits and today's proofs (backend records), their Keeper receipts, their balance and the
// rules. It never signs, sends or moves anything. The facts are computed here, deterministically, from data the server
// already has; the model only chooses what to look up and how to say it.
import { exerciseUnit, parseRepHabit, repHabitText, type Exercise } from "../shared/reps.js";

/** One Oath as the server knows it: the on-chain account plus the backend's details and today's habit proofs. */
export type AgentOath = {
  address: string;
  /** The app's own name for it, when the app sent one (names live on the device). */
  name: string | null;
  chain: {
    status: number; isSolo: boolean; startTs: number; daySeconds: number; numDays: number;
    members: string[]; daysKept: Record<string, number>; stakeAmount: string; payouts: Record<string, string>; claimed: Record<string, boolean>;
  };
  details: { goalText: string; habits: string[]; habitObjects: string[] } | null;
  /** Habit proofs recorded by the backend (any member, any day) for this Oath. */
  proofs: { wallet: string; dayIndex: number; habit: number }[];
};

export type AgentReceipt = { day: number | null; habit: number | null; pass: boolean; reason: string; when: string; reps: { exercise: string; counted: number; target: number } | null };

/** What the tools read. The route supplies real chain/database reads; tests supply fixtures. */
export type AgentDeps = {
  wallet: string;
  now(): number;
  oaths(): Promise<AgentOath[]>;
  balanceSol(): Promise<number | null>;
  receipts(oath: string, day: number | null): Promise<AgentReceipt[]>;
};

export const HP_RULES = { start: 100, max: 100, missGroup: 20, missSolo: 35, heal: 10 } as const;
const MISS_SHARE = 0.1; // a miss costs 10 % of the member's original stake (D-93)

const sol2 = (lamports: number) => Math.round(lamports / 1e7) / 100;
const bitsSet = (n: number) => { let c = 0; for (let x = n >>> 0; x; x &= x - 1) c++; return c; };
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const STATUS = ["open (waiting to start)", "active", "settled", "cancelled"];
const hm = (s: number) => { const m = Math.max(0, Math.floor(s / 60)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

/** The current day (0-based) of an active Oath, or null when it hasn't started or has ended. */
export function currentDay(o: AgentOath["chain"], now: number): number | null {
  if (o.status !== 1 || !o.startTs) return null;
  const d = Math.floor((now - o.startTs) / o.daySeconds);
  return d >= 0 && d < o.numDays ? d : null;
}

/** HP after every closed day, by the rules (start 100; each day −20 per missed member, −35 solo; then +10; 0 breaks). */
export function hpOf(o: AgentOath["chain"], now: number): { hp: number; broken: boolean; closedDays: number } {
  const closed = o.status >= 2 ? o.numDays : o.status === 1 && o.startTs ? Math.max(0, Math.min(o.numDays, Math.floor((now - o.startTs) / o.daySeconds))) : 0;
  let hp: number = HP_RULES.start;
  for (let d = 0; d < closed; d++) {
    const missed = o.members.filter((m) => ((o.daysKept[m] ?? 0) & (1 << d)) === 0).length;
    const after = hp - missed * (o.isSolo ? HP_RULES.missSolo : HP_RULES.missGroup);
    if (after <= 0) return { hp: 0, broken: true, closedDays: d + 1 };
    hp = Math.min(HP_RULES.max, after + HP_RULES.heal);
  }
  return { hp, broken: false, closedDays: closed };
}

/** Where the phone goes for each live activity (the app's set-up steps say the same). */
const PHONE_PLACEMENT: Record<Exercise, string> = {
  pushup: "on its side on the floor, about 2 m away", plank: "on its side on the floor, about 2 m away", situp: "on its side on the floor, about 2 m away",
  burpee: "upright on the floor, about 3 m away", squat: "upright on a chair, 2.5 to 3 m away", lunge: "upright on a chair, 2.5 to 3 m away",
  highknee: "upright on a chair, 2.5 to 3 m away", jumpingjack: "upright on a chair, 3 m away, raised hands in view", press: "upright on a chair, 3 m away, raised hands in view",
};

/** How a live set is proven, in words: "the camera counts 20 jumping jacks live …" / "the camera times a 60-second plank …". */
export function repHowToProve(exercise: Exercise, target: number): string {
  const where = `phone level and still ${PHONE_PLACEMENT[exercise]}, whole body in view, any angle`;
  return exerciseUnit(exercise) === "seconds"
    ? `the camera times a ${repHabitText(exercise, target)} live (${where}); the clock only runs while you hold a straight plank; at "Freeze!" raise one hand and keep holding`
    : `the camera counts ${repHabitText(exercise, target)} live (${where}); at "Freeze!" hold still and raise one hand`;
}

/** A habit as the Keeper describes it: its name, what proves it, and for a live set the exercise, target and unit. */
function habitList(f: AgentOath) {
  const names = f.details?.habits?.length ? f.details.habits : f.details?.goalText ? [f.details.goalText] : ["the habit"];
  return names.map((name, i) => {
    const proof = f.details?.habitObjects?.[i] ?? f.details?.habitObjects?.[0] ?? "a photo of the Oath's object";
    const rep = parseRepHabit(proof);
    if (!rep) return { index: i + 1, name, proof: `a live photo showing ${proof}`, howToProve: `one live photo with ${proof} and the hand gesture the app asks for` };
    const timed = exerciseUnit(rep.exercise) === "seconds";
    return {
      index: i + 1, name, proof: timed ? `a live, timed ${repHabitText(rep.exercise, rep.target)}` : `a live set of ${repHabitText(rep.exercise, rep.target)}`,
      howToProve: repHowToProve(rep.exercise, rep.target), repTarget: rep.target, unit: timed ? "seconds" : "reps", exercise: rep.exercise,
    };
  });
}

/** Today's progress for one member: the habits proven (1-based) and whether the day is recorded on chain. */
function todayOf(f: AgentOath, member: string, day: number | null, habitCount: number) {
  if (day === null) return null;
  const proven = [...new Set(f.proofs.filter((p) => p.wallet === member && p.dayIndex === day).map((p) => p.habit + 1))].sort((a, b) => a - b);
  const kept = ((f.chain.daysKept[member] ?? 0) & (1 << day)) !== 0;
  return { habitsProven: kept ? Array.from({ length: habitCount }, (_, i) => i + 1) : proven, of: habitCount, dayKept: kept };
}

/** The one-line view of every Oath, given to the model up front. */
export function summarizeOath(f: AgentOath, wallet: string, now: number) {
  const day = currentDay(f.chain, now);
  const habits = habitList(f);
  const mine = todayOf(f, wallet, day, habits.length);
  const others = f.chain.members.filter((m) => m !== wallet);
  const ended = f.chain.status === 1 && f.chain.startTs && Math.floor((now - f.chain.startTs) / f.chain.daySeconds) >= f.chain.numDays;
  return {
    id: f.address,
    name: f.name ?? (f.details?.goalText || "an Oath"),
    status: ended ? "ended, waiting to be settled" : STATUS[f.chain.status] ?? "unknown",
    solo: f.chain.isSolo,
    habits: habits.map((h) => `${h.name}: ${h.proof}`),
    day: day !== null ? `day ${day + 1} of ${f.chain.numDays}` : `${f.chain.numDays} days`,
    timeLeftToday: day !== null ? hm(f.chain.startTs + (day + 1) * f.chain.daySeconds - now) : null,
    myToday: mine ? (mine.dayKept ? "kept today" : `${mine.habitsProven.length} of ${mine.of} habits proven today`) : null,
    friends: others.length,
    friendsKeptToday: day !== null ? others.filter((m) => todayOf(f, m, day, habits.length)!.dayKept).length : null,
    hp: hpOf(f.chain, now).hp,
  };
}

/** Everything about one Oath: habits and how to prove them, today for every member, HP, money, timing. */
export function oathDetails(f: AgentOath, wallet: string, now: number) {
  const day = currentDay(f.chain, now);
  const habits = habitList(f);
  const { hp, broken, closedDays } = hpOf(f.chain, now);
  const stake = Number(f.chain.stakeAmount);
  const settled = f.chain.status >= 2;
  const members = f.chain.members.map((m) => {
    const kept = bitsSet(f.chain.daysKept[m] ?? 0);
    const missed = Math.max(0, closedDays - bitsSet((f.chain.daysKept[m] ?? 0) & ((1 << closedDays) - 1)));
    const today = todayOf(f, m, day, habits.length);
    return {
      who: m === wallet ? "you" : `friend with wallet ${short(m)}`,
      daysKept: kept, daysMissed: missed,
      ...(today ? { today: today.dayKept ? "kept today (recorded on Solana)" : today.habitsProven.length ? `proved habit ${today.habitsProven.join(", ")} of ${today.of}, not done yet` : "nothing proven yet today" } : {}),
      ...(settled ? { payoutSol: sol2(Number(f.chain.payouts[m] ?? "0")), claimed: f.chain.claimed[m] ?? false } : {}),
    };
  });
  const myMisses = members.find((m) => m.who === "you")?.daysMissed ?? 0;
  return {
    ...summarizeOath(f, wallet, now),
    habits,
    startedAt: f.chain.startTs ? new Date(f.chain.startTs * 1000).toISOString() : null,
    endsAt: f.chain.startTs ? new Date((f.chain.startTs + f.chain.numDays * f.chain.daySeconds) * 1000).toISOString() : null,
    dayLength: f.chain.daySeconds === 86_400 ? "24 hours" : `${Math.round(f.chain.daySeconds / 60)} minutes`,
    members,
    hp: { now: hp, broken, rule: `starts at ${HP_RULES.start}; each day ${f.chain.isSolo ? `a miss costs ${HP_RULES.missSolo}` : `each member who misses costs ${HP_RULES.missGroup}`}, then the bar heals ${HP_RULES.heal}; at 0 the Oath breaks` },
    money: {
      stakePerMemberSol: sol2(stake),
      potSol: sol2(stake * f.chain.members.length),
      costOfAMissSol: sol2(stake * MISS_SHARE),
      myMissesSoFar: myMisses,
      whereMissesGo: "a missed day's money goes to that day's keepers, split equally, with one equal share kept by KEPT",
    },
  };
}

const RULES: Record<string, string> = {
  overview: "An Oath is a daily habit you swear alone or with up to three friends, with SOL staked in an on-chain escrow. Every day each member proves every habit; a day is kept when all its habits pass and the Keeper records it on Solana.",
  hp: `The Oath has one shared HP bar: it starts at ${HP_RULES.start}. At the end of each day every member who missed costs ${HP_RULES.missGroup} HP (${HP_RULES.missSolo} if solo), then it heals ${HP_RULES.heal}, up to ${HP_RULES.max}. At 0 HP the Oath breaks.`,
  misses: "A miss costs 10 percent of your original stake, the same each time. That money goes to the members who kept that day, split equally, with one equal share to KEPT.",
  payouts: "When the Oath ends it is settled on chain: each member can claim their remaining stake plus what they won from others' misses. Claim it from the Oath's result screen.",
  proof: "Each habit is proven once a day with a live photo of its object plus the hand gesture the app asks for, taken in the app. The Keeper (an AI judge on the server) checks it; the verdict's receipt hash goes on Solana and anyone can audit it.",
  rep_sets: "Live activities are proven by a live set the camera counts: push-ups, squats, jumping jacks, lunges, sit-ups, high knees, burpees and overhead presses (counted in reps), and the plank (timed in seconds: the clock only runs while you hold a straight plank). Put the phone level and still, whole body in view, from any angle: on the floor about 2 m away for push-ups, planks and sit-ups (on its side), upright on the floor about 3 m away for burpees, upright on a chair 2.5 to 3 m away for the standing ones (jumping jacks and overhead presses with raised hands in view). Tap Start, hold the start position still, then go. At Freeze, hold still and raise one hand for two seconds. The server recounts every rep and every second.",
  rematch: "After a broken Oath, a Rematch can win back half of what was lost: keep every day of the Rematch and the held half is returned.",
  wallet: "KEPT runs on Solana Devnet with test SOL, which has no value. Get more test SOL at faucet.solana.com.",
};

export const TOOLS = [
  { type: "function", function: { name: "get_oath_details", description: "Everything about one of the user's Oaths: each habit and how to prove it (e.g. a live set of 10 push-ups, 20 jumping jacks or a timed 60-second plank), today's progress for the user and every friend, HP, days kept/missed per member, time left today, stake, pot, cost of a miss, payouts.", parameters: { type: "object", properties: { oath_id: { type: "string", description: "The id from the Oath summary" } }, required: ["oath_id"] } } },
  { type: "function", function: { name: "get_my_receipts", description: "The Keeper's verdicts on the user's proofs for one Oath (optionally one day, 1-based): pass/fail, the reason, and for live sets how many reps (or plank seconds) were counted.", parameters: { type: "object", properties: { oath_id: { type: "string" }, day: { type: "integer", description: "1-based day; omit for the latest" } }, required: ["oath_id"] } } },
  { type: "function", function: { name: "get_wallet_balance", description: "The user's wallet balance in SOL (Devnet test SOL).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_rules", description: "How KEPT works, by topic.", parameters: { type: "object", properties: { topic: { type: "string", enum: Object.keys(RULES) } }, required: ["topic"] } } },
] as const;

/** Runs one tool call; unknown tools and bad ids answer with an error object the model can read. */
export async function runTool(name: string, args: Record<string, unknown>, deps: AgentDeps, oaths: AgentOath[]): Promise<unknown> {
  const find = (id: unknown) => oaths.find((o) => o.address === id || (typeof id === "string" && id.length >= 4 && o.address.startsWith(id)));
  switch (name) {
    case "get_oath_details": { const f = find(args.oath_id); return f ? oathDetails(f, deps.wallet, deps.now()) : { error: "No Oath with that id among the user's Oaths" }; }
    case "get_my_receipts": {
      const f = find(args.oath_id);
      if (!f) return { error: "No Oath with that id among the user's Oaths" };
      const day = Number.isInteger(args.day) && (args.day as number) >= 1 ? (args.day as number) - 1 : null;
      return (await deps.receipts(f.address, day)).slice(0, 8).map((r) => ({ ...r, day: r.day === null ? null : r.day + 1, habit: r.habit === null ? null : r.habit + 1 }));
    }
    case "get_wallet_balance": { const b = await deps.balanceSol(); return b === null ? { error: "Balance unavailable right now" } : { sol: b }; }
    case "get_rules": return { text: RULES[String(args.topic)] ?? RULES.overview };
    default: return { error: `Unknown tool ${name}` };
  }
}

export const MAX_TOOL_ROUNDS = 4;
