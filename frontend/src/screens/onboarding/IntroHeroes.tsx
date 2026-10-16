// The three pictures of the intro (A1·i). Each one plays its own short story when its page is reached: stakes
// moving between friends, the on-device check, a chart drawing itself. All motion honours Reduce Motion
// (the end state is drawn at once) and stops after a few seconds; nothing loops forever.
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { Canvas, LinearGradient as SkGradient, Path as SkPath, vec } from "@shopify/react-native-skia";
import { t } from "@/copy";
import { Keeper } from "@/components/keeper/Keeper";
import { color, easing, gradient, space } from "@/theme";
import { CountText, Enter, FadeIn, Icon, Pop, Shake, Surface, Text, Tile, useAnimationLifecycle } from "@/components/primitives";
import type { IconName } from "@/components/primitives";
import { haptic } from "@/lib/haptics";
import { chartGeometry, keptSeries, sampleMiss, sampleSummary } from "@/features/intro/introData";
import { formatSol } from "@/lib/format";

/** A picture drawn at its own size and scaled down to fit the room a small phone leaves it. */
export function FitHero({ designW, designH, w, h, children }: { designW: number; designH: number; w: number; h: number; children: ReactNode }) {
  const s = Math.max(0.5, Math.min(1, w / designW, h / designH));
  return (
    <View style={{ width: designW * s, height: designH * s, alignSelf: "center" }}>
      <View style={{ width: designW, height: designH, transform: [{ scale: s }], transformOrigin: "top left" }}>{children}</View>
    </View>
  );
}

const shadowCard = `0 18px 40px rgba(0,0,0,0.45), inset 0 0 0 1px ${color.line.hairline3}`;

// ── Page 1: the bet ──────────────────────────────────────────────────────────────────────────────
export const HERO1 = { w: 340, h: 372 } as const;
const CELL = HERO1.w / 4;
const MEMBERS = [
  { key: "you", bg: color.member.you },
  { key: "riya", bg: color.member.riya },
  { key: "arjun", bg: color.member.arjun },
  { key: "dev", bg: color.member.dev },
] as const;
/** When Dev's day turns into a miss, and the coins start moving. */
const MISS_AT = 1700;

/** One coin from Dev's seat to a keeper's, in a small arc. */
function Coin({ to, delay }: { to: number; delay: number }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.value = withDelay(delay, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
  }, [reduce, delay]);
  const from = 3 * CELL, dist = (to - 3) * CELL;
  const a = useAnimatedStyle(() => {
    const v = p.value;
    return {
      opacity: v <= 0 || v >= 1 ? 0 : Math.min(1, v * 6) * Math.min(1, (1 - v) * 6),
      transform: [{ translateX: from + dist * v }, { translateY: -64 * Math.sin(Math.PI * v) }, { scale: 0.8 + 0.4 * Math.sin(Math.PI * v) }],
    };
  });
  return (
    <Animated.View onLayout={onLayout} pointerEvents="none" style={[{ position: "absolute", left: CELL / 2 - 10, top: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: color.lime.base, alignItems: "center", justifyContent: "center", boxShadow: `0 0 14px ${color.lime.glow22}` }, a]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.lime.deep }} />
    </Animated.View>
  );
}

function Member({ index }: { index: number }) {
  const m = MEMBERS[index]!;
  const dev = m.key === "dev";
  const [missed, setMissed] = useState(false);
  useEffect(() => {
    if (!dev) return;
    const id = setTimeout(() => { setMissed(true); haptic.warning(); }, MISS_AT);
    return () => clearTimeout(id);
  }, [dev]);
  const reduce = useReducedMotion();
  const status = dev && (missed || reduce) ? "missed" : "kept";
  return (
    <Pop delay={500 + index * 130} style={{ width: CELL, alignItems: "center", gap: space[6] }}>
      <Shake trigger={dev && missed ? 1 : 0}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: m.bg, alignItems: "center", justifyContent: "center" }}>
          <Text variant="rowTitle" color={color.text.onLime}>{t(`additions.intro.p1.${m.key}`).slice(0, 1)}</Text>
          <View style={{ position: "absolute", right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: status === "kept" ? color.lime.base : color.red.base, borderWidth: 2, borderColor: color.surface.cardBottom, alignItems: "center", justifyContent: "center" }}>
            <Icon name={status === "kept" ? "check-bold" : "close-circle-outline"} size={11} color={color.text.onLime} />
          </View>
        </View>
      </Shake>
      <Text variant="caption" color={status === "kept" ? color.text.muted : color.red.base}>{t(`additions.intro.p1.${m.key}`)}</Text>
    </Pop>
  );
}

