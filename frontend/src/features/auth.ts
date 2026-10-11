// Sign-in with Solana against the backend (docs/API.md › auth): connect the wallet, fetch the exact
// message to sign, sign it, verify it for a bearer token, then ask /api/me for the Genesis check.
import { Buffer } from "buffer";
import type { KeptApi } from "@/api";
import { isApiError } from "@/api";
import type { WalletSession } from "@/chain";
import { setUnauthorizedHandler } from "@/api/http/client";
import { queryClient } from "@/api/queries";
import { resetStack } from "@/app/nav";
import { t } from "@/copy";
import { notify } from "@/lib/notice";
import { useMode } from "@/state/mode";
import { useSession } from "@/state/session";

export type SignInResult = { wallet: string; genesis: boolean };

export async function signIn(api: KeptApi, wallet: WalletSession): Promise<SignInResult> {
  const address = await wallet.connect();
  const message = await api.auth.nonce(address);
  const signed = await wallet.signMessage(message);
  const { token, wallet: verified } = await api.auth.verify({ wallet: signed.wallet, message, signature: Buffer.from(signed.signature).toString("base64") });
  // Store the token before /api/me, which needs it.
  useSession.getState().signIn({ token, wallet: verified, genesis: false });
  let genesis = false;
  try {
    genesis = (await api.auth.me()).genesis;
  } catch (e) {
    // 409: this Genesis token is already bound to another wallet. The user can still play solo.
    if (!(isApiError(e) && e.code === "GENESIS_TAKEN")) throw e;
  }
  useSession.getState().setGenesis(genesis);
  return { wallet: verified, genesis };
}

/** On launch: is the stored token still good? Refreshes the Genesis flag. False means sign in again. */
export async function restoreSession(api: KeptApi): Promise<boolean> {
  const { token, signOut, setGenesis } = useSession.getState();
  if (!token) return false;
  try {
    setGenesis((await api.auth.me()).genesis);
    return true;
  } catch (e) {
    if (isApiError(e) && e.code === "UNAUTHORIZED") { signOut(); return false; }
    // Offline or server trouble: keep the session and let the app open; screens show M2 / errors.
    return true;
  }
}

/**
 * The backend rejected the stored token mid-session (expired after 7 days, or revoked): sign out, say
 * so, and go to Connect wallet (A2) with A1 under it. Live only; Demo's token never expires.
 */
function expireSession(): void {
  if (useMode.getState().mode !== "live" || !useSession.getState().token) return;
  useSession.getState().signOut();
  queryClient.clear();
  notify(t("additions.session.expired"));
  resetStack(["A1", "A2"]);
}
setUnauthorizedHandler(expireSession);
