// The Keeper's hype during one rep set: turns the set's moments into lines (hypeChooser.ts) and times them so he never
// talks over himself. A line waits for the clip playing now (the count, "Freeze!") to end, plays only if nothing newer
// happened meanwhile and the set may hear it (counting, not the Freeze; the done line after the set), and must end
// before the next rep (from the set's rep cadence): a long line when one fits, else a short one (hypeLines.ts), else
// nothing. A count that comes anyway cuts the line off (countVoice.ts). No React Native here: the clock, timers and
// audio come in as deps, so tests drive it directly.
import { hypeSituation, pickHype } from "./hypeChooser";
import type { HypeEvent } from "./hypeChooser";
import type { HypeActivity, HypeLang, HypeSituation } from "./hypeLines";

export interface HypeCoachDeps {
  now(): number;
  /** Runs fn after ms. `keep`: the done line, which may still play once the set screen has closed. */
  schedule(ms: number, fn: () => void, keep?: boolean): void;
  /** ms until the Keeper clip playing now (a count or a line) ends; 0 when he's quiet. */
  busyMs(): number;
  /** Whether the set may hear a line now; checked when it would play. */
  canSpeak(situation: HypeSituation): boolean;
  /** Plays the clip; its length in ms, or 0 if it didn't play (voice off, no audio). */
  play(id: string): number;
  /** A clip's length in ms. */
  clipMs(id: string): number;
  lang(): HypeLang;
  rng?: () => number;
}

/**
 * Every bundled Keeper clip ends in at least 0.19 s of silence (measured at -45 dB: ElevenLabs' tail), so a clip counts
 * as over this much before its file ends: a line may start in the count's silent tail, and the next count may land in
 * the line's (cutting off nothing you'd hear).
 */
export const HYPE_TAIL_MS = 150;
/** A breath between the count and the line after it, on top of the count's silent tail. */
export const HYPE_AFTER_MS = 150;
/** A line must end at least this long before the predicted next rep. */
export const NEXT_REP_MARGIN_MS = 200;
const DEFAULT_CADENCE_MS = 2500;

export interface HypeCoachOptions {
  /** The set's activity: no line contradicts it (hypeLines.ts › hypeFits); push-ups when not said. */
  activity?: HypeActivity;
  /**
   * Whether the Keeper says count n out loud (a count cuts a hype line off). Every rep when not said; a held plank only
   * its tens, so a line there only has to end before the next spoken count, not the next second.
   */
  speaksAt?: (n: number) => boolean;
}

export class HypeCoach {
  private lastAt = -Infinity;
  private lastId: string | null = null;
  private readonly used = new Set<string>();
  private repN = 0;
  private hypeRep = 0;
  private repTimes: number[] = [];
  private firstRepMs = 0;
  private started = false;
  private wasLost = false;
  private seq = 0;

  constructor(private readonly target: number, private readonly d: HypeCoachDeps, private readonly o: HypeCoachOptions = {}) {}

  /** The counter saw the start position: the first time the set's opener, after losing you a welcome back. */
  ready(): void {
    if (!this.started) { this.started = true; this.say({ kind: "start" }, false); }
    else if (this.wasLost) this.say({ kind: "back" }, true);
    this.wasLost = false;
  }

  lost(): void { if (this.started) this.wasLost = true; }

  /** Rep n was counted (call after the count); ms = how long it took. */
  rep(n: number, ms: number): void {
    this.repN = n;
    this.repTimes = [...this.repTimes, this.d.now()].slice(-4);
    if (n === 1) this.firstRepMs = ms;
    this.say({ kind: "rep", n, ms }, true);
  }

  /** True when a line was picked and fits before the next rep (the caller then skips its generic one). */
  halfRep(): boolean { return this.started && this.say({ kind: "halfRep" }, true); }
  fault(): boolean { return this.started && this.say({ kind: "fault" }, true); }
  /** Counting again after the Freeze photo (a camera stall: lost(), then a welcome back at the next ready). */
  resume(): void { if (this.started) this.say({ kind: "resume" }, true); }
  /** The set is complete. True when a done line was picked (the caller then skips its generic one). */
  done(): boolean { return this.say({ kind: "done" }, false); }

  /** Typical ms from one rep to the next: the median of the last intervals, else the first rep's length plus a breath. */
  private cadence(): number {
    const gaps = this.repTimes.slice(1).map((t, i) => t - this.repTimes[i]!).sort((a, b) => a - b);
    if (gaps.length) return gaps[Math.floor(gaps.length / 2)]!;
    return this.firstRepMs > 0 ? this.firstRepMs + 400 : DEFAULT_CADENCE_MS;
  }

  /** Reps (or seconds) from now until the next one the Keeper says out loud: the next one, or a plank's next ten. */
  private repsToNextSpoken(): number {
    const speaks = this.o.speaksAt;
    if (!speaks) return 1;
    let m = this.repN + 1;
    while (m < this.target && !speaks(m)) m++;
    return Math.max(1, m - this.repN);
  }

  private say(event: HypeEvent, beforeNextRep: boolean): boolean {
    const now = this.d.now();
    const activity = this.o.activity;
    const situation = hypeSituation({
      event, target: this.target, sinceLastMs: now - this.lastAt, repsSinceHype: this.repN - this.hypeRep, ...(activity ? { activity } : {}),
    }, this.d.rng);
    if (!situation) return false;
    const seq = ++this.seq; // a newer moment drops a pending line, even when its own line doesn't fit
    const nextRepAt = beforeNextRep ? now + this.cadence() * this.repsToNextSpoken() : Infinity;
    const endsInTime = (at: number) => (id: string) => at + this.d.clipMs(id) - HYPE_TAIL_MS <= nextRepAt - NEXT_REP_MARGIN_MS;
    const wait = Math.max(0, this.d.busyMs() - HYPE_TAIL_MS) + HYPE_AFTER_MS;
    // A long line if one ends before the next rep, else a short one. None: say so now, so the caller's own line plays.
    const pick = { lang: this.d.lang(), lastId: this.lastId, used: this.used, fits: endsInTime(now + wait), ...(activity ? { activity } : {}) };
    const id = pickHype(situation, pick, this.d.rng) ?? pickHype(situation, { ...pick, tier: "short" }, this.d.rng);
    if (!id) return false;
    this.d.schedule(wait, () => {
      if (seq !== this.seq || this.d.busyMs() > HYPE_TAIL_MS || !this.d.canSpeak(situation)) return;
      const t = this.d.now();
      if (!endsInTime(t)(id)) return;
      if (this.d.play(id) <= 0) return;
      this.lastAt = t; this.lastId = id; this.used.add(id); this.hypeRep = this.repN;
    }, event.kind === "done");
    return true;
  }
}
