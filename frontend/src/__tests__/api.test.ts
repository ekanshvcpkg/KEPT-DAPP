import { SKR_UNIT } from "@kept/config";
import { createApi, createMockApi } from "@/api";
import type { Slice, SliceMode } from "@/api";
import { ApiError, fromRpcError, toApiError } from "@/api/errors";
import { timedFetch } from "@/chain/connection";
import { createHttpClient } from "@/api/http/client";
import { liveKeptRate } from "@/api/http/slices";
import { httpBounties } from "@/api/http/bounties";
import { MOCK_WALLET } from "@/api/mock/slices";
import { mockOaths } from "@/features/oaths/mockStore";
import type { Scenario } from "@/api/mock/scenarios";
import { clock } from "@/lib/clock";
import { SLICES } from "@/api/types";
import { classifyTxError } from "@/chain/classify";
import { createMockWallet } from "@/chain/mock";
import { signIn } from "@/features/auth";
import { defaultFlags } from "@/state/dev";
import { useSession } from "@/state/session";
import { Address, NonceResponse, PriceResponse } from "@kept/shared";

const allMock = Object.fromEntries(SLICES.map((s) => [s, "mock"])) as Record<Slice, SliceMode>;
function mockApi(scenario: Scenario = "activeGroup") {
  return createMockApi({ scenario: () => scenario, wallet: () => MOCK_WALLET, latencyMs: 0 });
}

describe("errors", () => {
  it("maps statuses per route, and the Genesis 403 by its message", () => {
    expect(toApiError("GET /api/invites/X", 404, { error: "Invite not found" }).code).toBe("INVITE_NOT_FOUND");
    expect(toApiError("POST /api/faucet", 429, { error: "used" }).code).toBe("FAUCET_USED");
    expect(toApiError("GET /api/me", 409, { error: "bound" }).code).toBe("GENESIS_TAKEN");
    expect(toApiError("GET /api/price", 403, { error: "A Seeker Genesis Token is required" }).code).toBe("NOT_ELIGIBLE");
    expect(toApiError("POST /api/nudges", 403, { error: "Not a member" }).code).toBe("UNAUTHORIZED");
    expect(toApiError("GET /api/price", 500, "boom").code).toBe("SERVER");
  });
  it("prefers a code the backend sends (BACKEND_GAPS P1-14)", () => {
    expect(toApiError("POST /api/x", 400, { error: "late", code: "OATH_STARTED" }).code).toBe("OATH_STARTED");
  });
});

describe("http client", () => {
  const ok = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  it("sends the bearer token and validates the response", async () => {
    const fetchImpl = jest.fn(() => ok({ message: "sign me" }));
    const c = createHttpClient(() => "tok", "http://api", fetchImpl as unknown as typeof fetch);
    await expect(c.post("/api/auth/nonce", { wallet: MOCK_WALLET }, NonceResponse)).resolves.toEqual({ message: "sign me" });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });
  it("gives up on a request that doesn't answer (timeout → OFFLINE, retryable)", async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal!.addEventListener("abort", () => reject(new Error("Aborted")));
    })) as unknown as typeof fetch;
    const c = createHttpClient(() => null, "http://api", hang, 30);
    await expect(c.get("/api/me", NonceResponse)).rejects.toMatchObject({ code: "OFFLINE", retryable: true, message: expect.stringContaining("No answer") });
  });
  it("turns a network failure into OFFLINE and a bad body into SERVER", async () => {
    const down = createHttpClient(() => null, "http://api", (() => Promise.reject(new TypeError("Network request failed"))) as unknown as typeof fetch);
    await expect(down.get("/api/me", NonceResponse)).rejects.toMatchObject({ code: "OFFLINE" });
    const odd = createHttpClient(() => null, "http://api", (() => ok({ nope: 1 })) as unknown as typeof fetch);
    await expect(odd.get("/api/me", NonceResponse)).rejects.toMatchObject({ code: "SERVER" });
  });
  it("rejects the old placeholder quote shape used by the stale API build", async () => {
    const oldQuote = { usdPerSkr: 0.01, skrForUsd10: 1000, devnet: true, label: "placeholder rate" };
    const c = createHttpClient(() => "token", "http://api", (() => ok(oldQuote)) as unknown as typeof fetch);
    await expect(c.get("/api/price", PriceResponse)).rejects.toMatchObject({ code: "SERVER" });
  });
  it("accepts the current signed-in SOL quote shape", async () => {
    const quote = { usdPerSol: 100, usdPerSkr: 0.01, skrForUsd10: 1000, devnet: true, label: "Coinbase SOL/USD spot" };
    const c = createHttpClient(() => "token", "http://api", (() => ok(quote)) as unknown as typeof fetch);
    await expect(c.get("/api/price", PriceResponse)).resolves.toEqual(quote);
  });
});

