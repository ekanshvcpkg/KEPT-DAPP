import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from "react-native-svg";
import type { KeeperMood } from "@/copy";
import { t } from "@/copy";
import { cheapShadow, color, metrics, shadow, space, svgStop, tile } from "@/theme";
import type { PaletteName } from "@/theme";
import { Bubble, CheckK, Icon, Knock, Loop, NoteDrop, PressScale, Text } from "../primitives";
import { Chip } from "../content/Basics";
import { useHeightScale } from "@/lib/screenScale";
import type { ChipTone } from "../content/Basics";
import type { IconName } from "../primitives";
import { Keeper } from "./Keeper";
import type { KeeperAnim, KeeperProp } from "./Keeper";

/** A soft radial glow (closest-side to transparent), used for mood glows and ambient orbs. */
function RadialGlow({ size, colour, id }: { size: number; colour: string; id: string }) {
  return (
    <Svg width={size} height={size} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" {...svgStop(colour)} />
          <Stop offset="1" {...svgStop(colour, 0)} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The Keeper's floor shadow: an ellipse blurred by 9 dp, drawn as a radial gradient (D-84) — a `blur`
 * filter is a GPU blur pass on every frame anything on screen moves.
 */
function FloorShadow({ left, top, width, height }: { left: number; top: number; width: number; height: number }) {
  const b = metrics.keeperPlacement.shadowBlur;
  const w = width + b * 2, h = height + b * 2;
  return (
    <Svg pointerEvents="none" width={w} height={h} style={{ position: "absolute", left: left - b, top: top - b }}>
      <Defs>
        <RadialGradient id="kfloor" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0.35" {...svgStop(color.extra.keeperShadow)} />
          <Stop offset="1" {...svgStop(color.extra.keeperShadow, 0)} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="url(#kfloor)" />
    </Svg>
  );
}

/** A floating 3D tile or coin around a big Keeper (renderer › kpx orbs). */
export interface KeeperOrb { icon: string; x: number; y: number; size: number; palette: string; rotate: number; coin: boolean }
/** A chip floating around a big Keeper: position from the design, text from the screen. */
export interface KeeperChip { text: string; icon: IconName; x: number; y: number; tilt?: number; tone?: ChipTone }

const PROTO_TONE: Record<string, ChipTone> = { l: "lime", lime: "lime", r: "red", red: "red", vio: "vio", o: "ora", ora: "ora", grey: "grey", g: "g", d: "dark", w: "white" };
export const chipTone = (code: string | undefined): ChipTone => PROTO_TONE[code ?? "g"] ?? "g";

function Orb({ o, i, sx }: { o: KeeperOrb; i: number; sx: number }) {
  const p = tile((o.palette in color.tilePalette ? o.palette : "white") as PaletteName);
  const [a, b] = p.gradient.colors;
  const r = o.coin ? o.size / 2 : Math.round(o.size * 0.28);
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: Math.round(o.x * sx), top: o.y }}>
      <Loop kind="float" period={(5 + (i % 3)) * 1000} delay={i * 600}>
        <View style={{
          width: o.size, height: o.size, borderRadius: r, overflow: "hidden", alignItems: "center", justifyContent: "center", transform: [{ rotate: `${o.rotate}deg` }],
          boxShadow: cheapShadow(o.coin ? `inset 0 2px 0 ${color.extra.tileHi60}, inset 0 0 0 3px ${color.extra.tileHi18}, 0 5px 0 ${color.extra.coinDrop}, 0 16px 26px ${color.extra.orbShadow}`
            : `inset 0 2px 0 ${color.extra.tileHi60}, inset 0 -4px 0 ${color.extra.tileShade18}, 0 14px 28px ${color.extra.orbShadow}`),
        }}>
          <Svg width={o.size} height={o.size} style={{ position: "absolute" }}>
            <Defs>
              {o.coin ? (
                <RadialGradient id={`orb${i}`} cx="35%" cy="30%" r="62%"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></RadialGradient>
              ) : (
                <RadialGradient id={`orb${i}`} cx="0%" cy="0%" r="140%"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></RadialGradient>
              )}
            </Defs>
            <Rect width={o.size} height={o.size} fill={`url(#orb${i})`} />
          </Svg>
          <Icon name={o.icon as IconName} size={Math.round(o.size * 0.5)} color={p.ink} />
        </View>
      </Loop>
    </View>
  );
}

