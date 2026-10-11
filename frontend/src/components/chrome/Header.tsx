// Top-of-screen chrome (components.md › Chrome): DevnetBadge, AppHeader for tab screens, NavBar + StepBar
// for flow screens. The real Android status bar is kept; the badge sits in a row under it.
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { t } from "@/copy";
import { color, duration, metrics, space } from "@/theme";
import { Icon, Pop, PressScale, Text, useAnimationLifecycle, Bump, CountText } from "../primitives";
import type { IconName } from "../primitives";
import { KeeperMark } from "../keeper/KeeperUI";
import { useScreenKeeper } from "../keeper/ScreenKeeper";

// ── DevnetBadge ── 18 h, padding 0/6, radius 5, devnetBadge colours.
/** Long-press opens the Dev menu in development builds. */
export function DevnetBadge({ onLongPress }: { onLongPress?: () => void }) {
  const s = metrics.statusBar;
  return (
    <Pressable onLongPress={onLongPress} disabled={!onLongPress} accessibilityRole="text" accessibilityLabel={t("common.devnet")} hitSlop={12} style={{ alignSelf: "flex-start" }}>
      <View style={{ height: s.badgeH, paddingHorizontal: s.badgePadX, borderRadius: s.badgeRadius, backgroundColor: color.devnetBadge.bg, justifyContent: "center" }}>
        <Text variant="devnet" color={color.devnetBadge.fg}>{t("common.devnet")}</Text>
      </View>
    </Pressable>
  );
}

/** DEMO badge next to DEVNET while the app runs on the sample account (state/mode.ts). */
export function DemoBadge() {
  const s = metrics.statusBar;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={t("additions.mode.badge")} style={{ height: s.badgeH, paddingHorizontal: s.badgePadX, borderRadius: s.badgeRadius, backgroundColor: color.violet.tint16, justifyContent: "center" }}>
      <Text variant="devnet" color={color.violet.base}>{t("additions.mode.badge")}</Text>
    </View>
  );
}

