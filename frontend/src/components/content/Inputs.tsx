import { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { create as createQr } from "qrcode/lib/core/qrcode";
import { t } from "@/copy";
import { cheapShadow, color, fontFamily, gradient, metrics, shadow, space } from "@/theme";
import { Avatar } from "../avatar/Avatar";
import { Icon, InitialTile, Pop, PressScale, Surface, Text, Tilt, CountText } from "../primitives";
import type { IconName } from "../primitives";

// ── MoneyMoment (`big`) ── lime "+…" values become the tilted money pill.
export function MoneyMoment({ value, caption, fs = metrics.money.fs, tone = "white" }: { value: string; caption?: string; fs?: number; tone?: "white" | "lime" | "red" }) {
  const pill = tone === "lime" && value.startsWith("+");
  const size = pill ? Math.min(fs, metrics.money.pillMax) : fs;
  const fg = pill ? color.text.onLimeDeep : tone === "lime" ? color.lime.base : tone === "red" ? color.red.base : color.text.primary;
  const glow = !pill && tone !== "white" ? { textShadowColor: tone === "lime" ? color.lime.tint20 : color.red.tint22, textShadowRadius: 40 } : {};
  const text = <CountText text={value} variant="display" color={fg} style={{ fontSize: size, lineHeight: size, ...glow }} />;
  return (
    <View style={{ alignItems: "center", paddingVertical: space[6] }} accessibilityLabel={[value, caption].filter(Boolean).join(", ")}>
      <Pop delay={200} ms={600}>
        {pill ? (
          <View style={{ transform: [{ rotate: `${metrics.money.pillTilt}deg` }] }}>
            <Surface radius={999} gradient={gradient("moneyPill")} shadow={shadow("moneyPill").boxShadow}
              style={{ flexDirection: "row", alignItems: "center", gap: space[8], paddingLeft: metrics.money.pillPadL, paddingRight: metrics.money.pillPadR, paddingVertical: metrics.money.pillPadY }}>
              <Icon name="sack" size={Math.round(size * metrics.money.iconRatio)} color={fg} />
              {text}
            </Surface>
          </View>
        ) : text}
      </Pop>
      {caption ? <Text variant="label" color={color.text.secondary} style={{ marginTop: space[8] }}>{caption}</Text> : null}
    </View>
  );
}

// ── OptionGrid (`opts`) ── tile | big | chip | row (2 cols) | row (1 col).
type OptionMode = "tile" | "big" | "chip" | "row2" | "row";
interface OptionItem { title: string; sub?: string; icon?: IconName }
const MODE = {
  tile: { cols: 4, minH: 84, minHSmall: 66, icon: 28, iconSmall: 22, fs: 11, ls: 0, dir: "column", align: "center", justify: "center", padV: 10, padH: 4, gap: 6 },
  big: { cols: 3, minH: 124, minHSmall: 66, icon: 0, iconSmall: 0, fs: 46, fsSmall: 26, ls: -2, dir: "column", align: "flex-start", justify: "flex-end", padV: 14, padH: 14, gap: 0 },
  chip: { cols: 0, minH: 64, minHSmall: 64, icon: 0, iconSmall: 0, fs: 20, ls: -0.6, dir: "column", align: "center", justify: "center", padV: 10, padH: 10, gap: 0 },
  row2: { cols: 2, minH: 128, minHSmall: 128, icon: 28, iconSmall: 28, fs: 18, ls: -0.4, dir: "column", align: "flex-start", justify: "space-between", padV: 16, padH: 16, gap: 10 },
  row: { cols: 1, minH: 80, minHSmall: 80, icon: 26, iconSmall: 26, fs: 17, ls: -0.3, dir: "row", align: "center", justify: "flex-start", padV: 14, padH: 16, gap: 14 },
} as const;

export function OptionGrid({ items, value, onChange, mode, cols, small }: { items: OptionItem[]; value: number; onChange: (i: number) => void; mode: OptionMode; cols?: number; small?: boolean }) {
  const m = MODE[mode];
  const n = cols ?? (m.cols || items.length);
  const rows: OptionItem[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return (
    <View style={{ gap: metrics.option.gap }} accessibilityRole="radiogroup">
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", gap: metrics.option.gap }}>
          {row.map((it, c) => {
            const i = r * n + c;
            const on = i === value;
            const fg = on ? color.text.onLime : color.text.primary;
            const iconSize = small ? m.iconSmall : m.icon;
            const fs = small && "fsSmall" in m ? m.fsSmall : m.fs;
            return (
              <PressScale key={i} onPress={() => onChange(i)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={[it.title, it.sub].filter(Boolean).join(", ")} style={{ flex: 1 }}>
                <Tilt deg={on ? (i % 2 ? metrics.option.tilt : -metrics.option.tilt) : 0} style={{
                  minHeight: small ? m.minHSmall : m.minH, borderRadius: metrics.option.radius, paddingVertical: m.padV, paddingHorizontal: m.padH,
                  flexDirection: m.dir, alignItems: m.align, justifyContent: m.justify, gap: m.gap,
                  backgroundColor: on ? color.text.primary : color.surface[1],
                  boxShadow: on ? shadow("optionOn").boxShadow : `inset 0 0 0 1px ${color.extra.hairline07}`,
                }}>
                  {it.icon && iconSize ? <Icon name={it.icon} size={iconSize} color={fg} /> : null}
                  <View style={{ flex: mode === "row" ? 1 : 0, minWidth: 0 }}>
                    <Text color={fg} align={m.align === "center" && mode !== "row" ? "center" : "left"} style={{ fontFamily: fontFamily("sans", 600), fontSize: fs, lineHeight: Math.round(fs * 1.1), letterSpacing: m.ls }}>{it.title}</Text>
                    {it.sub ? <Text variant="caption" color={fg} style={{ opacity: 0.65, marginTop: 3 }}>{it.sub}</Text> : null}
                  </View>
                  {mode === "row" ? <Icon name={on ? "check-circle" : "circle-outline"} size={20} color={fg} /> : null}
                </Tilt>
              </PressScale>
            );
          })}
          {row.length < n ? Array.from({ length: n - row.length }, (_, k) => <View key={`pad${k}`} style={{ flex: 1 }} />) : null}
        </View>
      ))}
    </View>
  );
}

