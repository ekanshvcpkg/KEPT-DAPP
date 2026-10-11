import { createHash, randomBytes, createSign } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { Router, Request, Response, RequestHandler } from "express";
import { Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction, createTransferInstruction, getAssociatedTokenAddress, getMint } from "@solana/spl-token";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { authenticate, AuthedRequest, hashBytes, issueNonce, issueSession, verifyLogin } from "../auth.js";
import { frozenDayList, lastClosedDay, missedDays, needsCarryoverSweep, needsHeldSweep, settleDecision, settleDueAt } from "../v4/jobs.js";
import { CONFIG_BASE_LEN, decodeConfigEconomics, decodeOathTerms, heldSweepPending, oathEconomics, type OathTerms } from "../v4/terms.js";
import { BREAK_HOLD_BPS, HELD_WINDOW_DAYS, MISS_BPS, replayV3, RULES_V2, RULES_V3 } from "../shared/payout.js";
import { CHALLENGE_UPLOAD_GRACE_MS, GESTURE_TEXT, OBJECT_IDS, OBJECT_TEXT, nudgeRejection, nudgeTargets, proofRequestKind, REVIEW_PHOTO_TTL_MS, reviewPhotoExpired, reviewRequestRejection, type ChallengeGesture, proofRejection, reviewOutcome } from "../v4/rules.js";
import { currentChallenge, dayChallenge, findSession, startSession } from "../v4/challenges.js";
import { combinedProofHash, sessionPhase, validMinMinutes } from "../v4/session.js";
import { checkGenesis, requireGenesis } from "../genesis.js";
import { connection, keypairFromEnv, programId, tokenProgramForMint } from "../solana.js";
import { requireAdmin } from "../admin.js";
import { runBountyJobs, type BountyJobReport } from "./bounty.js";
import { claimVerification, loadReviewFailures, releaseVerification } from "./proofVerify.js";
import { identityFor, reputationFor } from "./profile.js";

export const v4Router = Router();
const asyncRoute = (fn: (req: any, res: Response) => unknown): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res)).catch(next);
};
const post = (route: string, fn: (req: any, res: Response) => unknown) => v4Router.post(route, asyncRoute(fn));
const get = (route: string, fn: (req: any, res: Response) => unknown) => v4Router.get(route, asyncRoute(fn));
const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];

post("/api/auth/nonce", (req, res) => {
  try { const message = issueNonce(req.body?.wallet); res.json({ message }); }
  catch { res.status(400).json({ error: "Invalid wallet address" }); }
});

post("/api/auth/verify", (req, res) => {
  const { wallet, message, signature } = req.body ?? {};
  if (typeof wallet !== "string" || typeof message !== "string" || typeof signature !== "string" || !verifyLogin(wallet, message, signature)) {
    return res.status(401).json({ error: "Invalid or expired sign-in signature" });
  }
  return res.json({ token: issueSession(new PublicKey(wallet).toBase58()), wallet: new PublicKey(wallet).toBase58() });
});

v4Router.post("/admin/run-jobs", requireAdmin, asyncRoute(async (_req, res) => res.json(await runV4Jobs())));

v4Router.use("/api", authenticate);


get("/api/me", async (req: AuthedRequest, res) => {
  const seat = await prisma.sessionSeat.findUnique({ where: { wallet: req.wallet } });
  const genesisMint = await checkGenesis(req.wallet);
  if (genesisMint) {
    try { await prisma.sessionSeat.upsert({ where: { wallet: req.wallet }, create: { wallet: req.wallet, genesisMint }, update: { genesisMint } }); }
    catch { return res.status(409).json({ wallet:req.wallet, genesis:false, mocked:false, genesisMint:null, error:"This Genesis Token is assigned to a different wallet" }); }
  }
  return res.json({ wallet: req.wallet, genesis: !!genesisMint, mocked: config.sgtMock && !!genesisMint, genesisMint: genesisMint ?? seat?.genesisMint ?? null });
});

v4Router.use("/api", requireGenesis);

post("/api/oaths/watch", async (req: AuthedRequest, res) => {
  const oath = typeof req.body?.oath === "string" ? req.body.oath : "";
  const info = await readOath(oath);
  if (!info || !info.members.includes(req.wallet)) return res.status(403).json({ error: "Oath member access required" });
  await prisma.oathWatch.upsert({ where: { oath }, create: { oath }, update: {} });
  return res.status(204).end();
});


post("/api/faucet", async (req: AuthedRequest, res) => {
  if (config.devnetRpcUrl.includes("mainnet")) return res.status(403).json({ error: "Faucet is Devnet only" });
  if (!config.stakeMint || !config.faucetSecretKey) return res.status(503).json({ error: "Faucet is not configured" });
  try { await prisma.faucetClaim.create({ data: { wallet: req.wallet, signature: "pending" } }); }
  catch { return res.status(429).json({ error: "This wallet has already used the 5,000 SKR faucet" }); }
  try {
    const signer = keypairFromEnv(config.faucetSecretKey);
    const mint = new PublicKey(config.stakeMint);
    const owner = new PublicKey(req.wallet);
    const program = await tokenProgramForMint(mint);
    const source = await getAssociatedTokenAddress(mint, signer.publicKey, false, program);
    const destination = await getAssociatedTokenAddress(mint, owner, false, program);
    const tx = new Transaction();
    if (!(await connection.getAccountInfo(destination))) tx.add(createAssociatedTokenAccountInstruction(signer.publicKey, destination, owner, mint, program));
    const info = await getMint(connection, mint, "confirmed", program);
    const amount = 5_000n * 10n ** BigInt(info.decimals);
    tx.add(createTransferInstruction(source, destination, signer.publicKey, amount, [], program));
    const sig = await connection.sendTransaction(tx, [signer]);
    await connection.confirmTransaction(sig, "confirmed");
    await prisma.faucetClaim.update({ where: { wallet: req.wallet }, data: { signature: sig } });
    return res.json({ signature: sig, amount: "5000", mint: mint.toBase58() });
  } catch (e) {
    await prisma.faucetClaim.deleteMany({ where: { wallet: req.wallet, signature: "pending" } });
    return res.status(502).json({ error: e instanceof Error ? e.message : "Faucet transfer failed" });
  }
});

post("/api/invites", async (req: AuthedRequest, res) => {
  const oath = typeof req.body?.oath === "string" ? req.body.oath : "";
  const info = await readOath(oath);
  if (!info || info.status !== 0 || !info.members.includes(req.wallet)) return res.status(403).json({ error: "Only an oath member can create an invite while the oath is Open" });
  const code = randomBytes(5).toString("base64url");
  await prisma.oathInvite.create({ data: { code, oath, createdBy: req.wallet } });
  return res.status(201).json({ code, deepLink: `kept://join/${code}`, oath: info });
});

