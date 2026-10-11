// The app theme, derived from design/tokens.json (tokens.gen.ts). Components read values from here
// only; they never contain colour, size, radius or duration literals.
import type { TextStyle } from "react-native";
import { Easing } from "react-native-reanimated";
import { tokens } from "./tokens.gen";
import { supplement } from "./supplement";

export { tokens };
export { metrics } from "./metrics";
export { keeperRig } from "./keeperRig";
/**
 * Owner-approved token amendments (DECISIONS › Token amendments): design/tokens.json is read-only, so a
 * changed value is applied here, over the generated tokens, for components and type styles alike.
 */
const palette = { ...tokens.color, text: { ...tokens.color.text, ...supplement.amend.text } };
export const color = { ...palette, extra: supplement.color };
export const space = tokens.space;
export const radius = tokens.radius;
export const z = tokens.z;
export const duration = tokens.motion.duration;
export const stagger = tokens.motion.stagger;

// ── Fonts ────────────────────────────────────────────────────────────────────────────────────────
// Names exported by @expo-google-fonts/geist and /geist-mono (loaded in src/theme/fonts.ts).
const SANS: Record<number, string> = {
  400: "Geist_400Regular", 500: "Geist_500Medium", 600: "Geist_600SemiBold",
  700: "Geist_700Bold", 800: "Geist_800ExtraBold", 900: "Geist_900Black",
};
const MONO: Record<number, string> = { 500: "GeistMono_500Medium", 600: "GeistMono_600SemiBold" };

export function fontFamily(family: "sans" | "mono", weight: number): string {
  const table = family === "mono" ? MONO : SANS;
  const name = table[weight];
  if (!name) throw new Error(`No ${family} font loaded for weight ${weight}`);
  return name;
}

// ── Typography ───────────────────────────────────────────────────────────────────────────────────
type TypeToken = (typeof tokens.type)[keyof typeof tokens.type];
export type TypeName = keyof typeof tokens.type;
/** Default sans letter-spacing (DESIGN.md §3). */
const DEFAULT_TRACKING = -0.2;

function resolveColor(path: string): string {
  const v = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], palette);
  if (typeof v !== "string") throw new Error(`Unknown colour token ${path}`);
  return v;
}

function toTextStyle(t: TypeToken): TextStyle {
  const s: TextStyle = {
    fontFamily: fontFamily(t.family, t.weight),
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: "letterSpacing" in t ? t.letterSpacing : DEFAULT_TRACKING,
    color: "color" in t ? resolveColor(t.color) : tokens.color.text.primary,
    includeFontPadding: false,
  };
  if ("tabular" in t && t.tabular) s.fontVariant = ["tabular-nums"];
  if ("case" in t && t.case === "upper") s.textTransform = "uppercase";
  return s;
}

export const type = Object.fromEntries(
  Object.entries(tokens.type).map(([k, v]) => [k, toTextStyle(v as TypeToken)]),
) as Record<TypeName, TextStyle>;

