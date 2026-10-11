// Motion building blocks (design/motion.md), all on the UI thread with Reanimated. Every one honours
// Reduce Motion: it renders the end state and starts no loop.
// - keyframes: Pop (kPop), Enter (kInA), FadeIn (kIn), Bubble (kBub / kBubR), NoteDrop (kDrop),
//   Knock (kKnock), Shake (proof fail), Loop (beat, breath, float, spin, pulse, ping, glow)
// - CountText: the 900 ms ease-out-cubic count-up as a leaf Text, so only the number re-renders
// - PressScale: pressed scale with a 48 dp hit area
import { Children, Fragment, createContext, isValidElement, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { LayoutChangeEvent, PressableProps, StyleProp, TextStyle, ViewStyle } from "react-native";
import Animated, {
  Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { duration, easing, metrics } from "@/theme";
import type { EasingName } from "@/theme";
import { groupDigits } from "@/lib/format";
import { useScreenFocused } from "@/lib/focus";
import { Text } from "./Text";
import type { TextProps } from "./Text";

;

const inOut = Easing.inOut(Easing.ease);

/**
 * The lifecycle every animated view here follows (audit P-6). Reanimated 4 writes animated props straight
 * to the native view; an update for a view that isn't mounted yet, or was just deleted, fails, is retried
 * every frame and logs a stack trace each time on the UI thread (thousands per screen change, one ANR).
 * So:
 * - `start` runs on the view's first layout (it exists natively by then) and again when `deps` change;
 * - every value in `values` is cancelled in a layout-effect cleanup: that runs in the same commit that
 *   deletes the view, so the cancel reaches the UI thread before the deletion does;
 * - with `pauseOnBlur`, loops stop while their screen is covered and start again on focus.
 * Returns the `onLayout` to put on the animated view.
 */
export function useAnimationLifecycle(values: SharedValue<number>[], start: () => void, deps: unknown[], opts?: { pauseOnBlur?: boolean }): (() => void) | undefined {
  const focused = useScreenFocused();
  const live = !opts?.pauseOnBlur || focused;
  const startRef = useRef(start);
  const valuesRef = useRef(values);
  useLayoutEffect(() => { startRef.current = start; valuesRef.current = values; });
  useEffect(() => {
    if (!live) { valuesRef.current.forEach(cancelAnimation); return; }
    // One frame after the commit that mounted (or changed) the view.
    const id = requestAnimationFrame(() => startRef.current());
    return () => cancelAnimationFrame(id);
    // `deps` are the caller's inputs; start/values are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, ...deps]);
  useLayoutEffect(() => () => { valuesRef.current.forEach(cancelAnimation); }, []);
  return undefined;
}

/**
 * Inside a MotionStill provider, Pop and Loop (and the button Shine) draw their end pose and run nothing: for
 * copies that are only laid out to be measured (CardDeck, D-85), never seen.
 */
export const MotionStill = createContext(false);

type PopProps = { children: ReactNode; delay?: number; ms?: number; ease?: EasingName; style?: StyleProp<ViewStyle> };
/** kPop: scale .4 → 1.08 (65 %) → 1, opacity 0 → 1 (65 %). `ease`: spring (default) or springHard. */
export function Pop(props: PopProps) {
  return useContext(MotionStill) ? <View style={props.style}>{props.children}</View> : <PopLive {...props} />;
}
function PopLive({ children, delay = 0, ms = duration.pop, ease = "spring", style }: PopProps) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    // Two segments like the CSS keyframes, each with the token's curve.
    const e = easing(ease);
    p.value = withDelay(delay, withSequence(withTiming(0.65, { duration: ms * 0.65, easing: e }), withTiming(1, { duration: ms * 0.35, easing: e })));
  }, [reduce, delay, ms, ease]);
  const a = useAnimatedStyle(() => {
    const v = p.value;
    const scale = v <= 0.65 ? 0.4 + (0.68 * v) / 0.65 : 1.08 - (0.08 * (v - 0.65)) / 0.35;
    return { opacity: Math.min(1, v / 0.65), transform: [{ scale }] };
  });
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}

/**
 * A view that mounts late (a busy UI thread, a navigation reset) can miss its whole entrance: updates to
 * a view that doesn't exist yet are dropped (D-79), and it stays at the start value, invisible. Once the
 * entrance should be over, apply the end value again (a fresh update) so it always lands.
 */
function useLand(p: SharedValue<number>, afterMs: number, deps: unknown[]) {
  useEffect(() => {
    let frame = 0;
    const id = setTimeout(() => { p.value = 1 - 1e-6; frame = requestAnimationFrame(() => { p.value = 1; }); }, afterMs + 150);
    return () => { clearTimeout(id); cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** kInA: opacity 0 → 1, translateY 16 → 0, scale .98 → 1 over 500 ms `enter` (block i waits 40 + 65·i ms). */
export function Enter({ children, index = 0, delay, replay = 0, style }: { children: ReactNode; index?: number; delay?: number; replay?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  const wait = delay ?? enterDelay(index);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.value = 0;
    p.value = withDelay(wait, withTiming(1, { duration: duration.enter, easing: easing("enter") }));
  }, [reduce, wait, replay]);
  useLand(p, wait + duration.enter, [wait, replay]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: 16 * (1 - p.value) }, { scale: 0.98 + 0.02 * p.value }] }));
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}
/** motion.md › Screen-level choreography: block i enters at 40 + 65·i ms. */
export const enterDelay = (i: number) => 40 + 65 * i;

