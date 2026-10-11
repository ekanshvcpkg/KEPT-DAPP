// A1·i Intro: three swipeable pages before the wallet steps: the bet, the AI check, the chart. Each page's
// picture plays when it is reached; the pictures lag behind the swipe and the light behind them cross-fades
// from page to page. The last page carries the same two buttons as A1 (Get started, I have an invite).
import { useCallback, useRef, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import Animated, { Extrapolation, interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/copy";
import { Button } from "@/components/actions";
import { Ambient } from "@/components/chrome";
import { Title } from "@/components/content/Basics";
import { Screen } from "@/components/layout/Screen";
import { color, metrics, space } from "@/theme";
import { haptic } from "@/lib/haptics";
import { useGo } from "@/app/nav";
import { startLiveWithInvite } from "@/features/mode";
import { useMode } from "@/state/mode";
import { useSession } from "@/state/session";
import { useIntro } from "@/state/intro";
import { BetHero, CheckHero, FitHero, HERO1, HERO2, HERO3, ProgressHero } from "./IntroHeroes";

const PAGES = 3;
const AMBIENT = ["ember", "sky", "lime"] as const;
const TITLE_FS = 32;

/** One dot: a pill that widens and turns lime while its page is the one in view. */
function Dot({ index, x, w }: { index: number; x: SharedValue<number>; w: number }) {
  const a = useAnimatedStyle(() => {
    const o = x.value / w - index;
    return {
      width: interpolate(o, [-1, 0, 1], [8, 26, 8], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(Math.min(1, Math.abs(o)), [0, 1], [color.lime.base, color.line.empty]),
    };
  });
  return <Animated.View style={[{ height: 8, borderRadius: 4 }, a]} />;
}

/** The light behind a page: fully there on its own page, gone one page away. */
function Light({ index, x, w }: { index: number; x: SharedValue<number>; w: number }) {
  const a = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.abs(x.value / w - index)) }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, a]}><Ambient ambient={AMBIENT[index]!} {...(index === 0 ? { beam: true } : {})} /></Animated.View>;
}

/** A page's picture and text, moved a little against the swipe so the page seems to have depth. */
function Page({ index, x, w, children, text, onHeroLayout }: { index: number; x: SharedValue<number>; w: number; children: React.ReactNode; text: React.ReactNode; onHeroLayout?: (e: LayoutChangeEvent) => void }) {
  const hero = useAnimatedStyle(() => {
    const o = x.value / w - index;
    const away = Math.min(1, Math.abs(o));
    return { opacity: 1 - away, transform: [{ translateX: o * w * 0.22 }, { scale: 1 - away * 0.08 }] };
  });
  const copy = useAnimatedStyle(() => {
    const o = x.value / w - index;
    return { opacity: 1 - Math.min(1, Math.abs(o)), transform: [{ translateX: -o * w * 0.12 }] };
  });
  return (
    <View style={{ width: w, flex: 1 }}>
      <View style={{ flex: 1 }} {...(onHeroLayout ? { onLayout: onHeroLayout } : {})}>
        <Animated.View style={[{ flex: 1, alignItems: "center", justifyContent: "center" }, hero]}>{children}</Animated.View>
      </View>
      <Animated.View style={[{ paddingHorizontal: metrics.screen.padX, paddingBottom: space[16] }, copy]}>{text}</Animated.View>
    </View>
  );
}

