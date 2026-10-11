// The parametric Keeper (design/reference/Keeper.dc.html) drawn with Skia (motion rework). The still
// parts are recorded once; the moving parts (bob, blink, head
// tilt, glints, hands, sleeves, the flipped coin) read one UI-thread frame (rig.ts › keeperFrame) through
// shared values, so a frame is one canvas redraw on the UI thread with no React render and no SVG prop
// updates. Reduce Motion, `animate={false}` or an unfocused screen hold the still pose (t = 0).
//
// The prototype's SVG is `overflow: visible` (the coin flies above his head, `jump` lifts him, `peek`
// drops him below the box). A canvas clips to its bounds, so it's drawn larger than the layout box, by the
// room each anim needs, and positioned so the box lands where the prototype's does.
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import { View } from "react-native";
import { Canvas, Circle, DashPathEffect, Group, Oval, Paint, Path, Picture, RoundedRect, Text as SkText, drawAsPicture, rect, useFont, vec } from "@shopify/react-native-skia";
import type { SkFont, SkPicture } from "@shopify/react-native-skia";
import type { ReactElement, ReactNode } from "react";
import { useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useScreenFocused } from "@/lib/focus";
import { keeperRig as K } from "@/theme";
import { keeperFace, keeperFrame, rotAbout } from "./rig";
import type { HandPose, KeeperAnimName, KeeperPropName } from "./rig";
import type { KeeperMood } from "@/copy";

interface KeeperDrawingProps {
  mood: KeeperMood;
  prop?: KeeperPropName;
  anim?: KeeperAnimName;
  /** Hold the right hand in one pose (the prototype's `hand` prop). */
  hand?: HandPose;
  /** Width in dp; full body is size × 180/160 high, the bust is square. */
  size: number;
  bust?: boolean;
  animate?: boolean;
}

/** SVG matrix(a b c d e f) → Skia's row-major 3 × 3. */
function sk(m: number[]): number[] {
  "worklet";
  return [m[0]!, m[2]!, m[4]!, m[1]!, m[3]!, m[5]!, 0, 0, 1];
}
const deg = (d: number) => (d * Math.PI) / 180;

/** A stable pseudo-random phase in [0, 3) s per Keeper instance, so two Keepers never blink together. */
function phaseOf(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return (h % 3000) / 1000;
}

/** Room around the 160 × 180 box, in drawing units: [left, top, right, bottom]. */
function room(anim: KeeperAnimName, bust: boolean): [number, number, number, number] {
  if (bust) return [0, 0, 0, 0];
  const top = anim === "jump" ? 32 : 14;
  const bottom = anim === "peek" || anim === "popin" ? 140 : 8;
  return [14, top, 14, bottom];
}

// ── Paint helpers ── SVG draws a shape's fill, then its stroke. Skia draws a shape with its own paint and
// then with each <Paint> child, so the fill is the shape's own paint and the stroke a child.
const Stroke = ({ c, w, cap, o }: { c: string; w: number; cap?: "round"; o?: number }) => (
  <Paint color={c} style="stroke" strokeWidth={w} {...(cap ? { strokeCap: cap } : {})} {...(o !== undefined ? { opacity: o } : {})} />
);
/** A stroked SVG path (fill none). */
const SP = ({ d, c, w, cap, o, children }: { d: string; c: string; w: number; cap?: "round"; o?: number; children?: ReactNode }) => (
  <Path path={d} color={c} style="stroke" strokeWidth={w} {...(cap ? { strokeCap: cap } : {})} {...(o !== undefined ? { opacity: o } : {})}>{children}</Path>
);
/** A filled SVG path. */
const FP = ({ d, c, o }: { d: string; c: string; o?: number }) => <Path path={d} color={c} {...(o !== undefined ? { opacity: o } : {})} />;
/** SVG rect with rx, optionally rotated about a point (transform="rotate(r cx cy)"). */
function RR({ x, y, w, h, r, fill, stroke, sw, rot }: { x: number; y: number; w: number; h: number; r: number; fill?: string; stroke?: string; sw?: number; rot?: [number, number, number] }) {
  const own = fill ? { color: fill } : { color: stroke ?? K.ink, style: "stroke" as const, strokeWidth: sw ?? 1 };
  const shape = (
    <RoundedRect x={x} y={y} width={w} height={h} r={r} {...own}>
      {fill && stroke ? <Stroke c={stroke} w={sw ?? 1} /> : null}
    </RoundedRect>
  );
  return rot ? <Group transform={[{ rotate: deg(rot[0]) }]} origin={vec(rot[1], rot[2])}>{shape}</Group> : shape;
}
/** SVG circle, optionally with a stroke. */
function C({ cx, cy, r, fill, stroke, sw }: { cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }) {
  if (!stroke) return <Circle cx={cx} cy={cy} r={r} color={fill ?? K.ink} />;
  if (!fill) return <Circle cx={cx} cy={cy} r={r} color={stroke} style="stroke" strokeWidth={sw ?? 1} />;
  return <Circle cx={cx} cy={cy} r={r} color={fill}><Stroke c={stroke} w={sw ?? 1} /></Circle>;
}

