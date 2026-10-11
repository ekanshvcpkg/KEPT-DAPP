import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import copy from "../../../design/copy.json";
import { t } from "@/copy";
import type { CopyKey } from "@/copy";
import { ToastHost } from "@/components/chrome";
import { queryClient } from "@/api/queries";
import { SLICES } from "@/api/types";
import { RootNavigator, routeInvite } from "@/app/RootNavigator";
import { FxHost, LoadFailHost } from "@/app/hosts";
import { navigateTo, navigationRef, resetStack } from "@/app/nav";
import { ROUTES, presentation, routeName } from "@/app/routes";
import { STILL_OFFLINE } from "@/screens/M2";
import { useDev } from "@/state/dev";
import { useSession } from "@/state/session";
import { useUi } from "@/state/ui";
import { useDeviceOaths } from "@/features/oaths/device";
import { mockOaths } from "@/features/oaths/mockStore";
import { mockBounties } from "@/features/bounties/mockStore";
import type { Scenario } from "@/api/mock/scenarios";
import { useDraft } from "@/state/drafts";
import { storeChallenge } from "@/screens/proof/Proof";
import { gestureText } from "@/features/oaths/present";
import amend from "@/app/routes.amend.json";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAppMode } from "@/features/mode";
import { useMode } from "@/state/mode";
import { setScreenDeferral } from "@/lib/screenReady";
import { getDeviceModelsStatus } from "kept-gesture";
import { clock } from "@/lib/clock";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { AppState } from "react-native";
import { mwaWallet } from "@/chain/mwa";
import { fakeBackend, fakeWallet, installFakeBackend, installFakeWallet, resetWallet } from "@/testing/fakeLive";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const slow = { timeout: 8000 };

