import { useContext, useEffect } from "react";
import { View } from "react-native";
import { hpFilledSegments } from "@kept/engine";
import { t } from "@/copy";
import { color, gradient, hpSegmentColor, metrics, shadow, space, stagger } from "@/theme";
import { Button } from "../actions";
import type { ButtonProps } from "../actions";
import { Icon, InitialTile, Loop, Pop, PressScale, Surface, Text, Tile, CountText, FadeOut } from "../primitives";
import type { IconName } from "../primitives";
import { Tag } from "./Basics";
import type { ChipTone } from "./Basics";
import { CardFill } from "./cardFill";
import { haptic } from "@/lib/haptics";

// ── HPBar (mini) ── 20 segments, gap 2, h 8, radius 2; pop in left → right.
export function HPBar({ hp, empty = color.line.empty, animate = true }: { hp: number; empty?: string; animate?: boolean }) {
  const filled = hpFilledSegments(hp);
  return (
    <View style={{ flexDirection: "row", gap: metrics.hpBar.gap }} accessibilityLabel={t("common.hpOf", { hp })}>
      {Array.from({ length: metrics.hpBar.segments }, (_, i) => {
        const seg = <View style={{ flex: 1, height: metrics.hpBar.height, borderRadius: metrics.hpBar.radius, backgroundColor: hpSegmentColor(i, hp, empty) }} />;
        return animate && i < filled ? <Pop key={i} delay={300 + i * stagger.cardSeg} ms={300} style={{ flex: 1 }}>{seg}</Pop> : <View key={i} style={{ flex: 1 }}>{seg}</View>;
      })}
    </View>
  );
}

