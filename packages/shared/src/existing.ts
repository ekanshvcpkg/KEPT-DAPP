// Routes that exist today in backend (docs/API.md). Shapes match backend/src/routes/v4.ts exactly.
import { z } from "zod";
import { Address, Amount, IsoTime } from "./primitives";

// POST /api/auth/nonce
export const NonceRequest = z.object({ wallet: Address });
export const NonceResponse = z.object({ message: z.string().min(1) });
// POST /api/auth/verify
export const VerifyRequest = z.object({ wallet: Address, message: z.string(), signature: z.string() });
export const VerifyResponse = z.object({ token: z.string().min(1), wallet: Address });
// GET /api/me
export const MeResponse = z.object({
  wallet: Address,
  genesis: z.boolean(),
  mocked: z.boolean(),
  genesisMint: z.string().nullable(),
});
export type Me = z.infer<typeof MeResponse>;

/** On-chain Oath status byte (state.rs:39). */
export const OathStatusCode = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export const OATH_STATUS = { open: 0, active: 1, settled: 2, cancelled: 3 } as const;

/** `OathRead` as the API returns it (v4.ts:362). */
export const OathRead = z.object({
  oathId: z.string(),
  creator: Address,
  goalHash: z.string().regex(/^[0-9a-f]{64}$/),
  status: OathStatusCode,
  startTs: z.number().int(),
  daySeconds: z.number().int().positive(),
  numDays: z.number().int().positive(),
  objectId: z.number().int().min(0).max(7),
  members: z.array(Address).min(1).max(4),
  daysKept: z.record(z.string(), z.number().int().nonnegative()),
});
export type OathRead = z.infer<typeof OathRead>;

// POST /api/oaths/watch → 204 (no body)
export const WatchRequest = z.object({ oath: Address });
// POST /api/oaths/details
export const DetailsRequest = z.object({ oath: Address, goalText: z.string().min(1).max(120) });
export const DetailsResponse = z.object({ oath: Address, goalText: z.string() });
// GET /api/oaths/:oath/details
export const GoalResponse = z.object({ goalText: z.string().nullable() });
// POST /api/invites
export const InviteCreateRequest = z.object({ oath: Address });
export const InviteCreateResponse = z.object({ code: z.string().min(1), deepLink: z.string().startsWith("kept://join/"), oath: OathRead });
// GET /api/oaths/:oath/invite; lets the app recover a creator's current link after a reload.
export const OathInviteResponse = z.object({
  goalText: z.string().nullable(),
  invite: z.object({ code: z.string().min(1), deepLink: z.string().startsWith("kept://join/") }).nullable(),
});
// GET /api/invites/:code
export const InviteResolveResponse = z.object({ oath: OathRead, goalText: z.string().nullable(), alreadyStarted: z.boolean() });
export type InviteResolve = z.infer<typeof InviteResolveResponse>;
// POST /api/push-token → 204
export const PushTokenRequest = z.object({ token: z.string().min(1).max(4096) });
// POST /api/nudges
export const NudgeRequest = z.object({ oath: Address, recipient: Address, dayIndex: z.number().int().nonnegative() });
export const NudgeResponse = z.object({ ok: z.literal(true) });
// GET /api/price
export const PriceResponse = z.object({ usdPerSkr: z.number().positive(), skrForUsd10: z.number(), devnet: z.boolean(), label: z.string() });
export type Price = z.infer<typeof PriceResponse>;
// POST /api/faucet  (amount is whole SKR as a string, e.g. "5000")
export const FaucetResponse = z.object({ signature: z.string(), amount: z.string().regex(/^\d+$/), mint: Address });
// POST /api/proof/challenge: today's step for the caller (two-photo proof, docs/API.md › Proof).
export const ChallengeGesture = z.enum(["Thumb_Up", "Victory", "Open_Palm"]);
const SessionStart = { startedAt: IsoTime, endAllowedAt: IsoTime, startGesture: ChallengeGesture };
export const ProofChallengeResponse = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("start"), photo: z.literal(1), gesture: ChallengeGesture, issuedAt: IsoTime, expiresAt: IsoTime }),
  z.object({ phase: z.literal("end"), photo: z.literal(2), gesture: ChallengeGesture, issuedAt: IsoTime, expiresAt: IsoTime, ...SessionStart }),
  z.object({ phase: z.literal("wait"), photo: z.literal(2), waitSeconds: z.number().int(), ...SessionStart }),
]);
export type ProofChallenge = z.infer<typeof ProofChallengeResponse>;

// GET /reputation/:wallet (kept rate in percent with one decimal; null with no closed days yet)
export const ReputationResponse = z.object({
  wallet: Address,
  keptRate: z.object({ percentage: z.number().min(0).max(100).nullable(), keptDays: z.number().int(), missedDays: z.number().int(), sampleSize: z.number().int() }),
  oathsKept: z.number().int(),
  oathsBroken: z.number().int(),
  streak: z.object({ current: z.number().int(), best: z.number().int() }),
  bounties: z.object({ joined: z.number().int(), completed: z.number().int(), out: z.number().int() }),
});
export type Reputation = z.infer<typeof ReputationResponse>;

// GET /api/inbox: as the proposed InboxResponse, but `type` is free text and `ref` fields may be absent.
export const InboxLiveResponse = z.object({
  items: z.array(z.object({
    id: z.string(), type: z.string(), actor: z.string().nullable(), title: z.string(), body: z.string(), createdAt: IsoTime,
    needsAction: z.boolean(), done: z.boolean(),
    ref: z.object({ oath: z.string().optional(), code: z.string().optional(), bounty: z.string().optional(), review: z.string().optional() }),
  })),
  unread: z.number().int(),
});
// PUT /api/inbox/:id
export const InboxDoneResponse = z.object({ success: z.literal(true) });

export { Amount };

// GET /bounty/current, POST /bounty/:id/join (backend/src/routes/bounty.ts › bountyView). Amounts are base-unit strings.
export const BountyView = z.object({
  id: z.number().int(), title: z.string(), objectId: z.number().int(), numDays: z.number().int(), daySeconds: z.number().int(),
  startTs: z.number().int(), endTs: z.number().int(), joinClosesAt: z.number().int(), joinOpen: z.boolean(), currentDay: z.number().int().nullable(),
  status: z.enum(["UPCOMING", "ACTIVE", "PAYING", "PAID"]), poolAmount: z.string().regex(/^\d+$/), entrants: z.number().int(), stillIn: z.number().int(),
  estimatedShare: z.string().regex(/^\d+$/), paidAt: IsoTime.nullable(),
});
export const BountyEntryView = z.object({
  joined: z.literal(true), daysKept: z.number().int(), out: z.boolean(), outDay: z.number().int().nullable(),
  payoutAmount: z.string().regex(/^\d+$/).nullable(), paidAt: IsoTime.nullable(),
});
export const BountyCurrentResponse = z.object({ bounty: BountyView.nullable(), me: BountyEntryView.nullable() });
export type BountyCurrent = z.infer<typeof BountyCurrentResponse>;
// GET /bounty/:id/recently-out
export const RecentlyOutResponse = z.object({
  bountyId: z.number().int(), total: z.number().int(),
  entries: z.array(z.object({ wallet: z.string(), outDay: z.number().int().nullable(), outAt: IsoTime.nullable() })),
});
