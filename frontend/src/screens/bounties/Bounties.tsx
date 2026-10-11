// H · Bounties (screens.md H1–H7, L5). Mock only (BACKEND_GAPS P1-10). Joining is free; my
// participation is a stake-0 Oath on the Bounty's days, so proof uses F1–F5 and claiming uses J1.
import { useEffect, useMemo, useState } from "react";
import { Share } from "react-native";
import { keeperLines, t } from "@/copy";
import type { CopyKey } from "@/copy";
import { Button, ButtonRow } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { BrandStamp } from "@/components/brand/Brand";
import { Banner, BodyText, Breakdown, Chip, ChipRow, Note, SearchBar, Segmented, Skeleton, Title } from "@/components/content/Basics";
import { MoneyMoment, SeatSlots } from "@/components/content/Inputs";
import type { Seat } from "@/components/content/Inputs";
import { OathCard } from "@/components/content/Oath";
import { RowList, rowListItems } from "@/components/content/Rows";
import { BountyCover, HScroller } from "@/components/content/Social";
import type { HeroItem } from "@/components/content/Social";
import { BarChart } from "@/components/content/Status";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen, ScreenList } from "@/components/layout/Screen";
import { ago, shortDuration } from "@/lib/format";
import { DAY_SECONDS as DAY } from "@kept/engine";
import { color, metrics, tokens } from "@/theme";
import type { HeroPaletteName } from "@/theme";
import { useGo, useParams } from "@/app/nav";
import type { DesignId } from "@/app/routes";
import { CATEGORIES } from "@/features/bounties/model";
import type { BountyFacts, Category } from "@/features/bounties/model";
import { useOath, useOathList } from "@/features/oaths/hooks";
import type { OathView } from "@/features/oaths/model";
import { objectIcon, objectName, skrWhole, startsTitle } from "@/features/oaths/present";
import { bountyActions, useBounties, useBounty, useMyBounty, useStats } from "@/features/queries";
import { useNow } from "@/features/time";
import { useSession } from "@/state/session";
import { useSettings } from "@/state/settings";
import { useUi } from "@/state/ui";
import { TabScreen } from "../tabs/TabScreen";
import { useFeature } from "@/features/availability";

const pinned = (n: number) => metrics.button.height * n + metrics.pinned.gap * (n - 1) + metrics.pinned.bottom;
const HERO: HeroPaletteName[] = ["lime", "vio", "sky", "pink", "amber", "orange"];
const BANNERS = [tokens.color.banner[0], tokens.color.banner[1], tokens.color.banner[2], tokens.color.banner[3], tokens.color.banner[4]];
export const coverColors = (b: BountyFacts) => { const c = BANNERS[b.brand.palette % BANNERS.length]!; return [c[0]!, c[1]!] as const; };
const isOpen = (b: BountyFacts, now: number) => b.joinClosesAt > now;
const closes = (b: BountyFacts, now: number) => t("screens.H1.b4.i0.s", { brand: b.brand.name, time: shortDuration(Math.max(0, b.joinClosesAt - now)) });
const categoryLabel = (c: Category | null) => t(`common.categories.${c ? CATEGORIES.indexOf(c) + 1 : 0}` as CopyKey);

/** Eligibility per H2 / H2·no: a verified Seeker, and the minimum kept rate if the Bounty sets one. */
function useEligibility(b: BountyFacts | undefined) {
  const genesis = useSession((s) => s.genesis);
  const stats = useStats();
  const rate = stats.data?.keptRate ?? null;
  const rateOk = !b?.minKeptRate || (rate !== null && rate >= b.minKeptRate);
  return { ok: genesis && rateOk, genesis, rate, rateOk };
}

/** My Bounty participations (stake-0 Oaths with a bountyId). */
function useMyBounties() {
  const { views } = useOathList();
  return views.filter((v) => v.facts.bountyId);
}

