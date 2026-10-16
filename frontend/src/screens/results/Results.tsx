// J · Claim and L · Results (screens.md J1–J1·f, L1–L4·b). Settled chain Oaths show the chain's
// payout (D-14); the view already does that. Results are "moments": shown once per device (D-29),
// then the Oath opens on D3/D4.
import { useCallback, useEffect, useMemo } from "react";
import { keeperLines, t } from "@/copy";
import { Button } from "@/components/actions";
import { NavBar } from "@/components/chrome";
import { BrandStamp } from "@/components/brand/Brand";
import { Breakdown, Chip, ChipRow, Title } from "@/components/content/Basics";
import { HPPanel } from "@/components/content/Oath";
import { MoneyMoment } from "@/components/content/Inputs";
import { RowList } from "@/components/content/Rows";
import { SignStatus } from "@/components/content/Status";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen } from "@/components/layout/Screen";
import { flattenBlocks } from "@/components/primitives";
import { useFeature } from "@/features/availability";
import { color, metrics } from "@/theme";
import { useGo, useParams } from "@/app/nav";
import type { DesignId } from "@/app/routes";
import { oathActions, useOath } from "@/features/oaths/hooks";
import type { OathView } from "@/features/oaths/model";
import { useDeviceOaths } from "@/features/oaths/device";
import { dayList, memberColor, memberInitial, memberName, oathAmount, oathAsset } from "@/features/oaths/present";
import { screenFor } from "@/features/oaths/route";
import { useUi } from "@/state/ui";
import { SigningScreen } from "../shared/Signing";

const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;
const signed = (view: OathView, units: bigint) => (units > 0n ? `+${oathAmount(view.facts, units)}` : units < 0n ? oathAmount(view.facts, units) : "0");

function useClaimScreen() {
  const { id } = useParams<{ id: string }>();
  const { view } = useOath(id);
  return { id: id ?? "", view, mine: view && view.me >= 0 ? view.results[view.me]! : null };
}

// ── J1 Claim ──
export function J1() {
  const { back, replace } = useGo();
  const { id, view, mine } = useClaimScreen();
  if (!view || !mine) return <Screen bar={<NavBar onBack={back} close title={t("screens.J1.nav.title")} />} />;
  const amount = view.claimable;
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.J1.nav.title")} />} bottomInset={amount > 0n ? pinned(1) : 0}
      pinned={amount > 0n ? <Button kind="l" icon="hand-coin-outline" label={t("screens.J1.pin.0")} onPress={() => replace("J1·p", { id })} /> : undefined}>
      <MoneyMoment value={t("screens.J1.b1.value", { amount: oathAmount(view.facts, amount) })} caption={amount > 0n ? t("screens.J1.b1.caption", { asset: oathAsset(view.facts).toUpperCase() }) : t("additions.core.nothingToClaim")} tone="lime" />
      <Breakdown label={t("screens.J1.b2.label", { name: view.facts.name.toUpperCase() })} rows={[
        { label: t("screens.J1.b2.row0.l"), value: t("screens.J1.b2.row0.v", { amount: oathAmount(view.facts, mine.start) }) },
        { label: t("screens.J1.b2.row1.l"), value: t("screens.J1.b2.row1.v", { amount: mine.lost > 0n ? oathAmount(view.facts, -mine.lost) : oathAmount(view.facts, 0n) }), ...(mine.lost > 0n ? { color: color.red.base } : {}) },
        { label: t("screens.J1.b2.row2.l"), value: t("screens.J1.b2.row2.v", { amount: signed(view, mine.won) }), ...(mine.won > 0n ? { color: color.lime.base } : {}) },
        // Fees come out of the losers' money; nobody pays a fee on what they kept (rules.md §3).
        { label: t("screens.J1.b2.row3.l"), value: t("screens.J1.b2.row3.v") },
        { label: t("screens.J1.b2.row4.l"), value: t("screens.J1.b2.row4.v", { amount: oathAmount(view.facts, amount) }), total: true, color: color.lime.base },
      ]} />
    </Screen>
  );
}

