// E · Join an Oath (screens.md E1–E3). E1 offers a choice (D-91): scan a QR (E1·scan) or type the code
// (E1·code); a code carried in by `kept://join/<code>`, an inbox invite or onboarding is looked up at
// once. Each routes to the preview or the matching E3 state.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";
import { keeperLines, t } from "@/copy";
import type { CopyKey, ScreenId } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { BodyText, Breakdown, Skeleton, Title } from "@/components/content/Basics";
import { ProofCamera } from "@/components/content/Camera";
import { SentenceInput } from "@/components/content/Inputs";
import { OathCard } from "@/components/content/Oath";
import { RowList } from "@/components/content/Rows";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { color, metrics } from "@/theme";
import { env } from "@/config/env";
import { useScreenFocused } from "@/lib/focus";
import { getApi, isApiError } from "@/api";
import { qk, queryClient, useBalances } from "@/api/queries";
import { backToStep, useGo, useParams } from "@/app/nav";
import type { DesignId } from "@/app/routes";
import { oathActions, useOath } from "@/features/oaths/hooks";
import { oathView } from "@/features/oaths/model";
import type { OathView } from "@/features/oaths/model";
import { nowSeconds } from "@/features/time";
import { listNames, memberColor, memberInitial, memberName, objectIcon, reviewText, skrWhole } from "@/features/oaths/present";
import { screenFor } from "@/features/oaths/route";
import { useSession } from "@/state/session";
import { missCost } from "@kept/engine";
import { SigningScreen } from "../shared/Signing";

