export type ProofGate = { status: number; member: boolean; day: number; numDays: number; startTs: number; daySeconds: number; now: number; alreadyRecorded: boolean };

export function proofRejection(input: ProofGate): string | null {
  if (!input.member) return "non_member";
  if (input.status !== 1) return "not_active";
  if (!Number.isInteger(input.day) || input.day < 0 || input.day >= input.numDays) return "wrong_day";
  const current = Math.floor((input.now - input.startTs) / input.daySeconds);
  if (current !== input.day) return "outside_day_window";
  if (input.alreadyRecorded) return "duplicate";
  return null;
}

/**
 * No new photo challenge this close to the end of the day: upload + the Keeper's check + record_checkin must land
 * before the boundary (the program has no grace period), or an honest proof turns into a miss. Matters for short
 * demo days (120 s); with 86,400 s days it only closes the last 30 seconds.
 */
export const CHALLENGE_CUTOFF_SECONDS = 30;
export function dayClosing(input: { now: number; startTs: number; daySeconds: number; day: number }): boolean {
  const end = input.startTs + (input.day + 1) * input.daySeconds;
  return end - input.now < Math.min(CHALLENGE_CUTOFF_SECONDS, input.daySeconds / 4);
}

export function nudgeRejection(input: { member: boolean; recipientMember: boolean; self: boolean; day: number; currentDay: number; alreadyCheckedIn: boolean }): string | null {
  if (!input.member || !input.recipientMember || input.self) return "invalid_member";
  if (input.day !== input.currentDay) return "wrong_day";
  if (input.alreadyCheckedIn) return "already_checked_in";
  return null;
}

export type NudgeTarget = { wallet: string; canNudge: boolean; reason: "not_active" | "outside_day" | "self" | "already_checked_in" | "already_nudged" | null };

/** For each Oath member: can `viewer` nudge them right now? Mirrors POST /api/nudges. */
export function nudgeTargets(input: { status: number; members: string[]; daysKept: Record<string, number>; viewer: string; currentDay: number; numDays: number; nudgedToday: string[] }): NudgeTarget[] {
  return input.members.map((wallet) => {
    let reason: NudgeTarget["reason"] = null;
    if (input.status !== 1) reason = "not_active";
    else if (input.currentDay < 0 || input.currentDay >= input.numDays) reason = "outside_day";
    else {
      const rule = nudgeRejection({ member: input.members.includes(input.viewer), recipientMember: true, self: wallet === input.viewer, day: input.currentDay, currentDay: input.currentDay, alreadyCheckedIn: ((input.daysKept[wallet] ?? 0) & (1 << input.currentDay)) !== 0 });
      if (rule === "invalid_member") reason = "self";
      else if (rule === "already_checked_in") reason = "already_checked_in";
      else if (input.nudgedToday.includes(wallet)) reason = "already_nudged";
    }
    return { wallet, canNudge: reason === null, reason };
  });
}

/** On-chain object IDs, in program order (object_id indexes this list). */
export const OBJECT_IDS = ["dumbbell", "book", "water_bottle", "guitar", "running_shoe", "plant", "skipping_rope", "yoga_mat"];

/** Gestures a proof photo may be challenged with (MediaPipe GestureRecognizer labels). */
export const CHALLENGE_GESTURES = ["Thumb_Up", "Victory", "Open_Palm"] as const;
export type ChallengeGesture = (typeof CHALLENGE_GESTURES)[number];
export const CHALLENGE_TTL_MS = 2 * 60_000;
/** Extra time after expiry to finish detection and upload a photo taken in time. */
export const CHALLENGE_UPLOAD_GRACE_MS = 60_000;
export const REVIEW_AFTER_FAILED_TRIES = 3;

