// Every live activity end to end below the screen (2026-11-27: jumping jacks, lunges, sit-ups, high knees, burpees,
// overhead presses and the timed plank join push-ups and squats): the catalog offers each at sensible counts with a
// proof text the engine reads back (so Proof routes it to RepSet), its own icon and search words, its own set-up copy,
// and the set screen's roll fix turns a tilted pose back upright with the sign RepCounterView.kt's tilt has.
import { readFileSync } from "fs";
import { join } from "path";
import { EXERCISES, REP_TARGET_LIMIT, countReps, exerciseUnit, parseRepHabit, repHabitText } from "@kept/engine";
import type { Exercise, Trace } from "@kept/engine";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import icons from "@/components/primitives/icons.gen.json";
import { CATALOG, QUICK_PICK_OBJECTS, currentEntryKey } from "@/features/objects/catalog";
import { REP_ICON, entryIcon, objectIconOfText, proofTextOf, savedEntry } from "@/features/objects/proof";
import { buildIndex, searchObjects } from "@/features/objects/search";
import { savedHabits } from "@/features/oaths/habits";
import { ACTIVITY, isTimed, saysCount, setSeconds } from "@/features/reps/activity";
import { uprightPose } from "@/features/reps/upright";

const ALL: readonly Exercise[] = ["pushup", "squat", "jumpingjack", "lunge", "situp", "highknee", "burpee", "press", "plank"];
const repEntries = CATALOG.flatMap((e) => {
  const m = /^reps_([a-z]+)_(\d+)$/.exec(e.key);
  return m ? [{ key: e.key, ex: m[1] as Exercise, n: Number(m[2]) }] : [];
});

describe("the catalog's live activities", () => {
  it("every activity is offered, each count's proof text is the engine's habit text, and it parses back (Proof → RepSet)", () => {
    expect([...EXERCISES].sort()).toEqual([...ALL].sort());
    expect(Object.keys(ACTIVITY).sort()).toEqual([...ALL].sort());
    for (const ex of ALL) expect(repEntries.filter((r) => r.ex === ex).length).toBeGreaterThanOrEqual(2);
    for (const r of repEntries) {
      expect(proofTextOf(r.key)).toBe(repHabitText(r.ex, r.n));
      expect(parseRepHabit(proofTextOf(r.key)!)).toEqual({ exercise: r.ex, target: r.n });
      expect(r.n).toBeGreaterThanOrEqual(1);
      expect(r.n).toBeLessThanOrEqual(REP_TARGET_LIMIT(r.ex));
    }
    // The counts asked for: the plank in seconds.
    const counts = (ex: Exercise) => repEntries.filter((r) => r.ex === ex).map((r) => r.n);
    expect(counts("jumpingjack")).toEqual([20, 30, 50]);
    expect(counts("lunge")).toEqual([10, 20]);
    expect(counts("situp")).toEqual([10, 20, 30]);
    expect(counts("highknee")).toEqual([20, 40]);
    expect(counts("burpee")).toEqual([5, 10, 15]);
    expect(counts("press")).toEqual([10, 20]);
    expect(counts("plank")).toEqual([30, 60, 90]);
    expect(counts("pushup")).toEqual([10, 20, 30, 50]);
    expect(counts("squat")).toEqual([10, 20, 30, 50]);
    expect(proofTextOf("reps_plank_60")).toBe("60-second plank");
    expect(exerciseUnit("plank")).toBe("seconds");
  });

  it("each activity has its own icon (in the bundled icon font) and a quick pick", () => {
    const names = new Set(ALL.map((ex) => REP_ICON[ex]));
    expect(names.size).toBe(ALL.length);
    for (const ex of ALL) expect(Object.hasOwn(icons, REP_ICON[ex])).toBe(true);
    for (const r of repEntries) expect(entryIcon(r.key)).toBe(REP_ICON[r.ex]);
    expect(objectIconOfText("25 jumping jacks")).toBe(REP_ICON.jumpingjack); // a count the catalog doesn't list
    for (const ex of ALL) expect(QUICK_PICK_OBJECTS.slice(0, ALL.length).some((k) => k.startsWith(`reps_${ex}_`))).toBe(true);
  });

  it("the plain words lead to an activity's first count, a count to its own set", () => {
    const index = buildIndex((key) => t(`additions.objects.entry.${key}` as CopyKey));
    const top = (q: string) => searchObjects(index, q)[0]?.entry.key;
    expect(top("jumping jacks")).toBe("reps_jumpingjack_20");
    expect(top("star jumps")).toBe("reps_jumpingjack_20");
    expect(top("50 jumping jacks")).toBe("reps_jumpingjack_50");
    expect(top("lunges")).toBe("reps_lunge_10");
    expect(top("sit ups")).toBe("reps_situp_10");
    expect(top("situps")).toBe("reps_situp_10");
    expect(top("high knees")).toBe("reps_highknee_20");
    expect(top("burpees")).toBe("reps_burpee_5");
    expect(top("overhead press")).toBe("reps_press_10");
    expect(top("shoulder press")).toBe("reps_press_10");
    expect(top("plank")).toBe("reps_plank_30");
    expect(top("1 minute plank")).toBe("reps_plank_60");
    expect(top("90 second plank")).toBe("reps_plank_90");
    expect(top("air squats")).toBe("reps_squat_20");
    expect(top("push ups")).toBe("push_ups"); // the photo proof keeps its words
  });

  it("a draft saved by an older build (reps_pushups_20) still loads, as today's key", () => {
    expect(currentEntryKey("reps_pushups_20")).toBe("reps_pushup_20");
    expect(currentEntryKey("reps_squats_10")).toBe("reps_squat_10");
    expect(currentEntryKey("reps_plank_30")).toBe("reps_plank_30");
    expect(savedEntry("reps_pushups_20")).toBe("reps_pushup_20");
    expect(savedEntry("reps_nope_20")).toBeNull();
    expect(savedHabits({ habits: ["arms"], habitObjectEntries: ["reps_pushups_20"] })).toEqual([{ name: "arms", entry: "reps_pushup_20" }]);
  });
});