describe("createApi", () => {
  it("picks http or mock per slice", () => {
    const mock = mockApi();
    const api = createApi({ ...allMock, auth: "http" }, mock, () => null);
    expect(api.inbox).toBe(mock.inbox);
    expect(api.auth).not.toBe(mock.auth);
  });
});

describe("flags", () => {
  it("Demo is the mock for every slice; Live and not-chosen are http for every slice", () => {
    expect(SLICES.every((s) => defaultFlags("demo")[s] === "mock")).toBe(true);
    expect(SLICES.every((s) => defaultFlags("live")[s] === "http")).toBe(true);
    expect(SLICES.every((s) => defaultFlags(null)[s] === "http")).toBe(true);
  });
});

describe("mock api", () => {
  it("fixtures pass the shared schemas", () => {
    expect(Address.safeParse(MOCK_WALLET).success).toBe(true);
  });
  it("inbox unread counts items needing action, and markDone clears them", async () => {
    const api = mockApi();
    const first = await api.inbox.list();
    expect(first.unread).toBe(first.items.filter((i) => i.needsAction).length);
    await api.inbox.markDone(["inv1"]);
    expect((await api.inbox.list()).unread).toBe(first.unread - 1);
  });
  it("the vote request leaves the inbox once I've voted", async () => {
    const api = mockApi("judges");
    const rev = (await api.inbox.list()).items.find((i) => i.id === "rev1");
    expect(rev?.ref.oath).toBeTruthy();
    const [open] = await api.reviews.openFor(rev!.ref.oath!, MOCK_WALLET);
    await api.reviews.vote(open!.id, MOCK_WALLET, false);
    expect((await api.inbox.list()).items.some((i) => i.id === "rev1")).toBe(false);
  });
  it("scenarios drive eligibility, balances and offline", async () => {
    expect((await mockApi("notEligible").auth.me()).genesis).toBe(false);
    expect((await mockApi().auth.me()).genesis).toBe(true);
    expect((await mockApi("noSkr").wallet.balances(MOCK_WALLET)).skr).toBe(620n * SKR_UNIT);
    await expect(mockApi("offline").inbox.list()).rejects.toBeInstanceOf(ApiError);
    expect((await mockApi("fresh").inbox.list()).items).toHaveLength(0);
  });
  it("the balance follows what this session staked and claimed", async () => {
    const api = mockApi("judges");
    await api.inbox.list(); // seeds the account
    const before = (await api.wallet.balances(MOCK_WALLET)).sol;
    const hydra = (await api.oaths.list(MOCK_WALLET)).find((o) => o.name === "Hydra 14")!;
    const won = mockOaths.claim(hydra.id, MOCK_WALLET);
    const dawn = mockOaths.byCode("DAWN-R7Q2")!;
    mockOaths.join(dawn.id, MOCK_WALLET);
    expect((await api.wallet.balances(MOCK_WALLET)).sol).toBe(before + won - dawn.stake);
    mockOaths.leave(dawn.id, MOCK_WALLET);
    expect((await api.wallet.balances(MOCK_WALLET)).sol).toBe(before + won);
  });
  it("faucet pays once", async () => {
    const api = mockApi();
    await expect(api.wallet.faucet()).resolves.toMatchObject({ amount: 5000n * SKR_UNIT });
    await expect(api.wallet.faucet()).rejects.toMatchObject({ code: "FAUCET_USED" });
  });
  it("the virtual clock jumps to the deadline and the next day", () => {
    clock.toDeadline();
    expect(new Date(clock.now()).getHours()).toBe(22);
    clock.endDay();
    expect(new Date(clock.now()).getHours()).toBe(0);
    clock.reset();
    expect(Math.abs(clock.now() - Date.now())).toBeLessThan(50);
  });
});

