// I · Profiles and settings (screens.md I1–I9). Profiles, stats, activity and creator pages are on
// the mock in Demo; Live has reputation stats only (BACKEND_GAPS P1-8, P1-9, P1-16) and the real faucet.
import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { keeperLines, t } from "@/copy";
import type { CopyKey } from "@/copy";
import { Button } from "@/components/actions";
import { NavBar, useToast } from "@/components/chrome";
import { Banner, BodyText, Breakdown, Chip, ChipRow, Note, Segmented, Skeleton } from "@/components/content/Basics";
import { SentenceInput } from "@/components/content/Inputs";
import { RowList, rowListItems } from "@/components/content/Rows";
import type { RowProps } from "@/components/content/Rows";
import { AvatarBuilder, BountyCover, ProfileCard } from "@/components/content/Social";
import { KeptRateRing } from "@/components/content/Status";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen, ScreenList } from "@/components/layout/Screen";
import type { IconName } from "@/components/primitives";
import { coverColors } from "../bounties/Bounties";
import { color, metrics, tokens } from "@/theme";
import { isApiError } from "@/api";
import type { Profile } from "@kept/shared";
import { getWallet } from "@/chain";
import { env } from "@/config/env";
import { resetStack, useGo, useParams } from "@/app/nav";
import { exitDemo, restartDemo, setAppMode, skipToTomorrow } from "@/features/mode";
import { useIsDemo } from "@/state/mode";
import { useOathList } from "@/features/oaths/hooks";
import type { OathView } from "@/features/oaths/model";
import { shortWallet } from "@/features/oaths/names";
import { objectIcon, skrWhole } from "@/features/oaths/present";
import { profileActions, useActivity, useBounties, useCreator, useMyProfile, usePerson, useStats, walletActions } from "@/features/queries";
import { useSession } from "@/state/session";
import { useSettings } from "@/state/settings";
import type { Audience } from "@/state/settings";
import { TabScreen } from "../tabs/TabScreen";
import type { ActivityType } from "@/api/types";
import { useFeature } from "@/features/availability";

const pinnedOne = metrics.button.height + metrics.pinned.bottom;
/** X shows its letter glyph (Design.pdf I2 / I1), not the old bird. */
const SOCIAL_ICON: Record<string, IconName> = { x: "alpha-x", telegram: "send", discord: "forum-outline", farcaster: "alpha-f-box" };
const banner = (p: Profile) => Math.min(4, Math.max(0, p.banner)) as 0 | 1 | 2 | 3 | 4;
/** reference/kept-kit.js › ACT: the I5 row icon per activity. */
const ACTIVITY_ICON: Record<ActivityType, IconName> = {
  kept: "check-bold", photo: "camera", payout: "sack", vote: "vote-outline", stake: "arrow-top-right", join: "trophy-outline", claim: "hand-coin-outline", broke: "fire",
};
const rateLine = (rate: number | null, days: number) => ({ percent: rate === null ? null : Math.round(rate * 100), line: t("screens.I1.b2.line", { n: days }), isNew: rate === null });
const AUDIENCE = (a: Audience) => t(`screens.I7.b2.seg.${a}` as CopyKey);

function card(p: Profile, extra: { actions?: { label: string; icon: IconName; onPress: () => void }[] } = {}) {
  return (
    <ProfileCard name={p.name || shortWallet(p.wallet)} handle={p.handle} avatar={p.avatar} bannerIndex={banner(p)} verified={p.verifiedSeeker}
      {...(p.bio ? { bio: p.bio } : {})} socials={p.socials.map((s) => ({ icon: SOCIAL_ICON[s.kind] ?? "link-variant", text: s.handle }))} {...(extra.actions ? { actions: extra.actions } : {})} />
  );
}

