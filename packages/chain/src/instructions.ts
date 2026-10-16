// Instruction builders for the Oath lifecycle. Pure: no RPC. Account order and signer/writable flags
// come from the IDL, so a program change that reorders accounts breaks the tests, not production.
import BN from "bn.js";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import type { AccountMeta } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2";
import { IDL, instructionCoder } from "./idl";
import { configPda, keeperPda, oathPda, vaultPda } from "./pda";

export interface ProgramEnv {
  programId: PublicKey;
  stakeMint: PublicKey;
  /** The treasury token account from Config. */
  treasury: PublicKey;
  /** Authority wallet of the configured treasury token account; native SOL fees go here. */
  treasuryAuthority: PublicKey;
  /** Token or Token-2022 program that owns the stake mint (the Devnet mint is Token-2022). */
  tokenProgram: PublicKey;
}

type IxName = "create_oath" | "create_oath_sol" | "join_oath" | "join_oath_sol" | "start_oath" | "cancel_oath" | "settle_oath" | "settle_oath_sol" | "sweep_held" | "sweep_held_sol" | "claim" | "claim_sol";

function metas(name: IxName, accounts: Record<string, PublicKey>): AccountMeta[] {
  const ix = IDL.instructions.find((i) => i.name === name);
  if (!ix) throw new Error(`IDL has no instruction ${name}`);
  return ix.accounts.map((a) => {
    if (!("name" in a) || "accounts" in a) throw new Error(`nested accounts are not supported (${name})`);
    const pubkey = accounts[a.name];
    if (!pubkey) throw new Error(`${name}: missing account ${a.name}`);
    return { pubkey, isSigner: !!a.signer, isWritable: !!a.writable };
  });
}

const build = (env: ProgramEnv, name: IxName, accounts: Record<string, PublicKey>, args: Record<string, unknown> = {}, extra: AccountMeta[] = []) =>
  new TransactionInstruction({
    programId: env.programId,
    keys: [...metas(name, accounts), ...extra],
    data: instructionCoder.encode(name, args),
  });

/** SHA-256 of the trimmed goal text: what the program stores and the API checks (v4.ts:127). */
export function goalHash(goalText: string): Uint8Array {
  return sha256(new TextEncoder().encode(goalText.trim()));
}

export interface CreateOathArgs {
  creator: PublicKey;
  creatorToken: PublicKey;
  oathId: bigint;
  goalText: string;
  objectId: number;
  numDays: number;
  daySeconds: number;
  tzOffsetMinutes: number;
  stake: bigint;
  isSolo: boolean;
}
export type CreateOathSolArgs = Omit<CreateOathArgs, "creatorToken">;

export function createOathIx(env: ProgramEnv, a: CreateOathArgs) {
  const oath = oathPda(env.programId, a.creator, a.oathId);
  const ix = build(env, "create_oath", {
    config: configPda(env.programId),
    oath,
    vault: vaultPda(env.programId, oath),
    keeper: keeperPda(env.programId, a.creator),
    creator: a.creator,
    stake_mint: env.stakeMint,
    creator_token: a.creatorToken,
    treasury: env.treasury,
    token_program: env.tokenProgram,
    system_program: SystemProgram.programId,
  }, {
    oath_id: new BN(a.oathId.toString()),
    goal_hash: Array.from(goalHash(a.goalText)),
    object_id: a.objectId,
    num_days: a.numDays,
    day_seconds: a.daySeconds,
    tz_offset_minutes: a.tzOffsetMinutes,
    stake_amount: new BN(a.stake.toString()),
    is_solo: a.isSolo,
  });
  return { ix, oath };
}

/** Creates an Oath whose stake is native lamports in the Oath PDA; no user token account is needed. */
export function createOathSolIx(env: ProgramEnv, a: CreateOathSolArgs) {
  const oath = oathPda(env.programId, a.creator, a.oathId);
  const ix = build(env, "create_oath_sol", {
    config: configPda(env.programId), oath, keeper: keeperPda(env.programId, a.creator), creator: a.creator,
    stake_mint: env.stakeMint, treasury: env.treasury, system_program: SystemProgram.programId,
  }, {
    oath_id: new BN(a.oathId.toString()), goal_hash: Array.from(goalHash(a.goalText)), object_id: a.objectId,
    num_days: a.numDays, day_seconds: a.daySeconds, tz_offset_minutes: a.tzOffsetMinutes,
    stake_amount: new BN(a.stake.toString()), is_solo: a.isSolo,
  });
  return { ix, oath };
}

