// Reading the kept_test program over RPC: the program env (treasury, stake mint and its token program
// from the on-chain Config), single Oath accounts, and "my Oaths" (memcmp on each member slot, the
// index the backend doesn't have yet: BACKEND_GAPS P0-10).
import { PublicKey } from "@solana/web3.js";
import type { GetProgramAccountsFilter } from "@solana/web3.js";
import { Buffer } from "buffer";
import { configPda, decodeConfig, decodeOath, memberSlotOffset, oathDiscriminator } from "@kept/chain";
import type { OathAccount, ProgramEnv } from "@kept/chain";
import { MAX_MEMBERS } from "@kept/config";
import { env } from "@/config/env";
import { connection } from "./connection";

export const PROGRAM_ID = new PublicKey(env.programId);
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

let cached: Promise<ProgramEnv> | null = null;
/** Treasury and stake mint from Config, and the mint's token program (the Devnet mint is Token-2022). */
export function programEnv(): Promise<ProgramEnv> {
  cached ??= (async () => {
    const c = connection();
    const info = await c.getAccountInfo(configPda(PROGRAM_ID), "confirmed");
    if (!info) throw new Error("kept_test Config account not found: is the program initialized on this cluster?");
    const cfg = decodeConfig(info.data);
    const mint = new PublicKey(cfg.stakeMint);
    const mintInfo = await c.getAccountInfo(mint, "confirmed");
    if (!mintInfo) throw new Error(`Stake mint ${cfg.stakeMint} not found`);
    const treasury = new PublicKey(cfg.treasury);
    const treasuryInfo = await c.getAccountInfo(treasury, "confirmed");
    if (!treasuryInfo || !treasuryInfo.owner.equals(mintInfo.owner) || treasuryInfo.data.length < 64 || !new PublicKey(treasuryInfo.data.subarray(0, 32)).equals(mint)) {
      throw new Error("Configured treasury is not a token account for the stake mint");
    }
    const treasuryAuthority = new PublicKey(treasuryInfo.data.subarray(32, 64));
    return { programId: PROGRAM_ID, stakeMint: mint, treasury, treasuryAuthority, tokenProgram: mintInfo.owner };
  })().catch((e: unknown) => { cached = null; throw e; });
  return cached;
}

/** Associated token account of `owner` for the stake mint. */
export function tokenAccount(e: ProgramEnv, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([owner.toBytes(), e.tokenProgram.toBytes(), e.stakeMint.toBytes()], ATA_PROGRAM)[0];
}

export type ChainOath = OathAccount & { address: string };

export async function readOath(address: string): Promise<ChainOath | null> {
  const info = await connection().getAccountInfo(new PublicKey(address), "confirmed");
  return info ? { ...decodeOath(info.data), address } : null;
}

/** Every Oath account with `wallet` in one of its member slots. */
export async function listOathsOf(wallet: string): Promise<ChainOath[]> {
  const disc: GetProgramAccountsFilter = { memcmp: { offset: 0, bytes: Buffer.from(oathDiscriminator()).toString("base64"), encoding: "base64" } };
  const queries = Array.from({ length: MAX_MEMBERS }, (_, i) => connection().getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [disc, { memcmp: { offset: memberSlotOffset(i), bytes: wallet } }],
  }));
  const seen = new Map<string, ChainOath>();
  for (const rows of await Promise.all(queries)) {
    for (const r of rows) {
      const address = r.pubkey.toBase58();
      if (seen.has(address)) continue;
      try {
        seen.set(address, { ...decodeOath(r.account.data), address });
      } catch {
        // Not a current-layout Oath (e.g. a V3 leftover): skip it.
      }
    }
  }
  return [...seen.values()];
}