// ── I1 My profile (tab) ──
export function ProfileTab() {
  const { go } = useGo();
  const toast = useToast();
  const profile = useMyProfile();
  const stats = useStats();
  const vis = useSettings((s) => s.visibility.oaths);
  const tipSeen = useSettings((s) => s.profileTipSeen);
  const setSettings = useSettings((s) => s.set);
  const k = keeperLines("I1");
  const p = profile.data;
  const s = stats.data;
  if (!p) return <TabScreen tab="profile"><Skeleton height={260} /><Skeleton height={150} /></TabScreen>;
  return (
    <TabScreen tab="profile">
      {!tipSeen ? <Banner tone="vio" icon="account-edit-outline" title={t("screens.I1.b0.title")} sub={t("screens.I1.b0.sub")} onPress={() => { setSettings({ profileTipSeen: true }); go("I8"); }} /> : null}
      {card(p, { actions: [
        { label: t("screens.I1.b1.act.0"), icon: "pencil-outline", onPress: () => { setSettings({ profileTipSeen: true }); go("I8"); } },
        { label: t("screens.I1.b1.act.1"), icon: "share-variant-outline", onPress: () => { void Clipboard.setStringAsync(p.wallet).then(() => toast(t("toasts.12"))); } },
      ] })}
      <KeptRateRing {...rateLine(s?.keptRate ?? null, s?.rateDays ?? 0)} />
      <ScreenKeeper id="I1" lines={k} />
      <RowList rows={[
        { title: t("screens.I1.b4.r0.t"), sub: t("screens.I1.b4.r0.s", { n: s?.bestStreak ?? 0 }), value: String(s?.streak ?? 0), valueSub: t("screens.I1.b4.r0.rs"), leading: { kind: "icon", icon: "fire" } },
        { title: t("screens.I1.b4.r1.t"), sub: t("screens.I1.b4.r1.s", { kept: s?.oaths.kept ?? 0, broken: s?.oaths.broken ?? 0 }), value: String((s?.oaths.kept ?? 0) + (s?.oaths.broken ?? 0)), leading: { kind: "icon", icon: "cards-outline" }, chevron: true, onPress: () => go("D5") },
        { title: t("screens.I1.b4.r2.t"), sub: t("screens.I1.b4.r2.s", { survived: s?.bounties.survived ?? 0, out: s?.bounties.out ?? 0 }), value: String((s?.bounties.survived ?? 0) + (s?.bounties.out ?? 0)), leading: { kind: "icon", icon: "trophy-outline" }, chevron: true, onPress: () => go("H1·j") },
      ]} />
      <RowList rows={[{ title: t("screens.I1.b5.r0.t"), sub: t("screens.I1.b5.r0.s", { who: AUDIENCE(vis) }), leading: { kind: "icon", icon: "eye-outline" }, chevron: true, onPress: () => go("I2·me") }]} />
    </TabScreen>
  );
}

/** Oaths I share with `wallet`. */
function useShared(wallet: string | undefined): OathView[] {
  const { views } = useOathList();
  return views.filter((v) => !v.facts.bountyId && v.members.some((m) => m.facts.wallet === wallet));
}
const sharedRow = (go: ReturnType<typeof useGo>["go"]) => (v: OathView): RowProps => ({
  title: v.facts.name, sub: t("screens.I2.b2.r1.s", { day: v.dayNumber, length: v.facts.numDays }), value: t("screens.I2.b2.r1.r"),
  leading: { kind: "icon", icon: objectIcon(v.facts.objectId) }, chevron: true, onPress: () => go("D2", { id: v.facts.id }),
});

// ── I2 / I2·p Someone's profile ──
export function I2() {
  const { back, go } = useGo();
  const { wallet } = useParams<{ wallet: string }>();
  const person = usePerson(wallet);
  const shared = useShared(wallet);
  const p = person.data;
  if (!p) return <Screen bar={<NavBar onBack={back} title="" />}><Skeleton height={260} /></Screen>;
  const first = (p.name.split(/[.\s]/)[0] ?? p.name).replace(/^./, (c) => c.toUpperCase());
  const ring = <KeptRateRing {...rateLine(p.keptRate.rate, p.keptRate.days)} />;
  const pin = <Button kind="p" icon="account-plus-outline" label={t("screens.I2.pin.0")} onPress={() => go("C1")} />;
  if (p.visibility === "private") {
    return (
      <Screen bar={<NavBar onBack={back} title={first} />} bottomInset={pinnedOne} pinned={pin}>
        {card(p)}
        {ring}
        <Banner tone="grey" icon="lock-outline" title={t("additions.profile.privateOaths", { name: first })} sub={t("screens.I2·p.b2.sub")} />
        {shared.length ? <RowList label={t("screens.I2·p.b3.label")} rows={shared.map(sharedRow(go))} /> : null}
      </Screen>
    );
  }
  return (
    <Screen bar={<NavBar onBack={back} title={first} />} bottomInset={pinnedOne} pinned={pin}>
      {card(p)}
      {ring}
      {shared.length ? <RowList label={t("screens.I2.b2.label")} rows={shared.map(sharedRow(go))} /> : null}
      {shared.length ? <ChipRow><Chip text={t("screens.I2.b4.chip.0", { n: shared.length })} icon="handshake-outline" tilt={-2} /></ChipRow> : null}
    </Screen>
  );
}
export const I2p = I2;