// ── H1 / H1·j / H1·c the Bounties tab ──
export function BountiesTab({ initial = 0 }: { initial?: 0 | 1 | 2 }) {
  const [seg, setSeg] = useState<number>(initial);
  return (
    <TabScreen tab="bounties">
      <Segmented items={[0, 1, 2].map((i) => t(`screens.H1.b0.seg.${i}` as CopyKey))} value={seg} onChange={setSeg} />
      {seg === 0 ? <Discover /> : seg === 1 ? <Joined /> : <Created />}
    </TabScreen>
  );
}
export const H1j = () => <BountiesTab initial={1} />;
export const H1c = () => <BountiesTab initial={2} />;

function Discover() {
  const { go } = useGo();
  const { data, isLoading } = useBounties();
  const following = useSettings((s) => s.following);
  const now = useNow(60_000);
  const open = useMemo(() => (data ?? []).filter((b) => isOpen(b, now) && !b.createdBy), [data, now]);
  if (isLoading) return <><Skeleton height={48} /><Skeleton height={170} /><Skeleton height={148} /></>;
  const featured = open.find((b) => b.featured) ?? open[0];
  const card = (b: BountyFacts, i: number, sub: string): HeroItem => ({
    title: b.name, icon: objectIcon(b.objectId), value: t("screens.H1.b4.i0.v", { amount: skrWhole(b.pool) }), sub, palette: HERO[i % HERO.length]!, onPress: () => go("H2", { id: b.id }),
  });
  const closingSoon = [...open].sort((a, b) => a.joinClosesAt - b.joinClosesAt).slice(0, 4);
  const biggest = [...open].sort((a, b) => Number(b.pool - a.pool)).slice(0, 4);
  const followed = open.filter((b) => following.includes(b.brand.name));
  return (
    <>
      <SearchBar placeholder={t("screens.H1.b1.placeholder", { n: open.length })} onPress={() => go("H7")} />
      <HScroller chips={[0, 1, 2, 3, 4, 5, 6].map((i) => t(`screens.H1.b2.i${i}.t` as CopyKey))} chipValue={0} onChip={(i) => go("H7", { category: i })} />
      {featured ? <BountyCover brand={featured.brand.name} logo={featured.brand.logo} verified={featured.brand.verified} colors={coverColors(featured)} icon={objectIcon(featured.objectId)}
        message={featured.message} tags={[{ text: t("screens.H1.b3.tag.0"), icon: "star" }, { text: t("screens.H1.b3.tag.1", { time: shortDuration(featured.joinClosesAt - now) }), icon: "timer-sand" }]}
        onPress={() => go("H2", { id: featured.id })} /> : null}
      <HScroller label={t("screens.H1.b4.label")} onSeeAll={() => go("H7")} cards={closingSoon.map((b, i) => card(b, i, closes(b, now)))} />
      <HScroller label={t("screens.H1.b5.label")} onSeeAll={() => go("H7", { sort: 1 })} cards={biggest.map((b, i) => card(b, i + 2, closes(b, now)))} />
      {followed.length ? <HScroller label={t("screens.H1.b6.label")} onSeeAll={() => go("H7")} cards={followed.map((b, i) => card(b, i + 4, closes(b, now)))} /> : null}
    </>
  );
}

function Joined() {
  const { go } = useGo();
  const mine = useMyBounties();
  const { data } = useBounties();
  const byId = new Map((data ?? []).map((b) => [b.id, b]));
  if (!mine.length) return <Note text={t("additions.bounty.noneJoined")} />;
  return (
    <>
      {mine.map((v) => {
        const b = byId.get(v.facts.bountyId!);
        if (!b) return null;
        const out = v.members[v.me]!.missed.length > 0;
        const ended = v.life === "settled";
        const status: DesignId = out ? "H4" : ended ? "H5" : "H3";
        return (
          <OathCard key={v.facts.id} variant={out ? "sm" : "default"} dim={out} icon={objectIcon(b.objectId)} name={b.name}
            meta={out ? t("screens.H1·j.b2.meta", { brand: b.brand.name, day: v.members[v.me]!.missed[0]! + 1 }) : ended ? t("screens.H1·j.b3.meta", { brand: b.brand.name }) : t("screens.H1·j.b1.meta", { brand: b.brand.name, day: v.dayNumber, length: b.numDays })}
            onPress={() => go(status, { id: b.id })}
            tags={out ? [{ text: t("screens.H1·j.b2.tag.0"), icon: "close-thick", tone: "red" }]
              : ended ? [{ text: t("screens.H1·j.b3.tag.0"), icon: "trophy-outline", tone: "lime" }, ...(v.claimable > 0n ? [{ text: t("screens.H1·j.b3.tag.1", { amount: skrWhole(v.claimable) }), icon: "sack" as const, tone: "g" as const }] : [])]
              : [{ text: t("screens.H1·j.b1.tag.0"), icon: "check-bold", tone: "g" }, { text: t("screens.H1·j.b1.tag.1", { n: b.remaining, total: b.entrants }), icon: "account-group" }]}
            {...(!out && !ended && v.life === "active" && v.members[v.me]!.pendingToday ? { button: { label: t("screens.H1·j.b1.btn"), kind: "p" as const, icon: "camera" as const, onPress: () => go("F1", { id: v.facts.id }) } } : {})} />
        );
      })}
    </>
  );
}