// ── Recorded pieces ── Skia's Reanimated renderer walks the whole drawing on the UI thread every frame,
// so the still parts (body, head, a mood's eyes and mouth, props, each hand pose) are recorded once as
// pictures, shared by every Keeper, and a frame only walks the ~30 nodes that move. Until a piece's
// recording is ready (a few ms after first use) it's drawn live, so nothing pops in.
const BOUNDS = rect(-200, -200, 560, 600);
const pictures = new Map<string, SkPicture>();
const recording = new Set<string>();
const recorded = new Set<() => void>();
function record(key: string, element: ReactElement) {
  if (pictures.has(key) || recording.has(key)) return;
  recording.add(key);
  drawAsPicture(element, BOUNDS).then(
    (p) => { pictures.set(key, p); recording.delete(key); recorded.forEach((l) => l()); },
    () => { recording.delete(key); },
  );
}
/** The recorded piece for `key`, or `element` drawn live until it's recorded. `ready`: may record now. */
function usePiece(key: string, element: ReactElement | null, ready = true): ReactElement | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const latest = useRef(element);
  useLayoutEffect(() => { latest.current = element; });
  useEffect(() => {
    if (!ready || pictures.has(key) || !latest.current) return;
    const l = () => { if (pictures.has(key)) bump(); };
    recorded.add(l);
    record(key, latest.current);
    return () => { recorded.delete(l); };
  }, [key, ready]);
  if (!element) return null;
  const p = pictures.get(key);
  return p ? <Picture picture={p} /> : element;
}