// ── HPPanel (`hp`) ── value counts up; lost-today segments ring red and beat; ≤ 20 the last filled beats.
// `from`: the HP this device showed last time (an unseen change, motion.md §2–3). Damage counts down from
// it and the lost segments empty (fill fades 200 ms) and ring; a heal counts up from it and the healed
// segments pop left → right. Without `from`, the panel enters as before (count up, segments pop).
export function HPPanel({ hp, lostToday = 0, note, warn, from }: { hp: number; lostToday?: number; note?: string; warn?: string; from?: number }) {
  const filled = hp / 5;
  const danger = hp <= color.hp.thresholds.dangerAtOrBelow;
  const changed = from !== undefined && from !== hp;
  const damage = changed && from > hp;
  const heal = changed && from < hp;
  const fromFilled = (from ?? 0) / 5;
  useEffect(() => {
    if (damage) haptic.warning();
    else if (heal) haptic.light();
  }, [damage, heal]);
  return (
    <View style={{ padding: metrics.hpPanel.pad, borderRadius: metrics.hpPanel.radius, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline2}` }} accessibilityLabel={t("common.hpOf", { hp })}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space[6] }}>
        <Text variant="monoLabel" color={color.text.secondary}>{t("common.oathHpLabel")}</Text>
        <View style={{ flex: 1 }} />
        <CountText text={String(hp)} {...(changed ? { from: String(from) } : {})} variant="hpNumber" color={danger ? color.red.base : color.text.primary} />
        <Text variant="label" color={color.text.tertiary}>{t("common.hpOf", { hp: "" }).trim()}</Text>
      </View>
      <View style={{ marginTop: metrics.hpPanel.mt, flexDirection: "row", gap: metrics.hpPanel.gap }}>
        {Array.from({ length: metrics.hpBar.segments }, (_, i) => {
          const lostNow = damage && i >= filled && i < fromFilled;
          const lost = lostNow || (i >= filled && i < filled + lostToday / 5);
          const last = danger && i === Math.ceil(filled) - 1;
          const seg = <View style={{ height: metrics.hpPanel.height, borderRadius: metrics.hpPanel.segRadius, backgroundColor: hpSegmentColor(i, hp, color.line.emptyDark), ...(lost ? { boxShadow: `inset 0 0 0 ${metrics.hpPanel.lostRing}px ${color.red.base}` } : {}) }} />;
          // Unseen damage: the old fill sits on top of the emptied segment and fades away.
          const body = lostNow ? (
            <View>
              {seg}
              <FadeOut delay={200} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
                <View style={{ flex: 1, borderRadius: metrics.hpPanel.segRadius, backgroundColor: hpSegmentColor(i, from!, color.line.emptyDark) }} />
              </FadeOut>
            </View>
          ) : seg;
          if (lost || last) return <Loop key={i} kind="beat" style={{ flex: 1 }}>{body}</Loop>;
          // A heal pops only the new segments (28 ms stagger); the ones already seen stay put.
          if (heal) return i >= fromFilled && i < filled ? <Pop key={i} delay={200 + (i - Math.floor(fromFilled)) * stagger.hpSeg} ms={300} style={{ flex: 1 }}>{seg}</Pop> : <View key={i} style={{ flex: 1 }}>{seg}</View>;
          if (damage) return <View key={i} style={{ flex: 1 }}>{seg}</View>;
          return i < filled ? <Pop key={i} delay={200 + i * stagger.hpSeg} ms={300} style={{ flex: 1 }}>{seg}</Pop> : <View key={i} style={{ flex: 1 }}>{seg}</View>;
        })}
      </View>
      {note ? <Text variant="caption" style={{ marginTop: metrics.hpPanel.mt }}>{note}</Text> : null}
      {warn ? <Warn text={warn} bg={color.red.tint14} icon="heart-broken" /> : null}
    </View>
  );
}

function Warn({ text, bg, icon = "alert-outline" }: { text: string; bg: string; icon?: IconName }) {
  return (
    <View style={{ marginTop: metrics.card.sectionGap, paddingHorizontal: metrics.card.warnPadX, paddingVertical: metrics.card.warnPadY, borderRadius: metrics.card.warnRadius, backgroundColor: bg, flexDirection: "row", alignItems: "center", gap: space[6] }}>
      <Icon name={icon} size={metrics.card.warnIcon} color={color.red.base} />
      <Text variant="chipMd" color={color.red.base} style={{ flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

// ── OathCard (`card`) ──
interface OathCardProps {
  icon: IconName;
  name: string;
  meta: string;
  onPress?: () => void;
  line?: string;
  tags?: { text: string; icon?: IconName; tone?: ChipTone }[];
  hp?: number;
  warn?: string;
  button?: Omit<ButtonProps, "size">;
  /** Friend float: "Riya kept 07:12" with the member's initial + colour. */
  float?: { text: string; initial: string; bg: string };
  tilt?: number;
  variant?: "default" | "sm" | "lime";
  dim?: boolean;
}

export function OathCard(p: OathCardProps) {
  const v = p.variant ?? "default";
  const fill = useContext(CardFill);
  const bg = v === "lime" ? { bg: color.lime.tint07 } : v === "sm" ? { bg: color.surface[1] } : { gradient: gradient("card") };
  const sh = v === "lime" ? `inset 0 0 0 1.5px ${color.lime.ring45}` : v === "sm" ? `inset 0 0 0 1px ${color.line.hairline2}` : shadow("card").boxShadow;
  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: metrics.card.gap }}>
      <Tile icon={p.icon} />
      <View style={{ flex: 1 }}>
        <Text variant="cardName">{p.name}</Text>
        <Text variant="caption">{p.meta}</Text>
      </View>
      {p.onPress ? <Icon name="chevron-right" size={metrics.card.chevron} color={color.text.tertiary} /> : null}
    </View>
  );
  const card = (
    <Surface radius={metrics.card.radius} {...bg} shadow={sh} {...(v === "default" ? { overlay: gradient("cardSheen") } : {})} style={[{ padding: metrics.card.pad }, fill ? { flex: 1 } : null]}>
      {p.onPress ? <PressScale onPress={p.onPress} accessibilityLabel={p.name} scale={1}>{header}</PressScale> : header}
      {p.line ? <Text variant="cardLine" style={{ marginTop: metrics.card.sectionGap }}>{p.line}</Text> : null}
      {p.tags?.length ? (
        <View style={{ marginTop: p.line ? space[10] : space[12], flexDirection: "row", flexWrap: "wrap", gap: space[6] }}>
          {p.tags.map((tg) => <Tag key={tg.text} {...tg} />)}
        </View>
      ) : null}
      {p.hp !== undefined ? (
        <View style={{ marginTop: metrics.card.sectionGap }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: space[6] }}>
            <Text variant="caption">{t("common.oathHp")}</Text>
            <Text variant="monoValue" color={p.hp <= color.hp.thresholds.dangerAtOrBelow ? color.red.base : color.text.primary}>{t("common.hpOf", { hp: p.hp })}</Text>
          </View>
          <HPBar hp={p.hp} />
        </View>
      ) : null}
      {p.warn ? <Warn text={p.warn} bg={color.red.tint12} /> : null}
      {fill && p.button ? <View style={{ flexGrow: 1 }} /> : null}
      {p.button ? <View style={{ marginTop: metrics.card.sectionGap }}><Button {...p.button} size="card" /></View> : null}
    </Surface>
  );
  return (
    <View style={[{ opacity: p.dim ? metrics.card.dimOpacity : 1, transform: [{ rotate: `${p.tilt ?? 0}deg` }] }, fill ? { flex: 1 } : null]}>
      {v === "default" ? <Loop kind="breath" {...(fill ? { style: { flex: 1 } } : {})}>{card}</Loop> : card}
      {p.float ? (
        <Pop delay={600} ms={550} style={{ position: "absolute", right: metrics.card.float.right, top: metrics.card.float.top }}>
          <View style={{ height: metrics.card.float.h, paddingLeft: metrics.card.float.padL, paddingRight: metrics.card.float.padR, borderRadius: metrics.card.float.radius, backgroundColor: color.text.primary, flexDirection: "row", alignItems: "center", gap: space[6], transform: [{ rotate: `${metrics.card.float.tilt}deg` }], ...shadow("float") }}>
            <InitialTile initial={p.float.initial} bg={p.float.bg} size={metrics.card.float.avatar} radius={metrics.card.float.avatarRadius} textSize={11} />
            <Text variant="chipMd" color={color.text.onLime}>{p.float.text}</Text>
          </View>
        </Pop>
      ) : null}
    </View>
  );
}

// ── DayMemberGrid (`grid`) ── k kept · m missed · p pending · h photo 1 · r review · x broke · f future.
type CellState = "k" | "m" | "p" | "h" | "r" | "x" | "f";
const CELL: Record<CellState, { bg: string; fg: string; icon: IconName | null; ring?: string; beat?: number }> = {
  k: { bg: color.gridCell.kept.bg, fg: color.gridCell.kept.fg, icon: "check-bold" },
  m: { bg: color.gridCell.missed.bg, fg: color.gridCell.missed.fg, icon: "close-thick", ring: color.red.base },
  p: { bg: color.extra.transparent, fg: color.gridCell.pending.fg, icon: "timer-sand", ring: color.line.toggleOff, beat: 1800 },
  h: { bg: color.gridCell.half.bg, fg: color.gridCell.half.fg, icon: "circle-half-full", ring: color.extra.halfRing },
  r: { bg: color.gridCell.review.bg, fg: color.gridCell.review.fg, icon: "eye-outline", beat: 1800 },
  x: { bg: color.gridCell.broke.bg, fg: color.gridCell.broke.fg, icon: "fire", beat: 900 },
  f: { bg: color.gridCell.future.bg, fg: color.extra.transparent, icon: null },
};
const LEGEND: Partial<Record<CellState, "kept" | "missed" | "pending" | "review">> = { k: "kept", m: "missed", p: "pending", r: "review" };
export interface GridMember { key: string; name: string; initial: string; color: string; cells: string; onPress?: () => void }

/** The grid's `today` (1-based day number, −1 for none) from the engine's 0-based `dayIndex`. */
export const gridToday = (dayIndex: number | null | undefined): number => (dayIndex == null || dayIndex < 0 ? -1 : dayIndex + 1);

/** `today` is the 1-based day number (gridToday); its header number is drawn white. */
export function DayMemberGrid({ days, today, members }: { days: number; today: number; members: GridMember[] }) {
  const big = days > 7;
  const g = metrics.grid;
  const gap = big ? g.gapBig : g.gap;
  const cellH = big ? g.cellBig : g.cell;
  return (
    <View style={{ padding: g.pad, borderRadius: g.radius, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline2}` }}>
      <View style={{ flexDirection: "row", gap, alignItems: "center" }}>
        <View style={{ width: big ? g.nameColBig : g.nameCol }} />
        {Array.from({ length: days }, (_, i) => (
          <Text key={i} variant="monoMicro" align="center" style={{ flex: 1, letterSpacing: 0 }} color={i + 1 === today ? color.text.primary : color.text.tertiary}>{String(i + 1)}</Text>
        ))}
      </View>
      {members.map((m, ri) => {
        const row = (
          <View style={{ flexDirection: "row", gap, alignItems: "center", marginTop: gap }}>
            <View style={{ width: big ? g.nameColBig : g.nameCol, flexDirection: "row", alignItems: "center", gap: space[6] }}>
              <InitialTile initial={m.initial} bg={m.color} size={g.chip} radius={g.chipRadius} textSize={10} />
              {big ? null : <Text variant="chip" numberOfLines={1} style={{ flex: 1 }}>{m.name}</Text>}
            </View>
            {Array.from({ length: days }, (_, i) => {
              const st = (m.cells[i] ?? "f") as CellState;
              const c = CELL[st] ?? CELL.f;
              const cell = (
                <View accessibilityLabel={`${m.name} ${i + 1} ${LEGEND[st] ? t(`common.gridLegend.${LEGEND[st]}`) : ""}`.trim()} style={{ height: cellH, borderRadius: big ? g.cellRadiusBig : g.cellRadius, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", ...(c.ring ? { boxShadow: `inset 0 0 0 ${g.ring}px ${c.ring}` } : {}) }}>
                  {c.icon ? <Icon name={c.icon} size={big ? g.iconBig : g.icon} color={c.fg} /> : null}
                </View>
              );
              if (st === "k" || st === "m") return <Pop key={i} delay={250 + ri * stagger.gridRow + i * stagger.gridCol} ms={350} style={{ flex: 1 }}>{cell}</Pop>;
              if (c.beat) return <Loop key={i} kind="beat" period={c.beat} style={{ flex: 1 }}>{cell}</Loop>;
              return <View key={i} style={{ flex: 1 }}>{cell}</View>;
            })}
          </View>
        );
        return m.onPress ? <PressScale key={m.key} onPress={m.onPress} accessibilityLabel={m.name} scale={1}>{row}</PressScale> : <View key={m.key}>{row}</View>;
      })}
      <View style={{ marginTop: space[12], flexDirection: "row", flexWrap: "wrap", gap: g.legendGap }}>
        {([["kept", { backgroundColor: color.lime.base }], ["missed", { boxShadow: `inset 0 0 0 1.5px ${color.red.base}` }], ["pending", { boxShadow: `inset 0 0 0 1.5px ${color.extra.legendPending}` }], ["review", { backgroundColor: color.extra.legendReview }]] as const).map(([k, sw]) => (
          <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: space[5] }}>
            <View style={{ width: g.legendSwatch, height: g.legendSwatch, borderRadius: g.legendRadius, ...sw }} />
            <Text variant="micro" color={color.text.secondary}>{t(`common.gridLegend.${k}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
