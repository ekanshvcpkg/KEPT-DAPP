import { Connection, PublicKey } from "@solana/web3.js";
import { env } from "@/config/env";

/** An RPC request that hasn't answered by then is dropped (web3.js has no timeout of its own). */
const RPC_TIMEOUT_MS = 20_000;

/** fetch with a timeout, for the Connection: a hung RPC ends on M2 instead of a skeleton that never goes. */
export function timedFetch(timeoutMs = RPC_TIMEOUT_MS, f: typeof fetch = fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    init?.signal?.addEventListener("abort", () => abort.abort());
    try {
      return await f(input, { ...init, signal: abort.signal });
    } catch (e) {
      throw abort.signal.aborted ? new Error(`RPC timed out after ${timeoutMs / 1000} s`) : e;
    } finally {
      clearTimeout(timer);
    }
  }) as typeof fetch;
}

let conn: Connection | null = null;
/** One shared RPC connection (created lazily so tests that never touch the chain don't open one). */
export function connection(): Connection {
  conn ??= new Connection(env.rpcUrl, { commitment: "confirmed", fetch: timedFetch() });
  return conn;
}

/**
 * SOL (lamports) and SKR (base units) for a wallet, read from RPC. Works for SPL and Token-2022 mints.
 * `mint` defaults to EXPO_PUBLIC_STAKE_MINT; callers pass the program Config's mint when they have it.
 */
export async function readBalances(wallet: string, mint: string = env.stakeMint): Promise<{ sol: bigint; skr: bigint }> {
  const owner = new PublicKey(wallet);
  const c = connection();
  const [lamports, tokens] = await Promise.all([
    c.getBalance(owner, "confirmed"),
    mint ? c.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) }, "confirmed") : Promise.resolve(null),
  ]);
  let skr = 0n;
  for (const a of tokens?.value ?? []) {
    const info = (a.account.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } }).parsed?.info;
    skr += BigInt(info?.tokenAmount?.amount ?? "0");
  }
  return { sol: BigInt(lamports), skr };
}
