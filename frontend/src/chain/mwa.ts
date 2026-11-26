// Mobile Wallet Adapter session, ported from the old harness app's chain/wallet.ts. The wallet's
// auth_token is remembered so the user connects once; later requests re-authorize silently and fall
// back to a full authorize if the wallet rejects the token. It's a credential, so it's kept in
// expo-secure-store (Android Keystore); an older build's AsyncStorage copy is moved on first read.
// The identity the wallet sees is the build's (EXPO_PUBLIC_APP_IDENTITY_*) or, with Settings › "Wallet identity: KEPT's
// own site" on, VERIFIED_IDENTITY; a token belongs to the identity it was issued for and is dropped when that changes.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { secureStore } from "@/lib/secureStore";
import { AppState } from "react-native";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { TransactionInstruction } from "@solana/web3.js";
import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import type { Web3MobileWallet } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { env, walletChain } from "@/config/env";
import { classifyTxError } from "./classify";
import { connection } from "./connection";
import { signatureFromSigned } from "./signature";
import { decodeInstructions } from "@kept/chain";
import { useSettings } from "@/state/settings";
import { awaitTxConfirmation, beginTx, endTx, showTx } from "@/state/txExplain";
import type { WalletSession } from "./types";

const STORAGE_KEY = "kept.mwa";
/** How long to wait for the app to be in front again after the wallet returns. */
const FOREGROUND_WAIT_MS = 30_000;

/**
 * KEPT's own site (repo site/): its /.well-known/assetlinks.json grants `delegate_permission/common.get_login_creds` to
 * the debug and release signing keys, so a wallet can verify the app is who it says it is.
 */
export const VERIFIED_IDENTITY = { name: "KEPT", uri: "https://kept-keeper.vercel.app" } as const;
const verifiedOn = (): boolean => useSettings.getState().verifiedIdentity;
/** The identity the wallet is asked with: KEPT's own site when the setting is on, else the build's. */
export const walletIdentity = (): { name: string; uri: string } =>
  verifiedOn() ? { ...VERIFIED_IDENTITY } : { name: env.identity.name, uri: env.identity.uri };

/** `identity`: the URI the token was issued for (a token saved before it was recorded: the build's). */
type Saved = { authToken: string; address: string; identity?: string };
let saved: Saved | null | undefined;

async function load(): Promise<Saved | null> {
  if (saved !== undefined) return saved;
  try {
    let raw = await secureStore.getItem(STORAGE_KEY);
    const legacy = await AsyncStorage.getItem(STORAGE_KEY);
    if (legacy !== null) {
      if (raw === null) { raw = legacy; await secureStore.setItem(STORAGE_KEY, legacy); }
      await AsyncStorage.removeItem(STORAGE_KEY);
    }
    saved = raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    saved = null;
  }
  return saved;
}
async function save(next: Saved | null): Promise<void> {
  saved = next;
  try {
    if (next) await secureStore.setItem(STORAGE_KEY, JSON.stringify(next));
    else await secureStore.deleteItem(STORAGE_KEY);
  } catch {
    // Best effort: the in-memory session still works for this run.
  }
}

/**
 * Silent re-authorization with the saved auth token is only used when the wallet has verified KEPT's identity.
 * Phantom declines `reauthorize` for a dApp whose identity URI isn't linked to the app with the
 * `delegate_permission/common.get_login_creds` relation in its assetlinks.json. KEPT's own site (VERIFIED_IDENTITY)
 * grants it for the debug and release signing keys, so the Settings switch and builds with
 * EXPO_PUBLIC_APP_IDENTITY_VERIFIED=1 re-authorize silently.
 */
const reauthorizeAllowed = (): boolean => verifiedOn() || env.identity.verified;

/** The saved token, if it was issued for this identity; one issued for another identity is dropped. */
async function tokenFor(uri: string): Promise<Saved | null> {
  const prev = await load();
  if (!prev) return null;
  if ((prev.identity ?? env.identity.uri) === uri) return prev;
  await save(null);
  return null;
}

async function authorize(wallet: Web3MobileWallet): Promise<PublicKey> {
  const identity = walletIdentity();
  const prev = await tokenFor(identity.uri);
  let auth;
  if (prev && reauthorizeAllowed()) {
    try {
      auth = await wallet.authorize({ chain: walletChain, identity, auth_token: prev.authToken });
    } catch {
      await save(null); // revoked or expired: ask again below
    }
  }
  auth ??= await wallet.authorize({ chain: walletChain, identity });
  const account = auth.accounts[0];
  if (!account) throw new Error("Wallet authorized but returned no account");
  const key = new PublicKey(Buffer.from(account.address, "base64"));
  await save({ authToken: auth.auth_token, address: key.toBase58(), identity: identity.uri });
  return key;
}