/** The rig advances on every display frame. */
export const KeeperSkia = memo(function KeeperSkia({ mood, prop = "none", anim = "idle", hand, size, bust = false, animate = true }: KeeperDrawingProps) {
  const reduce = useReducedMotion();
  const rid = useId();
  const face = useMemo(() => keeperFace(mood, prop, bust), [mood, prop, bust]);
  const live = animate && !reduce && anim !== "none";
  const offset = useMemo(() => (anim === "peek" || anim === "popin" ? 0 : phaseOf(rid)), [anim, rid]);
  const t = useSharedValue(0);
  const cb = useFrameCallback((f) => {
    t.set(Math.max(0.001, f.timeSinceFirstFrame / 1000 + offset));
  }, false);
  // Frames run only while the drawing is mounted (from its first layout), its screen is focused and it's
  // live; they stop in the commit that removes it (audit P-6).
  const focused = useScreenFocused();
  const run = live && focused;
  const laidOut = useRef(false);
  const runRef = useRef(run);
  useLayoutEffect(() => { runRef.current = run; });
  useEffect(() => {
    if (!live) t.set(0);
    if (laidOut.current) cb.setActive(run);
  }, [run, live, cb, t]);
  useLayoutEffect(() => () => cb.setActive(false), [cb]);
  const onLayout = useCallback(() => {
    if (laidOut.current) return;
    laidOut.current = true;
    cb.setActive(runRef.current);
  }, [cb]);

  const tilt = face.tilt, gx0 = face.gx, gy0 = face.gyBase, h0 = hand ?? null;
  const fr = useDerivedValue(() => keeperFrame(mood, prop, anim, h0, tilt, gx0, gy0, t.value));
  const rootM = useDerivedValue(() => sk(fr.value.root));
  const tiltM = useDerivedValue(() => sk(fr.value.tilt));
  const blinkM = useDerivedValue(() => sk(fr.value.blink));
  const glLx = useDerivedValue(() => 69 + fr.value.gx);
  const glRx = useDerivedValue(() => 97 + fr.value.gx);
  const gl2Lx = useDerivedValue(() => 63 + fr.value.gx);
  const gl2Rx = useDerivedValue(() => 91 + fr.value.gx);
  const gy = useDerivedValue(() => fr.value.gy);
  const gy2 = useDerivedValue(() => fr.value.gy + 4);
  const sl = useDerivedValue(() => fr.value.sl);
  const sr = useDerivedValue(() => fr.value.sr);
  const coinM = useDerivedValue(() => [1, 0, 0, 0, 1, fr.value.coin.y, 0, 0, 1]);
  const coinBack = useDerivedValue(() => rect(123, 106 - fr.value.coin.ry, 20, fr.value.coin.ry * 2));
  const coinTop = useDerivedValue(() => rect(123, 105 - fr.value.coin.ry, 20, fr.value.coin.ry * 2));
  const coinFill = useDerivedValue(() => fr.value.coin.fill);
  const coinFace = useDerivedValue(() => rect(127.5, 105 - fr.value.coin.ry2, 11, fr.value.coin.ry2 * 2));
  const coinFaceOn = useDerivedValue(() => (fr.value.coin.face ? 1 : 0));
  const coinTrail = useDerivedValue(() => `M140 110 Q144 ${fr.value.coin.ty} 136 ${fr.value.coin.ty2}`);
  const coinTrailO = useDerivedValue(() => (fr.value.coin.trail ? 0.55 : 0));

  const coinOn = !bust && (anim === "flip" || prop === "flip");
  const w = size, h = bust ? size : Math.round((size * 180) / 160);
  const s = bust ? size / 104 : size / 160;
  const [pl, pt, pr, pb] = room(anim, bust);
  const sw = size >= 60 ? 1 : 1.2;
  // The card's "A" in Geist ExtraBold, as the SVG's <text>; the head is recorded once the font has loaded.
  const font = useFont(require("@expo-google-fonts/geist/800ExtraBold/Geist_800ExtraBold.ttf"), 8);

  // Still pieces, in the SVG's paint order.
  const base = usePiece(`base:${bust}:${face.props.scythe}`, (
    <>
      {bust ? null : <Oval x={26} y={172} width={108} height={8} color={K.floor} />}
      {face.props.scythe ? <Scythe /> : null}
      {bust ? null : <Body />}
    </>
  ));
  const head = usePiece("headPiece", <Head font={font} />, !!font);
  const eyes = usePiece(`eyes:${mood}`, (
    <>
      {face.bean ? <FP d={face.eL} c={K.ink} /> : null}
      {face.beanR ? <FP d={face.eR} c={K.ink} /> : null}
      {face.arcL ? <SP d="M56 66 Q66 50 76 66" c={K.ink} w={6.5} cap="round" /> : null}
      {face.arcR ? <SP d="M84 66 Q94 50 104 66" c={K.ink} w={6.5} cap="round" /> : null}
    </>
  ));
  const features = usePiece(`features:${mood}`, (
    <>
      <FP d="M80 77.5 C78.4 75.6 75.8 76.6 76.4 79 C77 80.8 78.6 82 80 83 C81.4 82 83 80.8 83.6 79 C84.2 76.6 81.6 75.6 80 77.5 Z" c={K.ink} />
      {face.stitch ? <SP d={face.stitch} c={K.ink} w={3.2} cap="round" /> : null}
      {face.ticks ? <SP d={face.ticks} c={K.ink} w={2.4} cap="round" /> : null}
      {face.mouth ? <FP d={face.mouth} c={K.ink} /> : null}
      {face.teeth && face.mouth ? <Group clip={face.mouth}><FP d={face.teeth} c={K.face} /></Group> : null}
      {face.shadesSmall
        ? <Group transform={[{ translateX: 80 }, { translateY: 12 }, { scaleX: 0.62 }, { scaleY: 0.46 }, { translateX: -80 }, { translateY: -60 }]}><Shades /></Group>
        : <Shades />}
      {face.vein ? <SP d="M104 62 Q108 64 106 68 M112 62 Q108 64 110 68 M103 67 Q107 64 111 67" c={K.face} w={1.8} cap="round" /> : null}
    </>
  ));
  const marks = usePiece(`marks:${mood}:${bust}`, face.spark || face.lines ? (
    <>
      {face.spark ? <FP d="M128 30 L130.5 37.5 L138 40 L130.5 42.5 L128 50 L125.5 42.5 L118 40 L125.5 37.5 Z" c={K.lime} /> : null}
      {face.lines ? <SP d="M62 2 L66 10 M80 -2 L80 7 M98 2 L94 10" c={K.face} w={2.4} cap="round" /> : null}
    </>
  ) : null);
  const held = usePiece(`props:${prop}:${bust}`, (
    <>
      {face.props.seal ? <Seal /> : null}
      {face.props.ledger ? <Ledger /> : null}
      {face.props.lens ? <Lens /> : null}
      {face.props.coin ? <Coin /> : null}
      {face.props.sack ? <Sack /> : null}
      {face.props.cup ? <Cup /> : null}
    </>
  ));
  const openThumb = usePiece(`hand:openThumb:${sw}`, <PoseDrawing part="openThumb" sw={sw} />);
  const openFingers = usePiece(`hand:openFingers:${sw}`, <PoseDrawing part="openFingers" sw={sw} />);
  const openPalm = usePiece(`hand:openPalm:${sw}`, <PoseDrawing part="openPalm" sw={sw} />);
  const fist = usePiece(`hand:fist:${sw}`, <PoseDrawing part="fist" sw={sw} />);
  const point = usePiece(`hand:point:${sw}`, <PoseDrawing part="point" sw={sw} />);
  const thumb = usePiece(`hand:thumb:${sw}`, <PoseDrawing part="thumb" sw={sw} />);
  const poses: Poses = { openThumb, openFingers, openPalm, fist, point, thumb };

  const scene = (
    <Group matrix={rootM}>
      {base}
      {bust ? null : (
        <>
          <Path path={sl} color={K.sleeve} style="stroke" strokeWidth={16} strokeCap="round" />
          <Path path={sr} color={K.sleeve} style="stroke" strokeWidth={16} strokeCap="round" />
          <Group transform={[{ translateX: 5 }, { translateY: -2 }]}><Path path={sr} color={K.sleeveHi} style="stroke" strokeWidth={1.2} /></Group>
        </>
      )}
      <Group matrix={tiltM}>
        {head}
        <Group matrix={blinkM}>
          {eyes}
          {face.glL ? <Circle cx={glLx} cy={gy} r={face.gr} color={K.white} /> : null}
          {face.glR ? <Circle cx={glRx} cy={gy} r={face.gr} color={K.white} /> : null}
          {face.glL ? <Circle cx={gl2Lx} cy={gy2} r={1.2} color={K.white} /> : null}
          {face.glR ? <Circle cx={gl2Rx} cy={gy2} r={1.2} color={K.white} /> : null}
        </Group>
        {features}
      </Group>
      {marks}
      {coinOn ? (
        <Group>
          <Path path={coinTrail} color={K.lime} style="stroke" strokeWidth={1.6} strokeCap="round" opacity={coinTrailO}>
            <DashPathEffect intervals={[2, 5]} />
          </Path>
          <Group matrix={coinM}>
            <Oval rect={coinBack} color={K.limeDeep} />
            <Oval rect={coinTop} color={coinFill}><Stroke c={K.ink} w={1} /></Oval>
            <Group opacity={coinFaceOn}>
              <Oval rect={coinFace} color={K.limeDark} style="stroke" strokeWidth={1.6} />
              <SP d="M127 101 Q130 99 134 99" c={K.coinLight} w={1.8} cap="round" />
            </Group>
          </Group>
        </Group>
      ) : null}
      {held}
      {bust ? null : <><Hand fr={fr} side="left" poses={poses} /><Hand fr={fr} side="right" poses={poses} /></>}
    </Group>
  );
  return (
    <View onLayout={onLayout} style={{ width: w, height: h, overflow: bust ? "hidden" : "visible" }} pointerEvents="none">
      <Canvas style={{ position: "absolute", left: -pl * s, top: -pt * s, width: w + (pl + pr) * s, height: h + (pt + pb) * s }}>
        {/* viewBox: full body 0 0 160 180; bust 28 4 104 104 (clipped by the View). */}
        <Group transform={[{ scale: s }, { translateX: pl - (bust ? 28 : 0) }, { translateY: pt - (bust ? 4 : 0) }]}>
          {scene}
        </Group>
      </Canvas>
    </View>
  );
});

