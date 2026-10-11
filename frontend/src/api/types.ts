// The app's single API surface (docs/ARCHITECTURE.md §6). Each slice has an `http` and a `mock`
// implementation; the app mode picks them (Demo: mock, Live: http, D-80).
import type { Balances, InboxItem, InviteResolve, Me, OathRead, Price, Profile } from "@kept/shared";
import type { OathFacts } from "@/features/oaths/model";
import type { BountyFacts } from "@/features/bounties/model";
import type { ReviewFacts } from "@/features/reviews/model";

export interface AuthApi {
  /** The exact message the wallet must sign (POST /api/auth/nonce). */
  nonce(wallet: string): Promise<string>;
  verify(req: { wallet: string; message: string; signature: string }): Promise<{ token: string; wallet: string }>;
  me(): Promise<Me>;
}

export interface WalletApi {
  /** SKR and SOL in base units. http reads them from RPC until GET /api/balances exists (BACKEND_GAPS P0-10). */
  balances(wallet: string): Promise<Balances>;
  price(): Promise<Price>;
  /** Devnet faucet; `amount` in base units. */
  faucet(): Promise<{ signature: string; amount: bigint }>;
  /** SOL → SKR. Mock only on Devnet (DECISIONS D-21). Amounts in base units. */
  swap(lamports: bigint): Promise<{ skr: bigint }>;
  /** W3: what `lamports` buys, the rate (SKR per 1 SOL, whole) and the network fee in lamports. */
  quote(lamports: bigint): Promise<SwapQuote>;
}
export interface SwapQuote { skr: bigint; skrPerSol: number; feeLamports: bigint }

export interface InboxApi {
  list(): Promise<{ items: InboxItem[]; unread: number }>;
  markDone(ids: string[]): Promise<void>;
}

export interface InvitesApi {
  create(oath: string): Promise<{ code: string; deepLink: string; oath: OathRead }>;
  resolve(code: string): Promise<InviteResolve>;
}

export interface NotifyApi {
  registerPushToken(token: string): Promise<void>;
  nudge(req: { oath: string; recipient: string; dayIndex: number }): Promise<void>;
}

export interface ProfileApi {
  mine(): Promise<Profile>;
  save(patch: Partial<Pick<Profile, "name" | "avatar" | "banner" | "bio" | "socials" | "visibility">>): Promise<Profile>;
  /** Someone else's public profile (fields per their visibility). */
  get(wallet: string): Promise<Profile>;
  /** My counts for I1 / B2 / F5 (BACKEND_GAPS P1-16). */
  stats(): Promise<MyStats>;
  activity(): Promise<ActivityItem[]>;
  /** A Bounty host's page (I3). */
  creator(name: string): Promise<CreatorProfile>;
}

export interface MyStats {
  streak: number;
  bestStreak: number;
  keptRate: number | null;
  rateDays: number;
  oaths: { kept: number; broken: number };
  bounties: { survived: number; out: number };
}
/** `day` is a display group ("TODAY", "MON 6 OCT"); amount is pre-signed text or null. */
/** What happened, for the row's icon (I5). Proposed field (BACKEND_GAPS › Profiles); optional, `kind` is the fallback. */
export type ActivityType = "kept" | "photo" | "payout" | "vote" | "stake" | "join" | "claim" | "broke";
export interface ActivityItem { id: string; day: string; title: string; sub: string; amount: string | null; kind: "money" | "proof" | "oath"; type?: ActivityType }
export interface CreatorProfile {
  name: string; logo: string; palette: number; verified: boolean; bio: string; tagline: string;
  hosted: number; paidOut: bigint; followers: number; links: { title: string; kind: string }[];
}

export interface BountiesApi {
  list(): Promise<BountyFacts[]>;
  get(id: string): Promise<BountyFacts>;
  /** Join (free): returns my participation, an Oath on the Bounty's days. */
  join(id: string, wallet: string): Promise<OathFacts>;
  /** My participation in a Bounty, if any. */
  mine(id: string, wallet: string): Promise<OathFacts | null>;
  create(d: BountyDraftInput, wallet: string): Promise<BountyFacts>;
}
export interface BountyDraftInput {
  name: string; objectId: number; numDays: number; pool: bigint; joinWindowHours: number | null;
  message: string; link: string | null; minKeptRate: number | null; tokenHeld: { symbol: string; amount: number } | null;
}

export interface RematchApi {
  /** The broken Oath, its Rematch if anyone opened one, and when the window closes. */
  offer(sourceId: string): Promise<{ rematch: OathFacts | null; closesAt: number }>;
  join(sourceId: string, wallet: string): Promise<OathFacts>;
}

export interface ReviewsApi {
  request(oath: OathFacts, by: string, dayIndex: number, gesture: ReviewFacts["gesture"]): Promise<ReviewFacts>;
  get(id: string, me: string): Promise<ReviewFacts>;
  /** My own review for today, if I asked for one. */
  mine(oathId: string, me: string, dayIndex: number): Promise<ReviewFacts | null>;
  /** Reviews on an Oath waiting for my vote. */
  openFor(oathId: string, me: string): Promise<ReviewFacts[]>;
  vote(id: string, me: string, approve: boolean): Promise<void>;
}

export interface OathsApi {
  /** Every Oath the wallet is in (chain index by member slot until GET /api/me/oaths, BACKEND_GAPS P0-10). */
  list(wallet: string): Promise<OathFacts[]>;
  get(id: string): Promise<OathFacts>;
  /** E1: the Oath behind an invite code. */
  byInvite(code: string, wallet: string): Promise<{ oath: OathFacts; alreadyStarted: boolean }>;
  /**
   * After a confirmed create: store the goal text, make an invite (group), and register the Oath
   * with the settlement scheduler (docs/ARCHITECTURE.md §7, BACKEND_GAPS P0-9). Returns the code.
   */
  register(oath: OathFacts, goal: string): Promise<string | null>;
  /** After a confirmed join: register for settlement and reminders. */
  watch(oath: OathFacts): Promise<void>;
}

/** A gesture the backend may ask for. The design has three; the backend draws from five (BACKEND_GAPS P0-3). */
export type GestureLabel = "thumbs_up" | "victory" | "open_palm" | "closed_fist" | "pointing_up";
export interface Challenge { photo: 1 | 2; dayIndex: number; objectId: number; gesture: GestureLabel; expiresAt: number; waitUntil?: number }
export type ProofOutcome =
  | { status: "pass"; endAllowedAt?: number }
  | { status: "fail"; attempts: number }
  | { status: "unavailable" }
  | { status: "expired" };

export interface ProofApi {
  challenge(oath: OathFacts, photo: 1 | 2, dayIndex: number, avoid?: GestureLabel): Promise<Challenge>;
  /** `image` is base64 JPEG from the camera. */
  submit(oath: OathFacts, c: Challenge, image: string, imageUri?: string): Promise<ProofOutcome>;
}

export interface KeptApi {
  oaths: OathsApi;
  proof: ProofApi;
  bounties: BountiesApi;
  rematch: RematchApi;
  reviews: ReviewsApi;
  auth: AuthApi;
  wallet: WalletApi;
  inbox: InboxApi;
  invites: InvitesApi;
  notify: NotifyApi;
  profile: ProfileApi;
}

export type Slice = keyof KeptApi;
export const SLICES: readonly Slice[] = ["oaths", "proof", "bounties", "rematch", "reviews", "auth", "wallet", "inbox", "invites", "notify", "profile"];
export type SliceMode = "http" | "mock";
