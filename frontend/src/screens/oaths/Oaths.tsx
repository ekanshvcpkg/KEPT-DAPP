// D · Oaths (screens.md D0–D5). Every number here comes from the engine view (features/oaths/model);
// screens only lay it out.
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MAX_MEMBERS } from "@kept/config";
import { keeperLines, t } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { BottomSheet, NavBar, useToast } from "@/components/chrome";
import { Banner, BodyText, Breakdown, Chip, ChipRow, Note, OddsChip, SearchBar, Segmented, Skeleton, Title } from "@/components/content/Basics";
import { SeatSlots } from "@/components/content/Inputs";
import type { Seat } from "@/components/content/Inputs";
import { DayMemberGrid, gridToday, HPPanel, OathCard } from "@/components/content/Oath";
import { RowList, rowListItems } from "@/components/content/Rows";
import type { RowProps } from "@/components/content/Rows";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen, ScreenList } from "@/components/layout/Screen";
import { shortDuration } from "@/lib/format";
import { color, metrics } from "@/theme";
import { useGo, useParams, useSheetRoute } from "@/app/nav";
import { useOath, useOathList, oathActions } from "@/features/oaths/hooks";
import type { MemberView, OathView } from "@/features/oaths/model";
import { isLowHp } from "@/features/oaths/model";
import { dayList, listNames, memberColor, memberInitial, memberName, oathAmount, oathAsset, oathIcon, oathObjects, objectIcon, reviewText, shortDate, weekday, startsTitle } from "@/features/oaths/present";
import { screenFor } from "@/features/oaths/route";
import { useUi } from "@/state/ui";
import { TabScreen } from "../tabs/TabScreen";
import { SigningScreen } from "../shared/Signing";
import { useResultMoments } from "../results/Results";
import { recoveryLine } from "../rematch/Rematch";
import { useLastSeenHp } from "@/features/oaths/device";
import { useFeature } from "@/features/availability";
import { historyOf, historyTotals } from "@/features/oaths/history";
import type { HistoryRow } from "@/features/oaths/history";
import { inviteUrl } from "@/config/env";

const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;
const rateText = (m: MemberView) => (m.facts.keptRate === null ? t("common.keptRateNew") : t("screens.D1.b3.seat0", { rate: Math.round(m.facts.keptRate * 100) }));

function seatsOf(v: OathView, withRate: boolean): Seat[] {
  return [
    ...v.members.map((m): Seat => ({ kind: "member", name: memberName(m), initial: memberInitial(m), color: memberColor(m), ...(m.facts.avatar ? { avatar: m.facts.avatar } : {}), ...(withRate ? { status: rateText(m) } : {}) })),
    ...(v.facts.isSolo ? [] : Array.from({ length: Math.max(0, MAX_MEMBERS - v.members.length) }, (): Seat => ({ kind: "open" }))),
  ];
}

