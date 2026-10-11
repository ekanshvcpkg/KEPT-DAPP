// The Keeper: the parametric rig from design/reference/Keeper.dc.html (moods × props × anims, blink and
// breathing on the UI thread), drawn with Skia (KeeperSkia). No PNG fallback ships (DECISIONS D-33):
// Reduce Motion holds the still pose.
import { View } from "react-native";
import type { KeeperMood } from "@/copy";
import { t } from "@/copy";
import { env } from "@/config/env";
import { KeeperSkia } from "./KeeperSkia";
import type { KeeperAnimName, KeeperPropName } from "./rig";

export type KeeperProp = KeeperPropName;
export type KeeperAnim = KeeperAnimName;

interface KeeperProps {
  mood: KeeperMood;
  prop?: KeeperProp;
  anim?: KeeperAnim;
  /** Character width in dp; full-body height is size × 1.125 (components.md › Keeper). */
  size: number;
  bust?: boolean;
  /** Hold the still pose (no blink, breathing or gestures). */
  animate?: boolean;
}

export function Keeper({ mood, prop = "none", anim = "idle", size, bust, animate = true }: KeeperProps) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t("additions.a11y.keeper")}>
      <KeeperSkia mood={mood} prop={prop} anim={anim} size={size} bust={!!bust} animate={animate && !env.keeperStill} />
    </View>
  );
}