describe("sign-in", () => {
  beforeEach(() => useSession.getState().signOut());
  it("signs in with the wallet and stores token + Genesis", async () => {
    const r = await signIn(mockApi(), createMockWallet(() => "activeGroup", 0));
    expect(r).toEqual({ wallet: MOCK_WALLET, genesis: true });
    expect(useSession.getState().token).toBe(`mock.${MOCK_WALLET}`);
  });
  it("reports a declined signature as rejected", async () => {
    await expect(signIn(mockApi(), createMockWallet(() => "walletRejected", 0))).rejects.toMatchObject({ kind: "rejected" });
    expect(useSession.getState().token).toBeNull();
  });
  it("non-Seekers sign in with genesis false", async () => {
    expect((await signIn(mockApi("notEligible"), createMockWallet(() => "notEligible", 0))).genesis).toBe(false);
  });
});

describe("RPC failures (public Devnet)", () => {
  it.each([
    ["429 Too Many Requests: {\"jsonrpc\":\"2.0\",\"error\":{\"code\": 429}}", "RATE_LIMITED"],
    ["failed to get info about account x: TypeError: Network request failed", "OFFLINE"],
    ["RPC timed out after 20 s", "OFFLINE"],
    ["failed to get program accounts: Internal error", "SERVER"],
  ])("%s → %s, retryable", (message, code) => {
    expect(fromRpcError(new Error(message))).toMatchObject({ code, retryable: true });
  });
  it("a hung RPC request is dropped after the timeout", async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal!.addEventListener("abort", () => reject(new Error("Aborted")));
    })) as unknown as typeof fetch;
    await expect(timedFetch(30, hang)("http://rpc", {})).rejects.toThrow(/timed out/);
  });
});

describe("classifyTxError", () => {
  const protocol = (code: number) => Object.assign(new Error("x"), { name: "SolanaMobileWalletAdapterProtocolError", code });
  it.each([
    [protocol(-3), "rejected"],
    [Object.assign(new Error("x"), { name: "SolanaMobileWalletAdapterError", code: "ERROR_ASSOCIATION_CANCELLED" }), "rejected"],
    [new Error("Network request failed"), "offline"],
    [new Error("Simulation failed: Attempt to debit an account but found no record of a prior credit."), "insufficientSol"],
    [new Error("Program log: Error: insufficient funds\ncustom program error: 0x1"), "insufficientSkr"],
    [new Error("custom program error: 0x1771"), "failed"],
    [Object.assign(new Error("Found no installed wallet that supports the mobile wallet protocol."), { name: "SolanaMobileWalletAdapterError", code: "ERROR_WALLET_NOT_FOUND" }), "noWallet"],
  ])("%s → %s", (e, kind) => {
    expect(classifyTxError(e).kind).toBe(kind);
  });
});

