// The app's Oath model. `OathFacts` is what the data layer knows (chain account, backend details,
// device-only fields, or the mock); `oathView` derives everything a screen shows with packages/engine.
// Screens never do money or HP math themselves (CLAUDE.md › Mobile code rules).
import { HP } from "@kept/config";
import {
  dayPhase, marksFromBitmasks, nextMissBreaks, nextMissCost, odds, previewMiss, settlement, simulate,
} from "@kept/engine";
import type { DayResult, MemberSettlement, Odds, OathState } from "@kept/engine";

/** Where the facts come from: the real program (+ backend), or the mock store. */
export type OathSource = "chain" | "mock";
export type ProofToday = "none" | "photo1" | "kept" | "review";
export type ReviewMode = "ai" | "ai_group";
export type ChainStatus = "open" | "active" | "settled" | "cancelled";

export interface MemberFacts {
  wallet: string;
  /** Display name when known (mock, profiles later); null shows the short wallet. */
  name: string | null;
  /** 8-digit avatar config, or null for an initial tile. */
  avatar: string | null;
  /** 0..1 kept rate across all Oaths, or null while "New" (D-12). */
  keptRate: number | null;
  /** Days counted for the kept rate ("91% · 64 days"). */
  rateDays: number;
  /** Bit d set = day d kept (the program's `days_kept`). */
  daysKept: number;
  /** Today's proof progress (photo 1 and review are off-chain). */
  proofToday: ProofToday;
  claimed: boolean;
  /** On-chain payout once settled or cancelled (D-14); null until then. */
  payout: bigint | null;
}

export interface OathFacts {
  id: string;
  source: OathSource;
  /** The program's u64 oath_id (decimal), for chain Oaths: seeds the daily proof target. */
  oathId: string | null;
  creator: string;
  name: string;
  goal: string | null;
  objectId: number;
  numDays: number;
  stake: bigint;
  isSolo: boolean;
  reviewMode: ReviewMode;
  status: ChainStatus;
  /** Unix seconds when day 1 begins; null while Open. */
  day1StartsAt: number | null;
  daySeconds: number;
  members: MemberFacts[];
  inviteCode: string | null;
  /** Unix seconds; orders lists. */
  createdAt: number;
  /** A Rematch of this broken Oath (BACKEND_GAPS P1-2; mock only). */
  rematchOf?: string;
  /** Rematch only: per wallet, what was held at the original break and can be recovered (D-9). */
  recovery?: Record<string, bigint>;
  /** The Bounty this is my participation in (BACKEND_GAPS P1-10; mock only). Miss a day and you're out. */
  bountyId?: string;
}

/** Where the Oath is, from the member's point of view. */
export type Life = "open" | "waiting" | "active" | "over" | "broken" | "settled" | "cancelled";

/** DayMemberGrid cell codes (components/content/Oath.tsx › CellState). */
type Cell = "k" | "m" | "p" | "h" | "r" | "x" | "f";

export interface MemberView {
  index: number;
  facts: MemberFacts;
  isMe: boolean;
  /** The engine's balance for this member: a projection of the rules (D-93), not money paid. */
  balance: bigint;
  /**
   * What is really theirs to show as "in play": the engine balance for demo Oaths, but for a chain Oath that hasn't
   * settled just the stake locked in its vault. Even where the program settles by the same rules (rules v3, DECISIONS
   * D-93), money only moves at settlement and the days to come are unplayed, so a projected balance must not read as
   * money held or earned; older Oaths (rules v1) settle differently altogether.
   */
  inPlay: bigint;
  missed: number[];
  keptDays: number;
  cells: string;
  odds: Odds;
  pendingToday: boolean;
}

export interface OathView {
  facts: OathFacts;
  life: Life;
  /** True while the engine's money numbers are only a projection: a chain Oath that hasn't settled or been cancelled. */
  estimated: boolean;
  me: number;
  isCreator: boolean;
  /** 0-based current day while a day is running. */
  dayIndex: number | null;
  /** 1-based day shown in "Day 3/7"; numDays once over. */
  dayNumber: number;
  secondsToReset: number | null;
  secondsToStart: number | null;
  deadlineClose: boolean;
  /** Engine state over the finished days. */
  state: OathState;
  hp: number;
  /** HP lost on the last finished day (net of the heal), for HPPanel's outlined segments. */
  hpLostLastDay: number;
  lastDay: DayResult | null;
  members: MemberView[];
  /** What my next miss costs, and whether one more miss breaks it. */
  myMissCost: bigint;
  nextMissBreaks: boolean;
  /** First other member still pending today, and the day's result if only they miss. */
  preview: { member: number; result: DayResult } | null;
  /** Per member: what they end with (chain payout once settled, D-14). */
  results: MemberSettlement[];
  /** My unclaimed amount once settled or cancelled. */
  claimable: bigint;
}

const bit = (mask: number, d: number) => ((mask >> d) & 1) === 1;