// ── SentenceInput (`input`) ── prefix + value + lime caret, counter, suggestion chips, error ring.
export function SentenceInput({ label, prefix, value, onChange, max, suggestions = [], mono, error, placeholder, autoFocus }: {
  label: string; prefix?: string; value: string; onChange: (v: string) => void; max?: number; suggestions?: string[]; mono?: boolean; error?: string; placeholder?: string;
  /** Opens with the keyboard up (E1·code: the user chose to type). */
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const fs = prefix ? 22 : 20;
  const ring = error ? color.red.base : focused ? color.lime.base : color.extra.hairline07;
  const valueStyle = { fontFamily: mono ? fontFamily("mono", 600) : fontFamily("sans", 600), fontSize: fs, lineHeight: Math.round(fs * 1.25), letterSpacing: -0.6, color: color.text.primary };
  return (
    <View style={{ gap: space[10] }}>
      <View style={{ paddingHorizontal: metrics.input.padX, paddingVertical: metrics.input.padY, borderRadius: metrics.input.radius, backgroundColor: color.surface[1], boxShadow: `inset 0 0 0 ${metrics.input.ring}px ${ring}` }}>
        <Text variant="caption">{label}</Text>
        <View style={{ marginTop: space[6], flexDirection: "row", flexWrap: "wrap", alignItems: "baseline" }}>
          {prefix ? <Text style={{ ...valueStyle, color: color.text.tertiary }}>{prefix} </Text> : null}
          <TextInput
            value={value}
            onChangeText={(v) => onChange(max ? v.slice(0, max) : v)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel={label}
            // Codes and links (mono) are typed exactly: no autocorrect, capitals or suggestions.
            {...(mono ? { autoCorrect: false, autoCapitalize: "none" as const, spellCheck: false, autoComplete: "off" as const } : {})}
            {...(placeholder ? { placeholder } : {})}
            {...(autoFocus ? { autoFocus } : {})}
            // secondary (about 5:1 on the field), not ghost (1.5:1): readable, and still plainly not the typed text, which is primary white.
            placeholderTextColor={color.text.secondary}
            selectionColor={color.lime.base}
            cursorColor={color.lime.base}
            style={[valueStyle, { padding: 0, minWidth: 40, flexGrow: 1 }]}
            multiline
          />
        </View>
        {max ? <Text variant="monoMicro" align="right" style={{ marginTop: space[6], fontSize: 11 }}>{`${value.length} / ${max}`}</Text> : null}
      </View>
      {error ? <Text variant="caption" color={color.red.base}>{error}</Text> : null}
      {suggestions.length > 1 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[6] }}>
          {suggestions.map((s) => {
            const on = s === value;
            return (
              <PressScale key={s} onPress={() => onChange(s)} accessibilityLabel={s} accessibilityState={{ selected: on }} hit={{ w: metrics.input.sugH, h: metrics.input.sugH }}>
                <View style={{ height: metrics.input.sugH, paddingHorizontal: metrics.input.sugPadX, borderRadius: metrics.input.sugRadius, justifyContent: "center", backgroundColor: on ? color.text.primary : color.surface[1], boxShadow: `inset 0 0 0 1px ${color.line.hairline3}` }}>
                  <Text variant="chipMd" color={on ? color.text.onLime : color.text.soft}>{s}</Text>
                </View>
              </PressScale>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ── SeatSlots (`slot`) ── 4 columns; open seat; overflow "+n others".
export type Seat =
  | { kind: "member"; name: string; status?: string; avatar?: string; initial?: string; color: string; dim?: boolean; red?: boolean }
  | { kind: "open" }
  | { kind: "overflow"; count: number };

export function SeatSlots({ seats }: { seats: Seat[] }) {
  const s = metrics.seat;
  return (
    <View style={{ flexDirection: "row", gap: s.gap }}>
      {seats.map((seat, i) => {
        const tilt = seat.kind === "open" ? 0 : i % 2 ? s.tilt : -s.tilt;
        const box = { width: s.avatar, height: s.avatar, borderRadius: s.avatarRadius, overflow: "hidden" as const, alignItems: "center" as const, justifyContent: "center" as const };
        let tile, name, status;
        let nameColor: string = color.text.primary;
        let statusColor: string = color.lime.base;
        if (seat.kind === "open") {
          tile = <View style={[box, { backgroundColor: color.surface[2] }]}><Icon name="plus" size={20} color={color.text.tertiary} /></View>;
          name = t("common.openSeat"); nameColor = color.text.tertiary;
        } else if (seat.kind === "overflow") {
          tile = <View style={[box, { backgroundColor: color.surface[4] }]}><Text variant="cardName" style={{ fontFamily: fontFamily("sans", 700) }}>{`+${seat.count}`}</Text></View>;
          name = t("common.others"); nameColor = color.text.muted;
        } else {
          tile = (
            <View style={[box, { backgroundColor: seat.color, opacity: seat.dim ? 0.4 : 1, boxShadow: `inset 0 1.5px 0 ${color.extra.tileHi45}, inset 0 -3px 0 ${color.extra.tileShade15}` }]}>
              {seat.avatar ? <Avatar config={seat.avatar} size={s.avatar} /> : <InitialTile initial={seat.initial ?? ""} bg={seat.color} size={s.avatar} radius={s.avatarRadius} textSize={17} />}
            </View>
          );
          name = seat.name; status = seat.status;
          statusColor = seat.red ? color.red.base : seat.dim ? color.text.secondary : color.lime.base;
        }
        return (
          <View key={i} accessibilityLabel={[name, status].filter(Boolean).join(", ")} style={{
            flex: 1, alignItems: "center", gap: space[6], paddingVertical: s.padY, paddingHorizontal: s.padX, borderRadius: s.radius,
            backgroundColor: seat.kind === "open" ? color.surface.sunken : color.surface[1],
            boxShadow: seat.kind === "open" ? `inset 0 0 0 ${s.ring}px ${color.line.emptyDark}` : `inset 0 0 0 1px ${color.line.hairline2}`,
            transform: [{ rotate: `${tilt}deg` }],
          }}>
            <Pop delay={150 + i * 90} ms={450}>{tile}</Pop>
            <Text variant="chip" color={nameColor} numberOfLines={1}>{name}</Text>
            <Text variant="monoMicro" color={statusColor} numberOfLines={1} style={{ letterSpacing: 0 }}>{status ?? ""}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** One path for every dark module, in module units: a rectangle per horizontal run. Error correction M. */
function qrPath(value: string) {
  const { size, data } = createQr(value, { errorCorrectionLevel: "M" }).modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!data[y * size + x]) continue;
      let w = 1;
      while (x + w < size && data[y * size + x + w]) w++;
      d += `M${x} ${y}h${w}v1h${-w}z`;
      x += w - 1;
    }
  }
  return { size, d };
}

// ── QRCard (`qr`) ── a real, scannable QR of the invite link.
export function QRCard({ code, link }: { code: string; link: string }) {
  const q = metrics.qr;
  const qr = useMemo(() => qrPath(link), [link]);
  const side = q.size - q.inner * 2;
  return (
    <View style={{ flexDirection: "row", gap: q.gap, alignItems: "center", padding: q.pad, borderRadius: q.radius, backgroundColor: color.surface[1] }}>
      <View accessibilityLabel={link} style={{ width: q.size, height: q.size, padding: q.inner, borderRadius: q.codeRadius, backgroundColor: color.text.primary, transform: [{ rotate: `${q.tilt}deg` }], boxShadow: cheapShadow("0 10px 24px rgba(0,0,0,0.4)") }}>
        <Svg width={side} height={side} viewBox={`0 0 ${qr.size} ${qr.size}`}>
          <Path d={qr.d} fill={color.text.onLime} />
        </Svg>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="caption">{t("common.code")}</Text>
        <Text variant="monoCode" style={{ marginTop: space[2] }} selectable>{code}</Text>
        <Text variant="caption" style={{ marginTop: space[12] }}>{t("common.link")}</Text>
        <Text variant="monoValue" numberOfLines={1} style={{ marginTop: space[2] }} selectable>{link}</Text>
      </View>
    </View>
  );
}
