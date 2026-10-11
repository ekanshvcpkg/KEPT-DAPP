// Avatar: the 8-digit config character (base, skin, eyes, hat, fit, fit colour, extra, background).
// Ported 1:1 from design/reference/Avatar.dc.html (the SVG body was converted mechanically from that
// file's template; colours are character art, listed in palette.ts, not UI tokens).
import { memo, useMemo } from "react";
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";
import { avatarValues } from "./palette";

interface AvatarProps {
  /** 8 digits, e.g. "13050010". Non-digits are dropped; short configs are padded with 0. */
  config: string;
  size: number;
  accessibilityLabel?: string;
}

export const Avatar = memo(function Avatar({ config, size, accessibilityLabel }: AvatarProps) {
  const v = useMemo(() => avatarValues(config), [config]);
  return (
    <Svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
    >
      <Rect width="100" height="100" fill={v.bg} />
      <Path d="M50 0 L100 0 L100 100 L50 100 Z" fill={v.bgD} />
      <Circle cx="50" cy="50" r="45" fill={v.bgL} />
      <Path d="M50 5 A45 45 0 0 1 50 95 Z" fill={v.bg} />
      <Circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.6" />
      {v.o0 && (
      <G >
      <Path d="M29 80 C25 60 36 51 50 51 C64 51 75 60 71 80 Z" fill={v.oc} />
      <Path d="M50 51 C64 51 75 60 71 80 L50 80 Z" fill={v.ocD} />
      </G>
      )}
      {v.i1 && (
      <G transform={`translate(${v.erx} ${v.ery}) rotate(22)`}>
      <Rect x="-3" y="-19" width="12" height="16" rx="2" fill="#FAF8F2" />
      <Rect x="-3" y="-19" width="12" height="16" rx="2" fill="none" stroke="#C5F25C" strokeWidth="1" />
      <SvgText x="-0.5" y="-10" fontSize="6.5" fontWeight="800" fontFamily="Geist,Arial,sans-serif" fill="#1E1B2E">
      A
      </SvgText>
      </G>
      )}
      <Rect x="44" y="56" width="12" height="20" fill={v.skD} />
      <Path d="M14 100 C14 82 29 73 50 73 L50 100 Z" fill={v.oc} />
      <Path d="M50 73 C71 73 86 82 86 100 L50 100 Z" fill={v.ocD} />
      {v.o0 && (
      <G >
      <Path d="M45 77 L44 91 M55 77 L56 91" fill="none" stroke={v.ocL} strokeWidth="2.4" />
      <Circle cx="44" cy="92" r="1.8" fill={v.ocL} />
      <Circle cx="56" cy="92" r="1.8" fill={v.ocL} />
      </G>
      )}
      {v.o1 && (
      <G >
      <Path d="M42 73 Q50 82 58 73 Z" fill={v.skD} />
      </G>
      )}
      {v.o2 && (
      <G >
      <Path d="M42 73 Q50 82 58 73 Z" fill={v.skD} />
      <Path d="M40 74 Q50 92 60 74" fill="none" stroke="#F2C14E" strokeWidth="2.6" strokeDasharray="0.1 3.4" />
      <Circle cx="50" cy="87" r="4.4" fill="#C5F25C" />
      <Circle cx="50" cy="87" r="4.4" fill="none" stroke="#1E1B2E" strokeWidth="1.2" />
      <Path d="M48.6 85 L48.6 89 M48.6 87 L51.4 85 M48.6 87 L51.4 89" fill="none" stroke="#1E1B2E" strokeWidth="1.1" />
      </G>
      )}
      {v.o3 && (
      <G >
      <Path d="M44 73 L50 86 L56 73 Z" fill="#F2F0EA" />
      <Path d="M41 73 L50 88 L44 100 L39 100 Z" fill={v.ocL} />
      <Path d="M59 73 L50 88 L56 100 L61 100 Z" fill={v.ocDD} />
      </G>
      )}
      {v.o4 && (
      <G >
      <Path d="M46 65 L50 65 L50 79 L46 79 A6 7 0 0 1 46 65 Z" fill={v.oc} />
      <Path d="M50 65 L54 65 A6 7 0 0 1 54 79 L50 79 Z" fill={v.ocD} />
      <Path d="M44 70 L56 70 M44 74 L56 74" stroke={v.ocDD} strokeWidth="1" />
      </G>
      )}
      {v.s0 && (
      <G >
      <Circle cx="31" cy="48" r="4.2" fill={v.sk} />
      <Circle cx="69" cy="48" r="4.2" fill={v.skD} />
      <Path d="M50 26 A18 21 0 0 0 50 68 Z" fill={v.sk} />
      <Path d="M50 26 A18 21 0 0 1 50 68 Z" fill={v.skD} />
      <Path d="M31 44 C30 27 40 22 50 22 C61 22 71 28 69 44 C66 35 58 31 50 32 C43 32 37 35 31 44 Z" fill="#241E2E" />
      <Path d="M36 33 C40 27 46 25 52 25" fill="none" stroke="#3A3248" strokeWidth="2.4" />
      <Path d="M51 50 Q53.5 53 51 54.5" fill="none" stroke={v.skDD} strokeWidth="1.8" />
      <Path d="M46 59 Q50 62 54 59" fill="none" stroke="#1E1B2E" strokeWidth="2" />
      {v.eD && (
      <G >
      <Circle cx="43" cy="47" r="2.5" fill="#1E1B2E" />
      <Circle cx="57" cy="47" r="2.5" fill="#1E1B2E" />
      <Circle cx="43.8" cy="46.2" r="0.8" fill="#fff" />
      <Circle cx="57.8" cy="46.2" r="0.8" fill="#fff" />
      </G>
      )}
      </G>
      )}
      {v.s1 && (
      <G >
      <Path d="M30 40 L27 15 L45 30 Z" fill={v.sk} />
      <Path d="M70 40 L73 15 L55 30 Z" fill={v.skD} />
      <Path d="M31.5 33 L29.5 21 L39.5 29 Z" fill="#2A1A14" />
      <Path d="M68.5 33 L70.5 21 L60.5 29 Z" fill="#2A1A14" />
      <Path d="M50 69 L27 38 C33 28 43 25 50 25 Z" fill={v.sk} />
      <Path d="M50 69 L73 38 C67 28 57 25 50 25 Z" fill={v.skD} />
      <Path d="M50 69 L32 45 C39 50 45 52 50 52 Z" fill="#F7F1E8" />
      <Path d="M50 69 L68 45 C61 50 55 52 50 52 Z" fill="#E2DAD0" />
      <Ellipse cx="50" cy="64" rx="3.4" ry="2.5" fill="#1E1B2E" />
      {v.eD && (
      <G >
      <Path d="M38 44 Q41.5 40.5 45 44 Q41.5 46 38 44 Z" fill="#1E1B2E" />
      <Path d="M62 44 Q58.5 40.5 55 44 Q58.5 46 62 44 Z" fill="#1E1B2E" />
      </G>
      )}
      </G>
      )}
      {v.s2 && (
      <G >
      <Path d="M32 38 L31 17 L47 30 Z" fill={v.sk} />
      <Path d="M68 38 L69 17 L53 30 Z" fill={v.skD} />
      <Path d="M34 33 L33.5 23 L41.5 29.5 Z" fill="#F49AB8" />
      <Path d="M66 33 L66.5 23 L58.5 29.5 Z" fill="#E07FA0" />
      <Path d="M50 31 A19 17 0 0 0 50 65 Z" fill={v.sk} />
      <Path d="M50 31 A19 17 0 0 1 50 65 Z" fill={v.skD} />
      <Path d="M47.5 53 L52.5 53 L50 56 Z" fill="#F472B6" />
      <Path d="M50 56 Q47.5 59.5 45 57.5 M50 56 Q52.5 59.5 55 57.5" fill="none" stroke="#1E1B2E" strokeWidth="1.7" />
      <Path d="M29 52 L39 54 M29 57 L39 56 M71 52 L61 54 M71 57 L61 56" stroke="#1E1B2E" strokeOpacity="0.55" strokeWidth="1.3" />
      {v.eD && (
      <G >
      <Ellipse cx="42" cy="47" rx="2.6" ry="3.2" fill="#1E1B2E" />
      <Ellipse cx="58" cy="47" rx="2.6" ry="3.2" fill="#1E1B2E" />
      <Circle cx="42.8" cy="46" r="0.9" fill="#fff" />
      <Circle cx="58.8" cy="46" r="0.9" fill="#fff" />
      </G>
      )}
      </G>
      )}
      {v.s3 && (
      <G >
      <Circle cx="38" cy="37" r="8.5" fill={v.sk} />
      <Circle cx="62" cy="37" r="8.5" fill={v.skD} />
      <Path d="M50 37 A23 15 0 0 0 50 67 Z" fill={v.sk} />
      <Path d="M50 37 A23 15 0 0 1 50 67 Z" fill={v.skD} />
      <Path d="M33 55 Q50 67 67 55" fill="none" stroke="#1E1B2E" strokeWidth="2.3" />
      <Circle cx="34" cy="58" r="2.6" fill="#F49AB8" fillOpacity="0.7" />
      <Circle cx="66" cy="58" r="2.6" fill="#F49AB8" fillOpacity="0.7" />
      {v.eD && (
      <G >
      <Circle cx="38" cy="37" r="5" fill="#fff" />
      <Circle cx="62" cy="37" r="5" fill="#F1F1F1" />
      <Circle cx="39" cy="38" r="2.6" fill="#1E1B2E" />
      <Circle cx="63" cy="38" r="2.6" fill="#1E1B2E" />
      </G>
      )}
      </G>
      )}
      {v.s4 && (
      <G >
      <Circle cx="33" cy="31" r="7.5" fill={v.sk} />
      <Circle cx="67" cy="31" r="7.5" fill={v.skD} />
      <Circle cx="33" cy="31" r="3.6" fill={v.skDD} />
      <Circle cx="67" cy="31" r="3.6" fill={v.skDD} />
      <Path d="M50 28 A19 19 0 0 0 50 66 Z" fill={v.sk} />
      <Path d="M50 28 A19 19 0 0 1 50 66 Z" fill={v.skD} />
      <Ellipse cx="50" cy="56" rx="9.5" ry="7.5" fill={v.skL} />
      <Ellipse cx="50" cy="53" rx="3.6" ry="2.6" fill="#1E1B2E" />
      <Path d="M50 55.5 L50 58.5 M46.5 59.5 Q50 62 53.5 59.5" fill="none" stroke="#1E1B2E" strokeWidth="1.7" />
      {v.eD && (
      <G >
      <Circle cx="42" cy="45" r="2.5" fill="#1E1B2E" />
      <Circle cx="58" cy="45" r="2.5" fill="#1E1B2E" />
      <Circle cx="42.8" cy="44.2" r="0.8" fill="#fff" />
      <Circle cx="58.8" cy="44.2" r="0.8" fill="#fff" />
      </G>
      )}
      </G>
      )}
      {v.s5 && (
      <G >
      <Path d="M50 28 L50 17" stroke={v.skDD} strokeWidth="2.6" />
      <Circle cx="50" cy="15" r="3.8" fill="#C5F25C" />
      <Circle cx="50" cy="15" r="6.5" fill="#C5F25C" fillOpacity="0.25" />
      <Rect x="26" y="41" width="6" height="13" rx="2.5" fill={v.sk} />
      <Rect x="68" y="41" width="6" height="13" rx="2.5" fill={v.skD} />
      <Path d="M50 28 L38 28 Q31 28 31 35 L31 58 Q31 65 38 65 L50 65 Z" fill={v.sk} />
      <Path d="M50 28 L62 28 Q69 28 69 35 L69 58 Q69 65 62 65 L50 65 Z" fill={v.skD} />
      <Rect x="35" y="38" width="30" height="13" rx="6.5" fill="#1E1B2E" />
      <Path d="M41 58 L59 58" stroke={v.skDD} strokeWidth="2.2" />
      <Path d="M44 56 L44 60 M48 56 L48 60 M52 56 L52 60 M56 56 L56 60" stroke={v.skDD} strokeWidth="1.2" />
      {v.eD && (
      <G >
      <Rect x="39.5" y="42" width="7" height="5" rx="2" fill="#C5F25C" />
      <Rect x="53.5" y="42" width="7" height="5" rx="2" fill="#C5F25C" />
      </G>
      )}
      </G>
      )}
      {v.s6 && (
      <G >
      <Path d="M50 25 A19 19 0 0 0 50 63 Z" fill={v.sk} />
      <Path d="M50 25 A19 19 0 0 1 50 63 Z" fill={v.skD} />
      <Path d="M41 56 L50 56 L50 68 L44 68 Q41 68 41 65 Z" fill={v.sk} />
      <Path d="M59 56 L50 56 L50 68 L56 68 Q59 68 59 65 Z" fill={v.skD} />
      <Ellipse cx="43" cy="45" rx="5.2" ry="5.8" fill="#1E1B2E" />
      <Ellipse cx="57" cy="45" rx="5.2" ry="5.8" fill="#1E1B2E" />
      <Path d="M48.5 52 L51.5 52 L50 55.5 Z" fill="#1E1B2E" />
      <Path d="M45 61 L45 67 M50 61 L50 67 M55 61 L55 67" stroke={v.skDD} strokeWidth="1.5" />
      {v.eD && (
      <G >
      <Circle cx="43.5" cy="45.5" r="1.7" fill="#C5F25C" />
      <Circle cx="57.5" cy="45.5" r="1.7" fill="#C5F25C" />
      </G>
      )}
      </G>
      )}
      {v.s7 && (
      <G >
      <Path d="M50 22 C38 22 29 30 29 41 C29 55 41 66 50 66 Z" fill={v.sk} />
      <Path d="M50 22 C62 22 71 30 71 41 C71 55 59 66 50 66 Z" fill={v.skD} />
      <Path d="M47 58 Q50 60 53 58" fill="none" stroke="#1E1B2E" strokeWidth="1.8" />
      {v.eD && (
      <G >
      <Path d="M35 41 C37 35 46 37 47 45 C42 48.5 36 47 35 41 Z" fill="#1E1B2E" />
      <Path d="M65 41 C63 35 54 37 53 45 C58 48.5 64 47 65 41 Z" fill="#1E1B2E" />
      <Ellipse cx="40" cy="41" rx="1.6" ry="1.1" fill="#fff" />
      <Ellipse cx="60" cy="41" rx="1.6" ry="1.1" fill="#fff" fillOpacity="0.8" />
      </G>
      )}
      </G>
      )}
      {v.e1 && (
      <G >
      <Path d={v.sl} fill="none" stroke="#1E1B2E" strokeWidth="2.3" />
      </G>
      )}
      {v.e2 && (
      <G >
      <Path d={v.lz} fill="none" stroke="#C5F25C" strokeOpacity="0.55" strokeWidth="3.4" />
      <Circle cx={v.ex1} cy={v.ey} r="5.5" fill="#C5F25C" fillOpacity="0.35" />
      <Circle cx={v.ex2} cy={v.ey} r="5.5" fill="#C5F25C" fillOpacity="0.35" />
      <Circle cx={v.ex1} cy={v.ey} r="2.8" fill="#C5F25C" />
      <Circle cx={v.ex2} cy={v.ey} r="2.8" fill="#C5F25C" />
      <Circle cx={v.ex1} cy={v.ey} r="1.1" fill="#fff" />
      <Circle cx={v.ex2} cy={v.ey} r="1.1" fill="#fff" />
      </G>
      )}
      {v.e3 && (
      <G >
      <Rect x={v.shx} y={v.shy} width={v.shw} height="8.5" rx="3.5" fill="#1E1B2E" />
      <Path d={v.shg} fill="none" stroke="#C5F25C" strokeWidth="1.6" />
      </G>
      )}
      {v.i2 && (
      <G >
      <Circle cx={v.elx} cy={v.ely} r="2.8" fill="none" stroke="#F2C14E" strokeWidth="1.8" />
      </G>
      )}
      {v.i3 && (
      <G transform={`translate(${v.bx} ${v.by}) rotate(-24)`}>
      <Rect x="-5" y="-2.2" width="10" height="4.4" rx="1.6" fill="#F7D9B5" />
      <Path d="M-1 -1 L1 1 M1 -1 L-1 1" stroke="#C9A27A" strokeWidth="0.8" />
      </G>
      )}
      <G transform={`translate(0 ${v.dy})`}>
      {v.h1 && (
      <G >
      <Path d="M30 38 C30 22 40 15 50 15 C60 15 70 22 70 38 Z" fill={v.oc} />
      <Path d="M50 15 C60 15 70 22 70 38 L50 38 Z" fill={v.ocD} />
      <Rect x="28" y="33" width="44" height="8" rx="4" fill={v.ocL} />
      <Circle cx="50" cy="13" r="4.6" fill={v.ocL} />
      </G>
      )}
      {v.h2 && (
      <G >
      <Path d="M31 36 C31 22 40 17 50 17 C60 17 69 22 69 36 Z" fill="#C5F25C" />
      <Path d="M50 17 C60 17 69 22 69 36 L50 36 Z" fill="#9CC23A" />
      <Path d="M32 33 L15 35 Q14 39 20 39 L33 38 Z" fill="#7FA02A" />
      <Circle cx="50" cy="18" r="1.8" fill="#7FA02A" />
      </G>
      )}
      {v.h3 && (
      <G >
      <Path d="M36 27 L38 12 L44 19 L50 9 L56 19 L62 12 L64 27 Z" fill="#F2C14E" />
      <Path d="M50 9 L56 19 L62 12 L64 27 L50 27 Z" fill="#D9A42E" />
      <Circle cx="50" cy="22" r="2.2" fill="#F472B6" />
      <Circle cx="42" cy="23" r="1.4" fill="#38BDF8" />
      <Circle cx="58" cy="23" r="1.4" fill="#38BDF8" />
      </G>
      )}
      {v.h4 && (
      <G >
      <Ellipse cx="50" cy="13" rx="15" ry="4.4" fill="none" stroke="#C5F25C" strokeOpacity="0.35" strokeWidth="6" />
      <Ellipse cx="50" cy="13" rx="15" ry="4.4" fill="none" stroke="#C5F25C" strokeWidth="2.6" />
      </G>
      )}
      {v.h5 && (
      <G >
      <Path d="M28 35 Q50 24 72 35 L72 39 Q50 30 28 39 Z" fill="#1E1B2E" />
      <Path d="M29 37 Q50 27 71 37 Q76 45 64 46 Q50 37 36 46 Q24 45 29 37 Z" fill="#C5F25C" fillOpacity="0.88" />
      <Path d="M34 38 Q50 31 62 36" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.4" />
      </G>
      )}
      </G>
    </Svg>
  );
});
