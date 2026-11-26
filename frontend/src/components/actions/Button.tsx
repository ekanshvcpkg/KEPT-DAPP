import { Children } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { color, gradient, metrics, shadow, type as typeStyles } from "@/theme";
import { Icon, Loop, PressScale, Surface, Text } from "../primitives";
import type { IconName } from "../primitives";
import { Shine } from "./Shine";

/** p primary · l lime (money / commit) · s secondary · t text · d destructive (components.md › Button). */
export type ButtonKind = "p" | "l" | "s" | "t" | "d";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  /** Hold-to-talk style buttons (press and release), e.g. "Ask the Keeper". */
  onPressIn?: () => void;
  onPressOut?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  /** "pinned" 54 (default), "card" 50 inside OathCard, "row" 54 with the smaller label (ButtonRow). Kind t is always 44. */
  size?: "pinned" | "card" | "row";
  disabled?: boolean;
  /** Only where a signature is pending; the label is replaced by a spinner. */
  loading?: boolean;
  testID?: string;
}

const KIND = {
  p: { gradient: gradient("buttonPrimary"), fg: color.text.onLime, shadow: shadow("buttonPrimary").boxShadow },
  l: { gradient: gradient("buttonLime"), fg: color.text.onLime, shadow: shadow("buttonLime").boxShadow },
  s: { bg: color.surface[2], fg: color.text.primary, shadow: `inset 0 0 0 1px ${color.line.hairline3}` },
  t: { bg: color.extra.transparent, fg: color.text.secondary },
  d: { bg: color.red.tint14, fg: color.red.base },
} as const;

export function Button({ label, onPress, onPressIn, onPressOut, kind = "p", icon, size = "pinned", disabled, loading, testID }: ButtonProps) {
  const h = kind === "t" ? metrics.button.heightText : size === "card" ? metrics.button.heightCard : metrics.button.height;
  const k = KIND[kind];
  const off = disabled === true;
  const fg = off ? color.extra.disabledFg : k.fg;
  return (
    <PressScale
      onPress={onPress}
      {...(onPressIn ? { onPressIn } : {})}
      {...(onPressOut ? { onPressOut } : {})}
      disabled={off || loading}
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: !!loading }}
      hit={{ w: h, h }}
      {...(testID ? { testID } : {})}
    >
      <Surface
        radius={h / 2}
        {...(off ? { bg: color.surface[2] } : "gradient" in k ? { gradient: k.gradient } : { bg: k.bg })}
        {...(!off && "shadow" in k ? { shadow: k.shadow } : {})}
        clip
        style={{ height: h }}
      >
        <View style={{ height: h, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: metrics.button.gap, paddingHorizontal: metrics.button.gap * 2 }}>
          {loading ? (
            <Loop kind="spin"><Icon name="loading" size={metrics.button.icon} color={fg} /></Loop>
          ) : (
            <>
              {icon ? <Icon name={icon} size={size === "row" ? metrics.button.rowIcon : metrics.button.icon} color={fg} /> : null}
              <Text style={[size === "row" ? typeStyles.buttonSm : typeStyles.button, { color: fg }]} numberOfLines={1}>{label}</Text>
            </>
          )}
        </View>
        {kind === "l" && !off && !loading ? <Shine /> : null}
      </Surface>
    </PressScale>
  );
}

/** RowButton: 36 h pill inside rows and inbox items (same kinds). */
export function RowButton({ label, onPress, kind = "s" }: { label: string; onPress?: () => void; kind?: ButtonKind }) {
  const k = KIND[kind];
  return (
    <PressScale onPress={onPress} accessibilityLabel={label} hit={{ w: metrics.rowButton.height, h: metrics.rowButton.height }}>
      <Surface radius={metrics.rowButton.radius} {...("gradient" in k ? { gradient: k.gradient } : { bg: k.bg })} {...("shadow" in k ? { shadow: k.shadow } : {})}
        style={{ height: metrics.rowButton.height, paddingHorizontal: metrics.rowButton.padX, justifyContent: "center" }}>
        <Text variant="chipMd" color={k.fg} numberOfLines={1}>{label}</Text>
      </Surface>
    </PressScale>
  );
}

/** PinnedActions: column of Buttons pinned 20 from the sides, 34 from the bottom, gap 6. */
export function PinnedActions({ children, bottomInset = 0 }: { children: ReactNode; bottomInset?: number }) {
  return (
    <View style={{ position: "absolute", left: metrics.pinned.x, right: metrics.pinned.x, bottom: metrics.pinned.bottom + bottomInset, gap: metrics.pinned.gap, zIndex: 20 }}>
      {children}
    </View>
  );
}

/** ButtonRow: a row (or column) of equal-width buttons, gap 8. */
export function ButtonRow({ children, direction = "row" }: { children: ReactNode; direction?: "row" | "column" }) {
  return (
    <View style={{ flexDirection: direction, gap: metrics.option.gap }}>
      {Children.map(children, (c) => (direction === "row" ? <View style={{ flex: 1 }}>{c}</View> : c))}
    </View>
  );
}

