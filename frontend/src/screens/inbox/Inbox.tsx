// N1 Inbox and M1 Notifications (screens.md). The inbox is on the mock until the backend adds it
// (BACKEND_GAPS P1-11); M1 is the system tray's look, from copy.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { InboxItem } from "@kept/shared";
import { keeperLines, t } from "@/copy";
import type { CopyKey, KeeperMood } from "@/copy";
import { usePeople } from "@/features/queries";
import { NavBar, useToast } from "@/components/chrome";
import { Note, Skeleton, Title } from "@/components/content/Basics";
import { RowList } from "@/components/content/Rows";
import { inboxListItems } from "@/components/content/Social";
import type { InboxItemView, InboxLead } from "@/components/content/Social";
import type { IconName } from "@/components/primitives";
import { metrics } from "@/theme";
import type { PaletteName } from "@/theme";
import { ScreenKeeper } from "@/components/keeper/ScreenKeeper";
import { Screen, ScreenList } from "@/components/layout/Screen";
import { ago } from "@/lib/format";
import { useApi } from "@/api";
import { qk, useInbox } from "@/api/queries";
import type { DesignId } from "@/app/routes";
import type { Params } from "@/app/nav";
import { useGo } from "@/app/nav";
import { useNow } from "@/features/time";
import { featureAvailable } from "@/features/availability";

type Kind = InboxItem["type"];
/** Where an item opens, from its type and ref (flows.md N1). */
function targetOf(it: InboxItem): [DesignId, Params] | null {
  const { oath, code, bounty } = it.ref;
  switch (it.type) {
    case "invite": return oath ? ["E2", { id: oath, ...(code ? { code } : {}) }] : code ? ["E1", { code }] : null;
    case "review": return oath ? ["G1", { id: oath }] : null;
    case "claim": return oath ? ["J1", { id: oath }] : null;
    // Rematch has no backend yet (P1-2): Live opens the broken Oath instead.
    case "rematch": case "broken": return oath ? (featureAvailable("rematch") ? ["R1", { id: oath }] : ["D3", { id: oath }]) : null;
    case "nudge": case "deadline": return oath ? ["D2", { id: oath }] : null;
    case "recap": return ["B5", {}];
    case "started": return bounty ? ["H3", { id: bounty }] : oath ? ["D2", { id: oath }] : null;
    case "bounty": return bounty ? ["H2", { id: bounty }] : null;
    case "followed": return null;
  }
}

const LEAD: Record<Kind, { icon: IconName; palette: PaletteName }> = {
  invite: { icon: "account-plus-outline", palette: "sky" },
  review: { icon: "vote-outline", palette: "vio" },
  claim: { icon: "sack", palette: "lime" },
  rematch: { icon: "sword-cross", palette: "orange" },
  broken: { icon: "heart-broken", palette: "orange" },
  nudge: { icon: "hand-wave-outline", palette: "pink" },
  deadline: { icon: "timer-sand", palette: "orange" },
  recap: { icon: "chart-bar", palette: "amber" },
  started: { icon: "flag-checkered", palette: "lime" },
  bounty: { icon: "bullhorn-outline", palette: "sky" },
  followed: { icon: "account-heart-outline", palette: "pink" },
};
const BADGE: Partial<Record<Kind, { icon: IconName; palette: PaletteName }>> = {
  invite: { icon: "email-outline", palette: "vio" },
  review: { icon: "eye-outline", palette: "vio" },
  nudge: { icon: "bell-ring", palette: "lime" },
  followed: { icon: "account-heart-outline", palette: "pink" },
};
const KEEPER_LEAD: Partial<Record<Kind, KeeperMood>> = { claim: "smug", rematch: "wink", recap: "side" };
/** The design's button labels per item type (N1 copy). */
const ACTIONS: Partial<Record<Kind, CopyKey[]>> = {
  invite: ["screens.N1.b1.inv1.btn0", "screens.N1.b1.inv1.btn1"],
  review: ["screens.N1.b1.rev1.btn0"],
  claim: ["screens.N1.b1.clm1.btn0"],
  rematch: ["screens.N1.b1.rm1.btn0"],
};

