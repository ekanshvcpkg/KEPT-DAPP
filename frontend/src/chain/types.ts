// Chain layer contracts (docs/ARCHITECTURE.md §7). The wallet signs; TxService builds and sends the
// program instructions. Both have a real (MWA) and a mock implementation.
export type TxError = "rejected" | "failed" | "insufficientSol" | "insufficientSkr" | "offline" | "noWallet";

export class TxFailure extends Error {
  constructor(public readonly kind: TxError, message: string) {
    super(message);
    this.name = "TxFailure";
  }
}
export const isTxFailure = (e: unknown): e is TxFailure => e instanceof TxFailure;

export type TxResult<T = object> = { signature: string } & T;

export interface WalletSession {
  /** Connect (silently, with a remembered auth token, when possible). Returns the base58 address. */
  connect(): Promise<string>;
  /** Sign an exact message (Sign-in with Solana). Signature is raw ed25519 bytes. */
  signMessage(message: string): Promise<{ wallet: string; signature: Uint8Array }>;
  /** Forget the remembered authorization (sign-out). */
  forget(): Promise<void>;
}

export interface CreateOathInput { objectId: number; numDays: number; stake: bigint; goalText: string; tzOffsetMinutes: number; isSolo: boolean; reviewMode: "ai" | "ai_group"; oathId?: bigint }
export interface FundBountyInput { bountyId: string; pool: bigint }
export interface JoinRematchInput { oath: string }

export interface TxService {
  /** `started`: the same transaction also started the Oath (a solo one on chain), so no `startOath` is needed. */
  createOath(i: CreateOathInput): Promise<TxResult<{ oath: string; started: boolean }>>;
  joinOath(oath: string): Promise<TxResult>;
  startOath(oath: string): Promise<TxResult>;
  cancelOath(oath: string): Promise<TxResult>;
  claim(oath: string): Promise<TxResult<{ amount: bigint }>>;
  /** Permissionless on chain; a fallback if the backend scheduler is late. */
  settle(oath: string): Promise<TxResult>;
  /** Mock only: no program support (BACKEND_GAPS P1-10). */
  fundBounty(i: FundBountyInput): Promise<TxResult>;
  /** Mock only: no program support (BACKEND_GAPS P1-2). */
  joinRematch(i: JoinRematchInput): Promise<TxResult>;
}