export function BetHero() {
  const { lost, each } = useMemo(() => sampleMiss(), []);
  const reduce = useReducedMotion();
  return (
    <View style={{ width: HERO1.w, height: HERO1.h }} accessible accessibilityLabel={t("additions.intro.p1.a11y")}>
      <View style={{ position: "absolute", left: 14, right: 14, top: 28, height: 220, borderRadius: 28, backgroundColor: color.surface.stack1, transform: [{ rotate: "4deg" }] }} />
      <View style={{ position: "absolute", left: 6, right: 6, top: 18, height: 220, borderRadius: 28, backgroundColor: color.surface.stack2, transform: [{ rotate: "-3deg" }] }} />
      <View pointerEvents="none" style={{ position: "absolute", right: 6, top: -70 }}>
        <FadeIn delay={650} ms={400}><Keeper mood="smug" prop="coin" size={112} /></FadeIn>
      </View>
      <Pop delay={80}>
        <View style={{ transform: [{ rotate: "-1.5deg" }] }}>
          <Surface radius={28} gradient={gradient("card")} shadow={shadowCard} style={{ padding: space[16], gap: space[14] }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[12] }}>
              <Tile icon="dumbbell" size={46} iconSize={24} />
              <View style={{ flex: 1 }}>
                <Text variant="cardName">{t("additions.intro.p1.card")}</Text>
                <Text variant="caption" color={color.text.secondary}>{t("additions.intro.p1.meta")}</Text>
              </View>
            </View>
            <View style={{ gap: 2 }}>
              <Text variant="monoMicro" color={color.text.tertiary}>{t("additions.intro.p1.potLabel").toUpperCase()}</Text>
              <CountText text={t("additions.intro.p1.potValue")} from={reduce ? undefined : t("additions.intro.p1.potZero")} variant="display" color={color.lime.base} />
            </View>
            <View style={{ flexDirection: "row", marginHorizontal: -space[16] + (HERO1.w - 4 * CELL) / 2, justifyContent: "space-between" }}>
              {MEMBERS.map((_, i) => <Member key={i} index={i} />)}
            </View>
          </Surface>
        </View>
      </Pop>
      {/* The coins start from Dev's seat once his day turns, and land on the three who kept. */}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 232, width: HERO1.w, height: 24 }}>
        {reduce ? null : [0, 1, 2].map((i) => <Coin key={i} to={i} delay={MISS_AT + 80 + i * 110} />)}
      </View>
      <View style={{ position: "absolute", left: 0, right: 0, top: 286, alignItems: "center", gap: space[8] }}>
        <Pop delay={reduce ? 0 : MISS_AT + 250}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: color.red.tint16 }}>
            <Icon name="close-circle-outline" size={16} color={color.red.base} />
            <Text variant="chipMd" color={color.red.base}>{t("additions.intro.p1.missChip", { lost: formatSol(lost) })}</Text>
          </View>
        </Pop>
        <Pop delay={reduce ? 0 : MISS_AT + 900}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space[8], paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, backgroundColor: color.lime.tint14 }}>
            <Icon name="sack" size={16} color={color.lime.base} />
            <Text variant="chipMd" color={color.lime.base}>{t("additions.intro.p1.keepChip", { each: formatSol(each) })}</Text>
          </View>
        </Pop>
      </View>
    </View>
  );
}

// ── Page 2: the check ────────────────────────────────────────────────────────────────────────────
export const HERO2 = { w: 340, h: 408 } as const;
const FRAME = { w: HERO2.w, h: 214 } as const;

