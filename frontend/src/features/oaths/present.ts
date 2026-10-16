// Turning Oath views into display strings and visuals. Money is formatted only here and in screens
// (CLAUDE.md › Money); all numbers come from the view.
import { OBJECTS } from "@kept/config";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import { color } from "@/theme";
import type { IconName } from "@/components/primitives";
import { formatSkr, formatSol } from "@/lib/format";
import { nowSeconds } from "@/features/time";
import type { GestureLabel } from "@/api/types";
import { habitsOf } from "./model";
import type { MemberView, OathFacts, ReviewMode } from "./model";
import { objectIconOfText, objectNameOfText } from "@/features/objects/proof";
import { shortWallet } from "./names";

export const skrText = (units: bigint, sign = false) => formatSkr(units, sign ? { sign: true } : {});
/** Whole SKR, rounded (tags, chips). */
export const skrWhole = (units: bigint) => formatSkr(units, { dp: 0 });

/** Amount and asset label for an Oath; native SOL uses exact lamport precision at the display edge. */
export function oathAmount(f: Pick<OathFacts, "asset">, units: bigint): string {
  return t(f.asset === "sol" ? "additions.core.solAmount" : "additions.core.skrAmount", { amount: f.asset === "sol" ? formatSol(units) : formatSkr(units, { dp: 0 }) });
}

export const oathAsset = (f: Pick<OathFacts, "asset">) => t(f.asset === "sol" ? "additions.core.sol" : "additions.core.skr");

export function memberName(m: Pick<MemberView, "isMe" | "facts">): string {
  if (m.isMe) return t("screens.D2.b6.r0.t");
  return m.facts.name ?? shortWallet(m.facts.wallet);
}

const PALETTE = [color.member.riya, color.member.arjun, color.member.dev];
export function memberColor(m: Pick<MemberView, "isMe" | "index">): string {
  return m.isMe ? color.member.you : PALETTE[m.index % PALETTE.length]!;
}
export const memberInitial = (m: Pick<MemberView, "isMe" | "facts">) => memberName(m).slice(0, 1).toUpperCase();

/** "Riya", "Riya and Dev", "Riya, Arjun and Dev". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${t("additions.core.and")} ${names[names.length - 1]}`;
}
/** "day 5", "days 2 and 6" (1-based days). */
export function dayList(days: number[]): string {
  return days.length === 1 ? t("additions.core.dayList", { list: days[0]! }) : t("additions.core.daysList", { list: listNames(days.map(String)) });
}

export const objectIcon = (objectId: number) => (OBJECTS[objectId]?.icon ?? OBJECTS[0].icon) as IconName;
export const objectName = (objectId: number) => t(`common.objects.${OBJECTS[objectId]?.icon ?? OBJECTS[0].icon}` as CopyKey);

/** An Oath's icon: that of its first habit's proof object. */
export const oathIcon = (f: Pick<OathFacts, "habits" | "goal" | "name" | "habitObjects" | "objectId">): IconName => objectIconOfText(habitsOf(f)[0]!.object);
/** The objects an Oath's habits are proven with, each once: "Dumbbell · Book". */
export const oathObjects = (f: Pick<OathFacts, "habits" | "goal" | "name" | "habitObjects" | "objectId">): string => [...new Set(habitsOf(f).map((h) => objectNameOfText(h.object)))].join(" · ");

export const reviewText = (m: ReviewMode) => t(m === "ai" ? "screens.C5.b1.o0.t" : "screens.C5.b1.o1.t");

const GESTURE_KEY: Partial<Record<GestureLabel, "thumb" | "peace" | "palm">> = { thumbs_up: "thumb", victory: "peace", open_palm: "palm" };
/** The ProofCamera badge key; the backend's two extra gestures have no design asset (BACKEND_GAPS P0-3). */
export const gestureKey = (g: GestureLabel) => GESTURE_KEY[g];
/** "victory sign", "closed fist" (lower case, as in F1 › b0.label). */
export function gestureText(g: GestureLabel): string {
  const key = GESTURE_KEY[g];
  if (key) return t(`common.gestures.${key}`).toLowerCase();
  return t(g === "closed_fist" ? "additions.core.gestureClosedFist" : "additions.core.gesturePointingUp");
}

/** Weekday ("Sunday") or short date ("Sun 5 Oct") for unix seconds, in the device locale's English form. */
export const weekday = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-GB", { weekday: "long" });
export const shortDate = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");

/** "Starts tonight at midnight" when day 1 is the coming midnight, else "Day 1 starts Saturday" (Bounties open for days). */
export function startsTitle(secondsToStart: number): string {
  const at = new Date((nowSeconds() + secondsToStart) * 1000);
  const tonight = new Date(nowSeconds() * 1000);
  tonight.setHours(24, 0, 0, 0);
  return at.getTime() <= tonight.getTime() + 60_000 ? t("additions.waiting.startsTonight") : t("additions.waiting.startsOn", { day: at.toLocaleDateString("en-GB", { weekday: "long" }) });
}
