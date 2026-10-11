// C · Create an Oath (screens.md C1–C8). The draft lives in state/drafts; C7 signs through the
// TxService for the mode: the program in Live (solo with stake 0, D-30), the mock in Demo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { GOAL_MAX, LENGTHS, MAX_MEMBERS, OBJECTS, SKR_UNIT, STAKES_SKR } from "@kept/config";
import { missCost, nextMidnight } from "@kept/engine";
import { keeperLines, t } from "@/copy";
import type { CopyKey } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { Banner, BodyText, Breakdown, Note, Title } from "@/components/content/Basics";
import { OptionGrid, QRCard, SeatSlots, SentenceInput } from "@/components/content/Inputs";
import type { Seat } from "@/components/content/Inputs";
import { RowList } from "@/components/content/Rows";
import { SignStatus } from "@/components/content/Status";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { formatUsd } from "@/lib/format";
import { color, metrics } from "@/theme";
import { getApi, useApi } from "@/api";
import { qk } from "@/api/queries";
import { useGo, useParams } from "@/app/nav";
import { oathActions, useOath } from "@/features/oaths/hooks";
import { memberColor, memberInitial, memberName, objectName, reviewText, skrWhole } from "@/features/oaths/present";
import { screenFor } from "@/features/oaths/route";
import { oathName } from "@/features/oaths/names";
import { useDraft } from "@/state/drafts";
import { useDeviceOaths } from "@/features/oaths/device";
import { inviteUrl } from "@/config/env";
import { useNow } from "@/features/time";
import { useSession } from "@/state/session";
import { useUi } from "@/state/ui";
import { SigningScreen } from "../shared/Signing";

const STEPS = 6;
const pinnedOne = metrics.button.height + metrics.pinned.bottom;
const units = (skr: number) => BigInt(skr) * SKR_UNIT;

function Step({ n, children, next, nextLabel, disabled, close }: { n: number; children: React.ReactNode; next: () => void; nextLabel?: string; disabled?: boolean; close?: boolean }) {
  const { back } = useGo();
  return (
    <Screen bar={<NavBar onBack={back} steps={[n, STEPS]} {...(close ? { close: true } : {})} />} bottomInset={pinnedOne}
      pinned={<Button kind={n === STEPS ? "l" : "p"} {...(n === STEPS ? { icon: "draw-pen" as const } : {})} label={nextLabel ?? t("screens.C1.pin.0")} onPress={next} {...(disabled ? { disabled: true } : {})} />}>
      {children}
    </Screen>
  );
}

// ── C1 Goal ──
export function C1() {
  const { go } = useGo();
  const { draft, set } = useDraft();
  const k = keeperLines("C1");
  return (
    <Step n={1} close next={() => go("C2")} disabled={!draft.goal.trim()}>
      <Title heading={t("screens.C1.b0.title")} sub={t("screens.C1.b0.sub")} />
      <SentenceInput label={t("screens.C1.b1.label")} prefix={t("screens.C1.b1.prefix")} value={draft.goal} onChange={(goal) => set({ goal })} max={GOAL_MAX}
        suggestions={[0, 1, 2, 3].map((i) => t(`screens.C1.b1.sug.${i}` as CopyKey))} />
      <ScreenKeeper id="C1" lines={k} />
    </Step>
  );
}

// ── C2 Object ──
export function C2() {
  const { go } = useGo();
  const { draft, set } = useDraft();
  return (
    <Step n={2} next={() => go("C3")}>
      <Title heading={t("screens.C2.b0.title")} sub={t("screens.C2.b0.sub")} />
      <OptionGrid mode="tile" cols={4} value={draft.objectId} onChange={(objectId) => set({ objectId })}
        items={OBJECTS.map((o, i) => ({ title: t(`screens.C2.b1.o${i}.t` as CopyKey), icon: o.icon }))} />
      <Note text={t("screens.C2.b2.text")} icon="shield-check-outline" />
    </Step>
  );
}

// ── C3 Length ── the end date assumes Start today, so day 1 is tonight's midnight (D-6).
export function C3() {
  const { go } = useGo();
  const { draft, set } = useDraft();
  const now = useNow(60_000);
  const ends = nextMidnight(now, -new Date().getTimezoneOffset()) + (draft.numDays - 1) * 86_400;
  return (
    <Step n={3} next={() => go("C4")}>
      <Title heading={t("screens.C3.b0.title")} sub={t("screens.C3.b0.sub")} />
      <OptionGrid mode="big" value={LENGTHS.indexOf(draft.numDays)} onChange={(i) => set({ numDays: LENGTHS[i]! })}
        items={[0, 1, 2].map((i) => ({ title: t(`screens.C3.b1.o${i}.t` as CopyKey), sub: t(`screens.C3.b1.o${i}.s` as CopyKey) }))} />
      <Banner tone="grey" icon="calendar-check"
        title={t("screens.C3.b2.title", { date: new Date(ends * 1000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "") })}
        sub={t("screens.C3.b2.sub")} />
    </Step>
  );
}