/** kIn: opacity 0 → 1, translateY 10 → 0 (250–400 ms ease-out). */
export function FadeIn({ children, delay = 0, ms = 300, rise = 10, style }: { children: ReactNode; delay?: number; ms?: number; rise?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.value = withDelay(delay, withTiming(1, { duration: ms, easing: Easing.out(Easing.ease) }));
  }, [reduce, delay, ms]);
  useLand(p, delay + ms, [delay, ms]);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: rise * (1 - p.value) }] }));
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}

/** Opacity 1 → 0 (an HP segment's fill emptying on unseen damage, motion.md §2: 200 ms). `hold` waits at 1. */
export function FadeOut({ children, delay = 0, ms = 200, hold = false, style }: { children: ReactNode; delay?: number; ms?: number; hold?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce && !hold ? 0 : 1);
  const onLayout = useAnimationLifecycle([p], () => {
    if (hold) { p.value = 1; return; }
    if (reduce) { p.value = 0; return; }
    p.value = withDelay(delay, withTiming(0, { duration: ms, easing: Easing.out(Easing.ease) }));
  }, [reduce, delay, ms, hold]);
  const a = useAnimatedStyle(() => ({ opacity: p.value }));
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}

/**
 * Scale 1 → 1.08 → 1 over 300 ms each time `trigger` changes after mount (the BalanceChip on a new
 * balance, motion.md §4). Not on mount.
 */
export function Bump({ trigger, children, style }: { trigger: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  const first = useRef(trigger);
  const onLayout = useAnimationLifecycle([s], () => {
    if (reduce || trigger === first.current) return;
    s.value = withSequence(withTiming(1.08, { duration: 150, easing: easing("spring") }), withTiming(1, { duration: 150, easing: easing("spring") }));
  }, [trigger, reduce]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}

/** kBub (scale .6 + translateY 8 → none) or kBubR (scale .6 rotate −6° → rotate 4°); springHard. */
export function Bubble({ children, delay = 0, ms = duration.bubble, tilted, style }: { children: ReactNode; delay?: number; ms?: number; tilted?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.value = withDelay(delay, withTiming(1, { duration: ms, easing: easing("springHard") }));
  }, [reduce, delay, ms]);
  const a = useAnimatedStyle(() => {
    const v = p.value;
    return tilted
      ? { opacity: Math.min(1, v), transform: [{ scale: 0.6 + 0.4 * v }, { rotate: `${-6 + 10 * v}deg` }] }
      : { opacity: Math.min(1, v), transform: [{ translateY: 8 * (1 - v) }, { scale: 0.6 + 0.4 * v }] };
  });
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}

/** kDrop (the KeeperNote): translateY −16, scale .72, opacity 0 → none, 420 ms springSoft from `origin`. */
export function NoteDrop({ children, origin, style }: { children: ReactNode; origin: string; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reduce ? 1 : 0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.value = withTiming(1, { duration: duration.note, easing: easing("springSoft") });
  }, [reduce]);
  const a = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value),
    transform: [{ translateY: -16 * (1 - p.value) }, { scale: 0.72 + 0.28 * p.value }],
  }));
  return <Animated.View onLayout={onLayout} style={[{ transformOrigin: origin }, style, a]}>{children}</Animated.View>;
}

/**
 * kKnock: rotate 0 → −14° (6 %) → 11° (12 %) → −6° (18 %) → 0 (24 %, hold), 2.6 s ease-in-out,
 * ×3 after .8 s, around 50 % 90 % (the KeeperMark with an unread line).
 */
