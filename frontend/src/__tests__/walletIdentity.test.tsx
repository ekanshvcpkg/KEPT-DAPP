// Settings › "Wallet identity: KEPT's own site" (state/settings.ts › verifiedIdentity) and the identity the wallet sees
// (chain/mwa.ts). Off (default): the build's identity exactly as before (EXPO_PUBLIC_APP_IDENTITY_*; silent reauthorize
// only with ..._VERIFIED=1). On: https://kept-keeper.vercel.app, re-authorizing silently with the saved token. A token
// belongs to the identity it was issued for, so switching drops it and the next wallet step authorizes afresh.
// The wallet app is faked at the MWA edge (src/testing/fakeLive.ts), as in liveSignIn.test.ts.
import { AppState } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { mwaWallet, VERIFIED_IDENTITY, walletIdentity } from "@/chain/mwa";
import { env, walletChain } from "@/config/env";
import { t } from "@/copy";
import { I4 } from "@/screens/profile/Profile";
import { useMode } from "@/state/mode";
import { useSettings } from "@/state/settings";
import { fakeWallet, installFakeWallet, resetWallet } from "@/testing/fakeLive";

/** The build's identity today (frontend/.env): a friend's site that doesn't list KEPT's signing keys. */
const BUILD_URI = "https://keptdapp.vercel.app";
const OWN = { name: "KEPT", uri: "https://kept-keeper.vercel.app" };
const identityEnv = env.identity as { name: string; uri: string; verified: boolean };
const original = { ...identityEnv };
const keystore = (jest.requireMock("expo-secure-store") as { __store: Map<string, string> }).__store;
const savedAuth = () => { const raw = keystore.get("kept.mwa"); return raw ? (JSON.parse(raw) as { authToken: string; identity?: string }) : null; };

// Jest's AppState is a stub whose `currentState` is a function; on a device the app is "active" again once the wallet returns.
beforeAll(() => { Object.defineProperty(AppState, "currentState", { value: "active", configurable: true }); });
beforeEach(async () => {
  Object.assign(identityEnv, { uri: BUILD_URI, verified: false });
  useSettings.getState().set({ verifiedIdentity: false });
  await mwaWallet.forget();
});
afterEach(() => { resetWallet(); Object.assign(identityEnv, original); useMode.setState({ mode: null }); });

describe("the wallet identity (chain/mwa.ts)", () => {
  it("is off by default: the build's identity, and silent reauthorize only when the build says it's verified", async () => {
    expect(useSettings.getState().verifiedIdentity).toBe(false);
    const wallet = fakeWallet();
    installFakeWallet(wallet);
    const build = { name: env.identity.name, uri: BUILD_URI };
    expect(walletIdentity()).toEqual(build);
    await mwaWallet.connect();
    await mwaWallet.connect();
    expect(wallet.authorize.mock.calls[0]![0]).toEqual({ chain: walletChain, identity: build });
    expect(wallet.authorize.mock.calls[1]![0]).toEqual({ chain: walletChain, identity: build }); // no token: asks afresh
    expect(savedAuth()).toMatchObject({ authToken: "fake-auth-token", identity: BUILD_URI });
    identityEnv.verified = true; // EXPO_PUBLIC_APP_IDENTITY_VERIFIED=1
    await mwaWallet.connect();
    expect(wallet.authorize.mock.calls[2]![0]).toEqual({ chain: walletChain, identity: build, auth_token: "fake-auth-token" });
  });

  it("on: KEPT's own site, re-authorizing silently with the saved token", async () => {
    useSettings.getState().set({ verifiedIdentity: true });
    expect(VERIFIED_IDENTITY).toEqual(OWN);
    expect(walletIdentity()).toEqual(OWN);
    const wallet = fakeWallet();
    installFakeWallet(wallet);
    await mwaWallet.connect();
    const signed = await mwaWallet.signMessage("KEPT V4 sign-in");
    expect(signed.wallet).toBe(wallet.address);
    expect(wallet.authorize.mock.calls[0]![0]).toEqual({ chain: walletChain, identity: OWN });
    expect(wallet.authorize.mock.calls[1]![0]).toEqual({ chain: walletChain, identity: OWN, auth_token: "fake-auth-token" });
    expect(savedAuth()).toMatchObject({ identity: OWN.uri });
  });

  it("drops a token issued for the other identity, both ways, so the next wallet step authorizes afresh", async () => {
    identityEnv.verified = true; // even a build that may re-authorize never reuses the other identity's token
    const wallet = fakeWallet();
    installFakeWallet(wallet);
    const tokens = ["build-token", "own-token", "own-token", "build-token-2"]; // what each authorize returns
    wallet.authorize.mockImplementation(async () => ({ accounts: [{ address: Buffer.from(new Uint8Array(32).fill(7)).toString("base64") }], auth_token: tokens.shift() ?? "later" }));
    await mwaWallet.connect(); // the build's identity
    useSettings.getState().set({ verifiedIdentity: true });
    await mwaWallet.connect(); // own site: the build's token isn't sent
    await mwaWallet.connect(); // own site again: its own token is
    useSettings.getState().set({ verifiedIdentity: false });
    await mwaWallet.connect(); // back to the build's: the own site's token isn't sent
    const calls = wallet.authorize.mock.calls.map((c) => c[0] as { identity: { uri: string }; auth_token?: string });
    expect(calls.map((c) => [c.identity.uri, c.auth_token ?? null])).toEqual([
      [BUILD_URI, null],
      [OWN.uri, null],
      [OWN.uri, "own-token"],
      [BUILD_URI, null],
    ]);
    expect(savedAuth()).toMatchObject({ authToken: "build-token-2", identity: BUILD_URI });
  });
});

describe("Settings › Wallet identity: KEPT's own site", () => {
  const Stack = createNativeStackNavigator();
  const safe = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
  const renderI4 = async () => {
    // No retries, no garbage-collection timers: nothing outlives the test.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const view = await render(
      <SafeAreaProvider initialMetrics={safe}>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="I4" component={I4} />
            </Stack.Navigator>
          </NavigationContainer>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
    return async () => { await act(async () => { view.unmount(); }); queryClient.clear(); };
  };

  it("is off by default; switching it changes the identity and forgets the wallet's authorization", async () => {
    const wallet = fakeWallet();
    installFakeWallet(wallet);
    await mwaWallet.connect();
    expect(savedAuth()).not.toBeNull();
    const unmount = await renderI4();
    const toggle = await screen.findByRole("switch", { name: t("additions.wallet.identitySetting") });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getByText(t("additions.wallet.identitySettingSub"))).toBeTruthy();
    await fireEvent.press(toggle);
    await act(async () => {});
    expect(useSettings.getState().verifiedIdentity).toBe(true);
    expect(savedAuth()).toBeNull();
    await mwaWallet.connect();
    expect(wallet.authorize.mock.calls.at(-1)![0]).toEqual({ chain: walletChain, identity: OWN });
    await fireEvent.press(screen.getByRole("switch", { name: t("additions.wallet.identitySetting") }));
    await act(async () => {});
    expect(useSettings.getState().verifiedIdentity).toBe(false);
    expect(savedAuth()).toBeNull();
    await unmount();
  });

  it("isn't offered in Demo (no real wallet there)", async () => {
    useMode.setState({ mode: "demo" });
    const unmount = await renderI4();
    await screen.findByRole("switch", { name: t("additions.keeper.voiceSetting") });
    expect(screen.queryByRole("switch", { name: t("additions.wallet.identitySetting") })).toBeNull();
    await unmount();
  });
});