// ── J1·p Claim · signing ──
export function J1p() {
  const { id, view } = useClaimScreen();
  const task = useCallback(async () => { if (!view) throw new Error("Oath not loaded"); return oathActions.claim(view.facts); }, [view]);
  const onDone = useCallback((amount: bigint) => ({ to: "J1·ok" as const, params: { id, amount: view ? oathAmount(view.facts, amount) : "" } }), [id, view]);
  const fail = useMemo(() => ({ retry: "J1·p" as const, edit: "J1" as const, params: { id }, failed: "J1·f" as const }), [id]);
  if (!view) return null;
  return <SigningScreen title={t("screens.J1·p.b2.title")} sub={t("screens.J1·p.b2.sub", { amount: oathAmount(view.facts, view.claimable) })} task={task} onDone={onDone} fail={fail} />;
}

// ── J1·ok Claimed ──
export function J1ok() {
  const { go } = useGo();
  const { amount = "" } = useParams<{ amount: string }>();
  const playFx = useUi((s) => s.playFx);
  const k = keeperLines("J1·ok")[0]!;
  useEffect(() => { playFx(undefined, "payout"); }, [playFx, amount]);
  return (
    <Screen bar={<NavBar onBack={() => go("B1")} close />} bottomInset={pinned(1)}
      pinned={<><Button kind="p" label={t("screens.J1·ok.pin.0")} onPress={() => go("B1")} /></>}>
      <ScreenKeeper id="J1·ok" lines={[k]} />
      <Title heading={t("screens.J1·ok.b2.title")} sub={t("screens.J1·ok.b2.sub", { amount })} align="center" fs={40} />
      <BrandStamp text={t("screens.J1·ok.brand.stamp", { amount })} />
    </Screen>
  );
}

// ── J1·f Claim failed ──
export function J1f() {
  const { back, replace } = useGo();
  const { id, view } = useClaimScreen();
  return (
    <Screen bar={<NavBar onBack={back} close />} bottomInset={pinned(1)}
      pinned={<Button kind="p" icon="refresh" label={t("screens.J1·f.pin.0")} onPress={() => replace("J1·p", { id })} />}>
      <SignStatus state="fail" chip={t("screens.C7·fail.b1.chip")} />
      <Title heading={t("screens.J1·f.b2.title")} sub={t("screens.J1·f.b2.sub", { amount: view ? oathAmount(view.facts, view.claimable) : "" })} align="center" />
    </Screen>
  );
}

// ── Results ──
/** Which L screen an Oath's outcome shows, if any. */
function resultScreen(v: OathView): DesignId | null {
  if (v.me < 0) return null;
  const missedMe = v.members[v.me]!.missed.length > 0;
  // A Bounty: out the day after a miss (H4), or survived at the end (H5). Solo HP doesn't apply.
  if (v.facts.bountyId) return missedMe ? "H4" : v.life === "settled" ? "H5" : null;
  // A Rematch: kept every day of one that held → L6; otherwise the recovery is lost.
  if (v.facts.rematchOf && (v.life === "settled" || v.life === "broken")) return !missedMe && v.life === "settled" ? "L6" : "R4·lost";
  if (v.life === "broken") return v.facts.isSolo ? "L4·b" : "L3";
  if (v.life !== "settled") return null;
  if (v.facts.isSolo) return missedMe ? "L4·m" : "L4";
  return missedMe ? "L2" : "L1";
}

/** Opens the result screen of a newly settled or broken Oath, once per device (D-29). */
export function useResultMoments(views: OathView[]) {
  const { go } = useGo();
  const shown = useDeviceOaths((s) => s.shownResults);
  useEffect(() => {
    for (const v of views) {
      const to = resultScreen(v);
      if (!to) continue;
      const k = `${v.facts.id}:${to}`;
      if (shown.includes(k)) continue;
      useDeviceOaths.getState().markShown(k);
      // Bounty screens take the Bounty's id; everything else the Oath's.
      go(to, { id: v.facts.bountyId ?? v.facts.id });
      return;
    }
  }, [views, shown, go]);
}

function Moment({ v, children, pins, stamp }: { v: OathView; children: React.ReactNode; pins: React.ReactNode; stamp?: string }) {
  const { replace } = useGo();
  // Pins come as a fragment: count its buttons so the content ends above all of them.
  const n = Math.max(1, flattenBlocks(pins).length);
  return (
    <Screen bar={<NavBar onBack={() => replace(screenFor(v), { id: v.facts.id })} close />} bottomInset={pinned(n)}
      pinned={<>{pins}</>}>
      {children}
      {stamp ? <BrandStamp text={stamp} /> : null}
    </Screen>
  );
}

