import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { GESTURES } from "@kept/config";
import type { GestureKey } from "@kept/config";
import { t } from "@/copy";
import { cheapShadow, color, duration, metrics, space } from "@/theme";
import { Icon, Loop, PressScale, Shake, Text, useAnimationLifecycle } from "../primitives";
import type { IconName } from "../primitives";
import { haptic } from "@/lib/haptics";
import { useHeightScale } from "@/lib/screenScale";

export type CameraState = "idle" | "check" | "fail" | "review" | "scan" | "off";
const STATE: Record<CameraState, { corner: string; pillBg: string; pillFg: string; icon: IconName; scan?: boolean; spin?: boolean }> = {
  idle: { corner: color.extra.camCornerIdle, pillBg: color.extra.camPill, pillFg: color.text.primary, icon: "target" },
  check: { corner: color.lime.base, pillBg: color.extra.camPillCheck, pillFg: color.lime.base, icon: "loading", scan: true, spin: true },
  fail: { corner: color.red.base, pillBg: color.red.base, pillFg: color.text.onLime, icon: "close-circle-outline" },
  review: { corner: color.violet.base, pillBg: color.violet.base, pillFg: color.text.onLime, icon: "eye-outline" },
  scan: { corner: color.lime.base, pillBg: color.extra.camPill, pillFg: color.text.primary, icon: "qrcode-scan", scan: true },
  off: { corner: color.line.toggleOff, pillBg: color.surface[4], pillFg: color.text.muted, icon: "camera-off-outline" },
};

function ScanLine({ height }: { height: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.set(withRepeat(withTiming(1, { duration: duration.scan, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [reduce], { pauseOnBlur: true });
  // Moves with a transform (motion rework): its glow is drawn once and the view slides, no layout per frame.
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: height * 0.7 * p.value }] }));
  return <Animated.View onLayout={onLayout} pointerEvents="none" style={[{ position: "absolute", top: height * 0.14, left: metrics.camera.scanInset, right: metrics.camera.scanInset, height: 2, backgroundColor: color.lime.base, boxShadow: `0 0 16px 4px ${color.lime.ring45}` }, a]} />;
}

/**
 * ProofCamera (`cam`): the framed camera with corner brackets, object glyph + gesture badge, scan line
 * and status pill. `children` is the live preview (expo-camera, Phase 3); without it the frame shows the
 * challenge illustration exactly like the prototype.
 */
