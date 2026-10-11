// B · Today (screens.md B1–B5). One tab screen whose state follows the user's Oaths:
// B3 nothing yet · B4 a deadline is close · B2 everything kept · B1 otherwise. B5 is the once-a-day recap.
import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { keeperLines, t } from "@/copy";
import { clock } from "@/lib/clock";
import { Button, ButtonRow } from "@/components/actions";
import { BottomSheet } from "@/components/chrome";
import { Banner, BodyText, Skeleton, Title, Chip, ChipRow } from "@/components/content/Basics";
import { OathCard } from "@/components/content/Oath";
import { CardDeck } from "@/components/content/Deck";
import { RowList } from "@/components/content/Rows";
import type { RowProps } from "@/components/content/Rows";
import type { BountyFacts as Bounty } from "@/features/bounties/model";
import { BountyCover } from "@/components/content/Social";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { clock as hms, shortDuration } from "@/lib/format";
import { color } from "@/theme";
import { useGo, useSheetRoute } from "@/app/nav";
import { useOathList } from "@/features/oaths/hooks";
import type { OathView } from "@/features/oaths/model";
import { useDeviceOaths } from "@/features/oaths/device";
import { listNames, memberColor, memberInitial, memberName, objectIcon, skrWhole, weekday } from "@/features/oaths/present";
import { TabScreen } from "../tabs/TabScreen";
import { useResultMoments } from "../results/Results";
import { useBounties, useStats } from "@/features/queries";
import { coverColors } from "../bounties/Bounties";

const myToday = (v: OathView) => (v.me >= 0 ? v.members[v.me]! : null);
const keptToday = (v: OathView) => myToday(v)?.pendingToday === false;

/** The Oaths that have a proof due today, mine first by deadline. */
function todayItems(views: OathView[]) {
  return views.filter((v) => v.life === "active" && v.dayIndex !== null && v.me >= 0).sort((a, b) => (a.secondsToReset ?? 0) - (b.secondsToReset ?? 0));
}

export function TodayTab() {
  const { views, isLoading } = useOathList();
  const { go } = useGo();
  const recapShownOn = useDeviceOaths((s) => s.recapShownOn);
  const items = todayItems(views);
  const claim = views.find((v) => v.claimable > 0n);
  const recap = recapOf(views);
  const today = new Date(clock.now()).toDateString(); // Demo's clock can skip a day (D-88)
  useResultMoments(views);

  // D-8: the recap shows once, the first time the app opens after a day settles.
  useEffect(() => {
    if (recap.length && recapShownOn !== today) {
      useDeviceOaths.getState().markRecap(today);
      go("B5");
    }
  }, [recap.length, recapShownOn, today, go]);

  if (isLoading) {
    return <TabScreen tab="today"><Skeleton height={20} width="60%" /><Skeleton height={230} /><Skeleton height={60} /></TabScreen>;
  }
  const hasAny = views.some((v) => v.life !== "cancelled" && v.life !== "settled") || !!claim;
  if (!hasAny || (!items.length && !claim)) return <Empty />;
  const pending = items.filter((v) => !keptToday(v));
  const urgent = pending.find((v) => v.deadlineClose);
  if (urgent) return <Deadline v={urgent} left={pending.length} />;
  if (items.length && !pending.length && !claim) return <AllDone items={items} />;
  return <Active items={items} pending={pending} claim={claim} />;
}