function App() {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>
        <ToastHost><RootNavigator /><FxHost /><LoadFailHost /></ToastHost>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** The root stack, by route name (D-86: what back goes to). */
const rootStack = () => navigationRef.getRootState()!.routes.map((r) => r.name);

describe("routes", () => {
  it("registers every design id with an ASCII name", () => {
    expect(ROUTES).toHaveLength(Object.keys(copy.screens).length + amend.screens.length);
    expect(routeName("C7·no")).toBe("C7_no");
    expect(routeName("+")).toBe("Plus");
    expect(presentation("A2·s")).toBe("signing");
    expect(presentation("L1")).toBe("moment");
    expect(presentation("M3")).toBe("sheet");
    expect(presentation("B1")).toBe("tab");
  });
  it("M2's retry toast is 'Still offline'", () => {
    expect(copy.toasts[STILL_OFFLINE]).toBe("Still offline");
  });
});

describe("kept://join/<code>", () => {
  beforeEach(async () => { await setAppMode(null); await AsyncStorage.clear(); });
  it("signed out: switches to Live, keeps the code for after onboarding and swallows the link", async () => {
    useSession.setState({ token: null, onboarded: false, invite: null });
    expect(routeInvite("kept://join/IRON-7K2Q")).toBeNull();
    await waitFor(() => expect(useSession.getState().invite).toBe("IRON-7K2Q"));
    expect(useMode.getState().mode).toBe("live");
  });
  it("in Demo: leaves Demo for Live (D-80)", async () => {
    await setAppMode("demo");
    useSession.setState({ token: "mock.x", onboarded: true, invite: null });
    expect(routeInvite("kept://join/IRON-7K2Q")).toBeNull();
    await waitFor(() => expect(useMode.getState().mode).toBe("live"));
    expect(useSession.getState()).toMatchObject({ token: null, invite: "IRON-7K2Q" });
  });
  it("signed in on Live: lets the link through to E1", async () => {
    await setAppMode("live");
    useSession.setState({ token: "t", onboarded: true, invite: null });
    expect(routeInvite("kept://join/IRON-7K2Q")).toBe("kept://join/IRON-7K2Q");
    expect(routeInvite("https://keptdapp.vercel.app/o/Ab3dE9x")).toBe("kept://join/Ab3dE9x");
    expect(useSession.getState().invite).toBeNull();
    expect(routeInvite("kept://other")).toBe("kept://other");
  });
});

describe("onboarding on mocks", () => {
  // With gcTime Infinity React Query schedules no garbage-collection timers, so Jest can exit.
  beforeAll(() => queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity } }));
  beforeEach(async () => {
    await setAppMode(null);
    await AsyncStorage.clear();
    useDev.setState({ overrides: Object.fromEntries(SLICES.map((s) => [s, "mock"])), mockWallet: true, scenario: "fresh" });
    // The whole device record, not just what a test reads: an Oath created by one test leaves its name under an id the next test's seeded Oath reuses.
    useDeviceOaths.setState(useDeviceOaths.getInitialState(), true);
    mockOaths.reset();
    useSession.setState({ token: null, wallet: null, genesis: false, onboarded: false, avatar: null, invite: null });
    queryClient.clear();
  });

  it("Demo: welcome → mode sheet → look → tabs, no wallet, DEMO badge (D-80)", async () => {
    await render(<App />);
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A1.pin.0") }, slow));
    await fireEvent.press(await screen.findByText(t("additions.mode.demo")));
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A4.pin.0") }, slow));
    expect(useMode.getState().mode).toBe("demo");
    expect(useSession.getState()).toMatchObject({ onboarded: true, genesis: true });
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    expect(screen.getAllByLabelText(t("additions.mode.badge")).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByLabelText(t("additions.a11y.newMenu")));
    expect(await screen.findByText(t("screens.+.b0.title"))).toBeTruthy();
  }, 30000);

  it("A4 › Customize: the look saved in the builder comes back to A4 and is the one kept", async () => {
    await render(<App />);
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A1.pin.0") }, slow));
    await fireEvent.press(await screen.findByText(t("additions.mode.demo")));
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A4.pin.1") }, slow));
    const before = useSession.getState().avatar;
    // A few shuffles: one random draw could repeat the look.
    for (let i = 0; i < 3; i++) await fireEvent.press(await screen.findByRole("button", { name: t("additions.avatarBuilder.shuffle") }, slow));
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.I9.pin.0") }));
    const saved = useSession.getState().avatar;
    expect(saved).not.toBeNull();
    expect(saved).not.toBe(before);
    expect(useSession.getState().onboarded).toBe(false);
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A4.pin.0") }, slow));
    expect(useSession.getState()).toMatchObject({ onboarded: true, avatar: saved });
  }, 30000);

  it("I have an invite: straight to Live's wallet step", async () => {
    await render(<App />);
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A1.pin.1") }, slow));
    expect(await screen.findByText(t("screens.A2.b0.title"), {}, slow)).toBeTruthy();
    expect(useMode.getState().mode).toBe("live");
    expect(useSession.getState().invite).toBe("");
  }, 30000);

  it("Live needs the on-device models (the sheet shows the download, not the wallet step); Demo never does", async () => {
    const missing = { supported: true, gestureReady: false, visionReady: false, modelBytes: 1, downloadedBytes: 0, totalBytes: 1 };
    (getDeviceModelsStatus as jest.Mock).mockResolvedValue(missing);
    // Development builds let "Not now" through to Live (so an emulator can be used); a release build goes back.
    const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    try {
      await render(<App />);
      await fireEvent.press(await screen.findByRole("button", { name: t("screens.A1.pin.0") }, slow));
      await fireEvent.press(await screen.findByText(t("additions.mode.live"), {}, slow));
      expect(await screen.findByText(t("additions.mode.modelTitle"), {}, slow)).toBeTruthy();
      expect(screen.queryByText(t("screens.A2.b0.title"))).toBeNull();
      expect(useMode.getState().mode).not.toBe("live");
      // Not now → back to the mode choice, and Demo goes on without a download.
      await fireEvent.press(await screen.findByRole("button", { name: t("additions.mode.modelNotNow") }));
      await fireEvent.press(await screen.findByText(t("additions.mode.demo"), {}, slow));
      expect(await screen.findByRole("button", { name: t("screens.A4.pin.0") }, slow)).toBeTruthy();
      expect(useMode.getState().mode).toBe("demo");
    } finally {
      (globalThis as { __DEV__?: boolean }).__DEV__ = dev;
      (getDeviceModelsStatus as jest.Mock).mockResolvedValue({ ...missing, gestureReady: true, visionReady: true });
    }
  }, 30000);

  it("no wallet app: back on Connect wallet with a toast that says so", async () => {
    useDev.setState({ mockWallet: false });
    jest.mocked(transact).mockRejectedValueOnce(Object.assign(new Error("Found no installed wallet that supports the mobile wallet protocol."), { name: "SolanaMobileWalletAdapterError", code: "ERROR_WALLET_NOT_FOUND" }));
    await render(<App />);
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A1.pin.0") }, slow));
    await fireEvent.press(await screen.findByText(t("additions.mode.live")));
    await fireEvent.press(await screen.findByLabelText(t("screens.A2.b1.r0.t")));
    expect(await screen.findByText(t("additions.wallet.noWalletApp"), {}, slow)).toBeTruthy();
    expect(await screen.findByText(t("screens.A2.b0.title"), {}, slow)).toBeTruthy();
  }, 30000);

  it("a signed-in, onboarded user skips straight to the tabs", async () => {
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", onboarded: true, avatar: "31205140" });
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
  }, 30000);

  /** Demo, signed in, on C2 with a named Oath and an empty habit list. */
  async function startC2(name = "Stronger every day") {
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true });
    useDraft.getState().reset();
    await render(<App />);
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.B3.b3.btn.0") }, slow));
    await fireEvent.changeText(await screen.findByLabelText(t("additions.oathCreate.nameLabel")), name);
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.C1.pin.0") })); // C1 → C2
    expect(await screen.findByText(t("additions.oathCreate.habitsTitle"))).toBeTruthy();
  }
  const nextBtn = (disabled = false) => screen.findByRole("button", { name: t("screens.C1.pin.0"), disabled });
  const saveBtn = (disabled = false) => screen.findByRole("button", { name: t("additions.oathCreate.saveHabit"), disabled });
  const card = (name: string, object: string) => new RegExp(`^${name}\\. ${t("additions.oathCreate.proofForHabit", { object })}\\.`);

  it("C2: a blank editor is not a habit; Save commits the name and proof together; Cancel leaves a saved habit untouched", async () => {
    await startC2();
    // Nothing saved yet: an empty state, and Next is blocked.
    expect(screen.getByText(t("additions.oathCreate.emptyTitle"))).toBeTruthy();
    await nextBtn(true);

    // Add a habit: the editor opens blank. A name alone, or a proof alone, can't be saved.
    await fireEvent.press(screen.getByRole("button", { name: t("additions.oathCreate.addHabit") }));
    const field = await screen.findByLabelText(t("additions.oathCreate.habitName"));
    expect(field.props.value).toBe("");
    await saveBtn(true);
    await fireEvent.changeText(field, "read 10 pages");
    await saveBtn(true);
    // Six quick picks. Yoga mat and Skipping rope are supported too, but found by search.
    for (const o of ["Dumbbell", "Book", "Water bottle", "Guitar", "Running shoe", "Plant"]) expect(screen.getByLabelText(o)).toBeTruthy();
    expect(screen.queryByLabelText("Yoga mat")).toBeNull();
    expect(screen.queryByLabelText("Skipping rope")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Book"));
    expect(screen.getByText(t("additions.oathCreate.proofSummary", { object: "Book" }))).toBeTruthy();
    // Nothing is committed until Save.
    expect(useDraft.getState().draft.habits).toEqual([""]);
    await fireEvent.press(await saveBtn());
    expect(await screen.findByLabelText(card("read 10 pages", "Book"))).toBeTruthy();
    expect(useDraft.getState().draft).toMatchObject({ habits: ["read 10 pages"], habitObjectIds: [1], objectId: 1 });
    await nextBtn();

    // Edit it: prefilled. Change both, then Cancel: nothing changed.
    await fireEvent.press(screen.getByLabelText(card("read 10 pages", "Book")));
    const edit = await screen.findByLabelText(t("additions.oathCreate.habitName"));
    expect(edit.props.value).toBe("read 10 pages");
    await fireEvent.changeText(edit, "something else");
    await fireEvent.press(screen.getByLabelText("Plant"));
    await fireEvent.press(screen.getByRole("button", { name: t("additions.oathCreate.cancelHabit") }));
    expect(await screen.findByLabelText(card("read 10 pages", "Book"))).toBeTruthy();
    expect(useDraft.getState().draft).toMatchObject({ habits: ["read 10 pages"], habitObjectIds: [1], objectId: 1 });

    // Edit and Save: both change together.
    await fireEvent.press(screen.getByLabelText(card("read 10 pages", "Book")));
    await fireEvent.changeText(await screen.findByLabelText(t("additions.oathCreate.habitName")), "read 20 pages");
    await fireEvent.press(await saveBtn());
    expect(await screen.findByLabelText(card("read 20 pages", "Book"))).toBeTruthy();
    expect(useDraft.getState().draft.habits).toEqual(["read 20 pages"]);

    // Even the only habit can be removed: back to the empty state, and Next is blocked again.
    await fireEvent.press(screen.getByLabelText(card("read 20 pages", "Book")));
    await fireEvent.press(await screen.findByRole("button", { name: t("additions.oathCreate.removeHabit", { n: 1 }) }));
    expect(await screen.findByText(t("additions.oathCreate.emptyTitle"))).toBeTruthy();
    expect(useDraft.getState().draft).toMatchObject({ habits: [""], habitObjectIds: [] });
    await nextBtn(true);
  }, 60000);

  it("C2: one Oath checks one proof object, so a habit can't name another one without switching them all", async () => {
    await startC2();
    await fireEvent.press(screen.getByRole("button", { name: t("additions.oathCreate.addHabit") }));
    await fireEvent.changeText(await screen.findByLabelText(t("additions.oathCreate.habitName")), "read");
    await fireEvent.press(screen.getByLabelText("Book"));
    await fireEvent.press(await saveBtn());
    // A second habit starts on the Oath's object.
    await fireEvent.press(await screen.findByRole("button", { name: t("additions.oathCreate.addHabit") }));
    await fireEvent.changeText(await screen.findByLabelText(t("additions.oathCreate.habitName")), "water");
    expect(screen.getByText(t("additions.oathCreate.proofSummary", { object: "Book" }))).toBeTruthy();
    await saveBtn();
    // Another object is a visible conflict with a way out; Save stays off.
    await fireEvent.press(screen.getByLabelText("Plant"));
    expect(await screen.findByText(t("additions.oathCreate.conflictTitle", { object: "Book" }))).toBeTruthy();
    await saveBtn(true);
    await fireEvent.press(screen.getByRole("button", { name: t("additions.oathCreate.switchAll", { object: "Plant" }) }));
    expect(await screen.findByLabelText(card("read", "Plant"))).toBeTruthy();
    expect(screen.getByLabelText(card("water", "Plant"))).toBeTruthy();
    expect(useDraft.getState().draft).toMatchObject({ habits: ["read", "water"], habitObjectIds: [5, 5], objectId: 5 });
    await nextBtn();
  }, 60000);

  it("C2 search: aliases select their object, unsupported things stay locked, no match has a state, and the pick reaches the created Oath", async () => {
    await startC2();
    await fireEvent.press(screen.getByRole("button", { name: t("additions.oathCreate.addHabit") }));
    await fireEvent.changeText(await screen.findByLabelText(t("additions.oathCreate.habitName")), "stretch");
    const search = screen.getByLabelText(t("additions.objects.searchLabel"));
    const row = (key: string) => new RegExp(`^${t(`additions.objects.entry.${key}` as CopyKey)}\\.`);
    await fireEvent(search, "focus");

    // Unsupported: listed, locked, and picking it changes nothing.
    await fireEvent.changeText(search, "kettlebell");
    const kettlebell = await screen.findByLabelText(row("kettlebell"));
    expect(kettlebell.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(kettlebell);
    expect(await screen.findByText(t("additions.objects.unavailableToast"))).toBeTruthy();
    // No match: a designed empty state.
    await fireEvent.changeText(search, "zzzqx");
    expect(await screen.findByText(t("additions.objects.noResults", { query: "zzzqx" }))).toBeTruthy();

    // An alias selects the object it is: "pilates" is a yoga mat (not one of the six quick picks).
    await fireEvent.changeText(search, "pilates");
    await fireEvent.press(await screen.findByLabelText(row("yoga_mat")));
    expect(await screen.findByText(t("additions.oathCreate.proofSummary", { object: "Yoga mat" }))).toBeTruthy();
    expect(useDraft.getState().draft.habits).toEqual([""]); // still only in the editor
    await fireEvent.press(await saveBtn());
    expect(await screen.findByLabelText(card("stretch", "Yoga mat"))).toBeTruthy();
    expect(useDraft.getState().draft).toMatchObject({ habitObjectIds: [7], habitObjectEntries: ["yoga_mat"], objectId: 7 });

    // On through C3-C6: the Oath is created with the program's object_id and the saved habits.
    for (let i = 0; i < 4; i++) await fireEvent.press(await nextBtn());
    expect(await screen.findByText(t("screens.C6.b1.row0.v", { goal: "stretch" }))).toBeTruthy();
    expect(screen.getByText("Yoga mat")).toBeTruthy();
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.C6.pin.0") }));
    expect(await screen.findByText(t("screens.C7·ok.b2.title", { amount: "1,000" }), {}, slow)).toBeTruthy();
    expect(useUi.getState().fx?.feel).toBe("payout");
    const created = mockOaths.list("7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q").filter((o) => o.name === "Stronger every day");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ objectId: 7, habits: ["stretch"], goal: "stretch" });
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.C7·ok.pin.0") }));
    expect(await screen.findByText(t("screens.C8.b0.title"))).toBeTruthy();
    expect(useUi.getState().fx).toBeNull();
    // D-86: the wizard, the signature and the moment are gone; back from the invite is Today.
    expect(rootStack()).toEqual(["Tabs", "C8"]);
    await act(async () => { navigationRef.goBack(); });
    expect(rootStack()).toEqual(["Tabs"]);
  }, 90000);

  it("shows a settled Oath's result once, then the claim screen", async () => {
    useDev.setState({ scenario: "settledKept" });
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true });
    await render(<App />);
    expect(await screen.findByText(t("screens.L1.b1.title", { name: "Iron Week" }), {}, slow)).toBeTruthy();
    expect(useDeviceOaths.getState().shownResults).toHaveLength(1);
    await fireEvent.press(await screen.findByRole("button", { name: /Claim/ }));
    expect(await screen.findByText(t("screens.J1.b1.caption"))).toBeTruthy();
    // D-86: claim → signed → "Done" is the one home, nothing stacked on or under it.
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.J1.pin.0") }));
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.J1·ok.pin.0") }, slow));
    expect(rootStack()).toEqual(["Tabs"]);
  }, 30000);

  it("D2 shows the live Oath and nudges; photo 2 → check → F5 Day kept", async () => {
    useDev.setState({ scenario: "activeGroup" });
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true });
    // Already seen: the settled Oath's result and today's recap (mock ids are assigned in seed order).
    useDeviceOaths.setState({ shownResults: ["mock-oath-4:L1"], recapShownOn: new Date().toDateString() });
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    await act(async () => { navigateTo("D2", { id: "mock-oath-1" }); });
    expect(await screen.findByText(t("screens.D2.b6.label"))).toBeTruthy();
    expect(screen.getByText(t("screens.D2.nav.right", { day: 3, length: 7 }))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: t("screens.D2.pin.1", { name: "Arjun" }) }));
    expect(await screen.findByText(t("toasts.3", { name: "Arjun" }))).toBeTruthy();
    // No camera until the user picks Prove (D-91); it's on in F4 and off once the photo goes to checking.
    expect(screen.queryByTestId("camera-preview")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: t("screens.D2.pin.0") }));
    expect(await screen.findByTestId("camera-preview")).toBeTruthy();
    await fireEvent.press(await screen.findByLabelText(t("additions.a11y.shutter")));
    await waitFor(() => expect(screen.queryByTestId("camera-preview")).toBeNull());
    expect((await screen.findAllByText(t("screens.F5.b1.title", { day: 3 }), {}, slow)).length).toBeGreaterThan(0); // title + FX pill
  }, 30000);

  it("an expired challenge from earlier is replaced, not sent to F2c (found on the emulator)", async () => {
    useDev.setState({ scenario: "activeGroup" });
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true });
    useDeviceOaths.setState({ shownResults: ["mock-oath-4:L1"], recapShownOn: new Date().toDateString() });
    storeChallenge("mock-oath-1", 2, { photo: 2, dayIndex: 2, objectId: 0, gesture: "victory", expiresAt: Math.floor(Date.now() / 1000) - 60 });
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    // From D2, so the Oath is already loaded when F4 mounts (that's when the stale one was picked up).
    await act(async () => { navigateTo("D2", { id: "mock-oath-1" }); });
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.D2.pin.0") }));
    expect(await screen.findByText(t("screens.F4.b1.chip.0"))).toBeTruthy();
    expect(screen.queryByText(t("screens.F2c.b0.title"))).toBeNull();
    await fireEvent.press(await screen.findByLabelText(t("additions.a11y.shutter")));
    expect((await screen.findAllByText(t("screens.F5.b1.title", { day: 3 }), {}, slow)).length).toBeGreaterThan(0); // title + FX pill
    expect(screen.queryByText(t("screens.F2c.b0.title"))).toBeNull();
  }, 30000);

  it("the camera screen shows the gesture the server issued for this photo, with the Oath's object", async () => {
    useDev.setState({ scenario: "activeGroup" });
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true });
    useDeviceOaths.setState({ shownResults: ["mock-oath-4:L1"], recapShownOn: new Date().toDateString() });
    storeChallenge("mock-oath-1", 2, { photo: 2, dayIndex: 2, objectId: 0, gesture: "open_palm", expiresAt: Math.floor(Date.now() / 1000) + 100 });
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    await act(async () => { navigateTo("D2", { id: "mock-oath-1" }); });
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.D2.pin.0") }));
    expect(await screen.findByText(t("screens.F1.b0.label", { object: "Dumbbell", gesture: gestureText("open_palm") }))).toBeTruthy();
  }, 30000);

  it("F2b's close button leaves even when it is the only screen (a link opened it)", async () => {
    useDev.setState({ scenario: "activeGroup" });
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true });
    useDeviceOaths.setState({ shownResults: ["mock-oath-4:L1"], recapShownOn: new Date().toDateString() });
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    await act(async () => { resetStack(["F2b"], { id: "mock-oath-1", photo: 1 }); });
    expect(rootStack()).toEqual(["F2b"]);
    await fireEvent.press(await screen.findByRole("button", { name: t("additions.a11y.close") }, slow));
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    expect(rootStack()).toEqual(["Tabs"]);
  }, 30000);

  it("F2c → new photo returns to a Shoot that can be used: skeleton gone, fresh challenge, no bounce back to F2c", async () => {
    setScreenDeferral(true);
    try {
      useDev.setState({ scenario: "activeGroup" });
      useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true });
      useDeviceOaths.setState({ shownResults: ["mock-oath-4:L1"], recapShownOn: new Date().toDateString() });
      await render(<App />);
      expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
      await act(async () => { navigateTo("D2", { id: "mock-oath-1" }); });
      await act(async () => { navigateTo("F1", { id: "mock-oath-1", photo: 1 }); });
      // F1 stays under F2c in the stack (history.ts: F2c is a retry outcome), as when the challenge ends during a check.
      await act(async () => { navigateTo("F2c", { id: "mock-oath-1", photo: 1 }); });
      expect(rootStack()).toEqual(["Tabs", "D2", "F1", "F2c"]);
      await fireEvent.press(await screen.findByRole("button", { name: t("screens.F2c.pin.0"), disabled: false }, slow));
      expect(await screen.findByLabelText(t("additions.a11y.shutter"), {}, slow)).toBeTruthy();
      await waitFor(() => expect(screen.queryAllByLabelText(t("additions.a11y.loading"))).toHaveLength(0), slow);
      expect(rootStack()).toEqual(["Tabs", "D2", "F1"]);
    } finally {
      setScreenDeferral(false);
    }
  }, 40000);

  it("joins by code: E1 → E1·code → E2 → sign → D1·m; a bad code shows E3·code, and Try again keeps it", async () => {
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true });
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    await act(async () => { navigateTo("E1"); });
    await fireEvent.press(await screen.findByLabelText(t("additions.join.code")));
    await fireEvent.changeText(await screen.findByLabelText(t("additions.join.codeLabel")), "nope");
    await fireEvent.press(screen.getByRole("button", { name: t("screens.E1.pin.0") }));
    expect(await screen.findByText(t("screens.E3·code.b2.title"))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: t("screens.E3·code.pin.0") }));
    // Back on the step it came from, the typed code still there to correct (D-91).
    expect(rootStack().slice(-2)).toEqual(["E1", "E1_code"]);
    expect(screen.getByLabelText(t("additions.join.codeLabel")).props.value).toBe("nope");
    await fireEvent.changeText(screen.getByLabelText(t("additions.join.codeLabel")), "dawn-4q2z");
    await fireEvent.press(screen.getByRole("button", { name: t("screens.E1.pin.0") }));
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.E2.pin.0", { amount: "1,000" }) }));
    expect(await screen.findByText(t("screens.D1·m.b2.title", { name: "Riya" }), {}, slow)).toBeTruthy();
  }, 30000);
});

