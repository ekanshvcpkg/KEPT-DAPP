// ── CardDeck ── Today's cards as a stack you swipe through (D-85). The top card follows the finger; past
// a third of the width (or a flick) it flies off and goes to the back, and the card behind grows into its
// place. The next two cards peek above it like the design's stacked backs. A pager under it ("‹ 2 / 5 ›")
// says it's a stack, and until the deck is first moved the top card nudges sideways once and a hint shows.
// Only the top three cards are mounted. Everything moves on the UI thread; vertical scrolls pass through.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { t } from "@/copy";
import { color, metrics, space } from "@/theme";
import { useSettings } from "@/state/settings";
import { Icon, PressScale, Text } from "../primitives";

interface DeckCard { key: string; node: ReactNode }

/** Cards drawn: the top one and two behind it. */
const SHOWN = 3;

export function CardDeck({ cards }: { cards: DeckCard[] }) {
  const n = cards.length;
  // `step`: how the deck last moved (0 before any move); a card mounting on top after ‹ slides in.
  const [{ top, step }, setPos] = useState<{ top: number; step: 0 | 1 | -1 }>({ top: 0, step: 0 });
  const [w, setW] = useState(0);
  // Every card's own height: behind cards are cut to the top one's, so they only peek above it.
  const [heights, setHeights] = useState<Record<string, number>>({});
  const onHeight = useCallback((key: string, h: number) => setHeights((m) => (m[key] === h ? m : { ...m, [key]: h })), []);
  const hintSeen = useSettings((s) => s.deckHintSeen);
  /** 0 … 1: how far the top card has been dragged away (its neighbours grow with it). */
  const drag = useSharedValue(0);
  /** The last change came from a finished swipe: the cards are already in place, so they don't animate. */
  const swiped = useRef(false);
  const i0 = n ? ((top % n) + n) % n : 0;
  const shown = Array.from({ length: Math.min(n, SHOWN) }, (_, d) => ({ card: cards[(i0 + d) % n]!, depth: d }));

  const advance = useCallback((by: 1 | -1, fromSwipe: boolean) => {
    swiped.current = fromSwipe;
    setPos((p) => ({ top: p.top + by, step: by }));
    if (!useSettings.getState().deckHintSeen) useSettings.getState().set({ deckHintSeen: true });
  }, []);
  // The cards read `swiped` in their own effects (children's effects run first); then it resets.
  useEffect(() => { swiped.current = false; drag.set(0); }, [top, drag]);

  if (!n) return null;
  if (n === 1) return <>{cards[0]!.node}</>;
  const peek = -metrics.card.stack2.top;
  return (
    <View>
      <View style={{ marginTop: peek }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {shown.map(({ card, depth }) => (
          <DeckSlot key={card.key} depth={depth} n={n} w={w} clampH={heights[shown[0]!.card.key] ?? 0} drag={drag} swiped={swiped}
            nudge={depth === 0 && !hintSeen} onHeight={(h) => onHeight(card.key, h)} slideIn={step === -1}
            onSwiped={() => advance(1, true)}>
            {card.node}
          </DeckSlot>
        ))}
      </View>
      <Pager k={i0 + 1} n={n} hint={!hintSeen} onPrev={() => advance(-1, false)} onNext={() => advance(1, false)} />
    </View>
  );
}

/** One card's place in the stack: depth 0 is on top; 1 and 2 peek above it, narrower and dimmed. */
function DeckSlot({ depth, n, w, clampH, drag, swiped, nudge, onHeight, onSwiped, slideIn, children }: {
  depth: number; n: number; w: number; clampH: number; drag: SharedValue<number>; swiped: { current: boolean };
  nudge: boolean; onHeight: (h: number) => void; onSwiped: () => void; slideIn: boolean; children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const isTop = depth === 0;
  const tx = useSharedValue(0);
  const pose = useSharedValue(depth);
  const fade = useSharedValue(1);
  const prev = useRef(depth);
  const mounted = useRef(false);

  useEffect(() => {
    const was = prev.current;
    prev.current = depth;
    if (!mounted.current) {
      // A card that mounts into the stack (from beyond the third, or going back) fades in.
      mounted.current = true;
      if (!reduce && depth > 0) { fade.set(0); fade.set(withTiming(1, { duration: 240 })); }
      if (!reduce && depth === 0 && slideIn && w) {
        tx.set(-w * 0.35); tx.set(withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) }));
        fade.set(0); fade.set(withTiming(1, { duration: 200 }));
      }
      return;
    }
    if (was === 0 && depth > 0) {
      // The card that was swiped off: back behind the others, fading in there.
      tx.set(0);
      pose.set(depth);
      fade.set(reduce ? 1 : 0);
      if (!reduce) fade.set(withTiming(1, { duration: 260 }));
    } else if (swiped.current || reduce) {
      pose.set(depth); // already grown into place by the drag
    } else {
      pose.set(withTiming(depth, { duration: 260, easing: Easing.out(Easing.cubic) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slideIn and w are read on mount only
  }, [depth, reduce, tx, pose, fade, swiped]);

  // The first time, the top card shows it moves: a short slide left and back.
  useEffect(() => {
    if (!nudge || reduce || !w) return;
    tx.set(withDelay(900, withSequence(withTiming(-w * 0.16, { duration: 380, easing: Easing.out(Easing.cubic) }), withSpring(0, { damping: 14 }))));
    drag.set(withDelay(900, withSequence(withTiming(0.32, { duration: 380, easing: Easing.out(Easing.cubic) }), withSpring(0, { damping: 14 }))));
  }, [nudge, reduce, w, tx, drag]);

  const pan = Gesture.Pan()
    .enabled(isTop && n > 1 && w > 0)
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      tx.set(e.translationX);
      drag.set(Math.min(1, Math.abs(e.translationX) / (w * 0.5)));
    })
    .onEnd((e) => {
      const out = Math.abs(e.translationX) > w / 3 || Math.abs(e.velocityX) > 900;
      if (!out) {
        tx.set(withSpring(0, { damping: 16 }));
        drag.set(withTiming(0, { duration: 200 }));
        return;
      }
      const dir = e.translationX + e.velocityX * 0.05 >= 0 ? 1 : -1;
      drag.set(withTiming(1, { duration: 200 }));
      tx.set(withTiming(dir * w * 1.25, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => { if (done) runOnJS(onSwiped)(); }));
    });

  // Plain numbers: the styles below run on the UI thread and can't call JS functions.
  const in1 = metrics.card.stack1.inset, in2 = metrics.card.stack2.inset, y1 = metrics.card.stack1.top, y2 = metrics.card.stack2.top;
  const a = useAnimatedStyle(() => {
    // Behind cards grow toward the next depth as the top one is dragged away.
    const d = Math.max(0, isTop ? pose.value : pose.value - drag.value);
    const inset = interpolate(d, [0, 1, 2], [0, in1, in2], "clamp");
    const y = interpolate(d, [0, 1, 2], [0, y1, y2], "clamp");
    const scale = w ? (w - 2 * inset) / w : 1;
    return {
      opacity: fade.value,
      transform: [{ translateX: tx.value }, { translateY: y }, { scale }, { rotate: `${(tx.value / Math.max(1, w)) * 8}deg` }],
    };
  });
  // Behind cards are dimmed toward the design's back colours.
  const dim = useAnimatedStyle(() => {
    const d = Math.max(0, isTop ? pose.value : pose.value - drag.value);
    return { opacity: interpolate(d, [0, 1, 2], [0, 0.88, 0.94], "clamp") };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        pointerEvents={isTop ? "auto" : "none"}
        importantForAccessibility={isTop ? "auto" : "no-hide-descendants"}
        style={[
          isTop ? null : { position: "absolute", left: 0, right: 0, top: 0, height: clampH || undefined, overflow: "hidden", borderRadius: metrics.card.radius },
          { zIndex: SHOWN - depth, transformOrigin: "50% 0%" },
          a,
        ]}
      >
        <View onLayout={(e) => onHeight(Math.round(e.nativeEvent.layout.height))}>{children}</View>
        {isTop ? null : <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: metrics.card.radius, backgroundColor: color.surface.stack1 }, dim]} />}
      </Animated.View>
    </GestureDetector>
  );
}