// ── Gradients ────────────────────────────────────────────────────────────────────────────────────
export interface GradientProps {
  colors: readonly [string, string, ...string[]];
  locations?: readonly [number, number, ...number[]];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/** CSS linear-gradient angle (0deg = to top, clockwise) → expo-linear-gradient start/end. */
export function angleToPoints(deg: number) {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { start: { x: r(0.5 - dx), y: r(0.5 - dy) }, end: { x: r(0.5 + dx), y: r(0.5 + dy) } };
}

export function linear(deg: number, colors: readonly string[], locations?: readonly number[]): GradientProps {
  if (colors.length < 2) throw new Error("a gradient needs at least two colours");
  const g: GradientProps = { colors: colors as GradientProps["colors"], ...angleToPoints(deg) };
  if (locations) g.locations = locations as GradientProps["locations"];
  return g;
}

type LinearToken = { angle: number; stops: readonly (readonly [string, number])[] };
/** A named linear gradient from tokens.gradient. */
export function gradient(name: "card" | "cardSheen" | "buttonPrimary" | "buttonLime" | "moneyPill" | "brandTile" | "tabFade" | "shine"): GradientProps {
  const g = tokens.gradient[name] as unknown as LinearToken;
  return linear(g.angle, g.stops.map((s) => s[0]), g.stops.map((s) => s[1]));
}

export type PaletteName = keyof Omit<typeof tokens.color.tilePalette, "$doc">;
/** 150° tile gradient + ink for an object/icon tile (DESIGN.md §2.6). */
export function tile(p: PaletteName) {
  const [a, b, ink] = tokens.color.tilePalette[p];
  return { gradient: linear(150, [a, b]), ink };
}
/** Palette for an MDI icon name (color.objectTile), white when unmapped. */
export function tileForIcon(icon: string) {
  const map = tokens.color.objectTile as Record<string, PaletteName | undefined>;
  return tile(map[icon] ?? "white");
}
export type HeroPaletteName = keyof Omit<typeof tokens.color.heroCardPalette, "$doc">;
export function heroCard(p: HeroPaletteName) {
  const [a, b, fg] = tokens.color.heroCardPalette[p];
  return { gradient: linear(155, [a, b]), fg };
}
export function banner(i: 0 | 1 | 2 | 3 | 4) {
  return linear(135, tokens.color.banner[i]);
}

// ── Shadows ──────────────────────────────────────────────────────────────────────────────────────
// RN 0.76+ (New Architecture) renders CSS box-shadow strings, including `inset`, on Android.
// D-84: Android draws a blurred outer shadow with a BlurMaskFilter on every frame that anything on screen
// moves; on Today that more than doubled the frame time (16 → 38 ms, emulator). Black blurred drop shadows
// barely show on the near-black background, so they're left out; insets, rings (no blur) and coloured
// glows (the lime ones) stay.
type ShadowName = keyof typeof tokens.shadow;
const LAYERS = /,(?![^(]*\))/;
const BLACK = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,|#000(?:000)?\b|\bblack\b/i;
/** A box-shadow list without its black blurred outer layers (D-84). */
export function cheapShadow(css: string): string {
  return css.split(LAYERS).map((l) => l.trim()).filter((l) => {
    if (!l || l.startsWith("inset") || !BLACK.test(l)) return !!l;
    const lengths = l.replace(/rgba?\([^)]*\)|#[0-9a-f]+|\b[a-z]+\b/gi, " ").trim().split(/\s+/).map(parseFloat);
    return !(lengths[2]! > 0);
  }).join(", ");
}
export const shadow = (name: ShadowName) => ({ boxShadow: cheapShadow(tokens.shadow[name].css) });

/** Splits a CSS box-shadow list into outer and inset layers (commas inside rgba() are kept). */
export function splitShadow(css: string): { outer: string | undefined; inset: string | undefined } {
  const layers = css.split(/,(?![^(]*\))/).map((l) => l.trim()).filter(Boolean);
  const inset = layers.filter((l) => l.startsWith("inset"));
  const outer = layers.filter((l) => !l.startsWith("inset"));
  return { outer: outer.length ? outer.join(", ") : undefined, inset: inset.length ? inset.join(", ") : undefined };
}

// ── HP colour (DESIGN.md §2.7) ───────────────────────────────────────────────────────────────────
export function hpSegmentColor(i: number, hp: number, empty: string): string {
  const filled = hp / 5;
  if (i >= filled) return empty;
  if (hp <= tokens.color.hp.thresholds.dangerAtOrBelow) return tokens.color.hp.danger;
  if (hp <= tokens.color.hp.thresholds.warnAtOrBelow) return tokens.color.hp.warn;
  const t = i / 19;
  return `rgb(${Math.round(94 + 103 * t)},${Math.round(234 + 8 * t)},${Math.round(212 - 120 * t)})`;
}

// ── Motion ───────────────────────────────────────────────────────────────────────────────────────
export type EasingName = Exclude<keyof typeof tokens.motion.easing, "inOut" | "linear">;
export function easing(name: EasingName) {
  const [a, b, c, d] = tokens.motion.easing[name];
  return Easing.bezier(a, b, c, d);
}

/**
 * react-native-svg on Android drops the alpha of an rgba() stopColor, so a .2 orb would draw opaque.
 * Split it into an rgb colour and a stopOpacity (scaled by `k` for the fading stop).
 */
export function svgStop(c: string, k = 1): { stopColor: string; stopOpacity: number } {
  const m = c.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  return m ? { stopColor: `rgb(${m[1]},${m[2]},${m[3]})`, stopOpacity: Number(m[4]) * k } : { stopColor: c, stopOpacity: k };
}