// ── D0 Oaths list ──
export function OathsTab() {
  const { views, isLoading } = useOathList();
  const { go } = useGo();
  const k = keeperLines("D0");
  const { n, kept, broken } = historyTotals(historyOf(views));
  const history = { n, kept, broken };
  useResultMoments(views);
  if (isLoading) return <TabScreen tab="oaths"><Skeleton height={140} /><Skeleton height={140} /><Skeleton height={60} /></TabScreen>;
  const oaths = views.filter((v) => !v.facts.bountyId); // Bounties live on the Bounties tab
  const active = oaths.filter((v) => v.life === "active" || v.life === "waiting" || v.life === "over");
  const open = oaths.filter((v) => v.life === "open");
  const done = oaths.filter((v) => v.life === "settled" || v.life === "broken" || v.life === "cancelled");
  const open1 = (v: OathView) => go(screenFor(v), { id: v.facts.id });
  return (
    <TabScreen tab="oaths">
      <ScreenKeeper id="D0" lines={k} />
      {active.length ? <BodyText mono text={t("screens.D0.b1.text", { n: active.length })} /> : <Note text={t("additions.core.noOathsYet")} />}
      {active.map((v, i) => {
        const me = v.me >= 0 ? v.members[v.me]! : null;
        const pending = v.members.filter((m) => !m.isMe && m.pendingToday);
        return (
          <OathCard key={v.facts.id} variant="sm" tilt={i % 2 ? 1 : 0} icon={oathIcon(v.facts)} name={v.facts.name} onPress={() => open1(v)}
            meta={v.facts.isSolo ? t("screens.D0.b3.meta", { day: v.dayNumber, length: v.facts.numDays }) : t("screens.D0.b2.meta", { day: v.dayNumber, length: v.facts.numDays })}
            hp={v.hp}
            tags={[
              ...(me ? [{ text: t("screens.D0.b2.tag.0", { amount: oathAmount(v.facts, me.inPlay) }), icon: "sack" as const, tone: "lime" as const }] : []),
              ...(me && !me.pendingToday ? [{ text: t("screens.D0.b3.tag.1"), icon: "check-bold" as const, tone: "g" as const }] : []),
              ...(v.life === "waiting" ? [{ text: t("additions.core.startsIn", { time: shortDuration(v.secondsToStart ?? 0) }), icon: "timer-sand" as const }] : []),
              ...pending.slice(0, 1).map((m) => ({ text: t("screens.D0.b2.tag.1", { name: memberName(m) }), icon: "timer-sand" as const, tone: "ora" as const })),
            ]} />
        );
      })}
      {open.length ? <RowList label={t("screens.D0.b4.label")} rows={open.map((v) => ({
        title: t("screens.D0.b4.r0.t", { name: v.facts.name }), sub: t("screens.D0.b4.r0.s", { joined: v.members.length, cap: v.facts.isSolo ? 1 : MAX_MEMBERS }),
        value: t("screens.D0.b4.r0.r"), leading: { kind: "icon" as const, icon: "timer-sand" }, chevron: true, onPress: () => open1(v),
      }))} /> : null}
      {done.length ? <RowList label={t("screens.D0.b5.label")} rows={done.map((v): RowProps => {
        const mine = v.me >= 0 ? v.results[v.me]! : null;
        const delta = mine ? mine.final - mine.start : 0n;
        return {
          title: v.facts.name,
          sub: v.life === "broken" ? t("screens.D0.b5.r1.s", { day: (v.state.brokeOnDay ?? 0) + 1 }) : t("screens.D0.b5.r0.s", { when: weekday(endOf(v)).slice(0, 3) }),
          value: t("screens.D0.b5.r0.r", { delta: delta === 0n ? "±0" : delta > 0n ? `+${oathAmount(v.facts, delta)}` : oathAmount(v.facts, delta) }),
          valueColor: delta > 0n ? color.lime.base : delta < 0n ? color.red.base : color.text.secondary,
          // reference/kept-screens-2.js › D0: finished rows show the outcome, not the object.
          leading: v.life === "broken" ? { kind: "icon", icon: "fire", fg: color.red.base } : { kind: "icon", icon: "trophy-outline", fg: color.lime.base },
          chevron: true, onPress: () => open1(v),
        };
      })} /> : null}
      <RowList rows={[{ title: t("screens.D0.b6.r0.t"), sub: t("screens.D0.b6.r0.s", history), leading: { kind: "icon", icon: "history" }, chevron: true, onPress: () => go("D5") }]} />
    </TabScreen>
  );
}

const endOf = (v: OathView) => (v.facts.day1StartsAt ?? v.facts.createdAt) + v.facts.numDays * v.facts.daySeconds;

/** Loads the Oath for a D screen; shows skeletons while loading. */
function useOathScreen() {
  const { id } = useParams<{ id: string }>();
  const q = useOath(id);
  return { id: id ?? "", ...q };
}
function Loading({ title }: { title?: string }) {
  const { back } = useGo();
  return <Screen bar={<NavBar onBack={back} title={title ?? ""} />}><Skeleton height={110} /><Skeleton height={190} /><Skeleton height={60} /></Screen>;
}

// ── D1 / D1·m Open ──
export function D1() {
  const { view } = useOathScreen();
  if (!view) return <Loading />;
  return view.isCreator ? <OpenCreator v={view} /> : <OpenMember v={view} />;
}
export const D1m = D1;

