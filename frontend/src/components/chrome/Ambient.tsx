// The light behind a screen (DESIGN.md §2.8–2.9): a full-screen tone wash, two blurred orbs drifting
// in the screen's ambient colour, an optional beam from the top, and huge decor icons. Drawn under the
// content, never touchable. Which of these a screen gets comes from app/layout.gen.json.

import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, FeGaussianBlur, Filter, LinearGradient, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { color, duration, metrics, svgStop as stop } from "@/theme";
import { Icon, LOOP_BUDGET_MS, loopCycles, useAnimationLifecycle } from "../primitives";
import type { IconName } from "../primitives";

type Tone = "lime" | "red" | "ember" | "grey" | "lock";
type AmbientColor = "lime" | "red" | "ember" | "vio" | "sky";
interface AmbientProps { tone?: Tone | null; ambient?: AmbientColor | null; beam?: boolean; decor?: readonly string[] }

const A = metrics.ambient;

const wash = color.extra.toneWash;

function ToneWash({ tone, w, h }: { tone: Tone; w: number; h: number }) {
  if (tone === "grey") return <View style={[StyleSheet.absoluteFill, { backgroundColor: wash.grey }]} />;
  if (tone === "lock") {
    return (
      <Svg style={StyleSheet.absoluteFill} width={w} height={h}>
        <Defs><LinearGradient id="lock" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color.bg.lock[0]} /><Stop offset="1" stopColor={color.bg.lock[1]} />
        </LinearGradient></Defs>
        <Rect width={w} height={h} fill="url(#lock)" />
      </Svg>
    );
  }
  // CSS `radial-gradient(ellipse at 50% 0%, …)`: farthest-corner ellipse from the top (or bottom) centre.
  const [c, end] = wash[tone];
  const bottom = tone === "ember";
  return (
    <Svg style={StyleSheet.absoluteFill} width={w} height={h}>
      <Defs><RadialGradient id="wash" gradientUnits="userSpaceOnUse" cx={w / 2} cy={bottom ? h : 0} rx={(w / 2) * Math.SQRT2} ry={h * Math.SQRT2} fx={w / 2} fy={bottom ? h : 0}>
        <Stop offset="0" {...stop(c)} /><Stop offset={String(end)} {...stop(c, 0)} />
      </RadialGradient></Defs>
      {bottom ? <Rect width={w} height={h} fill={wash.emberBase} /> : null}
      <Rect width={w} height={h} fill="url(#wash)" />
    </Svg>
  );
}

/**
 * One orb: a `closest-side` radial to transparent, drifting (translate 40/30, scale 1.18). Its cycle
 * (16–19 s, the second offset by 6 s) is longer than LOOP_BUDGET_MS, so each focus plays one slow drift
 * that ends inside the budget and the orb rests there (D-84).
 */
function Orb({ size, c, ms, delayMs, reverse, style }: { size: number; c: string; ms: number; delayMs: number; reverse?: boolean; style: object }) {
  const reduce = useReducedMotion();
  const p = useSharedValue(reverse ? 1 : 0);
  const onLayout = useAnimationLifecycle([p], () => {
    if (reduce) return;
    const wait = Math.min(delayMs, LOOP_BUDGET_MS / 4);
    const to = p.get() > 0.5 ? 0 : 1; // drift the other way each time
    p.set(withDelay(wait, withTiming(to, { duration: Math.min(ms / 2, LOOP_BUDGET_MS - wait), easing: Easing.inOut(Easing.ease) })));
  }, [reduce, ms, delayMs, reverse], { pauseOnBlur: true });
  const a = useAnimatedStyle(() => ({
    transform: [{ translateX: A.drift.dx * p.value }, { translateY: A.drift.dy * p.value }, { scale: 1 + (A.drift.scale - 1) * p.value }],
  }));
  return (
    <Animated.View onLayout={onLayout} style={[{ position: "absolute", width: size, height: size }, style, a]}>
      <Svg width={size} height={size}>
        <Defs><RadialGradient id="orb" cx="50%" cy="50%" r="50%">
          <Stop offset="0" {...stop(c)} /><Stop offset="1" {...stop(c, 0)} />
        </RadialGradient></Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#orb)" />
      </Svg>
    </Animated.View>
  );
}

