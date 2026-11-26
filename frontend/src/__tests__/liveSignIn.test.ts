// Live sign-in end to end below the screens (docs/API.md › auth): the real MWA wrapper, the real HTTP client
// and the real sign-in feature, against test stand-ins for the wallet app and the backend (src/testing).
// Live has no mock path, so the edges are faked, not the app.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { getApi } from "@/api";
import { SLICES } from "@/api/types";
import { getWallet, isTxFailure } from "@/chain";
import { mwaWallet } from "@/chain/mwa";
import { signatureFromSigned } from "@/chain/signature";
import { env, walletChain } from "@/config/env";
import { restoreSession, signIn } from "@/features/auth";
import { setAppMode, startLive } from "@/features/mode";
import { useDev } from "@/state/dev";
import { useSession } from "@/state/session";
import { fakeBackend, fakeWallet, resetWallet, installFakeBackend, installFakeWallet } from "@/testing/fakeLive";

let restoreFetch = () => {};
// Jest's AppState is a stub whose `currentState` is a function; on a device the app is "active" again once the wallet returns.
beforeAll(() => { Object.defineProperty(AppState, "currentState", { value: "active", configurable: true }); });
beforeEach(async () => {
  await setAppMode(null);
  await AsyncStorage.clear();
  await mwaWallet.forget();
  useDev.setState({ overrides: {}, mockWallet: false });
  await startLive();
  useSession.getState().signOut();
});
afterEach(() => { restoreFetch(); resetWallet(); });

describe("signatureFromSigned", () => {
  const message = new TextEncoder().encode("KEPT V4 sign-in");
  const sig = Uint8Array.from({ length: 64 }, (_, i) => i);

  it("cuts the signature off the end of the wallet's signed payload", () => {
    expect(signatureFromSigned(new Uint8Array([...message, ...sig]), message)).toEqual(sig);
  });
  it("accepts a wallet that returns only the signature", () => {
    expect(signatureFromSigned(sig, message)).toEqual(sig);
  });
  it("refuses a payload for some other message, or of an odd size", () => {
    const other = new TextEncoder().encode("KEPT V4 sign-ouT");
    expect(() => signatureFromSigned(new Uint8Array([...other, ...sig]), message)).toThrow(/unexpected message signature/);
    expect(() => signatureFromSigned(new Uint8Array(10), message)).toThrow(/unexpected message signature/);
  });
});