describe("Live has no mock (D-80)", () => {
  it("composes no mock slice", () => {
    const mock = mockApi();
    const live = createApi(defaultFlags("live"), mock, () => null);
    for (const s of SLICES) expect(live[s]).not.toBe(mock[s]);
  });

  it("no import path from the http code reaches the mock", () => {
     
    const fs = require("fs") as typeof import("fs");
     
    const path = require("path") as typeof import("path");
    const src = path.join(__dirname, "..");
    const resolve = (from: string, spec: string): string | null => {
      const base = spec.startsWith("@/") ? path.join(src, spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(from), spec) : null;
      if (!base) return null; // packages: no mock lives there
      for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) if (fs.existsSync(base + ext)) return base + ext;
      return fs.existsSync(base) && fs.statSync(base).isFile() ? base : null;
    };
    const seen = new Set<string>();
    const reached: string[] = [];
    const walk = (file: string, chain: string[]) => {
      if (seen.has(file)) return;
      seen.add(file);
      const rel = path.relative(src, file);
      if (/^api\/mock\/|mockStore\.ts$|^chain\/mock\.ts$/.test(rel)) { reached.push([...chain, rel].join(" → ")); return; }
      const text = fs.readFileSync(file, "utf8");
      for (const m of text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)) {
        const next = resolve(file, m[1]!);
        if (next) walk(next, [...chain, rel]);
      }
    };
    for (const f of fs.readdirSync(path.join(src, "api/http"))) walk(path.join(src, "api/http", f), []);
    expect(seen.size).toBeGreaterThan(10); // the walk really follows imports
    expect(reached).toEqual([]);
  });
});

describe("Live kept rate (LIVE_DEMO_PLAN Q4)", () => {
  const rep = (percentage: number | null, sampleSize: number) => ({
    wallet: MOCK_WALLET, keptRate: { percentage, keptDays: 0, missedDays: 0, sampleSize },
    oathsKept: 0, oathsBroken: 0, streak: { current: 0, best: 0 }, bounties: { joined: 0, completed: 0, out: 0 },
  });
  it("is the backend's number as is, and New under 10 days", () => {
    expect(liveKeptRate(rep(null, 0))).toBeNull();
    expect(liveKeptRate(rep(100, 9))).toBeNull();
    expect(liveKeptRate(rep(87.5, 10))).toBe(0.875);
  });
});

describe("Live Bounties (LIVE_DEMO_PLAN Q3)", () => {
  const view = {
    id: 3, title: "Hydrate Week", objectId: 2, numDays: 7, daySeconds: 86400, startTs: 1_000, endTs: 1_000 + 7 * 86400, joinClosesAt: 1_000 + 86400,
    joinOpen: true, currentDay: 0, status: "ACTIVE", mint: "m", payer: "p", poolAmount: "50000000000", entrants: 4, stillIn: 3, estimatedShare: "1", paidAt: null,
  };
  const entry = { joined: true, daysKept: 0b11, out: false, outDay: null, payoutAmount: null, payoutSignature: null, paidAt: null };
  const backend = (me: unknown) => jest.fn((url: string, init?: RequestInit) => {
    const body = url.includes("recently-out") ? { bountyId: 3, total: 1, entries: [{ wallet: "W1", outDay: 1, outAt: "2026-10-10T10:00:00.000Z" }] }
      : init?.method === "POST" ? { bounty: view, me: entry } : { bounty: view, me };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });

  it("lists the one current Bounty, with its pool, entrants and who's out", async () => {
    const api = httpBounties(createHttpClient(() => "tok", "http://api", backend(null) as unknown as typeof fetch));
    const [b] = await api.list();
    expect(b).toMatchObject({ id: "bounty-3", name: "Hydrate Week", pool: 50_000n * SKR_UNIT, entrants: 4, remaining: 3, category: "Hydration", createdBy: null });
    expect(b!.recentlyOut).toEqual([{ name: expect.any(String), day: 2, at: expect.any(Number) }]);
    await expect(api.mine("bounty-3", MOCK_WALLET)).resolves.toBeNull();
    await expect(api.get("bounty-9")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(api.create({} as never, MOCK_WALLET)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("joining returns my entry as a stake-0 solo Oath on the Bounty's days", async () => {
    const api = httpBounties(createHttpClient(() => "tok", "http://api", backend(entry) as unknown as typeof fetch));
    const o = await api.join("bounty-3", MOCK_WALLET);
    expect(o).toMatchObject({ id: "bounty-3", bountyId: "bounty-3", stake: 0n, isSolo: true, day1StartsAt: 1_000, status: "active" });
    expect(o.members[0]).toMatchObject({ wallet: MOCK_WALLET, daysKept: 0b11 });
    await expect(api.mine("bounty-3", MOCK_WALLET)).resolves.toMatchObject({ bountyId: "bounty-3" });
  });
});
