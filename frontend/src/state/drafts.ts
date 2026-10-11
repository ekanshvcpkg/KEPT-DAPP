// The create-Oath draft (C1–C6), kept across steps and restarts.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReviewMode } from "@/features/oaths/model";
import { registerScoped, scopedPersist } from "./storage";

export interface OathDraft {
  goal: string;
  objectId: number;
  numDays: 3 | 7 | 14;
  isSolo: boolean;
  /** Whole SKR per member: 500 | 1000 | 2500. */
  stakeSkr: number;
  reviewMode: ReviewMode;
  /** Stable chain ID across retries, so a delayed confirmation cannot create a second Oath. */
  chainOathId?: string;
}

const EMPTY_DRAFT: OathDraft = { goal: "", objectId: 0, numDays: 7, isSolo: false, stakeSkr: 1000, reviewMode: "ai_group" };

interface DraftState { draft: OathDraft; set(p: Partial<OathDraft>): void; reset(): void }

export const useDraft = create<DraftState>()(persist((set) => ({
  draft: EMPTY_DRAFT,
  set: (p) => set((s) => ({ draft: { ...s.draft, ...p } })),
  reset: () => set({ draft: EMPTY_DRAFT }),
}), scopedPersist<DraftState>("kept.draft", { draft: EMPTY_DRAFT })));
registerScoped(useDraft);
