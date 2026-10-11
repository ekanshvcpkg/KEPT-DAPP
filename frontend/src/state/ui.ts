// Transient UI driven from anywhere: FX bursts, the Dev menu. (The Keeper's note lives in its screen:
// components/keeper/ScreenKeeper.)
import { create } from "zustand";
import { navigationRef } from "@/app/nav";
import type { FxKind } from "@/components/chrome";

/**
 * The haptic of an FX moment (motion.md §5–8): kept = success at 0 (F5), payout = success at 200,
 * broken = error then heavy, comeback = success then medium (L6). Defaults from the kind.
 */
type FxFeel = "kept" | "payout" | "broken" | "comeback" | "none";

interface UiState {
  /** `route`: the key of the screen that played it; the layer clears when that screen isn't current. */
  fx: { kind?: FxKind; feel: FxFeel; id: number; route?: string } | null;
  devMenu: boolean;
  playFx(kind: FxKind | undefined, feel?: FxFeel, route?: string): void;
  clearFx(): void;
  setDevMenu(open: boolean): void;
}

const currentRouteKey = () => (navigationRef.isReady() ? navigationRef.getCurrentRoute()?.key : undefined);

export const useUi = create<UiState>()((set) => ({
  fx: null, devMenu: false,
  playFx: (kind, feel, route) => set((s) => ({
    fx: {
      ...(kind ? { kind } : {}), feel: feel ?? (kind === "embers" ? "broken" : "none"), id: (s.fx?.id ?? 0) + 1,
      ...(route ?? currentRouteKey() ? { route: route ?? currentRouteKey()! } : {}),
    },
  })),
  clearFx: () => set({ fx: null }),
  setDevMenu: (devMenu) => set({ devMenu }),
}));
