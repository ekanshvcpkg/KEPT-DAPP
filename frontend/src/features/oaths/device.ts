// Device-side Oath state: local names/review settings, cached server goal and habits, photo 1 progress,
// and which result screens and recaps were already shown (D-8, D-29).
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { registerScoped, scopedPersist } from "@/state/storage";
import type { ReviewMode } from "./model";
import { useEffect, useState } from "react";

/** Result screens shown once per Oath (D-29): `${oathId}:${id}` in shownResults. */
export const RESULT_SCREENS = ["L1", "L2", "L3", "L4", "L4·m", "L4·b", "L5", "L6", "H4", "H5", "R4", "R4·lost"] as const;

interface DeviceOathState {
  names: Record<string, string>;
  reviewModes: Record<string, ReviewMode>;
  goals: Record<string, string>;
  habits: Record<string, string[]>;
  /** What each habit is proven with (text, same order as `habits`). */
  habitObjects: Record<string, string[]>;
  /** Invite codes for Oaths created here (the backend can look them up, but not list them). */
  codes: Record<string, string>;
  /** Oath id → today's proven habits, as [dayIndex, habit positions] (what this device has seen pass; the server is the record). */
  habitsDone: Record<string, [number, number[]]>;
  /** `${oath id}:${habit}` → failed checks of that habit today: [dayIndex, count]. */
  fails: Record<string, [number, number]>;
  /** `${oathId}:${outcome}` keys of result screens already shown (D-29). */
  shownResults: string[];
  /** Local date ("2026-10-09") the daily recap was last shown (D-8). */
  recapShownOn: string | null;
  /** Oaths created or joined on this device, so they list even if an RPC index query misses them. */
  known: string[];
  /** Oath id → the HP the Oath screen last showed (motion.md §2–3: damage / heal play from it). */
  seenHp: Record<string, number>;
  remember(id: string, extra?: { name?: string; reviewMode?: ReviewMode; goal?: string; habits?: string[]; habitObjects?: string[]; code?: string }): void;
  rename(id: string, name: string): void;
  /** A habit's photo passed on `day`: remembers it, and returns every habit proven that day. */
  passHabit(id: string, day: number, habit: number): number[];
  /** The habits the server says are proven on `day` (replaces what this device remembered). */
  setHabitsDone(id: string, day: number, done: number[]): void;
  failHabit(id: string, habit: number, day: number): number;
  markShown(key: string): void;
  markRecap(date: string): void;
  seeHp(id: string, hp: number): void;
}

const EMPTY = { names: {}, reviewModes: {}, goals: {}, habits: {}, habitObjects: {}, codes: {}, habitsDone: {}, fails: {}, shownResults: [], recapShownOn: null, known: [], seenHp: {} };

export const useDeviceOaths = create<DeviceOathState>()(persist((set, get) => ({
  ...EMPTY,
  remember: (id, extra = {}) => set((s) => ({
    known: s.known.includes(id) ? s.known : [...s.known, id],
    ...(extra.name ? { names: { ...s.names, [id]: extra.name } } : {}),
    ...(extra.reviewMode ? { reviewModes: { ...s.reviewModes, [id]: extra.reviewMode } } : {}),
    ...(extra.goal ? { goals: { ...s.goals, [id]: extra.goal } } : {}),
    ...(extra.habits ? { habits: { ...s.habits, [id]: extra.habits } } : {}),
    ...(extra.habitObjects ? { habitObjects: { ...s.habitObjects, [id]: extra.habitObjects } } : {}),
    ...(extra.code ? { codes: { ...s.codes, [id]: extra.code } } : {}),
  })),
  rename: (id, name) => set((s) => ({ names: { ...s.names, [id]: name } })),
  passHabit: (id, day, habit) => {
    const prev = get().habitsDone[id];
    const done = [...new Set([...(prev && prev[0] === day ? prev[1] : []), habit])].sort((a, b) => a - b);
    set((s) => ({ habitsDone: { ...s.habitsDone, [id]: [day, done] } }));
    return done;
  },
  setHabitsDone: (id, day, done) => set((s) => ({ habitsDone: { ...s.habitsDone, [id]: [day, [...done].sort((a, b) => a - b)] } })),
  failHabit: (id, habit, day) => {
    const key = `${id}:${habit}`;
    const prev = get().fails[key];
    const count = prev && prev[0] === day ? prev[1] + 1 : 1;
    set((s) => ({ fails: { ...s.fails, [key]: [day, count] } }));
    return count;
  },
  markShown: (key) => set((s) => ({ shownResults: s.shownResults.includes(key) ? s.shownResults : [...s.shownResults, key] })),
  markRecap: (date) => set({ recapShownOn: date }),
  seeHp: (id, hp) => set((s) => (s.seenHp[id] === hp ? s : { seenHp: { ...s.seenHp, [id]: hp } })),
}), scopedPersist<DeviceOathState>("kept.oaths.device", EMPTY)));
registerScoped(useDeviceOaths);

/**
 * The HP this device last showed for an Oath, when it differs from `hp` (an unseen change: the panel
 * plays damage or heal from it, motion.md §2–3); undefined on a first visit or when nothing changed.
 * Read once when the screen opens; the current HP is recorded as seen.
 */
export function useLastSeenHp(id: string, hp: number): number | undefined {
  const [from] = useState(() => useDeviceOaths.getState().seenHp[id]);
  useEffect(() => { useDeviceOaths.getState().seeHp(id, hp); }, [id, hp]);
  return from === undefined || from === hp ? undefined : from;
}
