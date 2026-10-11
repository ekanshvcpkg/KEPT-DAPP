// Dev-only deep link for screenshots and QA (Phase 4.5):
//   kept://dev/open/<screen>?scenario=<name>&hold=1&quiet=1
// <screen> is a design id or its route name ("C7·no" or "C7_no", "+" or "Plus"). The link resets the
// mock store and virtual clock to a scenario, signs in on the mock (signed out for onboarding), and
// opens the screen with the params it needs on top of Today. `hold=1` keeps pending screens pending
// (A2·s, C7, F2, …). RootNavigator requires this file only under __DEV__, so release bundles drop it.
import { LogBox } from "react-native";
import { CommonActions } from "@react-navigation/native";
import { resetMockApi } from "@/api";
import { queryClient } from "@/api/queries";
import { clock } from "@/lib/clock";
import { SCENARIOS } from "@/api/mock/scenarios";
import type { Scenario } from "@/api/mock/scenarios";
import { MOCK_WALLET } from "@/api/mock/slices";
import { mockBounties } from "@/features/bounties/mockStore";
import { PEOPLE, mockOaths } from "@/features/oaths/mockStore";
import { RESULT_SCREENS, useDeviceOaths } from "@/features/oaths/device";
import { mockReviews } from "@/features/reviews/mockStore";
import { useDev, useDevHold } from "@/state/dev";
import { useDraft } from "@/state/drafts";
import { useBountyDraft } from "@/screens/bounties/CreateBounty";
import { useSession } from "@/state/session";
import { useUi } from "@/state/ui";
import { navigationRef, target } from "@/app/nav";
import type { Params } from "@/app/nav";
import { ROUTES, designIdOf, presentation } from "@/app/routes";
import type { DesignId } from "@/app/routes";
import { __resetSeenKeeperLines } from "@/components/keeper/ScreenKeeper";
import { useSettings } from "@/state/settings";
import { useMode } from "@/state/mode";
import { setStorageScope } from "@/state/storage";

const W = MOCK_WALLET;
/** The user's seeded Oath with this name; a running or finished one before an Open one ("Iron Week" is both). */
const oath = (name: string) => {
  const all = mockOaths.list(W).filter((o) => o.name === name && !o.bountyId && !o.rematchOf);
  return (all.find((o) => o.status !== "open") ?? all[0])?.id ?? "";
};
const bounty = (name: string) => mockBounties.byName(name)?.id ?? "";
const rematch = () => mockOaths.rematchFor(oath("Guitar Days"))?.id ?? "";
/** Today's day index of a running Oath (for review fixtures). */
const today = (id: string) => { const o = mockOaths.get(id); return o?.day1StartsAt ? Math.floor((clock.now() / 1000 - o.day1StartsAt) / o.daySeconds) : 0; };

interface Shot {
  scenario?: Scenario;
  /** Screen under a sheet or this screen (default: Today). */
  under?: [DesignId, (() => Params)?];
  params?: () => Params;
  /** Runs after seeding, before params are resolved. */
  setup?: () => void;
}

const iron = () => ({ id: oath("Iron Week") });
const ironOpen = () => ({ id: mockOaths.byCode("IRON-7K2Q")?.id ?? "", code: "IRON-7K2Q" });
const proof = (photo: 1 | 2, name = "Iron Week") => () => ({ id: oath(name), photo });
const fail = (retry: DesignId, edit: DesignId) => () => ({ retry, edit, need: "1,000" });
const invite = () => { mockOaths.inviteFor("IRON-7K2Q", W); };
const joined = () => { mockOaths.join(mockOaths.byCode("DAWN-R7Q2")!.id, W); };
const dawn = () => ({ id: mockOaths.byCode("DAWN-R7Q2")?.id ?? "" });
function review(votes: [keyof typeof PEOPLE, boolean][]) {
  return () => {
    const o = mockOaths.get(oath("Iron Week"))!;
    const r = mockReviews.request(o, W, today(o.id), "open_palm");
    for (const [p, yes] of votes) mockReviews.vote(r.id, PEOPLE[p].wallet, yes);
    return { id: o.id, review: r.id };
  };
}