function useResult() {
  const { id } = useParams<{ id: string }>();
  const { view } = useOath(id);
  const playFx = useUi((s) => s.playFx);
  return { view, mine: view && view.me >= 0 ? view.results[view.me]! : null, playFx };
}

// ── L1 Kept every day / L2 Missed some days ──
function GroupSettled({ missed }: { missed: boolean }) {
  const { go } = useGo();
  const { view, mine, playFx } = useResult();
  useEffect(() => { if (view && !missed) playFx(undefined, "payout"); }, [view, missed, mine, playFx]);
  if (!view || !mine) return null;
  const id = missed ? "L2" : "L1";
  const k = keeperLines(id)[0]!;
  const me = view.members[view.me]!;
  const net = mine.final - mine.start;
  const claim = <Button kind={missed ? "p" : "l"} icon="hand-coin-outline" label={t("screens.L1.pin.0", { amount: oathAmount(view.facts, view.claimable || mine.final) })} onPress={() => go("J1", { id: view.facts.id })} />;
  return (
    <Moment v={view} pins={claim} stamp={missed ? t("screens.L2.brand.stamp", { name: view.facts.name.toUpperCase() }) : t("screens.L1.brand.stamp", { name: view.facts.name.toUpperCase(), kept: me.keptDays, total: view.facts.numDays })}>
      <ScreenKeeper id={id} lines={[k]} />
      <Title heading={missed ? t("screens.L2.b1.title", { name: view.facts.name }) : t("screens.L1.b1.title", { name: view.facts.name })}
        {...(missed ? { sub: t("screens.L2.b1.sub", { days: dayList(me.missed.map((d) => d + 1)) }) } : {})} align="center" />
      <MoneyMoment value={t("screens.L1.b2.value", { amount: oathAmount(view.facts, mine.final) })} tone={missed ? "white" : "lime"}
        caption={net >= 0n ? t("screens.L1.b2.caption", { amount: oathAmount(view.facts, net) }) : t("additions.core.down", { amount: oathAmount(view.facts, -net) })} />
      <Breakdown rows={[
        { label: t("screens.L1.b3.row0.l"), value: oathAmount(view.facts, mine.start) },
        { label: missed ? t("screens.L2.b3.row1.l", { n: me.missed.length }) : t("screens.L1.b3.row1.l"), value: mine.lost > 0n ? oathAmount(view.facts, -mine.lost) : oathAmount(view.facts, 0n), ...(mine.lost > 0n ? { color: color.red.base } : {}) },
        { label: missed ? t("screens.L2.b3.row2.l") : t("screens.L1.b3.row2.l"), value: signed(view, mine.won), color: color.lime.base },
        { label: t("screens.L1.b3.row3.l"), value: t("screens.L1.b3.row3.v", { amount: oathAmount(view.facts, mine.final) }), total: true },
      ]} />
    </Moment>
  );
}
export const L1 = () => <GroupSettled missed={false} />;
export const L2 = () => <GroupSettled missed />;

// ── L3 Oath broken ──
export function L3() {
  const { go } = useGo();
  const { view, playFx } = useResult();
  const rematch = useFeature("rematch");
  useEffect(() => { if (view) playFx("embers"); }, [view, playFx]);
  if (!view) return null;
  const k = keeperLines("L3")[0]!;
  const day = (view.state.brokeOnDay ?? 0) + 1;
  const myLost = view.me >= 0 ? view.results[view.me]!.lost : 0n;
  const held = view.me >= 0 ? view.state.held[view.me] ?? 0n : 0n;
  const dmg = view.facts.isSolo ? 35 : 20;
  return (
    <Moment v={view} pins={<>
      {rematch ? <Button kind="l" icon="sword-cross" label={t("screens.L3.pin.0", { amount: oathAmount(view.facts, held) })} onPress={() => go("R1", { id: view.facts.id })} /> : null}
      <Button kind="t" label={t("screens.L3.pin.1")} onPress={() => go("C1")} />
    </>}>
      <ScreenKeeper id="L3" lines={[k]} />
      <Title heading={t("screens.L3.b1.title")} sub={t("screens.L3.b1.sub", { name: view.facts.name, day })} align="center" fs={48} />
      <MoneyMoment value={t("screens.L3.b2.value", { amount: oathAmount(view.facts, -myLost) })} caption={t("screens.L3.b2.caption")} tone="red" />
      <RowList label={t("screens.L3.b3.label")} rows={view.members.filter((m) => m.missed.length).map((m) => ({
        title: memberName(m), sub: t("screens.L3.b3.r0.s", { days: dayList(m.missed.map((d) => d + 1)) }), value: t("screens.L3.b3.r0.r", { hp: dmg * m.missed.length }), valueColor: color.red.base,
        leading: m.facts.avatar ? { kind: "avatar" as const, config: m.facts.avatar } : { kind: "initial" as const, initial: memberInitial(m), bg: memberColor(m) },
      }))} />
    </Moment>
  );
}

