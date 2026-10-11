import type { PublicKey } from "@solana/web3.js";
import { accountsCoder } from "./idl";

export const OATH_STATUS = ["open", "active", "settled", "cancelled"] as const;
export type OathChainStatus = (typeof OATH_STATUS)[number];

export interface OathMember {
  wallet: string;
  staked: boolean;
  /** Bitmask: bit d set = day d kept. */
  daysKept: number;
  claimed: boolean;
  payout: bigint;
}

export interface OathAccount {
  creator: string;
  oathId: bigint;
  stake: bigint;
  mint: string;
  goalHash: string;
  objectId: number;
  numDays: number;
  daySeconds: number;
  startTs: number;
  tzOffsetMinutes: number;
  status: OathChainStatus;
  isSolo: boolean;
  members: OathMember[];
}

export interface ConfigAccount {
  admin: string;
  verifier: string;
  treasury: string;
  feeBps: number;
  stakeMint: string;
}

type Raw = Record<string, any>;
const big = (v: { toString(): string }) => BigInt(v.toString());
const key = (v: PublicKey) => v.toBase58();
const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

function statusOf(raw: Raw): OathChainStatus {
  const k = Object.keys(raw)[0]?.toLowerCase();
  const s = OATH_STATUS.find((x) => x === k);
  if (!s) throw new Error(`unknown Oath status ${JSON.stringify(raw)}`);
  return s;
}

/** Decodes an Oath account (state.rs:43-59) with the IDL coder. Throws on a wrong discriminator. */
export function decodeOath(data: Uint8Array): OathAccount {
  const r: Raw = accountsCoder.decode("Oath", Buffer.from(data));
  const count = Number(r.member_count);
  return {
    creator: key(r.creator),
    oathId: big(r.oath_id),
    stake: big(r.stake_amount),
    mint: key(r.mint),
    goalHash: hex(r.goal_hash),
    objectId: r.object_id,
    numDays: r.num_days,
    daySeconds: r.day_seconds,
    startTs: Number(big(r.start_ts)),
    tzOffsetMinutes: r.tz_offset_minutes,
    status: statusOf(r.status),
    isSolo: r.is_solo,
    members: (r.members as Raw[]).slice(0, count).map((m) => ({
      wallet: key(m.authority), staked: m.staked, daysKept: m.days_kept, claimed: m.claimed, payout: big(m.payout),
    })),
  };
}

export function decodeConfig(data: Uint8Array): ConfigAccount {
  const r: Raw = accountsCoder.decode("Config", Buffer.from(data));
  return { admin: key(r.admin), verifier: key(r.verifier), treasury: key(r.treasury), feeBps: r.fee_bps, stakeMint: key(r.stake_mint) };
}

/** Anchor account discriminator for Oath (first 8 bytes), for getProgramAccounts filters. */
export const oathDiscriminator = (): Uint8Array => accountsCoder.accountDiscriminator("Oath");
/** Byte offset of member slot i's wallet inside an Oath account (for memcmp filters). */
export const memberSlotOffset = (i: number) => 139 + 44 * i;

/** Size of the `Oath` struct with its discriminator. An account of exactly this size predates the terms region (rules v1). */
export const OATH_BASE_LEN = 316;
const TERMS_TAG = "KEPTTRM1";

/** The rules an Oath was created under, from the region appended after the Oath struct (economics.rs `OathTerms`). */
export interface OathTerms {
  /** 1 = legacy (no terms region), 2 = fee + freezes (never activated on Devnet), 3 = the owner's model (D-91). */
  rulesVersion: 1 | 2 | 3;
  /** Rules v3: cost of one miss in basis points of the original stake; 0 otherwise. */
  missBps: number;
  /** Rules v3: held after a break (base units), swept to the treasury after `heldReleaseTs`. */
  heldTotal: bigint;
  heldReleaseTs: number;
  heldSwept: boolean;
  /** Rules v3: 0-based day the HP reached 0, or null. */
  brokeDay: number | null;
  /** Sent to the treasury at settlement (v2 / v3). */
  treasuryPaid: bigint;
}

/** Null when the terms region is present but malformed (the program rejects such accounts too). */
export function decodeOathTerms(data: Uint8Array): OathTerms | null {
  const b = Buffer.from(data);
  if (b.length === OATH_BASE_LEN) return { rulesVersion: 1, missBps: 0, heldTotal: 0n, heldReleaseTs: 0, heldSwept: false, brokeDay: null, treasuryPaid: 0n };
  const t = b.subarray(OATH_BASE_LEN);
  if (t.length < 110 || t.subarray(0, 8).toString("latin1") !== TERMS_TAG) return null;
  const v = t[8];
  if (v !== 1 && v !== 2 && v !== 3) return null;
  return {
    rulesVersion: v, missBps: t.readUInt16LE(78), heldTotal: t.readBigUInt64LE(80), heldReleaseTs: Number(t.readBigInt64LE(88)), heldSwept: t[96] === 1,
    brokeDay: t[97] === 0 ? null : (t[97] ?? 1) - 1, treasuryPaid: t.readBigUInt64LE(53),
  };
}