/** How to reach each design id (scenario, params). Ids not listed open on `activeGroup` with no params. */
const SHOTS: Partial<Record<DesignId, Shot>> = {
  "A1·m": { under: ["A1"] }, "A2·e": { scenario: "walletRejected" }, "A3·no": { scenario: "notEligible" },
  // B2 needs nothing claimable (D-45), so take Hydra 14's claim first.
  B2: { scenario: "allDone", setup: () => { mockOaths.claim(oath("Hydra 14"), W); } }, B3: { scenario: "fresh" }, B4: { scenario: "deadlineClose" },
  C7: { params: fail("C7", "C6") }, "C7·ok": { params: ironOpen }, "C7·no": { params: fail("C7", "C6") }, "C7·fail": { params: fail("C7", "C6") }, C8: { params: ironOpen },
  D1: { params: ironOpen }, "D1·m": { setup: joined, params: dawn }, "D1·x": { under: ["D1", ironOpen], params: ironOpen }, "D1·xs": { params: ironOpen }, "D1·go": { params: ironOpen },
  D2: { params: iron }, "D2·low": { scenario: "lowHp", params: iron }, D3: { scenario: "broken", params: () => ({ id: oath("Guitar Days") }) }, D4: { params: () => ({ id: oath("Hydra 14") }) },
  E1: { scenario: "fresh" }, E2: { scenario: "fresh", setup: invite, params: ironOpen }, "E2·s": { scenario: "fresh", setup: invite, params: ironOpen },
  "E3·late": { params: iron }, "E3·in": { params: ironOpen }, "E3·skr": { scenario: "noSkr", setup: invite, params: ironOpen },
  R1: { scenario: "broken", params: () => ({ id: oath("Guitar Days") }) }, R2: { scenario: "broken", params: () => ({ id: oath("Guitar Days") }) },
  R3: { scenario: "broken", params: () => ({ id: rematch() }) }, "R·act": { scenario: "rematchActive", params: () => ({ id: rematch() }) },
  R4: { scenario: "rematchKept", params: () => ({ id: rematch() }) }, "R4·lost": { scenario: "rematchLost", params: () => ({ id: rematch() }) },
  L6: { scenario: "rematchKept", params: () => ({ id: rematch() }) },
  "F1·perm": { params: proof(1) }, F1: { params: proof(1) }, F2: { params: proof(1) }, F2a: { params: proof(1) }, F2b: { params: proof(1) }, F2c: { params: proof(1) },
  F3: { params: proof(1) }, F4: { params: proof(2) }, "F4·chk": { params: proof(2) }, F4a: { params: proof(2, "Read 20 pages") }, "F4a·g": { params: proof(2) }, F5: { params: proof(2) },
  G1: { params: iron }, G2: { params: iron }, G3: { params: review([["arjun", false], ["riya", true], ["dev", true]]) }, "G3·no": { params: review([["riya", true], ["arjun", false], ["dev", false]]) },
  H2: { params: () => ({ id: bounty("Northbound Run Club") }) }, "H2·no": { params: () => ({ id: bounty("Rope 1k") }) }, H3: { params: () => ({ id: bounty("Hydrate Week") }) },
  H4: { scenario: "bountyOut", params: () => ({ id: bounty("Hydrate Week") }) }, H5: { scenario: "bountyJoined", params: () => ({ id: bounty("Sol Strings") }) },
  H6: { params: () => ({ id: bounty("Dawn Pages") }) }, "K5·ok": { params: () => ({ id: bounty("Dawn Pages") }) }, L5: { scenario: "bountyJoined" },
  I2: { params: () => ({ wallet: PEOPLE.riya.wallet }) }, "I2·p": { params: () => ({ wallet: PEOPLE.arjun.wallet }) }, I3: { params: () => ({ name: "Drift" }) },
  J1: { params: () => ({ id: oath("Hydra 14") }) }, "J1·p": { params: () => ({ id: oath("Hydra 14") }) }, "J1·ok": { params: () => ({ id: oath("Hydra 14"), amount: "1,186" }) },
  "J1·f": { params: () => ({ id: oath("Hydra 14"), retry: "J1·p", edit: "J1" }) },
  L1: { scenario: "settledKept", params: iron }, L2: { scenario: "settledMissed", params: iron }, L3: { scenario: "broken", params: () => ({ id: oath("Guitar Days") }) },
  L4: { scenario: "soloKept", params: () => ({ id: oath("Read 20 pages") }) }, "L4·m": { scenario: "soloMissed", params: () => ({ id: oath("Read 20 pages") }) },
  "L4·b": { scenario: "soloBroken", params: () => ({ id: oath("Read 20 pages") }) },
  M3: { scenario: "noSol", params: fail("C7", "C6") }, M4: { scenario: "noSkr", params: fail("C7", "C6") }, "W3·s": { params: () => ({ lamports: "500000000" }) },
};

