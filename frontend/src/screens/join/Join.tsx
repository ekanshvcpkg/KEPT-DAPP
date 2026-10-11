// E · Join an Oath (screens.md E1–E3). E1 takes a code typed, pasted, scanned from a QR or carried
// in by `kept://join/<code>`, and routes to the preview or the matching E3 state.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Clipboard from "expo-clipboard";
import { CameraView, useCameraPermissions } from "expo-camera";
import { keeperLines, t } from "@/copy";
import type { CopyKey, ScreenId } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { BodyText, Breakdown, Title } from "@/components/content/Basics";
import { ProofCamera } from "@/components/content/Camera";
import { SentenceInput } from "@/components/content/Inputs";
import { OathCard } from "@/components/content/Oath";
import { RowList } from "@/components/content/Rows";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { metrics } from "@/theme";
import { getApi, isApiError } from "@/api";
import { qk, queryClient, useBalances } from "@/api/queries";
import { useGo, useParams } from "@/app/nav";
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

// ── E1 Enter invite ──
export function E1() {
  const { back, go } = useGo();
  const toast = useToast();
  const p = useParams<{ code: string }>();
  const [code, setCode] = useState(p.code ? codeFrom(p.code) : "");
  // A second join link returns to this E1 with a new code (RootNavigator › reuseJoin): take it.
  const [linked, setLinked] = useState(p.code);
  if (p.code !== linked) { setLinked(p.code); if (p.code) setCode(codeFrom(p.code)); }
  const [busy, setBusy] = useState(false);
  const [perm, requestPerm] = useCameraPermissions();
  const scanned = useRef(false);
  useBalances(); // loads the balance the E3·skr check reads from the cache

  const find = useCallback(async (raw: string) => {
    const c = codeFrom(raw);
    if (!c) return;
    setBusy(true);
    try {
      const wallet = useSession.getState().wallet!;
      const { oath, alreadyStarted } = await getApi().oaths.byInvite(c, wallet);
      const v = oathView(oath, nowSeconds(), wallet);
      const params = { id: oath.id, code: c };
      const to: DesignId = v.me >= 0 ? "E3·in"
        : alreadyStarted ? "E3·late"
        : !oath.isSolo && !useSession.getState().genesis ? "E3·elig"
        : (queryClient.getQueryData<{ skr: bigint }>(qk.balances(wallet))?.skr ?? oath.stake) < oath.stake ? "E3·skr"
        : "E2";
      go(to, params);
    } catch (e) {
      if (isApiError(e) && (e.code === "INVITE_NOT_FOUND" || e.code === "NOT_FOUND")) go("E3·code");
      else if (isApiError(e) && e.code === "OFFLINE") go("M2");
      else toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      scanned.current = false;
    }
  }, [go, toast]);

  // A deep link arrives with the code: look it up straight away (only once per unique code).
  const autoChecked = useRef<string | null>(null);
  useEffect(() => {
    if (!p.code || autoChecked.current === p.code) return;
    autoChecked.current = p.code;
    const timer = setTimeout(() => { void find(p.code!); }, 0);
    return () => clearTimeout(timer);
  }, [p.code, find]);

  const live = perm?.granted;
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.E1.nav.title")} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" label={t("screens.E1.pin.0")} loading={busy} disabled={!code.trim()} onPress={() => { void find(code); }} />}>
      <Title heading={t("screens.E1.b0.title")} sub={t("screens.E1.b0.sub")} />
      <ProofCamera state={live ? "scan" : "off"} object="qrcode" label={t("screens.E1.b1.label")} height={220}>
        {live ? (
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={({ data }) => {
              if (scanned.current || busy) return;
              scanned.current = true;
              setCode(codeFrom(data));
              void find(data);
            }} />
        ) : undefined}
      </ProofCamera>
      {!live ? <Button kind="s" size="row" icon="camera" label={t("screens.F1·perm.pin.0")} onPress={() => { void requestPerm(); }} /> : null}
      <SentenceInput label={t("screens.E1.b2.label")} value={code} onChange={setCode} mono max={16} suggestions={[]} placeholder={t("screens.E1.b2.sug.0")} />
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
  const firstMiss = skrWhole(missCost(f.stake, f.numDays, 0));
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

// ── E3 states ── Keeper + title + two pinned actions each.
function E3({ id, title, sub, pins }: { id: ScreenId; title: string; sub: string; pins: { label: string; to: DesignId; params?: Record<string, string> }[] }) {
  const { back, replace } = useGo();
  const k = keeperLines(id)[0]!;
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.E1.nav.title")} />} bottomInset={pinned(pins.length)} pinned={<>
      {pins.map((p, i) => <Button key={p.label} kind={i === 0 ? "p" : "t"} label={p.label} onPress={() => replace(p.to, p.params)} />)}
    </>}>
      <ScreenKeeper id={id} lines={[k]} />
      <Title heading={title} sub={sub} align="center" />
    </Screen>
  );
}
const k3 = (id: string, key: string) => t(`screens.${id}.${key}` as CopyKey);

export function E3code() {
  return <E3 id="E3·code" title={k3("E3·code", "b2.title")} sub={k3("E3·code", "b2.sub")} pins={[{ label: k3("E3·code", "pin.0"), to: "E1" }, { label: k3("E3·code", "pin.1"), to: "C1" }]} />;
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
