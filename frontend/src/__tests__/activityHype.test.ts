// The Keeper's hype lines across every live activity (2026-11-27): the lines were written for push-ups and squats, so a
// line whose words contradict the activity must never play ("Deeper" for a jumping jack, "final rep" or "move" for a
// held plank). A half rep of an activity that's short going UP gets a form jab instead, and a 60-second plank (one "rep"
// a second, its tens spoken) still gets lines between its counts, none of them cut off by a spoken count.
import { EXERCISES } from "@kept/engine";
import { hypeActivityOf, saysCount } from "@/features/reps/activity";
import { HYPE_LANGS, HYPE_LINES, HYPE_RESTRICTED_IDS, HYPE_SITUATIONS, hypeFits } from "@/features/keeper/hypeLines";
import type { HypeActivity } from "@/features/keeper/hypeLines";
import { STREAK_SECONDS, hypeSituation, pickHype, repMilestone } from "@/features/keeper/hypeChooser";
import { HYPE_TAIL_MS, HypeCoach, NEXT_REP_MARGIN_MS } from "@/features/keeper/hypeCoach";
import type { HypeCoachDeps } from "@/features/keeper/hypeCoach";
import durations from "@/features/keeper/voiceDurations.gen.json";
import { hasCountClip } from "@/features/keeper/countVoice";

const MS = durations as Record<string, number>;
const textOf = (id: string) => HYPE_LINES.find((l) => l.id === id)!.text;
/** Words that only fit an activity whose effort goes down. */
const DOWN_WORDS = /\b(deeper|lower|down|curtsy)\b/i;
/** Words that only fit an activity counted in reps (not a held plank). */
const REP_WORDS = /\b(reps?|again|move|moving|pace|shift|faster|slower)\b|\bgo\./i;
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };

describe("hype lines × activities", () => {
  it("every restricted id is a real line, and the restrictions match the words", () => {
    for (const id of HYPE_RESTRICTED_IDS) expect(HYPE_LINES.some((l) => l.id === id)).toBe(true);
    const upward: HypeActivity = { down: false, unit: "reps" }, plank: HypeActivity = { down: false, unit: "seconds" };
    for (const l of HYPE_LINES) {
      // halfRep lines are about going down; the restriction covers every one of them
      if (DOWN_WORDS.test(l.text) && l.situation === "halfRep") expect([l.id, hypeFits(l.id, upward)]).toEqual([l.id, false]);
      if (REP_WORDS.test(l.text) && !/^(start|done|first|halfway|threeLeft|fault|back)-/.test(l.id)) expect([l.id, l.text, hypeFits(l.id, plank)]).toEqual([l.id, l.text, false]);
    }
  });

  it("for every activity, situation, language and tier, no line that can be picked contradicts the activity", () => {
    for (const ex of EXERCISES) {
      const a = hypeActivityOf(ex);
      for (const situation of HYPE_SITUATIONS) for (const lang of HYPE_LANGS) for (const tier of ["long", "short"] as const) {
        for (let r = 0; r < 1; r += 0.05) {
          const id = pickHype(situation, { lang, tier, activity: a }, () => r);
          if (!id) continue;
          const text = textOf(id);
          if (!a.down) expect([ex, id, DOWN_WORDS.test(text) && situation === "halfRep"]).toEqual([ex, id, false]);
          if (a.unit === "seconds") expect([ex, id, situation === "halfRep" || situation === "slow" || /^(last|resume|streak)-/.test(id) ? REP_WORDS.test(text) : false]).toEqual([ex, id, false]);
          // A plank's clock stops while it is lost or broken: no line may say it didn't.
          if (a.unit === "seconds") expect([ex, id, /clock didn't stop/i.test(text)]).toEqual([ex, id, false]);
        }
      }
    }
  });

  it("a half rep going up gets a form jab, going down the shaming line; a plank has no first/last rep, no slow rep", () => {
    const half = (ex: (typeof EXERCISES)[number]) => hypeSituation({ event: { kind: "halfRep" }, target: 10, sinceLastMs: Infinity, repsSinceHype: 0, activity: hypeActivityOf(ex) });
    expect(EXERCISES.filter((ex) => half(ex) === "halfRep").sort()).toEqual(["burpee", "lunge", "pushup", "squat"]);
    for (const ex of ["jumpingjack", "situp", "highknee", "press"] as const) expect(half(ex)).toBe("fault");
    expect(repMilestone(1, 60, "seconds")).toBeNull();
    expect(repMilestone(59, 60, "seconds")).toBeNull();
    expect(repMilestone(30, 60, "seconds")).toBe("halfway");
    expect(repMilestone(57, 60, "seconds")).toBe("threeLeft");
    expect(repMilestone(1, 10)).toBe("first"); // reps unchanged
    const plank = hypeActivityOf("plank");
    expect(hypeSituation({ event: { kind: "rep", n: 13, ms: 9000 }, target: 60, sinceLastMs: 9000, repsSinceHype: 2, activity: plank })).toBeNull();
    expect(hypeSituation({ event: { kind: "rep", n: 13, ms: 1000 }, target: 60, sinceLastMs: 9000, repsSinceHype: STREAK_SECONDS, activity: plank })).toBe("streak");
  });

  it("a 60-second plank: lines between its spoken tens, none cut off by a count, none about reps", () => {
    let now = 0, busyUntil = 0;
    const queue: { at: number; fn: () => void }[] = [];
    const played: { id: string; at: number; end: number }[] = [];
    const deps: HypeCoachDeps = {
      now: () => now, schedule: (ms, fn) => { queue.push({ at: now + ms, fn }); },
      busyMs: () => Math.max(0, busyUntil - now), canSpeak: () => true,
      play: (id) => { const ms = MS[`hype/${id}`]!; played.push({ id, at: now, end: now + ms }); busyUntil = now + ms; return ms; },
      clipMs: (id) => MS[`hype/${id}`]!, lang: () => "clean", rng: seq(0.1, 0.7, 0.4, 0.9, 0.2),
    };
    const coach = new HypeCoach(60, deps, { activity: hypeActivityOf("plank"), speaksAt: (n) => saysCount("plank", n) && hasCountClip(n) });
    const advance = (ms: number) => {
      const end = now + ms;
      for (;;) {
        const due = queue.filter((q) => q.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        queue.splice(queue.indexOf(due), 1); now = Math.max(now, due.at); due.fn();
      }
      now = end;
    };
    const spoken: number[] = [];
    busyUntil = MS.go!; coach.ready(); advance(3000);
    for (let n = 1; n <= 60; n++) {
      if (saysCount("plank", n) && hasCountClip(n)) { spoken.push(now); busyUntil = now + MS[`count-${n}`]!; }
      coach.rep(n, 1000);
      if (n === 60) { coach.done(); advance(4000); break; }
      advance(1000);
    }
    const mid = played.filter((p) => !/^(start|done)-/.test(p.id));
    expect(mid.length).toBeGreaterThanOrEqual(3);
    for (const p of mid) {
      expect([p.id, REP_WORDS.test(textOf(p.id))]).toEqual([p.id, false]);
      // Ends (but for its silent tail) before the next spoken count.
      const next = spoken.find((s) => s > p.at);
      if (next !== undefined) expect(p.end - HYPE_TAIL_MS).toBeLessThanOrEqual(next - NEXT_REP_MARGIN_MS + 1);
    }
    expect(played.at(-1)!.id).toMatch(/^done-clean-/);
  });
});
