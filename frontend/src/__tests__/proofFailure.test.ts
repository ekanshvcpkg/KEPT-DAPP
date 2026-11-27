// F2a names the part of a proof that failed. A rep set never shows the photo challenge's gesture ("victory sign"):
// its freeze move is one raised hand (the user heard "raise one hand", then read "Couldn't see a victory sign").
import { failHeadline, showsChallengeGesture } from "@/features/oaths/proofFailure";

const squats = { object: "10 squats", gesture: "victory" as const };
const plank = { object: "60-second plank", gesture: "victory" as const };
const photo = { object: "dumbbell", gesture: "victory" as const };

test("a rep set: the pose, the raised hand or the recount; never the challenge gesture", () => {
  expect(failHeadline(squats, { objectPresent: false, gestureMatches: true })).toBe("Couldn't see you doing squats");
  expect(failHeadline(squats, { objectPresent: true, gestureMatches: false })).toBe("Couldn't see a raised hand at the Freeze");
  expect(failHeadline(squats, { reason: "The Keeper counted 8 of 10 squats" })).toBe("That set didn't count");
  expect(failHeadline(plank, { objectPresent: false })).toBe("Couldn't see you holding a plank");
  for (const f of [undefined, {}, { objectPresent: false }, { gestureMatches: false }]) expect(failHeadline(squats, f)).not.toMatch(/victory/i);
  expect(showsChallengeGesture(squats)).toBe(false);
});

test("a photo habit: the object, the gesture or a screen", () => {
  expect(failHeadline(photo, { objectPresent: false, gestureMatches: true })).toBe("Couldn't see the dumbbell");
  expect(failHeadline(photo, { objectPresent: true, gestureMatches: false })).toMatch(/victory sign/i);
  expect(failHeadline(photo, { objectPresent: true, gestureMatches: true, looksLikeScreen: true })).toBe("That looks like a screen or a printout");
  expect(failHeadline(photo, { reason: "That photo was already used; take a new one" })).toBe("That proof wasn't accepted");
  expect(showsChallengeGesture(photo)).toBe(true);
});

test("the Keeper's F2a line follows what failed (no 'two fingers' after a rep set or another gesture)", () => {
  const { failKeeperLine } = jest.requireActual("@/features/oaths/proofFailure") as typeof import("@/features/oaths/proofFailure");
  expect(failKeeperLine(squats, { gestureMatches: false }).line).toMatch(/One hand up/);
  expect(failKeeperLine(squats, { objectPresent: false }).line).toMatch(/Stay in the move/);
  expect(failKeeperLine(squats, { reason: "The Keeper counted 8 of 10 squats" }).line).toMatch(/full range/);
  // Any other refusal (a gap, the freeze, a reused set) doesn't blame the range of motion.
  expect(failKeeperLine(squats, { reason: "The set has a gap: the camera stopped seeing it" }).line).toMatch(/One clean set/);
  expect(failKeeperLine({ object: "dumbbell", gesture: "thumbs_up" }, { objectPresent: true, gestureMatches: false }).line).toMatch(/Thumb up/);
  expect(failKeeperLine(photo, { objectPresent: false }).line).toMatch(/dumbbell/);
  for (const f of [{}, { gestureMatches: false }, { objectPresent: false }]) expect(failKeeperLine(squats, f).line).not.toMatch(/fingers/);
});

test("an Oath's proof kind: photos, counted sets or both (Today, the Oath preview)", () => {
  const { proofKind } = jest.requireActual("@/features/oaths/present") as typeof import("@/features/oaths/present");
  const f = (objects: string[]) => ({ name: "x", goal: "x", objectId: 0, habits: objects.map((_, i) => `h${i}`), habitObjects: objects });
  expect(proofKind(f(["10 squats", "20 push-ups"]))).toBe("reps");
  expect(proofKind(f(["dumbbell"]))).toBe("photo");
  expect(proofKind(f(["dumbbell", "10 squats"]))).toBe("mixed");
});
