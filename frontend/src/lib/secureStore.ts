// The Android Keystore (expo-secure-store) for secrets: the sign-in token and the wallet's auth token.
// A development build installed before the module was added has no native side, and importing the package
// then throws at startup ("Cannot find native module 'ExpoSecureStore'"). In development only, that falls
// back to AsyncStorage under a separate key prefix, with one warning; a release build always has the module,
// so there it fails loudly instead of quietly keeping secrets in a plain file. Rebuild the dev client
// (`expo run:android`) to get the real thing.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";

type Native = Pick<typeof import("expo-secure-store"), "getItemAsync" | "setItemAsync" | "deleteItemAsync">;

const PLAIN_PREFIX = "kept.insecure-dev.";
let native: Native | null | undefined;
let warned = false;

function load(): Native | null {
  if (native !== undefined) return native;
  try {
    if (requireOptionalNativeModule("ExpoSecureStore")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import throws at startup without the native module
      const mod = require("expo-secure-store") as Native;
      if (mod && typeof mod.getItemAsync === "function") {
        native = mod;
        return native;
      }
    }
  } catch {
    // Native module not linked into this build
  }
  if (!__DEV__) throw new Error("Cannot find native module 'ExpoSecureStore'");
  native = null;
  if (!warned) {
    warned = true;
    console.warn("expo-secure-store has no native module in this build: secrets fall back to AsyncStorage (development only). Rebuild the dev client.");
  }
  return native;
}

export const secureStore = {
  getItem: (key: string): Promise<string | null> => (load() ? load()!.getItemAsync(key) : AsyncStorage.getItem(PLAIN_PREFIX + key)),
  setItem: async (key: string, value: string): Promise<void> => { if (load()) await load()!.setItemAsync(key, value); else await AsyncStorage.setItem(PLAIN_PREFIX + key, value); },
  deleteItem: async (key: string): Promise<void> => { if (load()) await load()!.deleteItemAsync(key); else await AsyncStorage.removeItem(PLAIN_PREFIX + key); },
};