function Created() {
  const { go } = useGo();
  const canCreate = useFeature("createBounty");
  const { data } = useBounties();
  const wallet = useSession((s) => s.wallet);
  const now = useNow(60_000);
  const mine = (data ?? []).filter((b) => b.createdBy && b.createdBy === wallet);
  const k = keeperLines("H1·c")[0]!;
  return (
    <>
      {mine.map((b) => {
        const day = Math.max(1, Math.min(b.numDays, Math.floor((now - b.startsAt) / 86_400) + 1));
        return (
          <OathCard key={b.id} icon={objectIcon(b.objectId)} name={b.name} meta={t("screens.H1·c.b1.meta", { amount: skrWhole(b.pool), day, length: b.numDays })} onPress={() => go("H6", { id: b.id })}
            tags={[{ text: t("screens.H1·c.b1.tag.0", { n: b.entrants }), icon: "account-group" }, { text: t("screens.H1·c.b1.tag.1", { n: b.remaining }), icon: "check-bold", tone: "g" }]}
            button={{ label: t("screens.H1·c.b1.btn"), kind: "s", icon: "chart-bar", onPress: () => go("H6", { id: b.id }) }} />
        );
      })}
      <ScreenKeeper id="H1·c" lines={[k]} />
      {canCreate ? <ButtonRow><Button kind="p" icon="plus" label={t("screens.H1·c.b3.btn.0")} onPress={() => go("K1")} /></ButtonRow> : null}
    </>
  );
}