function Corner({ at }: { at: "tl" | "tr" | "bl" | "br" }) {
  const top = at[0] === "t", left = at[1] === "l";
  return (
    <View pointerEvents="none" style={{
      position: "absolute", width: 26, height: 26, [top ? "top" : "bottom"]: 12, [left ? "left" : "right"]: 12,
      borderColor: color.lime.base, borderTopWidth: top ? 3 : 0, borderBottomWidth: top ? 0 : 3, borderLeftWidth: left ? 3 : 0, borderRightWidth: left ? 0 : 3,
      borderTopLeftRadius: top && left ? 10 : 0, borderTopRightRadius: top && !left ? 10 : 0, borderBottomLeftRadius: !top && left ? 10 : 0, borderBottomRightRadius: !top && !left ? 10 : 0,
    }} />
  );
}

/** The sweeping scan line: three passes, then it rests. */
function ScanLine() {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    p.value = withDelay(250, withRepeat(withSequence(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) })), 2, false));
  }, [reduce]);
  const a = useAnimatedStyle(() => ({ opacity: reduce ? 0 : p.value > 0 ? 1 : 0, transform: [{ translateY: 14 + p.value * (FRAME.h - 40) }] }));
  return (
    <Animated.View onLayout={onLayout} pointerEvents="none" style={[{ position: "absolute", left: 14, right: 14, top: 0, height: 3, borderRadius: 2, backgroundColor: color.lime.base, boxShadow: `0 0 18px 4px ${color.lime.glow22}` }, a]} />
  );
}

function Found({ icon, label, left, top, delay }: { icon: IconName; label: string; left: number; top: number; delay: number }) {
  return (
    <Pop delay={delay} style={{ position: "absolute", left, top }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 12, backgroundColor: color.lime.base }}>
        <Icon name={icon} size={13} color={color.text.onLime} />
        <Text variant="chipMd" color={color.text.onLime}>{label}</Text>
      </View>
    </Pop>
  );
}

