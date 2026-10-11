// Real Oaths: program accounts read over RPC, goal text from the backend, and the fields the backend
// can't store yet from the device (names, review mode). Nothing here reads the mock (Live, D-80).
import { PublicKey } from "@solana/web3.js";
import { oathPda } from "@kept/chain";
import { DetailsResponse, GoalResponse, InviteCreateResponse, InviteResolveResponse, OathInviteResponse, ProofChallengeResponse } from "@kept/shared";
import { PROGRAM_ID, listOathsOf, readOath } from "@/chain/program";
import type { ChainOath } from "@/chain/program";
import { useDeviceOaths } from "@/features/oaths/device";
import type { OathFacts } from "@/features/oaths/model";
import { oathName } from "@/features/oaths/names";
import { clock } from "@/lib/clock";
import { useSession } from "@/state/session";
import { ApiError, fromRpcError, isApiError } from "../errors";
import type { GestureLabel, OathsApi, ProofApi } from "../types";
import { myLiveBounty } from "./bounties";
import type { HttpClient } from "./client";

async function goalOf(c: HttpClient, oath: string): Promise<string | null> {
  const d = useDeviceOaths.getState();
  if (d.goals[oath]) return d.goals[oath]!;
  try {
    const { goalText } = await c.get(`/api/oaths/${oath}/details`, GoalResponse);
    if (goalText) d.remember(oath, { goal: goalText });
    return goalText;
  } catch {
    return null; // non-members and Genesis-less wallets get 403; the screen shows the name only
  }
}

function toFacts(o: ChainOath, goal: string | null): OathFacts {
  const d = useDeviceOaths.getState();
  const started = o.status !== "open";
  const day = started ? Math.floor((Math.floor(clock.now() / 1000) - o.startTs) / o.daySeconds) : -1;
  return {
    id: o.address,
    source: "chain",
    oathId: o.oathId.toString(),
    creator: o.creator,
    name: d.names[o.address] ?? oathName(o.objectId, o.numDays),
    goal,
    objectId: o.objectId,
    numDays: o.numDays,
    stake: o.stake,
    isSolo: o.isSolo,
    reviewMode: d.reviewModes[o.address] ?? "ai",
    status: o.status,
    // Today the program starts day 1 at Start, in 24 h windows (BACKEND_GAPS P0-4).
    day1StartsAt: started ? o.startTs : null,
    daySeconds: o.daySeconds,
    members: o.members.map((m) => ({
      wallet: m.wallet, name: null, avatar: null, keptRate: null, rateDays: 0, daysKept: m.daysKept, claimed: m.claimed,
      payout: o.status === "settled" || o.status === "cancelled" ? m.payout : null,
      proofToday: d.photo1[o.address] === day ? "photo1" : "none",
    })),
    inviteCode: d.codes[o.address] ?? null,
    createdAt: o.startTs || Number(o.oathId % 1_000_000_000n),
  };
}

async function restoreInvite(c: HttpClient, oath: string): Promise<string | null> {
  try {
    const r = await c.get(`/api/oaths/${encodeURIComponent(oath)}/invite`, OathInviteResponse);
    if (!r.invite) return null;
    useDeviceOaths.getState().remember(oath, { ...(r.goalText ? { goal: r.goalText } : {}), code: r.invite.code });
    return r.invite.code;
  } catch {
    // Invite restoration is an optional detail. Keep Oath reads usable if this route is unavailable.
    return null;
  }
}

