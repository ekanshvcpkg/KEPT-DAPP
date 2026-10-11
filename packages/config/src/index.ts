// Product constants shared by the app and the engine. Every number here comes from
// design/rules.md or docs/DECISIONS.md; the comment says which.

/** Proof objects, in on-chain `object_id` order (must match OBJECT_IDS in backend/src/routes/v4.ts:22). */
export const OBJECTS = [
  { id: "dumbbell", icon: "dumbbell", asset: "object-dumbbell", nameWord: "iron" },
  { id: "book", icon: "book-open-variant", asset: "object-book", nameWord: "page" },
  { id: "water_bottle", icon: "bottle-soda-outline", asset: "object-water-bottle", nameWord: "hydrate" },
  { id: "guitar", icon: "guitar-acoustic", asset: "object-guitar", nameWord: "riff" },
  { id: "running_shoe", icon: "shoe-sneaker", asset: "object-running-shoe", nameWord: "stride" },
  { id: "plant", icon: "sprout", asset: "object-plant", nameWord: "green" },
  { id: "skipping_rope", icon: "jump-rope", asset: "object-skipping-rope", nameWord: "skip" },
  { id: "yoga_mat", icon: "yoga", asset: "object-yoga-mat", nameWord: "flow" },
] as const;
export type ObjectId = (typeof OBJECTS)[number]["id"];
export type ObjectIcon = (typeof OBJECTS)[number]["icon"];
export type ObjectNameWord = (typeof OBJECTS)[number]["nameWord"];

export function objectByIndex(index: number) {
  const o = OBJECTS[index];
  if (!o) throw new RangeError(`Unknown object_id ${index}`);
  return o;
}

/** The three proof gestures (rules.md §5). `key` matches the prototype (kept-kit.js GEST). */
export const GESTURES = [
  { id: "thumbs_up", key: "thumb", icon: "thumb-up", asset: "gesture-thumbs-up" },
  { id: "victory", key: "peace", icon: "hand-peace", asset: "gesture-victory-sign" },
  { id: "open_palm", key: "palm", icon: "hand-back-right", asset: "gesture-open-palm" },
] as const;
export type GestureId = (typeof GESTURES)[number]["id"];
export type GestureKey = (typeof GESTURES)[number]["key"];

/** Oath lengths in days (rules.md §1). */
export const LENGTHS = [3, 7, 14] as const;
export type OathLength = (typeof LENGTHS)[number];

/** SKR has 6 decimals (backend/scripts/v4-setup.ts:31). */
export const SKR_DECIMALS = 6;
export const SKR_UNIT = 10n ** BigInt(SKR_DECIMALS);
/** Stake per member in whole SKR (rules.md §1). */
export const STAKES_SKR = [500, 1000, 2500] as const;
export type StakeSkr = (typeof STAKES_SKR)[number];
export const stakeUnits = (skr: number): bigint => BigInt(skr) * SKR_UNIT;

export const GOAL_MAX = 60;
export const GOAL_MIN = 1;
/** Program limit (state.rs:3); DECISIONS D-11. */
export const MAX_MEMBERS = 4;
export const MIN_GROUP_MEMBERS = 2;

/** Basis points: 10_000 = 100 %. */
export const BPS = 10_000n;
/** KEPT fee on a Bounty pool at funding (rules.md §6). */
export const BOUNTY_FEE_BPS = 1_000n;
/**
 * What one miss costs, as a share of the member's ORIGINAL stake (D-93, owner model): 10 %, the same for every
 * miss, never more than what the member has left. It replaced stake / days × 1.5^k.
 */
export const MISS_BPS = 1_000n;

/** HP (rules.md §2, DECISIONS D-1, D-5). */
export const HP = {
  start: 100,
  max: 100,
  missGroup: 20,
  missSolo: 35,
  heal: 10,
  warnAtOrBelow: 40,
  dangerAtOrBelow: 20,
  segments: 20,
} as const;

/** Rematch (rules.md §4, DECISIONS amendments 2–3). */
export const REMATCH = {
  windowDays: 7,
  holdBps: 5_000n,
} as const;

/** Proof (rules.md §1, §5). */
export const PROOF = {
  photoTwoAttempts: 3,
  reviewPhotoTtlHours: 48,
} as const;

/** Deadline reminder threshold (DECISIONS D-7). */
export const DEADLINE_WARN_SECONDS = 2 * 60 * 60;

/** Kept rate (rules.md §7, DECISIONS D-12). */
export const KEPT_RATE = {
  newUnderDays: 10,
  decayPerDay: 0.97,
  cleanFinishPseudoDays: 2,
  priorDays: 5,
  priorRate: 0.8,
} as const;

/** Odds (rules.md §8, DECISIONS D-13). */
export const ODDS = {
  photoOneBoost: 0.1,
  lateNothingPenalty: 0.15,
  min: 0.05,
  max: 0.95,
} as const;
