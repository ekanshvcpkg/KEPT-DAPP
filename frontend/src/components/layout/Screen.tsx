// The common screen frame (screens.md › Common layout): safe area, the DEVNET row under the system
// status bar, a NavBar (flows) or AppHeader (tabs) bar, a scroll column 20 from the edges with gap 14,
// and pinned actions 34 from the bottom. Each screen hosts its own Keeper (ScreenKeeper): the note drops
// under the bar and closes on a tap anywhere else or when the screen loses focus, so it can never leak
// onto another screen.
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import type { ListItem } from "./list";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardHeight } from "@/lib/keyboard";
import { useScreenReady } from "@/lib/screenReady";
import { env } from "@/config/env";
import { color, metrics, space } from "@/theme";
import { useUi } from "@/state/ui";
import { useContext } from "react";
import { NavigationContext, NavigationRouteContext } from "@react-navigation/native";
import { layoutOf } from "@/app/layout";
import { designIdOf, presentation } from "@/app/routes";
import type { KeeperLine } from "@/copy";
import { isNoteOnlyKeeper, useKeeperHost } from "../keeper/ScreenKeeper";
import { Enter, FadeOut, flattenBlocks } from "../primitives";
import { Ambient } from "../chrome/Ambient";
import { Spacer } from "../content/Basics";
import { DemoBadge, DevnetBadge } from "../chrome/Header";
import { useIsDemo } from "@/state/mode";
import { PinnedActions } from "../actions";
import { momentSettleMs, pinnedDelay, useBackBlockedFor } from "./moment";
import { ScreenSkeleton } from "./ScreenSkeleton";

interface ScreenProps {
  /** NavBar or AppHeader element; omitted for Plain layouts (A0, A1). */
  bar?: ReactNode;
  children?: ReactNode;
  /** Buttons pinned to the bottom (PinnedActions). */
  pinned?: ReactNode;
  /** Bottom space the content must leave for pinned actions or the tab bar. */
  bottomInset?: number;
  scroll?: boolean;
  /** Content fills the screen (no scroll column), e.g. the splash. */
  bare?: boolean;
  /**
   * The design id whose ambient light and hero offset to use (app/layout.gen.json). Defaults to the
   * route; set it where one route shows several designed states (Today B1–B4, D2 / D2·low / D3).
   */
  layout?: string;
  /** Tab screens: the tab's idle line, opened from the mark when the screen has no line of its own. */
  keeperIdle?: KeeperLine;
}


/**
 * A long list (inbox, activity, history, Bounties) that Live data can grow without bound. As a Screen's
 * last block it's virtualised: the screen scrolls through a FlatList whose header is the blocks above it, so
 * rows mount as they scroll in. Anywhere else it simply renders every row.
 */
export function ScreenList({ items }: { items: ListItem[] }) {
  return <View>{items.map((it, i) => <View key={it.key} style={{ marginTop: i ? it.gapBefore ?? 0 : 0 }}>{it.render()}</View>)}</View>;
}
/** Rows drawn (and entering with the screen) before the list starts mounting the rest as they scroll in. */
const LIST_FIRST_BATCH = 12;

/** A counter that bumps each time the screen regains focus (after the first), when `on`. */
function useFocusReplay(on: boolean): number {
  const nav = useContext(NavigationContext);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on || !nav) return;
    let first = true;
    return nav.addListener("focus", () => { if (first) { first = false; return; } setN((x) => x + 1); });
  }, [on, nav]);
  return n;
}

/** The route's design id, or none outside a navigator (tests, the Gallery). */
function useDesignId(): string | undefined {
  const route = useContext(NavigationRouteContext);
  return route ? designIdOf(route.name) : undefined;
}

