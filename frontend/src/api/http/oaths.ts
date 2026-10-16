// Real Oaths: program accounts read over RPC, goal text from the backend, and the fields the backend
// can't store yet from the device (names, review mode). Nothing here reads the mock (Live, D-80).
import { PublicKey } from "@solana/web3.js";
import { NATIVE_SOL_MINT, oathPda } from "@kept/chain";
import { DetailsResponse, GoalResponse, HabitChallengeResponse, HabitProofResponse, InviteCreateResponse, InviteResolveResponse, OathInviteResponse } from "@kept/shared";
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

type Details = { goalText: string | null; habits: string[]; habitObjects: string[] };

async function goalOf(c: HttpClient, oath: string): Promise<Details> {
  const d = useDeviceOaths.getState();
  if (d.goals[oath] && d.habitObjects[oath]) return { goalText: d.goals[oath]!, habits: d.habits[oath] ?? [d.goals[oath]!], habitObjects: d.habitObjects[oath]! };
  try {
    const { goalText, habits, habitObjects } = await c.get(`/api/oaths/${oath}/details`, GoalResponse);
    const normalizedHabits = habits?.length ? habits : goalText ? [goalText] : [];
    const objects = habitObjects ?? [];
    if (goalText) d.remember(oath, { goal: goalText, habits: normalizedHabits, habitObjects: objects });
    return { goalText, habits: normalizedHabits, habitObjects: objects };
  } catch {
    return { goalText: null, habits: [], habitObjects: [] }; // non-members and Genesis-less wallets get 403; the screen shows the name only
  }
}

function toFacts(o: ChainOath, details: Details): OathFacts {
  const d = useDeviceOaths.getState();
  const started = o.status !== "open";
  const day = started ? Math.floor((Math.floor(clock.now() / 1000) - o.startTs) / o.daySeconds) : -1;
  return {
    id: o.address,
    source: "chain",
    asset: o.mint === NATIVE_SOL_MINT ? "sol" : "skr",
    oathId: o.oathId.toString(),
    creator: o.creator,
    name: d.names[o.address] ?? oathName(o.objectId, o.numDays),
    goal: details.goalText,
    habits: details.habits,
    ...(details.habitObjects.length ? { habitObjects: details.habitObjects } : {}),
    objectId: o.objectId,
    numDays: o.numDays,
    stake: o.stake,
    isSolo: o.isSolo,
    reviewMode: d.reviewModes[o.address] ?? "ai",
    status: o.status,
    // Today the program starts day 1 at Start, in 24 h windows (BACKEND_GAPS P0-4).
    day1StartsAt: started ? o.startTs : null,
    daySeconds: o.daySeconds,
    members: o.members.map((m) => {
      // What this device has seen pass today: only the viewer's own photos are known here, and only for the current day.
      const mine = m.wallet === useSession.getState().wallet;
      const [doneDay, done] = d.habitsDone[o.address] ?? [-1, []];
      const doneToday = mine && doneDay === day ? done : [];
      return {
        wallet: m.wallet, name: null, avatar: null, keptRate: null, rateDays: 0, daysKept: m.daysKept, claimed: m.claimed,
        payout: o.status === "settled" || o.status === "cancelled" ? m.payout : null,
        proofToday: doneToday.length === 0 ? "none" : doneToday.length >= Math.max(1, details.habits.length) ? "kept" : "partial",
        ...(mine ? { habitsDone: doneToday } : {}),
      };
    }),
    inviteCode: d.codes[o.address] ?? null,
    createdAt: o.startTs || Number(o.oathId % 1_000_000_000n),
  };
}

async function restoreInvite(c: HttpClient, oath: string): Promise<string | null> {
  try {
    const r = await c.get(`/api/oaths/${encodeURIComponent(oath)}/invite`, OathInviteResponse);
    if (!r.invite) return null;
    useDeviceOaths.getState().remember(oath, { ...(r.goalText ? { goal: r.goalText } : {}), ...(r.habits?.length ? { habits: r.habits } : {}), ...(r.habitObjects?.length ? { habitObjects: r.habitObjects } : {}), code: r.invite.code });
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
    const habitObjects = r.habitObjects ?? [];
    if (r.goalText) useDeviceOaths.getState().remember(o.address, { goal: r.goalText, habits, habitObjects });
    return { oath: toFacts(o, { goalText: r.goalText, habits, habitObjects }), alreadyStarted: r.alreadyStarted };
  },
  register: async (oath, goal, habits, habitObjects) => {
    await c.post("/api/oaths/details", { oath: oath.id, goalText: goal, habits, habitObjects }, DetailsResponse);
    let code = oath.isSolo ? null : await restoreInvite(c, oath.id);
    if (!oath.isSolo && !code) code = (await c.post("/api/invites", { oath: oath.id }, InviteCreateResponse)).code;
    await c.send("/api/oaths/watch", { oath: oath.id });
    useDeviceOaths.getState().remember(oath.id, { goal, habits, habitObjects, ...(code ? { code } : {}) });
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

/**
 * Live proof uses the on-device MediaPipe + Gemma module before posting the verdict and photo hash. One photo proves one habit:
 * the habit's own object is what the model looks for and what /proof/verify must say; the server picks the gesture.
 */
export function httpProof(c: HttpClient): ProofApi {
  return {
    challenge: async (oath, habit, dayIndex) => {
      // Bounty proof (POST /bounty/:id/challenge) needs the same on-device check: Q1.
      if (oath.bountyId) throw new ApiError("PROOF_UNAVAILABLE", "Bounty proof waits for the on-device check (LIVE_DEMO_PLAN Q1)", 409);
      const r = await c.post("/api/proof/challenge", { oath: oath.id, dayIndex, habit }, HabitChallengeResponse);
      useDeviceOaths.getState().setHabitsDone(oath.id, dayIndex, r.done);
      // The schema (IsoTime) already turns the backend's ISO timestamps into unix seconds. Converting again
      // read them as milliseconds (1970) and every challenge expired the moment it arrived (F2c).
      return { habit, dayIndex, object: r.object, gesture: GESTURE[r.gesture]!, expiresAt: r.expiresAt };
    },
    submit: async (oath, challenge, _image, imageUri) => {
      if (oath.bountyId || !imageUri) return { status: "unavailable" };
      const object = challenge.object;
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
        expectedObject: object, expectedGesture: gesture, oath: oath.id, dayIndex: challenge.dayIndex, habit: challenge.habit,
      }, VerifyResponse);
      if (!checked.pass || !checked.verificationId) return {
        status: "fail", attempts: checked.failedChecks ?? 1,
        objectPresent: verdict.objectPresent, gestureMatches: verdict.gestureMatches,
      };
      const r = await c.post("/api/proof/habit", { oath: oath.id, dayIndex: challenge.dayIndex, habit: challenge.habit, verificationId: checked.verificationId }, HabitProofResponse);
      useDeviceOaths.getState().setHabitsDone(oath.id, challenge.dayIndex, r.done);
      return { status: "pass", dayKept: r.dayKept };
    },
  };
}