/** Random challenge gesture; never repeats the previous one so consecutive photos differ. */
export function pickChallenge(previous: string | null, random: () => number = Math.random): ChallengeGesture {
  const options = CHALLENGE_GESTURES.filter((g) => g !== previous);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

export function challengeUsable(issuedAtMs: number, nowMs: number, graceMs = 0): boolean {
  return nowMs >= issuedAtMs && nowMs - issuedAtMs < CHALLENGE_TTL_MS + graceMs;
}

/** Group review: a majority of the other members decides; ties reject. */
export function reviewOutcome(input: { approvals: number; rejections: number; reviewers: number }): "approved" | "rejected" | null {
  if (input.reviewers <= 0) return "rejected";
  if (input.approvals * 2 > input.reviewers) return "approved";
  if (input.rejections * 2 >= input.reviewers) return "rejected";
  return null;
}

/** What the vision model is asked to look for. The app sends these exact strings; /api/proof requires them to match. */
export const OBJECT_TEXT: Record<string, string> = {
  dumbbell: "dumbbell", book: "book", water_bottle: "water bottle", guitar: "guitar",
  running_shoe: "running shoes", plant: "plant", skipping_rope: "skipping rope", yoga_mat: "yoga mat",
};
export const GESTURE_TEXT: Record<ChallengeGesture, string> = {
  Thumb_Up: "thumbs up", Victory: "victory sign (index and middle finger in a V)", Open_Palm: "open palm facing the camera",
};

export const VERIFICATION_TTL_MS = 10 * 60_000;
export const DAILY_PHOTO_CHECKS = 20;

/** Why a /proof/verify result cannot be used for this check-in, or null if it can. */
export function verificationRejection(
  v: { wallet: string; status: string; usedAt: Date | null; createdAt: Date; expectedObject: string; expectedGesture: string } | null,
  wallet: string, expected: { object: string; gesture: string }, nowMs: number,
): string | null {
  if (!v || v.wallet !== wallet) return "Photo check not found";
  if (v.status !== "PASS") return "That photo did not pass the check";
  if (v.usedAt) return "That photo check was already used";
  if (nowMs - v.createdAt.getTime() > VERIFICATION_TTL_MS) return "That photo check has expired; take a new photo";
  if (v.expectedObject !== expected.object || v.expectedGesture !== expected.gesture) return "That photo was checked for a different object or gesture";
  return null;
}

/** Group-review photos are deleted when the group decides, or after this long if it never does. */
export const REVIEW_PHOTO_TTL_MS = 48 * 60 * 60_000;

export function reviewPhotoExpired(createdAt: Date, nowMs: number): boolean {
  return nowMs - createdAt.getTime() >= REVIEW_PHOTO_TTL_MS;
}

/**
 * POST /api/proof has two request kinds. Normally a passing photo check is required (`verificationId`).
 * The one exception is group review (`review: true`): after REVIEW_AFTER_FAILED_TRIES failed checks in a
 * group Oath, the photo itself is sent (no verificationId) and stored for the other members to judge.
 */
export function proofRequestKind(body: unknown): { kind: "verified" | "review" } | { status: 400; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.review === true) {
    if (typeof b.photo !== "string") return { status: 400, error: "Group review needs the photo from a failed check" };
    return { kind: "review" };
  }
  if (typeof b.verificationId !== "string" || !b.verificationId.trim() || b.verificationId.length > 64) return { status: 400, error: "Expected verificationId from POST /proof/verify" };
  return { kind: "verified" };
}

/** A POST /proof/verify row, with the Oath context the app sent (null for bounty and context-free checks). */
export type CheckRow = {
  wallet: string; status: string; oath: string | null; dayIndex: number | null; sessionId: number | null;
  expectedObject: string; expectedGesture: string; proofHash: string; createdAt: Date;
};

/** The end photo a group-review request is for: this wallet's photo 2 of `dayIndex`, for today's object and gesture. */
export type ReviewContext = {
  wallet: string; oath: string; dayIndex: number; session: { id: number; endAllowedAt: Date };
  object: string; gesture: string; // OBJECT_TEXT / GESTURE_TEXT, as sent to POST /proof/verify
};

/**
 * Failed checks that count toward group review, newest first. Only a FAIL the vision model returned for this wallet,
 * Oath, day and photo-2 session (taken after the end photo opened), for today's object and current gesture.
 */
export function reviewFailures<T extends CheckRow>(rows: T[], ctx: ReviewContext): T[] {
  return rows
    .filter((r) => r.status === "FAIL" && r.wallet === ctx.wallet && r.oath === ctx.oath && r.dayIndex === ctx.dayIndex
      && r.sessionId === ctx.session.id && r.createdAt.getTime() >= ctx.session.endAllowedAt.getTime()
      && r.expectedObject === ctx.object && r.expectedGesture === ctx.gesture)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Group-review rules checked after the shared day/session gates, in the order the route applies them. */
export function reviewRequestRejection(input: {
  isSolo: boolean; failures: Array<{ proofHash: string }>; photoHash: string; photoBytes: number; priorStatus: string | null;
}): { status: number; error: string } | null {
  if (input.isSolo) return { status: 409, error: "Solo Oaths have no group to check a photo; this day is not kept" };
  if (input.failures.length < REVIEW_AFTER_FAILED_TRIES) return { status: 409, error: `Group review is available after ${REVIEW_AFTER_FAILED_TRIES} failed checks of today's end photo with the current gesture` };
  if (input.photoBytes < 100 || input.photoBytes > 8_000_000) return { status: 413, error: "Photo must be between 100 bytes and 8 MB" };
  if (!input.failures.some((f) => f.proofHash === input.photoHash)) return { status: 422, error: "Send the photo from one of your failed checks" };
  if (input.priorStatus === "REJECTED" || input.priorStatus === "PENDING_REVIEW") return { status: 409, error: "This day already has a photo for your group" };
  return null;
}