export function A1i() {
  const { go } = useGo();
  const { width: w } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const x = useSharedValue(0);
  const [page, setPage] = useState(0);
  /** How many times each page has been reached: a picture is mounted (and so plays) once its count is above 0, and again on every return. */
  const [plays, setPlays] = useState<number[]>([1, 0, 0]);
  const [room, setRoom] = useState({ w: 0, h: 0 });

  // A page becomes the current one: its picture plays, and the last page marks the intro as seen.
  const reach = useCallback((i: number) => {
    setPage(i);
    setPlays((p) => p.map((n, j) => (j === i ? n + 1 : n)));
    if (i === PAGES - 1) useIntro.getState().markSeen();
  }, []);

  const moveTo = useCallback((i: number) => {
    const to = Math.max(0, Math.min(PAGES - 1, i));
    scroller.current?.scrollTo({ x: to * w, animated: !reduce });
    if (reduce) { x.set(to * w); reach(to); }
  }, [w, reduce, x, reach]);

  // Hardware back steps back through the pages before it leaves.
  useFocusEffect(useCallback(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (page === 0) return false;
      moveTo(page - 1);
      return true;
    });
    return () => sub.remove();
  }, [page, moveTo]));

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    x.set(offset);
    const i = Math.max(0, Math.min(PAGES - 1, Math.round(offset / w)));
    if (i !== page) { reach(i); haptic.light(); }
  };

  // Get started picks the mode (A1·m), unless a join link already chose Live (the same as A1).
  const start = () => (useMode.getState().mode === "live" && useSession.getState().invite !== null ? go("A2") : go("A1·m"));
  const invite = () => { void startLiveWithInvite(useSession.getState().invite ?? "").then(() => go("A2")); };
  const last = page === PAGES - 1;
  // The pinned dots and buttons sit over the page; the pages stop above them.
  const pinnedH = metrics.pinned.bottom + insets.bottom + 18 + metrics.button.height + metrics.button.heightText + metrics.pinned.gap * 2 + 8;

  // The room a picture has is what the first page leaves above its text; every page has the same text height.
  const onRoom = (e: LayoutChangeEvent) => setRoom({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const heroRoomH = Math.max(0, room.h - 12);
  const pages: { hero: React.ReactNode; title: string; sub: string }[] = [
    { hero: <FitHero designW={HERO1.w} designH={HERO1.h} w={room.w - 40} h={heroRoomH}><BetHero /></FitHero>, title: t("additions.intro.p1.title"), sub: t("additions.intro.p1.sub") },
    { hero: <FitHero designW={HERO2.w} designH={HERO2.h} w={room.w - 40} h={heroRoomH}><CheckHero /></FitHero>, title: t("additions.intro.p2.title"), sub: t("additions.intro.p2.sub") },
    { hero: <FitHero designW={HERO3.w} designH={HERO3.h} w={room.w - 40} h={heroRoomH}><ProgressHero /></FitHero>, title: t("additions.intro.p3.title"), sub: t("additions.intro.p3.sub") },
  ];

  return (
    <Screen
      bare
      pinned={<>
        <View key="dots" accessible accessibilityRole="adjustable" accessibilityLabel={t("additions.intro.page", { n: page + 1, total: PAGES })}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => moveTo(page + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
          style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space[6], paddingBottom: space[10] }}>
          {pages.map((_, i) => <Dot key={i} index={i} x={x} w={w} />)}
        </View>
        <Button key="next" kind="p" label={last ? t("screens.A1.pin.0") : t("additions.intro.next")} onPress={last ? start : () => moveTo(page + 1)} />
        <Button key="skip" kind="t" label={last ? t("screens.A1.pin.1") : t("additions.intro.skip")} onPress={last ? invite : () => moveTo(PAGES - 1)} />
      </>}
    >
      <View style={{ flex: 1 }}>
        {AMBIENT.map((_, i) => <Light key={i} index={i} x={x} w={w} />)}
        <View style={{ flex: 1, paddingBottom: pinnedH }}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="fast"
          onScroll={onScroll}
          testID="intro-pager"
        >
          {pages.map((p, i) => (
            <Page key={i} index={i} x={x} w={w} {...(i === 0 ? { onHeroLayout: onRoom } : {})}
              text={<Title heading={p.title} sub={p.sub} fs={TITLE_FS} />}>
              {room.w > 0 && plays[i]! > 0 ? <View key={plays[i]}>{p.hero}</View> : null}
            </Page>
          ))}
        </ScrollView>
        </View>
      </View>
    </Screen>
  );
}