export function oathView(f: OathFacts, now: number, myWallet: string | null): OathView {
  const me = f.members.findIndex((m) => m.wallet === myWallet);
  const n = Math.max(1, f.members.length);
  const phase = f.day1StartsAt === null ? null : dayPhase(f.day1StartsAt, f.numDays, now, f.daySeconds);
  const finished = phase === null ? 0 : phase.phase === "day" ? phase.dayIndex : phase.phase === "over" ? f.numDays : 0;
  const masks = f.members.map((m) => m.daysKept);
  const state = simulate(
    { stake: f.stake, days: f.numDays, members: n, solo: f.isSolo },
    marksFromBitmasks(masks.length ? masks : [0], finished),
  );
  const dayIndex = phase?.phase === "day" ? phase.dayIndex : null;

  const life: Life = f.status === "cancelled" ? "cancelled"
    : state.broken ? "broken"
    : f.status === "settled" ? "settled"
    : f.status === "open" ? "open"
    : phase?.phase === "waiting" ? "waiting"
    : phase?.phase === "over" ? "over"
    : "active";

  const estimated = f.source === "chain" && f.status !== "settled" && f.status !== "cancelled";
  const members: MemberView[] = f.members.map((m, i) => {
    const missed = Array.from({ length: Math.min(finished, state.brokeOnDay === null ? finished : state.brokeOnDay + 1) }, (_, d) => d).filter((d) => !bit(m.daysKept, d));
    const cells = Array.from({ length: f.numDays }, (_, d): Cell => {
      if (state.brokeOnDay !== null && d > state.brokeOnDay) return "f";
      if (d < finished) return bit(m.daysKept, d) ? "k" : state.brokeOnDay === d ? "x" : "m";
      if (d === dayIndex) return bit(m.daysKept, d) || m.proofToday === "kept" ? "k" : m.proofToday === "photo1" ? "h" : m.proofToday === "review" ? "r" : "p";
      return "f";
    }).join("");
    const keptToday = dayIndex !== null && (bit(m.daysKept, dayIndex) || m.proofToday === "kept");
    const today = keptToday ? "kept" : m.proofToday === "kept" ? "none" : m.proofToday;
    return {
      index: i,
      facts: m,
      isMe: i === me,
      balance: state.balances[i] ?? 0n,
      inPlay: estimated ? f.stake : (state.balances[i] ?? 0n),
      missed,
      keptDays: state.keptDays[i] ?? 0,
      cells,
      odds: dayIndex === null ? { kind: "none" } : odds(m.keptRate, today, phase?.phase === "day" && phase.deadlineClose),
      pendingToday: dayIndex !== null && !keptToday,
    };
  });

  const lastDay = state.dayResults[state.dayResults.length - 1] ?? null;
  const pending = members.find((m) => !m.isMe && m.pendingToday);
  const canPreview = life === "active" && !state.broken && state.dayResults.length < f.numDays && f.members.length > 0;
  const results = resultsOf(f, state);
  const mine = me >= 0 ? f.members[me]! : null;
  const claimable = mine && !mine.claimed && (f.status === "settled" || f.status === "cancelled") ? results[me]!.final : 0n;

  return {
    facts: f,
    life,
    estimated,
    me,
    isCreator: myWallet !== null && f.creator === myWallet,
    dayIndex,
    dayNumber: phase?.phase === "day" ? phase.dayIndex + 1 : finished || 1,
    secondsToReset: phase?.phase === "day" ? phase.secondsToReset : null,
    secondsToStart: phase?.phase === "waiting" ? phase.secondsToStart : null,
    deadlineClose: phase?.phase === "day" ? phase.deadlineClose : false,
    state,
    hp: state.hp,
    hpLostLastDay: lastDay ? Math.max(0, lastDay.hpBefore - lastDay.hpAfter) : 0,
    lastDay,
    members,
    myMissCost: me >= 0 && canPreview ? nextMissCost(state, me) : 0n,
    nextMissBreaks: canPreview && nextMissBreaks(state),
    preview: canPreview && pending && !f.isSolo ? { member: pending.index, result: previewMiss(state, pending.index) } : null,
    results,
    claimable,
  };
}

/**
 * What each member ends with. A cancelled Oath refunds the stake. A settled chain Oath shows the
 * chain's payout (D-14: never an engine number the program won't pay); start/lost/won are derived
 * from it. A Rematch adds its recovery and a Bounty pays its share. Everything else is the engine's
 * estimate.
 */
function resultsOf(f: OathFacts, state: OathState): MemberSettlement[] {
  const engine = settlement(state);
  return f.members.map((m, i) => {
    if (f.status === "cancelled") return { start: f.stake, lost: 0n, won: 0n, final: m.payout ?? f.stake, held: 0n };
    // A settled Rematch keeps the engine's breakdown; its payout adds the recovery (R4 shows it).
    if (f.status === "settled" && m.payout !== null && f.rematchOf && engine[i]) return { ...engine[i], final: m.payout };
    // The chain's payout (D-14), or a Bounty's share of the pool.
    if (f.status === "settled" && m.payout !== null && (f.source === "chain" || f.bountyId)) {
      const diff = m.payout - f.stake;
      return { start: f.stake, lost: diff < 0n ? -diff : 0n, won: diff > 0n ? diff : 0n, final: m.payout, held: 0n };
    }
    return engine[i] ?? { start: f.stake, lost: 0n, won: 0n, final: f.stake, held: 0n };
  });
}

/** HP at or below this shows D2·low (DESIGN.md §2.7 danger). */
export const isLowHp = (v: OathView) => v.life === "active" && v.hp <= HP.dangerAtOrBelow;
