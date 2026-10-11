// Dev menu settings (development builds only): the mock scenario, plus per-slice API overrides and a mock
// wallet that apply ONLY while no app mode is chosen (tests and dev tooling). A chosen mode always wins:
// Demo is the mock for every slice, Live is http + MWA for every slice. Release builds ignore all of it.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PersistOptions } from "zustand/middleware";
import { SLICES } from "@/api/types";
import type { Slice, SliceMode } from "@/api/types";
import { DEFAULT_SCENARIO, SCENARIOS } from "@/api/mock/scenarios";
import type { Scenario } from "@/api/mock/scenarios";
import { useMode } from "./mode";
import type { AppMode } from "./mode";
import { persistStorage } from "./storage";

/** Demo is the mock for every slice; Live (and not chosen yet) is http for every slice. */
export function defaultFlags(mode: AppMode | null): Record<Slice, SliceMode> {
  return Object.fromEntries(SLICES.map((s) => [s, mode === "demo" ? "mock" : "http"])) as Record<Slice, SliceMode>;
}

export interface DevState {
  overrides: Partial<Record<Slice, SliceMode>>;
  scenario: Scenario;
  /** Mock wallet instead of MWA, while no app mode is chosen. Never applies to Live. */
  mockWallet: boolean;
  setSlice(slice: Slice, mode: SliceMode | null): void;
  setAll(mode: SliceMode): void;
  setScenario(s: Scenario): void;
  setMockWallet(on: boolean): void;
}

export const useDev = create<DevState>()(persist<DevState, [], [], { scenario: Scenario }>((set) => ({
  overrides: {}, scenario: DEFAULT_SCENARIO, mockWallet: false,
  setSlice: (slice, mode) => set((s) => {
    const overrides = { ...s.overrides };
    if (mode) overrides[slice] = mode; else delete overrides[slice];
    return { overrides };
  }),
  setAll: (mode) => set({ overrides: Object.fromEntries(SLICES.map((sl) => [sl, mode])), mockWallet: mode === "mock" }),
  setScenario: (scenario) => set({ scenario }),
  setMockWallet: (mockWallet) => set({ mockWallet }),
}), {
  name: "kept.dev",
  storage: persistStorage as PersistOptions<DevState, { scenario: Scenario }>["storage"],
  // Only the scenario survives a restart. Overrides and the mock wallet are per-run on purpose: a saved
  // one (the dev deep link used to save both) left every later Live sign-in on the mock.
  partialize: (s) => ({ scenario: s.scenario }),
  // Older builds also saved `overrides` and `mockWallet`: read the scenario and nothing else.
  merge: (saved, current) => {
    const scenario = (saved as { scenario?: Scenario } | undefined)?.scenario;
    return { ...current, scenario: scenario && (SCENARIOS as readonly string[]).includes(scenario) ? scenario : current.scenario };
  },
}));

/**
 * Effective mode per slice. A chosen mode decides alone: Demo is the mock, Live is the real backend, in
 * release and development builds alike (D-80: Live has no mock fallback, Demo has no network). The Dev
 * menu's overrides only apply while no mode is chosen.
 */
export function flags(state: Pick<DevState, "overrides"> = useDev.getState(), mode: AppMode | null = useMode.getState().mode): Record<Slice, SliceMode> {
  return __DEV__ && mode === null ? { ...defaultFlags(mode), ...state.overrides } : defaultFlags(mode);
}

/** The mock's scenario: the Dev menu's pick in development builds; release Demo is always the judges' account. */
export const mockScenario = (): Scenario => (__DEV__ ? useDev.getState().scenario : DEFAULT_SCENARIO);

/** The mock wallet is Demo's. Live always signs with MWA; a development build can only ask for the mock before a mode is chosen. */
export const mockWalletOn = (mode: AppMode | null = useMode.getState().mode): boolean => mode === "demo" || (__DEV__ && mode === null && useDev.getState().mockWallet);

/**
 * Dev deep link (`kept://dev/open/…&hold=1`): mock signatures and proof checks never finish, so the
 * pending screens (A2·s, C7, F2, …) can be looked at. Not persisted.
 */
export const useDevHold = create<{ hold: boolean; still: boolean; setHold(hold: boolean): void }>()((set) => ({
  hold: false,
  /** `still=1`: countdowns stop ticking, so uiautomator can read the screen (scripts/drive.mts). */
  still: false,
  setHold: (hold) => set({ hold }),
}));
/** Waits `ms`, or forever while the dev hold is on. */
export const devWait = (ms: number) => new Promise<void>((r) => { if (!useDevHold.getState().hold) setTimeout(r, ms); });