// ── B1 ──
function Active({ items, pending, claim }: { items: OathView[]; pending: OathView[]; claim: OathView | undefined }) {
  const { go } = useGo();
  const k = keeperLines("B1");
  const brands = useBrands();
  // Everything still due today is one swipeable stack (D-85): an Oath on top (a group one first), then by
  // deadline, Bounties as their small cards; what's already kept today follows as rows.
  const main = pending.find((v) => !v.facts.isSolo && !v.facts.bountyId) ?? pending.find((v) => !v.facts.bountyId) ?? pending[0];
  const deck = main ? [main, ...pending.filter((v) => v !== main)] : [];
  const rest = items.filter((v) => !pending.includes(v));
  const reset = Math.min(...items.map((v) => v.secondsToReset ?? Infinity));
  return (
    <TabScreen tab="today">
      {items.length ? <BodyText text={t("screens.B1.b0.text", { left: pending.length, total: items.length, time: `<m>${hms(reset)}</m>` })} /> : null}
      {claim ? (
        <Banner tone="lime" icon="sack" title={t("screens.B1.b1.title", { amount: skrWhole(claim.claimable) })}
          sub={t("screens.B1.b1.sub", { name: claim.facts.name, when: weekday(endOf(claim)) })} onPress={() => go("J1", { id: claim.facts.id })} />
      ) : null}
      {main ? <ScreenKeeper id="B1" lines={[k[1]!]} /> : null}
      {deck.length ? <CardDeck cards={deck.map((v) => ({ key: v.facts.id, node: v.facts.bountyId ? <BountyCard v={v} bounty={brands.get(v.facts.bountyId)} /> : <TodayCard v={v} /> }))} /> : null}
      {rest.length ? <RowList rows={rest.map(rowOf(go, brands))} /> : null}
    </TabScreen>
  );
}

/** A pending Bounty on Today: small card tilted −1°, "31 of 40 in" · "Not started" · Prove. */
function BountyCard({ v, bounty }: { v: OathView; bounty: Bounty | undefined }) {
  const { go } = useGo();
  const photo1 = myToday(v)?.facts.proofToday === "photo1";
  return (
    <OathCard
      variant="sm" tilt={-1} icon={objectIcon(v.facts.objectId)} name={v.facts.name}
      meta={t("screens.B1.b4.meta", { brand: bounty?.brand.name ?? "", day: v.dayNumber, length: v.facts.numDays })}
      onPress={() => go("H3", { id: v.facts.bountyId! })}
      tags={[
        ...(bounty ? [{ text: t("screens.B1.b4.tag.0", { remaining: bounty.remaining, joined: bounty.entrants }), icon: "account-group" as const, tone: "grey" as const }] : []),
        photo1 ? { text: t("screens.B1.b3.tag.2"), icon: "camera" as const, tone: "vio" as const } : { text: t("screens.B1.b4.tag.1"), icon: "circle-outline" as const, tone: "grey" as const },
      ]}
      button={{ label: t("screens.B1.b4.btn"), kind: "s", icon: "camera", onPress: () => go(photo1 ? "F4" : "F1", { id: v.facts.id }) }}
    />
  );
}

function TodayCard({ v, urgent }: { v: OathView; urgent?: boolean }) {
  const { go } = useGo();
  const mine = myToday(v)!;
  const photo1 = mine.facts.proofToday === "photo1";
  const others = v.members.filter((m) => !m.isMe);
  const keptOther = others.find((m) => !m.pendingToday);
  const goal = v.facts.goal ?? v.facts.name;
  const meta = v.facts.isSolo
    ? t("screens.D0.b3.meta", { day: v.dayNumber, length: v.facts.numDays })
    : t("screens.B1.b3.meta", { names: listNames(others.map(memberName)), day: v.dayNumber, length: v.facts.numDays });
  return (
    <OathCard
      icon={objectIcon(v.facts.objectId)} name={v.facts.name} meta={meta} hp={v.hp}
      line={t(photo1 ? "screens.B1.b3.line" : "screens.B4.b1.line", { goal: capitalise(goal) })}
      onPress={() => go("D2", { id: v.facts.id })}
      tags={[
        { text: t("screens.B1.b3.tag.0", { amount: skrWhole(mine.inPlay) }), icon: "sack", tone: "lime" },
        // reference/kept-screens-1.js › B1 / B4: the clock is always red, photo 1 violet.
        { text: t("screens.B1.b3.tag.1", { time: shortDuration(v.secondsToReset ?? 0) }), icon: "alarm", tone: "red" },
        ...(photo1 ? [{ text: t("screens.B1.b3.tag.2"), icon: "camera" as const, tone: "vio" as const }] : []),
      ]}
      {...(urgent ? { warn: t("screens.B4.b1.warn", { cost: skrWhole(v.myMissCost), hp: v.facts.isSolo ? 35 : 20 }) } : {})}
      {...(keptOther && !urgent ? { float: { text: t("screens.B1.b3.float", { name: memberName(keptOther), time: "" }).trim(), initial: memberInitial(keptOther), bg: memberColor(keptOther) } } : {})}
      button={photo1
        ? { label: t("screens.B1.b3.btn"), kind: "p", icon: "camera", onPress: () => go("F4", { id: v.facts.id }) }
        : { label: t(urgent ? "screens.B4.b1.btn" : "screens.B1.b4.btn"), kind: urgent ? "l" : "p", icon: "camera", onPress: () => go("F1", { id: v.facts.id }) }}
    />
  );
}