export function joinOathIx(env: ProgramEnv, a: { oath: PublicKey; member: PublicKey; memberToken: PublicKey }) {
  return build(env, "join_oath", {
    config: configPda(env.programId),
    oath: a.oath,
    vault: vaultPda(env.programId, a.oath),
    keeper: keeperPda(env.programId, a.member),
    member: a.member,
    stake_mint: env.stakeMint,
    member_token: a.memberToken,
    treasury: env.treasury,
    token_program: env.tokenProgram,
    system_program: SystemProgram.programId,
  });
}

export const joinOathSolIx = (env: ProgramEnv, a: { oath: PublicKey; member: PublicKey }) =>
  build(env, "join_oath_sol", {
    config: configPda(env.programId), oath: a.oath, keeper: keeperPda(env.programId, a.member), member: a.member,
    stake_mint: env.stakeMint, treasury: env.treasury, system_program: SystemProgram.programId,
  });

export const startOathIx = (env: ProgramEnv, a: { oath: PublicKey; creator: PublicKey }) =>
  build(env, "start_oath", { oath: a.oath, creator: a.creator });

export const cancelOathIx = (env: ProgramEnv, a: { oath: PublicKey; creator: PublicKey }) =>
  build(env, "cancel_oath", { oath: a.oath, creator: a.creator });

/**
 * Permissionless (no signer in SettleOath): any fee payer may settle once the Oath has ended, or, under rules v3, once
 * the day its HP reached 0 has closed. The KEPT share goes to `env.treasury`, which must be the Config's treasury.
 */
export function settleOathIx(env: ProgramEnv, a: { oath: PublicKey; members: PublicKey[] }) {
  return build(env, "settle_oath", {
    config: configPda(env.programId),
    oath: a.oath,
    vault: vaultPda(env.programId, a.oath),
    treasury: env.treasury,
    stake_mint: env.stakeMint,
    token_program: env.tokenProgram,
  }, {}, a.members.map((m) => ({ pubkey: keeperPda(env.programId, m), isSigner: false, isWritable: true })));
}

/** Settles native SOL Oaths; protocol shares go to the configured SPL treasury's authority wallet. */
export function settleOathSolIx(env: ProgramEnv, a: { oath: PublicKey; members: PublicKey[] }) {
  return build(env, "settle_oath_sol", {
    config: configPda(env.programId), oath: a.oath, treasury: env.treasury,
    stake_mint: env.stakeMint, treasury_authority: env.treasuryAuthority,
  }, {}, a.members.map((m) => ({ pubkey: keeperPda(env.programId, m), isSigner: false, isWritable: true })));
}

/** Rules v3: releases the held half of a broken Oath to the treasury once the Rematch window has passed. Permissionless. */
export const sweepHeldIx = (env: ProgramEnv, a: { oath: PublicKey }) =>
  build(env, "sweep_held", {
    config: configPda(env.programId),
    oath: a.oath,
    vault: vaultPda(env.programId, a.oath),
    treasury: env.treasury,
    stake_mint: env.stakeMint,
    token_program: env.tokenProgram,
  });

export const sweepHeldSolIx = (env: ProgramEnv, a: { oath: PublicKey }) =>
  build(env, "sweep_held_sol", {
    config: configPda(env.programId), oath: a.oath, treasury: env.treasury,
    stake_mint: env.stakeMint, treasury_authority: env.treasuryAuthority,
  });

export const claimIx = (env: ProgramEnv, a: { oath: PublicKey; member: PublicKey; destination: PublicKey }) =>
  build(env, "claim", {
    oath: a.oath,
    vault: vaultPda(env.programId, a.oath),
    stake_mint: env.stakeMint,
    destination: a.destination,
    member: a.member,
    token_program: env.tokenProgram,
  });

export const claimSolIx = (_env: ProgramEnv, a: { oath: PublicKey; member: PublicKey }) =>
  build(_env, "claim_sol", { oath: a.oath, member: a.member });

export { oathPda };
