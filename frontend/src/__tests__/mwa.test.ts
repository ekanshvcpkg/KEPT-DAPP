// The wallet's MWA auth_token is a credential: kept in the secure store, moved there from an older
// build's AsyncStorage copy, and reused for silent re-authorization.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";

const secure = (require("expo-secure-store") as { __store: Map<string, string> }).__store;
const ADDRESS = Buffer.alloc(32, 7).toString("base64");

function fakeWallet() {
  const authorize = jest.fn(async (_o: { auth_token?: string }) => ({ auth_token: "fresh-token", accounts: [{ address: ADDRESS }] }));
  (transact as jest.Mock).mockImplementation(async (fn: (w: unknown) => Promise<unknown>) => fn({ authorize }));
  return authorize;
}
/** `verified`: the identity site grants get_login_creds, so the wallet allows silent re-authorization (env.identity.verified). */
function freshModule(verified = true) {
  let m!: typeof import("@/chain/mwa");
  jest.isolateModules(() => {
    (require("@/config/env") as { env: { identity: { verified: boolean } } }).env.identity.verified = verified;
    m = require("@/chain/mwa") as typeof import("@/chain/mwa");
  });
  return m.mwaWallet;
}

beforeEach(async () => {
  secure.clear();
  await AsyncStorage.clear();
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true }); // back from the wallet
});

describe("MWA auth_token storage", () => {
  it("with an unverified identity, never sends the saved token (Phantom declines reauthorize) and asks afresh", async () => {
    secure.set("kept.mwa", JSON.stringify({ authToken: "old-token", address: "x" }));
    const authorize = fakeWallet();
    await freshModule(false).connect();
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize.mock.calls[0]![0].auth_token).toBeUndefined();
  });

  it("is saved in the secure store, not AsyncStorage", async () => {
    fakeWallet();
    await freshModule().connect();
    expect(secure.get("kept.mwa")).toContain("fresh-token");
    expect(await AsyncStorage.getItem("kept.mwa")).toBeNull();
  });

  it("moves an older build's copy and re-authorizes with it", async () => {
    await AsyncStorage.setItem("kept.mwa", JSON.stringify({ authToken: "old-token", address: "x" }));
    const authorize = fakeWallet();
    await freshModule().connect();
    expect(authorize.mock.calls[0]![0].auth_token).toBe("old-token");
    expect(await AsyncStorage.getItem("kept.mwa")).toBeNull();
  });

  it("forget removes it", async () => {
    fakeWallet();
    const w = freshModule();
    await w.connect();
    await w.forget();
    expect(secure.has("kept.mwa")).toBe(false);
  });
});