export function Knock({ active, children, style }: { active: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const r = useSharedValue(0);
  const onLayout = useAnimationLifecycle([r], () => {
    if (!active || reduce) { cancelAnimation(r); r.value = 0; return; }
    const seg = (duration.glow * 0.06);
    const t = (to: number) => withTiming(to, { duration: seg, easing: inOut });
    const once = withSequence(t(-14), t(11), t(-6), t(0), withTiming(0, { duration: duration.glow - 4 * seg }));
    r.value = withDelay(800, withRepeat(once, 3, false));
  }, [active, reduce], { pauseOnBlur: true });
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View onLayout={onLayout} style={[{ transformOrigin: "50% 90%" }, style, a]}>{children}</Animated.View>;
}

/** Proof fail: translateX 0 → −6 → 6 → −3 → 0 over 300 ms, each time `trigger` changes (not on mount at 0). */
export function Shake({ trigger, children, style }: { trigger: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  const onLayout = useAnimationLifecycle([x], () => {
    if (!trigger || reduce) return;
    const t = (to: number) => withTiming(to, { duration: 75 });
    x.value = withSequence(t(-6), t(6), t(-3), t(0));
  }, [trigger, reduce]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}

/**
 * How long an ambient loop plays each time its screen comes into focus (D-84). Android redraws the whole
 * window on every frame anything moves, so an endless decorative loop kept every screen redrawing at 60 fps
 * while the user just read it. After this many ms (rounded to whole cycles) loops rest at their start pose;
 * they play again on the next focus. Spinners and skeletons run as long as they're shown.
 */
export const LOOP_BUDGET_MS = 10_000;
export const loopCycles = (periodMs: number) => Math.max(1, Math.round(LOOP_BUDGET_MS / periodMs));

type LoopKind = "beat" | "breath" | "float" | "spin" | "ping" | "glow";
/**
 * Ambient loops: beat (opacity 1 → .4), breath (−4 dp), float (−9 dp), spin (360°),
 * ping (scale 1 → 1.7, opacity .7 → 0), glow (scale out, fading). All but spin stop after LOOP_BUDGET_MS.
 */
type LoopProps = { kind: LoopKind; period?: number; delay?: number; children?: ReactNode; style?: StyleProp<ViewStyle>; paused?: boolean };
export function Loop(props: LoopProps) {
  return useContext(MotionStill) ? <View style={props.style}>{props.children}</View> : <LoopLive {...props} />;
}
function LoopLive({ kind, period, delay = 0, children, style, paused }: LoopProps) {
  const reduce = useReducedMotion();
  const v = useSharedValue(0);
  const ms = period ?? { beat: duration.beat, breath: duration.breath, float: duration.float, spin: duration.spin, ping: duration.ping, glow: duration.glow }[kind];
  const onLayout = useAnimationLifecycle([v], () => {
    if (reduce || paused) { cancelAnimation(v); return; }
    if (kind === "spin") {
      v.value = withDelay(delay, withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false));
    } else if (kind === "ping") {
      v.value = withDelay(delay, withRepeat(withTiming(1, { duration: ms, easing: Easing.out(Easing.ease) }), loopCycles(ms), false));
    } else {
      const half = { duration: ms / 2, easing: inOut };
      v.value = withDelay(delay, withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), loopCycles(ms), false));
    }
  }, [reduce, paused, kind, ms, delay], { pauseOnBlur: true });
  const a = useAnimatedStyle(() => {
    switch (kind) {
      case "beat": return { opacity: 1 - 0.6 * v.value };
      case "breath": return { transform: [{ translateY: -4 * v.value }] };
      case "float": return { transform: [{ translateY: -9 * v.value }] };
      case "spin": return { transform: [{ rotate: `${360 * v.value}deg` }] };
      case "ping": return { opacity: 0.7 * (1 - v.value), transform: [{ scale: 1 + 0.7 * v.value }] };
      case "glow": return { opacity: 0.14 * (1 - Math.abs(2 * v.value - 1)), transform: [{ scale: 1 + 0.28 * v.value }] };
    }
  });
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}

/**
 * The skeleton sweep (D-83): 0 → 1 every `metrics.skeleton.sweepMs`, linear, on the UI thread. A
 * ShimmerProvider gives every Skeleton under it one clock, so a screen's blocks sweep together; a
 * Skeleton outside one runs its own. Under Reduce Motion it never starts (the blocks stay still).
 */
const ShimmerCtx = createContext<SharedValue<number> | null>(null);

function useSweep(run: boolean): SharedValue<number> {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useAnimationLifecycle([p], () => {
    if (!run || reduce) { cancelAnimation(p); return; }
    p.value = 0;
    p.value = withRepeat(withTiming(1, { duration: metrics.skeleton.sweepMs, easing: Easing.linear }), -1, false);
  }, [run, reduce], { pauseOnBlur: true });
  return p;
}

export function ShimmerProvider({ children }: { children: ReactNode }) {
  return <ShimmerCtx.Provider value={useSweep(true)}>{children}</ShimmerCtx.Provider>;
}

/** The sweep clock for one Skeleton: the provider's, else its own. */
export function useShimmer(): SharedValue<number> {
  const shared = useContext(ShimmerCtx);
  const own = useSweep(!shared);
  return shared ?? own;
}