function Beam({ w }: { w: number }) {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  const onLayout = useAnimationLifecycle([o], () => {
    if (reduce) return;
    const half = { duration: duration.beam / 2 };
    o.set(withRepeat(withSequence(withTiming(A.beam.opacityMin, half), withTiming(1, half)), loopCycles(duration.beam)));
  }, [reduce], { pauseOnBlur: true });
  const a = useAnimatedStyle(() => ({ opacity: o.value }));
  const b = A.beam;
  const pad = b.blur * 3; // room for the blur inside the canvas
  const cw = b.width + pad * 2;
  const pts = `${pad + b.width * b.clipL},${pad} ${pad + b.width * b.clipR},${pad} ${pad + b.width},${pad + b.height} ${pad},${pad + b.height}`;
  return (
    <>
      <Animated.View onLayout={onLayout} style={[{ position: "absolute", left: w / 2 - cw / 2, top: b.top - pad, width: cw, height: b.height + pad * 2 }, a]}>
        <Svg width={cw} height={b.height + pad * 2}>
          <Defs>
            <LinearGradient id="beam" x1="0" y1={pad} x2="0" y2={pad + b.height} gradientUnits="userSpaceOnUse">
              {color.extra.beam.map(([c, op, at]) => <Stop key={at} offset={String(at)} stopColor={c} stopOpacity={op} />)}
            </LinearGradient>
            <Filter id="soft" x="-20%" y="-5%" width="140%" height="110%"><FeGaussianBlur stdDeviation={b.blur / 2} /></Filter>
          </Defs>
          <Polygon points={pts} fill="url(#beam)" filter="url(#soft)" />
        </Svg>
      </Animated.View>
      <Svg style={{ position: "absolute", left: w / 2 - b.barW / 2 - b.glow, top: b.barTop - b.glow }} width={b.barW + b.glow * 2} height={b.barH + b.glow * 2}>
        <Defs><RadialGradient id="glow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0.3" {...stop(color.extra.beamGlow)} /><Stop offset="1" {...stop(color.extra.beamGlow, 0)} />
        </RadialGradient></Defs>
        <Ellipse cx={b.barW / 2 + b.glow} cy={b.barH / 2 + b.glow} rx={b.barW / 2 + b.glow} ry={b.barH / 2 + b.glow} fill="url(#glow)" />
        <Rect x={b.glow} y={b.glow} width={b.barW} height={b.barH} rx={b.barH / 2} fill={color.extra.beamBar} />
      </Svg>
    </>
  );
}

/** Decor icons: icon k takes the positions j with j % 2 === k % 2, at most three in all (renderer). */
function decorItems(icons: readonly string[]) {
  return icons.flatMap((ic, k) => metrics.decor.filter((_, j) => j % 2 === k % 2).map((d) => ({ ...d, ic }))).slice(0, metrics.decor.length);
}

export function Ambient({ tone, ambient, beam, decor = [] }: AmbientProps) {
  const { width: w, height: h } = useWindowDimensions();
  const orbs = ambient ? color.ambient[ambient] : null;
  const low = ambient === "ember";
  if (!tone && !orbs && !beam && !decor.length) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      {tone ? <ToneWash tone={tone} w={w} h={h} /> : null}
      {decorItems(decor).map((d, i) => (
        <View key={i} style={{ position: "absolute", left: d.x, top: d.y, transform: [{ rotate: `${d.r}deg` }] }}>
          <Icon name={d.ic as IconName} size={d.s} color={color.extra.decor} />
        </View>
      ))}
      {orbs ? <>
        <Orb size={A.orbA.size} c={orbs[0]!} ms={duration.drift} delayMs={0} style={{ left: A.orbA.left, top: low ? A.orbA.topLow : A.orbA.top }} />
        <Orb size={A.orbB.size} c={orbs[1]!} ms={A.orbB.ms} delayMs={A.orbB.offsetMs} reverse style={{ right: A.orbB.right, top: low ? A.orbB.topLow : A.orbB.top }} />
      </> : null}
      {beam ? <Beam w={w} /> : null}
    </View>
  );
}
