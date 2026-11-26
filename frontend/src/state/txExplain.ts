// The transaction the wallet is being asked to sign, decoded and simulated (chain/mwa.ts › signAndSend), so the signing
// screen can show what it does BEFORE the wallet opens ("explain before sign"). While a signing screen is mounted,
// signAndSend waits for its "Open wallet to sign" tap; with no screen to show it, it goes straight to the wallet.
import { create } from "zustand";
import type { DecodedInstruction } from "@kept/chain";

export type TxExplanation = {
  instructions: DecodedInstruction[];
  /** The fee payer's balance change if the transaction lands (simulation, fee included): negative = SOL out. */
  walletChange: bigint | null;
};

type State = {
  current: TxExplanation | null;
  /** Signing screens currently mounted that can show an explanation and confirm it. */
  screens: number;
  /** Set while signAndSend waits: approve opens the wallet, cancel ends signing as a rejection. */
  pending: { approve: () => void; cancel: () => void } | null;
  set: (e: TxExplanation | null) => void;
};

export const useTxExplain = create<State>((set) => ({
  current: null, screens: 0, pending: null,
  set: (current) => set({ current, ...(current ? {} : { pending: null }) }),
}));

/** Waits for the signing screen's go-ahead, if one is mounted to show the explanation. */
export function awaitTxConfirmation(): Promise<void> {
  if (useTxExplain.getState().screens === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    useTxExplain.setState({
      pending: {
        approve: () => { useTxExplain.setState({ pending: null }); resolve(); },
        cancel: () => { useTxExplain.setState({ pending: null }); reject(new Error("User rejected the request")); },
      },
    });
  });
}