function waitForForeground(): Promise<void> {
  if (AppState.currentState === "active") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { sub.remove(); reject(new Error("App did not return to the foreground after the wallet")); }, FOREGROUND_WAIT_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") { clearTimeout(timer); sub.remove(); resolve(); }
    });
  });
}

async function run<T>(fn: (w: Web3MobileWallet) => Promise<T>): Promise<T> {
  try {
    const r = await transact(fn);
    await waitForForeground();
    return r;
  } catch (e) {
    throw classifyTxError(e);
  }
}

export const mwaWallet: WalletSession = {
  connect: async () => (await run(authorize)).toBase58(),
  signMessage: (message) => run(async (w) => {
    const key = await authorize(w);
    const payload = new TextEncoder().encode(message);
    const [signed] = await w.signMessages({ addresses: [Buffer.from(key.toBytes()).toString("base64")], payloads: [payload] });
    if (!signed) throw new Error("Wallet did not return a message signature");
    // The wallet returns message + signature; the backend wants the signature alone.
    return { wallet: key.toBase58(), signature: signatureFromSigned(signed, payload) };
  }),
  forget: () => save(null),
};

/**
 * Builds a transaction from instructions, simulates it (a rejected tx otherwise surfaces only as
 * "block height exceeded"), has the wallet sign and send it, and waits for confirmation. Used by
 * the real TxService in Phase 3.
 */
export async function signAndSend(payer: PublicKey, ixs: TransactionInstruction[]): Promise<string> {
  const { id, epoch } = beginTx();
  try {
    const c = connection();
    const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(...ixs);
    // Simulate with the payer's account returned, so the signing screen can say exactly how much SOL leaves the wallet.
    // The simulated balance already has the network fee taken off (checked on Devnet), so it is the full change.
    const [sim, before] = await Promise.all([
      c.simulateTransaction(tx, undefined, [payer]),
      c.getBalance(payer, "confirmed").catch(() => null),
    ]);
    if (sim.value.err) throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}\n${(sim.value.logs ?? []).join("\n")}`);
    const after = sim.value.accounts?.[0]?.lamports;
    showTx(id, {
      instructions: decodeInstructions(ixs, new PublicKey(env.programId)),
      walletChange: after !== undefined && before !== null ? BigInt(after) - BigInt(before) : null,
    });
    await awaitTxConfirmation(id, epoch); // the signing screen shows the explanation; the wallet opens on "Open wallet to sign"
    const minContextSlot = await c.getSlot("confirmed");
    const latest = await c.getLatestBlockhash("confirmed");
    tx.recentBlockhash = latest.blockhash;
    tx.lastValidBlockHeight = latest.lastValidBlockHeight;
    const [signature] = await run(async (w) => {
      const key = await authorize(w);
      if (!key.equals(payer)) throw new Error(`Wallet switched accounts: expected ${payer.toBase58()}, got ${key.toBase58()}`);
      return w.signAndSendTransactions({ transactions: [tx], minContextSlot }); // Phantom rejects without minContextSlot
    });
    if (!signature) throw new Error("The wallet returned no signature");
    const start = Date.now();
    const timeoutMs = 45_000;
    while (Date.now() - start < timeoutMs) {
      try {
        const status = await c.getSignatureStatus(signature, { searchTransactionHistory: true });
        if (status?.value) {
          if (status.value.err) throw new Error(`Transaction ${signature} failed on chain: ${JSON.stringify(status.value.err)}`);
          if (status.value.confirmationStatus === "confirmed" || status.value.confirmationStatus === "finalized") return signature;
        } else if (Date.now() - start > 15_000 && latest.lastValidBlockHeight !== undefined && (await c.getBlockHeight("confirmed")) > latest.lastValidBlockHeight) {
          break; // blockhash expired and the network never saw it: one last lookup below, then fail
        }
      } catch (pollErr: unknown) {
        if (pollErr instanceof Error && pollErr.message.includes("failed on chain")) throw pollErr;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    const txInfo = await c.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (txInfo) {
      if (txInfo.meta?.err) throw new Error(`Transaction ${signature} failed on chain: ${JSON.stringify(txInfo.meta.err)}`);
      return signature;
    }
    if (Date.now() - start > 15_000 && latest.lastValidBlockHeight !== undefined && (await c.getBlockHeight("confirmed")) > latest.lastValidBlockHeight) {
      throw new Error(`Transaction ${signature} expired before it landed (blockhash too old). Nothing was charged; try again.`);
    }
    throw new Error(`Transaction ${signature} confirmation timed out after 45s`);
  } catch (e) {
    throw classifyTxError(e);
  } finally {
    endTx(id);
  }
}
