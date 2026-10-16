// What the three intro pages show (A1·i). Every number is computed from the app's own rules in
// packages/engine and packages/config, so the example can't drift from what an Oath really does. It is an
// example, and the pages say so: nothing here is a statistic about real users.
import { HP, SOL_UNIT } from "@kept/config";
import { keptRate, keptRatePercent, missCost, splitLost } from "@kept/engine";

/** Page 1: the example Oath. Four friends, 0.05 SOL each, and one of them misses a day. */
export const SAMPLE_OATH = { members: 4, stake: SOL_UNIT / 20n } as const;

export function sampleMiss() {
  const lost = missCost(SAMPLE_OATH.stake);
  const keepers = SAMPLE_OATH.members - 1;
  const { each } = splitLost(lost, keepers);
  return {
    pot: SAMPLE_OATH.stake * BigInt(SAMPLE_OATH.members),
    /** What the one who missed pays in. */
    lost,
    /** What each keeper takes; KEPT takes one equal share too. */
    each,
  };
}

/** Page 3: a 14-day example, kept every day but days 4 and 9. */
export const SAMPLE_DAYS = [true, true, true, false, true, true, true, true, false, true, true, true, true, true] as const;

export interface ChartPoint { day: number; kept: number; slip: boolean }

/** Days kept so far, after each day. */
export function keptSeries(days: readonly boolean[] = SAMPLE_DAYS): ChartPoint[] {
  let kept = 0;
  return days.map((k, i) => ({ day: i + 1, kept: (kept += k ? 1 : 0), slip: !k }));
}

/** The example's end state: days kept, the kept rate the engine would show, and the Oath HP after the last day. */
export function sampleSummary(days: readonly boolean[] = SAMPLE_DAYS) {
  const series = keptSeries(days);
  const rate = keptRatePercent(keptRate(days.map((kept, i) => ({ ageDays: days.length - 1 - i, kept }))));
  // End of each day: −35 for a miss (a solo Oath), then +10, capped at 100 (rules.md §2).
  let hp: number = HP.start;
  for (const kept of days) hp = Math.min(HP.max, Math.max(0, hp - (kept ? 0 : HP.missSolo)) + HP.heal);
  return { days: days.length, kept: series[series.length - 1]?.kept ?? 0, rate, hp };
}

/** The line as an SVG path in a `w`×`h` box, with `pad` of room around it (the dots sit on the points). */
export function chartGeometry(points: readonly ChartPoint[], w: number, h: number, pad = 10) {
  const max = Math.max(1, ...points.map((p) => p.kept));
  const xy = points.map((p, i) => ({
    x: pad + (points.length === 1 ? 0 : (i / (points.length - 1)) * (w - pad * 2)),
    y: h - pad - (p.kept / max) * (h - pad * 2),
    slip: p.slip,
  }));
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  const first = xy[0];
  const area = last && first ? `${line} L${last.x.toFixed(1)} ${h} L${first.x.toFixed(1)} ${h} Z` : "";
  return { xy, line, area };
}