const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;
const URL_CODE = /(?:[a-z]+:\/\/(?:[^/]+\/)?(?:join|o)\/|(?:join|o)\/)([^/?#\s]+)/i;
const WORD_CODE = /\b([A-Za-z]+-[A-Za-z0-9]{4})\b/;
export const codeFrom = (s: string) => {
  const m = s.match(URL_CODE)?.[1] ?? s.match(WORD_CODE)?.[1] ?? s.trim();
  // Current backend codes are case-sensitive base64url strings. Keep the exact case from links,
  // QR scans, clipboard text, and manual entry so the API can resolve what it issued.
  return m;
};

/**
 * The invite code in a scanned QR: a KEPT invite link (kept://join/…, or the app's site /o/…) or a bare
 * code like IRON-7K2Q. Null for any other QR (E1·scan keeps scanning).
 */
export function inviteFromQr(data: string): string | null {
  const s = data.trim();
  const site = env.identity.uri.replace(/\/$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const link = s.match(new RegExp(`^(?:kept://join/|${site}/o/)([^/?#\\s]+)`, "i"))?.[1];
  if (link) return decodeURIComponent(link);
  return /^[A-Za-z]+-[A-Za-z0-9]{4}$/.test(s) ? s : null;
}

/** The E1 step a lookup started from: E3's way back returns there (D-91). */
type JoinStep = "E1·scan" | "E1·code";

/** Looks a code up and routes to E2 or the matching E3 state. */
function useFindOath(from: JoinStep) {
  const { go } = useGo();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  useBalances(); // loads the balance the E3·skr check reads from the cache
  const find = useCallback(async (raw: string) => {
    const c = codeFrom(raw);
    if (!c) return;
    setBusy(true);
    try {
      const wallet = useSession.getState().wallet!;
      const { oath, alreadyStarted } = await getApi().oaths.byInvite(c, wallet);
      const v = oathView(oath, nowSeconds(), wallet);
      const params = { id: oath.id, code: c, from };
      const to: DesignId = v.me >= 0 ? "E3·in"
        : alreadyStarted ? "E3·late"
        : !oath.isSolo && !useSession.getState().genesis ? "E3·elig"
        : (queryClient.getQueryData<{ skr: bigint }>(qk.balances(wallet))?.skr ?? oath.stake) < oath.stake ? "E3·skr"
        : "E2";
      go(to, params);
    } catch (e) {
      if (isApiError(e) && (e.code === "INVITE_NOT_FOUND" || e.code === "NOT_FOUND")) go("E3·code", { code: c, from });
      else if (isApiError(e) && e.code === "OFFLINE") go("M2");
      else toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [go, toast, from]);
  return { find, busy };
}

// ── E1 Enter invite (D-91) ── first a choice: scan a QR or type the code. No camera or keyboard here.
// A code that's already known (a kept://join link, an inbox invite, the invite carried through
// onboarding) skips the choice and is looked up at once.
export function E1() {
  const { back, go } = useGo();
  const p = useParams<{ code: string }>();
  const { find } = useFindOath("E1·code");
  const [looking, setLooking] = useState<string | null>(p.code ? codeFrom(p.code) : null);
  // Each known code is looked up once; a second join link returns here with a new one (RootNavigator › reuseJoin).
  const checked = useRef<string | null>(null);
  useEffect(() => {
    if (!p.code || checked.current === p.code) return;
    checked.current = p.code;
    const c = codeFrom(p.code);
    setLooking(c);
    let live = true;
    const timer = setTimeout(() => { void find(c).finally(() => { if (live) setLooking(null); }); }, 0);
    return () => { live = false; clearTimeout(timer); };
  }, [p.code, find]);

  const bar = <NavBar onBack={back} close title={t("screens.E1.nav.title")} />;
  if (looking) {
    return (
      <Screen bar={bar} bottomInset={pinned(1)} pinned={<Button kind="p" label={t("screens.E1.pin.0")} loading onPress={() => {}} />}>
        <Title heading={t("screens.E1.b0.title")} sub={t("additions.join.looking", { code: looking })} />
        <Skeleton height={metrics.skeleton.cards[0]} />
      </Screen>
    );
  }
  return (
    <Screen bar={bar}>
      <Title heading={t("screens.E1.b0.title")} sub={t("screens.E1.b0.sub")} />
      <RowList rows={[
        { title: t("additions.join.scan"), sub: t("additions.join.scanSub"), chevron: true, leading: { kind: "icon", icon: "qrcode-scan", bg: color.lime.base, fg: color.text.onLime }, onPress: () => go("E1·scan") },
        { title: t("additions.join.code"), sub: t("additions.join.codeSub"), chevron: true, leading: { kind: "icon", icon: "keyboard-outline" }, onPress: () => go("E1·code") },
      ]} />
    </Screen>
  );
}

// ── E1·scan Scan an invite QR (D-91) ── the camera and its permission only from here. Leaving the step
// (back, or on to E2 / E3) releases the camera; coming back to it turns it on again.
export function E1scan() {
  const { back, replace } = useGo();
  const toast = useToast();
  const { find, busy } = useFindOath("E1·scan");
  // Asked as this step opens: the user picked Scan, an action that needs the camera.
  const [perm, , getPerm] = useCameraPermissions({ request: true });
  // Back from Settings: read the permission again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => { if (s === "active") void getPerm(); });
    return () => sub.remove();
  }, [getPerm]);
  const focused = useScreenFocused();
  const handled = useRef<{ data: string; at: number } | null>(null);
  const onScan = useCallback((data: string) => {
    if (busy) return;
    // The same QR stays in view: act on it once, and say "not an invite" once every few seconds.
    const last = handled.current;
    if (last && last.data === data && Date.now() - last.at < metrics.join.rescanMs) return;
    handled.current = { data, at: Date.now() };
    const code = inviteFromQr(data);
    if (!code) { toast(t("additions.join.notInvite")); return; }
    void find(code);
  }, [busy, find, toast]);
  useEffect(() => { if (focused) handled.current = null; }, [focused]);

  const bar = <NavBar onBack={back} title={t("screens.E1.nav.title")} />;
  // Over the choice, not instead of it: back from the code step is still the choice.
  const insteadButton = <Button kind="t" label={t("additions.join.codeInstead")} onPress={() => { if (!backToStep("E1", "E1·code")) replace("E1·code"); }} />;
  if (perm && !perm.granted && perm.status === "denied") {
    return (
      <Screen bar={bar} bottomInset={pinned(2)} pinned={<>
        <Button kind="p" icon="cog-outline" label={t("additions.camera.openSettings")} onPress={() => { void Linking.openSettings(); }} />
        {insteadButton}
      </>}>
        <ProofCamera state="off" object="camera-off-outline" label={t("screens.E1.b1.label")} height={metrics.join.permCamera} />
        <Title heading={t("additions.join.permTitle")} sub={t("additions.join.permSub")} align="center" />
      </Screen>
    );
  }
  const live = !!perm?.granted && focused;
  return (
    <Screen bar={bar} bottomInset={pinned(1)} pinned={insteadButton}>
      <Title heading={t("additions.join.scan")} sub={t("additions.join.scanSub")} />
      <ProofCamera state={live ? "scan" : "off"} object="qrcode" label={t("screens.E1.b1.label")}>
        {live ? (
          <CameraView testID="join-camera" style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => onScan(data)} />
        ) : undefined}
      </ProofCamera>
    </Screen>
  );
}

// ── E1·code Type an invite code (D-91) ── the field with the keyboard up, and Paste. No camera.
export function E1code() {
  const { back } = useGo();
  const toast = useToast();
  const p = useParams<{ code: string }>();
  const [code, setCode] = useState(p.code ? codeFrom(p.code) : "");
  const { find, busy } = useFindOath("E1·code");
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.E1.nav.title")} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" label={t("screens.E1.pin.0")} loading={busy} disabled={!code.trim()} onPress={() => { void find(code); }} />}>
      <Title heading={t("additions.join.code")} sub={t("additions.join.codeSub")} />
      <SentenceInput label={t("additions.join.codeLabel")} value={code} onChange={setCode} mono max={16} suggestions={[]} placeholder={t("screens.E1.b2.sug.0")} autoFocus />
      <ButtonRow>
        <Button kind="s" size="row" icon="content-paste" label={t("screens.E1.b3.btn.0")} onPress={() => {
          void Clipboard.getStringAsync().then((s) => {
            const c = codeFrom(s);
            if (!c) return;
            setCode(c);
            toast(t("toasts.5", { code: c }));
          });
        }} />
      </ButtonRow>
    </Screen>
  );
}