// ── I2·me How others see you ──
export function I2me() {
  const { back, go } = useGo();
  const profile = useMyProfile();
  const stats = useStats();
  const vis = useSettings((s) => s.visibility);
  const p = profile.data;
  if (!p) return <Screen bar={<NavBar onBack={back} title={t("screens.I2·me.nav.title")} />}><Skeleton height={260} /></Screen>;
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.I2·me.nav.title")} />}>
      <Banner tone="vio" icon="eye-outline" title={t("screens.I2·me.b0.title")} sub={t("screens.I2·me.b0.sub")} onPress={() => go("I7")} />
      {card(vis.socials === 2 ? { ...p, socials: [] } : p)}
      <KeptRateRing {...rateLine(stats.data?.keptRate ?? null, stats.data?.rateDays ?? 0)} />
      <Banner tone="grey" icon="cards-outline" title={t("screens.I2·me.b3.title", { who: AUDIENCE(vis.oaths) })} sub={t("screens.I2·me.b3.sub")} />
    </Screen>
  );
}

/** Link rows by kind (reference/kept-screens-4.js › I3). */
const LINK_ICON: Record<string, IconName> = { [t("screens.I3.b3.r0.s")]: "web", [t("screens.I3.b3.r1.s")]: "at" };

// ── I3 Creator profile ──
export function I3() {
  const { back, go } = useGo();
  const toast = useToast();
  const { name } = useParams<{ name: string }>();
  const creator = useCreator(name);
  const { data: bounties } = useBounties();
  const following = useSettings((s) => s.following);
  const follow = useSettings((s) => s.follow);
  const c = creator.data;
  if (!c) return <Screen bar={<NavBar onBack={back} title={name ?? ""} />}><Skeleton height={170} /></Screen>;
  const hosted = (bounties ?? []).filter((b) => b.brand.name === c.name);
  // The creator's cover, as on their Bounties (H2); the brand banner when they host none yet.
  const colors = hosted[0] ? coverColors(hosted[0]) : tokens.color.banner[2];
  return (
    <Screen bar={<NavBar onBack={back} title={c.name} />} bottomInset={pinnedOne}
      pinned={<Button kind={following.includes(c.name) ? "s" : "p"} icon="account-plus-outline" label={t("screens.I3.pin.0", { name: c.name })} onPress={() => { follow(c.name); toast(t("toasts.16", { name: c.name })); }} />}>
      <BountyCover brand={c.name} logo={c.logo} verified={c.verified} colors={[colors[0]!, colors[1]!]} icon="bottle-soda-outline" message={c.tagline} />
      {c.bio ? <BodyText text={c.bio} /> : null}
      <Breakdown rows={[
        { label: t("screens.I3.b2.row0.l"), value: String(c.hosted) },
        { label: t("screens.I3.b2.row1.l"), value: t("screens.I3.b2.row1.v", { amount: skrWhole(c.paidOut) }), color: color.lime.base },
        { label: t("screens.I3.b2.row2.l"), value: c.followers.toLocaleString("en-US") },
      ]} />
      {c.links.length ? <RowList label={t("screens.I3.b3.label")} rows={c.links.map((l) => ({ title: l.title, sub: l.kind, leading: { kind: "icon" as const, icon: LINK_ICON[l.kind] ?? "forum-outline" }, onPress: () => toast(t("toasts.13", { name: l.kind === t("screens.I3.b3.r0.s") ? l.title : l.kind })) }))} /> : null}
      {hosted.length ? <RowList label={t("screens.I3.b4.label")} rows={hosted.map((b) => ({ title: b.name, sub: t("screens.I3.b4.r0.s", { amount: skrWhole(b.pool) }), value: t("screens.I3.b4.r0.r"), leading: { kind: "icon" as const, icon: objectIcon(b.objectId) }, chevron: true, onPress: () => go("H2", { id: b.id }) }))} /> : null}
    </Screen>
  );
}