function CheckRow({ label, value, delay }: { label: string; value?: string; delay: number }) {
  return (
    <Enter delay={delay}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[10], height: 38, paddingHorizontal: space[12], borderRadius: 14, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline}` }}>
        <Pop delay={delay + 150}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color.lime.base, alignItems: "center", justifyContent: "center" }}>
            <Icon name="check-bold" size={13} color={color.text.onLime} />
          </View>
        </Pop>
        <Text variant="label" color={color.text.secondary} style={{ flex: 1 }}>{label}</Text>
        {value ? <Text variant="rowTitle">{value}</Text> : null}
      </View>
    </Enter>
  );
}

export function CheckHero() {
  const reduce = useReducedMotion();
  const steps: [IconName, string][] = [["dumbbell", t("additions.intro.p2.step0")], ["camera", t("additions.intro.p2.step1")], ["check-bold", t("additions.intro.p2.step2")]];
  return (
    <View style={{ width: HERO2.w, height: HERO2.h, gap: space[12] }} accessible accessibilityLabel={t("additions.intro.p2.a11y")}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {steps.map(([icon, label], i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", flex: i === 2 ? 0 : 1, gap: space[6] }}>
            <Pop delay={60 + i * 90}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: i === 1 ? color.ambient.sky[0]! : color.surface[2] }}>
                <Icon name={icon} size={14} color={i === 1 ? color.sky.base : color.text.secondary} />
                <Text variant="chipMd" color={i === 1 ? color.text.primary : color.text.secondary}>{label}</Text>
              </View>
            </Pop>
            {i < 2 ? <FadeIn delay={140 + i * 90} style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: color.line.strong }}><View /></FadeIn> : null}
          </View>
        ))}
      </View>
      <Pop delay={200}>
        <Surface radius={30} bg={color.surface.sunken} shadow={`inset 0 0 0 1px ${color.line.hairline3}`} clip style={{ width: FRAME.w, height: FRAME.h }}>
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space[24] }}>
            <Icon name="dumbbell" size={92} color={color.text.tertiary} />
            <View style={{ marginTop: -28 }}><Icon name="thumb-up" size={58} color={color.text.tertiary} /></View>
          </View>
          <Corner at="tl" /><Corner at="tr" /><Corner at="bl" /><Corner at="br" />
          <ScanLine />
          <Found icon="dumbbell" label={t("additions.intro.p2.objectValue")} left={56} top={24} delay={reduce ? 0 : 1000} />
          <Found icon="thumb-up" label={t("additions.intro.p2.gestureValue")} left={186} top={122} delay={reduce ? 0 : 1500} />
          <Pop delay={reduce ? 0 : 2700} style={{ position: "absolute", bottom: 12, alignSelf: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: color.surface[3], boxShadow: `inset 0 0 0 1px ${color.line.strong}` }}>
              <Icon name="lock-outline" size={13} color={color.lime.base} />
              <Text variant="chipMd">{t("additions.intro.p2.chip")}</Text>
            </View>
          </Pop>
        </Surface>
      </Pop>
      <View style={{ gap: space[6] }}>
        <CheckRow label={t("additions.intro.p2.object")} value={t("additions.intro.p2.objectValue")} delay={reduce ? 0 : 1250} />
        <CheckRow label={t("additions.intro.p2.gesture")} value={t("additions.intro.p2.gestureValue")} delay={reduce ? 0 : 1750} />
        <CheckRow label={t("additions.intro.p2.real")} delay={reduce ? 0 : 2250} />
      </View>
      <FadeIn delay={reduce ? 0 : 2900}>
        <Text variant="caption" color={color.text.tertiary} align="center">{t("additions.intro.p2.foot")}</Text>
      </FadeIn>
    </View>
  );
}

// ── Page 3: the chart ────────────────────────────────────────────────────────────────────────────
export const HERO3 = { w: 340, h: 372 } as const;
const PLOT = { w: HERO3.w, h: 176 } as const;
/** The line takes this long to draw, ease-out like the rest of the app's reveals. */
const DRAW_MS = 1900;
const DRAW_AT = 350;
const drawEase = Easing.out(Easing.cubic);
/** When the line, drawn ease-out, has reached `frac` of its length. */
const reachedAt = (frac: number) => DRAW_AT + DRAW_MS * (1 - Math.pow(1 - Math.min(1, Math.max(0, frac)), 1 / 3));

function Stat({ value, label, delay, tone, wide }: { value: string; label: string; delay: number; tone?: string; wide?: boolean }) {
  return (
    <Enter delay={delay} style={{ flex: wide ? 1.25 : 1 }}>
      <View style={{ paddingVertical: space[12], paddingHorizontal: space[10], borderRadius: 18, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline}`, gap: 2 }}>
        <CountText text={value} from={value.replace(/\d+/g, "0")} variant="titleSm" color={tone ?? color.text.primary} />
        <Text variant="caption" color={color.text.secondary}>{label}</Text>
      </View>
    </Enter>
  );
}

