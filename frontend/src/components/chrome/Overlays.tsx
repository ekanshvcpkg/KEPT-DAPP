// Overlays (components.md › BottomSheet, Toast): the sheet slides up over a scrim and closes on scrim tap,
// swipe down or its own button; the toast pops in at the top and hides itself after 1.9 s.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { t } from "@/copy";
import { color, duration, easing, metrics, shadow, space, z } from "@/theme";
import { Icon, Pop, Text, useAnimationLifecycle } from "../primitives";

// ── BottomSheet ──
interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  bottomInset?: number;
  /** Called once the close animation has finished (a sheet route removes itself then). */
  onHidden?: () => void;
}

/** Drag further than this (dp) or fling faster than this (dp/s) to dismiss. */
const DISMISS_DRAG = 120;
const DISMISS_VELOCITY = 900;

export function BottomSheet({ visible, onClose, children, bottomInset = 0, onHidden }: BottomSheetProps) {
  const { height: screenH } = useWindowDimensions();
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const p = useSharedValue(0);
  const drag = useSharedValue(0);
  const ms = reduce ? 0 : duration.note - 120;
  // Mount as soon as it becomes visible; unmount only after the close animation finishes.
  if (visible && !mounted) setMounted(true);
  const hide = useCallback(() => { setMounted(false); onHidden?.(); }, [onHidden]);

  const onLayout = useAnimationLifecycle([p, drag], () => {
    if (visible) {
      drag.value = 0;
      p.value = withTiming(1, { duration: ms, easing: easing("enter") });
    } else if (mounted) {
      p.value = withTiming(0, { duration: ms, easing: easing("enter") }, (done) => { if (done) runOnJS(hide)(); });
    }
  }, [visible, mounted, ms, hide]);

  const pan = useMemo(() => Gesture.Pan()
    .onUpdate((e) => { drag.set(Math.max(0, e.translationY)); })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG || e.velocityY > DISMISS_VELOCITY) runOnJS(onClose)();
      else drag.set(withTiming(0, { duration: ms }));
    }), [drag, onClose, ms]);

  const scrim = useAnimatedStyle(() => ({ opacity: p.value }));
  const sheet = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * screenH * 0.4 + drag.value }] }));
  if (!mounted) return null;
  const s = metrics.sheet;
  return (
    <View onLayout={onLayout} style={[StyleSheet.absoluteFill, { zIndex: z.scrim }]} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }, scrim]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("additions.a11y.close")} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", left: s.inset, right: s.inset, bottom: s.inset + bottomInset, maxHeight: Math.min(s.maxHeight, screenH - 2 * s.inset), borderRadius: s.radius, backgroundColor: color.surface.sheet, zIndex: z.sheet }, sheet]}>
        <GestureDetector gesture={pan}>
          <View style={{ paddingTop: s.padTop, paddingBottom: space[8], alignItems: "center" }}>
            <View style={{ width: s.grabber[0], height: s.grabber[1], borderRadius: s.grabberRadius, backgroundColor: color.extra.grabber }} />
          </View>
        </GestureDetector>
        <ScrollView contentContainerStyle={{ paddingHorizontal: s.padX, paddingBottom: s.padBottom, gap: space[12] }} bounces={false}>
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const TOAST_FADE = 200;

// ── Toast ── white pill, ink disc with a lime check-bold; auto-hides after toastHold.
function Toast({ text, onHide, holdMs = duration.toastHold }: { text: string; onHide: () => void; holdMs?: number }) {
  const reduce = useReducedMotion();
  const fade = useSharedValue(1);
  // Hold, then fade out over 200 ms before unmounting.
  useEffect(() => {
    const id = setTimeout(() => {
      if (reduce) { onHide(); return; }
      fade.value = withTiming(0, { duration: TOAST_FADE }, (done) => { if (done) runOnJS(onHide)(); });
    }, holdMs);
    return () => clearTimeout(id);
  }, [text, onHide, holdMs, reduce, fade]);
  useLayoutEffect(() => () => cancelAnimation(fade), [fade]);
  const out = useAnimatedStyle(() => ({ opacity: fade.value }));
  const m = metrics.toast;
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: m.top, left: 0, right: 0, alignItems: "center", zIndex: z.toast }} accessibilityLiveRegion="polite">
      <Animated.View style={out}>
      <Pop key={text} ms={duration.pop} ease="springHard">
        <View style={{ height: m.height, paddingLeft: m.padL, paddingRight: m.padR, borderRadius: m.radius, backgroundColor: color.text.primary, flexDirection: "row", alignItems: "center", gap: m.gap, ...shadow("toast") }}>
          <View style={{ width: m.disc, height: m.disc, borderRadius: m.disc / 2, backgroundColor: color.text.onLime, alignItems: "center", justifyContent: "center" }}>
            <Icon name="check-bold" size={m.icon} color={color.lime.base} />
          </View>
          <Text variant="chipMd" color={color.text.onLime} style={{ fontSize: 14 }} numberOfLines={1}>{text}</Text>
        </View>
      </Pop>
      </Animated.View>
    </View>
  );
}

/** App-wide toast: wrap the app in ToastHost, call useToast()(text) anywhere. A new toast replaces the current one. */
const ToastContext = createContext<(text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  const show = useCallback((text: string) => setMsg((m) => ({ text, id: (m?.id ?? 0) + 1 })), []);
  const hide = useCallback(() => setMsg(null), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg ? <Toast key={msg.id} text={msg.text} onHide={hide} /> : null}
    </ToastContext.Provider>
  );
}