type Frame = SharedValue<ReturnType<typeof keeperFrame>>;
type Part = "openThumb" | "openFingers" | "openPalm" | "fist" | "point" | "thumb";
type Poses = Record<Part, ReactElement | null>;

/**
 * One hand: its matrix moves every frame; the poses are recorded pieces, one shown at a time. A picture
 * ignores a group's opacity, so a hidden pose is collapsed to nothing (a zero matrix) instead.
 */
const SHOW = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const HIDE = [0, 0, 0, 0, 0, 0, 0, 0, 1];
function Hand({ fr, side, poses }: { fr: Frame; side: "left" | "right"; poses: Poses }) {
  const m = useDerivedValue(() => sk(fr.value[side].m));
  const open = useDerivedValue(() => (fr.value[side].pose === "open" ? SHOW : HIDE));
  const fist = useDerivedValue(() => (fr.value[side].pose === "fist" ? SHOW : HIDE));
  const point = useDerivedValue(() => (fr.value[side].pose === "point" ? SHOW : HIDE));
  const thumb = useDerivedValue(() => (fr.value[side].pose === "thumb" ? SHOW : HIDE));
  // The open hand's fingers wiggle (rotate(wig 0 -5)).
  const wig = useDerivedValue(() => sk(rotAbout(fr.value[side].wig, 0, -5)));
  return (
    <Group matrix={m}>
      <Oval x={-6.4} y={7.6 - 3.4} width={12.8} height={6.8} color={K.fistShade} />
      <Group matrix={open}>
        {poses.openThumb}
        <Group matrix={wig}>{poses.openFingers}</Group>
        {poses.openPalm}
      </Group>
      <Group matrix={fist}>{poses.fist}</Group>
      <Group matrix={point}>{poses.point}</Group>
      <Group matrix={thumb}>{poses.thumb}</Group>
    </Group>
  );
}