get("/api/invites/:code", async (req, res) => {
  const row = await prisma.oathInvite.findUnique({ where: { code: req.params.code } });
  if (!row) return res.status(404).json({ error: "Invite not found" });
  const oath = await readOath(row.oath);
  if (!oath) return res.status(404).json({ error: "Oath not found" });
  const details = await prisma.oathDetails.findUnique({ where: { oath: row.oath } });
  return res.json({ oath, goalText: details?.goalText ?? null, habits: details?.habits?.length ? details.habits : details?.goalText ? [details.goalText] : [], alreadyStarted: oath.status !== 0 });
});

get("/api/oaths/:oath/invite", async (req: AuthedRequest, res) => {
  const info = await readOath(req.params.oath);
  if (!info || !info.members.includes(req.wallet)) return res.status(404).json({ error: "Oath not found" });
  const [savedInvite, details] = await Promise.all([
    prisma.oathInvite.findFirst({ where: { oath: req.params.oath, createdBy: req.wallet }, orderBy: { createdAt: "desc" } }),
    prisma.oathDetails.findUnique({ where: { oath: req.params.oath } }),
  ]);
  return res.json({ goalText: details?.goalText ?? null, habits: details?.habits?.length ? details.habits : details?.goalText ? [details.goalText] : [], invite: savedInvite ? { code: savedInvite.code, deepLink: `kept://join/${savedInvite.code}` } : null });
});

post("/api/oaths/details", async (req: AuthedRequest, res) => {
  const { oath, goalText, habits: rawHabits, minMinutes } = req.body ?? {};
  if (typeof oath !== "string" || typeof goalText !== "string" || !goalText.trim() || goalText !== goalText.trim()) {
    return res.status(400).json({ error: "Oath and goal text are required" });
  }
  const habits = rawHabits === undefined ? [goalText] : rawHabits;
  if (!Array.isArray(habits) || habits.length < 1 || habits.length > 8 || habits.some((habit) => typeof habit !== "string" || !habit.trim() || habit !== habit.trim() || habit.length > (rawHabits === undefined ? 120 : 60))) {
    return res.status(400).json({ error: rawHabits === undefined ? "Provide one trimmed goal of 1–120 characters" : "Provide 1–8 habits, each 1–60 characters with no surrounding whitespace" });
  }
  if (habits.join(" · ") !== goalText || goalText.length > (rawHabits === undefined ? 120 : 501)) {
    return res.status(400).json({ error: "goalText must be the habits joined with · and be at most 501 characters" });
  }
  if (minMinutes !== undefined && !validMinMinutes(minMinutes)) return res.status(400).json({ error: "minMinutes must be a whole number from 1 to 720" });
  const info = await readOath(oath);
  if (!info) return res.status(404).json({ error: "Oath not found" });
  if (info.creator !== req.wallet || info.status !== 0) return res.status(403).json({ error: "Only the creator can save goal details while the Oath is Open" });
  if (createHash("sha256").update(goalText, "utf8").digest("hex") !== info.goalHash) return res.status(422).json({ error: "Goal text does not match the on-chain goal hash" });
  const row = await prisma.oathDetails.upsert({ where: { oath }, create: { oath, creator: req.wallet, goalText, habits, minMinutes: minMinutes ?? null }, update: { goalText, habits, ...(minMinutes !== undefined ? { minMinutes } : {}) } });
  return res.status(201).json({ oath, goalText, habits, minMinutes: row.minMinutes ?? config.sessionMinMinutes });
});

get("/api/oaths/:oath/details", async (req: AuthedRequest, res) => {
  const info = await readOath(req.params.oath);
  if (!info || !info.members.includes(req.wallet)) return res.status(403).json({ error: "Oath member access required" });
  const details = await prisma.oathDetails.findUnique({ where: { oath: req.params.oath } });
  const currentDay = info.status === 1 ? Math.floor((Math.floor(Date.now() / 1000) - info.startTs) / info.daySeconds) : -1;
  const nudged = currentDay >= 0 ? await prisma.nudge.findMany({ where: { oath: req.params.oath, sender: req.wallet, dayIndex: currentDay }, select: { recipient: true } }) : [];
  const targets = nudgeTargets({ status: info.status, members: info.members, daysKept: info.daysKept, viewer: req.wallet, currentDay, numDays: info.numDays, nudgedToday: nudged.map((n) => n.recipient) });
  const members = await Promise.all(targets.map(async (t) => {
    const [identity, reputation] = await Promise.all([identityFor(t.wallet), reputationFor(t.wallet)]);
    const { wallet: _i, ...identityOut } = identity;
    const { wallet: _r, ...reputationOut } = reputation;
    return { ...t, identity: identityOut, reputation: reputationOut };
  }));
  const configEconomics = await readConfigEconomics();
  const economics = oathEconomics(info, req.wallet, Math.floor(Date.now() / 1000), configEconomics?.legacyFeeBps ?? 0);
  return res.json({ goalText: details?.goalText ?? null, habits: details?.habits?.length ? details.habits : details?.goalText ? [details.goalText] : [], minMinutes: details?.minMinutes ?? config.sessionMinMinutes, dayIndex: currentDay, members, economics });
});

/** Terms a new Oath gets if created now. Existing Oaths keep the terms in their own account (see details). */
get("/api/economics", async (_req, res) => {
  const c = await readConfigEconomics();
  if (!c) return res.status(503).json({ error: "Program config is not readable" });
  // Every new Oath records rules v3 (DECISIONS D-93): stake only, no entry fee, no freezes.
  return res.json({
    rulesVersion: RULES_V3, entryFee: false, feeBps: 0, feeAmount: "0", freezePrice: null,
    missBps: MISS_BPS, forfeitureSplit: "equal shares between that day's keepers and KEPT; remainders to KEPT; a day nobody kept goes to KEPT",
    breakHoldBps: Number(BREAK_HOLD_BPS), heldWindowDays: HELD_WINDOW_DAYS,
  });
});