describe("the set screen's per-activity copy and timing", () => {
  it("every activity has its label, start position, first step and half-rep hint; the phone goes where it can see the move", () => {
    for (const ex of ALL) {
      for (const k of ["label", "position", "begin", "halfRep"]) expect(t(`additions.reps.ex.${ex}.${k}` as CopyKey)).toMatch(/\S/);
      expect(t(`additions.reps.ex.${ex}.position` as CopyKey)).toMatch(/^Get into position: /);
    }
    for (const ex of ["pushup", "plank", "situp"] as const) expect(ACTIVITY[ex].placement).toBe("floor");
    expect(ACTIVITY.burpee.placement).toBe("floorTall");
    for (const ex of ["squat", "lunge", "highknee", "jumpingjack", "press"] as const) expect(ACTIVITY[ex].placement).toBe("chair");
    for (const k of ["placeFloor", "placeFloorTall", "placeChair", "frame", "frameArms"]) expect(t(`additions.reps.${k}` as CopyKey)).toMatch(/level|any angle/);
    // "Deeper" / "go lower" only fit where the effort goes down.
    expect(ALL.filter((ex) => ACTIVITY[ex].down).sort()).toEqual(["burpee", "lunge", "pushup", "squat"]);
  });

  it("the plank is timed: only its tens are spoken, and a set fits its hold plus the freeze", () => {
    expect(isTimed("plank")).toBe(true);
    expect(ALL.filter(isTimed)).toEqual(["plank"]);
    expect([1, 9, 10, 11, 20, 50, 60].filter((n) => saysCount("plank", n))).toEqual([10, 20, 50, 60]);
    expect([1, 2, 3].every((n) => saysCount("jumpingjack", n))).toBe(true);
    expect(setSeconds("plank", 60)).toBeGreaterThan(60 + 8);
    expect(setSeconds("plank", 180)).toBeLessThan(240); // the server's REP_SET_MAX_MS
    expect(setSeconds("pushup", 20)).toBe(80);
    expect(t("additions.reps.ofTargetSeconds", { target: 60 })).toBe("of 60 seconds");
    expect(t("additions.reps.startSeconds", { target: 60, label: t("additions.reps.ex.plank.label") })).toBe("Start: 60-second plank");
  });
});

