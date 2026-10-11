import type { ReactNode } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion } from "react-native-reanimated";
import { color, fontFamily, metrics, radius, space, type as typeStyles } from "@/theme";
import { t } from "@/copy";
import { Gradient, Icon, PressScale, RichText, Text, useShimmer } from "../primitives";
import type { IconName } from "../primitives";

// ── Title (`t`) ── fs 30 by default; letter-spacing −1.1, or −1.8 from fs 40; line-height 1.1.
export function Title({ heading, sub, fs = 30, align = "left", pt = space[8], color: hc = color.text.primary }: {
  heading: string; sub?: string; fs?: number; align?: "left" | "center"; pt?: number; color?: string;
}) {
  return (
    <View style={{ paddingTop: pt }} accessibilityRole="header">
      <Text style={{ ...typeStyles.title, fontSize: fs, lineHeight: Math.round(fs * 1.1), letterSpacing: fs >= 40 ? -1.8 : -1.1, color: hc, textAlign: align }}>{heading}</Text>
      {sub ? <Text variant="body" align={align} style={{ marginTop: space[8] }}>{sub}</Text> : null}
    </View>
  );
}

// ── BodyText (`tx`) ── 15/21 secondary, with <m> mono spans; `mono` = section label.
export function BodyText({ text, mono }: { text: string; mono?: boolean }) {
  if (mono) return <Text variant="monoLabel" style={{ marginTop: space[4] }}>{text}</Text>;
  return <RichText text={text} variant="body" style={{ lineHeight: 21 }} />;
}

// ── Note ── centred, icon 14 + 12/17 tertiary.
export function Note({ text, icon = "information-outline" }: { text: string; icon?: IconName }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "flex-start", gap: space[6], paddingHorizontal: metrics.note.padX }}>
      <Icon name={icon} size={metrics.note.icon} color={color.text.tertiary} />
      <Text variant="note" align="center" style={{ flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

// ── Banner (`ban`) ── tone → [bg, tile].
type BannerTone = keyof typeof color.bannerTone;
export function Banner({ tone, icon, title, sub, onPress }: { tone: Exclude<BannerTone, "$doc">; icon: IconName; title: string; sub?: string; onPress?: () => void }) {
  const [bg, tile] = color.bannerTone[tone];
  const body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.banner.gap, padding: metrics.banner.pad, borderRadius: metrics.banner.radius, backgroundColor: bg }}>
      <View style={{ width: metrics.banner.tile, height: metrics.banner.tile, borderRadius: metrics.banner.tileRadius, backgroundColor: tile, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={metrics.banner.icon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle">{title}</Text>
        {sub ? <Text style={{ ...typeStyles.label, fontSize: 13, lineHeight: 18, color: color.text.muted, marginTop: space[2] }}>{sub}</Text> : null}
      </View>
      {onPress ? <Icon name="chevron-right" size={metrics.row.chevron} /> : null}
    </View>
  );
  return onPress ? <PressScale onPress={onPress} accessibilityLabel={title}>{body}</PressScale> : body;
}

// ── Chip / Tag / OddsChip ── tones from color.chipTone.
export type ChipTone = Exclude<keyof typeof color.chipTone, never>;
export function Chip({ text, icon, tone = "g", tilt = 0, small }: { text: string; icon?: IconName; tone?: ChipTone; tilt?: number; small?: boolean }) {
  const t = color.chipTone[tone];
  const h = small ? metrics.card.tagH : metrics.chip.h;
  const ring = "ring" in t ? t.ring : undefined;
  return (
    <View style={{
      height: h, paddingLeft: small ? metrics.card.tagPadL : metrics.chip.padL, paddingRight: small ? metrics.card.tagPadR : metrics.chip.padR,
      borderRadius: h / 2, backgroundColor: t.bg, flexDirection: "row", alignItems: "center", gap: small ? metrics.card.tagGap : metrics.chip.gap,
      transform: [{ rotate: `${tilt}deg` }], ...(ring ? { boxShadow: ring.replace(/^inset (\d+(?:\.\d+)?) /, "inset 0 0 0 $1px ") } : {}),
      ...("shadow" in t ? { boxShadow: t.shadow } : {}),
    }}>
      {icon ? <Icon name={icon} size={small ? metrics.card.tagIcon : metrics.chip.icon} color={t.fg} /> : null}
      <Text variant="chip" color={t.fg} numberOfLines={1}>{text}</Text>
    </View>
  );
}
export const Tag = (p: { text: string; icon?: IconName; tone?: ChipTone }) => <Chip {...p} small />;
export function ChipRow({ children, justify = "flex-start" }: { children: ReactNode; justify?: "flex-start" | "center" }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[6], justifyContent: justify }}>{children}</View>;
}
/** OddsChip: g when likely to keep, ora when likely to miss, vio in review (components.md). */
export function OddsChip({ text, likely }: { text: string; likely: "keep" | "miss" | "review" }) {
  return <Chip text={text} icon="cards-playing-outline" tone={likely === "keep" ? "g" : likely === "miss" ? "ora" : "vio"} />;
}