/** "‹  2 / 5  ›" under the stack: tells it's a stack, steps through it (also for TalkBack), and the hint. */
function Pager({ k, n, hint, onPrev, onNext }: { k: number; n: number; hint: boolean; onPrev: () => void; onNext: () => void }) {
  const p = metrics.deck;
  return (
    <View style={{ marginTop: space[10], alignItems: "center", gap: space[6] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[6] }} accessibilityLabel={t("additions.deck.positionA11y", { k, n })}>
        <PressScale onPress={onPrev} accessibilityLabel={t("additions.deck.previous")} hit={{ w: p.arrow, h: p.arrow }}>
          <View style={{ width: p.arrow, height: p.arrow, alignItems: "center", justifyContent: "center" }}><Icon name="chevron-left" size={p.icon} color={color.text.secondary} /></View>
        </PressScale>
        <View style={{ flexDirection: "row", alignItems: "center", gap: p.dotGap }}>
          {Array.from({ length: Math.min(n, p.maxDots) }, (_, i) => {
            const on = i === Math.min(k - 1, p.maxDots - 1);
            return <View key={i} style={{ width: on ? p.dotOn : p.dot, height: p.dot, borderRadius: p.dot / 2, backgroundColor: on ? color.text.primary : color.line.strong }} />;
          })}
        </View>
        <Text variant="monoMicro" color={color.text.secondary}>{t("additions.deck.position", { k, n })}</Text>
        <PressScale onPress={onNext} accessibilityLabel={t("additions.deck.next")} hit={{ w: p.arrow, h: p.arrow }}>
          <View style={{ width: p.arrow, height: p.arrow, alignItems: "center", justifyContent: "center" }}><Icon name="chevron-right" size={p.icon} color={color.text.secondary} /></View>
        </PressScale>
      </View>
      {hint ? <Text variant="caption" color={color.text.tertiary}>{t("additions.deck.hint")}</Text> : null}
    </View>
  );
}
