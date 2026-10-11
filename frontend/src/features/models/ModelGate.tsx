// The Live gate's content: why the models are needed, the download with real progress, and the way out.
// A0 (full screen) and A1·m (a sheet) both render it inside their own layout.
import { View } from "react-native";
import { t } from "@/copy";
import { Button } from "@/components/actions";
import { Note, Title } from "@/components/content/Basics";
import { Text } from "@/components/primitives";
import { color, metrics } from "@/theme";
import { useModelDownload } from "./deviceModels";

const GB = 1_000_000_000;
const MB = 1_000_000;
export const formatBytes = (n: number) => (n >= GB ? t("additions.mode.modelGB", { n: (n / GB).toFixed(2) }) : t("additions.mode.modelMB", { n: Math.round(n / MB) }));

/** A bar in the HP bar's segments: fill left to right, the rest in the empty colour. */
function ProgressBar({ fraction, label }: { fraction: number; label: string }) {
  const lit = Math.round(Math.min(1, Math.max(0, fraction)) * metrics.hpBar.segments);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={{ flexDirection: "row", gap: metrics.hpBar.gap }}>
      {Array.from({ length: metrics.hpBar.segments }, (_, i) => (
        <View key={i} style={{ flex: 1, height: metrics.hpBar.height, borderRadius: metrics.hpBar.radius, backgroundColor: i < lit ? color.lime.base : color.line.empty }} />
      ))}
    </View>
  );
}

export function ModelGate({ unsupported, onReady, onLater, sheet = false }: { unsupported: boolean; onReady: () => void | Promise<void>; onLater: () => void; sheet?: boolean }) {
  const dl = useModelDownload(onReady);
  const fraction = dl.total > 0 ? dl.bytes / dl.total : 0;
  const percent = Math.round(fraction * 100);
  const downloading = dl.phase === "downloading";
  return (
    <>
      <Title heading={t("additions.mode.modelTitle")} sub={unsupported ? t("additions.mode.modelUnsupported") : t("additions.mode.modelSub")} {...(sheet ? { pt: 0, fs: 26 } : { align: "center" as const })} />
      {dl.busy ? (
        <View style={{ gap: metrics.screen.gap / 2 }}>
          <ProgressBar fraction={fraction} label={t("additions.mode.modelProgressA11y", { percent })} />
          <Text variant="note" align="center">
            {dl.phase === "verifying" ? t("additions.mode.modelVerifying") : t("additions.mode.modelProgress", { done: formatBytes(dl.bytes), total: formatBytes(dl.total) })}
          </Text>
        </View>
      ) : null}
      {dl.error ? <Note text={t(dl.error === "storage" ? "additions.mode.modelStorageError" : "additions.mode.modelDownloadError")} /> : null}
      {!unsupported ? (
        <Button kind="p" label={dl.busy ? t("additions.mode.modelDownloading") : t(dl.resumeBytes > 0 ? "additions.mode.modelResume" : "additions.mode.modelDownload")}
          loading={dl.busy} disabled={dl.busy} onPress={() => { void dl.start(); }} />
      ) : null}
      {/* While the transfer runs the way out is Pause (the partial files stay); otherwise it leaves the gate. */}
      <Button kind="t" label={t(downloading ? "additions.mode.modelPause" : "additions.mode.modelNotNow")} disabled={dl.busy && !downloading} onPress={downloading ? dl.pause : onLater} />
    </>
  );
}