// ── KeeperPlacement (`kp`) ── big in-content Keeper with floor shadow, mood glow, speech bubble, chips, orbs.
export interface KeeperPlacementProps {
  mood: KeeperMood;
  line?: string;
  /** Tap cycles through these lines; the bubble shows "k/n ›". */
  lines?: string[];
  prop?: KeeperProp;
  anim?: KeeperAnim;
  size?: number;
  side?: "l" | "r" | "c";
  height?: number;
  chips?: KeeperChip[];
  orbs?: KeeperOrb[];
}

export function KeeperPlacement({ mood, line, lines, prop = "none", anim = "idle", size: designSize = metrics.keeperPlacement.defaultSize, side = "l", height: designHeight, chips = [], orbs = [] }: KeeperPlacementProps) {
  // Shorter phones: the hero shrinks with the screen height, its spots move with it (x follows the width).
  const sy = useHeightScale();
  const size = Math.round(designSize * sy);
  const height = designHeight === undefined ? undefined : Math.round(designHeight * sy);
  const [i, setI] = useState(0);
  // The design's spots are in its 350 dp column; narrower phones (360 dp wide → 320) scale x to fit.
  const [W, setW] = useState<number>(metrics.contentWidth);
  const sx = W / metrics.contentWidth;
  const kh = Math.round(size * 1.14);
  const h = height ?? kh + 12;
  const ky = h - kh - 2;
  const kx = side === "l" ? 0 : side === "r" ? W - size : Math.round((W - size) / 2);
  const shown = lines?.length ? lines[i % lines.length] : line;
  const gs = Math.round(size * 1.55);
  const glow = color.keeperGlow[mood];
  const right = side === "r";
  // The bubble's square (tail) corner points at the Keeper: a centred Keeper's bubble sits to his left.
  const tailRight = side !== "l";
  const cycle = lines && lines.length > 1;
  const poseAnim: KeeperAnim = i ? (["point", "wave", "thumbs", "shrug"] as const)[i % 4]! : anim;
  const kp = metrics.keeperPlacement;
  return (
    <View style={{ height: h, position: "relative" }} onLayout={(e) => { const w = Math.round(e.nativeEvent.layout.width); if (w && w !== W) setW(w); }}>
      <View pointerEvents="none" style={{ position: "absolute", left: Math.round(kx + size / 2 - gs / 2), top: Math.round(ky + size * 0.55 - gs / 2) }}>
        <RadialGlow size={gs} colour={glow} id={`kglow-${mood}`} />
      </View>
      {orbs.map((o, k) => <Orb key={k} o={{ ...o, y: Math.round(o.y * sy), size: Math.round(o.size * sy) }} i={k} sx={sx} />)}
      <FloorShadow left={Math.round(kx + size * 0.15)} top={h - kp.shadowH} width={Math.round(size * 0.7)} height={kp.shadowH} />
      <Pressable
        onPress={cycle ? () => setI((n) => n + 1) : undefined}
        disabled={!cycle}
        accessibilityRole={cycle ? "button" : "image"}
        accessibilityLabel={`${t("additions.a11y.keeper")}: ${shown ?? ""}`}
        style={{ position: "absolute", left: kx, top: ky }}
      >
        <Keeper mood={mood} prop={prop} anim={poseAnim} size={size} />
      </Pressable>
      {chips.map((c, k) => (
        <View key={`${c.text}${k}`} pointerEvents="none" style={{ position: "absolute", left: Math.round(c.x * sx), top: Math.round(c.y * sy), zIndex: 4 }}>
          <Loop kind="float" period={metrics.keeperPlacement.chipFloatMs} delay={k * 700}>
            <Chip text={c.text} icon={c.icon} {...(c.tone ? { tone: c.tone } : {})} tilt={c.tilt ?? 0} />
          </Loop>
        </View>
      ))}
      {shown ? (
        <View pointerEvents="none" style={{
          position: "absolute", zIndex: 5, maxWidth: side === "c" ? kp.centreBubbleMax : W - size - 2,
          top: side === "c" ? Math.max(0, ky - 4) : Math.max(0, ky + Math.round(size * 0.1)),
          ...(side === "l" ? { left: size - 6 } : right ? { right: size - 6 } : { left: 0 }),
        }}>
          <Bubble delay={kp.bubbleDelay} style={{ transformOrigin: tailRight ? "100% 100%" : "0% 100%" }}>
            <View style={{
              paddingHorizontal: kp.bubblePadX, paddingVertical: kp.bubblePadY,
              borderTopLeftRadius: kp.bubbleRadius, borderTopRightRadius: kp.bubbleRadius,
              borderBottomRightRadius: tailRight ? kp.bubbleTail : kp.bubbleRadius, borderBottomLeftRadius: tailRight ? kp.bubbleRadius : kp.bubbleTail,
              backgroundColor: color.text.primary, transform: [{ rotate: `${tailRight ? 2 : -3}deg` }], ...shadow("float"),
            }}>
              <Text variant="keeperLine" color={color.text.onLime}>
                {shown}
                {cycle ? <Text variant="monoMicro" color={color.text.secondary}>{`  ${(i % lines.length) + 1}/${lines.length} ›`}</Text> : null}
              </Text>
            </View>
          </Bubble>
        </View>
      ) : null}
    </View>
  );
}

