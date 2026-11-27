// What a failed proof says on F2a: the part that actually failed, never the photo habit's challenge gesture for a rep
// set (whose freeze move is one raised hand). The Keeper's own reason is shown under it.
import { parseRepHabit } from "@kept/engine";
import { t } from "@/copy";
import { objectNameOfText } from "@/features/objects/proof";
import type { Challenge } from "@/api/types";
import type { KeeperLine } from "@/copy";
import { gestureText } from "./present";

export type ProofFeedback = { objectPresent?: boolean; gestureMatches?: boolean; looksLikeScreen?: boolean; reason?: string };

/** F2a's headline for a failed check of challenge `c`. */
export function failHeadline(c: Pick<Challenge, "object" | "gesture">, f: ProofFeedback | undefined): string {
  if (f?.looksLikeScreen) return t("additions.proof.failScreen");
  const rep = parseRepHabit(c.object);
  if (rep) {
    // A rep set is judged on its freeze frame: the person mid-activity with one hand raised; or refused by the recount.
    if (f?.objectPresent === false) return rep.exercise === "plank" ? t("additions.proof.failRepPlank") : t("additions.proof.failRepPose", { activity: t(`additions.reps.ex.${rep.exercise}.label`) });
    if (f?.gestureMatches === false) return t("additions.proof.failRepHand");
    return t("additions.proof.failRepSet");
  }
  if (f?.objectPresent === false) return t("additions.proof.failObject", { object: objectNameOfText(c.object).toLowerCase() });
  if (f?.gestureMatches === false) return t("screens.F2a.b0.label", { gesture: gestureText(c.gesture) });
  return t("additions.proof.failOther");
}

/** The Keeper's line on F2a, for what failed (the design's single line was a victory-sign hint after any failure). */
export function failKeeperLine(c: Pick<Challenge, "object" | "gesture">, f: ProofFeedback | undefined): KeeperLine {
  const line = (() => {
    if (f?.looksLikeScreen) return t("additions.proof.keeperFail.screen");
    if (parseRepHabit(c.object)) {
      if (f?.objectPresent === false) return t("additions.proof.keeperFail.repPose");
      if (f?.gestureMatches === false) return t("additions.proof.keeperFail.repHand");
      // "Every rep, full range" only when the recount came up short; any other refusal (a gap, the freeze, a reused set).
      return f?.reason?.startsWith("The Keeper counted") ? t("additions.proof.keeperFail.repSet") : t("additions.proof.keeperFail.repOther");
    }
    if (f?.objectPresent === false) return t("additions.proof.keeperFail.object", { object: objectNameOfText(c.object).toLowerCase() });
    if (f?.gestureMatches === false && (c.gesture === "thumbs_up" || c.gesture === "victory" || c.gesture === "open_palm")) return t(`additions.proof.keeperFail.${c.gesture}`);
    return t("additions.proof.keeperFail.other");
  })();
  return { mood: "soft", line };
}

/** Whether the challenge's gesture is part of this habit's proof (photo habits) or not (rep sets: one raised hand). */
export const showsChallengeGesture = (c: Pick<Challenge, "object"> | undefined): boolean => !!c && !parseRepHabit(c.object);