const rowOf = (go: ReturnType<typeof useGo>["go"], brands: Map<string, Bounty>) => (v: OathView): RowProps => ({
  title: v.facts.name,
  sub: v.facts.bountyId ? t("screens.B1.b4.meta", { brand: brands.get(v.facts.bountyId)?.brand.name ?? "", day: v.dayNumber, length: v.facts.numDays })
    : v.facts.isSolo ? t("screens.B1.b5.r0.s", { day: v.dayNumber, length: v.facts.numDays, hp: v.hp }) : t("screens.B2.b3.r0.s", { day: v.dayNumber, length: v.facts.numDays, hp: v.hp }),
  leading: { kind: "icon", icon: objectIcon(v.facts.objectId) },
  value: keptToday(v) ? t("screens.B2.b3.r0.rs") : shortDuration(v.secondsToReset ?? 0),
  valueColor: keptToday(v) ? color.lime.base : color.text.secondary,
  chevron: true,
  onPress: () => (v.facts.bountyId ? go("H3", { id: v.facts.bountyId }) : go("D2", { id: v.facts.id })),
});

// ── B2 ──
function AllDone({ items }: { items: OathView[] }) {
  const { go } = useGo();
  const brands = useBrands();
  const k = keeperLines("B2")[0]!;
  const reset = Math.min(...items.map((v) => v.secondsToReset ?? Infinity));
  // Free Bounties have nothing at stake: leave their 0 out of "1,043 + 500".
  const safe = items.map((v) => myToday(v)!.inPlay).filter((b) => b > 0n).map(skrWhole).join(" + ");
  const stats = useStats();
  return (
    <TabScreen tab="today" layout="B2">
      <BodyText text={t("screens.B2.b0.text", { kept: items.length, total: items.length, time: `<m>${hms(reset)}</m>` })} />
      <ScreenKeeper id="B2" lines={[k]} />
      <Title heading={t("screens.B2.b2.title")} sub={t("screens.B2.b2.sub", { amounts: safe })} />
      <RowList rows={items.map(rowOf(go, brands))} />
      {/* B2 chips: the streak and kept rate from the profile stats (the backend has no streaks yet, P1-16). */}
      {stats.data ? (
        <ChipRow>
          {stats.data.streak > 0 ? <Chip text={t("screens.B2.b4.chip.0", { n: stats.data.streak })} icon="fire" tone="ora" tilt={-2} /> : null}
          {stats.data.keptRate !== null ? <Chip text={t("screens.B2.b4.chip.1", { rate: Math.round(stats.data.keptRate * 100) })} icon="shield-check-outline" tilt={2} /> : null}
        </ChipRow>
      ) : null}
    </TabScreen>
  );
}

// ── B3 ──
function Empty() {
  const { go } = useGo();
  const bounties = useBounties().data ?? [];
  const featured = bounties.find((b) => b.featured && !b.createdBy) ?? bounties.find((b) => !b.createdBy);
  const k = keeperLines("B3")[0]!;
  return (
    <TabScreen tab="today" layout="B3">
      <ScreenKeeper id="B3" lines={[k]} chips={[{ text: t("screens.B3.b1.chip.0"), icon: "camera-outline", x: 200, y: 120, tilt: 3, tone: "white" }]} />
      <Title heading={t("screens.B3.b2.title")} sub={t("screens.B3.b2.sub")} />
      <ButtonRow><Button kind="p" icon="plus" label={t("screens.B3.b3.btn.0")} onPress={() => go("C1")} /></ButtonRow>
      <BodyText mono text={t("screens.B3.b4.text")} />
      {/* A featured Bounty to join, when there is one (none in Live yet: BACKEND_GAPS P1-10). */}
      {featured ? <BountyCover brand={featured.brand.name} logo={featured.brand.logo} verified={featured.brand.verified} colors={coverColors(featured)} icon={objectIcon(featured.objectId)} message={featured.message} onPress={() => go("H2", { id: featured.id })} /> : null}
    </TabScreen>
  );
}

