// The Keeper's rig, ported 1:1 from design/reference/Keeper.dc.html (renderVals): eye and mouth paths
// per mood, prop placement, and the per-frame pose (bob, blink, head tilt, hands, sleeves, coin flip)
// as a pure function of t (seconds). Every function is a worklet, so Reanimated computes frames on the
// UI thread; t = 0 is the still pose (Reduce Motion, `animate={false}`).
import type { KeeperMood } from "@/copy";
import { keeperRig } from "@/theme/keeperRig";

export type KeeperPropName = "none" | "seal" | "ledger" | "lens" | "coin" | "sack" | "cup" | "whisper" | "scythe" | "flip";
export type KeeperAnimName = "idle" | "none" | "peek" | "popin" | "flip" | "wave" | "point" | "tap" | "thumbs" | "jump" | "shrug";
export type HandPose = "open" | "fist" | "point" | "thumb";

interface EyeShape { ht: number; hb: number; yi?: number; yo?: number; w?: number }
interface MoodShape {
  L?: EyeShape; R?: EyeShape; arcs?: 1; arcR?: 1; noGl?: 1; gr?: number; gx?: number;
  mouth: readonly [number, number, number] | "grin" | "open"; t2: number; spark?: 1; vein?: 1; lines?: 1; shades?: 1;
}

const MOODS: Record<KeeperMood, MoodShape> = {
  neutral: { L: { ht: 4, hb: 11 }, mouth: [87, 89, 84], t2: -3 },
  smug: { L: { ht: 3, hb: 10, yi: 1 }, R: { ht: 13, hb: 10, yo: -3 }, mouth: [88, 91, 82], t2: -6 },
  happy: { arcs: 1, mouth: "grin", t2: -5, spark: 1 },
  wink: { L: { ht: 12, hb: 11 }, arcR: 1, mouth: [87, 92, 82], t2: -9 },
  stern: { L: { ht: 2, hb: 12, yi: 5, yo: -4 }, noGl: 1, mouth: [91, 83, 91], t2: 0, vein: 1 },
  soft: { L: { ht: 13, hb: 12, yo: 3, yi: -1 }, gr: 3.4, mouth: [85, 92, 85], t2: 8 },
  bored: { L: { ht: 1, hb: 6, yo: 1, yi: 1 }, noGl: 1, mouth: [88, 88, 90], t2: 5 },
  side: { L: { ht: 5, hb: 10 }, gx: 5, mouth: [88, 90, 83], t2: 10 },
  shocked: { L: { ht: 14, hb: 14, w: 12 }, gr: 2.4, mouth: "open", t2: 0, lines: 1 },
  shades: { shades: 1, mouth: "grin", t2: -7 },
};