// ── L4 Solo kept / L4·m Solo missed some ──
function SoloSettled({ missed }: { missed: boolean }) {
  const { go } = useGo();
  const { view, mine, playFx } = useResult();
  useEffect(() => { if (view && !missed) playFx(undefined, "payout"); }, [view, missed, playFx]);
  if (!view || !mine) return null;
  const id = missed ? "L4·m" : "L4";
  const k = keeperLines(id)[0]!;
  const me = view.members[view.me]!;
  const claim = <Button kind={missed ? "p" : "l"} icon="hand-coin-outline" label={t("screens.L4.pin.0", { amount: oathAmount(view.facts, view.claimable || mine.final) })} onPress={() => go("J1", { id: view.facts.id })} />;
  return (
    <Moment v={view} pins={claim}>
      <ScreenKeeper id={id} lines={[k]} />
      <Title heading={missed ? t("screens.L4·m.b1.title", { name: view.facts.name }) : t("screens.L4.b1.title", { name: view.facts.name })}
        sub={missed ? t("screens.L4·m.b1.sub", { days: dayList(me.missed.map((d) => d + 1)) }) : t("screens.L4.b1.sub", { kept: me.keptDays, total: view.facts.numDays })} align="center" />
      {missed ? (
        <Breakdown rows={[
          { label: t("screens.L4·m.b2.row0.l"), value: oathAmount(view.facts, mine.start) },
          { label: t("screens.L4·m.b2.row1.l", { n: me.missed.length }), value: t("screens.L4·m.b2.row1.v", { amount: oathAmount(view.facts, -mine.lost) }), color: color.red.base },
          { label: t("screens.L4·m.b2.row2.l"), value: t("screens.L4·m.b2.row2.v", { hp: view.hp }) },
          { label: t("screens.L4·m.b2.row3.l"), value: t("screens.L4·m.b2.row3.v", { amount: oathAmount(view.facts, mine.final) }), total: true },
        ]} />
      ) : (
        <ChipRow justify="center">
          <Chip text={t("screens.L4.b2.chip.0", { amount: oathAmount(view.facts, mine.final) })} icon="sack" tone="lime" tilt={-2} />
          <Chip text={t("screens.L4.b2.chip.1", { hp: view.hp })} icon="heart-pulse" tone="lime" tilt={2} />
        </ChipRow>
      )}
    </Moment>
  );
}
export const L4 = () => <SoloSettled missed={false} />;
export const L4m = () => <SoloSettled missed />;

// ── L4·b Solo broken ──
export function L4b() {
  const { go } = useGo();
  const { view, playFx } = useResult();
  const rematch = useFeature("rematch");
  useEffect(() => { if (view) playFx("embers"); }, [view, playFx]);
  if (!view) return null;
  const k = keeperLines("L4·b")[0]!;
  const me = view.members[view.me]!;
  const held = view.state.held[view.me] ?? 0n;
  return (
    <Moment v={view} pins={<>
      {rematch ? <Button kind="l" icon="sword-cross" label={t("screens.L4·b.pin.0", { amount: oathAmount(view.facts, held) })} onPress={() => go("R1", { id: view.facts.id })} /> : null}
      <Button kind="t" label={t("screens.L4·b.pin.1")} onPress={() => go("C1")} />
    </>}>
      <ScreenKeeper id="L4·b" lines={[k]} />
      <Title heading={t("screens.L4·b.b1.title", { name: view.facts.name, day: (view.state.brokeOnDay ?? 0) + 1 })}
        sub={t("screens.L4·b.b1.sub", { count: me.missed.length, amount: oathAmount(view.facts, view.facts.stake) })} align="center" />
      <HPPanel hp={0} lostToday={view.lastDay?.hpBefore ?? 0} note={t("screens.L4·b.b2.note")} />
    </Moment>
  );
}