const NOTIFY_ICON: IconName[] = ["bell-ring-outline", "alarm", "eye-outline", "trophy-outline"];

// ── I4 Settings ──
export function I4() {
  const { back, go } = useGo();
  const toast = useToast();
  const wallet = useSession((s) => s.wallet);
  const notify = useSettings((s) => s.notify);
  const setNotify = useSettings((s) => s.setNotify);
  const stats = useStats();
  const faucet = async () => {
    try { const amount = await walletActions.faucet(); toast(t("toasts.17", { amount: skrWhole(amount) })); }
    catch (e) { toast(isApiError(e) && e.code === "FAUCET_USED" ? t("additions.wallet.faucetUsed") : e instanceof Error ? e.message : String(e)); }
  };
  const demo = useIsDemo();
  const canCreate = useFeature("createBounty");
  /** Live: sign out and forget the wallet; A1 asks for the mode again (D-80). */
  const switchWallet = async () => {
    await getWallet().forget();
    useSession.getState().signOut();
    await setAppMode(null);
    resetStack(["A1"]);
  };
  /** Demo: wipe it and start over on A1, or put the sample account back the way it began. */
  const leaveDemo = async () => { await exitDemo(); resetStack(["A1"]); };
  const againDemo = async () => { await restartDemo(); resetStack(["B1"]); toast(t("additions.mode.restarted")); };
  // Home first: the new day's recap (B5) opens over Today as the refetch lands.
  const tomorrow = async () => { resetStack(["B1"]); await skipToTomorrow(); toast(t("additions.mode.skipped")); };
  const account = demo ? [
    { title: t("additions.mode.skip"), sub: t("additions.mode.skipSub"), leading: { kind: "icon" as const, icon: "weather-night" as const }, chevron: true, onPress: () => { void tomorrow(); } },
    { title: t("additions.mode.restart"), sub: t("additions.mode.restartSub"), leading: { kind: "icon" as const, icon: "restart" as const }, chevron: true, onPress: () => { void againDemo(); } },
    { title: t("additions.mode.exit"), sub: t("additions.mode.exitSub"), leading: { kind: "icon" as const, icon: "logout" as const }, chevron: true, onPress: () => { void leaveDemo(); } },
  ] : [
    { title: t("screens.I4.b2.r0.t"), sub: t("screens.I4.b2.r0.s", { address: wallet ? shortWallet(wallet) : "" }), leading: { kind: "icon" as const, icon: "swap-horizontal" as const }, chevron: true, onPress: () => { void switchWallet(); } },
  ];
  const finished = (stats.data?.oaths.kept ?? 0) + (stats.data?.oaths.broken ?? 0);
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.I4.nav.title")} />}>
      <RowList label={t("screens.I4.b0.label")} rows={[
        { title: t("screens.I4.b0.r0.t"), sub: t("screens.I4.b0.r0.s"), leading: { kind: "icon", icon: "account-edit-outline" }, chevron: true, onPress: () => go("I8") },
        { title: t("screens.I4.b0.r1.t"), sub: t("screens.I4.b0.r1.s"), leading: { kind: "icon", icon: "wallet-outline" }, chevron: true, onPress: () => go("W1") },
        { title: t("screens.I4.b0.r2.t"), sub: t("screens.I4.b0.r2.s"), leading: { kind: "icon", icon: "history" }, chevron: true, onPress: () => go("I5") },
        { title: t("screens.I4.b0.r3.t"), sub: t("screens.I4.b0.r3.s", { n: finished }), leading: { kind: "icon", icon: "cards-outline" }, chevron: true, onPress: () => go("D5") },
        { title: t("screens.I4.b0.r4.t"), sub: t("screens.I4.b0.r4.s"), leading: { kind: "icon", icon: "trophy-outline" }, chevron: true, onPress: () => go("H1·j") },
        { title: t("screens.I4.b0.r5.t"), sub: t("screens.I4.b0.r5.s"), leading: { kind: "icon", icon: "eye-outline" }, chevron: true, onPress: () => go("I7") },
        ...(canCreate ? [{ title: t("screens.I4.b0.r6.t"), sub: t("screens.I4.b0.r6.s"), leading: { kind: "icon" as const, icon: "bullhorn-outline" as const }, chevron: true, onPress: () => go("K1") }] : []),
      ]} />
      <RowList label={t("screens.I4.b1.label")} rows={(["nudges", "deadline", "reviews", "results"] as const).map((key, i) => ({
        title: t(`screens.I4.b1.r${i}.t` as CopyKey), sub: t(`screens.I4.b1.r${i}.s` as CopyKey), leading: { kind: "icon" as const, icon: NOTIFY_ICON[i]!, fg: color.text.primary }, toggle: { on: notify[key], onChange: (on: boolean) => setNotify(key, on) },
      }))} />
      <RowList label={t("screens.I4.b2.label")} rows={[
        ...account,
        { title: t("screens.I4.b2.r1.t"), sub: env.cluster === "devnet" ? t("screens.I4.b2.r1.s") : env.cluster, value: t("screens.I4.b2.r1.r"), valueColor: color.orange.base, leading: { kind: "icon", icon: "web" } },
        ...(env.cluster === "devnet" ? [{ title: t("screens.I4.b2.r2.t"), sub: t("screens.I4.b2.r2.s"), value: t("screens.I4.b2.r2.r"), valueColor: color.lime.base, leading: { kind: "icon" as const, icon: "water" as const }, onPress: () => { void faucet(); } }] : []),
      ]} />
    </Screen>
  );
}