post("/api/proof/challenge", async (req: AuthedRequest, res) => {
  const { oath, dayIndex } = req.body ?? {};
  if (typeof oath !== "string" || !Number.isInteger(dayIndex)) return res.status(400).json({ error: "Expected oath and dayIndex" });
  const state = await readOath(oath);
  if (!state) return res.status(404).json({ error: "Oath not found" });
  const day = Number(dayIndex);
  const rejected = proofRejection({ status: state.status, member: state.members.includes(req.wallet), day, numDays: state.numDays, startTs: state.startTs, daySeconds: state.daySeconds, now: Math.floor(Date.now() / 1000), alreadyRecorded: (state.daysKept[req.wallet] & (1 << day)) !== 0 });
  if (rejected === "non_member") return res.status(403).json({ error: "Wallet is not an Oath member" });
  if (rejected) return res.status(409).json({ error: `No proof can be taken now (${rejected})` });
  return res.json(await dayChallenge(oath, req.wallet, day));
});

/** Photo 1 of 2: a passing check for the start challenge opens the session; the end photo opens after minMinutes. */
post("/api/proof/start", async (req: AuthedRequest, res) => {
  const { oath, dayIndex, verificationId } = req.body ?? {};
  if (typeof oath !== "string" || !Number.isInteger(dayIndex) || typeof verificationId !== "string") return res.status(400).json({ error: "Expected oath, dayIndex and verificationId from POST /proof/verify" });
  const state = await readOath(oath);
  if (!state) return res.status(404).json({ error: "Oath not found" });
  const day = Number(dayIndex);
  const rejected = proofRejection({ status: state.status, member: state.members.includes(req.wallet), day, numDays: state.numDays, startTs: state.startTs, daySeconds: state.daySeconds, now: Math.floor(Date.now() / 1000), alreadyRecorded: (state.daysKept[req.wallet] & (1 << day)) !== 0 });
  if (rejected === "non_member") return res.status(403).json({ error: "Wallet is not an Oath member" });
  if (rejected) return res.status(409).json({ error: `No proof can be taken now (${rejected})` });
  if (await findSession(oath, req.wallet, day)) return res.status(409).json({ error: "Today's start photo is already done" });
  const challenge = await currentChallenge(oath, req.wallet, day, null, CHALLENGE_UPLOAD_GRACE_MS);
  if (!challenge) return res.status(409).json({ error: "Gesture challenge expired; a new one is needed", challengeExpired: true });
  const object = dailyTarget(state.oathId, day, state.objectId).object;
  const minMinutes = (await prisma.oathDetails.findUnique({ where: { oath } }))?.minMinutes ?? config.sessionMinMinutes;
  const check = await claimVerification(verificationId, req.wallet, { object: OBJECT_TEXT[object], gesture: GESTURE_TEXT[challenge.gesture as ChallengeGesture] });
  if ("error" in check) return res.status(422).json({ error: check.error, expected: { object, gesture: challenge.gesture } });
  const started = await startSession(oath, req.wallet, day, { hash: check.verification.proofHash, gesture: challenge.gesture, verificationId: check.verification.id }, minMinutes, state.daySeconds).catch(async (e) => { await releaseVerification(check.verification.id); throw e; });
  if (!started) { await releaseVerification(check.verification.id); return res.status(409).json({ error: "Today's start photo is already done" }); }
  return res.status(201).json(started);
});