export function N1() {
  const { back, go } = useGo();
  const toast = useToast();
  const api = useApi();
  const qc = useQueryClient();
  const inbox = useInbox();
  const now = useNow(60_000);
  const markDone = useCallback(async (ids: string[]) => {
    await api.inbox.markDone(ids);
    await qc.invalidateQueries({ queryKey: qk.inbox });
  }, [api, qc]);

  const items = inbox.data?.items ?? [];
  const people = usePeople(items.flatMap((i) => (i.actor ? [i.actor] : [])));
  // reference/kept-kit.js › INBOX: people's items show their avatar with a small badge; the Keeper's own
  // items (claim, Rematch, the recap) show his face; the rest an icon tile.
  const leadOf = (it: InboxItem): InboxLead => {
    const avatar = it.actor ? people.get(it.actor)?.avatar : undefined;
    if (avatar) return { kind: "avatar", config: avatar };
    const mood = KEEPER_LEAD[it.type];
    if (mood) return { kind: "keeper", mood };
    return { kind: "icon", ...LEAD[it.type] };
  };
  const view = (it: InboxItem): InboxItemView => {
    const to = targetOf(it);
    const open = to ? () => go(to[0], to[1]) : undefined;
    const labels = it.done ? [] : (ACTIONS[it.type] ?? []);
    const lead = leadOf(it);
    const badge = it.actor ? BADGE[it.type] : undefined;
    return {
      id: it.id, title: it.title, sub: it.body, time: ago(now - it.createdAt), lead, ...(badge ? { badge } : {}),
      needsAction: it.needsAction, done: it.done, unread: !it.done,
      ...(open ? { onPress: open } : {}),
      actions: labels.map((label, i) => {
        // Invites: Accept opens E2, Decline stays (toast); both mark the item done.
        if (it.type === "invite" && i === 1) return { label: t(label), kind: "s" as const, onPress: () => { void markDone([it.id]); toast(t("toasts.20")); } };
        // reference › N1: Accept and Claim lime, Review photo white, See Rematch secondary.
        return { label: t(label), kind: it.type === "claim" || it.type === "invite" ? ("l" as const) : it.type === "rematch" ? ("s" as const) : ("p" as const), onPress: () => { if (it.type === "invite") void markDone([it.id]); open?.(); } };
      }),
    };
  };
  const needs = items.filter((i) => i.needsAction && !i.done);
  const fresh = items.filter((i) => !i.needsAction);
  const k = keeperLines("N1");
  const keeper = needs.some((i) => i.type === "claim") ? k[0] : needs.some((i) => i.type === "review") ? k[1] : k[2];

  return (
    <Screen bar={<NavBar onBack={back} title={t("screens.N1.nav.title")} />}>
      {keeper ? <ScreenKeeper id="N1" lines={[keeper]} /> : null}
      {inbox.isLoading ? <><Skeleton height={96} /><Skeleton height={96} /><Skeleton height={96} /></> : null}
      {/* Virtualised: the inbox keeps every item (Live). Its two sections are spaced as two InboxLists were. */}
      <ScreenList items={[
        ...(needs.length ? inboxListItems("needs", { label: t("screens.N1.b1.label", { n: needs.length }), items: needs.map(view) }) : []),
        ...(fresh.length ? inboxListItems("fresh", {
          label: t("screens.N1.b2.label"), items: fresh.map(view),
          ...(fresh.some((i) => !i.done) ? { action: { label: t("screens.N1.b2.action"), onPress: () => { void markDone(fresh.map((i) => i.id)); } } } : {}),
        }, needs.length ? metrics.screen.gap : 0) : []),
        { key: "note", gapBefore: needs.length || fresh.length ? metrics.screen.gap : 0, render: () => <Note text={t("screens.N1.b3.text")} /> },
      ]} />
    </Screen>
  );
}

// ── M1 Notifications ── what the system tray shows; real pushes use expo-notifications (P1-12).
export function M1() {
  const { back } = useGo();
  // The tray's clock: now (the virtual clock in a development build).
  const d = new Date(useNow(30_000) * 1000);
  const rows = Array.from({ length: 11 }, (_, i) => ({
    title: t(`screens.M1.b1.r${i}.t` as CopyKey), value: t(`screens.M1.b1.r${i}.r` as CopyKey),
    leading: { kind: "mark" as const },
  }));
  return (
    <Screen bar={<NavBar onBack={back} close />}>
      <Title heading={t("screens.M1.b0.title", { time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}` })}
        sub={t("screens.M1.b0.sub", { date: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }).replace(",", "") })} align="center" fs={56} />
      <RowList rows={rows} />
    </Screen>
  );
}
