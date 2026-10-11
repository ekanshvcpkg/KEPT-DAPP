// A · Onboarding (screens.md A0–A4, plus the A1·m mode sheet, D-80). Live signs in for real: MWA +
// /api/auth/* + /api/me. Demo skips A2–A3: the sample account is signed in on the mock, then A4.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import { keeperLines, t } from "@/copy";
import type { CopyKey } from "@/copy";
import { Button } from "@/components/actions";
import { BrandSplash } from "@/components/brand/Brand";
import { BottomSheet, NavBar, useToast } from "@/components/chrome";
import { Breakdown, Chip, ChipRow, Note, Title } from "@/components/content/Basics";
import { RowList } from "@/components/content/Rows";
import { AvatarBuilder } from "@/components/content/Social";
import { SignStatus } from "@/components/content/Status";
import { randomAvatar } from "@/components/avatar/palette";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { color, duration, metrics } from "@/theme";
import { getApi, isApiError } from "@/api";
import { getWallet, isTxFailure } from "@/chain";
import { restoreSession, signIn } from "@/features/auth";
import type { SignInResult } from "@/features/auth";
import { resetStack, useContinue, useGo, useSheetRoute } from "@/app/nav";
import { useSigningFlow } from "@/app/useSigningFlow";
import type { SignOutcome } from "@/app/useSigningFlow";
import { useSession } from "@/state/session";
import { useDevHold } from "@/state/dev";
import { keeperAt } from "@/app/layout";
import { liveConfigured } from "@/config/env";
import { startDemo, startLive, startLiveWithInvite } from "@/features/mode";
import { useMode } from "@/state/mode";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDeviceModelsStatus } from "kept-gesture";
import { modelsReady } from "@/features/models/deviceModels";
import { ModelGate } from "@/features/models/ModelGate";

/** Splash shows at least this long so the brand sequence can play (motion.md › splash). */
const SPLASH_MIN_MS = 1200;

// ── A0 Splash ── waits for the stored session, re-checks it, then routes.
export function A0() {
  const { reset } = useGo();
  const [modelGate, setModelGate] = useState(false);
  const [modelUnsupported, setModelUnsupported] = useState(false);
  const routeAfterGate = useCallback(async () => {
    const { token, onboarded, invite } = useSession.getState();
    const signedIn = token ? await restoreSession(getApi()) : false;
    if (useDevHold.getState().hold) return;
    if (signedIn && onboarded) reset("B1");
    else if (signedIn) reset("A4");
    else if (invite !== null && useMode.getState().mode === "live") resetStack(["A1", "A2"]);
    else reset("A1");
  }, [reset]);
  useEffect(() => {
    let cancelled = false;
    const hydrated = new Promise<void>((resolve) => {
      if (useSession.persist.hasHydrated()) resolve();
      else useSession.persist.onFinishHydration(() => resolve());
    });
    void Promise.all([hydrated, new Promise((r) => setTimeout(r, SPLASH_MIN_MS))]).then(async () => {
      if (cancelled || useDevHold.getState().hold) return; // the dev deep link can hold the splash
      if (useMode.getState().mode === "live") {
        const models = await getDeviceModelsStatus();
        if (!modelsReady(models)) {
          setModelUnsupported(!models.supported);
          setModelGate(true);
          return;
        }
      }
      await routeAfterGate();
    });
    return () => { cancelled = true; };
  }, [routeAfterGate]);
  if (modelGate) return (
    <Screen bare>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: metrics.screen.padX, gap: metrics.screen.gap }}>
        <ModelGate unsupported={modelUnsupported} onReady={() => { setModelGate(false); return routeAfterGate(); }}
          onLater={() => {
            if (modelUnsupported || __DEV__) {
              setModelGate(false);
              void routeAfterGate();
            } else {
              useSession.getState().setInvite(null);
              reset("A1");
            }
          }} />
      </View>
    </Screen>
  );
  return (
    <Screen bare>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><BrandSplash /></View>
    </Screen>
  );
}

/** A3 / A3·no chip tilts (reference/kept-screens-1.js). */
const CHIP_TILT = { ok: [0, -3, 2], no: [-2, 2, -1] } as const;

// ── A1 Welcome ──
export function A1() {
  const { go } = useGo();
  const k = keeperLines("A1")[0]!;
  // Get started picks the mode (A1·m), unless a join link already chose Live.
  const start = () => (useMode.getState().mode === "live" && useSession.getState().invite !== null ? go("A2") : go("A1·m"));
  // "I have an invite" is always Live (D-80); E1 opens after onboarding with an empty code.
  const invite = () => { void startLiveWithInvite(useSession.getState().invite ?? "").then(() => go("A2")); };
  return (
    <Screen
      bottomInset={metrics.button.height * 2 + metrics.pinned.gap + metrics.pinned.bottom}
      pinned={<>
        <Button kind="p" label={t("screens.A1.pin.0")} onPress={start} />
        <Button kind="t" label={t("screens.A1.pin.1")} onPress={invite} />
      </>}
    >
      {/* Chip spots, icons and tones are the design's (layout.gen.json); the texts are copy. */}
      <ScreenKeeper id="A1" lines={[k]} chips={keeperAt("A1", [t("screens.A1.b1.chip.0"), t("screens.A1.b1.chip.1")]).chips ?? []} />
      <Title heading={t("screens.A1.b2.title")} sub={t("screens.A1.b2.sub")} fs={32} />
    </Screen>
  );
}

