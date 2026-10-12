// Device settings with no backend yet: notification preferences (I4) and privacy switches (I7).
// Push preferences would live with the push token on the server (BACKEND_GAPS P1-11).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { registerScoped, scopedPersist } from "./storage";

export type Audience = 0 | 1 | 2; // Everyone · Oath partners · Only me (I7 segments)

interface SettingsState {
  notify: { nudges: boolean; deadline: boolean; reviews: boolean; results: boolean };
  visibility: { oaths: Audience; bounties: Audience; socials: Audience };
  findByName: boolean;
  anyoneInvite: boolean;
  /** Socials connected on I8 (X is the one with a handle in the prototype). */
  socials: { x: boolean; telegram: boolean; discord: boolean; farcaster: boolean };
  following: string[];
  /** I1's "Make it yours" banner was opened once (the prototype's `pt1`): it stays hidden after. */
  profileTipSeen: boolean;
  /** Today's card stack was swiped once: its "swipe" hint and nudge stop (D-85). */
  deckHintSeen: boolean;
  /** Demo only: the create flow opens on a pre-filled Oath (features/oaths/showcase.ts), for filming. */
  demoPrefill: boolean;
  setNotify(k: keyof SettingsState["notify"], on: boolean): void;
  setVisibility(k: keyof SettingsState["visibility"], a: Audience): void;
  set(p: Partial<Pick<SettingsState, "findByName" | "anyoneInvite" | "socials" | "profileTipSeen" | "deckHintSeen" | "demoPrefill">>): void;
  follow(name: string): void;
}

type SettingsData = Omit<SettingsState, "setNotify" | "setVisibility" | "set" | "follow">;

const DEFAULTS: SettingsData = {
  notify: { nudges: true, deadline: true, reviews: true, results: true },
  visibility: { oaths: 1, bounties: 0, socials: 1 },
  findByName: true,
  anyoneInvite: false,
  socials: { x: true, telegram: false, discord: false, farcaster: false },
  following: [],
  profileTipSeen: false,
  deckHintSeen: false,
  demoPrefill: true,
};

export const useSettings = create<SettingsState>()(persist((set) => ({
  ...DEFAULTS,
  setNotify: (k, on) => set((s) => ({ notify: { ...s.notify, [k]: on } })),
  setVisibility: (k, a) => set((s) => ({ visibility: { ...s.visibility, [k]: a } })),
  set: (p) => set(p),
  follow: (name) => set((s) => ({ following: s.following.includes(name) ? s.following : [...s.following, name] })),
}), scopedPersist<SettingsState>("kept.settings", DEFAULTS)));
registerScoped(useSettings);
