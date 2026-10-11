import { View } from "react-native";
import Svg, { Circle, Defs, Path } from "react-native-svg";
import { useEffect } from "react";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { t } from "@/copy";
import { cheapShadow, color, duration, metrics, space, type as typeStyles } from "@/theme";
import { Icon, InitialTile, Loop, Pop, Text, CountText, useAnimationLifecycle } from "../primitives";
import type { IconName } from "../primitives";
import { Chip } from "./Basics";
import type { ChipTone } from "./Basics";
import { haptic } from "@/lib/haptics";

// ── SignStatus (`sign`) ── 150 disc; pending = 22 % lime arc spinning; success = lime + two pings; fail red; warn orange.
export type SignState = "pending" | "success" | "fail" | "warn";
const SIGN: Record<SignState, { ring: string; icon: IconName; fg: string; chipIcon: IconName }> = {
  pending: { ring: color.surface[4], icon: "wallet-outline", fg: color.text.primary, chipIcon: "wallet-outline" },
  success: { ring: color.lime.base, icon: "check-bold", fg: color.lime.base, chipIcon: "check-decagram" },
  fail: { ring: color.red.base, icon: "alert-outline", fg: color.red.base, chipIcon: "alert-circle-outline" },
  warn: { ring: color.orange.base, icon: "cellphone-off", fg: color.orange.base, chipIcon: "information-outline" },
};