function OpenHeader({ v, member }: { v: OathView; member?: boolean }) {
  const f = v.facts;
  return (
    <>
      <ChipRow>
        <Chip text={t("screens.D1.b0.chip.0")} icon="timer-sand" tone="vio" tilt={-2} />
        <Chip text={t("screens.D1.b0.chip.1", { n: f.numDays })} icon="calendar-blank" tilt={1} />
        <Chip text={member ? t("screens.D1·m.b0.chip.2", { amount: oathAmount(f, f.stake) }) : t("screens.D1.b0.chip.2", { amount: oathAmount(f, f.stake) })} icon="sack" tone="lime" tilt={-1} />
        {!f.isSolo && !member ? <Chip text={reviewText(f.reviewMode)} icon="account-group-outline" tilt={2} /> : null}
      </ChipRow>
      <Title heading={t("screens.D1.b1.title", { goal: f.goal ?? f.name })} {...(!member ? { sub: t("additions.proof.objectsSub", { objects: oathObjects(f) }) } : {})} fs={28} />
    </>
  );
}

function OpenCreator({ v }: { v: OathView }) {
  const { go, back } = useGo();
  const toast = useToast();
  const f = v.facts;
  const code = f.inviteCode;
  const canStart = f.isSolo || v.members.length >= 2;
  return (
    <Screen bar={<NavBar onBack={back} title={f.name} />} bottomInset={pinned(2)} pinned={<>
      <Button kind="l" icon="play" label={t("screens.D1.pin.0", { name: f.name })} disabled={!canStart} onPress={() => go("D1·go", { id: f.id })} />
      <Button kind="t" label={t("screens.D1.pin.1")} onPress={() => go("D1·x", { id: f.id })} />
    </>}>
      <OpenHeader v={v} />
      {!f.isSolo ? <BodyText mono text={t("screens.D1.b2.text", { n: v.members.length, cap: MAX_MEMBERS })} /> : null}
      <SeatSlots seats={seatsOf(v, true)} />
      {!f.isSolo && code ? (
        <RowList rows={[
          { title: t("screens.D1.b4.r0.t"), sub: t("screens.D1.b4.r0.s", { code }), leading: { kind: "icon", icon: "link-variant" }, onPress: () => { void Clipboard.setStringAsync(inviteUrl(code)).then(() => toast(t("toasts.0"))); } },
          { title: t("screens.D1.b4.r1.t"), sub: t("screens.D1.b4.r1.s"), leading: { kind: "icon", icon: "qrcode" }, chevron: true, onPress: () => go("C8", { id: f.id, code }) },
        ]} />
      ) : null}
    </Screen>
  );
}

function OpenMember({ v }: { v: OathView }) {
  const { back, go } = useGo();
  const toast = useToast();
  const f = v.facts;
  const creator = v.members.find((m) => m.facts.wallet === f.creator);
  const creatorName = creator ? memberName(creator) : "";
  const leave = async () => {
    await oathActions.leave(f);
    toast(t("toasts.2", { amount: oathAmount(f, f.stake) }));
    go("D0");
  };
  return (
    <Screen bar={<NavBar onBack={back} title={f.name} />} bottomInset={f.source === "mock" ? pinned(1) : 0}
      pinned={f.source === "mock" ? <Button kind="d" icon="logout" label={t("screens.D1·m.pin.0", { amount: oathAmount(f, f.stake) })} onPress={() => { void leave(); }} /> : undefined}>
      <OpenHeader v={v} member />
      <Banner tone="vio" icon="flag-checkered" title={t("screens.D1·m.b2.title", { name: creatorName })} sub={t("screens.D1·m.b2.sub", { name: creatorName })} />
      <SeatSlots seats={seatsOf(v, true)} />
    </Screen>
  );
}

// ── D1·x Cancel confirm ──
export function D1x() {
  const { back, replace } = useGo();
  const insets = useSafeAreaInsets();
  const sheet = useSheetRoute();
  const { view } = useOathScreen();
  if (!view) return null;
  const f = view.facts;
  const others = view.members.filter((m) => !m.isMe).map(memberName);
  return (
    <View style={{ flex: 1 }}>
      <BottomSheet {...sheet} bottomInset={insets.bottom}>
        <Title heading={t("screens.D1·x.b0.title", { name: f.name })} pt={0}
          sub={others.length ? t("screens.D1·x.b0.sub", { names: listNames(others), amount: oathAmount(f, f.stake) }) : t("additions.core.cancelAlone", { amount: oathAmount(f, f.stake) })} fs={26} />
        <ButtonRow direction="column">
          <Button kind="d" icon="close" label={t("screens.D1·x.b1.btn.0")} onPress={() => replace("D1·xs", { id: f.id })} />
          <Button kind="s" label={t("screens.D1·x.b1.btn.1")} onPress={back} />
        </ButtonRow>
      </BottomSheet>
    </View>
  );
}

