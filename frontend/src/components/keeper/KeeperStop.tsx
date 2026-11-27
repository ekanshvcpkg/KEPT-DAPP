// While the Keeper speaks (any line: an answer, a verdict, a transaction read out), a small pill lets the user stop it.
import { Pressable, View } from "react-native";
import { t } from "@/copy";
import { Icon, Text } from "@/components/primitives";
import { color, metrics, type as typeStyles } from "@/theme";
import { stopKeeper, useKeeperSpeaking } from "@/features/keeper/voice";

export function KeeperStopHost() {
  const speaking = useKeeperSpeaking((s) => s.speaking);
  if (!speaking) return null;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: metrics.screen.gap * 6, alignItems: "center" }}>
      <Pressable onPress={stopKeeper} accessibilityRole="button" accessibilityLabel={t("additions.keeper.stopSpeaking")} hitSlop={metrics.screen.gap}
        style={{ flexDirection: "row", alignItems: "center", gap: metrics.screen.gap / 2, minHeight: 48, paddingHorizontal: metrics.screen.gap * 1.25, borderRadius: 999, backgroundColor: color.text.primary }}>
        <Icon name="volume-off" size={metrics.row.chevron} color={color.bg.app} />
        <Text style={[typeStyles.buttonSm, { color: color.bg.app }]}>{t("additions.keeper.stopSpeaking")}</Text>
      </Pressable>
    </View>
  );
}