// ── I5 Your activity ──
const KINDS = [null, "money", "proof", "oath"] as const;
export function I5() {
  const { back } = useGo();
  const activity = useActivity();
  const [seg, setSeg] = useState(0);
  const items = (activity.data ?? []).filter((a) => !KINDS[seg] || a.kind === KINDS[seg]);
  const days = [...new Set(items.map((a) => a.day))];
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.I5.nav.title")} />}>
      <Segmented items={[0, 1, 2, 3].map((i) => t(`screens.I5.b0.seg.${i}` as CopyKey))} value={seg} onChange={setSeg} />
      {activity.isLoading ? <Skeleton height={200} /> : null}
      {/* Virtualised: activity grows with every Oath (Live). Each day is a labelled section, as RowLists were. */}
      <ScreenList items={[
        ...days.flatMap((d, k) => rowListItems(d, items.filter((a) => a.day === d).map((a) => ({
          title: a.title, sub: a.sub, ...(a.amount ? { value: a.amount, valueColor: a.amount.startsWith("−") ? color.red.base : color.lime.base } : {}),
          leading: { kind: "icon" as const, icon: a.type ? ACTIVITY_ICON[a.type] : a.kind === "money" ? ("sack" as const) : a.kind === "proof" ? ("camera-outline" as const) : ("cards-outline" as const) },
        })), { label: d, gapBefore: k ? metrics.screen.gap : 0 })),
        { key: "note", gapBefore: days.length ? metrics.screen.gap : 0, render: () => <Note text={t("screens.I5.b5.text")} /> },
      ]} />
    </Screen>
  );
}

// ── I7 Who sees what ──
export function I7() {
  const { back, go } = useGo();
  const s = useSettings();
  const seg = (k: "oaths" | "bounties" | "socials", i: number) => (
    <Segmented items={[0, 1, 2].map((n) => t(`screens.I7.b${i}.seg.${n}` as CopyKey))} value={s.visibility[k]} onChange={(a) => {
      s.setVisibility(k, a as Audience);
      if (k === "oaths") void profileActions.save({ visibility: (["public", "members", "private"] as const)[a]! });
    }} />
  );
  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.I7.nav.title")} />}>
      <Banner tone="lime" icon="chart-arc" title={t("screens.I7.b0.title")} sub={t("screens.I7.b0.sub")} />
      <BodyText mono text={t("screens.I7.b1.text")} />
      {seg("oaths", 2)}
      <BodyText mono text={t("screens.I7.b3.text")} />
      {seg("bounties", 4)}
      <BodyText mono text={t("screens.I7.b5.text")} />
      {seg("socials", 6)}
      <RowList rows={[
        { title: t("screens.I7.b7.r0.t"), sub: t("screens.I7.b7.r0.s"), leading: { kind: "icon", icon: "magnify" }, toggle: { on: s.findByName, onChange: (findByName) => s.set({ findByName }) } },
        { title: t("screens.I7.b7.r1.t"), sub: t("screens.I7.b7.r1.s"), leading: { kind: "icon", icon: "email-outline" }, toggle: { on: s.anyoneInvite, onChange: (anyoneInvite) => s.set({ anyoneInvite }) } },
        { title: t("screens.I7.b8.r0.t"), leading: { kind: "icon", icon: "eye-outline" }, chevron: true, onPress: () => go("I2·me") },
      ]} />
    </Screen>
  );
}