/** countUp: from → target over 900 ms, ease-out cubic `1 − (1 − t)³`. Returns the number to show. */
/** How long a number counts up (motion.md › count-up). */
export const COUNT_UP_MS = 900;

function useCountUp(target: number, ms = COUNT_UP_MS, from = 0, delay = 0): number {
  const reduce = useReducedMotion();
  const [n, setN] = useState(from);
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now + delay;
      const p = Math.max(0, Math.min(1, (now - start) / ms));
      setN(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, from, delay, reduce]);
  return reduce ? target : n;
}

/** A view that eases to a rotation (option select: ±2° over 250 ms `spring`). Carries its own style. */
export function Tilt({ deg, children, style, ms = duration.optionTilt, ease = "spring" }: { deg: number; children?: ReactNode; style?: StyleProp<ViewStyle>; ms?: number; ease?: EasingName }) {
  const reduce = useReducedMotion();
  const r = useSharedValue(deg);
  const onLayout = useAnimationLifecycle([r], () => { r.value = reduce ? deg : withTiming(deg, { duration: ms, easing: easing(ease) }); }, [deg, reduce, ms, ease]);
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return <Animated.View onLayout={onLayout} style={[style, a]}>{children}</Animated.View>;
}

/** Counts up the number inside a display string, keeping prefix/suffix ("+186", "1,186", "−1,000"). */
function useCountUpText(text: string, from?: string): string {
  const m = text.match(/^([^\d]*)([\d,]+)(.*)$/);
  const target = m ? parseInt(m[2]!.replace(/,/g, ""), 10) : 0;
  const start = from ? parseInt(from.replace(/[^\d]/g, "") || "0", 10) : 0;
  const n = useCountUp(target, COUNT_UP_MS, start);
  if (!m || /:/.test(text)) return text;
  return m[1] + groupDigits(String(n)) + m[3];
}

/**
 * A count-up as a leaf Text: only this node re-renders while the number runs (the HP panel, money
 * moments and rings no longer re-render their whole block 60 times a second).
 */
export function CountText({ text, from, ...rest }: { text: string; from?: string } & Omit<TextProps, "children">) {
  const shown = useCountUpText(text, from);
  return <Text {...rest} style={[{ fontVariant: ["tabular-nums"] } as TextStyle, ...(Array.isArray(rest.style) ? rest.style : rest.style ? [rest.style] : [])]}>{shown}</Text>;
}

interface PressScaleProps extends Omit<PressableProps, "style" | "children"> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scale while pressed (.98 buttons, .92–.95 round icon buttons). */
  scale?: number;
  /** Layout height/width, used to pad the hit area up to 48 dp. */
  hit?: { w: number; h: number };
}

/** Pressable that scales down while pressed and never has a hit area under 48 dp. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressScale({ children, style, scale = metrics.button.pressScale, hit, disabled, onLayout, ...rest }: PressScaleProps) {
  const reduce = useReducedMotion();
  const s = useSharedValue(1);
  // Presses only start after mount; a press-out that's still running when the screen goes is cancelled.
  useLayoutEffect(() => () => cancelAnimation(s), [s]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const min = metrics.minTouch;
  // Without `hit`, the pressable measures itself: anything sized by its content (a chip, a text link, a
  // short row) still gets a 48 dp touch area, invisibly (hitSlop).
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const size = hit ?? measured;
  const pad = (n: number) => Math.max(0, Math.ceil((min - n) / 2));
  const slop = size && (size.w < min || size.h < min) ? { top: pad(size.h), bottom: pad(size.h), left: pad(size.w), right: pad(size.w) } : undefined;
  const measure = (e: LayoutChangeEvent) => {
    onLayout?.(e);
    if (hit) return;
    const { width, height } = e.nativeEvent.layout;
    setMeasured((m) => (m && Math.abs(m.w - width) < 1 && Math.abs(m.h - height) < 1 ? m : { w: width, h: height }));
  };
  // The style goes on the pressable itself: on an inner view, layout styles like `flex: 1` would size
  // the child while the Pressable (the row item) shrank to its content.
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...(slop ? { hitSlop: slop } : {})}
      onPressIn={() => { if (!reduce) s.set(withTiming(scale, { duration: metrics.press.inMs })); }}
      onPressOut={() => { s.set(withTiming(1, { duration: metrics.press.outMs })); }}
      onLayout={measure}
      {...rest}
      style={[style, a]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Children with fragments expanded and empty slots dropped: each entry is one block of a column. */
export function flattenBlocks(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === Fragment) out.push(...flattenBlocks((c.props as { children?: ReactNode }).children));
    else out.push(c);
  });
  return out;
}