export function ProgressHero() {
  const reduce = useReducedMotion();
  const series = useMemo(() => keptSeries(), []);
  const sum = useMemo(() => sampleSummary(), []);
  const geo = useMemo(() => chartGeometry(series, PLOT.w, PLOT.h, 14), [series]);
  const draw = useSharedValue(reduce ? 1 : 0);
  const fill = useSharedValue(reduce ? 1 : 0);
  const onLayout = useAnimationLifecycle([draw, fill], () => {
    if (reduce) return;
    draw.value = withDelay(DRAW_AT, withTiming(1, { duration: DRAW_MS, easing: drawEase }));
    fill.value = withDelay(DRAW_AT, withTiming(1, { duration: 700, easing: easing("enter") }));
  }, [reduce]);
  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(haptic.success, DRAW_AT + DRAW_MS);
    return () => clearTimeout(id);
  }, [reduce]);
  // The area under the line is uncovered left to right with the line, so it never runs ahead of it.
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value, width: PLOT.w * draw.value }));
  const slips = geo.xy.map((p, i) => ({ ...p, i })).filter((p) => p.slip);
  const last = geo.xy[geo.xy.length - 1]!;
  return (
    <View style={{ width: HERO3.w, height: HERO3.h, gap: space[12] }} accessible accessibilityLabel={t("additions.intro.p3.a11y", { rate: sum.rate ?? 0 })}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="monoLabel" color={color.text.tertiary}>{t("additions.intro.p3.chart").toUpperCase()}</Text>
        <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 11, backgroundColor: color.violet.tint20 }}>
          <Text variant="monoMicro" color={color.violet.base}>{t("additions.intro.p3.tagLabel").toUpperCase()}</Text>
        </View>
      </View>
      <View onLayout={onLayout} style={{ width: PLOT.w, height: PLOT.h }}>
        {[0.25, 0.5, 0.75].map((f) => <View key={f} style={{ position: "absolute", left: 0, right: 0, top: PLOT.h * f, height: 1, backgroundColor: color.line.hairline2 }} />)}
        <Animated.View style={[{ position: "absolute", left: 0, top: 0, height: PLOT.h, overflow: "hidden" }, fillStyle]}>
          <Canvas style={{ width: PLOT.w, height: PLOT.h }}>
            <SkPath path={geo.area} style="fill">
              <SkGradient start={vec(0, 0)} end={vec(0, PLOT.h)} colors={[color.lime.tint20, color.extra.transparent]} />
            </SkPath>
          </Canvas>
        </Animated.View>
        <Canvas style={{ position: "absolute", left: 0, top: 0, width: PLOT.w, height: PLOT.h }}>
          <SkPath path={geo.line} style="stroke" strokeWidth={12} strokeJoin="round" strokeCap="round" color={color.lime.glow22} start={0} end={draw} />
          <SkPath path={geo.line} style="stroke" strokeWidth={4} strokeJoin="round" strokeCap="round" color={color.lime.base} start={0} end={draw} />
        </Canvas>
        {slips.map((s) => (
          <Pop key={s.i} delay={reduce ? 0 : reachedAt(s.i / (series.length - 1))} style={{ position: "absolute", left: s.x - 7, top: s.y - 7 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color.orange.base, borderWidth: 3, borderColor: color.bg.app }} />
          </Pop>
        ))}
        {slips.slice(0, 1).map((s) => (
          <FadeIn key={`tag${s.i}`} delay={reduce ? 0 : reachedAt(s.i / (series.length - 1)) + 150} style={{ position: "absolute", left: Math.max(0, s.x - 26), top: s.y + 14 }}>
            <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 10, backgroundColor: color.orange.tint16 }}>
              <Text variant="monoMicro" color={color.orange.base}>{t("additions.intro.p3.slip").toUpperCase()}</Text>
            </View>
          </FadeIn>
        ))}
        <Pop delay={reduce ? 0 : DRAW_AT + DRAW_MS} style={{ position: "absolute", left: last.x - 9, top: last.y - 9 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color.lime.base, borderWidth: 4, borderColor: color.bg.app, boxShadow: `0 0 16px ${color.lime.glow22}` }} />
        </Pop>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: -space[4] }}>
        <Text variant="monoMicro" color={color.text.tertiary}>{t("additions.intro.p3.day", { n: 1 })}</Text>
        <Text variant="monoMicro" color={color.text.tertiary}>{t("additions.intro.p3.day", { n: series.length })}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: space[8] }}>
        <Stat wide value={t("additions.intro.p3.stat0", { kept: sum.kept, days: sum.days })} label={t("additions.intro.p3.stat0Label")} delay={reduce ? 0 : DRAW_AT + DRAW_MS - 200} />
        <Stat value={t("additions.intro.p3.stat1", { rate: sum.rate ?? 0 })} label={t("additions.intro.p3.stat1Label")} delay={reduce ? 0 : DRAW_AT + DRAW_MS - 80} tone={color.lime.base} />
        <Stat value={t("additions.intro.p3.stat2", { hp: sum.hp })} label={t("additions.intro.p3.stat2Label")} delay={reduce ? 0 : DRAW_AT + DRAW_MS + 40} />
      </View>
      <FadeIn delay={reduce ? 0 : DRAW_AT + DRAW_MS + 300}>
        <Text variant="caption" color={color.text.tertiary} align="center">{t("additions.intro.p3.foot")}</Text>
      </FadeIn>
    </View>
  );
}
