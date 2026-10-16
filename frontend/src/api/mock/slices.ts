// Mock backend: in-memory fixtures seeded from design/copy.json › sampleData. Every response is built
// in the wire format and parsed with the same zod schemas as http, so fixtures can't drift from the
// contract. Phase 3 adds Oaths computed with packages/engine on the virtual clock.
import {
  BalancesResponse, InboxResponse, InviteCreateResponse, InviteResolveResponse, MeResponse, NonceResponse, PriceResponse, Profile, VerifyResponse,
} from "@kept/shared";
import type { InboxItem } from "@kept/shared";
import { SKR_UNIT } from "@kept/config";
import { z } from "zod";
import { sampleData, t } from "@/copy";
import type { CopyKey } from "@/copy";
import { mockBounties } from "@/features/bounties/mockStore";
import { PEOPLE, mockOaths } from "@/features/oaths/mockStore";
import { mockReviews } from "@/features/reviews/mockStore";
import { ApiError } from "../errors";
import type { ActivityItem, ActivityType, AuthApi, InboxApi, InvitesApi, NotifyApi, ProfileApi, WalletApi } from "../types";
import { devWait } from "@/state/dev";
import { clock } from "@/lib/clock";
import type { Scenario } from "./scenarios";

export interface MockContext {
  scenario: () => Scenario;
  /** The signed-in wallet (mock sign-in returns whatever the wallet signed with). */
  wallet: () => string | null;
  latencyMs: number;
}

/** A valid-looking base58 address for fixtures that need one. */
export const MOCK_WALLET = "7xKpQe9mZ3LbVd2RtYc8NfH4uJs6WgA1oPqE5rTk3F9q";

async function respond<S extends z.ZodType>(ctx: MockContext, schema: S, wire: unknown): Promise<z.output<S>> {
  if (ctx.latencyMs) await new Promise((r) => setTimeout(r, ctx.latencyMs * (0.6 + Math.random() * 0.8)));
  if (ctx.scenario() === "offline") throw new ApiError("OFFLINE", "mock: offline scenario", 0, true);
  return schema.parse(wire);
}
async function ack(ctx: MockContext): Promise<void> { await respond(ctx, z.null(), null); }

const skr = (whole: number) => (BigInt(whole) * SKR_UNIT).toString();

export function mockAuth(ctx: MockContext): AuthApi {
  return {
    nonce: async (wallet) => (await respond(ctx, NonceResponse, { message: `KEPT V4 sign-in\nWallet: ${wallet}\nNonce: ${randomHex(32)}\nThis signature only signs in and cannot move funds.` })).message,
    verify: (req) => respond(ctx, VerifyResponse, { token: `mock.${req.wallet}`, wallet: req.wallet }),
    me: () => respond(ctx, MeResponse, {
      wallet: ctx.wallet() ?? MOCK_WALLET,
      genesis: ctx.scenario() !== "notEligible",
      mocked: true,
      genesisMint: ctx.scenario() === "notEligible" ? null : "GenesisMint1111111111111111111111111111111",
    }),
  };
}
/** Devnet swap rate the W3 design shows (1 SOL ≈ 9,900 SKR); mock only (D-21). */
const MOCK_SKR_PER_SOL = 9900n;

export function mockWallet(ctx: MockContext): WalletApi {
  let faucetUsed = false;
  // What the user added on the mock (faucet, swaps) on top of the scenario's starting balance.
  let addedSkr = 0n;
  let spentLamports = 0n;
  return {
    balances: () => {
      const s = ctx.scenario();
      return respond(ctx, BalancesResponse, {
        // Legacy Bounty token balance; new Oaths use the native SOL balance below.
        skr: (BigInt(skr(s === "noSkr" ? 620 : 4280)) + addedSkr + mockOaths.walletDelta(ctx.wallet() ?? "", "skr")).toString(),
        sol: s === "noSol" ? "0" : (840_000_000n - spentLamports + mockOaths.walletDelta(ctx.wallet() ?? "", "sol")).toString(),
      });
    },
    swap: async (lamports) => {
      await ack(ctx);
      await devWait(0); // W3·s held open by the dev deep link
      if (ctx.scenario() === "noSol" || lamports > 840_000_000n - spentLamports) throw new ApiError("INSUFFICIENT_SOL", "mock: not enough SOL", 400);
      const out = (lamports * MOCK_SKR_PER_SOL * SKR_UNIT) / 1_000_000_000n;
      spentLamports += lamports;
      addedSkr += out;
      return { skr: out };
    },
    quote: async (lamports) => {
      await ack(ctx);
      return { skr: (lamports * MOCK_SKR_PER_SOL * SKR_UNIT) / 1_000_000_000n, skrPerSol: Number(MOCK_SKR_PER_SOL), feeLamports: 5000n };
    },
    price: () => respond(ctx, PriceResponse, { usdPerSol: 200, usdPerSkr: 0.01, skrForUsd10: 1000, devnet: true, label: "Demo SOL/USD quote" }),
    faucet: async () => {
      if (faucetUsed) throw new ApiError("FAUCET_USED", "mock: faucet already used", 429);
      faucetUsed = true;
      await ack(ctx);
      addedSkr += 5000n * SKR_UNIT;
      return { signature: randomHex(32), amount: 5000n * SKR_UNIT };
    },
  };
}

