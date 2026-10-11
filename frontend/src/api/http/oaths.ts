// Real Oaths: program accounts read over RPC, goal text from the backend, and the fields the backend
// can't store yet from the device (names, review mode). Nothing here reads the mock (Live, D-80).
import { PublicKey } from "@solana/web3.js";
import { oathPda } from "@kept/chain";
import { OBJECTS } from "@kept/config";
import { DetailsResponse, GoalResponse, InviteCreateResponse, InviteResolveResponse, OathInviteResponse, ProofChallengeResponse } from "@kept/shared";
import { PROGRAM_ID, listOathsOf, readOath } from "@/chain/program";
import type { ChainOath } from "@/chain/program";
import { useDeviceOaths } from "@/features/oaths/device";
import type { OathFacts } from "@/features/oaths/model";
import { oathName } from "@/features/oaths/names";
import { clock } from "@/lib/clock";
import { z } from "zod";
import { analyzeDevicePhoto } from "kept-gesture";
import { useSession } from "@/state/session";
import { ApiError, fromRpcError, isApiError } from "../errors";
import type { GestureLabel, OathsApi, ProofApi } from "../types";
import { myLiveBounty } from "./bounties";
import type { HttpClient } from "./client";

async function goalOf(c: HttpClient, oath: string): Promise<{ goalText: string | null; habits: string[] }> {
  const d = useDeviceOaths.getState();
  if (d.goals[oath]) return { goalText: d.goals[oath]!, habits: d.habits[oath] ?? [d.goals[oath]!] };
  try {
    const { goalText, habits } = await c.get(`/api/oaths/${oath}/details`, GoalResponse);
    const normalizedHabits = habits?.length ? habits : goalText ? [goalText] : [];
    if (goalText) d.remember(oath, { goal: goalText, habits: normalizedHabits });
    return { goalText, habits: normalizedHabits };
  } catch {
    return { goalText: null, habits: [] }; // non-members and Genesis-less wallets get 403; the screen shows the name only
  }
}

function toFacts(o: ChainOath, details: { goalText: string | null; habits: string[] }): OathFacts {
  const d = useDeviceOaths.getState();
  const started = o.status !== "open";
  const day = started ? Math.floor((Math.floor(clock.now() / 1000) - o.startTs) / o.daySeconds) : -1;
  return {
    id: o.address,
    source: "chain",
    oathId: o.oathId.toString(),
    creator: o.creator,
    name: d.names[o.address] ?? oathName(o.objectId, o.numDays),
    goal: details.goalText,
    habits: details.habits,
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
    useDeviceOaths.getState().remember(oath, { ...(r.goalText ? { goal: r.goalText } : {}), ...(r.habits?.length ? { habits: r.habits } : {}), code: r.invite.code });
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
    const habits = r.habits?.length ? r.habits : r.goalText ? [r.goalText] : [];
    if (r.goalText) useDeviceOaths.getState().remember(o.address, { goal: r.goalText, habits });
    return { oath: toFacts(o, { goalText: r.goalText, habits }), alreadyStarted: r.alreadyStarted };
  },
  register: async (oath, goal, habits) => {
    await c.post("/api/oaths/details", { oath: oath.id, goalText: goal, habits }, DetailsResponse);
    let code = oath.isSolo ? null : await restoreInvite(c, oath.id);
    if (!oath.isSolo && !code) code = (await c.post("/api/invites", { oath: oath.id }, InviteCreateResponse)).code;
    await c.send("/api/oaths/watch", { oath: oath.id });
    useDeviceOaths.getState().remember(oath.id, { goal, habits, ...(code ? { code } : {}) });
    return code;
  },
  watch: async (oath) => {
    await c.send("/api/oaths/watch", { oath: oath.id });
    useDeviceOaths.getState().remember(oath.id);
  },
});

