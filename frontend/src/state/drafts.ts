// The create-Oath draft (C1–C6), kept across steps and restarts.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReviewMode } from "@/features/oaths/model";
import { registerScoped, scopedPersist } from "./storage";

export interface OathDraft {
  name: string;
  /** Daily habit names. Each index has a matching proof object selection. */
  habits: string[];
  /** The program's `object_id` (0-7): what the phone looks for in each photo. Separate from the goal text. */
  objectId: number;
  /** The catalog entry it was picked from on C2 (features/objects), for showing the pick again; the canonical `objectId` is what counts. */
  objectEntry?: string;
  /** Proof object assigned to each habit; indexes align with `habits`. */
  habitObjectIds?: number[];
  habitObjectEntries?: string[];
  numDays: 3 | 7 | 14;
  isSolo: boolean;
  /** Whole SKR per member: 500 | 1000 | 2500. */
  stakeSkr: number;
  reviewMode: ReviewMode;
  /** Stable chain ID across retries, so a delayed confirmation cannot create a second Oath. */
  chainOathId?: string;
}

const EMPTY_DRAFT: OathDraft = { name: "", habits: [""], objectId: 0, habitObjectIds: [], numDays: 7, isSolo: false, stakeSkr: 1000, reviewMode: "ai_group" };

interface DraftState { draft: OathDraft; set(p: Partial<OathDraft>): void; reset(): void }

const draftPersistence = scopedPersist<DraftState>("kept.draft", { draft: EMPTY_DRAFT });
export const useDraft = create<DraftState>()(persist((set) => ({
  draft: EMPTY_DRAFT,
  set: (p) => set((s) => ({ draft: { ...s.draft, ...p } })),
  reset: () => set({ draft: EMPTY_DRAFT }),
}), {
  ...draftPersistence,
  // Migrate a draft saved before C1 became the name step: carry the old single goal forward as habit 1.
  merge: (saved, current) => {
    const merged = draftPersistence.merge?.(saved, current) as DraftState;
    const previous = (saved as { draft?: Partial<OathDraft> & { goal?: string } } | undefined)?.draft;
    return {
      ...merged,
      draft: {
        ...EMPTY_DRAFT,
        ...previous,
        name: previous?.name ?? "",
        habits: previous?.habits ?? (previous?.goal?.trim() ? [previous.goal] : [""]),
        habitObjectIds: previous?.habitObjectIds ?? (previous?.habits ?? (previous?.goal?.trim() ? [previous.goal] : [])).map(() => previous?.objectId ?? 0),
        habitObjectEntries: previous?.habitObjectEntries ?? [],
      },
    };
  },
}));
registerScoped(useDraft);