describe("E1 starts with a choice; the camera only after Scan (D-91)", () => {
  const camera = (require("expo-camera") as { __camera: { granted: boolean; asked: number } }).__camera;
  const choice = () => screen.queryByLabelText(t("additions.join.scan"));
  const preview = () => screen.queryByTestId("camera-preview");
  beforeAll(() => queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity } }));
  beforeEach(async () => {
    await setAppMode(null);
    await AsyncStorage.clear();
    useDev.setState({ overrides: Object.fromEntries(SLICES.map((s) => [s, "mock"])), mockWallet: true, scenario: "fresh" });
    useDeviceOaths.setState({ shownResults: [], recapShownOn: null });
    mockOaths.reset();
    useSession.setState({ token: "mock.x", wallet: "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q", genesis: true, onboarded: true, avatar: null, invite: null });
    queryClient.clear();
    camera.granted = true;
    camera.asked = 0;
  });
  const openE1 = async (params?: Record<string, string>) => {
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    await act(async () => { navigateTo("E1", params); });
  };

  it("opens on the choice: no camera, no permission request, no code field", async () => {
    await openE1();
    expect(await screen.findByLabelText(t("additions.join.scan"))).toBeTruthy();
    expect(screen.getByLabelText(t("additions.join.code"))).toBeTruthy();
    expect(preview()).toBeNull();
    expect(screen.queryByLabelText(t("additions.join.codeLabel"))).toBeNull();
    expect(camera.asked).toBe(0);
  });

  it("Scan asks for the camera and turns it on; back returns to the choice and releases it; back again leaves E1", async () => {
    await openE1();
    await fireEvent.press(await screen.findByLabelText(t("additions.join.scan")));
    expect(await screen.findByTestId("camera-preview")).toBeTruthy();
    expect(camera.asked).toBe(1);
    expect(rootStack().slice(-2)).toEqual(["E1", "E1_scan"]);
    await act(async () => { navigationRef.goBack(); });
    await waitFor(() => expect(preview()).toBeNull());
    expect(rootStack().slice(-1)).toEqual(["E1"]);
    expect(choice()).toBeTruthy();
    await act(async () => { navigationRef.goBack(); });
    expect(rootStack()).toEqual(["Tabs"]);
  });

  it("a QR that isn't a KEPT invite says so and keeps scanning; an invite link opens E2 and the camera goes off", async () => {
    await openE1();
    await fireEvent.press(await screen.findByLabelText(t("additions.join.scan")));
    const cam = await screen.findByTestId("camera-preview");
    await fireEvent(cam, "barcodeScanned", { data: "https://example.com/menu" });
    expect(await screen.findByText(t("additions.join.notInvite"))).toBeTruthy();
    expect(preview()).toBeTruthy();
    await fireEvent(screen.getByTestId("camera-preview"), "barcodeScanned", { data: "kept://join/dawn-4q2z" });
    expect(await screen.findByRole("button", { name: t("screens.E2.pin.0", { amount: "1,000" }) })).toBeTruthy();
    expect(preview()).toBeNull();
  });

  it("an unknown code scanned: Try again goes back to scanning", async () => {
    await openE1();
    await fireEvent.press(await screen.findByLabelText(t("additions.join.scan")));
    await fireEvent(await screen.findByTestId("camera-preview"), "barcodeScanned", { data: "kept://join/nope" });
    expect(await screen.findByText(t("screens.E3·code.b2.title"))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: t("screens.E3·code.pin.0") }));
    expect(await screen.findByTestId("camera-preview")).toBeTruthy();
    expect(rootStack().slice(-2)).toEqual(["E1", "E1_scan"]);
  });

  it("camera access denied: says why, offers Settings and a code instead", async () => {
    camera.granted = false;
    await openE1();
    await fireEvent.press(await screen.findByLabelText(t("additions.join.scan")));
    expect(await screen.findByText(t("additions.join.permTitle"))).toBeTruthy();
    expect(screen.getByRole("button", { name: t("additions.camera.openSettings") })).toBeTruthy();
    expect(preview()).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: t("additions.join.codeInstead") }));
    expect(await screen.findByLabelText(t("additions.join.codeLabel"))).toBeTruthy();
    expect(rootStack().slice(-2)).toEqual(["E1", "E1_code"]);
  });

  it("Enter a code: the field and Paste, no camera; back returns to the choice", async () => {
    await openE1();
    await fireEvent.press(await screen.findByLabelText(t("additions.join.code")));
    const field = await screen.findByLabelText(t("additions.join.codeLabel"));
    expect(field.props.autoFocus).toBe(true);
    expect(screen.getByRole("button", { name: t("screens.E1.b3.btn.0") })).toBeTruthy();
    expect(preview()).toBeNull();
    expect(camera.asked).toBe(0);
    await act(async () => { navigationRef.goBack(); });
    expect(rootStack().slice(-1)).toEqual(["E1"]);
    expect(choice()).toBeTruthy();
  });

  it("a known code skips the choice and is looked up at once", async () => {
    await openE1({ code: "dawn-4q2z" });
    expect(await screen.findByRole("button", { name: t("screens.E2.pin.0", { amount: "1,000" }) })).toBeTruthy();
    expect(rootStack().slice(-2)).toEqual(["E1", "E2"]);
    expect(camera.asked).toBe(0);
    expect(preview()).toBeNull();
  });

  it("proof with camera access denied for good: F1·perm offers Settings instead of a prompt that can't show", async () => {
    camera.granted = false;
    useDev.setState({ scenario: "activeGroup" });
    useDeviceOaths.setState({ shownResults: ["mock-oath-4:L1"], recapShownOn: new Date().toDateString() });
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
    await act(async () => { navigateTo("F1", { id: "mock-oath-1" }); });
    expect(await screen.findByRole("button", { name: t("additions.camera.openSettings") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("screens.F1·perm.pin.0") })).toBeNull();
    expect(preview()).toBeNull();
  });

  it("a known code that doesn't exist: Try again opens the code step with it, and back from there is the choice", async () => {
    await openE1({ code: "nope" });
    expect(await screen.findByText(t("screens.E3·code.b2.title"))).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: t("screens.E3·code.pin.0") }));
    expect((await screen.findByLabelText(t("additions.join.codeLabel"))).props.value).toBe("nope");
    await act(async () => { navigationRef.goBack(); });
    expect(rootStack().slice(-1)).toEqual(["E1"]);
    expect(await screen.findByLabelText(t("additions.join.scan"))).toBeTruthy();
  });
});

