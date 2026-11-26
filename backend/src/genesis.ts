import { NextFunction, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint, getTokenGroupMemberState } from "@solana/spl-token";
import { AuthedRequest } from "./auth.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { connection } from "./solana.js";

export type GenesisIdentity = { genesis: boolean; genesisMint: string | null; source: "genesis_token" | "devnet_allowlist" | null };

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; identity: GenesisIdentity }>();

/**
 * Whether a wallet holds a Seeker Genesis Token (Token-2022 member of GENESIS_GROUP). With SGT_MOCK=true
 * the SGT_MOCK_ALLOWLIST stands in for the token check, but never when the RPC points at mainnet.
 * Results are cached for 60 s because the check scans every Token-2022 account the wallet owns.
 */
export async function genesisIdentity(wallet: string): Promise<GenesisIdentity> {
  const hit = cache.get(wallet);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.identity;
  const identity = await lookupGenesis(wallet);
  cache.set(wallet, { at: Date.now(), identity });
  return identity;
}

/** Whether the Devnet mock allowlist (SGT_MOCK_ALLOWLIST) lets this wallet in: listed, or the list is "*". */
export function mockAllowed(allowlist: readonly string[], wallet: string): boolean {
  return allowlist.includes("*") || allowlist.includes(wallet);
}

export function mockAllowlistActive(sgtMock: boolean, rpcUrl: string): boolean {
  return sgtMock && !rpcUrl.includes("mainnet");
}

async function lookupGenesis(wallet: string): Promise<GenesisIdentity> {
  const none: GenesisIdentity = { genesis: false, genesisMint: null, source: null };
  if (mockAllowlistActive(config.sgtMock, config.devnetRpcUrl)) {
    // "*" lets every wallet in (a public Devnet demo for judges and testers); the mock never runs on mainnet.
    return mockAllowed(config.sgtMockAllowlist, wallet) ? { genesis: true, genesisMint: `mock-sgt-${wallet}`, source: "devnet_allowlist" } : none;
  }
  if (!config.genesisGroup) return none;
  const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(wallet), { programId: TOKEN_2022_PROGRAM_ID }, "confirmed");
  for (const a of accounts.value) {
    const mint = new PublicKey((a.account.data as any).parsed.info.mint);
    try {
      const state = getTokenGroupMemberState(await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID));
      if (state?.group?.toBase58() === config.genesisGroup) return { genesis: true, genesisMint: mint.toBase58(), source: "genesis_token" };
    } catch { /* unsupported or non-Token-2022 mint */ }
  }
  return none;
}

/** The wallet's Genesis Token mint, or the mock allowlist entry on Devnet. */
export async function checkGenesis(wallet: string): Promise<string | null> {
  return (await genesisIdentity(wallet)).genesisMint;
}

/** After `authenticate`: one Genesis Token per wallet, required for everything but sign-in and /api/me. */
export async function requireGenesis(req: Request, res: Response, next: NextFunction) {
  try {
    const wallet = (req as AuthedRequest).wallet;
    if (!wallet) return res.status(401).json({ error: "Sign-in required" });
    const mint = await checkGenesis(wallet);
    if (!mint) return res.status(403).json({ error: "A Seeker Genesis Token is required" });
    await prisma.sessionSeat.upsert({ where: { wallet }, create: { wallet, genesisMint: mint }, update: { genesisMint: mint } });
    next();
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) return res.status(409).json({ error: "This Genesis Token is already assigned to another wallet" });
    next(e);
  }
}