/** The backend's MediaPipe labels → the app's gesture names (the design's three, rules.md §5). */
const GESTURE: Record<string, GestureLabel> = { Thumb_Up: "thumbs_up", Victory: "victory", Open_Palm: "open_palm", Closed_Fist: "closed_fist", Pointing_Up: "pointing_up" };
const GESTURE_TEXT: Record<GestureLabel, string> = { thumbs_up: "thumbs up", victory: "victory sign (index and middle finger in a V)", open_palm: "open palm facing the camera", closed_fist: "closed fist", pointing_up: "pointing up" };
const VerifyResponse = z.object({ pass: z.boolean(), verificationId: z.string().nullable(), failedChecks: z.number().int().optional() });
const StartResponse = z.object({ endAllowedAt: z.string() });
const EndResponse = z.object({ signature: z.string(), proofHash: z.string() }).passthrough();

/**
 * Live proof uses the on-device MediaPipe + Gemma module before posting the verdict and photo hash.
 */
export function httpProof(c: HttpClient): ProofApi {
  return {
    challenge: async (oath, photo, dayIndex) => {
      // Bounty proof (POST /bounty/:id/challenge) needs the same on-device check: Q1.
      if (oath.bountyId) throw new ApiError("PROOF_UNAVAILABLE", "Bounty proof waits for the on-device check (LIVE_DEMO_PLAN Q1)", 409);
      const r = await c.post("/api/proof/challenge", { oath: oath.id, dayIndex }, ProofChallengeResponse);
      if (r.phase === "wait") return { photo: 2, dayIndex, objectId: oath.objectId, gesture: GESTURE[r.startGesture]!, expiresAt: r.endAllowedAt, waitUntil: r.endAllowedAt };
      // The schema (IsoTime) already turns the backend's ISO timestamps into unix seconds. Converting again
      // read them as milliseconds (1970) and every challenge expired the moment it arrived (F2c).
      return { photo, dayIndex, objectId: oath.objectId, gesture: GESTURE[r.gesture]!, expiresAt: r.expiresAt };
    },
    submit: async (oath, challenge, _image, imageUri) => {
      if (oath.bountyId || !imageUri) return { status: "unavailable" };
      // What the model looks for and what /proof/verify must say is the Oath's own object (the program's object_id), from the shared list.
      const object = OBJECTS[challenge.objectId]?.text;
      const gesture = GESTURE_TEXT[challenge.gesture];
      if (!object || !gesture) return { status: "unavailable" };
      const verdict = await analyzeDevicePhoto(imageUri, object, gesture);
      // The model gave no usable answer: not the user's miss. Nothing is sent (a failed check counts toward review); they retry.
      if (verdict.inconclusive) return { status: "unavailable" };
      // The photo stays on the phone: the server gets its hash, the verdict and what it was checked for.
      const checked = await c.post("/proof/verify", {
        proofHash: verdict.proofHash, objectPresent: verdict.objectPresent, objectConfidence: verdict.objectConfidence,
        gestureSeen: verdict.gestureSeen, gestureMatches: verdict.gestureMatches, looksLikeScreenOrPrintout: verdict.looksLikeScreenOrPrintout,
        reason: verdict.reason, model: verdict.model, ms: verdict.ms,
        expectedObject: object, expectedGesture: gesture, oath: oath.id, dayIndex: challenge.dayIndex,
      }, VerifyResponse);
      if (!checked.pass || !checked.verificationId) return {
        status: "fail", attempts: checked.failedChecks ?? 1,
        objectPresent: verdict.objectPresent, gestureMatches: verdict.gestureMatches,
      };
      if (challenge.photo === 1) {
        const started = await c.post("/api/proof/start", { oath: oath.id, dayIndex: challenge.dayIndex, verificationId: checked.verificationId }, StartResponse);
        return { status: "pass", endAllowedAt: Math.floor(Date.parse(started.endAllowedAt) / 1000) };
      }
      await c.post("/api/proof", { oath: oath.id, dayIndex: challenge.dayIndex, verificationId: checked.verificationId }, EndResponse);
      return { status: "pass" };
    },
  };
}
