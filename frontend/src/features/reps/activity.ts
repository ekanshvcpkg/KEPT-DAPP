// Each live activity as the set screen presents it: where the phone goes, what must fit in the picture, and whether its
// effort goes down (so "deeper" and "go lower" make sense). Pure data, no React Native. The counting is the engine's
// (@kept/engine reps), and so are the habit text, the unit (reps, or seconds for the plank) and the target limits.
import { exerciseUnit } from "@kept/engine";
import type { Exercise } from "@kept/engine";
import type { HypeActivity } from "@/features/keeper/hypeLines";

/** Where the phone goes: flat-ish on the floor (landscape), upright on the floor, or upright on a chair. */
export type Placement = "floor" | "floorTall" | "chair";

export interface Activity {
  /**
   * The floor work (push-ups, plank, sit-ups) is filmed from the floor, landscape: a camera looking down from a chair
   * makes depth leak into height (the contract's limit 1). Burpees go from standing to the floor: upright on the floor,
   * further away. The standing exercises: upright on a chair at knee to waist height.
   */
  placement: Placement;
  /** Raised hands must fit in the picture too (jumping jacks, overhead presses). */
  armsUp: boolean;
  /** The effort goes down: "deeper", "lower" and "get all the way down" fit its half reps. */
  down: boolean;
}

export const ACTIVITY: Record<Exercise, Activity> = {
  pushup: { placement: "floor", armsUp: false, down: true },
  squat: { placement: "chair", armsUp: false, down: true },
  jumpingjack: { placement: "chair", armsUp: true, down: false },
  lunge: { placement: "chair", armsUp: false, down: true },
  situp: { placement: "floor", armsUp: false, down: false },
  highknee: { placement: "chair", armsUp: false, down: false },
  burpee: { placement: "floorTall", armsUp: false, down: true },
  press: { placement: "chair", armsUp: true, down: false },
  plank: { placement: "floor", armsUp: false, down: false },
};

/** Counted in seconds held (the plank), not reps. */
export const isTimed = (exercise: Exercise): boolean => exerciseUnit(exercise) === "seconds";

/** What the Keeper's hype lines need to know about the activity (hypeLines.ts › hypeFits). */
export const hypeActivityOf = (exercise: Exercise): HypeActivity => ({ down: ACTIVITY[exercise].down, unit: exerciseUnit(exercise) });

/** The plank's count is spoken every this many seconds (the hype lines fill in between). */
export const TIMED_SAY_EVERY = 10;

/** Whether the Keeper says this count out loud: every rep, or a held plank's whole tens. */
export const saysCount = (exercise: Exercise, n: number): boolean => !isTimed(exercise) || n % TIMED_SAY_EVERY === 0;

/** Seconds a set may need, so it isn't started on a challenge about to expire: ~3 s a rep, or the hold, plus the freeze and setup. */
export const setSeconds = (exercise: Exercise, target: number): number => (isTimed(exercise) ? target + 45 : target * 3 + 20);
