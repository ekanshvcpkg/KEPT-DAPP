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
import { useSession } from "@/state/session";
import { ApiError, fromRpcError, isApiError } from "../errors";
import type { GestureLabel, OathsApi, ProofApi } from "../types";
import { myLiveBounty } from "./bounties";
import type { HttpClient } from "./client";

type Details = { goalText: string | null; habits: string[]; habitObjects: string[] };

const sameObjects = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x.trim().toLowerCase() === b[i]!.trim().toLowerCase());

/**
 * Keeps the server's habit details and this phone's in step; the server's copy is what proofs are judged against.
 * - The creator's phone saved them when it created the Oath. If the server has none (a solo Oath is Active the moment
 *   it is created, and the server used to refuse the save then), they are sent again.
 * - If the server has different ones, the server wins and this phone takes them.
 * Reads wait for it (once per Oath per app session, unless `force`), so the facts they build show the synced details.
 * Returns the server's habit objects, or null if they couldn't be read.
 */
const synced = new Map<string, Promise<string[] | null>>();
function syncDetails(c: HttpClient, oath: string, creator: string, force = false): Promise<string[] | null> {
  const run = async (): Promise<string[] | null> => {
    const d = useDeviceOaths.getState();
    const mine = useSession.getState().wallet === creator;
    const goal = d.goals[oath], habits = d.habits[oath], objects = d.habitObjects[oath];
    try {
      const server = await c.get(`/api/oaths/${oath}/details`, GoalResponse);
      if (server.goalText) {
        const serverObjects = server.habitObjects ?? [];
        const serverHabits = server.habits?.length ? server.habits : [server.goalText];
        if (!objects || !sameObjects(serverObjects, objects) || goal !== server.goalText) {
          d.remember(oath, { goal: server.goalText, habits: serverHabits, habitObjects: serverObjects });
        }
        return serverObjects;
      }
      if (!mine || !goal || !objects?.length) return null;
      await c.post("/api/oaths/details", { oath, goalText: goal, habits: habits?.length ? habits : [goal], habitObjects: objects }, DetailsResponse);
      return objects;
    } catch {
      synced.delete(oath); // try again on the next read
      return null;
    }
  };
  if (force || !synced.has(oath)) synced.set(oath, run());
  return synced.get(oath)!;
}

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
      Promise.all([...found, ...extra].map(async (o) => { await syncDetails(c, o.address, o.creator); return toFacts(o, await goalOf(c, o.address)); })),
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
    await syncDetails(c, id, o.creator);
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
const VerifyResponse = z.object({
  pass: z.boolean(), verificationId: z.string().nullable(), failedChecks: z.number().int().optional(),
  objectPresent: z.boolean().optional(), gestureMatches: z.boolean().optional(), receiptHash: z.string().optional(), reason: z.string().optional(),
});

/**
 * Live proof: the Keeper judges on the server. The photo is uploaded with what it must show (the habit's own object and
 * the server's gesture); the server hashes it, asks the vision model and records a public receipt. Nothing the phone
 * concludes is trusted, so nothing is sent but the photo and its context. One photo proves one habit.
 */
export function httpProof(c: HttpClient): ProofApi {
  return {
    challenge: async (oath, habit, dayIndex) => {
      // Bounty proof (POST /bounty/:id/challenge) needs the same on-device check: Q1.
      if (oath.bountyId) throw new ApiError("PROOF_UNAVAILABLE", "Bounty proof waits for the on-device check (LIVE_DEMO_PLAN Q1)", 409);
      let r = await c.post("/api/proof/challenge", { oath: oath.id, dayIndex, habit }, HabitChallengeResponse);
      // What the server judges this habit against must be what the phone shows: if they differ, sync the details (the
      // creator's phone re-sends them; otherwise the phone takes the server's) and ask again.
      const shown = useDeviceOaths.getState().habitObjects[oath.id]?.[habit];
      if (shown && shown.trim().toLowerCase() !== r.object.trim().toLowerCase()) {
        await syncDetails(c, oath.id, oath.creator, true);
        r = await c.post("/api/proof/challenge", { oath: oath.id, dayIndex, habit }, HabitChallengeResponse);
      }
      useDeviceOaths.getState().setHabitsDone(oath.id, dayIndex, r.done);
      // The schema (IsoTime) already turns the backend's ISO timestamps into unix seconds. Converting again
      // read them as milliseconds (1970) and every challenge expired the moment it arrived (F2c).
      return { habit, dayIndex, object: r.object, gesture: GESTURE[r.gesture]!, expiresAt: r.expiresAt, ...(r.freezeAfter ? { freezeAfter: r.freezeAfter } : {}) };
    },
    submit: async (oath, challenge, image, _imageUri, reps) => {
      if (oath.bountyId || !image) return { status: "unavailable" };
      const object = challenge.object;
      const gesture = GESTURE_TEXT[challenge.gesture];
      if (!object || !gesture) return { status: "unavailable" };
      let checked: z.output<typeof VerifyResponse>;
      try {
        checked = await c.post("/proof/verify", {
          photo: image, expectedObject: object, expectedGesture: gesture, oath: oath.id, dayIndex: challenge.dayIndex, habit: challenge.habit,
          ...(reps ? { reps } : {}),
        }, VerifyResponse);
      } catch (e) {
        // The Keeper could not judge (model down or slow): not the user's miss and not a counted try. They retry (F2b).
        if (isApiError(e) && e.status === 503) return { status: "unavailable" };
        // The challenge ran out, or no longer matches the habit (its gesture or object changed): a new challenge (F2c),
        // not a retry of the same check on F2b, which would get the same answer.
        if (isApiError(e) && ((e.status === 409 && /challenge/i.test(e.message)) || (e.status === 400 && /current challenge/i.test(e.message)))) return { status: "expired" };
        // Refused for good (a photo already used, a rep set the recount refused or already used): retrying the same check
        // would get the same answer, so the user takes a new photo or does a new set (F2a) and hears why. No model call
        // was made, so it is not a counted try.
        if (isApiError(e) && (e.status === 409 || e.status === 422)) return { status: "fail", attempts: 0, reason: e.message };
        throw e;
      }
      if (!checked.pass || !checked.verificationId) return {
        status: "fail", attempts: checked.failedChecks ?? 1,
        ...(checked.objectPresent !== undefined ? { objectPresent: checked.objectPresent } : {}),
        ...(checked.gestureMatches !== undefined ? { gestureMatches: checked.gestureMatches } : {}),
        ...(checked.reason ? { reason: checked.reason } : {}),
      };
      const r = await c.post("/api/proof/habit", { oath: oath.id, dayIndex: challenge.dayIndex, habit: challenge.habit, verificationId: checked.verificationId }, HabitProofResponse);
      useDeviceOaths.getState().setHabitsDone(oath.id, challenge.dayIndex, r.done);
      return { status: "pass", dayKept: r.dayKept, ...(checked.reason ? { reason: checked.reason } : {}) };
    },
  };
}