function useInviteOath() {
  const p = useParams<{ id: string; code: string }>();
  const { view } = useOath(p.id);
  return { id: p.id ?? "", code: p.code ?? "", view };
}

// ── E2 Oath preview ──
export function E2() {
  const { back, go } = useGo();
  const { id, code, view } = useInviteOath();
  if (!view) return <Screen bar={<NavBar onBack={back} title={t("screens.E2.nav.title")} />} />;
  const f = view.facts;
  const creator = view.members.find((m) => m.facts.wallet === f.creator) ?? view.members[0]!;
  const cName = memberName(creator);
  const firstMiss = skrWhole(missCost(f.stake));
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.E2.nav.title")} />} bottomInset={pinned(1)}
      pinned={<Button kind="l" icon="draw-pen" label={t("screens.E2.pin.0", { amount: skrWhole(f.stake) })} onPress={() => go("E2·s", { id, code })} />}>
      <BodyText mono text={t("screens.E2.b0.text", { name: cName.toUpperCase() })} />
      <OathCard icon={objectIcon(f.objectId)} name={f.name}
        meta={t("screens.E2.b1.meta", { name: cName, n: f.numDays, review: reviewText(f.reviewMode) })}
        {...(f.goal ? { line: t("screens.E2.b1.line", { goal: f.goal }) } : {})}
        tags={[{ text: t("screens.E2.b1.tag.0", { amount: skrWhole(f.stake) }), icon: "sack", tone: "lime" }, { text: t("screens.E2.b1.tag.1", { name: cName }), icon: "flag-checkered" }]}
        {...(creator.facts.keptRate !== null ? { float: { text: t("screens.E2.b1.float", { rate: Math.round(creator.facts.keptRate * 100) }), initial: memberInitial(creator), bg: memberColor(creator) } } : {})} />
      <RowList label={t("screens.E2.b2.label")} rows={view.members.map((m) => ({
        title: memberName(m), sub: t(m.facts.wallet === f.creator ? "screens.E2.b2.r0.s" : "screens.E2.b2.r1.s"),
        value: m.facts.keptRate === null ? t("common.keptRateNew") : t("screens.E2.b2.r0.r", { rate: Math.round(m.facts.keptRate * 100) }),
        ...(m.facts.keptRate !== null ? { valueSub: t("screens.E2.b2.r0.rs", { n: m.facts.rateDays }) } : {}),
        leading: m.facts.avatar ? { kind: "avatar" as const, config: m.facts.avatar } : { kind: "initial" as const, initial: memberInitial(m), bg: memberColor(m) },
      }))} />
      <Breakdown label={t("screens.E2.b3.label")} rows={[
        { label: t("screens.E2.b3.row0.l"), value: t("screens.E2.b3.row0.v") },
        { label: t("screens.E2.b3.row1.l"), value: t("screens.E2.b3.row1.v", { cost: firstMiss }) },
        { label: t("screens.E2.b3.row2.l"), value: t("screens.E2.b3.row2.v") },
        { label: t("screens.E2.b3.row3.l"), value: t("screens.E2.b3.row3.v") },
      ]} />
    </Screen>
  );
}

