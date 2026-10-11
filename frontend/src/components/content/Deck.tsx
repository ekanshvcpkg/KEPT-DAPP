// ── CardDeck ── Today's cards as a stack you swipe through (D-85). The top card follows the finger: swiped
// left past a third of the width (or flicked) it flies off and goes to the back, and the card behind grows
// into its place; swiped right, the previous card slides back on top. The next two cards peek above it like
// the design's stacked backs. Dots under it say it's a stack (up to 5; a longer stack shows a window of 5
// whose edge dots shrink) and step through it for screen readers ("Card 2 of 5"); until the deck is first
// moved the top card nudges sideways once. Only the top three cards are mounted. Everything moves on the
// UI thread; vertical scrolls pass through.
//
// Every card is as tall as the tallest one in the deck, all of them counted, not only the three mounted: a
// still, invisible copy of each is laid out to measure it, and the stack appears once all are measured. The
// height changes only with the set of cards, a card's content, the width or the font size, never while a
// card is moving and never animated.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { t } from "@/copy";
import { color, metrics, space } from "@/theme";
import { useSettings } from "@/state/settings";
import { MotionStill } from "../primitives";
import { CardFill } from "./cardFill";

interface DeckCard { key: string; node: ReactNode }

/** Cards drawn: the top one and two behind it. */
const SHOWN = 3;

export function CardDeck({ cards }: { cards: DeckCard[] }) {
  const n = cards.length;
  // `step`: how the deck last moved (0 before any move); a card mounting on top after going back slides in.
  const [{ top, step }, setPos] = useState<{ top: number; step: 0 | 1 | -1 }>({ top: 0, step: 0 });
  const [w, setW] = useState(0);
  const { fontScale } = useWindowDimensions();
  // Natural heights of every card, for this set of cards at this width and font size.
  const of = `${cards.map((c) => c.key).join("|")}#${w}#${fontScale}`;
  const [heights, setHeights] = useState<{ of: string; h: Record<string, number> }>({ of: "", h: {} });
  const onHeight = useCallback((key: string, h: number) => setHeights((m) => {
    const base = m.of === of ? m.h : {};
    return m.of === of && base[key] === h ? m : { of, h: { ...base, [key]: h } };
  }), [of]);
  const measured = w && heights.of === of && cards.every((c) => heights.h[c.key]) ? Math.max(...cards.map((c) => heights.h[c.key]!)) : 0;
  // While a card is moving the height holds; a change waits until it settles.
  const [moving, setMoving] = useState(false);
  const [deckH, setDeckH] = useState(0);
  if (!moving && measured && measured !== deckH) setDeckH(measured);

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
      <View testID="deck" style={{ marginTop: peek, height: deckH || undefined }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {/* Still, invisible copies of every card, laid out only to be measured. */}
        <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ position: "absolute", left: 0, right: 0, top: 0, opacity: 0 }}>
          <MotionStill.Provider value>
            {w ? cards.map((c) => (
              <View key={c.key} testID={`deck-measure-${c.key}`} style={{ position: "absolute", left: 0, right: 0, top: 0 }} onLayout={(e) => onHeight(c.key, Math.ceil(e.nativeEvent.layout.height))}>{c.node}</View>
            )) : null}
          </MotionStill.Provider>
        </View>
        {/* The cards mount at once (their entrances start with the screen's) and show once the height is known. */}
        <View pointerEvents={deckH ? "box-none" : "none"} importantForAccessibility={deckH ? "auto" : "no-hide-descendants"}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: deckH ? 1 : 0 }}>
          <CardFill.Provider value>
            {shown.map(({ card, depth }) => (
              <DeckSlot key={card.key} depth={depth} n={n} w={w} h={deckH} drag={drag} swiped={swiped}
                nudge={depth === 0 && !hintSeen && !!deckH} slideIn={step === -1} onMoving={setMoving}
                onNext={() => advance(1, true)} onPrevious={() => advance(-1, false)}>
                {card.node}
              </DeckSlot>
            ))}
          </CardFill.Provider>
        </View>
      </View>
      {deckH ? <Dots i={i0} n={n} onPrevious={() => advance(-1, false)} onNext={() => advance(1, false)} /> : null}
    </View>
  );
}

