// The real TxService: packages/chain instruction builders, signed and sent through MWA (mwa.ts).
// Bounty funding and Rematch have no program support yet (BACKEND_GAPS P1-10, P1-2).
import { PublicKey } from "@solana/web3.js";
import { cancelOathIx, claimIx, createOathIx, joinOathIx, settleOathIx, startOathIx } from "@kept/chain";
import { env } from "@/config/env";
import { useSession } from "@/state/session";
import { signAndSend } from "./mwa";
import { programEnv, readOath, tokenAccount } from "./program";
import { TxFailure } from "./types";
import type { TxService } from "./types";

function me(): PublicKey {
  const w = useSession.getState().wallet;
  if (!w) throw new TxFailure("failed", "Not signed in");
  return new PublicKey(w);
}

/** A u64 oath_id unique per creator: milliseconds plus a random suffix. */
const newOathId = () => BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));

export const realTx: TxService = {
  async createOath(i) {
    const e = await programEnv();
    const creator = me();
    const oathId = i.oathId ?? newOathId();
    const { ix, oath } = createOathIx(e, {
      creator, creatorToken: tokenAccount(e, creator), oathId, goalText: i.goalText, objectId: i.objectId,
      numDays: i.numDays, daySeconds: env.daySeconds, tzOffsetMinutes: i.tzOffsetMinutes,
      // The program requires a solo stake of 0 today (BACKEND_GAPS P0-7, DECISIONS D-30).
      stake: i.isSolo ? 0n : i.stake, isSolo: i.isSolo,
    });
    // A solo Oath has no one to wait for, so it starts in the same transaction: one wallet approval, not two
    // (the program accepts start_oath right after create_oath for a solo Oath; BACKEND_GAPS P1-18).
    const ixs = i.isSolo ? [ix, startOathIx(e, { oath, creator })] : [ix];
    try {
      return { signature: await signAndSend(creator, ixs), oath: oath.toBase58(), started: i.isSolo };
    } catch (error) {
      // A wallet/RPC timeout can happen after the program accepted the transaction. On retry, recognize
      // the same PDA and return success instead of making the user stake into a second Oath.
      const existing = await readOath(oath.toBase58()).catch(() => null);
      if (existing?.creator === creator.toBase58() && existing.oathId === oathId) {
        return { signature: "previously-confirmed", oath: oath.toBase58(), started: existing.status !== "open" };
      }
      throw error;
    }
  },
  async joinOath(oath) {
    const e = await programEnv();
    const member = me();
    return { signature: await signAndSend(member, [joinOathIx(e, { oath: new PublicKey(oath), member, memberToken: tokenAccount(e, member) })]) };
  },
  async startOath(oath) {
    const e = await programEnv();
    return { signature: await signAndSend(me(), [startOathIx(e, { oath: new PublicKey(oath), creator: me() })]) };
  },
  async cancelOath(oath) {
    const e = await programEnv();
    return { signature: await signAndSend(me(), [cancelOathIx(e, { oath: new PublicKey(oath), creator: me() })]) };
  },
  async settle(oath) {
    const e = await programEnv();
    const o = await readOath(oath);
    if (!o) throw new TxFailure("failed", `Oath ${oath} not found`);
    return { signature: await signAndSend(me(), [settleOathIx(e, { oath: new PublicKey(oath), members: o.members.map((m) => new PublicKey(m.wallet)) })]) };
  },
  async claim(oath) {
    const e = await programEnv();
    const member = me();
    const before = await readOath(oath);
    const amount = before?.members.find((m) => m.wallet === member.toBase58())?.payout ?? 0n;
    const signature = await signAndSend(member, [claimIx(e, { oath: new PublicKey(oath), member, destination: tokenAccount(e, member) })]);
    return { signature, amount };
  },
  fundBounty: () => Promise.reject(new TxFailure("failed", "Bounties have no program support yet")),
  joinRematch: () => Promise.reject(new TxFailure("failed", "Rematch has no program support yet")),
};
