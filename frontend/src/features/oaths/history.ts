// D5 Oath history from the user's finished Oaths (settled or broken): one row each, grouped by the month
// it ended, with the net result. Same rules as D4 (the chain's payout for chain Oaths, D-14).
import { t } from "@/copy";
import type { OathView } from "./model";
import { oathAmount } from "./present";

export type HistoryKind = "kept" | "broken" | "rematch";
export interface HistoryRow { id: string; name: string; sub: string; net: bigint; kind: HistoryKind; rematch: boolean; endedAt: number; objectId: number }

const endedAt = (v: OathView) => (v.facts.day1StartsAt ?? v.facts.createdAt) + v.facts.numDays * v.facts.daySeconds;
const dayDate = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" }).replace(",", "");
const days = (n: number) => t(n === 1 ? "additions.core.oneDay" : "additions.core.nDays", { n });

function subOf(v: OathView): string {
  const me = v.members[v.me]!;
  const broke = (v.state.brokeOnDay ?? 0) + 1;
  if (v.life === "broken") return v.facts.isSolo ? t("screens.D5.b4.r2.s", { day: broke }) : t("screens.D5.b3.r2.s", { day: broke });
  if (v.facts.rematchOf && me.missed.length === 0) return t("screens.D5.b3.r1.s", { amount: oathAmount(v.facts, v.facts.recovery?.[me.facts.wallet] ?? 0n) });
  if (v.facts.isSolo) return me.missed.length ? t("screens.D5.b4.r3.s", { days: days(me.missed.length) }) : t("screens.D5.b4.r1.s", { n: v.facts.numDays, days: v.facts.numDays });
  const kept = v.members.filter((m) => m.missed.length === 0).length;
  return t("screens.D5.b3.r0.s", { n: kept, total: v.members.length, date: dayDate(endedAt(v)) });
}

/** Finished Oaths I'm in, newest first. Bounty entries have their own history (H1·j). */
export function historyOf(views: OathView[]): HistoryRow[] {
  return views
    .filter((v) => v.me >= 0 && !v.facts.bountyId && (v.life === "settled" || v.life === "broken"))
    .map((v) => {
      const r = v.results[v.me]!;
      const rematch = !!v.facts.rematchOf;
      return { id: v.facts.id, name: v.facts.name, sub: subOf(v), net: r.final - r.start, kind: v.life === "broken" ? "broken" as const : "kept" as const, rematch, endedAt: endedAt(v), objectId: v.facts.objectId };
    })
    .sort((a, b) => b.endedAt - a.endedAt);
}

/** D5 › b2: "{n} finished · {kept} kept · {broken} broken" and the all-time won / lost. */
export function historyTotals(rows: HistoryRow[]) {
  return {
    n: rows.length, kept: rows.filter((r) => r.kind === "kept").length, broken: rows.filter((r) => r.kind === "broken").length,
    won: rows.reduce((s, r) => (r.net > 0n ? s + r.net : s), 0n), lost: rows.reduce((s, r) => (r.net < 0n ? s - r.net : s), 0n),
  };
}