export function Screen({ bar, children, pinned, bottomInset = 0, scroll = true, bare, layout, keeperIdle }: ScreenProps) {
  const insets = useSafeAreaInsets();
  // Pinned actions ride above the keyboard (E1 "Find Oath", C1/K1 "Next"); the scroll column follows.
  const kb = useKeyboardHeight();
  const bottom = Math.max(insets.bottom, kb);
  const routeId = useDesignId();
  const l = layoutOf(layout ?? routeId);
  const top = l?.top ? <Spacer h={l.top} /> : null;
  const openDev = useUi((s) => s.setDevMenu);
  const m = metrics.screen;
  const demo = useIsDemo();
  const devnet = env.cluster === "devnet";
  const badges = devnet || demo;
  const kind = routeId && presentation(routeId) === "tab" ? "tab" : "flow";
  const keeper = useKeeperHost(routeId, kind, keeperIdle ?? null);
  // The bar and light paint at once; the content mounts when the push has landed (D-83, lib/screenReady).
  const ready = useScreenReady();
  // The skeleton stays drawn while it fades out over the arriving content.
  const [veil, setVeil] = useState(!ready);
  useEffect(() => {
    if (!ready || !veil) return;
    const id = setTimeout(() => setVeil(false), metrics.skeleton.fadeMs + 100);
    return () => clearTimeout(id);
  }, [ready, veil]);
  // The note drops from just under the bar (components.md › KeeperNote: top 106 header / 104 nav, bar at 56).
  const k = metrics.keeperNote;
  // motion.md › Screen-level choreography: block i enters at 40 + 65·i ms (a Keeper that moved into the
  // mark takes no slot); pinned actions at 200 ms. Tab screens stay mounted, so they replay on focus.
  const replay = useFocusReplay(kind === "tab");
  const all = flattenBlocks(children);
  const blocks = all.filter((c) => !isNoteOnlyKeeper(c, kind));
  // A Keeper that moved into the mark still mounts (it registers its line) but takes no slot or gap.
  const noteOnly = all.filter((c) => isNoteOnlyKeeper(c, kind));
  // A block can be a component that returns several elements (Bounties' Discover, D1's header): the
  // wrapper spaces them like the column does.
  const entered = blocks.map((c, i) => <Enter key={c.key ?? `b${i}`} index={i} replay={replay} style={{ gap: m.gap }}>{c}</Enter>);
  const lastBlock = blocks[blocks.length - 1];
  const list = scroll && lastBlock?.type === ScreenList ? (lastBlock.props as { items: ListItem[] }) : null;
  const pinnedAll = pinned ? flattenBlocks(pinned) : [];
  const pinnedBlocks = pinned ? pinnedAll.map((c, i) => <Enter key={c.key ?? `p${i}`} delay={pinnedDelay(i)} replay={replay}>{c}</Enter>) : null;
  useBackBlockedFor(momentSettleMs(blocks.length, pinnedAll.length), ready && !!routeId && presentation(routeId) === "moment");
  const column = { paddingHorizontal: m.padX, paddingTop: bar ? m.contentTop : m.plainTop, gap: m.gap };
  const noteTop = insets.top + (badges ? metrics.statusBar.badgeRow : 0) + m.barGap + (kind === "tab" ? k.topHeader : k.topNav) - metrics.header.top;
  return (
    <keeper.Provider value={keeper.value}>
    <View style={{ flex: 1, backgroundColor: color.bg.app, paddingTop: insets.top }}>
      {l ? <Ambient tone={l.tone} ambient={l.ambient} beam={l.beam} decor={l.decor} /> : null}
      {badges ? (
        <View style={{ height: metrics.statusBar.badgeRow, paddingHorizontal: m.padX, flexDirection: "row", alignItems: "center", gap: space[6] }}>
          {devnet ? <DevnetBadge {...(__DEV__ ? { onLongPress: () => openDev(true) } : {})} /> : null}
          {demo ? <DemoBadge /> : null}
        </View>
      ) : null}
      {bar ? <View style={{ paddingHorizontal: m.padX, marginTop: m.barGap }}>{bar}</View> : null}
      <View style={{ flex: 1 }}>
        {!ready ? null : bare ? <View style={{ flex: 1 }}>{children}</View> : (
          // One ScrollView whether or not it scrolls: swapping a ScrollView for a plain View under the fading
          // skeleton made Fabric re-parent native children and crash on the camera (F1: "addViewAt: ... already
          // has a parent"). With pinned actions the column ends 14 above them, like the prototype, so content is
          // clipped there instead of scrolling behind (and showing between) the buttons.
          list ? (
            <FlatList
              data={list.items}
              keyExtractor={(it) => it.key}
              style={pinned ? { marginBottom: bottom + bottomInset + m.gap } : undefined}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: m.padX, paddingTop: column.paddingTop, paddingBottom: pinned ? m.contentBottom : insets.bottom + bottomInset + m.gap }}
              ListHeaderComponent={entered.length > 1 || top ? <View style={{ gap: m.gap, marginBottom: list.items.length ? m.gap : 0 }}>{top}{entered.slice(0, -1)}</View> : null}
              initialNumToRender={LIST_FIRST_BATCH}
              windowSize={7}
              removeClippedSubviews
              renderItem={({ item, index }) => {
                const row = <View style={{ marginTop: index ? item.gapBefore ?? 0 : 0 }}>{item.render()}</View>;
                // The first rows enter with the screen like the block they replace; later ones just appear as they scroll in.
                return index < LIST_FIRST_BATCH ? <Enter index={blocks.length - 1} replay={replay}>{row}</Enter> : row;
              }}
            />
          ) : (
          <ScrollView scrollEnabled={scroll} style={pinned ? { marginBottom: bottom + bottomInset + m.gap } : undefined} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ ...column, flexGrow: scroll ? undefined : 1, paddingBottom: pinned ? m.contentBottom : insets.bottom + bottomInset + m.gap }}>
            {top}
            {scroll ? entered : blocks.map((c, i) => <Fragment key={c.key ?? `b${i}`}>{c}</Fragment>)}
          </ScrollView>
          )
        )}
        {/* The skeleton until the content mounts, then fading out over it as the blocks enter (no blank frame). */}
        {veil && !bare ? (
          <FadeOut hold={!ready} ms={metrics.skeleton.fadeMs} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, pointerEvents: "none" }}>
            <View style={column}><ScreenSkeleton /></View>
          </FadeOut>
        ) : null}
      </View>
      {pinned && ready ? <PinnedActions bottomInset={kb ? kb - metrics.pinned.bottom + m.gap : insets.bottom}>{pinnedBlocks}</PinnedActions> : null}
      {bare || !ready ? null : noteOnly.map((c, i) => <Fragment key={c.key ?? `k${i}`}>{c}</Fragment>)}
      {keeper.note ? (
        // Any tap outside the open note closes it (the tap is used for that, not passed on). TalkBack closes it from the note itself.
        <Pressable onPress={keeper.value.close} importantForAccessibility="no" testID="keeper-backdrop" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 44 }} />
      ) : null}
      {keeper.note ? <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: noteTop, zIndex: 45 }}>{keeper.note}</View> : null}
    </View>
    </keeper.Provider>
  );
}