/** One card's place in the stack: depth 0 is on top; 1 and 2 peek above it, narrower and dimmed. */
function DeckSlot({ depth, n, w, h, drag, swiped, nudge, onMoving, onNext, onPrevious, slideIn, children }: {
  depth: number; n: number; w: number; h: number; drag: SharedValue<number>; swiped: { current: boolean };
  nudge: boolean; onMoving: (moving: boolean) => void; onNext: () => void; onPrevious: () => void; slideIn: boolean; children: ReactNode;
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
    if (was === 0 && depth > 0 && swiped.current) {
      // The card that was swiped off: back behind the others, fading in there.
      tx.set(0);
      pose.set(depth);
      fade.set(reduce ? 1 : 0);
      if (!reduce) fade.set(withTiming(1, { duration: 260 }));
    } else if (swiped.current || reduce) {
      pose.set(depth); // already grown into place by the drag
    } else {
      // Stepped (back, or by a screen reader): settle into the new depth.
      tx.set(withTiming(0, { duration: 200 }));
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

  const settle = (done?: boolean) => { "worklet"; if (done !== false) runOnJS(onMoving)(false); };
  const pan = Gesture.Pan()
    .withTestId(`deck-pan-${depth}`)
    .enabled(isTop && n > 1 && w > 0)
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onStart(() => { runOnJS(onMoving)(true); })
    .onUpdate((e) => {
      tx.set(e.translationX);
      // Only a card leaving to the left pulls the next one up; going back right, the stack stays.
      drag.set(Math.min(1, Math.max(0, -e.translationX) / (w * 0.5)));
    })
    .onEnd((e) => {
      const out = Math.abs(e.translationX) > w / 3 || Math.abs(e.velocityX) > 900;
      const left = e.translationX + e.velocityX * 0.05 < 0;
      if (!out) {
        tx.set(withSpring(0, { damping: 16 }, settle));
        drag.set(withTiming(0, { duration: 200 }));
        return;
      }
      if (!left) {
        // Right: the previous card comes back on top (sliding in from the left); this one settles behind.
        drag.set(0);
        runOnJS(onPrevious)();
        runOnJS(onMoving)(false);
        return;
      }
      drag.set(withTiming(1, { duration: 200 }));
      tx.set(withTiming(-w * 1.25, { duration: 220, easing: Easing.in(Easing.quad) }, (done) => {
        if (done) { runOnJS(onNext)(); runOnJS(onMoving)(false); }
      }));
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
        testID={`deck-slot-${depth}`}
        style={[
          { position: "absolute", left: 0, right: 0, top: 0, height: h || undefined, zIndex: SHOWN - depth, transformOrigin: "50% 0%" },
          // Behind cards show only their edge: anything poking out of them (a member's float) stays hidden.
          isTop ? null : { overflow: "hidden", borderRadius: metrics.card.radius },
          a,
        ]}
      >
        {children}
        {isTop ? null : <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: metrics.card.radius, backgroundColor: color.surface.stack1 }, dim]} />}
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * The dots in view for card `i` of `n`: all of them up to `max`; beyond that a window of `max` around the
 * current one, whose edge dots shrink where more cards lie past them.
 */
export function dotWindow(i: number, n: number, max: number = metrics.deck.maxDots): { index: number; on: boolean; small: boolean }[] {
  const count = Math.min(n, max);
  const start = n <= max ? 0 : Math.min(Math.max(i - Math.floor(max / 2), 0), n - max);
  return Array.from({ length: count }, (_, k) => {
    const index = start + k;
    const small = n > max && ((k === 0 && start > 0) || (k === count - 1 && start + count < n));
    return { index, on: index === i, small };
  });
}

/**
 * The dots under the stack. For screen readers they're the stack's control: "Card 2 of 5", adjustable
 * (swipe up / down with TalkBack) or by the Next / Previous card actions.
 */
function Dots({ i, n, onPrevious, onNext }: { i: number; n: number; onPrevious: () => void; onNext: () => void }) {
  const p = metrics.deck;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t("additions.deck.positionA11y", { k: i + 1, n })}
      accessibilityLiveRegion="polite"
      accessibilityActions={[{ name: "increment", label: t("additions.deck.next") }, { name: "decrement", label: t("additions.deck.previous") }]}
      onAccessibilityAction={(e) => (e.nativeEvent.actionName === "decrement" ? onPrevious() : onNext())}
      style={{ marginTop: space[4], minHeight: metrics.minTouch, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: p.dotGap }}
    >
      {dotWindow(i, n).map((d) => {
        const size = d.small ? p.dotSmall : p.dot;
        return <View key={d.index} style={{ width: d.on ? p.dotOn : size, height: size, borderRadius: size / 2, backgroundColor: d.on ? color.text.primary : color.line.strong }} />;
      })}
    </View>
  );
}
