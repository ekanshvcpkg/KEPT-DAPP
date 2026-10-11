// Queries and actions for everything but Oaths: Bounties, Rematch, group review, profiles and the wallet.
// Each runs on the app mode's API (Demo: the mock, Live: http); Live hides what the backend lacks (D-80).
import { useQueries, useQuery } from "@tanstack/react-query";
import { getApi, useApi } from "@/api";
import type { BountyDraftInput } from "@/api";
import { queryClient } from "@/api/queries";
import { getTx } from "@/chain";
import { useDev } from "@/state/dev";
import { useSession } from "@/state/session";
import type { ReviewFacts } from "./reviews/model";
import { refreshOaths } from "./oaths/hooks";
import type { OathFacts } from "./oaths/model";

const me = () => useSession.getState().wallet ?? "";
const k = {
  bounties: ["bounties"] as const,
  bounty: (id: string) => ["bounties", id] as const,
  myBounty: (id: string) => ["bounties", id, "mine"] as const,
  rematch: (id: string) => ["rematch", id] as const,
  review: (id: string) => ["reviews", id] as const,
  myReview: (oath: string, day: number) => ["reviews", "mine", oath, day] as const,
  openReviews: (oath: string) => ["reviews", "open", oath] as const,
  profile: ["profile", "me"] as const,
  person: (w: string) => ["profile", w] as const,
  stats: ["profile", "stats"] as const,
  activity: ["profile", "activity"] as const,
  creator: (n: string) => ["profile", "creator", n] as const,
};

function useScoped<T>(key: readonly unknown[], fn: () => Promise<T>, opts: { enabled?: boolean; refetchInterval?: number } = {}) {
  const scenario = useDev((s) => s.scenario);
  return useQuery({ queryKey: [...key, scenario], queryFn: fn, ...opts });
}

// ── Bounties ──
export function useBounties() { const api = useApi(); return useScoped(k.bounties, () => api.bounties.list()); }
export function useBounty(id: string | undefined) { const api = useApi(); return useScoped(k.bounty(id ?? ""), () => api.bounties.get(id!), { enabled: !!id }); }
export function useMyBounty(id: string | undefined) {
  const api = useApi();
  const wallet = useSession((s) => s.wallet);
  return useScoped(k.myBounty(id ?? ""), () => api.bounties.mine(id!, wallet!), { enabled: !!id && !!wallet });
}

export const bountyActions = {
  async join(id: string): Promise<OathFacts> {
    const o = await getApi().bounties.join(id, me());
    await Promise.all([queryClient.invalidateQueries({ queryKey: k.bounties }), refreshOaths()]);
    return o;
  },
  /** K5·p: fund on chain (mock: no program support, BACKEND_GAPS P1-10), then publish. */
  async create(d: BountyDraftInput): Promise<string> {
    await getTx("mock").fundBounty({ bountyId: d.name, pool: d.pool });
    const b = await getApi().bounties.create(d, me());
    await queryClient.invalidateQueries({ queryKey: k.bounties });
    return b.id;
  },
};

// ── Rematch ──
export function useRematch(sourceId: string | undefined) {
  const api = useApi();
  return useScoped(k.rematch(sourceId ?? ""), () => api.rematch.offer(sourceId!), { enabled: !!sourceId });
}
export const rematchActions = {
  /** R2: stake again into the Rematch (mock: BACKEND_GAPS P1-2). */
  async join(sourceId: string): Promise<OathFacts> {
    await getTx("mock").joinRematch({ oath: sourceId });
    const r = await getApi().rematch.join(sourceId, me());
    await Promise.all([queryClient.invalidateQueries({ queryKey: k.rematch(sourceId) }), refreshOaths()]);
    return r;
  },
};

// ── Group review ──
export function useOpenReviews(oathId: string | undefined) {
  const api = useApi();
  const wallet = useSession((s) => s.wallet);
  return useScoped(k.openReviews(oathId ?? ""), () => api.reviews.openFor(oathId!, wallet!), { enabled: !!oathId && !!wallet });
}
export function useReview(id: string | undefined, poll = false) {
  const api = useApi();
  const wallet = useSession((s) => s.wallet);
  return useScoped(k.review(id ?? ""), () => api.reviews.get(id!, wallet!), { enabled: !!id && !!wallet, ...(poll ? { refetchInterval: 3000 } : {}) });
}
export const reviewActions = {
  async request(oath: OathFacts, dayIndex: number, gesture: ReviewFacts["gesture"]): Promise<ReviewFacts> {
    const r = await getApi().reviews.request(oath, me(), dayIndex, gesture);
    await refreshOaths();
    return r;
  },
  async vote(id: string, oathId: string, approve: boolean) {
    await getApi().reviews.vote(id, me(), approve);
    await Promise.all([queryClient.invalidateQueries({ queryKey: k.openReviews(oathId) }), refreshOaths()]);
  },
};

// ── Profiles ──
export function useMyProfile() { const api = useApi(); return useScoped(k.profile, () => api.profile.mine()); }
export function usePerson(wallet: string | undefined) { const api = useApi(); return useScoped(k.person(wallet ?? ""), () => api.profile.get(wallet!), { enabled: !!wallet }); }
/** Profiles for several wallets at once (N1's avatars), wallet → profile once loaded. */
export function usePeople(wallets: string[]) {
  const api = useApi();
  const scenario = useDev((s) => s.scenario);
  const unique = [...new Set(wallets)];
  const results = useQueries({ queries: unique.map((w) => ({ queryKey: [...k.person(w), scenario], queryFn: () => api.profile.get(w) })) });
  return new Map(unique.flatMap((w, i) => (results[i]?.data ? [[w, results[i]!.data!] as const] : [])));
}
export function useStats() { const api = useApi(); return useScoped(k.stats, () => api.profile.stats()); }
export function useActivity() { const api = useApi(); return useScoped(k.activity, () => api.profile.activity()); }
export function useCreator(name: string | undefined) { const api = useApi(); return useScoped(k.creator(name ?? ""), () => api.profile.creator(name!), { enabled: !!name }); }

export const profileActions = {
  async save(patch: Parameters<ReturnType<typeof getApi>["profile"]["save"]>[0]) {
    // The device keeps the look first (profiles have no backend yet, BACKEND_GAPS P1-9). Only the look:
    // saving from the builder mid-onboarding (A4 › Customize) must not end onboarding.
    if (patch.avatar) useSession.getState().setAvatar(patch.avatar);
    await getApi().profile.save(patch);
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
  },
};

// ── Wallet ──
export const walletActions = {
  async faucet(): Promise<bigint> {
    const r = await getApi().wallet.faucet();
    await queryClient.invalidateQueries({ queryKey: ["wallet"] });
    return r.amount;
  },
  async swap(lamports: bigint): Promise<bigint> {
    const r = await getApi().wallet.swap(lamports);
    await queryClient.invalidateQueries({ queryKey: ["wallet"] });
    return r.skr;
  },
};
