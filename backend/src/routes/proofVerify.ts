import { Router, Response, RequestHandler } from "express";
import { prisma } from "../db.js";
import { authenticate, AuthedRequest } from "../auth.js";
import { requireGenesis } from "../genesis.js";
import { verdictPasses } from "../v4/verdict.js";
import { DAILY_PHOTO_CHECKS, reviewFailures, verificationRejection, type ReviewContext } from "../v4/rules.js";
import { currentChallenge, findSession, latestChallenge } from "../v4/challenges.js";
import { CHALLENGE_UPLOAD_GRACE_MS, GESTURE_TEXT, type ChallengeGesture } from "../v4/rules.js";
import { combinedHabitsHash, habitChallengeKey } from "../v4/habits.js";
import { config } from "../config.js";
import { keypairFromEnv } from "../solana.js";
import { CheckUnavailableError } from "../v4/verdict.js";
import { keeperSpeech, MAX_LINE_CHARS, takeGlobalVoiceBudget } from "../v4/voice.js";
import { parseRepHabit, parseTrace } from "../shared/reps.js";
import { publicReceiptUrl, publishReceipt, storeRepTrace } from "../v4/receiptStore.js";
import { checkRepEvidence, REP_FREEZE_GESTURE, repFreezeObject, REP_SET_MAX_MS, type RepReceipt } from "../v4/repProof.js";
import { decodePhoto, keeper, receiptHash, RECEIPT_VERSION, sendFailMemo, sha256Hex, UnusableVerdictError, type Receipt } from "../v4/keeper.js";

export const proofVerifyRouter = Router();
const asyncRoute = (fn: (req: any, res: Response) => unknown): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};

