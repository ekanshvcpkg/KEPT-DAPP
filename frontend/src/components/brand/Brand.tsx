import { useEffect } from "react";
import { View } from "react-native";
import { useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { Canvas, Group, Path } from "@shopify/react-native-skia";
import { t } from "@/copy";
import { color, duration, easing, fontFamily, gradient, metrics, space } from "@/theme";
import { haptic } from "@/lib/haptics";
import { CheckK, FadeIn, Pop, Surface, Text, useAnimationLifecycle } from "../primitives";
import Constants from "expo-constants";
import { env } from "@/config/env";

/** motion.md §1 splash timeline (ms). */
const SPLASH = { check: 350, stem: 600, leg: 750, word: 900, tagline: 1050, inMs: 250, textMs: 400 };

/**
 * The ink Check-K drawn in: check stroke `draw` 320 ms, then the stem and leg fade in (motion.md §1). Skia
 * (motion rework): the check is the stroke trimmed to `draw` of its length, the same reveal as the
 * prototype's SVG dash offset, without animating SVG props.
 */
function CheckKReveal({ size }: { size: number }) {
  const reduce = useReducedMotion();
  const draw = useSharedValue(reduce ? 1 : 0);
  const stem = useSharedValue(reduce ? 1 : 0);
  const leg = useSharedValue(reduce ? 1 : 0);
  const onLayout = useAnimationLifecycle([draw, stem, leg], () => {
    if (reduce) return;
    const ease = easing("enter");
    draw.set(withDelay(SPLASH.check, withTiming(1, { duration: duration.drawCheck, easing: ease })));
    stem.set(withDelay(SPLASH.stem, withTiming(1, { duration: SPLASH.inMs, easing: ease })));
    leg.set(withDelay(SPLASH.leg, withTiming(1, { duration: SPLASH.inMs, easing: ease })));
  }, [reduce]);
  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(haptic.light, SPLASH.check);
    return () => clearTimeout(id);
  }, [reduce]);
  const ink = color.text.onLime;
  return (
    <View onLayout={onLayout} style={{ width: size, height: size }} accessible={false}>
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale: size / 100 }]}>
          <Path path="M54 45L78 76" color={ink} style="stroke" strokeWidth={15} strokeCap="round" opacity={leg} />
          <Path path="M23 44L40 60L78 24" color={ink} style="stroke" strokeWidth={15} strokeCap="round" strokeJoin="round" start={0} end={draw} />
          <Path path="M23 24V76" color={ink} style="stroke" strokeWidth={15} strokeCap="round" opacity={stem} />
        </Group>
      </Canvas>
    </View>
  );
}

/** Splash: 112 lime tile + ink Check-K 90, "KEPT" wordmark, tagline (A0), revealed per motion.md §1. */
export function BrandSplash() {
  const b = metrics.brand;
  return (
    <View style={{ alignItems: "center", gap: space[18] }} accessibilityRole="header" accessibilityLabel={`${t("common.brand")}. ${t("common.tagline")}`}>
      <Pop ms={duration.splashTile}>
        <Surface radius={b.splashRadius} gradient={gradient("brandTile")} shadow={`inset 0 1.5px 0 rgba(255,255,255,0.6), inset 0 -6px 0 rgba(0,0,0,0.14), 0 24px 60px ${color.lime.glow22}`} style={{ width: b.splashTile, height: b.splashTile, alignItems: "center", justifyContent: "center" }}>
          <CheckKReveal size={b.splashMark} />
        </Surface>
      </Pop>
      <FadeIn delay={SPLASH.word} ms={SPLASH.textMs}><Text variant="wordmark">{t("common.brand")}</Text></FadeIn>
      <FadeIn delay={SPLASH.tagline} ms={SPLASH.textMs}><Text variant="label" color={color.text.secondary} style={{ fontSize: 15 }}>{t("common.tagline")}</Text></FadeIn>
    </View>
  );
}

/** Word: Check-K 32 overlapping "EPT" (top of A1). */
export function BrandWord() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }} accessible accessibilityLabel={t("common.brand")}>
      <View style={{ marginLeft: -5, marginRight: -3 }}><CheckK size={metrics.brand.word} /></View>
      <Text variant="wordmarkSm">{t("common.brand").slice(1)}</Text>
    </View>
  );
}

/** Stamp: "KEPT · VERIFIED · DAY 3 · 9:41" pill at the bottom of F5, L1, L2, L6, H5, J1·ok. */
export function BrandStamp({ text }: { text: string }) {
  const b = metrics.brand;
  return (
    <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: space[8], paddingVertical: 7, paddingLeft: 7, paddingRight: 12, borderRadius: 15, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline2}` }}>
      <View style={{ width: b.stampTile, height: b.stampTile, borderRadius: 7, backgroundColor: color.lime.base, alignItems: "center", justifyContent: "center" }}><CheckK size={b.stampMark} variant="ink" stroke={17} /></View>
      <Text variant="chipMd" style={{ fontFamily: fontFamily("sans", 900), letterSpacing: -0.3 }}>{t("common.brand")}</Text>
      <Text variant="monoMicro" color={color.text.secondary}>{text}</Text>
    </View>
  );
}

/** Lockup: footer of I4 (tile, name, tagline, version). */
export function BrandLockup() {
  const b = metrics.brand;
  return (
    <View style={{ alignItems: "center", gap: space[8], paddingTop: space[18], paddingBottom: space[4] }}>
      <View style={{ width: b.lockTile, height: b.lockTile, borderRadius: b.lockRadius, backgroundColor: color.lime.base, alignItems: "center", justifyContent: "center", boxShadow: "inset 0 -3px 0 rgba(0,0,0,0.14)" }}><CheckK size={b.lockMark} variant="ink" /></View>
      <Text variant="rowTitle" style={{ fontFamily: fontFamily("sans", 900), letterSpacing: -0.4 }}>{t("common.brand")}</Text>
      <Text variant="caption" color={color.text.tertiary}>{t("common.tagline")}</Text>
      <Text variant="monoMicro" color={color.text.quaternary}>{t("common.version", { version: Constants.expoConfig?.version ?? "", cluster: env.cluster.toUpperCase() })}</Text>
    </View>
  );
}