const TODAY_STATES = new Set<string>(["B2", "B3", "B4"]);
const ONBOARDING = new Set<string>(["A0", "A1", "A1·m", "A2", "A2·s", "A2·e", "A3", "A3·no", "A4"]);
/** The prototype's Bounty draft (K1–K5). */
const SAMPLE_BOUNTY = { name: "Dawn Pages", message: "Read before your phone. 14 mornings.", link: "dawnpages.xyz" };
/** The prototype's "You" avatar (reference/kept-kit.js › P.Y). */
const SAMPLE_AVATAR = "13050010";
const SAMPLE_DRAFT = { goal: "lift for 20 minutes", objectId: 0, numDays: 7 as const, isSolo: false, stakeSkr: 1000, reviewMode: "ai_group" as const };

/** Handles `kept://dev/open/…`. Returns false for any other URL. */
function openDevLink(url: string): boolean {
  const m = url.match(/^kept:\/\/dev\/open\/([^?#]+)(?:\?([^#]*))?/);
  if (!m) return false;
  const raw = decodeURIComponent(m[1]!);
  const id = (ROUTES.some((r) => r.id === raw) ? raw : designIdOf(raw)) as DesignId | undefined;
  if (!id) return true;
  const q = Object.fromEntries((m[2] ?? "").split("&").filter(Boolean).map((kv) => kv.split("=").map(decodeURIComponent) as [string, string]));
  const shot = SHOTS[id] ?? {};
  const scenario = (SCENARIOS as readonly string[]).includes(q.scenario ?? "") ? (q.scenario as Scenario) : shot.scenario ?? "activeGroup";

  // `quiet=1` (the shoot script): no LogBox toasts over the screenshot; errors still go to logcat.
  if (q.quiet === "1") LogBox.ignoreAllLogs(true);
  // A clean mock world on the scenario, in Demo (its own storage scope; every store is set below).
  useMode.setState({ mode: "demo" });
  setStorageScope("demo");
  useDevHold.setState({ hold: q.hold === "1", still: q.still === "1" });
  // Demo already means the mock for every slice, with the mock wallet; nothing else to switch on.
  useDev.setState({ scenario, overrides: {}, mockWallet: false });
  clock.reset();
  mockOaths.reset();
  mockReviews.reset();
  resetMockApi();
  queryClient.clear();
  useUi.setState({ fx: null, devMenu: false });
  __resetSeenKeeperLines();
  useSettings.setState({ profileTipSeen: false });
  useDraft.setState({ draft: SAMPLE_DRAFT });
  useBountyDraft.getState().reset();
  if (id.startsWith("K")) useBountyDraft.getState().set(SAMPLE_BOUNTY);
  const signedOut = ONBOARDING.has(id);
  useSession.setState(signedOut
    ? { token: null, wallet: null, genesis: false, onboarded: false, avatar: null, invite: null }
    : { token: `mock.${W}`, wallet: W, genesis: scenario !== "notEligible", onboarded: true, avatar: SAMPLE_AVATAR, invite: null });
  mockOaths.ensureSeeded(scenario, W);
  shot.setup?.();
  // Results and the recap are moments shown once: mark them seen so they don't open over the target.
  const ids = mockOaths.list(W).map((o) => o.id);
  useDeviceOaths.setState({ shownResults: ids.flatMap((o) => RESULT_SCREENS.map((k) => `${o}:${k}`)), recapShownOn: new Date(clock.now()).toDateString(), photo1: {}, fails: {}, seenHp: {} });

  const route = (d: DesignId, p?: Params) => { const [name, params] = target(d, p); return { name, params }; };
  // Today's states (B2–B4) are the B1 tab on another scenario.
  const screen = TODAY_STATES.has(id) ? "B1" : id;
  const routes = signedOut ? [] : [route("B1")];
  if (shot.under) routes.push(route(shot.under[0], shot.under[1]?.()));
  if (presentation(screen) !== "tab") routes.push(route(screen, shot.params?.()));
  else routes[routes.length - 1] = route(screen);
  if (!routes.length) routes.push(route(screen));
  if (navigationRef.isReady()) navigationRef.dispatch(CommonActions.reset({ index: routes.length - 1, routes }));
  return true;
}

/** Opens a dev link once navigation is ready and the persisted stores have loaded (cold starts). */
export function openDevLinkWhenReady(url: string): boolean {
  if (!/^kept:\/\/dev\//.test(url)) return false;
  const stores = [useMode, useSession, useDev, useDraft, useDeviceOaths];
  const tryOpen = () => {
    if (navigationRef.isReady() && stores.every((s) => s.persist.hasHydrated())) openDevLink(url);
    else setTimeout(tryOpen, 100);
  };
  tryOpen();
  return true;
}
