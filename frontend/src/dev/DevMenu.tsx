// Dev menu (long-press the DEVNET badge, development builds only): API mode per slice and mock wallet
// (only before an app mode is chosen; Live is always http + MWA), mock scenario, virtual clock, jump to
// any screen, the Gallery, and sign-out.
// Developer-facing, so its labels are literals (lint-exempt like the Gallery).
import { View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet, useToast } from "@/components/chrome";
import { Button, ButtonRow } from "@/components/actions";
import { ChipRow, Segmented } from "@/components/content/Basics";
import { RowList } from "@/components/content/Rows";
import { PressScale, Text } from "@/components/primitives";
import { color, metrics, space } from "@/theme";
import { SLICES } from "@/api/types";
import { clock } from "@/lib/clock";
import { SCENARIOS } from "@/api/mock/scenarios";
import { getWallet } from "@/chain";
import { useNow } from "@/features/time";
import { env } from "@/config/env";
import { flags, useDev } from "@/state/dev";
import type { SliceMode } from "@/api/types";
import { useMode } from "@/state/mode";
import { useSession } from "@/state/session";
import { useUi } from "@/state/ui";
import { navigateTo, navigationRef } from "@/app/nav";
import { ROUTES } from "@/app/routes";
import type { DesignId } from "@/app/routes";
import { CommonActions } from "@react-navigation/native";

const MODES: SliceMode[] = ["mock", "http"];

function Label({ text }: { text: string }) {
  return <Text variant="monoLabel" color={color.lime.base} style={{ marginTop: space[8] }}>{text}</Text>;
}

function Pill({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} accessibilityLabel={text} accessibilityState={{ selected: on }}>
      <View style={{ height: metrics.chip.h, paddingHorizontal: metrics.chip.padR, borderRadius: metrics.chip.radius, justifyContent: "center", backgroundColor: on ? color.lime.base : color.surface[2] }}>
        <Text variant="chip" color={on ? color.text.onLime : color.text.secondary}>{text}</Text>
      </View>
    </PressScale>
  );
}

export function DevMenu() {
  const open = useUi((s) => s.devMenu);
  const setOpen = useUi((s) => s.setDevMenu);
  const dev = useDev();
  const session = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  // useNow follows the virtual clock (a useSyncExternalStore on clock.now looped: it changes every call).
  const now = useNow() * 1000;
  const mode = useMode((s) => s.mode);
  const f = flags(dev, mode);

  const refresh = () => { void qc.resetQueries(); };
  const jump = (id: DesignId) => { setOpen(false); navigateTo(id); };
  const openGallery = () => { setOpen(false); if (navigationRef.isReady()) navigationRef.navigate("Gallery"); };
  const signOut = async () => {
    await getWallet().forget();
    session.signOut();
    useSession.setState({ onboarded: false, avatar: null, invite: null });
    qc.clear();
    setOpen(false);
    if (navigationRef.isReady()) navigationRef.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "A0" }] }));
  };

  return (
    <BottomSheet visible={open} onClose={() => setOpen(false)}>
      <Text variant="headerTitle">Dev menu</Text>
      <Text variant="caption" color={color.text.tertiary}>{`API ${env.apiUrl} · app mode ${mode ?? "not chosen"} · ${session.wallet ?? "signed out"}`}</Text>

      <Label text="API MODE" />
      {mode === null ? <>
        <Segmented items={MODES} value={-1} onChange={(i) => { dev.setAll(MODES[i]!); refresh(); }} />
        <RowList rows={SLICES.map((s) => ({
          title: s, value: f[s], valueColor: f[s] === "http" ? color.lime.base : color.text.secondary,
          sub: dev.overrides[s] ? "override" : "default",
          onPress: () => { dev.setSlice(s, f[s] === "http" ? "mock" : "http"); refresh(); },
        }))} />
        <RowList rows={[{ title: "Mock wallet", sub: "Instead of MWA until a mode is chosen. Not saved.", toggle: { on: dev.mockWallet, onChange: dev.setMockWallet } }]} />
      </> : (
        <Text variant="caption" color={color.text.tertiary}>
          {mode === "live"
            ? `Live: ${env.apiUrl} + the wallet app (MWA) for every slice. Nothing here can swap in a mock; use Demo for that.`
            : "Demo: the mock backend, wallet and chain for every slice, offline. Overrides apply only before a mode is chosen."}
        </Text>
      )}

      <Label text="SCENARIO" />
      <ChipRow>{SCENARIOS.map((s) => <Pill key={s} text={s} on={dev.scenario === s} onPress={() => { dev.setScenario(s); refresh(); }} />)}</ChipRow>

      <Label text="VIRTUAL CLOCK (MOCK)" />
      <Text variant="monoValue">{new Date(now).toString().slice(0, 24)}</Text>
      <ButtonRow>
        <Button kind="s" size="row" label="End day" onPress={() => { clock.endDay(); refresh(); }} />
        <Button kind="s" size="row" label="To deadline" onPress={() => { clock.toDeadline(); refresh(); }} />
        <Button kind="s" size="row" label="Reset" onPress={() => { clock.reset(); refresh(); }} />
      </ButtonRow>

      <Label text="SCREENS" />
      <ButtonRow>
        <Button kind="s" size="row" label="Gallery" onPress={openGallery} />
        <Button kind="d" size="row" label="Sign out" onPress={() => { void signOut().then(() => toast("Signed out")); }} />
      </ButtonRow>
      <ChipRow>{ROUTES.map((r) => <Pill key={r.id} text={r.id} on={false} onPress={() => jump(r.id)} />)}</ChipRow>
    </BottomSheet>
  );
}