post("/api/proof", async (req: AuthedRequest, res) => {
  const { oath, dayIndex } = req.body ?? {};
  if (typeof oath !== "string" || !Number.isInteger(dayIndex)) return res.status(400).json({ error: "Expected oath and dayIndex" });
  // Exception to "proof needs a verificationId": group review after failed checks sends the photo instead.
  const kind = proofRequestKind(req.body);
  if ("error" in kind) return res.status(kind.status).json({ error: kind.error });
  const review = kind.kind === "review";
  const state = await readOath(oath);
  const day = Number(dayIndex);
  if (!state) return res.status(404).json({ error: "Oath not found" });
  let prior = await prisma.oathProof.findUnique({ where: { oath_wallet_dayIndex: { oath, wallet: req.wallet, dayIndex: day } } });
  if (prior?.status === "RECORDED") return res.status(409).json({ error: "Proof already recorded for this day" });
  if (review && prior?.status === "PENDING_REVIEW") return res.status(409).json({ error: "This photo is already waiting for your group" });
  if (review && (prior?.status === "PENDING" || prior?.status === "FAILED")) return res.status(409).json({ error: "A proof for this day is pending; retry the same photo check" });
  if (review && prior?.status === "REJECTED") return res.status(409).json({ error: "Your group rejected today's photo; take a new photo that passes the check" });
  const duplicate = (state.daysKept[req.wallet] & (1 << day)) !== 0 && prior?.status !== "PENDING";
  const rejected = proofRejection({ status: state.status, member: state.members.includes(req.wallet), day, numDays: state.numDays, startTs: state.startTs, daySeconds: state.daySeconds, now: Math.floor(Date.now()/1000), alreadyRecorded: duplicate });
  if (rejected === "non_member") return res.status(403).json({ error: "Wallet is not an Oath member" });
  if (rejected === "not_active") return res.status(409).json({ error: "Oath is not active" });
  if (rejected === "wrong_day") return res.status(400).json({ error: "Wrong day" });
  if (rejected === "outside_day_window") return res.status(409).json({ error: "Proof is outside today's day window" });
  if (rejected === "duplicate") return res.status(409).json({ error: "Proof already recorded for this day" });
  // Photo 2 of 2: needs today's start photo, the wait over (server time), and a fresh end challenge.
  const session = await findSession(oath, req.wallet, day);
  const phase = sessionPhase(session, Date.now());
  if (phase === "start") return res.status(409).json({ error: "Take today's start photo first (POST /api/proof/start)", phase });
  if (phase === "wait") return res.status(409).json({ error: "The end photo is not open yet", phase, endAllowedAt: session!.endAllowedAt.toISOString() });
  const challenge = await currentChallenge(oath, req.wallet, day, session, CHALLENGE_UPLOAD_GRACE_MS);
  if (!challenge) return res.status(409).json({ error: "Gesture challenge expired; a new one is needed", challengeExpired: true });
  const expected = { ...dailyTarget(state.oathId, day, state.objectId), gesture: challenge.gesture };
  // Failed checks are counted by the server from POST /proof/verify rows; the app's own count is ignored.
  const failures = await loadReviewFailures({ wallet: req.wallet, oath, dayIndex: day, session: session!, object: OBJECT_TEXT[expected.object], gesture: GESTURE_TEXT[expected.gesture as ChallengeGesture] });
  const failedAttempts = failures.length;
  if (review) return submitForReview();

  // Normal path: the photo already passed POST /proof/verify; only its hash goes on-chain.
  const verifier = config.verifierSecretKey ? keypairFromEnv(config.verifierSecretKey) : null;
  if (!verifier) return res.status(503).json({ error: "Verifier key is not configured" });
  const check = await claimVerification(req.body.verificationId, req.wallet, { object: OBJECT_TEXT[expected.object], gesture: GESTURE_TEXT[expected.gesture as ChallengeGesture] });
  if ("error" in check) return res.status(422).json({ error: check.error, expected });
  const v = check.verification;
  if (prior && (prior.status === "PENDING_REVIEW" || prior.status === "REJECTED")) {
    // A photo that passes the check replaces one waiting for (or rejected by) the group.
    if (prior.photoPath) await unlink(path.join(config.proofStorageDir, prior.photoPath)).catch(() => undefined);
    await prisma.proofReview.deleteMany({ where: { proofId: prior.id } });
    await prisma.oathProof.delete({ where: { id: prior.id } });
    prior = null;
  }
  const dayHash = combinedProofHash(session!.startHash, v.proofHash);
  // A FAILED check-in never landed, so a new photo may replace it; a PENDING one may still land.
  if (prior?.status === "PENDING" && prior.proofHash !== dayHash) { await releaseVerification(v.id); return res.status(409).json({ error: "A proof for this day is pending; retry the same photo check" }); }
  const proofHash = Buffer.from(dayHash, "hex");
  try {
    if (prior?.status === "PENDING" && prior.signature && prior.signature !== "pending") {
      const confirmation = await connection.confirmTransaction(prior.signature, "confirmed");
      if (confirmation.value.err) throw new Error(`Verifier check-in failed: ${JSON.stringify(confirmation.value.err)}`);
      await prisma.oathProof.update({ where: { id: prior.id }, data: { status: "RECORDED" } });
      return res.status(200).json({ signature: prior.signature, proofHash: prior.proofHash, target: expected, recovered: true });
    }
    const data = { proofHash: dayHash, photoPath: "", objectLabel: expected.object, objectConfidence: v.objectConfidence, gestureLabel: v.gestureSeen, gestureConfidence: v.gestureMatches ? 1 : 0, challengeGesture: challenge.gesture, failedAttempts, signature: "pending", status: "PENDING" };
    const row = prior ? await prisma.oathProof.update({ where: { id: prior.id }, data }) : await prisma.oathProof.create({ data: { oath, wallet: req.wallet, dayIndex: day, ...data } });
    const signature = await recordCheckin(verifier, new PublicKey(oath), new PublicKey(req.wallet), day, proofHash, async (sig) => {
      await prisma.oathProof.update({ where: { id: row.id }, data: { signature: sig } });
    });
    await prisma.oathProof.update({ where: { id: row.id }, data: { status: "RECORDED", signature } });
    return res.status(prior ? 200 : 201).json({ signature, proofHash: dayHash, startHash: session!.startHash, endHash: v.proofHash, target: expected });
  } catch (e) {
    // Not recorded: free the check so a retry with it can resume the pending check-in.
    await releaseVerification(v.id);
    const message=e instanceof Error?e.message:"Proof submission failed";
    if(message.includes("Verifier check-in failed:")) await prisma.oathProof.updateMany({where:{oath,wallet:req.wallet,dayIndex:day,status:"PENDING"},data:{status:"FAILED"}}).catch(()=>undefined);
    return res.status(502).json({ error: message, retryable: true });
  }

  /**
   * After 3 failed checks of this end photo in a group Oath: store the photo for members to approve; nothing
   * goes on-chain yet. The photo must be one the server saw fail, and its detected labels come from that check.
   */
  async function submitForReview() {
    const bytes = Buffer.from(String(req.body.photo).replace(/^data:image\/(jpeg|jpg|png);base64,/, ""), "base64");
    const photoHash = hashBytes(bytes);
    const refused = reviewRequestRejection({ isSolo: state!.isSolo, failures, photoHash, photoBytes: bytes.length, priorStatus: prior?.status ?? null });
    if (refused) return res.status(refused.status).json({ error: refused.error, failedChecks: failedAttempts, ...(refused.status === 422 ? { expected } : {}) });
    const failed = failures.find((f) => f.proofHash === photoHash)!;
    const file = `${hashBytes(Buffer.from(`${oath}:${req.wallet}:${day}`))}.jpg`;
    await mkdir(config.proofStorageDir, { recursive: true });
    await writeFile(path.join(config.proofStorageDir, file), bytes, { flag: "w" });
    const row = await prisma.oathProof.create({ data: {
      oath, wallet: req.wallet, dayIndex: day, proofHash: photoHash, photoPath: file, signature: "", status: "PENDING_REVIEW", challengeGesture: challenge!.gesture, failedAttempts,
      objectLabel: failed.objectPresent ? expected.object : "", objectConfidence: failed.objectConfidence, gestureLabel: failed.gestureSeen, gestureConfidence: failed.gestureMatches ? 1 : 0,
    } });
    for (const member of state!.members.filter((m) => m !== req.wallet)) {
      await pushToWallet(member, { title: "A photo needs a check", body: `${shortWallet(req.wallet)}'s photo needs a check. Approve or reject it in KEPT.`, oath, dayIndex: String(day) }).catch((e) => console.error("[push] review request failed", e));
    }
    return res.status(202).json({ status: "PENDING_REVIEW", proofId: row.id, proofHash: row.proofHash, target: expected });
  }
});

get("/api/oaths/:oath/reviews", async (req: AuthedRequest, res) => {
  const info = await readOath(req.params.oath);
  if (!info || !info.members.includes(req.wallet)) return res.status(403).json({ error: "Oath member access required" });
  // record_checkin only accepts the current day, so older pending photos can no longer be approved.
  const currentDay = Math.floor((Math.floor(Date.now() / 1000) - info.startTs) / info.daySeconds);
  const rows = info.status === 1 ? await prisma.oathProof.findMany({ where: { oath: req.params.oath, status: "PENDING_REVIEW", dayIndex: currentDay }, orderBy: { createdAt: "asc" } }) : [];
  const votes = await prisma.proofReview.findMany({ where: { proofId: { in: rows.map((r) => r.id) } } });
  return res.json({ reviews: await Promise.all(rows.map(async (p) => {
    const mine = votes.find((v) => v.proofId === p.id && v.reviewer === req.wallet);
    const image = p.photoPath ? await readFile(path.join(config.proofStorageDir, p.photoPath)).then((b) => `data:image/jpeg;base64,${b.toString("base64")}`).catch(() => null) : null;
    return { id: p.id, wallet: p.wallet, dayIndex: p.dayIndex, proofHash: p.proofHash, object: dailyTarget(info.oathId, p.dayIndex, info.objectId).object, gesture: p.challengeGesture,
      detected: { object: p.objectLabel, objectConfidence: p.objectConfidence, gesture: p.gestureLabel, gestureConfidence: p.gestureConfidence },
      approvals: votes.filter((v) => v.proofId === p.id && v.approve).length, rejections: votes.filter((v) => v.proofId === p.id && !v.approve).length,
      reviewers: info.members.length - 1, myVote: mine ? (mine.approve ? "approve" : "reject") : null, canReview: p.wallet !== req.wallet && !mine, image };
  })) });
});

