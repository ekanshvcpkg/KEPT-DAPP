// The three intro pages (A1·i) show once per install, in Demo and Live alike: this is not a scoped store,
// because the mode isn't chosen until the intro is over (and "Exit demo" shouldn't bring it back).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage } from "./storage";

interface IntroState {
  seen: boolean;
  markSeen(): void;
}

export const useIntro = create<IntroState>()(persist((set) => ({
  seen: false,
  markSeen: () => set({ seen: true }),
}), { name: "kept.intro", storage: persistStorage }));