// ── D1·xs Cancel · signing ── then the creator's own refund is a claim (D-31).
export function D1xs() {
  const { id, view } = useOathScreen();
  const task = useCallback(async () => { if (!view) throw new Error("Oath not loaded"); await oathActions.cancel(view.facts); }, [view]);
  const onDone = useCallback(() => ({ to: "D0" as const }), []);
  const fail = useMemo(() => ({ retry: "D1·xs" as const, edit: "D1" as const, params: { id } }), [id]);
  if (!view) return <Loading />;
  const total = view.facts.stake * BigInt(view.members.length);
  return <SigningScreen title={t("screens.D1·xs.b2.title")} sub={t("screens.D1·xs.b2.sub", { amount: oathAmount(view.facts, total), n: view.members.length })} task={task} onDone={onDone} fail={fail} />;
}

// ── D1·go Start · signing ──
export function D1go() {
  const { id, view } = useOathScreen();
  const task = useCallback(async () => { if (!view) throw new Error("Oath not loaded"); await oathActions.start(view.facts); }, [view]);
  const onDone = useCallback(() => ({ to: "D2" as const, params: { id } }), [id]);
  const fail = useMemo(() => ({ retry: "D1·go" as const, edit: "D1" as const, params: { id } }), [id]);
  if (!view) return <Loading />;
  const total = view.facts.stake * BigInt(view.members.length);
  // The program starts day 1 at Start today (BACKEND_GAPS P0-4); the mock follows D-6 (tonight at midnight).
  const when = view.facts.source === "chain" ? t("additions.core.startsNow") : `${t("additions.waiting.startsTonight")}.`;
  return <SigningScreen title={t("screens.D1·go.b2.title", { name: view.facts.name })} sub={t("screens.D1·go.b2.sub", { amount: oathAmount(view.facts, total), when })} task={task} onDone={onDone} fail={fail} />;
}

// ── D2 / D2·low Active ── also shows the waiting state (before day 1) and "over, settling".
export function D2() {
  const { view } = useOathScreen();
  if (!view) return <Loading />;
  if (view.life === "broken") return <Broken v={view} />;
  if (view.life === "settled" || view.life === "cancelled") return <Ended v={view} />;
  if (view.life === "open") return view.isCreator ? <OpenCreator v={view} /> : <OpenMember v={view} />;
  return <Active v={view} />;
}