function arcPath(size: number, frac: number) {
  const r = size / 2, a = frac * 2 * Math.PI;
  const x = r + r * Math.sin(a), y = r - r * Math.cos(a);
  return `M${r} ${r} L${r} 0 A${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
}

function Ping({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: duration.ping, easing: Easing.out(Easing.ease) }), -1));
  }, [reduce, delay], { pauseOnBlur: true });
  const a = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - p.value), transform: [{ scale: 1 + 0.7 * p.value }] }));
  if (reduce) return null;
  return <Animated.View onLayout={onLayout} pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: metrics.sign.size / 2, boxShadow: `0 0 0 3px ${color.lime.base}` }, a]} />;
}

export function SignStatus({ state, chip }: { state: SignState; chip: string }) {
  // motion.md › Signing ring: success notificationSuccess, fail notificationError.
  useEffect(() => { if (state === "success") haptic.success(); else if (state === "fail") haptic.error(); }, [state]);
  const s = SIGN[state];
  const size = metrics.sign.size;
  return (
    <View style={{ alignItems: "center" }} accessibilityLiveRegion="polite" accessibilityLabel={state === "pending" ? t("common.signing") : chip}>
      <View style={{ width: size, height: size }}>
        {state === "pending" ? (
          <Loop kind="spin" style={{ position: "absolute", left: 0, top: 0 }}>
            <Svg width={size} height={size}>
              <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={color.surface[4]} />
              <Path d={arcPath(size, metrics.sign.arc)} fill={color.lime.base} />
            </Svg>
          </Loop>
        ) : (
          <View style={{ position: "absolute", left: 0, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: s.ring }} />
        )}
        {state === "success" ? <><Ping delay={0} /><Ping delay={600} /></> : null}
        <View style={{ position: "absolute", left: metrics.sign.inset, top: metrics.sign.inset, right: metrics.sign.inset, bottom: metrics.sign.inset, borderRadius: size, backgroundColor: color.surface[1], alignItems: "center", justifyContent: "center" }}>
          {state === "success" ? <Pop delay={150} ms={duration.money} ease="springHard"><Icon name={s.icon} size={metrics.sign.icon} color={s.fg} /></Pop> : <Icon name={s.icon} size={metrics.sign.icon} color={s.fg} />}
        </View>
        <View style={{ position: "absolute", left: metrics.sign.chipX, top: metrics.sign.chipY }}>
          <Chip text={chip} icon={s.chipIcon} tone="white" tilt={metrics.sign.chipTilt} />
        </View>
      </View>
    </View>
  );
}

// ── KeptRateRing (`ring`) ── 118 conic ring (lime to p) rotated −8°, value counts up.
export function KeptRateRing({ percent, line, isNew }: { percent: number | null; line: string; isNew?: boolean }) {
  const size = metrics.ring.size;
  const p = percent === null ? 0 : percent / 100;
  const r = (size - metrics.ring.stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.ring.gap, padding: metrics.ring.pad, borderRadius: metrics.ring.radius, backgroundColor: color.surface[1] }}>
      <View style={{ width: size, height: size, transform: [{ rotate: `${metrics.ring.tilt}deg` }], borderRadius: size / 2, boxShadow: `0 0 34px ${color.lime.tint20}` }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Defs />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.surface[4]} strokeWidth={metrics.ring.stroke} fill={color.surface[1]} />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.lime.base} strokeWidth={metrics.ring.stroke} fill="none" strokeDasharray={`${c * p} ${c}`} />
        </Svg>
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: `${-metrics.ring.tilt}deg` }] }}>
          {isNew || percent === null ? <Text variant="ringValue">{t("common.keptRateNew")}</Text> : <CountText text={`${percent}%`} variant="ringValue" />}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...typeStyles.monoValue, letterSpacing: 1.2, color: color.text.secondary }}>{t("common.keptRateLabel")}</Text>
        <Text variant="cardName" style={{ marginTop: space[4], fontSize: 16, lineHeight: 21 }}>{line}</Text>
        <Text variant="note" color={color.text.secondary} style={{ marginTop: space[6] }}>{t("common.keptRateNote")}</Text>
      </View>
    </View>
  );
}

// ── IdentityRow (`id`) ──
export function IdentityRow({ initial, bg, name, handle, chips = [] }: { initial: string; bg: string; name: string; handle: string; chips?: { text: string; icon?: IconName; tone?: ChipTone }[] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space[14] }}>
      <View style={{ transform: [{ rotate: `${metrics.identity.tilt}deg` }], boxShadow: cheapShadow("0 10px 24px rgba(0,0,0,0.4)"), borderRadius: metrics.identity.radius }}>
        <InitialTile initial={initial} bg={bg} size={metrics.identity.tile} radius={metrics.identity.radius} textSize={28} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="profileName">{name}</Text>
        <Text variant="monoValue" color={color.text.secondary} style={{ marginTop: space[2] }}>{handle}</Text>
        {chips.length ? <View style={{ flexDirection: "row", gap: space[6], marginTop: space[8] }}>{chips.map((c) => <Chip key={c.text} {...c} small />)}</View> : null}
      </View>
    </View>
  );
}

// ── DayStrip (`days`) ── kept = lime + check; today = white ring, −6°.
/** `labels` come from copy (one per day). */
export function DayStrip({ n, done, today, labels }: { n: number; done: number; today: number; labels: string[] }) {
  return (
    <View style={{ flexDirection: "row", gap: metrics.dayStrip.gap }}>
      {Array.from({ length: n }, (_, i) => {
        const kept = i < done, isToday = i === today - 1;
        const cell = (
          <View style={{
            height: metrics.dayStrip.h, borderRadius: metrics.dayStrip.radius, alignItems: "center", justifyContent: "center",
            backgroundColor: kept ? color.lime.base : color.surface[1],
            boxShadow: isToday ? `0 0 0 2px ${color.bg.app}, 0 0 0 4px ${color.text.primary}` : kept ? undefined : `inset 0 0 0 1px ${color.line.empty}`,
            transform: [{ rotate: `${isToday ? metrics.dayStrip.todayTilt : kept ? (i % 2 ? 2 : -2) : 0}deg` }],
          }}>
            {kept ? <Pop delay={250 + i * 70}><Icon name="check-bold" size={metrics.dayStrip.icon} color={color.text.onLime} /></Pop> : null}
          </View>
        );
        return (
          <View key={i} style={{ flex: 1, alignItems: "stretch", gap: space[8] }} accessibilityLabel={labels[i]}>
            {cell}
            <Text variant="monoMicro" align="center" color={isToday ? color.text.primary : color.text.tertiary}>{labels[i]}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── BarChart (`bars`) ──
export function BarChart({ label, bars }: { label: string; bars: { label: string; value: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <View style={{ padding: metrics.bars.pad, borderRadius: metrics.bars.radius, backgroundColor: color.surface[1] }}>
      <Text variant="label" color={color.text.secondary} style={{ fontSize: 13 }}>{label}</Text>
      <View style={{ marginTop: space[12], flexDirection: "row", alignItems: "flex-end", gap: metrics.bars.gap, height: metrics.bars.height }}>
        {bars.map((b, i) => (
          <View key={i} style={{ flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: space[4] }}>
            <Text variant="monoMicro" color={color.text.muted}>{b.value ? String(b.value) : ""}</Text>
            <View style={{ width: "100%", height: b.value ? Math.max(metrics.bars.minH, Math.round((b.value / max) * (metrics.bars.height - metrics.bars.labelSpace))) : metrics.bars.minH, minHeight: metrics.bars.minH, borderRadius: metrics.bars.barRadius, backgroundColor: b.value ? color.lime.base : color.surface[4] }} />
            <Text variant="monoMicro" color={color.text.tertiary} style={{ fontFamily: typeStyles.caption.fontFamily }}>{b.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