post("/api/reviews/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || typeof req.body?.approve !== "boolean") return res.status(400).json({ error: "Expected a review id and approve: true/false" });
  const proof = await prisma.oathProof.findUnique({ where: { id } });
  if (!proof || proof.status !== "PENDING_REVIEW") return res.status(404).json({ error: "No photo is waiting for review" });
  const info = await readOath(proof.oath);
  if (!info || !info.members.includes(req.wallet) || proof.wallet === req.wallet) return res.status(403).json({ error: "Only other Oath members can check this photo" });
  const currentDay = Math.floor((Math.floor(Date.now() / 1000) - info.startTs) / info.daySeconds);
  if (info.status !== 1 || proof.dayIndex !== currentDay) return res.status(409).json({ error: "That Oath day has ended, so the photo can no longer be approved" });
  try { await prisma.proofReview.create({ data: { proofId: id, reviewer: req.wallet, approve: req.body.approve } }); }
  catch { return res.status(409).json({ error: "You have already checked this photo" }); }
  const votes = await prisma.proofReview.findMany({ where: { proofId: id } });
  const outcome = reviewOutcome({ approvals: votes.filter((v) => v.approve).length, rejections: votes.filter((v) => !v.approve).length, reviewers: info.members.length - 1 });
  if (!outcome) return res.status(201).json({ status: "PENDING_REVIEW" });
  if (outcome === "rejected") {
    const moved = await prisma.oathProof.updateMany({ where: { id, status: "PENDING_REVIEW" }, data: { status: "REJECTED" } });
    if (moved.count) await deleteProofPhoto(proof);
    if (moved.count) await pushToWallet(proof.wallet, { title: "Photo not approved", body: "Your group did not approve today's photo.", oath: proof.oath, dayIndex: String(proof.dayIndex) }).catch(() => undefined);
    return res.status(201).json({ status: "REJECTED" });
  }
  // Claim the transition so concurrent approvals cannot submit record_checkin twice.
  const claimed = await prisma.oathProof.updateMany({ where: { id, status: "PENDING_REVIEW" }, data: { status: "PENDING", signature: "pending" } });
  if (!claimed.count) return res.status(201).json({ status: "PENDING" });
  if (info.daysKept[proof.wallet] & (1 << proof.dayIndex)) {
    await prisma.oathProof.update({ where: { id }, data: { status: "RECORDED" } });
    await deleteProofPhoto(proof);
    return res.status(201).json({ status: "RECORDED" });
  }
  const verifier = config.verifierSecretKey ? keypairFromEnv(config.verifierSecretKey) : null;
  try {
    if (!verifier) throw new Error("Verifier key is not configured");
    // The group approved the end photo; the day's on-chain hash still covers the start photo too.
    const session = await findSession(proof.oath, proof.wallet, proof.dayIndex);
    if (!session) throw new Error("This day has no start photo");
    const dayHash = combinedProofHash(session.startHash, proof.proofHash);
    const signature = await recordCheckin(verifier, new PublicKey(proof.oath), new PublicKey(proof.wallet), proof.dayIndex, Buffer.from(dayHash, "hex"), async (sig) => {
      await prisma.oathProof.update({ where: { id }, data: { signature: sig } });
    });
    await prisma.oathProof.update({ where: { id }, data: { status: "RECORDED", signature } });
    await deleteProofPhoto(proof);
    await pushToWallet(proof.wallet, { title: "Day kept", body: "Your group approved today's photo.", oath: proof.oath, dayIndex: String(proof.dayIndex) }).catch(() => undefined);
    return res.status(201).json({ status: "RECORDED", signature });
  } catch (e) {
    // Let the deciding reviewer retry: undo their vote and put the photo back in review.
    await prisma.oathProof.update({ where: { id }, data: { status: "PENDING_REVIEW", signature: "" } });
    await prisma.proofReview.deleteMany({ where: { proofId: id, reviewer: req.wallet } });
    return res.status(502).json({ error: e instanceof Error ? e.message : "Recording the approved check-in failed", retryable: true });
  }
});

post("/api/push-token", async (req: AuthedRequest, res) => {
  if (typeof req.body?.token !== "string" || req.body.token.length > 4096) return res.status(400).json({ error: "Invalid device token" });
  await prisma.deviceToken.upsert({ where: { token: req.body.token }, create: { token: req.body.token, wallet: req.wallet }, update: { wallet: req.wallet } });
  return res.status(204).end();
});

post("/api/nudges", async (req: AuthedRequest, res) => {
  const { oath, recipient, dayIndex } = req.body ?? {};
  const info = await readOath(oath);
  if (!info || info.status !== 1) return res.status(403).json({ error: "Invalid Oath or status" });
  const currentDay=Math.floor((Math.floor(Date.now()/1000)-info.startTs)/info.daySeconds);
  const rejection=nudgeRejection({member:info.members.includes(req.wallet),recipientMember:info.members.includes(recipient),self:req.wallet===recipient,day:Number(dayIndex),currentDay,alreadyCheckedIn:(info.daysKept[recipient]&(1<<Number(dayIndex)))!==0});
  if(rejection==="wrong_day")return res.status(400).json({error:"Nudges are limited to today's Oath day"});
  if(rejection==="already_checked_in")return res.status(409).json({error:"That member has already checked in"});
  if(rejection)return res.status(403).json({error:"Invalid Oath member"});
  try {
    await prisma.nudge.create({ data: { oath, sender: req.wallet, recipient, dayIndex: Number(dayIndex) } });
    await pushToWallet(recipient, { title: "A friend nudged you", body: "Your Oath check-in is still waiting today.", oath, dayIndex: String(dayIndex) }).catch((e) => console.error("[push] nudge delivery failed", e));
    return res.status(201).json({ ok: true });
  } catch { return res.status(429).json({ error: "You have already nudged this member today" }); }
});

get("/api/price", async (_req, res) => res.json({ usdPerSkr: 0.01, skrForUsd10: 1000, devnet: true, label: "placeholder rate" }));