describe("Live sign-in", () => {
  it("authorizes, signs the exact nonce message, verifies a bare 64-byte signature, then reads /api/me", async () => {
    const wallet = fakeWallet();
    const backend = fakeBackend({ genesis: true });
    installFakeWallet(wallet);
    restoreFetch = installFakeBackend(backend);

    const result = await signIn(getApi(), getWallet());

    expect(result).toEqual({ wallet: wallet.address, genesis: true });
    expect(backend.calls).toEqual(["POST /api/auth/nonce", "POST /api/auth/verify", "GET /api/me"]);
    const sent = backend.lastVerify()!;
    expect(Buffer.from(sent.signature, "base64")).toHaveLength(64); // the wallet's message+signature, trimmed
    expect(sent.message).toMatch(/^KEPT V4 sign-in\nWallet: \w+\nNonce: [0-9a-f]{64}\nThis signature only signs in and cannot move funds\.$/);
    expect(useSession.getState()).toMatchObject({ token: `fake.${wallet.address}`, wallet: wallet.address, genesis: true });
  });

  it("asks the wallet with the cluster and the app identity, and reuses its auth token for the signature once the identity is verified", async () => {
    const identity = env.identity as { verified: boolean };
    identity.verified = true;
    try {
      const wallet = fakeWallet();
      installFakeWallet(wallet);
      restoreFetch = installFakeBackend(fakeBackend());

      await signIn(getApi(), getWallet());

      expect(wallet.authorize).toHaveBeenCalledTimes(2); // connect, then the signing session
      expect(wallet.authorize.mock.calls[0]![0]).toEqual({ chain: walletChain, identity: { name: env.identity.name, uri: env.identity.uri } });
      expect(wallet.authorize.mock.calls[1]![0]).toMatchObject({ auth_token: "fake-auth-token" });
      expect(env.identity.uri).toBe("https://keptdapp.vercel.app");
    } finally { identity.verified = false; }
  });

  it("with an unverified identity (Phantom declines reauthorize), the signing session asks afresh instead of sending the token", async () => {
    const wallet = fakeWallet();
    installFakeWallet(wallet);
    restoreFetch = installFakeBackend(fakeBackend());
    await signIn(getApi(), getWallet());
    expect(wallet.authorize).toHaveBeenCalledTimes(2);
    expect(wallet.authorize.mock.calls[1]![0]).not.toHaveProperty("auth_token");
  });

  it("is still a successful sign-in without a Genesis Token (A3·no)", async () => {
    const wallet = fakeWallet();
    installFakeWallet(wallet);
    restoreFetch = installFakeBackend(fakeBackend({ genesis: false }));

    await expect(signIn(getApi(), getWallet())).resolves.toEqual({ wallet: wallet.address, genesis: false });
    expect(useSession.getState()).toMatchObject({ wallet: wallet.address, genesis: false });
    expect(useSession.getState().token).toBe(`fake.${wallet.address}`);
  });

  it("a declined wallet prompt is 'rejected' and never reaches the backend", async () => {
    for (const declines of ["authorize", "sign"] as const) {
      const backend = fakeBackend();
      installFakeWallet(fakeWallet({ declines }));
      restoreFetch = installFakeBackend(backend);
      const err = await signIn(getApi(), getWallet()).catch((e: unknown) => e);
      expect(isTxFailure(err) && err.kind).toBe("rejected");
      expect(useSession.getState().token).toBeNull();
      expect(backend.calls).not.toContain("POST /api/auth/verify");
      restoreFetch();
    }
  });

  it("refuses a signature the wallet returned in an unexpected shape, before the server sees it", async () => {
    const wallet = fakeWallet();
    wallet.signMessages.mockResolvedValue([new Uint8Array(10)]);
    const backend = fakeBackend();
    installFakeWallet(wallet);
    restoreFetch = installFakeBackend(backend);

    await expect(signIn(getApi(), getWallet())).rejects.toThrow(/unexpected message signature/);
    expect(backend.calls).toEqual(["POST /api/auth/nonce"]);
  });

  it("uses MWA and http in a development build even with Dev overrides and a mock wallet switched on", async () => {
    const wallet = fakeWallet();
    const backend = fakeBackend();
    installFakeWallet(wallet);
    restoreFetch = installFakeBackend(backend);
    useDev.setState({ overrides: Object.fromEntries(SLICES.map((s) => [s, "mock"])), mockWallet: true });

    expect(getWallet()).toBe(mwaWallet);
    await signIn(getApi(), getWallet());

    expect(wallet.authorize).toHaveBeenCalled();
    expect(backend.calls).toContain("POST /api/auth/verify");
    expect(useSession.getState().token).toBe(`fake.${wallet.address}`);
  });
});

describe("restoring a Live session", () => {
  const W1 = fakeWallet().address;
  const signedIn = (token = `fake.${W1}`) => useSession.getState().signIn({ token, wallet: W1, genesis: false });

  it("keeps a good token and refreshes the Genesis flag", async () => {
    restoreFetch = installFakeBackend(fakeBackend({ genesis: true }));
    signedIn();
    await expect(restoreSession(getApi())).resolves.toBe(true);
    expect(useSession.getState()).toMatchObject({ token: `fake.${W1}`, genesis: true });
  });

  it("signs out a token the server no longer accepts (expired, or the secret changed)", async () => {
    restoreFetch = installFakeBackend(fakeBackend());
    signedIn("stale-token");
    await expect(restoreSession(getApi())).resolves.toBe(false);
    expect(useSession.getState().token).toBeNull();
  });

  it("keeps the session when the server can't be reached (offline or cold start)", async () => {
    const real = global.fetch;
    global.fetch = jest.fn(() => Promise.reject(new TypeError("Network request failed"))) as unknown as typeof fetch;
    restoreFetch = () => { global.fetch = real; };
    signedIn();
    await expect(restoreSession(getApi())).resolves.toBe(true);
    expect(useSession.getState().token).toBe(`fake.${W1}`);
  });
});
