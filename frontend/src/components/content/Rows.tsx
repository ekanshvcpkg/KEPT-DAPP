import type { ListItem } from "../layout/list";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { color, duration, metrics, space } from "@/theme";
import { Avatar } from "../avatar/Avatar";
import { CheckK, Icon, InitialTile, PressScale, Text, useAnimationLifecycle } from "../primitives";
import type { IconName } from "../primitives";
import { tileForIcon } from "@/theme";
import { Gradient } from "../primitives";

export type RowLeading =
  | { kind: "avatar"; config: string }
  | { kind: "initial"; initial: string; bg: string }
  | { kind: "icon"; icon: IconName; bg?: string; fg?: string }
  | { kind: "mark" };

export interface RowProps {
  title: string;
  sub?: string;
  leading?: RowLeading;
  value?: string;
  valueColor?: string;
  valueSub?: string;
  chevron?: boolean;
  toggle?: { on: boolean; onChange: (on: boolean) => void };
  trailing?: ReactNode;
  titleColor?: string;
  bg?: string;
  minHeight?: number;
  onPress?: () => void;
}

const TILE_SHADE = `inset 0 1.5px 0 ${color.extra.tileHi22}, inset 0 -2px 0 ${color.extra.tileShade20}`;

function Leading({ l }: { l: RowLeading }) {
  const box = { width: metrics.row.tile, height: metrics.row.tile, borderRadius: metrics.row.tileRadius, overflow: "hidden" as const, alignItems: "center" as const, justifyContent: "center" as const };
  if (l.kind === "avatar") return <View style={box}><Avatar config={l.config} size={metrics.row.tile} /></View>;
  if (l.kind === "initial") return <InitialTile initial={l.initial} bg={l.bg} size={metrics.row.tile} radius={metrics.row.tileRadius} textSize={15} />;
  if (l.kind === "mark") return <View style={[box, { backgroundColor: color.lime.base }]}><CheckK size={30} variant="ink" /></View>;
  const mapped = !l.bg && !l.fg ? tileForIcon(l.icon) : null;
  const known = mapped && mapped.ink !== color.tilePalette.white[2];
  return (
    <View style={[box, { backgroundColor: l.bg ?? color.surface[4], boxShadow: TILE_SHADE }]}>
      {known ? <Gradient g={mapped.gradient} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
      <Icon name={l.icon} size={20} color={l.fg ?? (known ? mapped.ink : color.text.primary)} />
    </View>
  );
}

function Row(p: RowProps) {
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.row.gap, minHeight: p.minHeight ?? metrics.row.minH, paddingVertical: metrics.row.padY, paddingLeft: metrics.row.padL, paddingRight: metrics.row.padR, borderRadius: metrics.row.radius, backgroundColor: p.bg ?? color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline}` }}>
      {p.leading ? <Leading l={p.leading} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle" color={p.titleColor ?? color.text.primary}>{p.title}</Text>
        {p.sub ? <Text variant="caption" style={{ marginTop: space[2] }}>{p.sub}</Text> : null}
      </View>
      {p.value || p.valueSub ? (
        <View style={{ alignItems: "flex-end" }}>
          {p.value ? <Text variant="rowTitle" color={p.valueColor ?? color.text.primary} style={{ fontSize: 14, fontVariant: ["tabular-nums"] }}>{p.value}</Text> : null}
          {p.valueSub ? <Text variant="micro">{p.valueSub}</Text> : null}
        </View>
      ) : null}
      {p.trailing}
      {p.chevron ? <Icon name="chevron-right" size={metrics.row.chevron} color={color.text.tertiary} /> : null}
      {p.toggle ? <Toggle on={p.toggle.on} onChange={p.toggle.onChange} label={p.title} /> : null}
    </View>
  );
  if (p.toggle) return body;
  return p.onPress ? <PressScale onPress={p.onPress} accessibilityLabel={p.title}>{body}</PressScale> : body;
}

export function RowList({ rows, label }: { rows: RowProps[]; label?: string }) {
  return (
    <View style={{ gap: metrics.row.listGap }}>
      {label ? <Text variant="monoLabel" style={{ marginVertical: space[2] }}>{label}</Text> : null}
      {rows.map((r, i) => <Row key={`${r.title}-${i}`} {...r} />)}
    </View>
  );
}

/**
 * RowList's look as ScreenList rows (layout/Screen): the label, then each row, spaced as RowList spaces them.
 * `gapBefore`: the space above the section (the screen column's gap between sections; 0 for the first).
 */
export function rowListItems(key: string, rows: RowProps[], opts: { label?: string; gapBefore?: number } = {}): ListItem[] {
  const items: ListItem[] = [];
  const first = opts.gapBefore ?? 0;
  if (opts.label) {
    const label = opts.label;
    items.push({ key: `${key}:label`, gapBefore: first, render: () => <Text variant="monoLabel" style={{ marginVertical: space[2] }}>{label}</Text> });
  }
  rows.forEach((r, i) => items.push({ key: `${key}:${r.title}-${i}`, gapBefore: i === 0 && !opts.label ? first : metrics.row.listGap, render: () => <Row {...r} /> }));
  return items;
}

/** Toggle: 46×28, knob 22 at x 3 / 21, 150 ms. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  const reduce = useReducedMotion();
  const k = useSharedValue(on ? 1 : 0);
  const onLayout = useAnimationLifecycle([k], () => { k.set(reduce ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: duration.toggle })); }, [on, reduce]);
  // The knob slides with a transform (motion rework: no layout animation); it sits at x 3, moves to x 21.
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: (metrics.toggle.on - metrics.toggle.inset) * k.value }] }));
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={() => onChange(!on)} hitSlop={10}>
      <View style={{ width: metrics.toggle.w, height: metrics.toggle.h, borderRadius: metrics.toggle.radius, backgroundColor: on ? color.lime.base : color.line.toggleOff }}>
        <Animated.View onLayout={onLayout} style={[{ position: "absolute", top: metrics.toggle.inset, left: metrics.toggle.inset, width: metrics.toggle.knob, height: metrics.toggle.knob, borderRadius: metrics.toggle.knob / 2, backgroundColor: on ? color.text.onLime : color.extra.toggleKnobOff }, knob]} />
      </View>
    </Pressable>
  );
}