/** Today's object is fixed per Oath; the gesture comes from a per-photo challenge. */
export function dailyTarget(_oathId: string, _day: number, objectId: number) {
  return { object: OBJECT_IDS[objectId] ?? OBJECT_IDS[0] };
}

const shortWallet = (wallet: string) => `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;

let fcmAccess: { token: string; expiresAt: number } | null = null;
async function fcmToken(): Promise<string | null> {
  if (!config.fcmServiceAccountJson) return null;
  if (fcmAccess && fcmAccess.expiresAt > Date.now() + 30_000) return fcmAccess.token;
  const sa = JSON.parse(config.fcmServiceAccountJson) as { client_email: string; private_key: string; project_id: string };
  const b64 = (v: string) => Buffer.from(v).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const input = `${head}.${claim}`;
  const signer = createSign("RSA-SHA256"); signer.update(input);
  const assertion = `${input}.${signer.sign(sa.private_key).toString("base64url")}`;
  const result = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!result.ok) throw new Error(`FCM OAuth failed: ${result.status}`);
  const body = await result.json() as { access_token: string; expires_in: number };
  fcmAccess = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function pushToWallet(wallet: string, data: Record<string, string>) {
  if (!config.fcmServiceAccountJson) return;
  const service = JSON.parse(config.fcmServiceAccountJson) as { project_id: string };
  const token = await fcmToken();
  const devices = await prisma.deviceToken.findMany({ where: { wallet } });
  for (const d of devices) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${service.project_id}/messages:send`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message: { token: d.token, notification: { title: data.title, body: data.body }, data } }),
    });
    if (!r.ok) console.error("[push] FCM rejected message", r.status, await r.text());
  }
}

export type JobReport = {
  startedAt: string;
  finishedAt: string;
  oaths: number;
  missedMarked: number;
  settled: Array<{ oath: string; signature: string }>;
  carryoverSwept: Array<{ oath: string; signature: string; amount: string }>;
  heldSwept: Array<{ oath: string; signature: string; amount: string }>;
  finished: string[];
  reviewPhotosDeleted: number;
  errors: Array<{ oath: string; error: string }>;
  bounties: BountyJobReport[];
};

let jobsInFlight: Promise<JobReport> | null = null;

/**
 * The only backend path that marks missed days and settles Oaths. Concurrent callers (the timer and
 * POST /admin/run-jobs) share one run, and on-chain status is re-read per Oath, so nothing settles twice.
 */
export function runV4Jobs(): Promise<JobReport> {
  jobsInFlight ??= runJobsOnce().finally(() => { jobsInFlight = null; });
  return jobsInFlight;
}

export function startV4Scheduler() {
  const tick = () => void runV4Jobs().catch((e) => console.error("[v4] scheduler failed:", e));
  tick();
  setInterval(tick, 60_000).unref();
}

async function runJobsOnce(): Promise<JobReport> {
  const report: JobReport = { startedAt: new Date().toISOString(), finishedAt: "", oaths: 0, missedMarked: 0, settled: [], carryoverSwept: [], heldSwept: [], finished: [], errors: [], bounties: [], reviewPhotosDeleted: 0 };
  const watches = await prisma.oathWatch.findMany({ where: { finishedAt: null } });
  report.oaths = watches.length;
  for (const w of watches) {
    try { await runOathJobs(w, report); }
    catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      report.errors.push({ oath: w.oath, error });
      console.error(`[v4] job failed ${w.oath}:`, error);
    }
  }
  report.bounties = await runBountyJobs();
  report.reviewPhotosDeleted = await expireReviewPhotos();
  report.finishedAt = new Date().toISOString();
  return report;
}

async function runOathJobs(w: { id: number; oath: string; missedThrough: number }, report: JobReport) {
  const oath = await readOath(w.oath);
  if (!oath) return;
  const now = Math.floor(Date.now() / 1000);

  // Record misses once each day closes. Settled Oaths have final day bits for every day.
  if (oath.status === 1 || oath.status === 2) {
    let through = oath.status === 2 ? oath.numDays - 1 : lastClosedDay(oath, now);
    // A broken rules v3 Oath ends on the breaking day: later days were never played.
    const broke = oath.rulesVersion === RULES_V3 ? replayV3(BigInt(oath.stakeAmount), oath.terms.missBps || MISS_BPS, oath.isSolo, oath.members.map((m) => oath.daysKept[m] ?? 0), oath.numDays)?.brokeDay ?? null : null;
    if (broke !== null) through = Math.min(through, broke);
    if (through > w.missedThrough) {
      const misses = missedDays(oath.daysKept, w.missedThrough, through);
      const created = misses.length ? await prisma.missedDay.createMany({ data: misses.map((m) => ({ oath: w.oath, ...m })), skipDuplicates: true }) : { count: 0 };
      await prisma.oathWatch.update({ where: { id: w.id }, data: { missedThrough: through } });
      report.missedMarked += created.count;
    }
    // A freeze covers a day after it closed (rules v2): its miss row stays, flagged as covered.
    for (const f of frozenDayList(oath.members, oath.rulesVersion === RULES_V2 ? oath.terms.frozenDays : [])) {
      await prisma.missedDay.upsert({ where: { oath_wallet_dayIndex: { oath: w.oath, ...f } }, create: { oath: w.oath, ...f, frozen: true }, update: { frozen: true } });
    }
  }

  let status = oath.status;
  if (status === 1) {
    const day = Math.floor((now - oath.startTs) / oath.daySeconds);
    const secondsLeft = oath.startTs + (day + 1) * oath.daySeconds - now;
    if (day >= 0 && day < oath.numDays && secondsLeft <= 7200 && secondsLeft > 0 && config.fcmServiceAccountJson) {
      for (const wallet of oath.members) {
        if (oath.daysKept[wallet] & (1 << day)) continue;
        try {
          await prisma.reminderSent.create({ data: { oath: w.oath, wallet, dayIndex: day } });
          await pushToWallet(wallet, { title: "Your KEPT check-in is due", body: "Two hours remain in today's Oath day.", oath: w.oath, dayIndex: String(day) });
        } catch { /* already reminded or delivery unavailable */ }
      }
    }
    if (now >= settleDueAt(oath)) {
      // Reminders and miss marking above take time, and a member may settle from their wallet meanwhile:
      // re-read the account right before settling and skip if it is no longer Active.
      const fresh = await readOath(w.oath);
      const decision = settleDecision(fresh, Math.floor(Date.now() / 1000));
      if (decision === "settle") {
        const signature = await settleOnChain(w.oath, fresh!);
        await prisma.oathWatch.update({ where: { id: w.id }, data: { settleSignature: signature } });
        report.settled.push({ oath: w.oath, signature });
        console.log(`[v4] settled ${w.oath}: ${signature}`);
        status = 2;
      } else {
        console.log(`[v4] not settling ${w.oath}: ${decision}`);
        status = fresh?.status ?? status;
      }
    }
  }

  // Rules v2 and v3: copy the settlement accounting from chain. v2 then moves any carryover to the reserve; v3 releases the
  // held half of a broken Oath to the treasury once its window has passed. Each step re-reads the account first, so retries
  // and restarts neither double-record nor double-send (the program refuses a second sweep).
  let sweepPending = false;
  if (status === 2 && (oath.rulesVersion === RULES_V2 || oath.rulesVersion === RULES_V3)) {
    let settled = await readOath(w.oath);
    if (settled?.status === 2) await recordSettlement(w.oath, settled);
    if (needsCarryoverSweep(settled)) {
      const signature = await sweepCarryoverOnChain(w.oath, settled!, async (sig) => { await prisma.oathWatch.update({ where: { id: w.id }, data: { sweepSignature: sig } }); });
      report.carryoverSwept.push({ oath: w.oath, signature, amount: settled!.terms.carryover });
      settled = await readOath(w.oath);
      if (settled?.status === 2) await recordSettlement(w.oath, settled);
    }
    if (needsHeldSweep(settled, Math.floor(Date.now() / 1000))) {
      const signature = await sweepHeldOnChain(w.oath, settled!, async (sig) => { await prisma.oathWatch.update({ where: { id: w.id }, data: { sweepSignature: sig } }); });
      report.heldSwept.push({ oath: w.oath, signature, amount: settled!.terms.heldTotal });
      settled = await readOath(w.oath);
      if (settled?.status === 2) await recordSettlement(w.oath, settled);
    }
    sweepPending = needsCarryoverSweep(settled) || heldSweepPending(settled);
  }

  // Settled (by this job or a member's wallet) or cancelled: delete photos once and stop watching.
  if ((status === 2 || status === 3) && !sweepPending) {
    const proofs = await prisma.oathProof.findMany({ where: { oath: w.oath, photoPath: { not: "" } } });
    for (const proof of proofs) await unlink(path.join(config.proofStorageDir, proof.photoPath)).catch(() => undefined);
    if (proofs.length) await prisma.oathProof.updateMany({ where: { oath: w.oath }, data: { photoPath: "" } });
    await prisma.oathWatch.update({ where: { id: w.id }, data: { finishedAt: new Date() } });
    report.finished.push(w.oath);
  }
}

