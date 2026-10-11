// Navigation by design id. Screens never spell route names: they call go("D2"), replace("C7·ok"),
// back(). Forward moves go through app/history.ts (D-86), so back never walks into a finished flow; tab ids
// go back to the existing home (React Navigation 7's navigate would push a second one).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CommonActions, StackActions, TabActions, createNavigationContainerRef, useNavigation, useRoute } from "@react-navigation/native";
import type { NavigationAction, NavigationProp, ParamListBase } from "@react-navigation/native";
import { useSession } from "@/state/session";
import { planStack } from "./history";
import type { StackRoute } from "./history";
import { TAB_STATES, presentation, routeName } from "./routes";
import type { DesignId } from "./routes";

export type Params = Record<string, string | number | boolean | undefined>;
export const navigationRef = createNavigationContainerRef<ParamListBase>();

/** Route + params for a design id (tabs are nested in "Tabs"). */
export function target(id: DesignId, params?: Params): [string, object | undefined] {
  return presentation(id) === "tab" ? ["Tabs", { screen: routeName(TAB_STATES[id] ?? id), params }] : [routeName(id), params];
}

/** Back to the existing home (the Tabs route, nothing above it) on the tab for `id`. */
function goHome(id: DesignId, params: Params | undefined, routes: StackRoute[]) {
  const tab = routeName(TAB_STATES[id] ?? id);
  const i = routes.findIndex((r) => r.name === "Tabs");
  if (i < 0) {
    navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "Tabs", params: { screen: tab, params } }] }));
    return;
  }
  const tabs = routes[i]!;
  const key = (tabs.state as { key?: string } | undefined)?.key;
  if (routes.length > i + 1 || !key) {
    const home = key ? tabs : { ...tabs, params: { screen: tab, params } };
    navigationRef.dispatch(CommonActions.reset({ index: i, routes: [...routes.slice(0, i), home] as never }));
  }
  if (key) navigationRef.dispatch({ ...TabActions.jumpTo(tab, params), target: key });
}

/**
 * Go forward from the root stack's top (history.ts decides what stays behind). False when the app's
 * container isn't mounted (component tests with their own navigator), so the caller falls back.
 */
function rootGo(id: DesignId, params: Params | undefined, replace: boolean): boolean {
  if (!navigationRef.isReady()) return false;
  const state = navigationRef.getRootState();
  if (!state || state.type !== "stack") return false;
  const routes = state.routes as unknown as StackRoute[];
  if (presentation(id) === "tab") { goHome(id, params, routes); return true; }
  const next = planStack(routes, id, params, replace);
  const pushed = next.length === routes.length + 1 && routes.every((r, i) => next[i] === r);
  const last = next[next.length - 1]!;
  if (pushed) navigationRef.dispatch(StackActions.push(last.name, last.params));
  else navigationRef.dispatch(CommonActions.reset({ index: next.length - 1, routes: next as never }));
  return true;
}

export function useGo() {
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const go = useCallback((id: DesignId, params?: Params) => {
    if (rootGo(id, params, false)) return;
    const [n, p] = target(id, params); nav.navigate(n, p);
  }, [nav]);
  const replace = useCallback((id: DesignId, params?: Params) => {
    if (rootGo(id, params, true)) return;
    const [n, p] = target(id, params); nav.dispatch(StackActions.replace(n, p));
  }, [nav]);
  const back = useCallback(() => { if (nav.canGoBack()) nav.goBack(); }, [nav]);
  /** Clears the stack: used when onboarding ends or the user signs out. */
  const reset = useCallback((id: DesignId, params?: Params) => {
    const [n, p] = target(id, params);
    nav.dispatch(CommonActions.reset({ index: 0, routes: [{ name: n, params: p }] }));
  }, [nav]);
  /**
   * A close (✕) button: back when there is somewhere to go back to, else the home screen. A screen can be the only one in
   * the stack (a link or notification opened it, or the stack was rebuilt around it) and back would do nothing.
   */
  const close = useCallback((home: DesignId = "B1") => {
    if (nav.canGoBack()) nav.goBack();
    else reset(home);
  }, [nav, reset]);
  return useMemo(() => ({ go, replace, back, reset, close }), [go, replace, back, reset, close]);
}

/**
 * flows.md `cont:` rule: go to `fallback`, or to E1 with the invite code if the user arrived with an
 * invite (then forget it).
 */
export function useContinue() {
  const { reset } = useGo();
  return useCallback((fallback: DesignId) => {
    const { invite, setInvite } = useSession.getState();
    if (invite !== null) {
      setInvite(null);
      reset("B1");
      const [n, p] = target("E1", invite ? { code: invite } : undefined);
      setTimeout(() => navigationRef.isReady() && navigationRef.navigate(n, p), 0);
    } else {
      reset(fallback);
    }
  }, [reset]);
}

/** Navigate from outside React (hosts, deep links). */
export function navigateTo(id: DesignId, params?: Params) {
  rootGo(id, params, false);
}

/** Replace the whole stack from outside React (deep links, mode changes). The last id is shown. */
export function resetStack(ids: DesignId[], params?: Params) {
  if (!navigationRef.isReady() || !ids.length) return;
  const routes = ids.map((id, i) => { const [name, p] = target(id, i === ids.length - 1 ? params : undefined); return { name, params: p }; });
  navigationRef.dispatch(CommonActions.reset({ index: routes.length - 1, routes }));
}

/** Route params as strings/numbers (every screen reads them through this). */
export function useParams<P extends Params>(): Partial<P> {
  return (useRoute().params ?? {}) as Partial<P>;
}

/**
 * A sheet route (flows.md: sheets as sheets). Going back (hardware back, the scrim, a swipe, its button)
 * first slides the sheet down (BottomSheet's close, 300 ms), then removes the route. Forward actions
 * (replace by a flow) go straight through.
 */
export function useSheetRoute(enabled = true) {
  const nav = useNavigation<NavigationProp<ParamListBase>>();
  const [visible, setVisible] = useState(true);
  const pending = useRef<NavigationAction | null>(null);
  useEffect(() => enabled ? nav.addListener("beforeRemove", (e) => {
    const type = e.data.action.type;
    if (pending.current || (type !== "GO_BACK" && type !== "POP")) return;
    e.preventDefault();
    pending.current = e.data.action;
    setVisible(false);
  }) : undefined, [nav, enabled]);
  const onClose = useCallback(() => { if (nav.canGoBack()) nav.goBack(); }, [nav]);
  const onHidden = useCallback(() => { if (pending.current) nav.dispatch(pending.current); }, [nav]);
  return { visible, onClose, onHidden };
}