// ── A1·m Pick a mode (D-80) ── a sheet over A1: the demo (A4 next, no wallet) or my wallet (A2).
export function A1m() {
  const { replace, back } = useGo();
  const insets = useSafeAreaInsets();
  const sheet = useSheetRoute();
  const toast = useToast();
  const [modelStep, setModelStep] = useState(false);
  const [modelUnsupported, setModelUnsupported] = useState(false);
  const demo = () => { void startDemo().then(() => replace("A4")); };
  // A release build still pointing at localhost can't run Live (no server on the phone).
  const live = async () => {
    if (!liveConfigured()) { toast(t("additions.mode.noServer")); return; }
    const models = await getDeviceModelsStatus();
    if (!modelsReady(models)) {
      setModelUnsupported(!models.supported);
      setModelStep(true);
      return;
    }
    void startLive().then(() => replace("A2"));
  };
  return (
    <View style={{ flex: 1 }}>
      <BottomSheet {...sheet} bottomInset={insets.bottom}>
        {modelStep ? <>
          <ModelGate sheet unsupported={modelUnsupported} onReady={() => startLive().then(() => replace("A2"))}
            onLater={() => {
              if (modelUnsupported || __DEV__) {
                void startLive().then(() => replace("A2"));
              } else {
                setModelStep(false);
              }
            }} />
        </> : <>
          <Title heading={t("additions.mode.title")} pt={0} fs={26} />
          <RowList rows={[
            { title: t("additions.mode.demo"), chevron: true, leading: { kind: "icon", icon: "play-circle-outline", bg: color.lime.base, fg: color.text.onLime }, onPress: demo },
            { title: t("additions.mode.live"), chevron: true, leading: { kind: "icon", icon: "wallet-outline" }, onPress: () => { void live(); } },
          ]} />
        </>}
        <Button kind="s" label={t("screens.+.b3.btn.0")} onPress={back} />
      </BottomSheet>
    </View>
  );
}

// ── A2 Connect wallet ── every row opens the same MWA authorize; Android picks the wallet (D-25).
const WALLETS = [0, 1, 2] as const;
/** reference/kept-screens-1.js › A2: each wallet's own glyph (Seeker, Phantom's ghost, Solflare's sun). */
const WALLET_ICONS = ["cellphone-key", "ghost-outline", "white-balance-sunny"] as const;
export function A2() {
  const { go, back } = useGo();
  return (
    <Screen bar={<NavBar onBack={back} steps={[1, 3]} />}>
      <Title heading={t("screens.A2.b0.title")} sub={t("screens.A2.b0.sub")} />
      <RowList rows={WALLETS.map((i) => ({
        title: t(`screens.A2.b1.r${i}.t`), sub: t(`screens.A2.b1.r${i}.s`), chevron: true,
        leading: { kind: "icon" as const, icon: WALLET_ICONS[i], ...(i === 0 ? { bg: color.lime.base, fg: color.text.onLime } : {}) },
        ...(i === 0 ? { value: t("screens.A2.b1.r0.r"), valueColor: color.lime.base } : {}),
        onPress: () => go("A2·s", { wallet: i }),
      }))} />
      <Breakdown label={t("screens.A2.b2.label")} rows={[0, 1, 2].map((i) => ({ label: t(`screens.A2.b2.row${i}.l` as CopyKey), value: t(`screens.A2.b2.row${i}.v` as CopyKey) }))} />
      <Note text={t("screens.A2.b3.text")} icon="shield-check-outline" />
    </Screen>
  );
}