/** Deletes a stored group-review photo and clears its path; the hash and decision stay. */
async function deleteProofPhoto(proof: { id: number; photoPath: string }) {
  if (!proof.photoPath) return;
  await unlink(path.join(config.proofStorageDir, proof.photoPath)).catch(() => undefined);
  await prisma.oathProof.update({ where: { id: proof.id }, data: { photoPath: "" } });
}

/** Review photos the group never decided on are deleted after 48 h (the review can no longer be used by then). */
async function expireReviewPhotos(): Promise<number> {
  const stale = await prisma.oathProof.findMany({ where: { photoPath: { not: "" }, createdAt: { lte: new Date(Date.now() - REVIEW_PHOTO_TTL_MS) } } });
  let deleted = 0;
  for (const proof of stale) {
    if (!reviewPhotoExpired(proof.createdAt, Date.now())) continue;
    await deleteProofPhoto(proof);
    if (proof.status === "PENDING_REVIEW") await prisma.oathProof.update({ where: { id: proof.id }, data: { status: "EXPIRED" } });
    deleted++;
  }
  return deleted;
}

/** Saves the chain's settlement accounting for a settled rules v2 Oath (idempotent upsert). */
async function recordSettlement(address: string, oath: OathRead) {
  const t = oath.terms;
  const row = {
    rulesVersion: t.rulesVersion, feeBps: t.feeBps, stakeAmount: BigInt(oath.stakeAmount), memberCount: oath.members.length,
    feesCollected: BigInt(t.feesCollected), freezeProceeds: BigInt(t.freezeProceeds),
    payoutsTotal: oath.members.reduce((sum, m) => sum + BigInt(oath.payouts[m] ?? "0"), 0n),
    treasuryPaid: BigInt(t.treasuryPaid), dust: BigInt(t.dust), carryover: BigInt(t.carryover), carryoverSwept: t.carryoverSwept,
  };
  await prisma.oathSettlement.upsert({ where: { oath: address }, create: { oath: address, ...row }, update: row });
}

/** Sends sweep_carryover. The program refuses a second sweep, so a retry after an unseen success cannot move funds twice. */
async function sweepCarryoverOnChain(address: string, oath: OathRead, onSubmitted: (signature: string) => Promise<void>) {
  if (!config.verifierSecretKey || !config.stakeMint) throw new Error("Carryover signer/mint is not configured");
  const signer = keypairFromEnv(config.verifierSecretKey);
  const oathPk = new PublicKey(address), mint = new PublicKey(config.stakeMint);
  const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), oathPk.toBuffer()], programId)[0];
  const reserve = PublicKey.findProgramAddressSync([Buffer.from("carryover"), mint.toBuffer()], programId)[0];
  const tokenProgram = await tokenProgramForMint(mint);
  const keys = [
    { pubkey: configPda, isSigner: false, isWritable: true }, { pubkey: oathPk, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true }, { pubkey: reserve, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: tokenProgram, isSigner: false, isWritable: false },
  ];
  const data = createHash("sha256").update("global:sweep_carryover").digest().subarray(0, 8);
  const sig = await connection.sendTransaction(new Transaction().add(new TransactionInstruction({ programId, keys, data })), [signer]);
  await onSubmitted(sig);
  const confirmed = await connection.confirmTransaction(sig, "confirmed");
  if (confirmed.value.err) throw new Error(`sweep_carryover failed: ${JSON.stringify(confirmed.value.err)} (carryover ${oath.terms.carryover})`);
  return sig;
}

/** The treasury token account the program is configured with (Config.treasury); settle and sweep_held must pass exactly it. */
async function configuredTreasury(): Promise<PublicKey> {
  const account = await connection.getAccountInfo(configPda, "confirmed");
  if (account && account.owner.equals(programId) && account.data.length >= CONFIG_BASE_LEN) return new PublicKey(account.data.subarray(72, 104));
  if (!config.treasuryTokenAccount) throw new Error("TREASURY_TOKEN_ACCOUNT is not configured");
  return new PublicKey(config.treasuryTokenAccount);
}