function eye(cx: number, s: number, o: EyeShape | undefined): string {
  "worklet";
  if (!o) return "M0 0";
  const cy = 62, w = o.w ?? 11, xo = cx - s * w, xi = cx + s * w, yo = cy + (o.yo ?? 0), yi = cy + (o.yi ?? 0);
  return `M${xo} ${yo} C${xo} ${cy - o.ht} ${xi} ${cy - o.ht + (o.yi ?? 0)} ${xi} ${yi} C${xi} ${cy + o.hb} ${xo} ${cy + o.hb} ${xo} ${yo} Z`;
}
const q = (t: number, a: number, c: number, b: number) => {
  "worklet";
  return (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
};

/** Everything that depends only on mood / prop / bust: drawn once. */
interface KeeperFace {
  eL: string; eR: string; bean: boolean; beanR: boolean; arcL: boolean; arcR: boolean; glL: boolean; glR: boolean;
  gx: number; gyBase: number; gr: number; stitch: string | null; ticks: string | null; mouth: string | null; teeth: string | null;
  shadesSmall: boolean; vein: boolean; spark: boolean; lines: boolean; tilt: number; props: Record<"seal" | "ledger" | "lens" | "coin" | "sack" | "cup" | "scythe", boolean>;
}

export function keeperFace(mood: KeeperMood, prop: KeeperPropName, bust: boolean): KeeperFace {
  const MD = MOODS[mood] ?? MOODS.neutral;
  const Lo = MD.L, Ro = MD.R ?? (MD.L ? { ...MD.L } : undefined), beanR = !!Ro && !MD.arcR;
  const grin = MD.mouth === "grin", open = MD.mouth === "open", st = Array.isArray(MD.mouth) ? (MD.mouth as readonly [number, number, number]) : null;
  let tp = "";
  if (grin) for (let x = 60; x < 100; x += 7) { const y = q((x + 3 - 56) / 48, 82, 92, 82) - 4; tp += `M${x} ${y} h6 v8 a3 3 0 0 1 -6 0 Z `; }
  const is = (k: KeeperPropName) => !bust && prop === k;
  return {
    eL: eye(66, 1, Lo), eR: eye(94, -1, Ro), bean: !!Lo && !MD.arcs, beanR: beanR && !MD.arcs,
    arcL: !!MD.arcs, arcR: !!(MD.arcs || MD.arcR), glL: !!Lo && !MD.noGl && !MD.arcs, glR: beanR && !MD.noGl && !MD.arcs,
    gx: MD.gx ?? 0, gyBase: 62 + (Lo?.hb ? Math.min(2, Lo.hb / 4) : 0) - 2, gr: MD.gr ?? 2.8,
    stitch: st ? `M60 ${st[0]} Q80 ${st[1]} 100 ${st[2]}` : null,
    ticks: st ? [0.18, 0.39, 0.61, 0.82].map((t) => { const x = q(t, 60, 80, 100), y = q(t, st[0], st[1], st[2]); return `M${x.toFixed(1)} ${(y - 4.5).toFixed(1)} Q${(x + 1).toFixed(1)} ${y.toFixed(1)} ${x.toFixed(1)} ${(y + 4.5).toFixed(1)}`; }).join(" ") : null,
    mouth: grin ? "M56 82 Q80 92 104 82 Q101 107 80 107 Q59 107 56 82 Z" : open ? "M80 85 C86 85 87 91 87 94 C87 99 84 101 80 101 C76 101 73 99 73 94 C73 91 74 85 80 85 Z" : null,
    teeth: grin ? tp : null,
    shadesSmall: !(MD.shades || mood === "neutral"),
    vein: !!MD.vein, spark: !!MD.spark && !bust, lines: !!MD.lines && !bust, tilt: MD.t2,
    props: { seal: is("seal"), ledger: is("ledger"), lens: is("lens"), coin: is("coin"), sack: is("sack"), cup: is("cup"), scythe: is("scythe") },
  };
}

/** SVG matrix(a b c d e f) for translate(x y) rotate(r) scale(sx sy). */
function trs(x: number, y: number, r: number, sx: number, sy: number): number[] {
  "worklet";
  const a = (r * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}
/** rotate(r cx cy). */
export function rotAbout(r: number, cx: number, cy: number): number[] {
  "worklet";
  const a = (r * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
}

interface HandFrame { m: number[]; pose: HandPose; wig: number }
interface KeeperFrame {
  root: number[]; blink: number[]; tilt: number[]; gx: number; gy: number;
  left: HandFrame; right: HandFrame; sl: string; sr: string;
  coin: { y: number; ry: number; ry2: number; fill: string; face: boolean; trail: boolean; ty: number; ty2: number };
}

const RIGHT_HAND: Record<KeeperPropName, [number, number, number, HandPose]> = {
  none: [118, 142, -10, "fist"], seal: [128, 96, 0, "fist"], flip: [124, 132, -20, "fist"], ledger: [118, 136, -20, "fist"], lens: [127, 116, 10, "fist"],
  coin: [128, 108, -10, "fist"], sack: [138, 98, 0, "fist"], cup: [130, 124, -10, "fist"], whisper: [106, 96, -25, "open"], scythe: [118, 122, 0, "fist"],
};

/** The pose at t seconds (t = 0: still). Mirrors Keeper.dc.html › renderVals frame by frame. */
export function keeperFrame(mood: KeeperMood, prop: KeeperPropName, anim: KeeperAnimName, hand: HandPose | null, faceTilt: number, faceGx: number, gyBase: number, t: number): KeeperFrame {
  "worklet";
  const S = Math.sin;
  const RH = RIGHT_HAND[prop] ?? RIGHT_HAND.none;
  let LH: [number, number, number, HandPose] = mood === "shades" ? [36, 120, 20, "open"] : mood === "shocked" ? [30, 108, 30, "open"] : [40, 142, 10, "fist"];
  let RHm: [number, number, number, HandPose] = [RH[0], RH[1], RH[2], RH[3]];
  if (hand) RHm = [128, 112, 0, hand];
  const live = t > 0;
  const an: KeeperAnimName = anim ?? (prop === "flip" ? "flip" : "idle");
  const back = (p: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  let ty = live ? S(t * 2.4) * 1.4 : 0, sx = 1, sy = 1, tiltA = 0, hsR = 1, gyA = 0, gxA = 0;
  const wig = live ? S(t * 3) * 3 : 0;
  const C = { y: -46, ry: 4, ry2: 2, fill: keeperRig.lime, face: true, trail: true, ty: 80, ty2: 60 };
  if (live) {
    RHm[1] += S(t * 2.4 + 0.6) * 1.4; LH[1] += S(t * 2.4 + 0.9) * 1.4;
    if (an === "idle" && t % 6.5 > 5.2) gxA = 4;
    if (an === "flip") {
      const p = (t % 1.7) / 1.7; RHm = [124, 130, -10, "fist"];
      if (p < 0.12) RHm[2] = -10 - (p / 0.12) * 30; else if (p < 0.2) RHm[2] = -40 + ((p - 0.12) / 0.08) * 60; else RHm[2] = 20 - Math.min(1, (p - 0.2) / 0.2) * 30;
      if (p > 0.1 && p < 0.9) {
        const qq = (p - 0.1) / 0.8, cy = -60 * 4 * qq * (1 - qq);
        C.y = cy; C.ry = Math.max(0.8, 10 * Math.abs(Math.cos(qq * Math.PI * 5))); C.fill = Math.cos(qq * Math.PI * 5) > 0 ? keeperRig.lime : keeperRig.coinFlipBack;
        C.ry2 = C.ry * 0.55; C.face = C.ry > 4; C.trail = qq > 0.15 && qq < 0.85; C.ty = 100 + cy * 0.5; C.ty2 = 100 + cy; gyA = cy * 0.05; tiltA = cy * 0.06;
      } else { C.y = 4; C.ry = 10; C.ry2 = 5.5; C.trail = false; if (p >= 0.9) RHm[1] += 3; }
    }
    if (an === "wave") { RHm = [136, 90, 18 * S(t * 9), "open"]; tiltA = 5; }
    if (an === "point") { RHm = [128, 112, -8, "point"]; hsR = 1 + 0.16 * Math.max(0, S(t * 5)); tiltA = -4; }
    if (an === "thumbs") { RHm = [130, 110 - 4 * Math.abs(S(t * 3)), 0, "thumb"]; hsR = 1 + 0.08 * Math.abs(S(t * 3)); }
    if (an === "tap") { LH = [48, 120, 85, "fist"]; RHm = [70, 108 - Math.max(0, S(t * 10)) * 4, -70, "point"]; tiltA = 4; }
    if (an === "shrug") { const k = Math.max(0, S(t * 2.2)); LH = [24, 114 - k * 6, -35, "open"]; RHm = [136, 114 - k * 6, 35, "open"]; tiltA = 7 * k; ty -= k * 2; }
    if (an === "jump") {
      const p = (t % 1.8) / 1.8;
      if (p < 0.15) { sy = 1 - 0.1 * S((p / 0.15) * Math.PI); sx = 2 - sy; }
      else if (p < 0.55) { const qq = (p - 0.15) / 0.4; ty = -18 * S(qq * Math.PI); sy = 1.05; sx = 0.96; LH = [26, 98, -30, "open"]; RHm = [134, 98, 30, "open"]; }
      else if (p < 0.68) { sy = 1 - 0.12 * S(((p - 0.55) / 0.13) * Math.PI); sx = 2 - sy; }
    }
    if (an === "peek" || an === "popin") {
      const p = an === "peek" ? t % 4.4 : Math.min(t, 3); let off = 0;
      if (p < 0.55) { const qq = back(p / 0.55); off = 120 * (1 - qq); sy = 0.85 + 0.15 * Math.min(1, qq); }
      else if (p < 1.9) RHm = [136, 90, 18 * S(p * 9), "open"];
      else if (an === "peek" && p > 3.7) { const qq = Math.min(1, (p - 3.7) / 0.4); off = 130 * qq * qq; sy = 1 + 0.08 * qq; sx = 1 - 0.05 * qq; }
      ty += off;
    }
  }
  const bl = live && an !== "jump" && t % 3.7 < 0.13 ? 0.12 : 1;
  const gx = faceGx + gxA;
  const sleeve = (x0: number, y0: number, hx: number, hy: number, bend: number) => `M${x0} ${y0} Q${(x0 + hx) / 2 + bend} ${(y0 + hy) / 2 + 8} ${hx} ${hy}`;
  return {
    // translate(0 ty) translate(80 178) scale(sx sy) translate(-80 -178)
    root: [sx, 0, 0, sy, 80 - 80 * sx, ty + 178 - 178 * sy],
    blink: [1, 0, 0, bl, 0, 62 - 62 * bl],
    tilt: rotAbout(faceTilt + tiltA, 80, 104),
    gx, gy: gyBase + gyA,
    left: { m: trs(LH[0], LH[1], LH[2], -1.75, 1.75), pose: LH[3], wig: LH[3] === "open" ? wig : 0 },
    right: { m: trs(RHm[0], RHm[1], RHm[2], 1.75 * hsR, 1.75 * hsR), pose: RHm[3], wig: RHm[3] === "open" ? wig : 0 },
    sl: sleeve(46, 108, LH[0], LH[1] + 6, -6),
    sr: sleeve(114, 108, RHm[0], RHm[1] + 6, 6),
    coin: C,
  };
}
