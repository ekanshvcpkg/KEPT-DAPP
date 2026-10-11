// Live Bounties (owner, LIVE_DEMO_PLAN Q3): the backend runs one admin-made Bounty at a time
// (GET /bounty/current). H1 lists only that one; it has no creator page (I3), and creating or funding one
// (K) is hidden in Live. The backend has no brand, category, cover message or rules for it, so it shows as
// KEPT's own, verified, with the category of its object and no entry rules. My entry is a stake-0 solo
// Oath on the Bounty's days (D-53), as on the mock; its proof waits for Q1 (ends on F2b).
import { BountyCurrentResponse, RecentlyOutResponse } from "@kept/shared";
import type { BountyCurrent } from "@kept/shared";
import { t } from "@/copy";
import type { BountyFacts, Category } from "@/features/bounties/model";
import type { OathFacts } from "@/features/oaths/model";
import { shortWallet } from "@/features/oaths/names";
import { ApiError } from "../errors";
import type { BountiesApi } from "../types";
import type { HttpClient } from "./client";

/** Object index → H1's category chip (the same pairs as the mock Bounties). */
const CATEGORY: Category[] = ["Fitness", "Reading", "Hydration", "Music", "Outdoors", "Outdoors", "Fitness", "Mind"];
const RECENTLY_OUT = 5;
/** Live Bounty ids carry a prefix so they can't collide with an Oath address. */
const liveBountyId = (id: number) => `bounty-${id}`;
const backendId = (id: string) => {
  const n = Number(id.replace(/^bounty-/, ""));
  if (!Number.isInteger(n) || n < 0) throw new ApiError("NOT_FOUND", `Bounty ${id} not found`, 404);
  return n;
};

type View = NonNullable<BountyCurrent["bounty"]>;
type Entry = NonNullable<BountyCurrent["me"]>;

function toBounty(b: View, out: BountyFacts["recentlyOut"]): BountyFacts {
  const brand = t("additions.bounty.liveBrand");
  return {
    id: liveBountyId(b.id), name: b.title,
    brand: { name: brand, verified: true, logo: brand.slice(0, 1), palette: 0 },
    message: b.title, detail: "", link: null,
    objectId: b.objectId, numDays: b.numDays, pool: BigInt(b.poolAmount),
    joinClosesAt: b.joinClosesAt, startsAt: b.startTs,
    entrants: b.entrants, remaining: b.stillIn, category: CATEGORY[b.objectId] ?? "Fitness",
    minKeptRate: null, tokenHeld: null, createdBy: null, featured: true,
    recentlyOut: out, stillInByDay: [], finishersOptIn: [],
  };
}

/** My entry as an Oath (D-53): the backend's daysKept is the same day bitmask the app uses. */
function bountyOath(b: View, me: Entry, wallet: string): OathFacts {
  const paid = b.status === "PAID";
  return {
    id: liveBountyId(b.id), source: "chain", oathId: null, creator: wallet, name: b.title, goal: null,
    objectId: b.objectId, numDays: b.numDays, stake: 0n, isSolo: true, reviewMode: "ai",
    status: paid ? "settled" : "active", day1StartsAt: b.startTs, daySeconds: b.daySeconds,
    members: [{
      wallet, name: null, avatar: null, keptRate: null, rateDays: 0, daysKept: me.daysKept, proofToday: "none",
      claimed: me.paidAt !== null, payout: paid ? BigInt(me.payoutAmount ?? "0") : null,
    }],
    inviteCode: null, createdAt: b.startTs, bountyId: liveBountyId(b.id),
  };
}

export function httpBounties(c: HttpClient): BountiesApi {
  const current = () => c.get("/bounty/current", BountyCurrentResponse);
  const recentlyOut = async (id: number): Promise<BountyFacts["recentlyOut"]> => {
    const r = await c.get(`/bounty/${id}/recently-out?limit=${RECENTLY_OUT}`, RecentlyOutResponse).catch(() => null);
    return (r?.entries ?? []).map((e) => ({ name: shortWallet(e.wallet), day: (e.outDay ?? 0) + 1, at: e.outAt ?? 0 }));
  };
  const find = async (id: string) => {
    const r = await current();
    if (!r.bounty || r.bounty.id !== backendId(id)) throw new ApiError("NOT_FOUND", `Bounty ${id} not found`, 404);
    return { bounty: r.bounty, me: r.me };
  };
  return {
    list: async () => {
      const r = await current();
      return r.bounty ? [toBounty(r.bounty, await recentlyOut(r.bounty.id))] : [];
    },
    get: async (id) => {
      const { bounty } = await find(id);
      return toBounty(bounty, await recentlyOut(bounty.id));
    },
    join: async (id, wallet) => {
      const r = await c.post(`/bounty/${backendId(id)}/join`, {}, BountyCurrentResponse);
      if (!r.bounty || !r.me) throw new ApiError("SERVER", "Join returned no entry", 500);
      return bountyOath(r.bounty, r.me, wallet);
    },
    mine: async (id, wallet) => {
      const { bounty, me } = await find(id);
      return me ? bountyOath(bounty, me, wallet) : null;
    },
    create: () => Promise.reject(new ApiError("NOT_FOUND", "Creating a Bounty has no backend route yet (see docs/BACKEND_GAPS.md)")),
  };
}

/** My entry in the current Bounty, for the Oath list (Today, the Bounties tab). Null when there's none. */
export async function myLiveBounty(c: HttpClient, wallet: string): Promise<OathFacts | null> {
  const r = await c.get("/bounty/current", BountyCurrentResponse).catch(() => null);
  return r?.bounty && r.me ? bountyOath(r.bounty, r.me, wallet) : null;
}
