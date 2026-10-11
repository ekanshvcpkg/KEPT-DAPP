// Storage for zustand `persist`. Values are JSON; bigint is never stored.
// Demo and Live keep separate data (session, settings, drafts, device Oath facts): every store made with
// `scopedPersist` lives under `kept.<scope>.<name>`, where the scope is the app mode (state/mode.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { secureStore } from "@/lib/secureStore";
import { createJSONStorage } from "zustand/middleware";
import type { PersistOptions } from "zustand/middleware";

/** Unscoped: the mode itself and the Dev menu. */
export const persistStorage = createJSONStorage(() => AsyncStorage);

type StorageScope = "demo" | "live" | "none";
let scope: StorageScope = "none";
let isReady = false;
let markReady: () => void = () => {};
/** Scoped reads and writes wait until the mode has loaded, so nothing lands under the wrong scope. */
const ready = new Promise<void>((r) => { markReady = r; });

export function setStorageScope(s: StorageScope): void { scope = s; isReady = true; markReady(); }
export const storageScope = (): StorageScope => scope;
/** `kept.session` → `kept.demo.session`. */
const scopedKey = (name: string, s: StorageScope = scope): string => name.replace(/^kept\./, `kept.${s}.`);

/** The key under the scope current when the call was made (a write just before a mode switch stays in its mode). */
async function keyFor(name: string): Promise<string> {
  if (isReady) return scopedKey(name);
  await ready;
  return scopedKey(name);
}
const scopedAsync = {
  getItem: async (name: string) => AsyncStorage.getItem(await keyFor(name)),
  setItem: async (name: string, value: string) => { await AsyncStorage.setItem(await keyFor(name), value); },
  removeItem: async (name: string) => { await AsyncStorage.removeItem(await keyFor(name)); },
};
const scopedStorage = createJSONStorage(() => scopedAsync);

interface Rehydratable { persist: { rehydrate(): Promise<void> | void } }
const scopedStores: Rehydratable[] = [];

/**
 * Persist options for a store whose data belongs to one mode. `initial` is the store's data with nothing
 * saved: loading another scope starts from it, so nothing carries over from the previous mode.
 */
export function scopedPersist<S>(name: string, initial: Partial<S>): PersistOptions<S, S> {
  return {
    name,
    storage: scopedStorage as PersistOptions<S, S>["storage"],
    merge: (saved, current) => ({ ...current, ...initial, ...(saved as Partial<S> | undefined) }),
  };
}
/** Stores made with `scopedPersist` register here so a mode change can reload them all. */
export function registerScoped(store: Rehydratable): void { scopedStores.push(store); }
export async function rehydrateScoped(): Promise<void> { await Promise.all(scopedStores.map((s) => s.persist.rehydrate())); }

/** Removes everything saved under a scope (leaving Demo wipes it), secrets included. */
export async function clearScope(s: StorageScope): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`kept.${s}.`));
  if (keys.length) await AsyncStorage.multiRemove(keys);
  await Promise.all([...secretNames].map((n) => secureStore.deleteItem(secretKey(n, s)).catch(() => undefined)));
}

// ── Secrets ── Fields named in `secretPersist` (the sign-in token) never reach AsyncStorage, which is a
// plain file any backup or rooted phone can read: they live in expo-secure-store (Android Keystore) under
// `kept.<scope>.<name>.<field>`, and the rest of the store persists as usual. A token an older build
// left in AsyncStorage moves to the secure store the first time it's read.
const secretNames = new Set<string>();
const secretKey = (name: string, s: StorageScope = scope) => `${scopedKey(name, s)}.secret`;

interface Saved { state?: Record<string, unknown>; version?: number }

function secretStorage(fields: readonly string[]) {
  const split = (raw: string) => {
    const saved = JSON.parse(raw) as Saved;
    const secrets: Record<string, unknown> = {};
    for (const f of fields) if (saved.state && f in saved.state) { secrets[f] = saved.state[f]; delete saved.state[f]; }
    return { rest: JSON.stringify(saved), secrets: JSON.stringify(secrets) };
  };
  return {
    getItem: async (name: string): Promise<string | null> => {
      await keyFor(name);
      const raw = await scopedAsync.getItem(name);
      if (raw === null) return null;
      const saved = JSON.parse(raw) as Saved;
      if (fields.some((f) => saved.state?.[f] != null)) {
        // An older build's plain copy: move it, then rewrite without it.
        const { rest, secrets } = split(raw);
        await secureStore.setItem(secretKey(name), secrets);
        await scopedAsync.setItem(name, rest);
        return raw;
      }
      const stored = await secureStore.getItem(secretKey(name)).catch(() => null);
      if (stored && saved.state) Object.assign(saved.state, JSON.parse(stored) as Record<string, unknown>);
      return JSON.stringify(saved);
    },
    setItem: async (name: string, value: string): Promise<void> => {
      await keyFor(name);
      const { rest, secrets } = split(value);
      await secureStore.setItem(secretKey(name), secrets);
      await scopedAsync.setItem(name, rest);
    },
    removeItem: async (name: string): Promise<void> => {
      await keyFor(name);
      await secureStore.deleteItem(secretKey(name)).catch(() => undefined);
      await scopedAsync.removeItem(name);
    },
  };
}

/** `scopedPersist`, with `secret` fields kept in the secure store instead of AsyncStorage. */
export function secretPersist<S>(name: string, initial: Partial<S>, secret: readonly (keyof S & string)[]): PersistOptions<S, S> {
  secretNames.add(name);
  return { ...scopedPersist<S>(name, initial), storage: createJSONStorage(() => secretStorage(secret)) as PersistOptions<S, S>["storage"] };
}
