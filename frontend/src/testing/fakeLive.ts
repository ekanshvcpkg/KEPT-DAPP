// Test stand-ins for the two things around Live sign-in, speaking the same bytes as the real ones:
//  - the wallet app behind MWA `transact`: authorize, and signMessages that answers with the message
//    followed by its 64-byte ed25519 signature (the MWA signed payload), like Phantom and Seed Vault;
//  - the backend's auth routes (backend/src/auth.ts, routes/v4.ts): the exact nonce message, verification of a
//    bare 64-byte signature over it, and GET /api/me behind the bearer token.
// Live tests use these instead of Dev-menu mocks: Live has no mock path (D-80), so it is faked at the edge.
import { createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";

const DER_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

interface FakeWallet {
  /** The wallet's account, base58. */
  address: string;
  authorize: jest.Mock;
  signMessages: jest.Mock;
}

export function fakeWallet(opts: { declines?: "authorize" | "sign" } = {}): FakeWallet {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const declined = () => Object.assign(new Error("User declined"), { name: "SolanaMobileWalletAdapterProtocolError", code: -1 });
  return {
    address: new PublicKey(raw).toBase58(),
    authorize: jest.fn(async () => {
      if (opts.declines === "authorize") throw declined();
      return { accounts: [{ address: b64(raw) }], auth_token: "fake-auth-token", wallet_uri_base: "https://wallet.invalid" };
    }),
    signMessages: jest.fn(async ({ payloads }: { addresses: string[]; payloads: Uint8Array[] }) => {
      if (opts.declines === "sign") throw declined();
      return payloads.map((p) => new Uint8Array(Buffer.concat([p, sign(null, p, privateKey)])));
    }),
  };
}

/** Routes MWA `transact` (mocked in jest.setup.js) to this wallet. */
export function installFakeWallet(w: FakeWallet): void {
  jest.mocked(transact).mockImplementation((async (cb: (api: unknown) => unknown) => cb(w)) as unknown as typeof transact);
}
/** Back to jest.setup.js's default: no wallet app. */
export function resetWallet(): void {
  jest.mocked(transact).mockImplementation((() => Promise.reject(new Error("MWA is not available in tests"))) as unknown as typeof transact);
}

interface FakeBackend {
  fetch: jest.Mock;
  /** "METHOD /path" of every request, in order. */
  calls: string[];
  /** The last /api/auth/verify body. */
  lastVerify: () => { wallet: string; message: string; signature: string } | undefined;
}

/**
 * The auth routes of backend/src. Anything else answers 404 like an unknown route.
 * `token` is what /api/me must receive; `genesis` is the Genesis verdict for every wallet.
 */
export function fakeBackend(opts: { genesis?: boolean } = {}): FakeBackend {
  const pending = new Map<string, string>();
  const calls: string[] = [];
  let verifyBody: { wallet: string; message: string; signature: string } | undefined;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const f = jest.fn(async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = `${init?.method ?? "GET"} ${url.pathname}`;
    calls.push(route);
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (route === "POST /api/auth/nonce") {
      let pk: string;
      try { pk = new PublicKey(String(body.wallet)).toBase58(); } catch { return json(400, { error: "Invalid wallet address" }); }
      const nonce = randomBytes(32).toString("hex");
      pending.set(pk, nonce);
      return json(200, { message: `KEPT V4 sign-in\nWallet: ${pk}\nNonce: ${nonce}\nThis signature only signs in and cannot move funds.` });
    }
    if (route === "POST /api/auth/verify") {
      verifyBody = body as { wallet: string; message: string; signature: string };
      const { wallet, message, signature } = verifyBody;
      const nonce = pending.get(wallet);
      pending.delete(wallet);
      const expected = `KEPT V4 sign-in\nWallet: ${wallet}\nNonce: ${nonce}\nThis signature only signs in and cannot move funds.`;
      const key = createPublicKey({ key: Buffer.concat([DER_PREFIX, new PublicKey(wallet).toBuffer()]), format: "der", type: "spki" });
      if (!nonce || message !== expected || !verify(null, Buffer.from(message), key, Buffer.from(signature, "base64"))) {
        return json(401, { error: "Invalid or expired sign-in signature" });
      }
      return json(200, { token: `fake.${wallet}`, wallet });
    }
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const m = /^Bearer fake\.(\w+)$/.exec(auth);
    if (!m) return json(401, { error: "Sign-in required" });
    if (route === "GET /api/me") return json(200, { wallet: m[1], genesis: opts.genesis ?? true, mocked: false, genesisMint: (opts.genesis ?? true) ? "FakeGenesisMint" : null });
    return json(404, { error: "Not found" });
  });
  return { fetch: f, calls, lastVerify: () => verifyBody };
}

/** Puts the fake backend behind the global `fetch` the HTTP client uses. */
export function installFakeBackend(b: FakeBackend): () => void {
  const real = global.fetch;
  global.fetch = b.fetch as unknown as typeof fetch;
  return () => { global.fetch = real; };
}
