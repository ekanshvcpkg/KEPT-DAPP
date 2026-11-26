// The transaction the wallet is being asked to sign, decoded and simulated (chain/mwa.ts › signAndSend), so the signing
// screen can show what it does BEFORE the wallet opens ("explain before sign"). While a signing screen is mounted,
// signAndSend waits for its "Open wallet to sign" tap; with no screen to show it, it goes straight to the wallet.
// Each signAndSend owns its state by id: a call that finishes late never clears a newer call's explanation, and a
// signing screen that closes (epoch bump) turns a call that hasn't reached the wallet yet into a rejection.
import { create } from "zustand";
import type { DecodedInstruction } from "@kept/chain";
import { TxFailure } from "@/chain/types";

export type TxExplanation = {
  instructions: DecodedInstruction[];
  /** The fee payer's balance change if the transaction lands (simulation, fee included): negative = SOL out. */
  walletChange: bigint | null;
};

type State = {
  current: TxExplanation | null;
  /** The signAndSend call that owns `current` / `pending`. */
  owner: number | null;
  /** Signing screens currently mounted that can show an explanation and confirm it. */
  screens: number;
  /** Bumped when a signing screen closes: calls begun before it are cancelled before they reach the wallet. */
  epoch: number;
  /** Set while signAndSend waits: approve opens the wallet, cancel ends signing as a rejection. */
  pending: { approve: () => void; cancel: () => void } | null;
};

export const useTxExplain = create<State>(() => ({ current: null, owner: null, screens: 0, epoch: 0, pending: null }));

const cancelled = () => new TxFailure("rejected", "Signing was cancelled before the wallet opened");
let seq = 0;

/** Starts a signing: its id, and the screen epoch it began in. */
export function beginTx(): { id: number; epoch: number } {
  return { id: ++seq, epoch: useTxExplain.getState().epoch };
}

export function showTx(id: number, current: TxExplanation): void {
  useTxExplain.setState({ current, owner: id, pending: null });
}

/** Clears the explanation only if this call still owns it. */
export function endTx(id: number): void {
  if (useTxExplain.getState().owner === id) useTxExplain.setState({ current: null, owner: null, pending: null });
}

/** Waits for the signing screen's go-ahead, if one is mounted; rejects if the screen closed since the call began. */
export function awaitTxConfirmation(id: number, epoch: number): Promise<void> {
  const s = useTxExplain.getState();
  if (s.epoch !== epoch) return Promise.reject(cancelled());
  if (s.screens === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { if (useTxExplain.getState().owner === id) useTxExplain.setState({ pending: null }); };
    useTxExplain.setState({ pending: { approve: () => { done(); resolve(); }, cancel: () => { done(); reject(cancelled()); } } });
  });
}

/** A signing screen mounted / unmounted. Unmounting cancels whatever is waiting and anything not yet at the wallet. */
export function signingScreenMounted(): () => void {
  useTxExplain.setState((s) => ({ screens: s.screens + 1 }));
  return () => {
    useTxExplain.getState().pending?.cancel();
    useTxExplain.setState((s) => ({ screens: s.screens - 1, epoch: s.epoch + 1 }));
  };
}