/** A hand pose's drawing (Keeper.dc.html): inside a hand, shapes take the group's ink stroke on their fill. */
function PoseDrawing({ part, sw }: { part: Part; sw: number }) {
  const ink = 0.8 * sw, thin = 0.75 * sw;
  const R = (x: number, y: number, w: number, h: number, r: number, fill: string, rot?: [number, number, number]) => (
    <RR x={x} y={y} w={w} h={h} r={r} fill={fill} stroke={K.ink} sw={ink} {...(rot ? { rot } : {})} />
  );
  const knuckles = (four: boolean) => (
    <>
      {four ? <C cx={-4.4} cy={-5.6} r={2.1} fill={K.face} stroke={K.ink} sw={ink} /> : null}
      <C cx={-1.4} cy={-6.3} r={2.1} fill={K.face} stroke={K.ink} sw={ink} />
      <C cx={1.7} cy={-6.2} r={2.1} fill={K.face} stroke={K.ink} sw={ink} />
      <C cx={4.6} cy={-5.4} r={2} fill={K.faceShade} stroke={K.ink} sw={ink} />
    </>
  );
  const palm = (
    <>
      {R(-6.8, -6.5, 13.6, 13, 5.2, K.face)}
      <SP d="M3.4 -3.5 Q6 -1 5.2 4" c={K.bone2} w={2.4} cap="round" />
    </>
  );
  const hi = <SP d="M-5 -2.5 Q-4 -4.6 -1.8 -5" c={K.white} w={1.2} cap="round" />;
  const creases3 = <SP d="M-2.9 -4.6 v3 M0.2 -4.9 v3.2 M3.2 -4.5 v3" c={K.ink} w={thin} />;
  switch (part) {
    case "openThumb": return R(-11.4, -3.5, 3.5, 9, 1.75, K.face, [-50, -8, 1]);
    case "openFingers": return (
      <>
        {R(-6.3, -15, 3.2, 11, 1.6, K.face, [-11, -4.6, -4])}
        {R(-2.6, -17, 3.2, 13, 1.6, K.face, [-3, -1, -4])}
        {R(1, -16.5, 3.2, 12.5, 1.6, K.face, [5, 2.6, -4])}
        {R(4.5, -13.5, 3, 10, 1.5, K.faceShade, [14, 6, -4])}
        <SP d="M-6.2 -9.6 l2.4 -.5 M-2.4 -11 l2.6 0 M1.5 -10.6 l2.6 .3 M5.2 -8.6 l2.2 .6" c={K.ink} w={thin} />
      </>
    );
    case "openPalm": return palm;
    case "fist": return <>{knuckles(true)}{palm}{creases3}{R(-8.6, -0.4, 9.6, 3.7, 1.85, K.face)}{hi}</>;
    case "point": return (
      <>
        {R(-6.2, -19, 3.4, 14, 1.7, K.face)}
        <SP d="M-6 -12.5 l3 0" c={K.ink} w={thin} />
        {knuckles(false)}
        {palm}
        <SP d="M0.2 -4.9 v3.2 M3.2 -4.5 v3" c={K.ink} w={thin} />
        {R(-8.6, -0.4, 9.6, 3.7, 1.85, K.face)}
        {hi}
      </>
    );
    case "thumb": return <>{R(-9.8, -17, 3.8, 13, 1.9, K.face, [-6, -8, -4])}{knuckles(true)}{palm}{creases3}{hi}</>;
  }
}

