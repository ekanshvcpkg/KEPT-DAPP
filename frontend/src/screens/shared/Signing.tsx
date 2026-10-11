// Shared wallet-signing pieces: the transient signing screen (C7, D1·go, D1·xs, E2·s, J1·p) and the
// outcome screens every signature can land on (C7·no, C7·fail, M3, M4), per flows.md.
import { useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { BackHandler, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { keeperLines, t } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { NavBar } from "@/components/chrome";
import { BottomSheet } from "@/components/chrome";
import { Note, Title } from "@/components/content/Basics";
import { SignStatus } from "@/components/content/Status";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { metrics } from "@/theme";
import { useBalances } from "@/api/queries";
import { isApiError } from "@/api";
import { classifyTxError } from "@/chain";
import { useGo, useParams, useSheetRoute } from "@/app/nav";
import type { Params } from "@/app/nav";
import type { DesignId } from "@/app/routes";
import { useSigningFlow } from "@/app/useSigningFlow";
import type { SignOutcome } from "@/app/useSigningFlow";
import { skrWhole } from "@/features/oaths/present";
import { useIsDemo } from "@/state/mode";

/** Where a failed signature goes. `retry` re-runs the same signing screen with the same params. */
interface FailRoutes { retry: DesignId; edit: DesignId; params?: Params; failed?: DesignId; noSkr?: DesignId }

function failureOutcome(e: unknown, r: FailRoutes): SignOutcome {
  if (isApiError(e)) {
    const params = { ...r.params, retry: r.retry, edit: r.edit };
    if (e.code === "OFFLINE") return { to: "M2" };
    if (e.code === "INSUFFICIENT_SOL") return { to: "M3", params };
    if (e.code === "INSUFFICIENT_SKR") return { to: r.noSkr ?? "M4", params };
    return { to: r.failed ?? "C7·fail", params };
  }
  const f = classifyTxError(e);
  const params = { ...r.params, retry: r.retry, edit: r.edit };
  switch (f.kind) {
    case "rejected": return { to: "C7·no", params };
    case "insufficientSol": return { to: "M3", params };
    case "insufficientSkr": return { to: r.noSkr ?? "M4", params };
    case "offline": return { to: "M2" };
    default: return { to: r.failed ?? "C7·fail", params };
  }
}

/** A transient signing screen: runs `task` once and replaces itself with the outcome. */
export function SigningScreen<T>({ title, sub, task, onDone, fail }: {
  title: string; sub: string; task: () => Promise<T>; onDone: (r: T) => SignOutcome; fail: FailRoutes;
}) {
  const { back } = useGo();
  const resolve = useCallback((r: { ok: true; value: T } | { ok: false; error: unknown }): SignOutcome =>
    (r.ok ? onDone(r.value) : failureOutcome(r.error, fail)), [onDone, fail]);
  const state = useSigningFlow(task, resolve);
  const demo = useIsDemo();
  // Transient (flows.md): hardware back can't leave while the wallet is signing; the close button cancels.
  const pending = state === "pending";
  useFocusEffect(useCallback(() => {
    if (!pending) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [pending]));
  return (
    <Screen bar={<NavBar onBack={back} close />}>
      <SignStatus state={state} chip={t("screens.C7.b1.chip")} />
      <Title heading={title} sub={sub} align="center" />
      {/* Demo has no wallet: the mock approves, and the screen says so. */}
      {demo ? <Note text={t("additions.mode.simulated")} icon="information-outline" /> : <Note text={t("screens.C7.b3.text")} icon="timer-sand" />}
    </Screen>
  );
}

// ── C7·no Signed · rejected ──
export function C7no() {
  const { replace } = useGo();
  const p = useParams<{ retry: string; edit: string } & Params>();
  const k = keeperLines("C7·no")[0]!;
  const { retry = "C7", edit = "C6", ...rest } = p;
  return (
    <Screen bottomInset={metrics.button.height * 2 + metrics.pinned.gap + metrics.pinned.bottom} pinned={<>
      <Button kind="p" label={t("screens.C7·no.pin.0")} onPress={() => replace(retry as DesignId, rest)} />
      <Button kind="t" label={t("screens.C7·no.pin.1")} onPress={() => replace(edit as DesignId, rest)} />
    </>}>
      <ScreenKeeper id="C7·no" lines={[k]} />
      <Title heading={t("screens.C7·no.b2.title")} sub={t("screens.C7·no.b2.sub")} align="center" />
    </Screen>
  );
}

// ── C7·fail Signed · failed ──
export function C7fail() {
  const { replace } = useGo();
  const p = useParams<{ retry: string; edit: string } & Params>();
  const { retry = "C7", edit = "C6", ...rest } = p;
  return (
    <Screen bottomInset={metrics.button.height * 2 + metrics.pinned.gap + metrics.pinned.bottom} pinned={<>
      <Button kind="p" label={t("screens.C7·fail.pin.0")} onPress={() => replace(retry as DesignId, rest)} />
      <Button kind="t" label={t("screens.C7·fail.pin.1")} onPress={() => replace(edit as DesignId, rest)} />
    </>}>
      <SignStatus state="fail" chip={t("screens.C7·fail.b1.chip")} />
      <Title heading={t("screens.C7·fail.b2.title")} sub={t("screens.C7·fail.b2.sub")} align="center" />
    </Screen>
  );
}

// ── M3 Not enough SOL ── (devnet SOL comes from a faucet; the button opens W2 once it exists)
export function M3() {
  const { back, replace } = useGo();
  const insets = useSafeAreaInsets();
  const sheet = useSheetRoute();
  const balances = useBalances();
  const k = keeperLines("M3")[0]!;
  const sol = balances.data ? (Number(balances.data.sol) / 1e9).toString() : "0";
  return (
    <View style={{ flex: 1 }}>
      <BottomSheet {...sheet} bottomInset={insets.bottom}>
        <ScreenKeeper id="M3" lines={[k]} />
        <Title heading={t("screens.M3.b1.title")} sub={t("screens.M3.b1.sub", { sol })} pt={0} fs={26} />
        <ButtonRow direction="column">
          <Button kind="p" icon="water-outline" label={t("screens.M3.b2.btn.0")} onPress={() => replace("W2")} />
          <Button kind="s" label={t("screens.M3.b2.btn.1")} onPress={back} />
        </ButtonRow>
      </BottomSheet>
    </View>
  );
}

// ── M4 Not enough SKR ──
export function M4() {
  const { replace } = useGo();
  const p = useParams<{ need: string }>();
  const insets = useSafeAreaInsets();
  const sheet = useSheetRoute();
  const balances = useBalances();
  const have = balances.data ? skrWhole(balances.data.skr) : "0";
  return (
    <View style={{ flex: 1 }}>
      <BottomSheet {...sheet} bottomInset={insets.bottom}>
        <Title heading={t("screens.M4.b0.title", { amount: p.need ?? "" })} sub={t("screens.M4.b0.sub", { have })} pt={0} fs={26} />
        <ButtonRow direction="column">
          <Button kind="p" icon="water-outline" label={t("screens.M4.b1.btn.0")} onPress={() => replace("I4")} />
          <Button kind="s" label={t("screens.M4.b1.btn.1")} onPress={() => replace("C4")} />
        </ButtonRow>
      </BottomSheet>
    </View>
  );
}
