// R · Rematch (screens.md R1–R4·lost, L6). Mock only (BACKEND_GAPS P1-2). Recovery is the amount
// held for each member at the break (D-9); it comes back only if they keep every day of a Rematch
// that doesn't break. R·act is the Oath screen (D2) for the Rematch Oath.
import { useCallback, useEffect, useMemo } from "react";
import { MAX_MEMBERS } from "@kept/config";
import { keeperLines, t } from "@/copy";
import { Button } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { BrandStamp } from "@/components/brand/Brand";
import { Banner, BodyText, Breakdown, Chip, ChipRow, Note, Skeleton, Title } from "@/components/content/Basics";
import { MoneyMoment, SeatSlots } from "@/components/content/Inputs";
import type { Seat } from "@/components/content/Inputs";
import { RowList } from "@/components/content/Rows";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { shortDuration } from "@/lib/format";
import { color, metrics } from "@/theme";
import { useGo, useParams } from "@/app/nav";
import { useOath } from "@/features/oaths/hooks";
import type { OathView } from "@/features/oaths/model";
import { dayList, listNames, memberColor, memberInitial, memberName, oathObjects, skrWhole } from "@/features/oaths/present";
import { rematchActions, useRematch } from "@/features/queries";
import { useNow } from "@/features/time";
import { useSession } from "@/state/session";
import { useUi } from "@/state/ui";
import { SigningScreen } from "../shared/Signing";
import { keeperAt } from "@/app/layout";

const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;
const signed = (u: bigint) => (u > 0n ? `+${skrWhole(u)}` : u < 0n ? skrWhole(u) : "0");

/** Lobby seats: everyone in, then an open seat per original member still out. */
function lobbySeats(v: OathView, outCount: number, label: string): Seat[] {
  const seats: Seat[] = v.members.map((m) => ({ kind: "member", name: memberName(m), initial: memberInitial(m), color: memberColor(m), ...(m.facts.avatar ? { avatar: m.facts.avatar } : {}), status: label }));
  for (let i = 0; i < outCount; i++) seats.push({ kind: "open" });
  return seats.slice(0, MAX_MEMBERS);
}

// ── R1 Rematch offer ──
export function R1() {
  const { back, go, replace } = useGo();
  const { id } = useParams<{ id: string }>();
  const { view: source } = useOath(id);
  const offer = useRematch(id);
  const wallet = useSession((s) => s.wallet);
  const now = useNow(60_000);
  const rematch = offer.data?.rematch ?? null;
  const k = keeperLines("R1")[0]!;
  // Already in: go to the lobby (or the running Rematch).
  useEffect(() => {
    if (rematch && rematch.members.some((m) => m.wallet === wallet)) replace(rematch.status === "open" ? "R3" : "R·act", { id: rematch.id });
  }, [rematch, wallet, replace]);
  if (!source || !offer.data) return <Screen bar={<NavBar onBack={back} close title={t("screens.R1.nav.title")} />}><Skeleton height={140} /><Skeleton height={220} /></Screen>;
  const f = source.facts;
  const held = source.me >= 0 ? source.state.held[source.me] ?? 0n : 0n;
  const lost = source.me >= 0 ? source.results[source.me]!.lost : 0n;
  const left = Math.max(0, offer.data.closesAt - now);
  const rv = rematch ? { members: rematch.members.map((m, i) => ({ index: i, facts: m, isMe: m.wallet === wallet })) } : null;
  const joined = rv?.members.length ?? 0;
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.R1.nav.title")} />} bottomInset={pinned(2)} pinned={<>
      <Button kind="l" icon="sword-cross" label={t("screens.R1.pin.0")} disabled={left <= 0} onPress={() => go("R2", { id: f.id })} />
      <Button kind="t" label={t("screens.R1.pin.1")} onPress={back} />
    </>}>
      {/* The chips float around the Keeper at the design's spots (layout.gen.json). */}
      <ScreenKeeper id="R1" lines={[k]} chips={keeperAt("R1", [t("screens.R1.b0.chip.0", { amount: skrWhole(held) }), t("screens.R1.b0.chip.1", { time: shortDuration(left) })]).chips ?? []} />
      <Title heading={t("screens.R1.b1.title", { amount: skrWhole(held) })} sub={t("additions.rematch.winBackHalf")} />
      <Breakdown rows={[
        { label: t("screens.R1.b2.row0.l"), value: t("screens.R1.b2.row0.v", { name: f.name, n: f.numDays, object: oathObjects(f) }) },
        { label: t("screens.R1.b2.row1.l"), value: t("screens.R1.b2.row1.v", { amount: skrWhole(lost) }), color: color.red.base },
        { label: t("screens.R1.b2.row2.l"), value: t("screens.R1.b2.row2.v", { amount: skrWhole(held) }), color: color.lime.base },
        { label: t("screens.R1.b2.row3.l"), value: t("screens.R1.b2.row3.v", { amount: skrWhole(f.stake) }) },
        { label: t("screens.R1.b2.row4.l"), value: t("screens.R1.b2.row4.v", { time: shortDuration(left) }) },
      ]} />
      <BodyText mono text={t("screens.R1.b3.text", { n: joined, total: source.members.length })} />
      <SeatSlots seats={[
        ...(rv?.members ?? []).map((m): Seat => ({ kind: "member", name: memberName(m), initial: memberInitial(m), color: memberColor(m), ...(m.facts.avatar ? { avatar: m.facts.avatar } : {}), status: t("screens.R1.b4.seat0") })),
        ...source.members.filter((m) => !(rv?.members ?? []).some((x) => x.facts.wallet === m.facts.wallet)).map((m): Seat => ({
          kind: "member", name: memberName(m), initial: memberInitial(m), color: memberColor(m), dim: !m.isMe, status: m.isMe ? t("screens.R1.b4.seat2") : t("screens.R1.b4.seat3"),
        })),
      ].slice(0, MAX_MEMBERS)} />
      <Note text={t("screens.R1.b5.text")} />
    </Screen>
  );
}

