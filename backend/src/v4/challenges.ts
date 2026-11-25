import { prisma } from "../db.js";
import { CHALLENGE_GESTURES, challengeUsable, CHALLENGE_TTL_MS, pickChallenge } from "./rules.js";
import { endChallengeValid, sessionPhase, sessionWaitSeconds } from "./session.js";
import { slotChallenge } from "./keeper.js";

type Challenge = { gesture: string; issuedAt: Date; slot?: number | null; blockhash?: string | null };
type Session = NonNullable<Awaited<ReturnType<typeof prisma.proofSession.findUnique>>>;

/** Challenges are keyed by an Oath address, or `bounty:<id>` for bounties. */
export function latestChallenge(key: string, wallet: string, dayIndex: number) {
  return prisma.gestureChallenge.findFirst({ where: { oath: key, wallet, dayIndex }, orderBy: { issuedAt: "desc" } });
}

/**
 * The current challenge while it lasts (and is still an allowed gesture); otherwise a new one that differs
 * from the previous gesture. For an end photo, only a challenge issued after the wait with a gesture other
 * than the start photo's counts.
 */
export async function issueChallenge(key: string, wallet: string, dayIndex: number, session: Session | null = null): Promise<Challenge> {
  const latest = await latestChallenge(key, wallet, dayIndex);
  const allowed = latest && CHALLENGE_GESTURES.includes(latest.gesture as (typeof CHALLENGE_GESTURES)[number]) && challengeUsable(latest.issuedAt.getTime(), Date.now());
  if (allowed && (!session || endChallengeValid(latest, session))) return latest;
  const exclude = session ? session.startGesture : latest?.gesture ?? null;
  // The gesture comes from the latest Solana blockhash (not from the server's choice), so a photo that shows it was taken after that slot.
  const { gesture, slot, blockhash } = await slotChallenge(CHALLENGE_GESTURES.filter((g) => g !== exclude), () => pickChallenge(exclude));
  return prisma.gestureChallenge.create({ data: { oath: key, wallet, dayIndex, gesture, slot, blockhash } });
}

export function challengeJson(c: Challenge) {
  return { gesture: c.gesture, issuedAt: c.issuedAt.toISOString(), expiresAt: new Date(c.issuedAt.getTime() + CHALLENGE_TTL_MS).toISOString(), slot: c.slot ?? null };
}

export function findSession(key: string, wallet: string, dayIndex: number) {
  return prisma.proofSession.findUnique({ where: { key_wallet_dayIndex: { key, wallet, dayIndex } } });
}

const sessionJson = (s: Session) => ({ startedAt: s.startedAt.toISOString(), endAllowedAt: s.endAllowedAt.toISOString(), startGesture: s.startGesture });

/** Today's step: the start or end challenge, or how long to wait before the end photo opens. */
export async function dayChallenge(key: string, wallet: string, dayIndex: number) {
  const session = await findSession(key, wallet, dayIndex);
  const phase = sessionPhase(session, Date.now());
  if (phase === "wait") return { phase, photo: 2, ...sessionJson(session!), waitSeconds: Math.ceil((session!.endAllowedAt.getTime() - Date.now()) / 1000) };
  const challenge = await issueChallenge(key, wallet, dayIndex, session);
  return { phase, photo: phase === "start" ? 1 : 2, ...challengeJson(challenge), ...(session ? sessionJson(session) : {}) };
}

/** The usable challenge for the photo being submitted now, given the day's session (null = start photo). */
export async function currentChallenge(key: string, wallet: string, dayIndex: number, session: Session | null, graceMs: number) {
  const c = await latestChallenge(key, wallet, dayIndex);
  if (!c || !challengeUsable(c.issuedAt.getTime(), Date.now(), graceMs)) return null;
  if (session && !endChallengeValid(c, session)) return null;
  return c;
}

/** Records a passed start photo; the end photo opens after the wait. Null if today already has one. */
export async function startSession(key: string, wallet: string, dayIndex: number, start: { hash: string; gesture: string; verificationId: string }, minMinutes: number, daySeconds: number) {
  const startedAt = new Date();
  const endAllowedAt = new Date(startedAt.getTime() + sessionWaitSeconds(minMinutes, daySeconds) * 1000);
  try {
    const s = await prisma.proofSession.create({ data: { key, wallet, dayIndex, startHash: start.hash, startGesture: start.gesture, startVerificationId: start.verificationId, startedAt, endAllowedAt } });
    return { phase: "wait" as const, photo: 2, ...sessionJson(s), waitSeconds: Math.ceil((endAllowedAt.getTime() - Date.now()) / 1000) };
  } catch { return null; }
}