describe("the roll fix: a tilted pose is turned back upright before the counter and the trace", () => {
  /**
   * What the front camera's (unmirrored) frame shows when the phone is rolled t degrees clockwise past its bucket
   * (RepCounterView.kt: roll = atan2(-gx, gy), tilt = roll − bucket, positive = clockwise from the screen): the scene
   * turns clockwise about the frame's centre, gravity-down going to (−sin t, cos t). Pixel proportions: x × aspect.
   */
  const tiltScene = (p: number[], tDeg: number, aspect: number) => {
    const a = (tDeg * Math.PI) / 180, out = p.slice();
    for (let j = 0; j < p.length; j += 3) {
      const x = (p[j]! - 500) * aspect, y = p[j + 1]! - 500;
      out[j] = Math.round(500 + (x * Math.cos(a) - y * Math.sin(a)) / aspect);
      out[j + 1] = Math.round(500 + x * Math.sin(a) + y * Math.cos(a));
    }
    return out;
  };
  // A person standing upright in the middle of a portrait frame: shoulders, elbows, wrists, hips, knees, ankles (L, R).
  const standing = [
    460, 300, 99, 540, 300, 99, 450, 400, 99, 550, 400, 99, 450, 480, 99, 550, 480, 99,
    470, 520, 99, 530, 520, 99, 470, 650, 99, 530, 650, 99, 470, 780, 99, 530, 780, 99,
  ];
  const mid = (p: number[], j: number) => [(p[j * 3]! + p[(j + 1) * 3]!) / 2, (p[j * 3 + 1]! + p[(j + 1) * 3 + 1]!) / 2] as const;

  it("the sign matches the camera: a body tilted by +t and fed with tilt = t comes out upright", () => {
    for (const aspect of [0.75, 4 / 3]) for (const tDeg of [-19, -12, -5, 5, 12, 19]) {
      const tilted = tiltScene(standing, tDeg, aspect);
      // Gravity-down (shoulders → ankles) in the tilted frame points (−sin t, cos t): clockwise for a positive tilt.
      const [sx, sy] = mid(tilted, 0), [ax, ay] = mid(tilted, 10);
      expect(Math.sign((ax - sx) * aspect)).toBe(-Math.sign(tDeg));
      expect(ay - sy).toBeGreaterThan(0);
      const back = uprightPose(tilted, tDeg, aspect);
      for (let j = 0; j < 36; j++) expect(Math.abs(back[j]! - standing[j]!)).toBeLessThanOrEqual(2);
      // The wrong sign doubles the lean instead.
      const wrong = uprightPose(tilted, -tDeg, aspect);
      expect(Math.abs(mid(wrong, 10)[0] - mid(wrong, 0)[0])).toBeGreaterThan(Math.abs(ax - sx));
    }
  });

  it("leaves no pose, an empty pose and a level phone alone; keeps visibility; clamps to the frame", () => {
    expect(uprightPose([], 10, 0.75)).toEqual([]);
    const zeros = Array.from({ length: 36 }, () => 0);
    expect(uprightPose(zeros, 10, 0.75)).toEqual(zeros);
    expect(uprightPose(standing, 0, 0.75)).toBe(standing);
    const edge = standing.map((v, i) => (i % 3 === 0 ? (i < 18 ? 0 : 1000) : v));
    const turned = uprightPose(edge, 15, 0.75);
    for (let j = 0; j < 36; j++) {
      if (j % 3 === 2) expect(turned[j]).toBe(edge[j]);
      else { expect(turned[j]).toBeGreaterThanOrEqual(0); expect(turned[j]).toBeLessThanOrEqual(1000); expect(Object.is(turned[j], -0)).toBe(false); }
    }
    // The back camera's frame turns the other way.
    expect(uprightPose(tiltScene(standing, -10, 0.75), 10, 0.75, "back").every((v, j) => Math.abs(v - standing[j]!) <= 2)).toBe(true);
  });

  it("a recorded set filmed with the phone rolled 12–19° counts as it does level once turned back (the server recounts the same trace)", () => {
    const vectors = JSON.parse(readFileSync(join(__dirname, "../../../packages/engine/test-vectors/reps-vectors.json"), "utf8")).vectors as { name: string; trace: Trace; expect: { count: number } }[];
    for (const name of ["pushups", "squats", "front-pushups", "oblique-squats"]) {
      const v = vectors.find((x) => x.name === name)!;
      // Uncorrected (measured 2026-11-27 on this engine): the side-on push-ups count 0 of 5 at +16° and +19°, the side-on
      // squats 0 of 4 at +19° (the contract's limit 10); the head-on and oblique ones survive. Turned back, all count.
      for (const tDeg of [12, 16, -16, 19, -19]) {
        const fixed: number[] = [];
        for (let i = 0; i < v.trace.t.length; i++) {
          const s = v.trace.p.slice(i * 36, i * 36 + 36);
          fixed.push(...uprightPose(s.every((x) => x === 0) ? s : tiltScene(s, tDeg, v.trace.aspect), tDeg, v.trace.aspect));
        }
        expect([name, tDeg, countReps({ ...v.trace, p: fixed }).count]).toEqual([name, tDeg, v.expect.count]);
      }
    }
  });
});