// ── R2 Rematch · signing ──
export function R2() {
  const { id } = useParams<{ id: string }>();
  const { view: source } = useOath(id);
  const task = useCallback(() => rematchActions.join(id!), [id]);
  const onDone = useCallback((r: { id: string }) => ({ to: "R3" as const, params: { id: r.id } }), []);
  const fail = useMemo(() => ({ retry: "R2" as const, edit: "R1" as const, params: { id: id ?? "" } }), [id]);
  return <SigningScreen title={t("screens.R2.b2.title")} sub={t("screens.R2.b2.sub", { amount: source ? skrWhole(source.facts.stake) : "", name: source?.facts.name ?? "" })} task={task} onDone={onDone} fail={fail} />;
}

// ── R3 Rematch lobby ──
export function R3() {
  const { back, go } = useGo();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { view } = useOath(id);
  const { view: source } = useOath(view?.facts.rematchOf);
  const offer = useRematch(view?.facts.rematchOf);
  const now = useNow(60_000);
  if (!view) return <Screen bar={<NavBar onBack={back} title={t("screens.R3.nav.title")} />}><Skeleton height={200} /></Screen>;
  const f = view.facts;
  const out = source ? source.members.filter((m) => !view.members.some((x) => x.facts.wallet === m.facts.wallet)) : [];
  const total = source?.members.length ?? MAX_MEMBERS;
  const canStart = view.members.length >= 2;
  // One window for everyone: 7 days from the break (rules.md §4), the same clock R1 shows.
  const left = Math.max(0, (offer.data?.closesAt ?? now) - now);
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.R3.nav.title")} />} bottomInset={pinned(2)} pinned={<>
      <Button kind="l" icon="play" label={t("screens.R3.pin.0")} disabled={!canStart} onPress={() => go("D1·go", { id: f.id })} />
      {out.length ? <Button kind="t" label={t("screens.R3.pin.1")} onPress={() => toast(t("toasts.6", { name: listNames(out.map(memberName)) }))} /> : null}
    </>}>
      <ChipRow>
        <Chip text={t("screens.R3.b0.chip.0")} icon="sword-cross" tone="white" tilt={-3} />
        <Chip text={t("screens.R3.b0.chip.1", { name: f.name, n: f.numDays })} icon="guitar-acoustic" tilt={2} />
      </ChipRow>
      <Title heading={t("screens.R3.b1.title", { n: view.members.length, total })} sub={t("screens.R3.b1.sub")} />
      <SeatSlots seats={lobbySeats(view, out.length, t("screens.R3.b2.seat0"))} />
      {out.length ? <RowList label={t("screens.R3.b3.label")} rows={out.map((m) => ({
        title: memberName(m), sub: t("screens.R3.b3.r0.s", { time: shortDuration(left) }), value: t("screens.R3.b3.r0.r"),
        leading: { kind: "initial" as const, initial: memberInitial(m), bg: memberColor(m) },
        onPress: () => toast(t("toasts.3", { name: memberName(m) })),
      }))} /> : null}
    </Screen>
  );
}

/** Rematch member rows on R·act (used by the Oath screen for a Rematch Oath). */
export function recoveryLine(v: OathView, i: number): string {
  const m = v.members[i]!;
  const amount = v.facts.recovery?.[m.facts.wallet] ?? 0n;
  if (m.missed.length) return t("screens.R·act.b4.r1.s", { day: m.missed[0]! + 1 });
  return t("screens.R·act.b4.r0.s", { amount: skrWhole(amount) });
}

// ── L6 Rematch kept / R4 Rematch result / R4·lost ──
function useRematchResult() {
  const { id } = useParams<{ id: string }>();
  const { view } = useOath(id);
  const { view: source } = useOath(view?.facts.rematchOf);
  const mine = view && view.me >= 0 ? view.results[view.me]! : null;
  const recovered = view && mine && view.me >= 0 ? mine.final - (view.state.balances[view.me] ?? 0n) : 0n;
  return { view, source, mine, recovered };
}