// ── I8 Edit profile ──
export function I8() {
  const { back, go } = useGo();
  const toast = useToast();
  const profile = useMyProfile();
  const socials = useSettings((s) => s.socials);
  const setS = useSettings((s) => s.set);
  const p = profile.data;
  const [name, setName] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [bannerIdx, setBanner] = useState<number | null>(null);
  const avatar = useSession((s) => s.avatar);
  if (!p) return <Screen bar={<NavBar onBack={back} close title={t("screens.I8.nav.title")} />}><Skeleton height={200} /></Screen>;
  const save = async () => {
    await profileActions.save({
      name: name ?? p.name, bio: bio ?? p.bio, banner: bannerIdx ?? p.banner,
      socials: socials.x ? [{ kind: "x", handle: p.socials.find((s) => s.kind === "x")?.handle ?? t("screens.I1.b1.social.0") }] : [],
    });
    toast(t("toasts.25"));
    back();
  };
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.I8.nav.title")} />} bottomInset={pinnedOne}
      pinned={<Button kind="p" label={t("screens.I8.pin.0")} onPress={() => { void save(); }} />}>
      <AvatarBuilder variant="edit" config={avatar ?? p.avatar} onChange={() => undefined} onBuild={() => go("I9")} bannerIndex={bannerIdx ?? p.banner} onBanner={setBanner} />
      <SentenceInput label={t("screens.I8.b1.label")} value={name ?? p.name} onChange={setName} max={24} suggestions={[0, 1, 2].map((i) => t(`screens.I8.b1.sug.${i}` as CopyKey))} />
      <SentenceInput label={t("screens.I8.b2.label")} value={bio ?? p.bio} onChange={setBio} max={80} suggestions={[0, 1, 2].map((i) => t(`screens.I8.b2.sug.${i}` as CopyKey))} />
      <RowList label={t("screens.I8.b3.label")} rows={(["x", "telegram", "discord", "farcaster"] as const).map((key, i) => ({
        title: t(`screens.I8.b3.r${i}.t` as CopyKey), sub: socials[key] && key === "x" ? t("screens.I8.b3.r0.s") : t("screens.I8.b3.r1.s"),
        leading: { kind: "icon" as const, icon: SOCIAL_ICON[key]! }, toggle: { on: socials[key], onChange: (on: boolean) => setS({ socials: { ...socials, [key]: on } }) },
      }))} />
      <Note text={t("screens.I8.b4.text")} />
    </Screen>
  );
}

// ── I9 Avatar builder ──
export function I9() {
  const { back } = useGo();
  const stored = useSession((s) => s.avatar);
  // A4 › Customize passes the look on screen (nothing is saved yet during onboarding).
  const { avatar: given } = useParams<{ avatar: string }>();
  const [config, setConfig] = useState(given ?? stored ?? "31205140");
  const [tab, setTab] = useState(0);
  const k = keeperLines("I9")[0]!;
  return (
    <Screen bar={<NavBar onBack={back} close title={t("screens.I9.nav.title")} />} bottomInset={pinnedOne}
      pinned={<Button kind="p" icon="check" label={t("screens.I9.pin.0")} onPress={() => { void profileActions.save({ avatar: config }).catch(() => undefined).finally(back); }} />}>
      <ScreenKeeper id="I9" lines={[k]} />
      <AvatarBuilder config={config} onChange={setConfig} tab={tab} onTab={setTab} onShuffle={() => setConfig(String(Math.floor(Math.random() * 1e8)).padStart(8, "0"))} />
    </Screen>
  );
}