// ── H2 / H2·no Bounty detail ──
export function H2() {
  const { back, go, replace } = useGo();
  const creatorPages = useFeature("creatorPages");
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { data: b } = useBounty(id);
  const mine = useMyBounty(id);
  const el = useEligibility(b);
  const now = useNow(60_000);
  const [busy, setBusy] = useState(false);
  if (!b) return <Screen bar={<NavBar onBack={back} title={t("screens.H2.nav.title")} />}><Skeleton height={170} /><Skeleton height={260} /></Screen>;
  const joined = !!mine.data;
  const open = isOpen(b, now);
  const join = async () => {
    setBusy(true);
    // Joined: H3 takes H2's place, so back doesn't return to a "Join" button (D-86).
    try { await bountyActions.join(b.id); replace("H3", { id: b.id }); } catch (e) { toast(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const rateChip = b.minKeptRate ? t("screens.H2.b3.chip.1", { min: Math.round(b.minKeptRate * 100), you: el.rate === null ? t("common.keptRateNew") : `${Math.round(el.rate * 100)}%` }) : null;
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.H2.nav.title")} />} bottomInset={pinned(el.ok ? 1 : 2)} pinned={
      joined ? <Button kind="p" label={t("screens.H1·j.b1.tag.0")} onPress={() => go("H3", { id: b.id })} />
      : el.ok ? <Button kind="l" icon="trophy-outline" label={t("screens.H2.pin.0")} disabled={!open} loading={busy} onPress={() => { void join(); }} />
      : <>
        <Button kind="p" label={t("screens.H2·no.pin.0")} onPress={() => go("H1")} />
        <Button kind="t" label={t("screens.H2·no.pin.1")} onPress={() => go("I1")} />
      </>}>
      <BountyCover brand={b.brand.name} logo={b.brand.logo} verified={b.brand.verified} colors={coverColors(b)} icon={objectIcon(b.objectId)} message={b.detail} />
      <RowList rows={[{ title: b.brand.name, sub: b.brand.verified ? t("screens.H2.b1.r0.s") : t("additions.bounty.creatorUnverified"), leading: { kind: "initial", initial: b.brand.logo, bg: coverColors(b)[0] }, ...(creatorPages ? { chevron: true, onPress: () => go("I3", { name: b.brand.name }) } : {}) }]} />
      <Breakdown rows={[
        { label: t("screens.H2.b2.row0.l"), value: t("screens.H2.b2.row0.v", { amount: skrWhole(b.pool) }) },
        { label: t("screens.H2.b2.row1.l"), value: objectName(b.objectId) },
        { label: t("screens.H2.b2.row2.l"), value: t("screens.H2.b2.row2.v", { n: b.numDays }) },
        { label: t("screens.H2.b2.row3.l"), value: open ? t("screens.H2.b2.row3.v", { time: shortDuration(b.joinClosesAt - now) }) : t("additions.bounty.closed") },
        { label: t("screens.H2.b2.row4.l"), value: String(b.entrants) },
        { label: t("screens.H2.b2.row5.l"), value: t("screens.H2.b2.row5.v") },
      ]} />
      <ChipRow>
        <Chip text={t("screens.H2.b3.chip.0")} icon={el.genesis ? "check" : "close"} tone={el.genesis ? "lime" : "red"} tilt={-2} />
        {rateChip ? <Chip text={rateChip} icon={el.rateOk ? "check" : "close"} tone={el.rateOk ? "lime" : "red"} tilt={1} /> : null}
      </ChipRow>
      {el.ok
        ? <Banner tone="lime" icon="check-decagram" title={t("screens.H2.b4.title")} sub={t("screens.H2.b4.sub")} />
        : <Banner tone="red" icon="lock-outline" title={t("screens.H2·no.b3.title")}
          sub={!el.genesis ? t("screens.+.b2.text") : t("screens.H2·no.b3.sub", { min: Math.round((b.minKeptRate ?? 0) * 100) })} />}
    </Screen>
  );
}
export const H2no = H2;

/** My participation in the Bounty behind the route's id. */
function useJoined() {
  const { id } = useParams<{ id: string }>();
  const { data: b } = useBounty(id);
  const mine = useMyBounty(id);
  const { view } = useOath(mine.data?.id);
  return { b, v: view };
}

// ── H3 Bounty, joined ──
export function H3() {
  const { back, go } = useGo();
  const { b, v } = useJoined();
  const now = useNow(60_000);
  if (!b || !v) return <Screen bar={<NavBar onBack={back} title="" />}><Skeleton height={200} /></Screen>;
  const me = v.members[v.me]!;
  const k = keeperLines("H3")[0]!;
  const photos = me.facts.proofToday === "photo1" ? 1 : me.pendingToday ? 0 : 2;
  const share = b.remaining > 0 ? b.pool / BigInt(b.remaining) : 0n;
  return (
    <Screen bar={<NavBar onBack={back} title={b.name} {...(v.life === "active" ? { right: t("screens.D2.nav.right", { day: v.dayNumber, length: b.numDays }) } : {})} />}>
      <Title heading={t("screens.H3.b0.title", { n: b.remaining, total: b.entrants })} />
      {v.life === "waiting" ? <Banner tone="vio" icon="weather-night" title={startsTitle(v.secondsToStart ?? 0)} sub={t("additions.core.startsIn", { time: shortDuration(v.secondsToStart ?? 0) })} /> : null}
      {v.life === "active" ? (
        <OathCard icon={objectIcon(b.objectId)} name={t("screens.H3.b1.name")} meta={t("screens.H3.b1.meta", { object: objectName(b.objectId) })}
          tags={[{ text: t("screens.H3.b1.tag.0", { n: photos }), icon: "camera-outline", ...(photos === 2 ? { tone: "g" as const } : {}) }, { text: t("screens.H3.b1.tag.1", { time: shortDuration(v.secondsToReset ?? 0) }), icon: "alarm", tone: "red" }]}
          {...(me.pendingToday ? { button: { label: t("screens.H3.b1.btn"), kind: "p" as const, icon: "camera" as const, onPress: () => go(photos === 1 ? "F4" : "F1", { id: v.facts.id }) } } : {})} />
      ) : null}
      <ScreenKeeper id="H3" lines={[k]} />
      {b.recentlyOut.length ? <RowList label={t("screens.H3.b3.label")} rows={b.recentlyOut.map((o) => ({
        title: o.name, sub: t("screens.H3.b3.r0.s", { day: o.day }), valueColor: color.red.base,
        // "2h ago", "yesterday", "3d ago" (reference/kept-screens-4.js › H3).
        value: now - o.at >= DAY && now - o.at < 2 * DAY ? t("screens.H3.b3.r2.r") : t("screens.H3.b3.r0.r", { time: ago(now - o.at) }),
        leading: { kind: "initial" as const, initial: o.name.slice(0, 1), bg: color.text.ghost },
      }))} /> : null}
      <MoneyMoment value={t("screens.H3.b4.value", { amount: skrWhole(share) })} caption={t("screens.H3.b4.caption", { n: b.remaining })} fs={44} />
    </Screen>
  );
}

// ── H4 Eliminated ──
export function H4() {
  const { go } = useGo();
  const { b, v } = useJoined();
  const stats = useStats();
  if (!b || !v) return null;
  const k = keeperLines("H4")[0]!;
  const day = (v.members[v.me]!.missed[0] ?? 0) + 1;
  const s = stats.data;
  return (
    <Screen bar={<NavBar onBack={() => go("H1")} close title={b.name} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" label={t("screens.H4.pin.0")} onPress={() => go("H1")} />}>
      <ScreenKeeper id="H4" lines={[k]} />
      <Title heading={t("screens.H4.b2.title", { day })} align="center" />
      <RowList rows={[
        { title: t("screens.H4.b3.r0.t"), sub: t("screens.H4.b3.r0.s"), value: s?.keptRate == null ? t("common.keptRateNew") : `${Math.round(s.keptRate * 100)}%`, valueSub: t("screens.H4.b3.r0.rs", { n: s?.rateDays ?? 0 }), leading: { kind: "icon", icon: "shield-check-outline", fg: color.text.primary } },
        { title: t("screens.H4.b3.r1.t"), sub: t("screens.H4.b3.r1.s"), value: String(s?.bestStreak ?? 0), valueSub: t("screens.H4.b3.r1.rs"), leading: { kind: "icon", icon: "fire", fg: color.orange.base } },
        { title: t("screens.H4.b3.r2.t"), sub: t("screens.H4.b3.r2.s"), leading: { kind: "icon", icon: "plus" }, chevron: true, onPress: () => go("C1") },
      ]} />
    </Screen>
  );
}

/** A week of bars (D1–D7, or the week that holds today), finished days and today filled. */
function weekBars(values: number[]) {
  const start = Math.floor((values.length - 1) / 7) * 7;
  return Array.from({ length: 7 }, (_, i) => ({ label: t("additions.core.dayShort", { n: start + i + 1 }), value: values[start + i] ?? 0 }));
}

// ── H5 Bounty ended ──
export function H5() {
  const { go } = useGo();
  const toast = useToast();
  const follow = useSettings((s) => s.follow);
  const { b, v } = useJoined();
  const playFx = useUi((s) => s.playFx);
  const avatar = useSession((s) => s.avatar);
  const payout = v ? v.results[v.me]?.final ?? 0n : 0n;
  useEffect(() => { if (payout > 0n) playFx(undefined, "payout"); }, [payout, playFx]);
  if (!b || !v) return null;
  // Who else survived isn't known yet (BACKEND_GAPS P1-20): me, then the rest as a count.
  const seats: Seat[] = [{ kind: "member", name: t("screens.D2.b6.r0.t"), initial: "Y", color: color.member.you, ...(avatar ? { avatar } : {}), status: `+${skrWhole(payout)}` }];
  if (b.remaining > 1) seats.push({ kind: "overflow", count: b.remaining - 1 });
  return (
    <Screen bar={<NavBar onBack={() => go("H1")} close title={b.name} />} bottomInset={v.claimable > 0n ? pinned(1) : 0}
      pinned={<>
        {v.claimable > 0n ? <Button kind="l" icon="hand-coin-outline" label={t("screens.H5.pin.0", { amount: skrWhole(v.claimable) })} onPress={() => go("J1", { id: v.facts.id })} /> : null}
      </>}>
      <Title heading={t("screens.H5.b0.title", { n: b.remaining })} align="center" />
      <MoneyMoment value={t("screens.H5.b1.value", { amount: skrWhole(payout) })} caption={t("screens.H5.b1.caption", { pool: skrWhole(b.pool) })} tone="lime" />
      <SeatSlots seats={seats} />
      <ButtonRow>
        <Button kind="s" size="row" icon="share-variant" label={t("screens.H5.b3.btn.0")} onPress={() => { void Share.share({ message: t("screens.H5.brand.stamp", { name: b.name.toUpperCase() }) }).then(() => toast(t("toasts.9"))); }} />
        <Button kind="s" size="row" icon="account-plus" label={t("screens.H5.b3.btn.1", { name: b.brand.name })} onPress={() => { follow(b.brand.name); toast(t("toasts.10", { name: b.brand.name })); }} />
      </ButtonRow>
      <BrandStamp text={t("screens.H5.brand.stamp", { name: b.name.toUpperCase() })} />
    </Screen>
  );
}

const FINISHER_TILES = [color.violet.base, color.member.arjun];

// ── H6 My created Bounty ──
export function H6() {
  const { back } = useGo();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const { data: b } = useBounty(id);
  const now = useNow(60_000);
  if (!b) return <Screen bar={<NavBar onBack={back} title="" />}><Skeleton height={200} /></Screen>;
  const day = Math.max(1, Math.min(b.numDays, Math.floor((now - b.startsAt) / 86_400) + 1));
  const started = now >= b.startsAt;
  const rate = b.entrants ? b.remaining / b.entrants : 0;
  const perFinisher = b.remaining ? b.pool / BigInt(b.remaining) : 0n;
  return (
    <Screen bar={<NavBar onBack={back} title={b.name} {...(started ? { right: t("screens.D2.nav.right", { day, length: b.numDays }) } : {})} />} bottomInset={pinned(1)}
      pinned={<Button kind="p" icon="export-variant" label={t("screens.H6.pin.0")} disabled={!b.finishersOptIn.length} onPress={() => toast(t("toasts.11"))} />}>
      <Title heading={t("screens.H6.b0.title", { n: b.remaining, total: b.entrants })} />
      {b.stillInByDay.length ? <BarChart label={t("screens.H6.b1.label")} bars={weekBars([...b.stillInByDay, b.remaining])} /> : <Note text={t("additions.bounty.noStatsYet")} />}
      <Breakdown rows={[
        { label: t("screens.H6.b2.row0.l"), value: t("screens.H6.b2.row0.v", { amount: skrWhole(b.pool) }) },
        { label: t("screens.H6.b2.row1.l"), value: t("screens.H6.b2.row1.v", { pct: Math.round(rate * 100) }) },
        { label: t("screens.H6.b2.row2.l"), value: t("screens.H6.b2.row2.v", { amount: skrWhole(perFinisher) }) },
        { label: t("screens.H6.b2.row3.l"), value: String(b.finishersOptIn.length) },
      ]} />
      {b.finishersOptIn.length ? <RowList label={t("screens.H6.b3.label")} rows={b.finishersOptIn.map((h, i) => ({
        // reference/kept-screens-4.js › H6: initial tiles, violet then yellow.
        title: h, sub: t("screens.H6.b3.r0.s", { n: day, total: day }), value: t("screens.H6.b3.r0.r"),
        leading: { kind: "initial" as const, initial: h.replace(/^@/, "").charAt(0).toUpperCase(), bg: FINISHER_TILES[i % FINISHER_TILES.length]! },
      }))} /> : null}
    </Screen>
  );
}

// ── H7 Browse Bounties ──
export function H7() {
  const { back, go } = useGo();
  const p = useParams<{ category: string; sort: string }>();
  const { data } = useBounties();
  const el = useEligibility(undefined);
  const now = useNow(60_000);
  const [cat, setCat] = useState(Number(p.category ?? 0));
  const [sort, setSort] = useState(Number(p.sort ?? 0));
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const rows = useMemo(() => {
    const list = (data ?? []).filter((b) => isOpen(b, now) && !b.createdBy)
      .filter((b) => cat === 0 || b.category === CATEGORIES[cat - 1])
      .filter((b) => !eligibleOnly || (el.genesis && (!b.minKeptRate || (el.rate !== null && el.rate >= b.minKeptRate))));
    return list.sort(sort === 0 ? (a, b) => a.joinClosesAt - b.joinClosesAt : sort === 1 ? (a, b) => Number(b.pool - a.pool) : (a, b) => b.entrants - a.entrants);
  }, [data, now, cat, sort, eligibleOnly, el.genesis, el.rate]);
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.H7.nav.title")} />}>
      <SearchBar placeholder={t("screens.H7.b0.placeholder")} />
      <HScroller chips={[0, 1, 2, 3, 4, 5, 6].map((i) => t(`screens.H7.b1.i${i}.t` as CopyKey))} chipValue={cat} onChip={setCat} />
      <Segmented items={[0, 1, 2].map((i) => t(`screens.H7.b2.seg.${i}` as CopyKey))} value={sort} onChange={setSort} />
      <RowList rows={[{ title: t("screens.H7.b3.r0.t"), sub: categoryLabel(cat ? CATEGORIES[cat - 1]! : null), toggle: { on: eligibleOnly, onChange: setEligibleOnly } }]} />
      <BodyText mono text={t("screens.H7.b4.text", { n: rows.length })} />
      {/* Virtualised: every open Bounty (Live can list many). */}
      <ScreenList items={[
        ...rowListItems("bounties", rows.map((b) => ({
          title: b.name, sub: t("screens.H7.b5.r0.s", { brand: b.brand.name, n: b.entrants, time: shortDuration(b.joinClosesAt - now) }),
          value: skrWhole(b.pool), valueSub: t("screens.H7.b5.r0.rs"), leading: { kind: "icon" as const, icon: objectIcon(b.objectId) },
          chevron: true, onPress: () => go("H2", { id: b.id }),
        }))),
        { key: "note", gapBefore: rows.length ? metrics.screen.gap : 0, render: () => <Note text={t("screens.H7.b6.text")} /> },
      ]} />
    </Screen>
  );
}

// ── L5 Bounty survived / out ── a hub for Bounty results.
export function L5() {
  const { back, go } = useGo();
  const mine = useMyBounties();
  const { data } = useBounties();
  const byId = new Map((data ?? []).map((b) => [b.id, b]));
  const done = mine.filter((v) => v.life === "settled" || v.members[v.me]!.missed.length);
  const row = (v: OathView) => {
    const b = byId.get(v.facts.bountyId!);
    const out = v.members[v.me]!.missed.length > 0;
    return {
      title: t(out ? "screens.L5.b1.r1.t" : "screens.L5.b1.r0.t"),
      sub: out ? t("screens.L5.b1.r1.s", { name: b?.name ?? "", day: v.members[v.me]!.missed[0]! + 1 }) : t("screens.L5.b1.r0.s", { name: b?.name ?? "", amount: skrWhole(v.results[v.me]?.final ?? 0n) }),
      // reference › L5: dark tiles, a lime trophy or a red close-circle.
      leading: out
        ? { kind: "icon" as const, icon: "close-circle-outline" as const, bg: color.surface[2], fg: color.red.base }
        : { kind: "icon" as const, icon: "trophy-outline" as const, bg: color.surface[2], fg: color.lime.base },
      chevron: true, onPress: () => go(out ? "H4" : "H5", { id: v.facts.bountyId! }),
    };
  };
  return (
    <Screen bar={<NavBar onBack={back} close />}>
      <Title heading={t("screens.L5.b0.title")} fs={26} />
      {done.length ? <RowList rows={done.map(row)} /> : <Note text={t("additions.bounty.noneJoined")} />}
    </Screen>
  );
}
