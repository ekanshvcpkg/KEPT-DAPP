import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { splitShadow } from "@/theme";
import type { GradientProps } from "@/theme";
import { Gradient } from "./Gradient";

interface SurfaceProps {
  radius: number;
  /** Solid fill, or a gradient. */
  bg?: string;
  gradient?: GradientProps;
  /** A CSS box-shadow list (token `.css` or a component recipe); inset layers are drawn above the fill. */
  shadow?: string;
  /** Extra overlay (e.g. the card sheen) drawn above the fill, below children. */
  overlay?: GradientProps;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  clip?: boolean;
}

/** A rounded surface with an optional gradient fill and the prototype's outer + inset shadow recipe. */
export function Surface({ radius, bg, gradient, shadow, overlay, style, children, clip }: SurfaceProps) {
  const { outer, inset } = shadow ? splitShadow(shadow) : { outer: undefined, inset: undefined };
  return (
    <View style={[{ borderRadius: radius, backgroundColor: gradient ? undefined : bg }, outer ? { boxShadow: outer } : null, style]}>
      {gradient || overlay || inset ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
          {gradient ? <Gradient g={gradient} style={StyleSheet.absoluteFill} /> : null}
          {overlay ? <Gradient g={overlay} style={StyleSheet.absoluteFill} /> : null}
        </View>
      ) : null}
      {/* flexGrow: a `flex: 1` child of a fixed-height surface would otherwise collapse to 0 (HScroller). */}
      {clip ? <View style={{ flexGrow: 1, borderRadius: radius, overflow: "hidden" }}>{children}</View> : children}
      {inset ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, boxShadow: inset }]} /> : null}
    </View>
  );
}