describe("onboarding on Live", () => {
  // Live has no mock path (D-80): the real sign-in code runs against test stand-ins for the wallet app and the
  // backend (src/testing/fakeLive.ts). The Dev menu holds everything that used to put Live on the mock; it must change nothing.
  let restoreFetch = () => {};
  beforeAll(() => {
    queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity } });
    Object.defineProperty(AppState, "currentState", { value: "active", configurable: true }); // Jest's AppState is a stub
  });
  beforeEach(async () => {
    await setAppMode(null);
    await AsyncStorage.clear();
    await mwaWallet.forget();
    useDev.setState({ overrides: Object.fromEntries(SLICES.map((s) => [s, "mock"])), mockWallet: true, scenario: "notEligible" });
    useDeviceOaths.setState({ shownResults: [], recapShownOn: null });
    useSession.setState({ token: null, wallet: null, genesis: false, onboarded: false, avatar: null, invite: null });
    queryClient.clear();
  });
  afterEach(() => { restoreFetch(); resetWallet(); useDev.setState({ overrides: {}, mockWallet: false }); });

  const toWallet = async (row: 0 | 1 | 2) => {
    await render(<App />);
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A1.pin.0") }, slow));
    await fireEvent.press(await screen.findByText(t("additions.mode.live")));
    await fireEvent.press(await screen.findByLabelText(t(`screens.A2.b1.r${row}.t`)));
  };

  it("Seeker: wallet → signed in → verified → look, on the wallet and backend (not the mock)", async () => {
    const wallet = fakeWallet();
    const backend = fakeBackend({ genesis: true });
    installFakeWallet(wallet);
    restoreFetch = installFakeBackend(backend);
    await toWallet(0);
    expect(await screen.findByText(t("screens.A2·s.b2.title"))).toBeTruthy();
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.A3.pin.0") }, slow));
    expect(useSession.getState()).toMatchObject({ token: `fake.${wallet.address}`, wallet: wallet.address, genesis: true });
    expect(useMode.getState().mode).toBe("live");
    expect(backend.calls).toEqual(["POST /api/auth/nonce", "POST /api/auth/verify", "GET /api/me"]);
    // A4 is where Today starts; Today on Live needs the rest of the backend, so the test stops here.
    expect(await screen.findByRole("button", { name: t("screens.A4.pin.0") })).toBeTruthy();
  }, 30000);

  it("a declined wallet prompt lands on A2·e and never calls the backend", async () => {
    const backend = fakeBackend();
    installFakeWallet(fakeWallet({ declines: "authorize" }));
    restoreFetch = installFakeBackend(backend);
    await toWallet(1);
    expect(await screen.findByText(t("screens.A2·e.b2.title"), {}, slow)).toBeTruthy();
    expect(useSession.getState().token).toBeNull();
    expect(backend.calls).toEqual([]);
  }, 30000);

  it("a non-Seeker is signed in too and lands on A3·no", async () => {
    const wallet = fakeWallet();
    installFakeWallet(wallet);
    restoreFetch = installFakeBackend(fakeBackend({ genesis: false }));
    await toWallet(0);
    expect(await screen.findByText(t("screens.A3·no.b2.title"), {}, slow)).toBeTruthy();
    expect(useSession.getState()).toMatchObject({ wallet: wallet.address, genesis: false });
    expect(useSession.getState().token).toBe(`fake.${wallet.address}`);
  }, 30000);
});