const Scythe = memo(function Scythe() { return (
  <Group>
    <SP d="M126 34 L112 176" c={K.steel} w={5} cap="round" />
    <Group transform={[{ translateX: 1.6 }]}><SP d="M126 34 L112 176" c={K.shaftHi} w={1.2} /></Group>
    <FP d="M128 38 C104 12 70 10 40 26 C68 22 98 28 120 50 Z" c={K.blade} />
    <SP d="M40 26 C68 22 98 28 120 50" c={K.lime} w={2} />
    <SP d="M58 22 C80 16 100 20 116 34" c={K.white} w={1.4} o={0.6} />
  </Group>
); });

const Body = memo(function Body() { return (
  <Group>
    <FP d="M36 104 C27 128 21 150 15 172 L30 165 L40 176 L54 167 L67 177 L80 168 L93 177 L106 167 L120 176 L130 165 L145 172 C139 150 133 128 124 104 Z" c={K.cloak} />
    <FP d="M36 104 C28 128 22 150 16 171 L30 165 L36 171 C38 148 40 126 46 108 Z" c={K.cloakHi} />
    <SP d="M62 116 C60 134 58 152 55 166 M98 116 C100 134 102 152 105 166 M80 122 L80 166" c={K.ink2} w={2.4} cap="round" />
    <SP d="M124 104 C133 128 139 150 145 172" c={K.lime} w={2} o={0.6} />
    <SP d="M68 112 L80 122 L92 112" c={K.seam} w={1.6} />
    <Circle cx={80} cy={127} r={7.5} color={K.lime} />
    <Circle cx={80} cy={127} r={4.4} color={K.limeDeep} style="stroke" strokeWidth={1.5} />
    <SP d="M76 123 Q78 121 81 121" c={K.hilite} w={1.3} cap="round" />
  </Group>
); });

