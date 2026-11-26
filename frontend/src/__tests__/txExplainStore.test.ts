// Explain before sign: each signing owns its explanation; a closed signing screen cancels as a rejection.
import { awaitTxConfirmation, beginTx, endTx, showTx, signingScreenMounted, useTxExplain } from "@/state/txExplain";
import { classifyTxError } from "@/chain";

const ex = { instructions: [], walletChange: -1n };
beforeEach(() => useTxExplain.setState({ current: null, owner: null, screens: 0, epoch: 0, pending: null }, true));

it("a call that finishes late never clears a newer call's explanation or its waiting approval", async () => {
  const unmount = signingScreenMounted();
  const a = beginTx(); showTx(a.id, ex);
  const b = beginTx(); showTx(b.id, ex);
  const waiting = awaitTxConfirmation(b.id, b.epoch);
  endTx(a.id); // the old call's finally
  expect(useTxExplain.getState().current).toBe(ex);
  expect(useTxExplain.getState().pending).not.toBeNull();
  useTxExplain.getState().pending!.approve();
  await expect(waiting).resolves.toBeUndefined();
  unmount();
});

it("closing the signing screen rejects (as 'rejected') a call waiting for approval or not yet at the wallet", async () => {
  const unmount = signingScreenMounted();
  const a = beginTx(); showTx(a.id, ex);
  const waiting = awaitTxConfirmation(a.id, a.epoch);
  const b = beginTx(); // still simulating when the screen closes
  unmount();
  await expect(waiting).rejects.toMatchObject({ kind: "rejected" });
  await expect(awaitTxConfirmation(b.id, b.epoch)).rejects.toMatchObject({ kind: "rejected" });
  expect(classifyTxError(await awaitTxConfirmation(b.id, b.epoch).catch((e: unknown) => e)).kind).toBe("rejected");
});

it("with no signing screen to show it, signing goes straight to the wallet", async () => {
  const a = beginTx();
  await expect(awaitTxConfirmation(a.id, a.epoch)).resolves.toBeUndefined();
});