describe("Bounties, Rematch, review, profile and wallet on mocks", () => {
  const WALLET = "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q";
  const MOMENT_IDS = ["L1", "L2", "L3", "L4", "L4·m", "L4·b", "L5", "L6", "H4", "H5", "R4", "R4·lost"];
  beforeAll(() => queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity } }));
  /** Signed in on `scenario`, with every result moment and today's recap already seen. */
  async function signedIn(scenario: Scenario) {
    await setAppMode("demo"); // the mock backend, wallet and chain, as in the Demo build
    useDev.setState({ scenario });
    mockOaths.reset();
    queryClient.clear();
    mockOaths.ensureSeeded(scenario, WALLET);
    const ids = mockOaths.list(WALLET).map((o) => o.id);
    useDeviceOaths.setState({ shownResults: ids.flatMap((id) => MOMENT_IDS.map((m) => `${id}:${m}`)), recapShownOn: new Date().toDateString() });
    useSession.setState({ token: "mock.x", wallet: WALLET, genesis: true, onboarded: true, avatar: null, invite: null });
    await render(<App />);
    expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
  }

  it("Rematch: R1 → sign → R3 lobby", async () => {
    await signedIn("broken");
    const guitar = mockOaths.byName("Guitar Days", WALLET)!;
    await act(async () => { navigateTo("R1", { id: guitar.id }); });
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.R1.pin.0") }, slow));
    expect(await screen.findByText(t("screens.R3.b1.title", { n: 3, total: 4 }), {}, slow)).toBeTruthy();
    // D-86: back from the lobby is home, not the offer or the signature.
    expect(rootStack()).toEqual(["Tabs", "R3"]);
  }, 30000);

  it("Demo › Skip to tomorrow: home, with the new day's recap on top (D-88)", async () => {
    await setAppMode("demo");
    await signedIn("judges");
    await act(async () => { navigateTo("I4"); });
    await fireEvent.press(await screen.findByRole("button", { name: t("additions.mode.skip") }, slow));
    expect(await screen.findByText(t("screens.B5.b4.btn.1"), {}, slow)).toBeTruthy();
    expect(rootStack()).toEqual(["Tabs", "B5"]);
    clock.reset();
    await setAppMode(null);
  }, 30000);

  it("a screen whose data can't load ends on M2 (server copy), not a skeleton (D-89)", async () => {
    await signedIn("activeGroup");
    await act(async () => { navigateTo("D2", { id: "no-such-oath" }); });
    expect(await screen.findByText(t("additions.loadFailed.title"), {}, slow)).toBeTruthy();
    expect(await screen.findByRole("button", { name: t("screens.M2.pin.0") })).toBeTruthy();
  }, 30000);

  it("group review: the inbox opens G1 and a vote goes back to D2", async () => {
    await signedIn("activeGroup");
    await act(async () => { navigateTo("N1"); });
    // Item ages come from createdAt (the sample says Dev asked 3h ago); they used to all read "1m".
    expect(await screen.findByText("3h", {}, slow)).toBeTruthy();
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.N1.b1.rev1.btn0") }, slow));
    expect(await screen.findByText(t("screens.G1.b0.title", { name: "Dev" }), {}, slow)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: t("screens.G1.pin.0") }));
    expect(await screen.findByText(t("toasts.7"))).toBeTruthy();
    expect(await screen.findByText(t("screens.D2.b6.label"))).toBeTruthy();
  }, 30000);

  it("Bounty: H2 → join free → H3", async () => {
    await signedIn("activeGroup");
    const open = mockBounties.list().find((b) => !b.minKeptRate && !b.tokenHeld && b.joinClosesAt > Date.now() / 1000 && !mockOaths.forBounty(b.id, WALLET))!;
    await act(async () => { navigateTo("H2", { id: open.id }); });
    await fireEvent.press(await screen.findByRole("button", { name: t("screens.H2.pin.0") }, slow));
    expect(await screen.findByText(/^You're in\./, {}, slow)).toBeTruthy();
    expect(mockOaths.forBounty(open.id, WALLET)).not.toBeNull();
    expect(rootStack()).toEqual(["Tabs", "H3"]);
  }, 30000);

  it("opens every one of those screens that needs no id without a render error", async () => {
    await signedIn("activeGroup");
    const errors = jest.spyOn(console, "error");
    for (const id of ["H1·j", "H1·c", "H7", "K1", "K2", "K3", "K4", "K5", "I2·me", "I4", "I5", "I7", "I8", "I9", "W1", "W4", "N1", "M1"] as const) {
      await act(async () => { navigateTo(id); });
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  }, 60000);

  it("opens those screens that take an id without a render error", async () => {
    await signedIn("activeGroup");
    const errors = jest.spyOn(console, "error");
    const hydrate = mockBounties.byName("Hydrate Week")!;
    const mine = mockBounties.byName("Dawn Pages")!;
    const riya = mockOaths.byName("Iron Week", WALLET)!.members.find((m) => m.name === "Riya")!.wallet;
    const visits: [Parameters<typeof navigateTo>[0], Record<string, string>][] = [
      ["H2", { id: hydrate.id }], ["H3", { id: hydrate.id }], ["H6", { id: mine.id }], ["I2", { wallet: riya }], ["I3", { name: "Drift" }],
    ];
    for (const [id, params] of visits) {
      await act(async () => { navigateTo(id, params); });
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  }, 60000);

  it("wallet: W3 swap → sign → W3·ok", async () => {
    await signedIn("activeGroup");
    await act(async () => { navigateTo("W3"); });
    // The button is disabled until the quote arrives.
    const swap = await screen.findByRole("button", { name: t("screens.W3.pin.0") }, slow);
    await waitFor(() => expect(swap).toBeEnabled(), slow);
    await fireEvent.press(swap);
    expect(await screen.findByText(t("screens.W3·ok.b2.title"), {}, slow)).toBeTruthy();
  }, 30000);
});