/** sampleData.inbox ids → the InboxItem type they represent. */
const INBOX_TYPE: Record<string, InboxItem["type"]> = { inv: "invite", rev: "review", clm: "claim", rm: "rematch", ng: "nudge", rc: "recap", st: "started", fl: "bounty" };
/** sampleData times ("20m", "2h", "1d", "Mon", "00:01") → seconds ago, roughly. */
function ago(t: string): number {
  const m = t.match(/^(\d+)([mhd])$/);
  if (m) return Number(m[1]) * ({ m: 60, h: 3600, d: 86400 } as const)[m[2] as "m" | "h" | "d"];
  return t.includes(":") ? 9 * 3600 : 3 * 86400;
}

/**
 * The prototype's inbox, with refs resolved against the mock store so every action opens a real
 * (mock) Oath. Items whose Oath doesn't exist in this scenario are left out.
 */
function inboxRef(id: string, wallet: string): InboxItem["ref"] | null {
  const oath = (name: string, mine = true) => mockOaths.byName(name, mine ? wallet : null);
  const active = (name: string) => mockOaths.list(wallet).find((o) => o.name === name && o.status === "active");
  switch (id) {
    case "inv1": { const o = oath("Dawn Run", false); return o && !o.members.some((m) => m.wallet === wallet) ? { oath: o.id, code: o.inviteCode ?? "" } : null; }
    // The vote request goes once I've voted (or it's decided), like the invite once I've joined.
    case "rev1": {
      const o = active("Iron Week");
      if (!o?.day1StartsAt || !o.members.some((m) => m.wallet !== wallet && m.proofToday === "review")) return null;
      mockReviews.seedFor(o.id, o.objectId, o.members.map((m) => m.wallet), Math.floor((clock.now() / 1000 - o.day1StartsAt) / o.daySeconds));
      return mockReviews.openFor(o.id, wallet).length ? { oath: o.id } : null;
    }
    case "ng1": { const o = active("Iron Week"); return o ? { oath: o.id } : null; }
    case "clm1": { const o = oath("Hydra 14"); return o && !o.members.find((m) => m.wallet === wallet)?.claimed ? { oath: o.id } : null; }
    case "rm1": { const o = oath("Guitar Days"); return o ? { oath: o.id } : null; }
    case "rc1": return {};
    case "st1": { const b = mockBounties.byName("Hydrate Week"); return b ? { bounty: b.id } : null; }
    case "fl1": { const b = mockBounties.byName("Hydrate Week"); return b ? { bounty: b.id } : null; }
    default: return null;
  }
}

const INBOX_ACTOR: Record<string, string> = { inv1: PEOPLE.riya.wallet, rev1: PEOPLE.dev.wallet, ng1: PEOPLE.riya.wallet };

export function mockInbox(ctx: MockContext): InboxApi {
  const done = new Set<string>();
  const wire = () => {
    // Signed out: nothing to show (seeding for a stand-in wallet would replace the user's Oaths).
    const wallet = ctx.wallet();
    if (wallet) mockOaths.ensureSeeded(ctx.scenario(), wallet);
    const items = !wallet || ctx.scenario() === "fresh" ? [] : sampleData.inbox.flatMap((n) => {
      const ref = inboxRef(n.id, wallet);
      if (!ref) return [];
      return [{
        id: n.id,
        type: INBOX_TYPE[n.id.replace(/\d+$/, "")] ?? "recap",
        // reference/kept-kit.js › INBOX: Riya invites and nudges, Dev asks for the vote.
        actor: INBOX_ACTOR[n.id] ?? null,
        title: n.title,
        body: n.body,
        createdAt: new Date(clock.now() - ago(n.time) * 1000).toISOString(),
        needsAction: n.actions.length > 0,
        done: done.has(n.id),
        ref,
      }];
    });
    return { items, unread: items.filter((i) => i.needsAction && !i.done).length };
  };
  return {
    list: () => respond(ctx, InboxResponse, wire()),
    markDone: async (ids) => { ids.forEach((id) => done.add(id)); await ack(ctx); },
  };
}

export function mockInvites(ctx: MockContext): InvitesApi {
  const oath = () => ({
    oathId: "1", creator: MOCK_WALLET, mint: "11111111111111111111111111111111", goalHash: "0".repeat(64), status: 0, startTs: 0, daySeconds: 86400, numDays: 7, objectId: 0,
    members: [MOCK_WALLET], daysKept: {},
  });
  return {
    create: () => respond(ctx, InviteCreateResponse, { code: "IRON-7K2Q", deepLink: "kept://join/IRON-7K2Q", oath: oath() }),
    resolve: async (code) => {
      if (!/^[A-Z]+-[A-Z0-9]{4}$/i.test(code)) throw new ApiError("INVITE_NOT_FOUND", "mock: unknown code", 404);
      return respond(ctx, InviteResolveResponse, { oath: oath(), goalText: sampleData.inbox[0]?.body ?? null, alreadyStarted: false });
    },
  };
}

