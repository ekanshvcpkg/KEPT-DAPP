// Explain before sign: the signing screen's plain-words view of the transaction in the wallet.
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { createOathSolIx, decodeInstructions } from "@kept/chain";
import { explainRows } from "@/features/keeper/explain";

const programId = new PublicKey("7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj");
const me = new PublicKey("EnD2dXFruNSTBTrZsmVT2wtDuewATAvo2hfoNqwun6hg");
const env = { programId, stakeMint: me, treasury: me, treasuryAuthority: me, tokenProgram: me };

it("says what a create does, flags a foreign instruction, and shows the wallet's simulated change", () => {
  const { ix, oath } = createOathSolIx(env, { creator: me, oathId: 1n, goalText: "read", objectId: 1, numDays: 3, daySeconds: 120, tzOffsetMinutes: 0, stake: 70_288_887n, isSolo: true });
  const rows = explainRows({ instructions: decodeInstructions([ix, SystemProgram.transfer({ fromPubkey: me, toPubkey: oath, lamports: 1 })], programId), walletChange: -73_102_727n });
  expect(rows[0]).toEqual({ title: "Stake 0.070288887 SOL in a new Oath (solo)", sub: `3 days · 2 min each · Oath ${oath.toBase58().slice(0, 4)}…${oath.toBase58().slice(-4)}` });
  expect(rows[1]).toMatchObject({ title: "Not a KEPT instruction", warn: true });
  expect(rows[2]).toMatchObject({ title: "Your wallet", value: "−0.073102727 SOL" });
});