/** Sends sweep_held (rules v3): the held half of a broken Oath goes to the treasury after its window. The program refuses a second sweep. */
async function sweepHeldOnChain(address: string, oath: OathRead, onSubmitted: (signature: string) => Promise<void>) {
  if (!config.verifierSecretKey || !config.stakeMint) throw new Error("Sweep signer/mint is not configured");
  const signer = keypairFromEnv(config.verifierSecretKey);
  const oathPk = new PublicKey(address), mint = new PublicKey(config.stakeMint);
  const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), oathPk.toBuffer()], programId)[0];
  const tokenProgram = await tokenProgramForMint(mint);
  const keys = [
    { pubkey: configPda, isSigner: false, isWritable: false }, { pubkey: oathPk, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true }, { pubkey: await configuredTreasury(), isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: tokenProgram, isSigner: false, isWritable: false },
  ];
  const data = createHash("sha256").update("global:sweep_held").digest().subarray(0, 8);
  const sig = await connection.sendTransaction(new Transaction().add(new TransactionInstruction({ programId, keys, data })), [signer]);
  await onSubmitted(sig);
  const confirmed = await connection.confirmTransaction(sig, "confirmed");
  if (confirmed.value.err) throw new Error(`sweep_held failed: ${JSON.stringify(confirmed.value.err)} (held ${oath.terms.heldTotal})`);
  return sig;
}

async function settleOnChain(address: string, oath: OathRead) {
  if (!config.verifierSecretKey || !config.stakeMint) throw new Error("Settlement signer/mint is not configured");
  const signer = keypairFromEnv(config.verifierSecretKey);
  const oathPk = new PublicKey(address), mint = new PublicKey(config.stakeMint);
  const vault = PublicKey.findProgramAddressSync([Buffer.from("vault"), oathPk.toBuffer()], programId)[0];
  const treasury = await configuredTreasury();
  const tokenProgram = await tokenProgramForMint(mint);
  const keys = [
    { pubkey: configPda, isSigner: false, isWritable: false }, { pubkey: oathPk, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true }, { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: tokenProgram, isSigner: false, isWritable: false },
    ...oath.members.map((wallet) => ({ pubkey: PublicKey.findProgramAddressSync([Buffer.from("keeper"), new PublicKey(wallet).toBuffer()], programId)[0], isSigner: false, isWritable: true })),
  ];
  const data = createHash("sha256").update("global:settle_oath").digest().subarray(0, 8);
  const tx = new Transaction().add(new TransactionInstruction({ programId, keys, data }));
  const sig = await connection.sendTransaction(tx, [signer]);
  const confirmed = await connection.confirmTransaction(sig, "confirmed");
  if (confirmed.value.err) throw new Error(`settle_oath failed: ${JSON.stringify(confirmed.value.err)}`);
  return sig;
}




type OathRead = {
  oathId: string; creator: string; goalHash: string; status: number; isSolo: boolean; startTs: number; daySeconds: number; numDays: number; objectId: number;
  members: string[]; daysKept: Record<string, number>;
  /** Base units as strings. `payouts` is what each member can claim once settled or cancelled. */
  stakeAmount: string; payouts: Record<string, string>; claimed: Record<string, boolean>;
  /** Rules the Oath was created under (rules v1 for accounts that predate terms). */
  terms: OathTerms; rulesVersion: number;
};
async function readOath(address: string): Promise<OathRead | null> {
  try {
    const pk = new PublicKey(address);
    const account = await connection.getAccountInfo(pk, "confirmed");
    if (!account || !account.owner.equals(programId)) return null;
    const d = account.data;
    if (d.length < 316 || !d.subarray(0, 8).equals(createHash("sha256").update("account:Oath").digest().subarray(0, 8))) return null;
    const oathId = d.readBigUInt64LE(40).toString();
    const objectId = d[120], numDays = d[121], daySeconds = d.readUInt32LE(122), startTs = Number(d.readBigInt64LE(126)), status = d[136], count = d[138];
    const terms = decodeOathTerms(d);
    if (!terms) return null;
    const members: string[] = [], daysKept: Record<string, number> = {}, payouts: Record<string, string> = {}, claimed: Record<string, boolean> = {};
    for (let i = 0; i < count; i++) {
      const o = 139 + i * 44; const wallet = new PublicKey(d.subarray(o, o + 32)).toBase58();
      members.push(wallet); daysKept[wallet] = d.readUInt16LE(o + 33); claimed[wallet] = d[o + 35] === 1; payouts[wallet] = d.readBigUInt64LE(o + 36).toString();
    }
    return { oathId, creator: new PublicKey(d.subarray(8, 40)).toBase58(), goalHash: d.subarray(88, 120).toString("hex"), status, isSolo: d[137] === 1, startTs, daySeconds, numDays, objectId, members, daysKept,
      stakeAmount: d.readBigUInt64LE(48).toString(), payouts, claimed, terms, rulesVersion: terms.rulesVersion };
  } catch { return null; }
}

/** Config's fee settings: the rules v1 fee and, once configured, the rules v2 economics. */
async function readConfigEconomics() {
  const account = await connection.getAccountInfo(configPda, "confirmed");
  if (!account || !account.owner.equals(programId) || account.data.length < CONFIG_BASE_LEN) return null;
  return decodeConfigEconomics(Buffer.from(account.data));
}

async function recordCheckin(verifier: Keypair, oath: PublicKey, member: PublicKey, day: number, proofHash: Buffer, onSubmitted: (signature: string) => Promise<void>) {
  const disc = createHash("sha256").update("global:record_checkin").digest().subarray(0, 8);
  const ix = new TransactionInstruction({ programId, keys: [
    { pubkey: configPda, isSigner: false, isWritable: false }, { pubkey: oath, isSigner: false, isWritable: true },
    { pubkey: verifier.publicKey, isSigner: true, isWritable: false }, { pubkey: member, isSigner: false, isWritable: false },
  ], data: Buffer.concat([disc, Buffer.from([day]), proofHash]) });
  const tx = new Transaction().add(ix);
  const sig = await connection.sendTransaction(tx, [verifier]);
  await onSubmitted(sig);
  const confirmation = await connection.confirmTransaction(sig, "confirmed");
  if (confirmation.value.err) throw new Error(`Verifier check-in failed: ${JSON.stringify(confirmation.value.err)}`);
  return sig;
}
