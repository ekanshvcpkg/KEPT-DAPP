import { Router, Response, RequestHandler } from "express";
import { prisma } from "../db.js";
import { authenticate, AuthedRequest } from "../auth.js";
import { requireGenesis } from "../genesis.js";
import { verdictPasses, type PhotoVerdict } from "../v4/verdict.js";
import { DAILY_PHOTO_CHECKS, reviewFailures, verificationRejection, type ReviewContext } from "../v4/rules.js";
import { findSession } from "../v4/challenges.js";

export const proofVerifyRouter = Router();
const asyncRoute = (fn: (req: any, res: Response) => unknown): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};

const TARGET_TEXT = /^[\p{L}\p{N} ,.'()\-]{1,80}$/u;
const OATH_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HASH = /^[a-f0-9]{64}$/i;
const startOfUtcDay = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

/**
 * Registers the on-device model verdict submitted by the authenticated client.
 * The image itself is never uploaded. A passing result returns a one-use ID for proof recording.
 */
proofVerifyRouter.post("/proof/verify", authenticate, requireGenesis, asyncRoute(async (req: AuthedRequest, res) => {
  const { proofHash, expectedObject, expectedGesture, oath, dayIndex, habit } = req.body ?? {};
  const raw = req.body ?? {};
  if (typeof proofHash !== "string" || !HASH.test(proofHash) || typeof expectedObject !== "string" || typeof expectedGesture !== "string") {
    return res.status(400).json({ error: "Expected proofHash, expectedObject and expectedGesture from the on-device proof checker" });
  }
  if (!TARGET_TEXT.test(expectedObject) || !TARGET_TEXT.test(expectedGesture)) return res.status(400).json({ error: "expectedObject and expectedGesture must be short plain text" });
  const { objectPresent, objectConfidence, gestureSeen, gestureMatches, looksLikeScreenOrPrintout, reason } = raw;
  if (typeof objectPresent !== "boolean" || typeof objectConfidence !== "number" || !Number.isFinite(objectConfidence) || objectConfidence < 0 || objectConfidence > 1 || typeof gestureSeen !== "string" || typeof gestureMatches !== "boolean" || typeof looksLikeScreenOrPrintout !== "boolean" || typeof reason !== "string") {
    return res.status(400).json({ error: "On-device proof checker returned an invalid verdict" });
  }
  const withContext = oath !== undefined || dayIndex !== undefined;
  if (withContext && (typeof oath !== "string" || !OATH_ADDRESS.test(oath) || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 255)) {
    return res.status(400).json({ error: "oath and dayIndex must be sent together: an Oath address and a day from 0 to 255" });
  }

  // One photo proves one habit: a check may name the habit it is for (0–7), so its failed tries are counted per habit.
  if (habit !== undefined && (!withContext || !Number.isInteger(habit) || habit < 0 || habit > 7)) {
    return res.status(400).json({ error: "habit must be a whole number from 0 to 7, sent with oath and dayIndex" });
  }
  const session = withContext && habit === undefined ? await findSession(oath, req.wallet, dayIndex) : null;
  const context = withContext ? { oath, dayIndex, sessionId: session?.id ?? null, ...(habit !== undefined ? { habit } : {}) } : {};
  const row = await prisma.proofVerification.create({ data: { wallet: req.wallet, proofHash: proofHash.toLowerCase(), expectedObject, expectedGesture, ...context } });
  const used = await prisma.proofVerification.count({ where: { wallet: req.wallet, createdAt: { gte: startOfUtcDay() } } });
  if (used > DAILY_PHOTO_CHECKS) {
    await prisma.proofVerification.delete({ where: { id: row.id } });
    return res.status(429).json({ error: "daily_limit", detail: `${DAILY_PHOTO_CHECKS} photo checks per wallet per day; try again tomorrow (UTC)` });
  }

  const verdict: PhotoVerdict = { objectPresent, objectConfidence, gestureSeen: gestureSeen.slice(0, 60), gestureMatches, looksLikeScreenOrPrintout, reason: reason.slice(0, 200) };
  const pass = verdictPasses(verdict);
  await prisma.proofVerification.update({ where: { id: row.id }, data: {
    status: pass ? "PASS" : "FAIL", objectPresent: verdict.objectPresent, objectConfidence: verdict.objectConfidence, gestureSeen: verdict.gestureSeen,
    gestureMatches: verdict.gestureMatches, looksLikeScreen: verdict.looksLikeScreenOrPrintout, reason: verdict.reason,
  } });
  const failedChecks = habit !== undefined
    ? await prisma.proofVerification.count({ where: { wallet: req.wallet, oath, dayIndex, habit, status: "FAIL" } })
    : withContext ? (session ? (await loadReviewFailures({ wallet: req.wallet, oath, dayIndex, session, object: expectedObject, gesture: expectedGesture })).length : 0) : undefined;
  return res.json({ pass, verificationId: pass ? row.id : null, proofHash: row.proofHash, ...verdict, model: typeof raw.model === "string" ? raw.model.slice(0, 100) : "On-device models", ms: typeof raw.ms === "number" ? raw.ms : 0, checksLeft: Math.max(0, DAILY_PHOTO_CHECKS - used), failedChecks });
}));

type VerificationRow = NonNullable<Awaited<ReturnType<typeof prisma.proofVerification.findUnique>>>;
/** The two queries a claim needs; tests pass an in-memory store. */
export type VerificationStore = {
  findUnique(args: { where: { id: string } }): Promise<VerificationRow | null>;
  updateMany(args: { where: { id: string; usedAt: null }; data: { usedAt: Date } }): Promise<{ count: number }>;
};

/**
 * Claims a passing check for `expected` before any work is done. The claim is one conditional update
 * (id = X AND usedAt IS NULL → usedAt = now), so of two concurrent requests with the same id exactly one
 * gets it; the other is rejected. Call releaseVerification if the work then fails without recording anything.
 */
export async function claimVerification(id: unknown, wallet: string, expected: { object: string; gesture: string }, store: VerificationStore = prisma.proofVerification as unknown as VerificationStore) {
  const v = typeof id === "string" && id.length <= 64 ? await store.findUnique({ where: { id } }) : null;
  const error = verificationRejection(v, wallet, expected, Date.now());
  if (error) return { error };
  const claimed = await store.updateMany({ where: { id: v!.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) return { error: "That photo check was already used" };
  return { verification: v! };
}

/** The query group review needs; tests pass an in-memory store. */
export type ReviewFailureStore = {
  findMany(args: { where: { wallet: string; oath: string; dayIndex: number; status: "FAIL" } }): Promise<VerificationRow[]>;
};

/** Failed checks the server counts toward group review (see reviewFailures), newest first. */
export async function loadReviewFailures(ctx: ReviewContext, store: ReviewFailureStore = prisma.proofVerification as unknown as ReviewFailureStore) {
  const rows = await store.findMany({ where: { wallet: ctx.wallet, oath: ctx.oath, dayIndex: ctx.dayIndex, status: "FAIL" } });
  return reviewFailures(rows, ctx);
}

/** Undoes a claim when the request failed before anything was recorded, so the same check can be retried. */
export function releaseVerification(id: string) {
  return prisma.proofVerification.updateMany({ where: { id }, data: { usedAt: null } }).catch(() => undefined);
}