export const httpOaths = (c: HttpClient): OathsApi => ({
  list: async (wallet) => {
    const found = await listOathsOf(wallet).catch((e: unknown) => { throw fromRpcError(e); });
    const known = useDeviceOaths.getState().known.filter((id) => !found.some((o) => o.address === id));
    const extra = (await Promise.all(known.map((id) => readOath(id).catch(() => null)))).filter((o): o is ChainOath => !!o && o.members.some((m) => m.wallet === wallet));
    const [oaths, bounty] = await Promise.all([
      Promise.all([...found, ...extra].map(async (o) => toFacts(o, await goalOf(c, o.address)))),
      myLiveBounty(c, wallet),
    ]);
    return bounty ? [...oaths, bounty] : oaths;
  },
  get: async (id) => {
    if (id.startsWith("bounty-")) {
      const b = await myLiveBounty(c, useSession.getState().wallet ?? "");
      if (!b || b.id !== id) throw new ApiError("NOT_FOUND", `Bounty entry ${id} not found`, 404);
      return b;
    }
    const o = await readOath(id).catch((e: unknown) => { throw fromRpcError(e); });
    if (!o) throw new ApiError("NOT_FOUND", `Oath ${id} not found`, 404);
    const facts = toFacts(o, await goalOf(c, id));
    if (!facts.inviteCode && !facts.isSolo && facts.status === "open") {
      facts.inviteCode = await restoreInvite(c, id);
    }
    return facts;
  },
  byInvite: async (code) => {
    let r;
    try {
      r = await c.get(`/api/invites/${encodeURIComponent(code)}`, InviteResolveResponse);
    } catch (e) {
      throw isApiError(e) && e.status === 404 ? new ApiError("INVITE_NOT_FOUND", e.message, 404) : e;
    }
    // The invite returns OathRead without the account address; it's the PDA of creator + oath_id.
    const o = await readOath(oathPda(PROGRAM_ID, new PublicKey(r.oath.creator), BigInt(r.oath.oathId)).toBase58());
    if (!o) throw new ApiError("INVITE_NOT_FOUND", "Oath account not found", 404);
    return { oath: toFacts(o, r.goalText), alreadyStarted: r.alreadyStarted };
  },
  register: async (oath, goal) => {
    await c.post("/api/oaths/details", { oath: oath.id, goalText: goal }, DetailsResponse);
    let code = oath.isSolo ? null : await restoreInvite(c, oath.id);
    if (!oath.isSolo && !code) code = (await c.post("/api/invites", { oath: oath.id }, InviteCreateResponse)).code;
    await c.send("/api/oaths/watch", { oath: oath.id });
    useDeviceOaths.getState().remember(oath.id, { goal, ...(code ? { code } : {}) });
    return code;
  },
  watch: async (oath) => {
    await c.send("/api/oaths/watch", { oath: oath.id });
    useDeviceOaths.getState().remember(oath.id);
  },
});

/** The backend's MediaPipe labels → the app's gesture names (the design's three, rules.md §5). */
const GESTURE: Record<string, GestureLabel> = { Thumb_Up: "thumbs_up", Victory: "victory", Open_Palm: "open_palm" };

/**
 * Live proof. The challenge is the backend's (POST /api/proof/challenge). Checking a photo needs a verdict
 * from an on-device model (POST /proof/verify: MediaPipe + Gemma, docs/API.md › Proof), which the app
 * doesn't have yet, so every photo ends on the design's "Check unavailable" (F2b) instead of sending a
 * made-up verdict. docs/LIVE_DEMO_PLAN.md Q1; BACKEND_GAPS P0-1.
 */
export function httpProof(c: HttpClient): ProofApi {
  return {
    challenge: async (oath, photo, dayIndex) => {
      // Bounty proof (POST /bounty/:id/challenge) needs the same on-device check: Q1.
      if (oath.bountyId) throw new ApiError("PROOF_UNAVAILABLE", "Bounty proof waits for the on-device check (LIVE_DEMO_PLAN Q1)", 409);
      const r = await c.post("/api/proof/challenge", { oath: oath.id, dayIndex }, ProofChallengeResponse);
      if (r.phase === "wait") throw new ApiError("PROOF_UNAVAILABLE", `The end photo opens at ${new Date(r.endAllowedAt * 1000).toISOString()}`, 409);
      // The schema (IsoTime) already turns the backend's ISO timestamps into unix seconds. Converting again
      // read them as milliseconds (1970) and every challenge expired the moment it arrived (F2c).
      return { photo, dayIndex, objectId: oath.objectId, gesture: GESTURE[r.gesture]!, expiresAt: r.expiresAt };
    },
    submit: async () => ({ status: "unavailable" }),
  };
}