export function L6() {
  const { go, replace } = useGo();
  const { view, source, mine, recovered } = useRematchResult();
  const playFx = useUi((s) => s.playFx);
  useEffect(() => { if (recovered > 0n) playFx(undefined, "comeback"); }, [recovered, playFx]);
  if (!view || !mine) return null;
  const k = keeperLines("L6")[0]!;
  return (
    <Screen bar={<NavBar onBack={() => replace("D4", { id: view.facts.id })} close />} bottomInset={pinned(1)}
      pinned={<><Button kind="l" icon="hand-coin-outline" label={t("screens.L6.pin.0", { amount: skrWhole(mine.final) })} onPress={() => go("J1", { id: view.facts.id })} /></>}>
      <ScreenKeeper id="L6" lines={[k]} />
      <Title heading={t("screens.L6.b1.title")} sub={t("screens.L6.b1.sub", { n: view.facts.numDays })} align="center" />
      <MoneyMoment value={t("screens.L6.b2.value", { amount: skrWhole(recovered) })} caption={t("screens.L6.b2.caption", { name: source?.facts.name ?? view.facts.name })} tone="lime" />
      <Breakdown rows={[
        { label: t("screens.L6.b3.row0.l"), value: t("screens.L6.b3.row0.v", { amount: skrWhole(mine.final - recovered) }) },
        { label: t("screens.L6.b3.row1.l"), value: t("screens.L6.b3.row1.v", { amount: skrWhole(recovered) }), color: color.lime.base },
        { label: t("screens.L6.b3.row2.l"), value: t("screens.L6.b3.row2.v", { amount: skrWhole(mine.final) }), total: true },
      ]} />
      <BrandStamp text={t("screens.L6.brand.stamp")} />
    </Screen>
  );
}

function RematchResult({ lost }: { lost: boolean }) {
  const { back, go } = useGo();
  const { view, source, mine, recovered } = useRematchResult();
  if (!view || !mine) return null;
  const id = lost ? "R4·lost" : "R4";
  const me = view.members[view.me]!;
  const firstMiss = me.missed[0] !== undefined ? me.missed[0] + 1 : 0;
  const rows = [
    { label: t(`screens.${id}.b1.row0.l`), value: t(`screens.${id}.b1.row0.v`, { amount: skrWhole(mine.start) }) },
    { label: lost ? t("screens.R4·lost.b1.row1.l", { days: dayList(me.missed.map((d) => d + 1)) }) : t("screens.R4.b1.row1.l"), value: t(`screens.${id}.b1.row1.v`, { amount: mine.lost > 0n ? skrWhole(-mine.lost) : "0" }), ...(mine.lost > 0n ? { color: color.red.base } : {}) },
    { label: t(`screens.${id}.b1.row2.l`, { name: listNames(view.members.filter((m) => m.missed.length && !m.isMe).map(memberName)) }), value: t(`screens.${id}.b1.row2.v`, { amount: signed(mine.won) }), ...(mine.won > 0n ? { color: color.lime.base } : {}) },
    // The fee comes out of the money lost (rules.md §3), so it isn't charged again here (DECISIONS D-64).
    { label: t(`screens.${id}.b1.row3.l`), value: lost ? t("screens.R4·lost.b1.row3.v", { amount: "0" }) : t("screens.R4.b1.row3.v") },
    { label: t(`screens.${id}.b1.row4.l`, { name: source?.facts.name ?? "" }), value: t(`screens.${id}.b1.row4.v`, { amount: signed(recovered) }), ...(recovered > 0n ? { color: color.lime.base } : {}) },
    { label: t(`screens.${id}.b1.row5.l`), value: t(`screens.${id}.b1.row5.v`, { amount: skrWhole(mine.final) }), total: true, ...(!lost ? { color: color.lime.base } : {}) },
  ];
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.R4.nav.title")} />} bottomInset={pinned(1)}
      pinned={<Button kind={lost ? "p" : "l"} icon="hand-coin-outline" label={t("screens.R4.pin.0", { amount: skrWhole(mine.final) })} onPress={() => go("J1", { id: view.facts.id })} />}>
      <Title heading={t(`screens.${id}.b0.title`)} {...(!lost ? { sub: t("screens.R4.b0.sub", { n: view.facts.numDays }) } : {})} />
      <Breakdown rows={rows} />
      {lost
        ? <Banner tone="red" icon="close-circle-outline" title={t("screens.R4·lost.b2.title", { days: dayList([firstMiss]) })} sub={t("screens.R4·lost.b2.sub")} />
        : <Banner tone="lime" icon="sword-cross" title={t("screens.R4.b2.title", { amount: skrWhole(recovered) })} sub={t("screens.R4.b2.sub", { name: source?.facts.name ?? "" })} />}
    </Screen>
  );
}
export const R4 = () => <RematchResult lost={false} />;
export const R4lost = () => <RematchResult lost />;