function Active({ v }: { v: OathView }) {
  const { go, back } = useGo();
  const toast = useToast();
  const f = v.facts;
  // The HP this device showed last time: an unseen damage or heal plays from it (S20).
  const seenHp = useLastSeenHp(f.id, v.hp);
  const low = isLowHp(v);
  const me = v.me >= 0 ? v.members[v.me]! : null;
  // Someone in group review has done their part; only people with nothing in get nudged.
  const pending = v.members.filter((m) => !m.isMe && m.pendingToday && m.facts.proofToday !== "review");
  const k = keeperLines(low ? "D2·low" : "D2")[0]!;
  const nudge = async () => {
    if (v.dayIndex === null || !pending.length) return;
    await oathActions.nudge(f, pending.map((m) => m.facts.wallet), v.dayIndex).catch(() => undefined);
    toast(pending.length === 1 ? t("toasts.3", { name: memberName(pending[0]!) }) : t("toasts.4", { n: pending.length }));
  };
  const myPartial = me?.facts.proofToday === "partial";
  const nextHabit = v.habits.find((h) => !h.done)?.index ?? 0;
  const proveLabel = myPartial ? t("screens.D2.pin.0") : f.rematchOf ? t("screens.R·act.pin.0") : t("screens.B1.b4.btn");
  const canProve = v.life === "active" && me?.pendingToday && me.facts.proofToday !== "review";
  const lostNote = noteFor(v);
  const reviewer = v.members.find((m) => !m.isMe && m.facts.proofToday === "review");
  const nPins = (canProve ? 1 : 0) + (pending.length && !f.isSolo ? 1 : 0);
  return (
    <Screen layout={f.rematchOf ? "R·act" : low ? "D2·low" : "D2"} bar={<NavBar onBack={back} title={f.name} right={v.life === "active" ? t("screens.D2.nav.right", { day: v.dayNumber, length: f.numDays }) : undefined} />}
      bottomInset={nPins ? pinned(nPins) : 0}
      pinned={nPins ? <>
        {canProve ? <Button kind={low ? "l" : "p"} icon="camera" label={proveLabel} onPress={() => go("F1", { id: f.id, habit: nextHabit })} /> : null}
        {pending.length && !f.isSolo ? <Button kind="s" icon="bell-ring-outline" label={pending.length === 1 ? t("screens.D2.pin.1", { name: memberName(pending[0]!) }) : t("screens.D2·low.pin.1", { names: listNames(pending.map(memberName)) })} onPress={() => { void nudge(); }} /> : null}
      </> : undefined}>
      {f.rematchOf ? (
        <ChipRow>
          <Chip text={t("screens.R·act.b0.chip.0")} icon="sword-cross" tone="white" tilt={-2} />
          <Chip text={t("screens.R·act.b0.chip.1")} icon="lock-outline" tilt={1} />
        </ChipRow>
      ) : null}
      <HPPanel hp={v.hp} lostToday={v.hpLostLastDay} {...(seenHp !== undefined ? { from: seenHp } : {})} {...(lostNote ? { note: lostNote } : {})} {...(low ? { warn: t("screens.D2·low.b0.warn") } : {})} />
      {v.life === "waiting" ? <Banner tone="vio" icon="weather-night" title={startsTitle(v.secondsToStart ?? 0)} sub={t("additions.core.startsIn", { time: shortDuration(v.secondsToStart ?? 0) })} /> : null}
      {v.life === "over" ? <Over v={v} /> : null}
      {v.life === "active" && me ? <BodyText text={t("screens.D2.b1.text", { timeLeft: `<m${v.deadlineClose ? ' class="r"' : ""}>${shortDuration(v.secondsToReset ?? 0)}</m>`, cost: oathAmount(v.facts, v.myMissCost) })} /> : null}
      <ScreenKeeper id={low ? "D2·low" : "D2"} lines={[k]} />
      <DayMemberGrid days={f.numDays} today={gridToday(v.dayIndex)} members={v.members.map((m) => ({ key: m.facts.wallet, name: memberName(m), initial: memberInitial(m), color: memberColor(m), cells: m.cells }))} />
      {!f.isSolo && v.life === "active" ? <ChipRow>{v.members.filter((m) => !m.isMe).map((m) => <Odds key={m.facts.wallet} m={m} />)}</ChipRow> : null}
      {reviewer ? <Banner tone="vio" icon="eye-outline" title={t("screens.D2.b5.title")} sub={t("screens.D2.b5.sub")} onPress={() => go("G1", { id: f.id })} /> : null}
      <RowList label={t("screens.D2.b6.label")} rows={v.members.map((m): RowProps => ({
        title: memberName(m),
        sub: f.rematchOf ? recoveryLine(v, m.index) : m.facts.keptRate === null ? t("common.keptRateNew") : t("screens.D2.b6.r0.s", { rate: Math.round(m.facts.keptRate * 100), days: m.facts.rateDays }),
        leading: m.facts.avatar ? { kind: "avatar", config: m.facts.avatar } : { kind: "initial", initial: memberInitial(m), bg: memberColor(m) },
        value: t("screens.D2.b6.r0.r", { amount: oathAmount(v.facts, m.balance) }),
        // On chain the program pays out (D-14); until it settles by the same rule (D-93) this is a projection, not money earned.
        valueSub: m.missed.length === 0 ? t(v.estimated ? "additions.core.estimate" : "screens.D2.b6.r0.rs")
          : (text => (v.estimated ? t("additions.core.estimateAfter", { text }) : text))(m.missed.length === 1 ? t("screens.D2.b6.r2.rs", { day: m.missed[0]! + 1 }) : t("screens.D2·low.b3.r2.rs", { n: m.missed.length })),
        ...(m.missed.length ? { valueColor: color.orange.base } : {}),
        ...(!m.isMe ? { chevron: true, onPress: () => go("I2", { wallet: m.facts.wallet }) } : {}),
      }))} />
      {v.preview ? <Banner tone="ora" icon="cards-playing-outline"
        title={t("screens.D2.b7.title", { name: memberName(v.members[v.preview.member]!) })}
        sub={t("screens.D2.b7.sub", {
          shares: v.members.filter((m) => (v.preview!.result.won[m.index] ?? 0n) > 0n).map((m) => `${memberName(m)} +${oathAmount(v.facts, v.preview!.result.won[m.index]!)}`).join(" · "),
          fee: oathAmount(v.facts, v.preview.result.fee),
        })} /> : null}
    </Screen>
  );
}

