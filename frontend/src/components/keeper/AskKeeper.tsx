// "Ask the Keeper": hold to ask a question out loud; the Keeper answers in its voice from your own Oaths and receipts.
import { useState } from "react";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { t } from "@/copy";
import { Button } from "@/components/actions";
import { useToast } from "@/components/chrome";
import { Note } from "@/components/content/Basics";
import { askKeeper, fileToBase64, type KeeperAnswer } from "@/features/keeper/ask";
import { keeperSay } from "@/features/keeper/voice";
import { isApiError } from "@/api";

type Phase = "idle" | "listening" | "thinking";

export function AskKeeper() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [last, setLast] = useState<KeeperAnswer | null>(null);

  const start = async () => {
    if (phase !== "idle") return;
    const perm = await requestRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted) { toast(t("additions.keeper.askMicDenied")); return; }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase("listening");
    } catch {
      toast(t("additions.keeper.askFailed"));
    }
  };

  const stop = async () => {
    if (phase !== "listening") return;
    setPhase("thinking");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error("no recording");
      const answer = await askKeeper(await fileToBase64(uri));
      setLast(answer);
      keeperSay(answer.answer);
    } catch (e) {
      toast(isApiError(e) && e.status === 422 ? t("additions.keeper.askNotHeard") : t("additions.keeper.askFailed"));
    } finally {
      setPhase("idle");
    }
  };

  const label = phase === "listening" ? t("additions.keeper.askListening") : phase === "thinking" ? t("additions.keeper.askThinking") : t("additions.keeper.askHold");
  return (
    <>
      <Button kind="s" icon="microphone" label={label} loading={phase === "thinking"} onPressIn={() => { void start(); }} onPressOut={() => { void stop(); }} />
      {last ? <Note text={t("additions.keeper.askExchange", { question: last.question, answer: last.answer })} icon="message" /> : null}
    </>
  );
}
