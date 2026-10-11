// The navigation tree from design/flows.md › Navigation model (docs/ARCHITECTURE.md §5).
// Every design id is registered: the tabs inside "Tabs" (Today's states are B1), everything else on the
// root stack. BUILT must name a component for each (a missing one is a type error).
import type { ComponentType } from "react";
import { NavigationContainer, DarkTheme, StackActions } from "@react-navigation/native";
import type { LinkingOptions, ParamListBase } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBar } from "@/components/chrome";
import type { TabKey } from "@/components/chrome";
import { color } from "@/theme";
import { M2 } from "@/screens/M2";
import { PlusSheet } from "@/screens/sheets/PlusSheet";
import { A0, A1, A1m, A2, A2e, A2s, A3, A3no, A4 } from "@/screens/onboarding/Onboarding";
import { RecapSheet, TodayTab } from "@/screens/today/Today";
import { C1, C2, C3, C4, C5, C6, C7, C7ok, C8 } from "@/screens/create/Create";
import { C7fail, C7no, M3, M4 } from "@/screens/shared/Signing";
import { D1, D1go, D1m, D1x, D1xs, D2, D4, D5, OathsTab } from "@/screens/oaths/Oaths";
import { E1, E2, E2s, E3code, E3elig, E3in, E3late, E3skr } from "@/screens/join/Join";
import { F1, F1perm, F2, F2a, F2b, F2c, F3, F4, F4a, F4ag, F4chk, F5 } from "@/screens/proof/Proof";
import { J1, J1f, J1ok, J1p, L1, L2, L3, L4, L4b, L4m } from "@/screens/results/Results";
import { L6, R1, R2, R3, R4, R4lost } from "@/screens/rematch/Rematch";
import { G1, G2, G3, G3no } from "@/screens/review/Review";
import { BountiesTab, H1c, H1j, H2, H2no, H3, H4, H5, H6, H7, L5 } from "@/screens/bounties/Bounties";
import { K1, K2, K3, K4, K5, K5ok, K5p } from "@/screens/bounties/CreateBounty";
import { I2, I2me, I2p, I3, I4, I5, I7, I8, I9, ProfileTab } from "@/screens/profile/Profile";
import { M1, N1 } from "@/screens/inbox/Inbox";
import { W1, W2, W3, W3ok, W3s, W4 } from "@/screens/wallet/Wallet";
import { useSession } from "@/state/session";
import { useMode } from "@/state/mode";
import { startLiveWithInvite } from "@/features/mode";
import { navigationRef, resetStack } from "./nav";
import { ROUTES, presentation, routeName } from "./routes";
import type { DesignId } from "./routes";

const Stack = createNativeStackNavigator();
/** The dev Gallery: development builds only (Metro drops the require from release bundles). */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would ship it in release
const Gallery = __DEV__ ? (require("@/dev/Gallery") as typeof import("@/dev/Gallery")).Gallery : null;
const Tab = createBottomTabNavigator();

type StackId = Exclude<DesignId, "B1" | "D0" | "H1" | "I1" | "B2" | "B3" | "B4">;
const BUILT: Record<StackId, ComponentType> = {
  A0, A1, "A1·m": A1m, A2, "A2·s": A2s, "A2·e": A2e, A3, "A3·no": A3no, A4, M2, "+": PlusSheet,
  B5: RecapSheet,
  C1, C2, C3, C4, C5, C6, C7, "C7·ok": C7ok, "C7·no": C7no, "C7·fail": C7fail, C8,
  D1, "D1·m": D1m, "D1·x": D1x, "D1·xs": D1xs, "D1·go": D1go, D2, "D2·low": D2, D3: D2, D4, D5,
  E1, E2, "E2·s": E2s, "E3·code": E3code, "E3·late": E3late, "E3·in": E3in, "E3·elig": E3elig, "E3·skr": E3skr,
  "F1·perm": F1perm, F1, F2, F2a, F2b, F2c, F3, F4, "F4·chk": F4chk, F4a, "F4a·g": F4ag, F5,
  J1, "J1·p": J1p, "J1·ok": J1ok, "J1·f": J1f,
  L1, L2, L3, L4, "L4·m": L4m, "L4·b": L4b,
  M1, M3, M4, N1,
  R1, R2, R3, "R·act": D2, R4, "R4·lost": R4lost, L6,
  G1, G2, G3, "G3·no": G3no,
  "H1·j": H1j, "H1·c": H1c, H2, "H2·no": H2no, H3, H4, H5, H6, H7, L5,
  K1, K2, K3, K4, K5, "K5·p": K5p, "K5·ok": K5ok,
  I2, "I2·me": I2me, "I2·p": I2p, I3, I4, I5, I7, I8, I9,
  W1, W2, W3, "W3·s": W3s, "W3·ok": W3ok, W4,
};
/** Stack ids are exactly BUILT's keys (the tabs and Today's states live in Tabs). */
const componentOf = (id: DesignId): ComponentType => BUILT[id as StackId] as ComponentType;