// ── KeeperMark ── 36 tile with the Check-K; the unread dot and the knock while a line is unread.
export function KeeperMark({ hasNew, onPress, open }: { hasNew?: boolean; onPress?: () => void; open?: boolean }) {
  const h = metrics.header;
  return (
    <Knock active={!!hasNew}>
      <PressScale onPress={onPress} scale={0.92} accessibilityLabel={t("additions.a11y.keeper")} accessibilityState={{ expanded: !!open }} hit={{ w: h.markSize, h: h.markSize }}>
        <View style={{ width: h.markSize, height: h.markSize, borderRadius: h.markRadius, backgroundColor: color.surface[2], boxShadow: `inset 0 0 0 1px ${color.line.hairline2}`, alignItems: "center", justifyContent: "center" }}>
          <CheckK size={h.markIcon} stroke={16} />
          {hasNew ? <View style={{ position: "absolute", right: -3, top: -3, width: h.dot, height: h.dot, borderRadius: h.dot / 2, backgroundColor: color.lime.base, boxShadow: `0 0 0 ${h.dotRing}px ${color.bg.app}` }} /> : null}
        </View>
      </PressScale>
    </Knock>
  );
}

// ── KeeperNote ── the paper card that drops from the mark (`note` 420 ms springSoft).
export function KeeperNote({ mood, line, anim = "idle", onClose, action, origin = "left", top = metrics.keeperNote.topHeader }: {
  mood: KeeperMood; line: string; anim?: KeeperAnim; onClose: () => void; action?: { label: string; onPress: () => void };
  /** The mark it drops from: the header's (left) or the nav bar's (right). */
  origin?: "left" | "right"; top?: number;
}) {
  const k = metrics.keeperNote;
  const { width } = useWindowDimensions();
  return (
    <View style={{ position: "absolute", left: k.inset, right: k.inset, top, zIndex: 45 }} accessibilityLiveRegion="polite">
      <NoteDrop origin={origin === "left" ? `${k.originX}px 0px` : `${width - 2 * k.inset - k.originX}px 0px`}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={`${t("common.keeperNoteEyebrow")}: ${line}`} accessibilityHint={t("additions.a11y.close")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: k.gap, paddingVertical: k.padY, paddingLeft: k.padL, paddingRight: k.padR, borderRadius: k.radius, backgroundColor: color.text.paper, ...shadow("note") }}>
            <View style={{ width: k.tile, height: k.tile, borderRadius: k.tileRadius, overflow: "hidden", alignItems: "center", justifyContent: "flex-end", backgroundColor: color.extra.keeperNoteTile[1] }}>
              <View style={{ position: "absolute", left: -k.tile * 0.25, top: -k.tile * 0.45 }}><RadialGlow size={k.tile * 1.5} colour={color.extra.keeperNoteTile[0]} id="knote" /></View>
              <Keeper mood={mood} anim={anim} bust size={k.tile} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space[5] }}>
                <CheckK size={k.eyebrowMark} variant="ink" stroke={18} />
                <Text variant="monoMicro" color={color.text.tertiary} style={{ letterSpacing: 1.2 }}>{t("common.keeperNoteEyebrow")}</Text>
              </View>
              <Text variant="keeperNote" color={color.text.onLime} style={{ marginTop: 3 }}>{line}</Text>
            </View>
            {action ? (
              // Press feedback at touch-down, before the action navigates.
              <PressScale onPress={action.onPress} accessibilityLabel={action.label}>
                <View style={{ height: k.actionH, paddingHorizontal: k.actionPadX, borderRadius: k.actionH / 2, backgroundColor: color.bg.app, justifyContent: "center" }}>
                  <Text variant="chip" color={color.lime.base}>{`${action.label} ›`}</Text>
                </View>
              </PressScale>
            ) : null}
          </View>
        </Pressable>
      </NoteDrop>
    </View>
  );
}