// ── E2·s Join · signing ──
export function E2s() {
  const { id, code, view } = useInviteOath();
  const task = useCallback(async () => {
    if (!view) throw new Error("Oath not loaded");
    await oathActions.join(view.facts);
    return view;
  }, [view]);
  const onDone = useCallback((v: OathView) => ({ to: (v.life === "open" ? "D1·m" : screenFor(v)) as DesignId, params: { id } }), [id]);
  const fail = useMemo(() => ({ retry: "E2·s" as const, edit: "E2" as const, params: { id, code }, noSkr: "E3·skr" as const }), [id, code]);
  if (!view) return null;
  const others = view.members.filter((m) => !m.isMe).map(memberName);
  return <SigningScreen title={t("screens.E2·s.b2.title", { name: view.facts.name })} sub={t("screens.E2·s.b2.sub", { amount: skrWhole(view.facts.stake), names: listNames(others) })} task={task} onDone={onDone} fail={fail} />;
}

// ── E3 states ── Keeper + title + two pinned actions each. "Try again" / "Back" (to E1) return to the
// step the lookup came from, a typed code kept so it can be corrected (D-91).
function E3({ id, title, sub, pins }: { id: ScreenId; title: string; sub: string; pins: { label: string; to: DesignId; params?: Record<string, string> }[] }) {
  const { back, replace } = useGo();
  const { from, code } = useParams<{ from: JoinStep; code: string }>();
  const k = keeperLines(id)[0]!;
  const open = (to: DesignId, params?: Record<string, string>) => {
    if (to === "E1" && from) {
      if (!backToStep("E1", from, from === "E1·code" && code ? { code } : undefined)) replace(from, code ? { code } : undefined);
      return;
    }
    replace(to, params);
  };
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.E1.nav.title")} />} bottomInset={pinned(pins.length)} pinned={<>
      {pins.map((p, i) => <Button key={p.label} kind={i === 0 ? "p" : "t"} label={p.label} onPress={() => open(p.to, p.params)} />)}
    </>}>
      <ScreenKeeper id={id} lines={[k]} />
      <Title heading={title} sub={sub} align="center" />
    </Screen>
  );
}
const k3 = (id: string, key: string) => t(`screens.${id}.${key}` as CopyKey);

export function E3code() {
  return <E3 id="E3·code" title={k3("E3·code", "b2.title")} sub={k3("E3·code", "b2.sub")} pins={[{ label: k3("E3·code", "pin.0"), to: "E1", params: { code: "" } }, { label: k3("E3·code", "pin.1"), to: "C1" }]} />;
}
export function E3late() {
  const { view } = useInviteOath();
  return <E3 id="E3·late" title={t("screens.E3·late.b2.title", { name: view?.facts.name ?? "" })} sub={k3("E3·late", "b2.sub")} pins={[{ label: k3("E3·late", "pin.0"), to: "C1" }, { label: k3("E3·late", "pin.1"), to: "E1" }]} />;
}
export function E3in() {
  const { id, view } = useInviteOath();
  const when = view?.facts.day1StartsAt ?? view?.facts.createdAt ?? nowSeconds();
  return <E3 id="E3·in" title={k3("E3·in", "b2.title")}
    sub={view ? t("screens.E3·in.b2.sub", { amount: skrWhole(view.facts.stake), name: view.facts.name, day: new Date(when * 1000).toLocaleDateString("en-GB", { weekday: "long" }) }) : ""}
    pins={[{ label: k3("E3·in", "pin.0"), to: view ? screenFor(view) : "D2", params: { id } }, { label: k3("E3·in", "pin.1"), to: "E1" }]} />;
}
export function E3elig() {
  return <E3 id="E3·elig" title={k3("E3·elig", "b2.title")} sub={k3("E3·elig", "b2.sub")} pins={[{ label: k3("E3·elig", "pin.0"), to: "C1" }, { label: k3("E3·elig", "pin.1"), to: "E1" }]} />;
}
export function E3skr() {
  const { view } = useInviteOath();
  const balances = useBalances();
  return <E3 id="E3·skr" title={t("screens.E3·skr.b2.title", { amount: view ? skrWhole(view.facts.stake) : "" })}
    sub={t("screens.E3·skr.b2.sub", { have: balances.data ? skrWhole(balances.data.skr) : "0" })}
    pins={[{ label: k3("E3·skr", "pin.0"), to: "I4" }, { label: k3("E3·skr", "pin.1"), to: "C1" }]} />;
}