const TARGET_TEXT = /^[\p{L}\p{N} ,.'()\-]{1,80}$/u;
const OATH_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HASH = /^[a-f0-9]{64}$/i;
const startOfUtcDay = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

/**
 * The Keeper's photo check. The app uploads the photo; the server hashes it, asks the vision model, and returns the
 * verdict with a public receipt whose SHA-256 is what goes on chain (record_checkin for a kept day, an SPL Memo for a
 * failed check). Any verdict the app sends is ignored. A passing result returns a one-use ID for proof recording.
 */
proofVerifyRouter.post("/proof/verify", authenticate, requireGenesis, asyncRoute(async (req: AuthedRequest, res) => {
  const { expectedObject, expectedGesture, oath, dayIndex, habit, photo } = req.body ?? {};
  if (typeof expectedObject !== "string" || typeof expectedGesture !== "string") {
    return res.status(400).json({ error: "Expected photo, expectedObject and expectedGesture" });
  }
  if (!TARGET_TEXT.test(expectedObject) || !TARGET_TEXT.test(expectedGesture)) return res.status(400).json({ error: "expectedObject and expectedGesture must be short plain text" });
  const withContext = oath !== undefined || dayIndex !== undefined;
  if (withContext && (typeof oath !== "string" || !OATH_ADDRESS.test(oath) || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 255)) {
    return res.status(400).json({ error: "oath and dayIndex must be sent together: an Oath address and a day from 0 to 255" });
  }
  // One photo proves one habit: a check may name the habit it is for (0–7), so its failed tries are counted per habit.
  if (habit !== undefined && (!withContext || !Number.isInteger(habit) || habit < 0 || habit > 7)) {
    return res.status(400).json({ error: "habit must be a whole number from 0 to 7, sent with oath and dayIndex" });
  }
  const image = decodePhoto(photo);
  if ("error" in image) return res.status(400).json({ error: image.error, photoRequired: true });
  const photoHash = sha256Hex(image.bytes);

  // A photo of a habit answers one challenge: the current one for that habit, and the gesture it names (not a gesture
  // the app picks). Checks sent without a habit (the legacy two-photo and Bounty flows) are bound when they are claimed.
  // The habit's object is the Oath's saved one: a check for another object (stale challenge, details synced since) is
  // refused before any model call, and the app takes a new challenge (which names the right object).
  if (habit !== undefined) {
    const details = await prisma.oathDetails.findUnique({ where: { oath }, select: { habitObjects: true } });
    const saved = details?.habitObjects[habit];
    if (saved !== undefined && saved.trim().toLowerCase() !== expectedObject.trim().toLowerCase()) {
      return res.status(409).json({ error: "This habit's proof has changed; a new challenge is needed", habitChanged: true, challengeExpired: true, expected: { object: saved } });
    }
  }
  // A rep habit ("20 push-ups") is proven by a live set, which may take up to REP_SET_MAX_MS after its challenge.
  const rep = habit !== undefined ? parseRepHabit(expectedObject) : null;
  const challenge = habit !== undefined
    ? await currentChallenge(habitChallengeKey(oath, habit), req.wallet, dayIndex, null, CHALLENGE_UPLOAD_GRACE_MS + (rep ? REP_SET_MAX_MS : 0))
    : withContext ? await latestChallenge(oath, req.wallet, dayIndex) : null;
  if (habit !== undefined) {
    if (!challenge) return res.status(409).json({ error: "Gesture challenge expired; a new one is needed", challengeExpired: true });
    if (expectedGesture !== GESTURE_TEXT[challenge.gesture as ChallengeGesture]) return res.status(400).json({ error: "expectedGesture must be the current challenge's gesture" });
  }

  let repReceipt: RepReceipt | undefined;
  if (rep) {
    const checked = checkRepEvidence(req.body?.reps, rep, challenge!, image.bytes);
    if ("error" in checked) return res.status(422).json({ error: checked.error, reps: true });
    repReceipt = checked.receipt;
  }

  // The same photo (exact bytes, any wallet) can pass only once. The one exception is retrying the very same check
  // after recording failed: it gets back its unused verification instead of a new model call.
  const prior = await prisma.proofVerification.findFirst({ where: { photoHash, status: "PASS" } });
  if (prior) {
    const retry = prior.wallet === req.wallet && prior.usedAt === null && prior.oath === (withContext ? oath : null) && prior.dayIndex === (withContext ? dayIndex : null)
      && prior.habit === (habit ?? null) && prior.expectedObject === expectedObject && prior.expectedGesture === expectedGesture;
    if (!retry) return res.status(409).json({ error: "That photo was already used; take a new one" });
    return res.json({ pass: true, verificationId: prior.id, proofHash: photoHash, receiptHash: prior.receiptHash, objectPresent: prior.objectPresent, objectConfidence: prior.objectConfidence,
      gestureSeen: prior.gestureSeen, gestureMatches: prior.gestureMatches, looksLikeScreenOrPrintout: prior.looksLikeScreen, reason: prior.reason, model: prior.model, ms: 0, retry: true });
  }

  // A pose trace proves one set once: the same trace (any wallet) can't pass again for another day or habit.
  if (repReceipt && await prisma.proofVerification.findFirst({ where: { status: "PASS", receipt: { path: ["reps", "traceSha256"], equals: repReceipt.traceSha256 } } })) {
    return res.status(409).json({ error: "That rep set was already used; do a new set", reps: true });
  }

  const session = withContext && habit === undefined ? await findSession(oath, req.wallet, dayIndex) : null;
  const context = withContext ? { oath, dayIndex, sessionId: session?.id ?? null, ...(habit !== undefined ? { habit } : {}) } : {};
  const row = await prisma.proofVerification.create({ data: { wallet: req.wallet, proofHash: photoHash, photoHash, expectedObject, expectedGesture, ...context } });
  const used = await prisma.proofVerification.count({ where: { wallet: req.wallet, createdAt: { gte: startOfUtcDay() } } });
  if (used > DAILY_PHOTO_CHECKS) {
    await prisma.proofVerification.delete({ where: { id: row.id } });
    return res.status(429).json({ error: "daily_limit", detail: `${DAILY_PHOTO_CHECKS} photo checks per wallet per day; try again tomorrow (UTC)` });
  }

  const started = Date.now();
  let judged: Awaited<ReturnType<typeof keeper.judge>>;
  try {
    // For a rep set the photo is the freeze frame: a person mid-workout, holding the challenge gesture.
    judged = await keeper.judge(image, rep ? { object: repFreezeObject(rep.exercise), gesture: REP_FREEZE_GESTURE } : { object: expectedObject, gesture: expectedGesture });
  } catch (e) {
    // The model answered but unusably: it was a paid call, so it counts toward the daily limit (not as a failed try).
    // No answer at all (down, timed out): it does not count.
    if (e instanceof UnusableVerdictError) await prisma.proofVerification.update({ where: { id: row.id }, data: { status: "UNAVAILABLE", reason: e.message.slice(0, 200) } }).catch(() => undefined);
    else await prisma.proofVerification.delete({ where: { id: row.id } }).catch(() => undefined);
    if (e instanceof CheckUnavailableError) return res.status(503).json({ error: "check_unavailable", detail: e.message, retryable: true });
    throw e;
  }
  const verdict = judged.verdict;
  const pass = verdictPasses(verdict);
  const receipt: Receipt = {
    v: RECEIPT_VERSION, kind: "oath", wallet: req.wallet, target: withContext ? oath : null, dayIndex: withContext ? dayIndex : null, habit: habit ?? null,
    // What the vision model was asked to see: for a rep set the freeze move (the habit itself is in `reps`).
    photoSha256: photoHash, expected: rep ? { object: repFreezeObject(rep.exercise), gesture: REP_FREEZE_GESTURE } : { object: expectedObject, gesture: expectedGesture },
    challenge: { gesture: challenge?.gesture ?? null, slot: challenge?.slot ?? null, blockhash: challenge?.blockhash ?? null, issuedAt: challenge?.issuedAt.toISOString() ?? null },
    model: judged.model, ...(repReceipt ? { reps: repReceipt } : {}), verdict, pass, checkedAt: new Date().toISOString(),
  };
  const hash = receiptHash(receipt);
  await prisma.proofVerification.update({ where: { id: row.id }, data: {
    status: pass ? "PASS" : "FAIL", objectPresent: verdict.objectPresent, objectConfidence: verdict.objectConfidence, gestureSeen: verdict.gestureSeen,
    gestureMatches: verdict.gestureMatches, looksLikeScreen: verdict.looksLikeScreenOrPrintout, reason: verdict.reason,
    receipt, receiptHash: hash, model: judged.model,
  } });
  // A public copy of the receipt on Supabase Storage (its bytes hash to the on-chain hash). In the background.
  void publishReceipt(hash, receipt).catch(() => undefined);
  // A rep set's pose trace, privately, to tune the counter on real sets (keypoints only). In the background.
  // The validated trace (parseTrace: shape and size checked), not the raw upload.
  if (repReceipt && rep) void storeRepTrace(hash, { trace: parseTrace((req.body?.reps as { trace?: unknown } | undefined)?.trace), exercise: rep.exercise, target: rep.target,
    repCount: repReceipt.repCount, phoneCount: repReceipt.phoneCount, pass, reason: verdict.reason }).catch(() => undefined);
  // The Keeper's spoken verdict, said now so the app's /api/keeper/say for it is a cache hit. The text must match the
  // app's copy exactly (frontend/src/copy/additions.json › keeper.sayKept / sayFailed). Best effort, in the background.
  const verdictLine = `${pass ? "Kept." : "Not kept."} ${verdict.reason}`.slice(0, MAX_LINE_CHARS);
  if (config.elevenLabsApiKey && config.keeperVoiceId && takeGlobalVoiceBudget(verdictLine.length)) void keeperSpeech(verdictLine).catch(() => undefined);
  // A failed verdict is published too: the verifier wallet writes the receipt hash in an SPL Memo (in the background).
  if (!pass && config.verifierSecretKey) {
    void sendFailMemo(keypairFromEnv(config.verifierSecretKey), hash)
      .then((sig) => prisma.proofVerification.update({ where: { id: row.id }, data: { memoSignature: sig } }))
      .catch(() => undefined);
  }
  const failedChecks = habit !== undefined
    ? await prisma.proofVerification.count({ where: { wallet: req.wallet, oath, dayIndex, habit, status: "FAIL" } })
    : withContext ? (session ? (await loadReviewFailures({ wallet: req.wallet, oath, dayIndex, session, object: expectedObject, gesture: expectedGesture })).length : 0) : undefined;
  return res.json({ pass, verificationId: pass ? row.id : null, proofHash: photoHash, receiptHash: hash, ...verdict, model: judged.model, ms: Date.now() - started, checksLeft: Math.max(0, DAILY_PHOTO_CHECKS - used), failedChecks, slot: challenge?.slot ?? null });
}));

// Public Keeper receipts (outside /api, which requires sign-in). They hold no photo, only hashes and the verdict.

/** A Keeper receipt by its SHA-256, so anyone can re-hash it and compare it with the chain. */
proofVerifyRouter.get("/keeper/receipts/:hash", asyncRoute(async (req, res) => {
  const hash = String(req.params.hash ?? "").toLowerCase();
  if (!HASH.test(hash)) return res.status(400).json({ error: "Expected a 64-character hex hash" });
  const row = await prisma.proofVerification.findUnique({ where: { receiptHash: hash } });
  if (!row?.receipt) return res.status(404).json({ error: "Receipt not found" });
  return res.json({ receipt: row.receipt, receiptHash: hash, memoSignature: row.memoSignature ?? null, publicUrl: publicReceiptUrl(hash) });
}));

/**
 * What a kept day put on chain: the receipt hash of each habit's photo (in habit order), their combined hash (the
 * record_checkin proof_hash) and the check-in transaction. The app re-hashes the receipts and compares with the chain.
 */
proofVerifyRouter.get("/keeper/oaths/:oath/days/:day", asyncRoute(async (req, res) => {
  const oath = String(req.params.oath ?? ""), day = Number(req.params.day), wallet = String(req.query.wallet ?? "");
  if (!OATH_ADDRESS.test(oath) || !OATH_ADDRESS.test(wallet) || !Number.isInteger(day) || day < 0 || day > 255) return res.status(400).json({ error: "Expected an Oath address, a day and ?wallet=" });
  const [habits, recorded] = await Promise.all([
    prisma.habitProof.findMany({ where: { oath, wallet, dayIndex: day }, orderBy: { habit: "asc" } }),
    prisma.oathProof.findUnique({ where: { oath_wallet_dayIndex: { oath, wallet, dayIndex: day } } }),
  ]);
  if (!habits.length) return res.status(404).json({ error: "No Keeper receipts for that day" });
  const receiptHashes = habits.map((h) => h.proofHash);
  return res.json({
    oath, wallet, dayIndex: day, receiptHashes, dayHash: combinedHabitsHash(receiptHashes),
    signature: recorded?.status === "RECORDED" ? recorded.signature : null, recordedHash: recorded?.proofHash ?? null,
  });
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