// ── B4 ──
function Deadline({ v, left }: { v: OathView; left: number }) {
  const k = keeperLines("B4")[0]!;
  return (
    <TabScreen tab="today" layout="B4">
      <BodyText text={t("screens.B4.b0.text", { left, time: `<m class="r">${hms(v.secondsToReset ?? 0)}</m>` })} />
      <TodayCard v={v} urgent />
      <ScreenKeeper id="B4" lines={[k]} />
    </TabScreen>
  );
}

// ── B5 Daily recap ──
interface RecapRow { v: OathView; missed: string[]; won: bigint }
function recapOf(views: OathView[]): RecapRow[] {
  return views.filter((v) => v.lastDay && v.me >= 0 && (v.life === "active" || v.life === "broken") && v.dayIndex === (v.lastDay.day + 1)).map((v) => ({
    v,
    missed: v.members.filter((m) => !m.isMe && (v.lastDay!.lost[m.index] ?? 0n) > 0n).map(memberName),
    // A projection is not a win: only demo Oaths show what the day paid (D-91; the chain pays at settlement).
    won: v.estimated ? 0n : (v.lastDay!.won[v.me] ?? 0n),
  }));
}

export function RecapSheet() {
  const { views } = useOathList();
  const { back, replace } = useGo();
  const insets = useSafeAreaInsets();
  const sheet = useSheetRoute();
  const rows = recapOf(views);
  const k = keeperLines("B5")[0]!;
  const lead = rows.find((r) => r.missed.length);
  return (
    <View style={{ flex: 1 }}>
      <BottomSheet {...sheet} bottomInset={insets.bottom}>
        <BodyText mono text={t("screens.B5.b0.text")} />
        {lead ? <Title heading={t("screens.B5.b1.title", { name: listNames(lead.missed) })} pt={0} fs={28} /> : null}
        <ScreenKeeper id="B5" lines={[k]} />
        <RowList rows={rows.map(({ v, missed, won }) => {
          const d = v.lastDay!;
          return {
            title: v.facts.name,
            sub: missed.length
              ? t("screens.B5.b3.r0.s", { name: listNames(missed), before: d.hpBefore, damaged: d.hpBefore - d.damage, after: d.hpAfter })
              : t("screens.B5.b3.r1.s", { name: t("screens.D2.b6.r0.t"), hp: d.hpAfter }),
            value: won > 0n ? t("screens.B5.b3.r0.r", { amount: skrWhole(won) }) : t("screens.B5.b3.r1.r"),
            valueColor: won > 0n ? color.lime.base : color.text.secondary,
            leading: { kind: "icon" as const, icon: objectIcon(v.facts.objectId) },
            onPress: () => replace("D2", { id: v.facts.id }),
          };
        })} />
        <ButtonRow>
          {lead ? <Button kind="s" size="row" label={t("screens.B5.b4.btn.0", { name: lead.v.facts.name })} onPress={() => replace("D2", { id: lead.v.facts.id })} /> : null}
          <Button kind="p" size="row" label={t("screens.B5.b4.btn.1")} onPress={back} />
        </ButtonRow>
      </BottomSheet>
    </View>
  );
}

/** Bounty id → host name, for "Bounty by Drift · Day 3/7" rows. */
function useBrands(): Map<string, Bounty> {
  const { data } = useBounties();
  return new Map((data ?? []).map((b) => [b.id, b]));
}

const endOf = (v: OathView) => (v.facts.day1StartsAt ?? v.facts.createdAt) + v.facts.numDays * v.facts.daySeconds;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