const Head = memo(function Head({ font }: { font: SkFont | null }) {
  return (
    <Group>
      <Group transform={[{ rotate: deg(-26) }]} origin={vec(30, 40)}>
        <RR x={17} y={20} w={24} h={33} r={3.5} fill={K.ink} />
        <RR x={16} y={19} w={24} h={33} r={3.5} fill={K.paper} />
        <RR x={18.5} y={21.5} w={19} h={28} r={2} stroke={K.lime} sw={1.2} />
        {font ? <SkText x={20.5} y={30} text="A" font={font} color={K.ink} /> : null}
        <FP d="M28 34 C24 38 23 41 26 42 C27 42.5 28 41.6 28 41 L27 45 L29 45 L28 41 C28 41.6 29 42.5 30 42 C33 41 32 38 28 34 Z" c={K.ink} />
        <SP d="M18 21 L36 21" c={K.white} w={1} o={0.9} />
      </Group>
      <FP d="M80 8 C108 8 126 30 130 62 C132 84 128 104 122 118 C108 126 52 126 38 118 C32 104 28 84 30 62 C34 30 52 8 80 8 Z" c={K.hood} />
      <FP d="M90 10 C106 4 120 6 131 18 C118 13 106 15 98 19 Z" c={K.hood} />
      <FP d="M38 40 C33 56 32 74 35 92 C37 104 41 112 46 117 C40 100 38 80 40 62 C41 52 44 44 49 34 Z" c={K.hoodHi} />
      <SP d="M122 30 C130 44 133 64 131 86 C130 98 127 108 123 116" c={K.lime} w={2.2} cap="round" o={0.75} />
      <SP d="M54 18 C64 11 84 9 100 13" c={K.white} w={3} cap="round" o={0.3} />
      <Path path="M80 22 C100 22 114 38 116 62 C118 86 110 104 100 111 L60 111 C50 104 42 86 44 62 C46 38 60 22 80 22 Z" color={K.void}><Stroke c={K.rim} w={1.5} /></Path>
      <FP d="M80 23 C103 23 115 40 115 60 C115 79 104 93 92 99 C86 102 74 102 68 99 C56 93 45 79 45 60 C45 40 57 23 80 23 Z" c={K.face} />
      <FP d="M100 31 C110 40 115 50 115 60 C115 79 104 93 92 99 C88 101 84 101.5 81 101.5 C92 96 104 84 106 66 C107 52 105 40 100 31 Z" c={K.faceShade} />
      <SP d="M58 33 C64 27 72 25 80 25" c={K.white} w={3} cap="round" o={0.8} />
      <SP d="M51 76 Q53 86 60 92" c={K.white} w={2.4} cap="round" o={0.55} />
      <FP d="M46 50 Q80 31 114 50 Q80 42 46 54 Z" c={K.brimShade} />
      <SP d="M33 39 Q80 15 127 39" c={K.brimInk} w={7} cap="round" />
      <SP d="M33 39 Q80 15 127 39" c={K.limeDark} w={4} cap="round" />
      <Path path="M30 43 Q80 19 130 43 Q132 49 125 50 Q80 30 35 50 Q28 49 30 43 Z" color={K.brim}><Stroke c={K.lime} w={1.4} /></Path>
      <SP d="M38 43 Q80 24 122 43" c={K.white} w={1.8} cap="round" o={0.75} />
      <SP d="M36 48 Q80 28 124 48" c={K.limeMoss} w={1.4} o={0.7} />
    </Group>
  );
});