function Odds({ m }: { m: MemberView }) {
  const name = memberName(m);
  if (m.odds.kind === "keep") return <OddsChip likely="keep" text={t("screens.D2.b4.chip.0", { name, n: m.odds.against })} />;
  if (m.odds.kind === "miss") return <OddsChip likely="miss" text={t("screens.D2.b4.chip.1", { name, n: m.odds.for })} />;
  if (m.odds.kind === "review") return <OddsChip likely="review" text={t("screens.D2.b4.chip.2", { name })} />;
  return null;
}

/** "Arjun missed day 2: −20, then +10 heal." for the last finished day with a miss. */
function noteFor(v: OathView): string | null {
  const d = v.lastDay;
  if (!d || d.damage === 0 || d.broken) return null;
  const missed = v.members.filter((m) => !((m.facts.daysKept >> d.day) & 1));
  return t("screens.D2.b0.note", { name: listNames(missed.map(memberName)), day: d.day + 1, damage: d.damage, heal: d.healed });
}

/** The last day is over but the program hasn't settled yet: the scheduler does it, or anyone can. */
function Over({ v }: { v: OathView }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const settle = async () => {
    setBusy(true);
    try { await oathActions.settle(v.facts); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Banner tone="lime" icon="flag-checkered" title={t("additions.core.settlingTitle")} sub={t("additions.core.settlingSub")} />
      {v.facts.source === "chain" ? <Button kind="s" size="row" label={t("additions.core.settleNow")} loading={busy} onPress={() => { void settle(); }} /> : null}
    </>
  );
}

// ── D3 Broken ──
function Broken({ v }: { v: OathView }) {
  const { go, back } = useGo();
  const f = v.facts;
  const playFx = useUi((s) => s.playFx);
  const broke = (v.state.brokeOnDay ?? 0) + 1;
  const missers = v.members.filter((m) => m.missed.length);
  const missedText = missers.map((m) => t("additions.core.personMissed", { name: memberName(m), days: dayList(m.missed.map((d) => d + 1)) })).join(" ");
  const myHeld = v.me >= 0 ? v.state.held[v.me] ?? 0n : 0n;
  useEffect(() => { playFx("embers"); }, [playFx]);
  // Rematch has no backend yet: Live hides it (D-80, BACKEND_GAPS P1-2).
  const rematch = useFeature("rematch");
  return (
    <Screen layout="D3" bar={<NavBar onBack={back} title={f.name} />} bottomInset={pinned(rematch ? 2 : 1)} pinned={<>
      {rematch ? <Button kind="l" icon="sword-cross" label={t("screens.D3.pin.0", { amount: oathAmount(f, myHeld) })} onPress={() => go("R1", { id: f.id })} /> : null}
      <Button kind="t" label={t("screens.D3.pin.1")} onPress={() => go("C1")} />
    </>}>
      <HPPanel hp={0} lostToday={v.lastDay?.hpBefore ?? 0} note={t("screens.D3.b0.note", { day: broke })} />
      <Title heading={t("screens.D3.b1.title")} sub={t("screens.D3.b1.sub", { missed: missedText })} />
      <DayMemberGrid days={f.numDays} today={-1} members={v.members.map((m) => ({ key: m.facts.wallet, name: memberName(m), initial: memberInitial(m), color: memberColor(m), cells: m.cells }))} />
      <Breakdown label={t("screens.D3.b3.label")} rows={v.members.map((m) => ({ label: memberName(m), value: t("screens.D3.b3.row0.v", { amount: oathAmount(f, -v.results[m.index]!.lost) }), color: color.red.base }))} />
      {rematch ? <OathCard variant="lime" icon="sword-cross" name={t("screens.D3.b4.name")} meta={t("screens.D3.b4.meta")} line={t("additions.rematch.winBackHalf")} onPress={() => go("R1", { id: f.id })} /> : null}
    </Screen>
  );
}

// ── D4 Ended ── numbers per D-14 (the view uses the chain's payout for settled chain Oaths).
export function D4() {
  const { view } = useOathScreen();
  if (!view) return <Loading />;
  return <Ended v={view} />;
}

function Ended({ v }: { v: OathView }) {
  const { go, back } = useGo();
  const f = v.facts;
  const kept = v.members.filter((m) => m.missed.length === 0).length;
  const slipped = v.members.filter((m) => m.missed.length);
  return (
    <Screen bar={<NavBar onBack={back} title={f.name} />} bottomInset={v.claimable > 0n ? pinned(1) : 0}
      pinned={v.claimable > 0n ? <Button kind="l" icon="hand-coin-outline" label={t("screens.D4.pin.0", { amount: oathAmount(f, v.claimable) })} onPress={() => go("J1", { id: f.id })} /> : undefined}>
      <ChipRow>
        <Chip text={t("screens.D4.b0.chip.0", { date: shortDate(endOf(v)) })} icon="flag-checkered" tilt={-2} />
        <Chip text={t("screens.D4.b0.chip.1", { hp: v.hp })} icon="heart-pulse" tone="lime" tilt={2} />
      </ChipRow>
      <Title heading={t("screens.D4.b1.title", { n: kept, total: v.members.length })} sub={slipped.length ? t("additions.core.slipped", { names: listNames(slipped.map(memberName)), asset: oathAsset(v.facts) }) : t("additions.core.allKept")} />
      <DayMemberGrid days={f.numDays} today={-1} members={v.members.map((m) => ({ key: m.facts.wallet, name: memberName(m), initial: memberInitial(m), color: memberColor(m), cells: m.cells }))} />
      <RowList label={t("screens.D4.b3.label")} rows={v.members.map((m) => {
        const r = v.results[m.index]!;
        return {
          title: memberName(m),
          sub: t("screens.D4.b3.r0.s", { start: oathAmount(f, r.start), lost: r.lost > 0n ? oathAmount(f, -r.lost) : oathAmount(f, 0n), won: r.won > 0n ? `+${oathAmount(f, r.won)}` : oathAmount(f, 0n) }),
          value: t("screens.D4.b3.r0.r", { amount: oathAmount(f, r.final) }), valueSub: t("screens.D4.b3.r0.rs"),
          leading: { kind: "initial" as const, initial: memberInitial(m), bg: memberColor(m) },
        };
      })} />
    </Screen>
  );
}

// ── D5 Oath history ── no history route yet (BACKEND_GAPS P1-9): the design's sample until then.
export function D5() {
  const { back } = useGo();
  const toast = useToast();
  const [seg, setSeg] = useState(0);
  const { views } = useOathList();
  const rows = historyOf(views);
  const shown = rows.filter((r) => seg === 0 || (seg === 1 && r.kind === "kept") || (seg === 2 && r.kind === "broken") || (seg === 3 && r.rematch));
  const month = (r: HistoryRow) => new Date(r.endedAt * 1000).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const months = [...new Set(shown.map(month))];
  const totals = historyTotals(rows);
  const net = (n: bigint) => (n === 0n ? t("screens.D5.b4.r1.r") : n > 0n ? `+${oathAmount({ asset: "sol" }, n)}` : oathAmount({ asset: "sol" }, n));
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.D5.nav.title")} />}>
      <SearchBar placeholder={t("screens.D5.b0.placeholder", { n: rows.length })} onPress={() => toast(t("toasts.23"))} />
      <Segmented items={[0, 1, 2, 3].map((i) => t(`screens.D5.b1.seg.${i}` as never))} value={seg} onChange={setSeg} />
      <Banner tone="grey" icon="chart-box-outline" title={t("screens.D5.b2.title", { n: totals.n, kept: totals.kept, broken: totals.broken })}
        sub={t("screens.D5.b2.sub", { won: oathAmount({ asset: "sol" }, totals.won), lost: oathAmount({ asset: "sol" }, totals.lost) })} />
      {/* Virtualised: history only grows (Live). Each month is a labelled section, as RowLists were. */}
      <ScreenList items={months.flatMap((m, k) => rowListItems(m, shown.filter((r) => month(r) === m).map((r) => ({
        title: r.name, sub: r.sub, value: net(r.net), valueColor: r.net < 0n ? color.red.base : r.net > 0n ? color.lime.base : color.text.secondary,
        leading: { kind: "icon" as const, icon: r.rematch ? "sword-cross" as const : objectIcon(r.objectId) },
      })), { label: m.split(" ")[0]!.toUpperCase(), gapBefore: k ? metrics.screen.gap : 0 }))} />
    </Screen>
  );
}