const TAB_SCREENS: { id: DesignId; key: TabKey; component: ComponentType }[] = [
  { id: "B1", key: "today", component: TodayTab },
  { id: "D0", key: "oaths", component: OathsTab },
  { id: "H1", key: "bounties", component: BountiesTab },
  { id: "I1", key: "profile", component: ProfileTab },
];

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const active = TAB_SCREENS[state.index]?.key ?? "today";
  return (
    <TabBar
      active={active}
      bottomInset={insets.bottom}
      onTab={(k) => navigation.navigate(routeName(TAB_SCREENS.find((s) => s.key === k)!.id))}
      onPlus={() => navigation.getParent()?.navigate(routeName("+"))}
    />
  );
}

function Tabs() {
  return (
    <Tab.Navigator tabBar={(p) => <CustomTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg.app } }}>
      {TAB_SCREENS.map((s) => <Tab.Screen key={s.id} name={routeName(s.id)} component={s.component} />)}
    </Tab.Navigator>
  );
}

const flowIds = ROUTES.filter((r) => !["tab", "sheet", "moment"].includes(presentation(r.id)));
const sheetIds = ROUTES.filter((r) => presentation(r.id) === "sheet");
const momentIds = ROUTES.filter((r) => presentation(r.id) === "moment");

/**
 * `kept://join/<code>` is always Live (D-80). Signed in on Live and onboarded: E1 with the code. Otherwise
 * the app switches to Live (leaving Demo wipes it), keeps the code (session.invite), and goes straight to
 * connecting a wallet; onboarding's cont: rule opens E1 at the end (docs/ARCHITECTURE.md §5).
 */
export function routeInvite(url: string | null): string | null {
  if (!url) return url;
  const code = url.match(/^(?:kept:\/\/join\/|https:\/\/keptdapp\.vercel\.app\/o\/)([^/?#]+)/i)?.[1];
  if (!code) return url;
  const inviteUrl = `kept://join/${code}`;
  const s = useSession.getState();
  if (useMode.getState().mode === "live" && s.token && s.onboarded) return inviteUrl;
  void startLiveWithInvite(decodeURIComponent(code)).then(() => {
    // On a cold start A0 is still up and routes by itself once the session has loaded.
    const current = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
    if (!current || current === routeName("A0")) return;
    const live = useSession.getState();
    if (live.token && live.onboarded) resetStack(["B1", "E1"], { code: decodeURIComponent(code) });
    else if (live.token) resetStack(["A4"]);
    else resetStack(["A1", "A2"]);
  });
  return null;
}

/**
 * A join link while E1 is already in the stack goes back to that E1 with the new code instead of
 * stacking another one (audit N5; React Navigation 7's navigate pushes).
 */
function reuseJoin(url: string): boolean {
  const code = url.match(/^kept:\/\/join\/([^/?#]+)/)?.[1];
  if (!code || !navigationRef.isReady()) return false;
  const name = routeName("E1");
  if (!navigationRef.getRootState()?.routes.some((r) => r.name === name)) return false;
  navigationRef.dispatch(StackActions.popTo(name, { code: decodeURIComponent(code) }));
  return true;
}

/** `kept://dev/open/<screen>` (development builds only; Metro drops the require from release bundles). */
function devLink(url: string): boolean {
  if (!__DEV__) return false;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a static import would ship it in release
  return (require("@/dev/devLink") as typeof import("@/dev/devLink")).openDevLinkWhenReady(url);
}

const linking: LinkingOptions<ParamListBase> = {
  prefixes: ["kept://", "https://keptdapp.vercel.app"],
  config: { screens: { [routeName("E1")]: "join/:code" } },
  getInitialURL: async () => { const url = await Linking.getInitialURL(); return url && devLink(url) ? null : routeInvite(url); },
  subscribe: (listener) => {
    const sub = Linking.addEventListener("url", ({ url }) => { if (devLink(url)) return; const u = routeInvite(url); if (u && !reuseJoin(u)) listener(u); });
    return () => sub.remove();
  },
};

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: color.bg.app, card: color.bg.app } };

export function RootNavigator({ onReady }: { onReady?: () => void }) {
  return (
    <NavigationContainer ref={navigationRef} linking={linking} theme={theme} {...(onReady ? { onReady } : {})}>
      <Stack.Navigator initialRouteName={routeName("A0")} screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: color.bg.app } }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ animation: "fade" }} />
        {flowIds.map((r) => (
          <Stack.Screen key={r.id} name={routeName(r.id)} component={componentOf(r.id)}
            options={r.id === "A0" ? { animation: "fade" } : presentation(r.id) === "modal" ? { animation: "slide_from_bottom" } : {}} />
        ))}
        <Stack.Group screenOptions={{ animation: "fade", gestureEnabled: false }}>
          {momentIds.map((r) => <Stack.Screen key={r.id} name={routeName(r.id)} component={componentOf(r.id)} />)}
        </Stack.Group>
        {/* Sheets draw their own scrim and slide (BottomSheet), over the screen below. */}
        <Stack.Group screenOptions={{ presentation: "transparentModal", animation: "none", contentStyle: { backgroundColor: "transparent" } }}>
          {sheetIds.map((r) => <Stack.Screen key={r.id} name={routeName(r.id)} component={componentOf(r.id)} />)}
        </Stack.Group>
        {Gallery ? <Stack.Screen name="Gallery" component={Gallery} /> : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