// ── RoundButton ── 36 (bell), 40 (back) or 34 (extra) round surface.2 + hairline; pressed .94.
function RoundButton({ icon, size, iconSize, label, onPress }: { icon: IconName; size: number; iconSize: number; label: string; onPress?: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={label} scale={metrics.shutter.pressScale} hit={{ w: size, h: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color.surface[2], boxShadow: `inset 0 0 0 1px ${color.line.hairline2}`, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={iconSize} />
      </View>
    </PressScale>
  );
}

// ── BalanceChip ── 36 h pill: sack 17 lime, amount 14/600, plus-circle 15. Tap → W1.
export function BalanceChip({ amount, onPress }: { amount: string; onPress?: () => void }) {
  const h = metrics.header;
  // motion.md §4: a new balance counts from the old one (900 ms) and the chip pops. The first load
  // ("–" → amount) just shows the amount.
  const [seen, setSeen] = useState({ cur: amount, prev: amount });
  if (amount !== seen.cur) setSeen({ cur: amount, prev: seen.cur });
  const counting = seen.prev !== amount && /\d/.test(seen.prev);
  return (
    <PressScale onPress={onPress} accessibilityLabel={`${t("additions.a11y.wallet")}: ${amount} ${t("common.currency")}`} hit={{ w: h.chipH, h: h.chipH }}>
      <Bump trigger={counting ? amount : "load"}>
      <View style={{ height: h.chipH, paddingLeft: h.chipPadL, paddingRight: h.chipPadR, borderRadius: h.chipH / 2, backgroundColor: color.surface[2], boxShadow: `inset 0 0 0 1px ${color.line.hairline2}`, flexDirection: "row", alignItems: "center", gap: space[6] }}>
        <Icon name="sack" size={h.chipIcon} color={color.lime.base} />
        <CountText key={amount} text={amount} from={counting ? seen.prev : amount} variant="chipMd" style={{ fontSize: 14 }} />
        <Icon name="plus-circle" size={h.chipPlus} color={color.text.tertiary} />
      </View>
      </Bump>
    </PressScale>
  );
}

// ── Bell ── 36 round with a lime count badge (hidden at 0) that pops in.
export function Bell({ count, onPress }: { count: number; onPress?: () => void }) {
  const h = metrics.header;
  const label = count > 0 ? `${t("additions.a11y.inbox")}, ${t("additions.a11y.unread", { n: count })}` : t("additions.a11y.inbox");
  return (
    <View>
      <RoundButton icon="bell-outline" size={h.bell} iconSize={h.bellIcon} label={label} {...(onPress ? { onPress } : {})} />
      {count > 0 ? (
        <View pointerEvents="none" style={{ position: "absolute", top: h.badgeOffset, right: h.badgeOffset }}>
          <Pop key={count} ms={duration.pop} ease="springHard">
            <View style={{ minWidth: h.badgeMin, height: h.badgeMin, paddingHorizontal: space[4], borderRadius: h.badgeRadius, backgroundColor: color.lime.base, boxShadow: `0 0 0 ${h.dotRing}px ${color.bg.app}`, alignItems: "center", justifyContent: "center" }}>
              <Text variant="micro" color={color.text.onLime} style={{ fontSize: 11 }}>{String(count)}</Text>
            </View>
          </Pop>
        </View>
      ) : null}
    </View>
  );
}

// ── AppHeader (tab screens) ── KeeperMark · title · BalanceChip · Bell · optional extra.
interface AppHeaderProps {
  title: string;
  /** Pre-formatted SKR amount (formatSkr at the edge). */
  balance: string;
  unreadCount: number;
  /** Defaults to the screen's Keeper (Screen › ScreenKeeper). */
  keeper?: { hasNew: boolean; onPress: () => void };
  onBalance?: () => void;
  onBell?: () => void;
  extra?: { icon: IconName; label: string; onPress: () => void };
}

export function AppHeader({ title, balance, unreadCount, keeper, onBalance, onBell, extra }: AppHeaderProps) {
  const h = metrics.header;
  const host = useScreenKeeper();
  const mark = keeper ?? (host ? { hasNew: host.fresh, onPress: host.toggle } : { hasNew: false, onPress: () => {} });
  return (
    <View style={{ height: h.height, flexDirection: "row", alignItems: "center", gap: h.gap }}>
      <KeeperMark hasNew={mark.hasNew} onPress={mark.onPress} open={!!host?.open} />
      <Text variant="headerTitle" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header" style={{ marginLeft: h.titleMargin, flex: 1 }}>{title}</Text>
      <BalanceChip amount={balance} {...(onBalance ? { onPress: onBalance } : {})} />
      <Bell count={unreadCount} {...(onBell ? { onPress: onBell } : {})} />
      {extra ? <RoundButton icon={extra.icon} size={h.extra} iconSize={h.extraIcon} label={extra.label} onPress={extra.onPress} /> : null}
    </View>
  );
}

// ── StepBar ── n segments: done white, current lime with glow, upcoming #2E2E2E; colour eases 400 ms.
export function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={{ flex: 1, flexDirection: "row", gap: metrics.nav.step.gap }} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: current }}>
      {Array.from({ length: total }, (_, i) => <Step key={i} state={i + 1 < current ? "done" : i + 1 === current ? "current" : "next"} />)}
    </View>
  );
}
const STEP_LEVEL = { next: 0, current: 1, done: 2 } as const;
function Step({ state }: { state: "done" | "current" | "next" }) {
  // Colour eases between next → current → done; starts at its state (no tween on mount). The three colours
  // are stacked layers and only their opacities animate (motion rework: no colour animation per frame).
  const reduce = useReducedMotion();
  const q = useSharedValue<number>(STEP_LEVEL[state]);
  const onLayout = useAnimationLifecycle([q], () => { q.set(reduce ? STEP_LEVEL[state] : withTiming(STEP_LEVEL[state], { duration: duration.note - 20 })); }, [state, reduce]);
  const lime = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, q.value)) }));
  const white = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, q.value - 1)) }));
  const shape = { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: metrics.nav.step.radius } as const;
  return (
    <View onLayout={onLayout} style={[{ flex: 1, height: metrics.nav.step.h, borderRadius: metrics.nav.step.radius, backgroundColor: color.line.empty }, state === "current" ? { boxShadow: `0 0 12px ${color.lime.ring45}` } : null]}>
      <Animated.View style={[shape, { backgroundColor: color.lime.base }, lime]} />
      <Animated.View style={[shape, { backgroundColor: color.text.primary }, white]} />
    </View>
  );
}

// ── NavBar (flow screens) ── back/close · title or StepBar · mono right label · optional KeeperMark.
interface NavBarProps {
  onBack: () => void;
  title?: string;
  steps?: [current: number, total: number];
  /** Mono label on the right; defaults to "k/n" with steps. */
  right?: string;
  close?: boolean;
  /** Defaults to the screen's Keeper: the mark shows only when the screen has a line (ScreenKeeper). */
  keeper?: { hasNew: boolean; onPress: () => void };
}

export function NavBar({ onBack, title, steps, right, close, keeper }: NavBarProps) {
  const n = metrics.nav;
  const label = right ?? (steps ? `${steps[0]}/${steps[1]}` : undefined);
  const host = useScreenKeeper();
  const mark = keeper ?? (host?.lines ? { hasNew: host.fresh, onPress: host.toggle } : null);
  return (
    <View style={{ height: n.height, flexDirection: "row", alignItems: "center", gap: n.gap }}>
      <RoundButton icon={close ? "close" : "chevron-left"} size={n.back} iconSize={n.backIcon} label={t(close ? "additions.a11y.close" : "additions.a11y.back")} onPress={onBack} />
      {steps ? <StepBar current={steps[0]} total={steps[1]} /> : (
        <Text variant="chipMd" color={color.text.muted} numberOfLines={1} align="center" style={{ flex: 1, fontSize: 14 }}>{title ?? ""}</Text>
      )}
      <View style={{ minWidth: n.rightMin, alignItems: "flex-end" }}>
        {label ? <Text variant="monoLabel" color={color.text.secondary}>{label}</Text> : null}
      </View>
      {mark ? <KeeperMark hasNew={mark.hasNew} onPress={mark.onPress} open={!!host?.open} /> : null}
    </View>
  );
}
