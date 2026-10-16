// The Demo's pre-filled Oath, for filming the app: a group Oath about running, proven with a running shoe. The create
// flow opens on it (name, habit, proof object, length, stake all filled in), so a recording is taps, not typing, and the
// Oath that comes out already has its friends and is on day 1, so the first photo can be taken straight away.
// Demo only: Live never pre-fills anything. Turn it off with `useSettings.demoPrefill`.
import type { OathDraft } from "@/state/drafts";

export const SHOWCASE_DRAFT: OathDraft = {
  name: "Morning Run",
  habits: ["Run 5 km before work"],
  objectId: 4,
  objectEntry: "running_shoe",
  habitObjectIds: [4],
  habitObjectEntries: ["running_shoe"],
  numDays: 7,
  isSolo: false,
  stakeUsd: 10,
  stakeLamports: "50000000",
  reviewMode: "ai_group",
  demoShowcase: true,
};

/** A draft nobody has started: no name, and no habit with any text. */
export const isBlankDraft = (d: Pick<OathDraft, "name" | "habits">): boolean => !d.name.trim() && d.habits.every((h) => !h.trim());