// ── C4 Solo or group, and stake ── group needs a Genesis token (D-18).
export function C4() {
  const { go } = useGo();
  const toast = useToast();
  const { draft, set } = useDraft();
  const genesis = useSession((s) => s.genesis);
  const api = useApi();
  const price = useQuery({ queryKey: qk.price, queryFn: () => api.wallet.price(), retry: false });
  const costs = [0, 1, 2].map((k) => skrWhole(missCost(units(draft.stakeSkr), draft.numDays, k)));
  const pickMode = (i: number) => {
    if (i === 1 && !genesis) { toast(t("screens.C4.b1.o1.s")); return; }
    set({ isSolo: i === 0 });
  };
  return (
    <Step n={4} next={() => go(draft.isSolo ? "C6" : "C5")}>
      <Title heading={t("screens.C4.b0.title")} />
      <OptionGrid mode="row2" value={draft.isSolo ? 0 : 1} onChange={pickMode}
        items={[{ title: t("screens.C4.b1.o0.t"), sub: t("screens.C4.b1.o0.s"), icon: "account" }, { title: t("screens.C4.b1.o1.t"), sub: t("screens.C4.b1.o1.s"), icon: genesis ? "account-group" : "lock-outline" }]} />
      <BodyText mono text={t("screens.C4.b2.text")} />
      <OptionGrid mode="big" small value={STAKES_SKR.indexOf(draft.stakeSkr as (typeof STAKES_SKR)[number])} onChange={(i) => set({ stakeSkr: STAKES_SKR[i]! })}
        items={STAKES_SKR.map((s, i) => ({ title: t(`screens.C4.b3.o${i}.t` as CopyKey), ...(price.data ? { sub: formatUsd(units(s), price.data.usdPerSkr) } : {}) }))} />
      <Banner tone="lime" icon="sack" title={t("screens.C4.b4.title", { cost: costs[0]! })} sub={t("screens.C4.b4.sub", { second: costs[1]!, third: costs[2]! })} />
    </Step>
  );
}

// ── C5 Review mode ──
export function C5() {
  const { go } = useGo();
  const { draft, set } = useDraft();
  return (
    <Step n={5} next={() => go("C6")}>
      <Title heading={t("screens.C5.b0.title")} sub={t("screens.C5.b0.sub")} />
      <OptionGrid mode="row" value={draft.reviewMode === "ai" ? 0 : 1} onChange={(i) => set({ reviewMode: i === 0 ? "ai" : "ai_group" })}
        items={[{ title: t("screens.C5.b1.o0.t"), sub: t("screens.C5.b1.o0.s"), icon: "robot-outline" }, { title: t("screens.C5.b1.o1.t"), sub: t("screens.C5.b1.o1.s"), icon: "account-group-outline" }]} />
    </Step>
  );
}

// ── C6 Review terms ──
export function C6() {
  const { go } = useGo();
  const { draft } = useDraft();
  const stake = units(draft.stakeSkr);
  const costs = [0, 1, 2].map((k) => skrWhole(missCost(stake, draft.numDays, k)));
  const rows = [
    { label: t("screens.C6.b1.row0.l"), value: t("screens.C6.b1.row0.v", { goal: draft.goal.trim() }) },
    { label: t("screens.C6.b1.row1.l"), value: objectName(draft.objectId) },
    { label: t("screens.C6.b1.row2.l"), value: t(`common.lengths.${LENGTHS.indexOf(draft.numDays)}` as CopyKey) },
    { label: t("screens.C6.b1.row3.l"), value: t("screens.C6.b1.row3.v", { amount: skrWhole(stake) }), color: color.lime.base },
    ...(draft.isSolo ? [] : [{ label: t("screens.C6.b1.row4.l"), value: reviewText(draft.reviewMode) }]),
  ];
  return (
    <Step n={6} next={() => go("C7")} nextLabel={t("screens.C6.pin.0")}>
      <Title heading={t("screens.C6.b0.title")} />
      <Breakdown rows={rows} />
      <RowList label={t("screens.C6.b2.label")} rows={[
        { title: t("screens.C6.b2.r0.t"), sub: t("screens.C6.b2.r0.s"), leading: { kind: "icon", icon: "heart-pulse", fg: color.text.primary } },
        { title: t("screens.C6.b2.r1.t"), sub: t("screens.C6.b2.r1.s"), leading: { kind: "icon", icon: "fire", fg: color.red.base } },
        { title: t("screens.C6.b2.r2.t", { cost: costs[0]! }), sub: t("screens.C6.b2.r2.s", { second: costs[1]!, third: costs[2]! }), leading: { kind: "icon", icon: "sack", fg: color.lime.base } },
        { title: t("screens.C6.b2.r3.t"), sub: t("screens.C6.b2.r3.s"), leading: { kind: "icon", icon: "percent-outline", fg: color.text.primary } },
      ]} />
    </Step>
  );
}