// ── Breakdown (`brk`) ──
interface BreakdownRow { label: string; value: string; color?: string; total?: boolean }
export function Breakdown({ rows, label }: { rows: BreakdownRow[]; label?: string }) {
  return (
    <View>
      {label ? <Text variant="monoLabel" style={{ marginBottom: space[8] }}>{label}</Text> : null}
      <View style={{ paddingHorizontal: metrics.breakdown.padX, paddingVertical: metrics.breakdown.padY, borderRadius: metrics.breakdown.radius, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline}` }}>
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[12], minHeight: r.total ? metrics.breakdown.totalH : metrics.breakdown.rowH, ...(i ? { borderTopWidth: 1, borderTopColor: color.line.hairline2 } : {}) }}>
            <Text variant="label" color={color.text.secondary}>{r.label}</Text>
            <Text style={{ fontFamily: fontFamily("sans", r.total ? 700 : 600), fontSize: r.total ? 18 : 14, color: r.color ?? color.text.primary, fontVariant: ["tabular-nums"], textAlign: "right", flexShrink: 1 }}>{r.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Segmented (`seg`) ──
export function Segmented({ items, value, onChange }: { items: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", padding: metrics.segmented.pad, borderRadius: metrics.segmented.radius, backgroundColor: color.surface[1], gap: metrics.segmented.gap }}>
      {items.map((t, i) => {
        const on = i === value;
        return (
          <PressScale key={t} onPress={() => onChange(i)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t} style={{ flex: 1 }} hit={{ w: metrics.segmented.item, h: metrics.segmented.item }}>
            <View style={{ height: metrics.segmented.item, alignItems: "center", justifyContent: "center" }}>
              {/* Its own view, mounted with the selection: on Android a background switched on later (from
                  transparent) was drawn without the unchanged corner radius, a white rectangle. */}
              {on ? <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, borderRadius: metrics.segmented.itemRadius, backgroundColor: color.text.primary }} /> : null}
              <Text variant="chipMd" color={on ? color.text.onLime : color.text.secondary} numberOfLines={1}>{t}</Text>
            </View>
          </PressScale>
        );
      })}
    </View>
  );
}

// ── SearchBar ──
export function SearchBar({ placeholder, onPress, filter }: { placeholder: string; onPress?: () => void; filter?: boolean }) {
  return (
    <PressScale onPress={onPress} accessibilityRole="search" accessibilityLabel={placeholder}>
      <View style={{ height: metrics.search.h, borderRadius: metrics.search.radius, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${color.extra.hairline07}`, flexDirection: "row", alignItems: "center", gap: space[10], paddingHorizontal: metrics.search.padX }}>
        <Icon name="magnify" size={metrics.search.icon} color={color.text.secondary} />
        <Text variant="label" color={color.text.secondary} style={{ flex: 1, fontSize: 15 }}>{placeholder}</Text>
        {filter ? <Icon name="tune-variant" size={19} color={color.text.secondary} /> : null}
      </View>
    </PressScale>
  );
}

// ── UploadBox (`up`) ── hatch pattern drawn as a stripe stack.
export function UploadBox({ title, sub, onPress }: { title: string; sub: string; onPress?: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={title}>
      <View style={{ height: metrics.upload.h, borderRadius: metrics.upload.radius, overflow: "hidden", backgroundColor: color.extra.uploadHatchA, boxShadow: `inset 0 0 0 ${metrics.upload.ring}px ${color.extra.uploadRing}`, alignItems: "center", justifyContent: "center", gap: space[6] }}>
        <Hatch />
        <Icon name="image-plus" size={metrics.upload.icon} color={color.text.secondary} />
        <Text variant="rowTitle">{title}</Text>
        <Text variant="caption" color={color.text.tertiary}>{sub}</Text>
      </View>
    </PressScale>
  );
}
function Hatch() {
  // repeating 135deg #171717 0–10, #1A1A1A 10–20 (tokens.gradient.uploadHatch)
  const n = 40;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: -150, right: -150, top: -150, bottom: -150, transform: [{ rotate: "45deg" }], flexDirection: "row" }}>
      {Array.from({ length: n }, (_, i) => <View key={i} style={{ width: metrics.upload.stripe * 2 / Math.SQRT2, height: "100%", backgroundColor: i % 2 ? color.extra.uploadHatchB : color.extra.uploadHatchA }} />)}
    </View>
  );
}

// ── Skeleton ── loading blocks in the same geometry (screens.md › States): surface.1 with a light band
// sweeping left → right (D-83; the design's .5 ↔ 1 pulse read as a flicker). Only the band moves, on the
// UI thread; its travel is the window width, so blocks under one ShimmerProvider sweep as one light.
export function Skeleton({ height, radiusPx = radius.card, width }: { height: number; radiusPx?: number; width?: number | `${number}%` }) {
  const p = useShimmer();
  const reduce = useReducedMotion();
  const { width: W } = useWindowDimensions();
  const band = Math.round(W * metrics.skeleton.band);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: -band + p.value * (W + band) }] }));
  return (
    <View accessibilityLabel={t("additions.a11y.loading")} style={{ height, width: width ?? "100%", borderRadius: radiusPx, backgroundColor: color.extra.skeleton, overflow: "hidden" }}>
      {reduce ? null : (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width: band }, a]}>
          <Gradient g={{ colors: color.extra.skeletonShine, start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } }} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </View>
  );
}

export const Spacer = ({ h }: { h: number }) => <View style={{ height: h }} />;