const Shades = memo(function Shades() { return (
  <Group>
    <Path path="M44 57 Q80 51 116 57 Q117 75 101 75 Q88 75 86 64 Q80 61 74 64 Q72 75 59 75 Q43 75 44 57 Z" color={K.shades}><Stroke c={K.shadesRim} w={1.2} /></Path>
    <SP d="M53 62 Q58 59 64 60 M89 62 Q94 59 100 60" c={K.lime} w={2.6} cap="round" />
    <SP d="M106 60 L110 66 M68 60 L71 64" c={K.white} w={1.6} cap="round" o={0.55} />
  </Group>
); });

const Seal = () => (
  <Group>
    <RR x={122} y={80} w={12} h={22} r={5} fill={K.steel} stroke={K.steelHi} sw={1} />
    <RR x={116} y={100} w={24} h={9} r={2.5} fill={K.lime} />
    <RR x={116} y={106} w={24} h={3} r={0} fill={K.seal} />
  </Group>
);
const Ledger = () => (
  <Group transform={[{ rotate: deg(-12) }]} origin={vec(120, 134)}>
    <RR x={100} y={120} w={40} h={30} r={3} fill={K.steel} />
    <RR x={102} y={118} w={36} h={28} r={2} fill={K.face} />
    <SP d="M120 119 L120 145" c={K.ledgerLine} w={1.5} />
    <SP d="M106 126 L116 126 M106 131 L116 131 M106 136 L114 136 M124 126 L134 126 M124 131 L132 131" c={K.ledgerInk} w={1.5} />
    <RR x={128} y={114} w={5} h={12} r={0} fill={K.lime} />
  </Group>
);
const Lens = () => (
  <Group>
    <SP d="M131 104 L127 116" c={K.steelHi} w={5} cap="round" />
    <C cx={137} cy={90} r={13} fill={K.lensGlass} stroke={K.lens} sw={4} />
    <SP d="M130 84 Q133 80 138 80" c={K.white} w={2} cap="round" />
  </Group>
);
const Coin = () => (
  <Group>
    <C cx={136} cy={98} r={12} fill={K.seal} />
    <C cx={135} cy={96} r={12} fill={K.lime} />
    <Circle cx={135} cy={96} r={7.5} color={K.limeDeep} style="stroke" strokeWidth={1.8} />
    <SP d="M129 90 Q132 87 136 87" c={K.hilite} w={1.6} cap="round" />
  </Group>
);
const Sack = () => (
  <Group>
    <FP d="M129 98 Q126 92 133 91 L145 91 Q151 92 147 98 Q160 108 156 124 Q153 132 138 132 Q123 132 120 124 Q116 108 129 98 Z" c={K.lime} />
    <FP d="M142 100 Q154 110 151 124 Q149 130 140 131 Q150 122 146 104 Z" c={K.sackShade} />
    <SP d="M129 98 L147 98" c={K.sackDeep} w={2.4} />
    <SP d="M133 116 L143 116 M138 110 L138 122" c={K.limeDark} w={2.2} cap="round" />
  </Group>
);
const Cup = () => (
  <Group>
    <RR x={112} y={110} w={20} h={24} r={4} fill={K.face} />
    <RR x={126} y={110} w={6} h={24} r={3} fill={K.cupShade} />
    <SP d="M132 115 Q140 117 132 126" c={K.face} w={3} />
    <SP d="M117 104 Q114 99 118 95 Q121 91 118 86 M124 104 Q121 99 125 95" c={K.steam} w={1.8} cap="round" />
  </Group>
);