export function mockNotify(ctx: MockContext): NotifyApi {
  return { registerPushToken: () => ack(ctx), nudge: () => ack(ctx) };
}

/** The prototype's people (I1, I2, I2·p), from copy.json. */
function personProfile(wallet: string): z.input<typeof Profile> {
  const short = `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
  if (wallet === PEOPLE.riya.wallet) {
    return { wallet, name: t("screens.I2.b0.name"), handle: t("screens.I2.b0.handle"), avatar: PEOPLE.riya.avatar, banner: 1, bio: t("screens.I2.b0.bio"),
      socials: [{ kind: "x", handle: t("screens.I2.b0.social.0") }, { kind: "telegram", handle: t("screens.I2.b0.social.1") }], verifiedSeeker: true, keptRate: { rate: PEOPLE.riya.keptRate, days: PEOPLE.riya.rateDays }, visibility: "public" };
  }
  if (wallet === PEOPLE.arjun.wallet) {
    return { wallet, name: t("screens.I2·p.b0.name"), handle: t("screens.I2·p.b0.handle"), avatar: PEOPLE.arjun.avatar, banner: 3, bio: "",
      socials: [], verifiedSeeker: true, keptRate: { rate: PEOPLE.arjun.keptRate, days: PEOPLE.arjun.rateDays }, visibility: "private" };
  }
  const known = Object.values(PEOPLE).find((p) => p.wallet === wallet);
  return { wallet, name: known ? `${known.name.toLowerCase()}.skr` : short, handle: short, avatar: known?.avatar ?? "00000000", banner: 2, bio: "",
    socials: [], verifiedSeeker: true, keptRate: { rate: known?.keptRate ?? null, days: known?.rateDays ?? 0 }, visibility: "members" };
}

export function mockProfile(ctx: MockContext): ProfileApi {
  let saved: z.input<typeof Profile> | null = null;
  const fresh = () => ctx.scenario() === "fresh";
  const base = (): z.input<typeof Profile> => saved ?? {
    wallet: ctx.wallet() ?? MOCK_WALLET, name: fresh() ? "" : t("screens.I1.b1.name"), handle: shortOf(ctx.wallet() ?? MOCK_WALLET), avatar: "31205140", banner: 0,
    bio: fresh() ? "" : t("screens.I1.b1.bio"), socials: fresh() ? [] : [{ kind: "x", handle: t("screens.I1.b1.social.0") }],
    verifiedSeeker: ctx.scenario() !== "notEligible", keptRate: fresh() ? { rate: null, days: 0 } : { rate: 0.91, days: 64 }, visibility: "members",
  };
  return {
    mine: () => respond(ctx, Profile, base()),
    save: (patch) => { saved = { ...base(), ...patch }; return respond(ctx, Profile, saved); },
    get: (wallet) => respond(ctx, Profile, personProfile(wallet)),
    stats: async () => {
      await ack(ctx);
      return fresh()
        ? { streak: 0, bestStreak: 0, keptRate: null, rateDays: 0, oaths: { kept: 0, broken: 0 }, bounties: { survived: 0, out: 0 } }
        : { streak: 12, bestStreak: 21, keptRate: 0.91, rateDays: 64, oaths: { kept: 41, broken: 9 }, bounties: { survived: 2, out: 1 } };
    },
    activity: async () => {
      await ack(ctx);
      if (fresh()) return [];
      // copy.json › sampleData.activity follows the prototype's ACT list (kept-kit.js); same order here.
      const TYPES: ActivityType[] = ["kept", "photo", "payout", "kept", "vote", "stake", "join", "claim", "broke"];
      const KIND: Record<ActivityType, ActivityItem["kind"]> = { kept: "proof", photo: "proof", payout: "money", vote: "oath", stake: "money", join: "oath", claim: "money", broke: "oath" };
      return sampleData.activity.map((a, i) => {
        const type = TYPES[i] ?? (a.amount ? "payout" : "kept");
        return { id: `act-${i}`, day: a.day, title: a.title, sub: a.sub, amount: a.amount, kind: KIND[type], type };
      });
    },
    creator: async (name) => {
      await ack(ctx);
      const drift = name === t("screens.I3.b0.brand");
      return {
        // Drift's covers are blue in Design.pdf (I3, H1–H3): the brand palette 3, as in bounties/mockStore.
        name, logo: name.replace("@", "").slice(0, 1).toUpperCase(), palette: drift ? 3 : 2, verified: true,
        tagline: drift ? t("screens.I3.b0.msg") : name, bio: drift ? t("screens.I3.b1.text") : "",
        hosted: drift ? 6 : 1, paidOut: BigInt(drift ? 310_400 : 0) * SKR_UNIT, followers: drift ? 2140 : 0,
        links: drift ? [0, 1, 2].map((i) => ({ title: t(`screens.I3.b3.r${i}.t` as CopyKey), kind: t(`screens.I3.b3.r${i}.s` as CopyKey) })) : [],
      };
    },
  };
}
const shortOf = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

function randomHex(bytes: number): string {
  return Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
}