export function ProofCamera({ photo, object, gesture, state, label, height: designHeight = metrics.camera.height, children }: {
  photo?: 1 | 2; object: IconName; gesture?: GestureKey; state: CameraState; label: string; height?: number; children?: ReactNode;
}) {
  const c = metrics.camera;
  // Shorter phones: the frame shrinks with the screen height so the shutter row stays on screen.
  const height = Math.round(designHeight * useHeightScale());
  const s = STATE[state];
  const objSize = height >= c.objectBigFrom ? c.objectBig : c.objectSmall;
  const g = gesture ? GESTURES.find((x) => x.key === gesture) : undefined;
  // motion.md › Proof scan: fail notificationError (the pass haptic plays with the next screen).
  useEffect(() => { if (state === "fail") haptic.error(); }, [state]);
  const blur = state === "review" ? [{ blur: 1.2 }] : undefined;
  const [w, setW] = useState<number>(metrics.contentWidth);
  const corner = (pos: object, widths: object, radii: object) => (
    <View style={{ position: "absolute", width: c.corner, height: c.corner, borderColor: s.corner, ...pos, ...widths, ...radii }} />
  );
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height, borderRadius: c.radius, backgroundColor: color.extra.camGradient[1] }} accessibilityLabel={label}>
      <Svg width={w} height={height} style={{ position: "absolute", borderRadius: c.radius }}>
        <Defs>
          <RadialGradient id="cam" cx="50%" cy="45%" rx="75%" ry="75%">
            <Stop offset="0" stopColor={color.extra.camGradient[0]} />
            <Stop offset="1" stopColor={color.extra.camGradient[1]} />
          </RadialGradient>
        </Defs>
        <Rect width={w} height={height} fill="url(#cam)" />
      </Svg>
      <View collapsable={false} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: c.radius, overflow: "hidden" }}>
        {children ? children : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <View style={blur ? { filter: blur } : undefined}><Icon name={object} size={objSize} color={state === "off" ? color.line.toggleOff : color.extra.camObject} /></View>
            {g ? (
              // Proof fail: the gesture badge shakes (0 → −6 → 6 → −3 → 0, 300 ms).
              <Shake trigger={state === "fail" ? 1 : 0} style={{ position: "absolute", right: c.gestureRight, bottom: c.gestureBottom }}>
              <View style={{ width: c.gesture, height: c.gesture, borderRadius: c.gesture / 2, backgroundColor: color.text.primary, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${c.gestureTilt}deg` }], boxShadow: cheapShadow("0 8px 20px rgba(0,0,0,0.5)"), ...(blur ? { filter: blur } : {}) }}>
                <Icon name={g.icon as IconName} size={c.gestureIcon} color={color.text.onLime} />
              </View>
              </Shake>
            ) : null}
          </View>
        )}
      </View>
      {photo ? (
        <View style={{ position: "absolute", left: c.photoPillInset, top: c.photoPillInset, height: c.photoPillH, paddingHorizontal: c.photoPillPad, borderRadius: c.photoPillH / 2, backgroundColor: color.extra.camPhotoPill, flexDirection: "row", alignItems: "center", gap: space[6] }}>
          <Icon name="camera-outline" size={15} />
          <Text variant="chip">{t("common.photoOf", { n: photo })}</Text>
        </View>
      ) : null}
      {corner({ left: c.cornerInset, top: c.cornerInset }, { borderTopWidth: c.cornerStroke, borderLeftWidth: c.cornerStroke }, { borderTopLeftRadius: c.cornerRadius })}
      {corner({ right: c.cornerInset, top: c.cornerInset }, { borderTopWidth: c.cornerStroke, borderRightWidth: c.cornerStroke }, { borderTopRightRadius: c.cornerRadius })}
      {corner({ left: c.cornerInset, bottom: c.cornerInset }, { borderBottomWidth: c.cornerStroke, borderLeftWidth: c.cornerStroke }, { borderBottomLeftRadius: c.cornerRadius })}
      {corner({ right: c.cornerInset, bottom: c.cornerInset }, { borderBottomWidth: c.cornerStroke, borderRightWidth: c.cornerStroke }, { borderBottomRightRadius: c.cornerRadius })}
      {s.scan ? <ScanLine height={height} /> : null}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: c.pillBottom, alignItems: "center" }}>
        <View style={{ height: c.pillH, paddingHorizontal: c.pillPadX, borderRadius: c.pillH / 2, backgroundColor: s.pillBg, flexDirection: "row", alignItems: "center", gap: space[6] }} accessibilityLiveRegion="polite">
          {s.spin ? <Loop kind="spin"><Icon name={s.icon} size={16} color={s.pillFg} /></Loop> : <Icon name={s.icon} size={16} color={s.pillFg} />}
          <Text variant="chipMd" color={s.pillFg} numberOfLines={1}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

/** Shutter row: flash · 80 dp shutter · flip. */
export function Shutter({ onShutter, onFlip, disabled }: { onShutter: () => void; onFlip?: () => void; disabled?: boolean }) {
  const s = metrics.shutter;
  const side = { width: s.side, height: s.side, borderRadius: s.side / 2, backgroundColor: color.surface[2], alignItems: "center" as const, justifyContent: "center" as const };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: s.padTop, paddingHorizontal: s.padX }}>
      <View style={side} accessible accessibilityLabel={t("additions.a11y.flash")}><Icon name="flash-off" size={22} color={color.text.tertiary} /></View>
      <PressScale onPress={onShutter} disabled={!!disabled} scale={s.pressScale} accessibilityLabel={t("additions.a11y.shutter")}>
        <View style={{ width: s.outer, height: s.outer, borderRadius: s.outer / 2, boxShadow: `inset 0 0 0 ${s.ring}px ${color.text.primary}`, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
          <View style={{ width: s.inner, height: s.inner, borderRadius: s.inner / 2, backgroundColor: color.text.primary }} />
        </View>
      </PressScale>
      {/* Press feedback at touch-down like the shutter (the camera itself takes longer than 100 ms to turn). */}
      <PressScale onPress={onFlip} scale={s.pressScale} accessibilityLabel={t("additions.a11y.flip")} hit={{ w: s.side, h: s.side }}><View style={side}><Icon name="camera-flip-outline" size={22} /></View></PressScale>
    </View>
  );
}