// ── C7 Signing ──
export function C7() {
  const { draft } = useDraft();
  const task = useCallback(() => oathActions.create(draft), [draft]);
  const onDone = useCallback((r: { id: string; code: string | null }) => ({ to: "C7·ok" as const, params: { id: r.id, ...(r.code ? { code: r.code } : {}) } }), []);
  const fail = useMemo(() => ({ retry: "C7" as const, edit: "C6" as const, params: { need: skrWhole(units(draft.stakeSkr)) } }), [draft.stakeSkr]);
  return <SigningScreen title={t("screens.C7.b2.title")} sub={t("screens.C7.b2.sub", { amount: skrWhole(units(draft.stakeSkr)), name: oathName(draft.objectId, draft.numDays) })} task={task} onDone={onDone} fail={fail} />;
}

// ── C7·ok Signed · success ──
export function C7ok() {
  const { replace } = useGo();
  const { id } = useParams<{ id: string }>();
  const { view } = useOath(id);
  const reset = useDraft((s) => s.reset);
  const playFx = useUi((s) => s.playFx);
  const stake = view ? skrWhole(view.facts.stake) : "";
  useEffect(() => {
    reset();
    playFx(undefined, "payout");
  }, [reset, playFx, stake]);
  const solo = view?.facts.isSolo;
  return (
    <Screen bottomInset={metrics.button.height * 2 + metrics.pinned.gap + metrics.pinned.bottom} pinned={<>
      {!solo ? <Button kind="p" icon="account-multiple-plus" label={t("screens.C7·ok.pin.0")} onPress={() => replace("C8", { id: id! })} /> : null}
      <Button kind={solo ? "p" : "t"} label={t("screens.C7·ok.pin.1")} onPress={() => view && replace(screenFor(view), { id: id! })} />
    </>}>
      <SignStatus state="success" chip={t("screens.C7·ok.b1.chip", { amount: stake })} />
      <Title heading={t("screens.C7·ok.b2.title", { amount: stake })} sub={view ? t("screens.C7·ok.b2.sub", { name: view.facts.name }) : undefined} align="center" />
    </Screen>
  );
}

// ── C8 Invite ──
export function C8() {
  const { back, replace } = useGo();
  const toast = useToast();
  const p = useParams<{ id: string; code: string }>();
  const { view } = useOath(p.id);
  const facts = view?.facts;
  const factsRef = useRef(facts);
  useEffect(() => { factsRef.current = facts; }, [facts]);
  const factsId = facts?.id;
  const [recoveredCode, setRecoveredCode] = useState<string | null>(null);
  const attemptedFor = useRef<string | null>(null);
  const code = p.code ?? recoveredCode ?? view?.facts.inviteCode ?? "";
  useEffect(() => {
    const current = factsRef.current;
    if (!current || current.isSolo || code || attemptedFor.current === current.id) return;
    attemptedFor.current = current.id;
    let active = true;
    const recover = async () => {
      try {
        const api = getApi();
        const next = current.goal
          ? await api.oaths.register(current, current.goal)
          : (await api.invites.create(current.id)).code;
        if (next && active) {
          useDeviceOaths.getState().remember(current.id, { code: next });
          setRecoveredCode(next);
        }
      } catch {
        // The Oath is already created. Keep this screen usable and let the user retry by reopening it.
      }
    };
    void recover();
    return () => { active = false; };
  }, [factsId, code]);
  const deepLink = inviteUrl(code);
  const seats: Seat[] = view ? [
    ...view.members.map((m): Seat => ({ kind: "member", name: memberName(m), initial: memberInitial(m), color: memberColor(m), ...(m.facts.avatar ? { avatar: m.facts.avatar } : {}), status: t("screens.C8.b4.seat0") })),
    ...Array.from({ length: Math.max(0, MAX_MEMBERS - view.members.length) }, (): Seat => ({ kind: "open" })),
  ] : [];
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.C8.nav.title")} />} bottomInset={pinnedOne}
      pinned={<Button kind="p" label={t("screens.C8.pin.0")} onPress={() => replace("D1", { id: p.id! })} />}>
      <Title heading={t("screens.C8.b0.title")} sub={view ? t("screens.C8.b0.sub", { amount: skrWhole(view.facts.stake) }) : undefined} />
      {code ? <QRCard code={code} link={deepLink} /> : null}
      {code ? <ButtonRow>
        <Button kind="s" size="row" icon="content-copy" label={t("screens.C8.b2.btn.0")} onPress={() => { void Clipboard.setStringAsync(deepLink).then(() => toast(t("toasts.0"))); }} />
        <Button kind="s" size="row" icon="share-variant" label={t("screens.C8.b2.btn.1")} onPress={() => { void Share.share({ message: deepLink }); }} />
      </ButtonRow> : null}
      <BodyText mono text={t("screens.C8.b3.text", { n: view?.members.length ?? 1 })} />
      <SeatSlots seats={seats} />
    </Screen>
  );
}
