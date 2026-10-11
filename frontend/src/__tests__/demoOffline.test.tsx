// Demo makes no network calls (D-80): onboarding through Demo and the core screens run with fetch,
// XMLHttpRequest and WebSocket replaced by spies that fail the test.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { t } from "@/copy";
import { ToastHost } from "@/components/chrome";
import { queryClient } from "@/api/queries";
import { RootNavigator } from "@/app/RootNavigator";
import { navigateTo } from "@/app/nav";
import { layOutDeck } from "@/testing/deck";
import type { DesignId } from "@/app/routes";
import { setAppMode } from "@/features/mode";
import { mockOaths } from "@/features/oaths/mockStore";
import { oathView } from "@/features/oaths/model";
import { historyOf, historyTotals } from "@/features/oaths/history";
import { MOCK_WALLET } from "@/api/mock/slices";
import { useDev } from "@/state/dev";
import { useMode } from "@/state/mode";

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const slow = { timeout: 8000 };
const calls: string[] = [];
const g = global as unknown as Record<string, unknown>;
const saved = { fetch: g.fetch, XMLHttpRequest: g.XMLHttpRequest, WebSocket: g.WebSocket };

beforeAll(() => {
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity } });
  g.fetch = jest.fn((url: unknown) => { calls.push(`fetch ${String(url)}`); return Promise.reject(new Error("network in Demo")); });
  g.XMLHttpRequest = jest.fn(() => { calls.push("XMLHttpRequest"); throw new Error("network in Demo"); });
  g.WebSocket = jest.fn((url: unknown) => { calls.push(`WebSocket ${String(url)}`); throw new Error("network in Demo"); });
});
afterAll(() => { Object.assign(g, saved); });

beforeEach(async () => {
  await setAppMode(null);
  await AsyncStorage.clear();
  // The release default: no Dev menu overrides, the judges' account.
  useDev.setState({ overrides: {}, mockWallet: false, scenario: "judges" });
  mockOaths.reset();
  queryClient.clear();
  calls.length = 0;
});

function App() {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={queryClient}>
        <ToastHost><RootNavigator /></ToastHost>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

it("onboards in Demo and opens the core screens without touching the network", async () => {
  await render(<App />);
  // A first launch: the intro (no network either), skipped to its last page.
  await fireEvent.press(await screen.findByRole("button", { name: t("additions.intro.skip") }, slow));
  await fireEvent.press(await screen.findByRole("button", { name: t("screens.A1.pin.0") }, slow));
  await fireEvent.press(await screen.findByText(t("additions.mode.demo")));
  await fireEvent.press(await screen.findByRole("button", { name: t("screens.A4.pin.0") }, slow));
  expect(useMode.getState().mode).toBe("demo");
  expect(await screen.findByRole("header", { name: t("screens.B1.header.title") }, slow)).toBeTruthy();
  // The judges' Today: Iron Week with photo 2 due and the claim banner.
  await layOutDeck();
  expect(await screen.findAllByText("Iron Week", {}, slow)).not.toHaveLength(0);

  const iron = mockOaths.list(MOCK_WALLET).find((o) => o.name === "Iron Week" && o.status === "active")!;
  const guitar = mockOaths.list(MOCK_WALLET).find((o) => o.name === "Guitar Days" && !o.rematchOf)!;
  const visits: [DesignId, Record<string, string>?][] = [["D0"], ["D2", { id: iron.id }], ["D3", { id: guitar.id }], ["R1", { id: guitar.id }], ["H1"], ["I1"], ["N1"], ["W1"]];
  for (const [id, params] of visits) {
    await act(async () => { navigateTo(id, params); });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0), slow);
  }
  expect(calls).toEqual([]);
}, 60000);

it("the judges' account has every core idea one tap from Today", () => {
  mockOaths.ensureSeeded("judges", MOCK_WALLET);
  const now = Math.floor(Date.now() / 1000);
  const views = mockOaths.list(MOCK_WALLET).map((f) => oathView(f, now, MOCK_WALLET));
  const iron = views.find((v) => v.facts.name === "Iron Week" && v.life === "active")!;
  // A group Oath mid-run with two habits (a dumbbell, a book): one proven, one still due, HP below 100 after Arjun's day-2 miss.
  expect(iron.facts.isSolo).toBe(false);
  expect(iron.facts.members.find((m) => m.wallet === MOCK_WALLET)!.proofToday).toBe("partial");
  expect(iron.habits.map((h) => [h.object, h.done])).toEqual([["dumbbell", true], ["book", false]]);
  expect(iron.hp).toBeLessThan(100);
  expect(iron.members.some((m) => m.missed.length > 0)).toBe(true);
  // A finished Oath to claim, a broken one with a Rematch offer, a joined Bounty.
  expect(views.some((v) => v.life === "settled" && v.claimable > 0n)).toBe(true);
  const guitar = views.find((v) => v.facts.name === "Guitar Days" && !v.facts.rematchOf)!;
  expect(guitar.life).toBe("broken");
  expect(mockOaths.rematchFor(guitar.facts.id)).not.toBeNull();
  expect(views.some((v) => v.facts.bountyId && v.life === "active")).toBe(true);
});

it("D5 history comes from the account's finished Oaths, not sample data", () => {
  mockOaths.ensureSeeded("judges", MOCK_WALLET);
  const now = Math.floor(Date.now() / 1000);
  const rows = historyOf(mockOaths.list(MOCK_WALLET).map((f) => oathView(f, now, MOCK_WALLET)));
  expect(rows.map((r) => r.name).sort()).toEqual(["Guitar Days", "Hydra 14"]);
  const guitar = rows.find((r) => r.name === "Guitar Days")!;
  expect(guitar).toMatchObject({ kind: "broken", sub: t("screens.D5.b3.r2.s", { day: 6 }) });
  expect(guitar.net).toBeLessThan(0n);
  expect(historyTotals(rows)).toMatchObject({ n: 2, kept: 1, broken: 1 });
});
