// Features whose slice has no backend yet (docs/BACKEND_GAPS.md): in Live their entry points are hidden
// (D-80); in Demo (the mock) everything is there. A development build's Dev menu override counts too.
import type { Slice } from "@/api/types";
import { flags, useDev } from "@/state/dev";
import { useMode } from "@/state/mode";

type Feature = "rematch" | "createBounty" | "swap" | "creatorPages";
const SLICE: Record<Feature, Slice> = { rematch: "rematch", createBounty: "bounties", swap: "wallet", creatorPages: "profile" };

/** True while the feature's slice is the mock; the http slices don't have these yet. */
export const featureAvailable = (f: Feature): boolean => flags()[SLICE[f]] === "mock";

export function useFeature(f: Feature): boolean {
  const overrides = useDev((s) => s.overrides);
  const mode = useMode((s) => s.mode);
  return flags({ overrides }, mode)[SLICE[f]] === "mock";
}
