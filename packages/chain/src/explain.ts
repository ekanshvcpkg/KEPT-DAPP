// What a transaction will do, decoded from its instructions with the program IDL, so the app can say it in plain words
// before the wallet asks for a signature ("explain before sign"). Anything that isn't a KEPT instruction is flagged.
import type { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { IDL, instructionCoder } from "./idl";

export type DecodedInstruction =
  | { known: true; name: string; args: Record<string, unknown>; oath: string | null }
  | { known: false; program: string };

const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";

/** Decodes one instruction; `oath` is the Oath account it touches, when the instruction has one. */
export function decodeInstruction(ix: TransactionInstruction, programId: PublicKey): DecodedInstruction | null {
  const program = ix.programId.toBase58();
  if (program === COMPUTE_BUDGET) return null; // fee settings, not an action
  if (!ix.programId.equals(programId)) return { known: false, program };
  const decoded = instructionCoder.decode(Buffer.from(ix.data));
  if (!decoded) return { known: false, program };
  const def = IDL.instructions.find((i) => i.name === decoded.name);
  const at = def ? def.accounts.findIndex((a) => "name" in a && a.name === "oath") : -1;
  const args: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(decoded.data as Record<string, unknown>)) {
    args[k] = v !== null && typeof v === "object" && "toString" in v && !Array.isArray(v) ? (v as { toString(): string }).toString() : v;
  }
  return { known: true, name: decoded.name, args, oath: at >= 0 ? ix.keys[at]?.pubkey.toBase58() ?? null : null };
}

export const decodeInstructions = (ixs: readonly TransactionInstruction[], programId: PublicKey) =>
  ixs.map((ix) => decodeInstruction(ix, programId)).filter((d): d is DecodedInstruction => d !== null);