// ── A2·s Signing in ── transient: replaced by A3, A3·no, A2·e (declined) or M2 (offline).
export function A2s() {
  const route = useRoute<RouteProp<{ p: { wallet?: number } }, "p">>();
  const { back } = useGo();
  const toast = useToast();
  const walletIndex = route.params?.wallet ?? 0;
  const task = useCallback(() => signIn(getApi(), getWallet()), []);
  const resolve = useCallback((r: { ok: true; value: SignInResult } | { ok: false; error: unknown }): SignOutcome => {
    if (r.ok) return { to: r.value.genesis ? "A3" : "A3·no", delayMs: duration.toggle };
    const e = r.error;
    if (isTxFailure(e) && e.kind === "rejected") return { to: "A2·e" };
    if ((isTxFailure(e) && e.kind === "offline") || (isApiError(e) && e.code === "OFFLINE")) return { to: "M2" };
    if (isTxFailure(e) && e.kind === "noWallet") { toast(t("additions.wallet.noWalletApp")); return { to: "A2" }; }
    // Anything else (backend refused, wallet error): say what happened and let them try again.
    toast(e instanceof Error ? e.message : String(e));
    return { to: "A2" };
  }, [toast]);
  const state = useSigningFlow(task, resolve);
  return (
    <Screen bar={<NavBar onBack={back} close />}>
      <SignStatus state={state} chip={t(`screens.A2.b1.r${walletIndex as 0 | 1 | 2}.t`)} />
      <Title heading={t("screens.A2·s.b2.title")} sub={t("screens.A2·s.b2.sub")} align="center" />
      <Note text={t("screens.A2·s.b3.text")} icon="timer-sand" />
    </Screen>
  );
}

// ── A2·e Sign-in rejected ──
export function A2e() {
  const { go, back } = useGo();
  const k = keeperLines("A2·e")[0]!;
  return (
    <Screen
      bar={<NavBar onBack={back} steps={[1, 3]} />}
      bottomInset={metrics.button.height * 2 + metrics.pinned.gap + metrics.pinned.bottom}
      pinned={<>
        <Button kind="p" label={t("screens.A2·e.pin.0")} onPress={() => go("A2")} />
        {/* Forget the remembered authorization so the wallet chooser opens again. */}
        <Button kind="t" label={t("screens.A2·e.pin.1")} onPress={() => { void getWallet().forget().then(() => go("A2")); }} />
      </>}
    >
      <ScreenKeeper id="A2·e" lines={[k]} />
      <Title heading={t("screens.A2·e.b2.title")} sub={t("screens.A2·e.b2.sub")} align="center" />
    </Screen>
  );
}

// ── A3 / A3·no ── Genesis result. Non-Seekers get the full app with group features gated (D-18).
function Verified({ ok }: { ok: boolean }) {
  const { go, back } = useGo();
  const id = ok ? "A3" : "A3·no";
  return (
    <Screen
      bar={<NavBar onBack={back} steps={[2, 3]} />}
      bottomInset={metrics.button.height + metrics.pinned.bottom}
      pinned={<Button kind="p" label={t(`screens.${id}.pin.0`)} onPress={() => go("A4")} />}
    >
      <SignStatus state={ok ? "success" : "warn"} chip={t(`screens.${id}.b1.chip`)} />
      <Title heading={t(`screens.${id}.b2.title`)} sub={t(`screens.${id}.b2.sub`)} align="center" />
      <ChipRow justify="center">
        {[0, 1, 2].map((i) => {
          const open = ok || i === 0;
          return <Chip key={i} text={t(`screens.${id}.b3.chip.${i}` as CopyKey)} icon={open ? "check" : "lock"} tone={open ? "lime" : "g"} tilt={(ok ? CHIP_TILT.ok : CHIP_TILT.no)[i]!} />;
        })}
      </ChipRow>
    </Screen>
  );
}
export const A3 = () => <Verified ok />;
export const A3no = () => <Verified ok={false} />;

// ── A4 Pick a look ── "Looks like me" saves the avatar and follows the cont: rule (B3, or E1 with an invite).
export function A4() {
  const { go, back } = useGo();
  const cont = useContinue();
  const stored = useSession((s) => s.avatar);
  const finish = useSession((s) => s.finishOnboarding);
  const [avatar, setAvatar] = useState(() => stored ?? randomAvatar());
  // Customize (I9) saves the look to the session; show it when coming back (state follows the store
  // during render, React's pattern for adjusting state to a changed input).
  const [seen, setSeen] = useState(stored);
  if (stored !== seen) { setSeen(stored); if (stored) setAvatar(stored); }
  const k = keeperLines("A4")[0]!;
  const done = () => {
    finish(avatar);
    // Profiles have no backend yet (BACKEND_GAPS P1-9): the mock keeps it; the device keeps it too.
    void getApi().profile.save({ avatar }).catch(() => undefined);
    cont("B1");
  };
  return (
    <Screen
      bar={<NavBar onBack={back} steps={[3, 3]} />}
      bottomInset={metrics.button.height * 2 + metrics.pinned.gap + metrics.pinned.bottom}
      pinned={<>
        <Button kind="p" label={t("screens.A4.pin.0")} onPress={done} />
        <Button kind="t" label={t("screens.A4.pin.1")} onPress={() => go("I9", { avatar })} />
      </>}
    >
      <Title heading={t("screens.A4.b0.title")} sub={t("screens.A4.b0.sub")} />
      <AvatarBuilder variant="preview" config={avatar} onChange={setAvatar} onShuffle={() => setAvatar(randomAvatar())} />
      <ScreenKeeper id="A4" lines={[k]} />
      <Note text={t("screens.A4.b3.text")} />
    </Screen>
  );
}
