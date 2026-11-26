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

test("the Keeper says amounts rounded (screens keep exact values), in a line the backend voice gate accepts", () => {
  const { speakableAmounts, spokenSolChange } = jest.requireActual("@/lib/format") as typeof import("@/lib/format");
  expect(speakableAmounts("Stake 0.070786437 SOL in a new Oath (solo)")).toBe("Stake about 0.07 SOL in a new Oath (solo)");
  expect(speakableAmounts("Claim 1.254 SOL")).toBe("Claim about 1.25 SOL");
  expect(speakableAmounts("Pay 0.000005 SOL")).toBe("Pay less than 0.01 SOL");
  expect(speakableAmounts("Join Oath 73qH…RRsv")).toBe("Join Oath 73qH…RRsv");
  expect(spokenSolChange(-73_605_757n)).toBe("down about 0.07 SOL");
  expect(spokenSolChange(1_250_000_000n)).toBe("up about 1.25 SOL");
  expect(spokenSolChange(-5_000n)).toBe("down less than 0.01 SOL");
  expect(spokenSolChange(0n)).toBe("unchanged");
  expect(spokenSolChange(null)).toBe("not known");
  // The same pattern as backend/src/v4/voice.ts › SIGN_LINE (uncached lines are spoken only if they match it).
  const SIGN_LINE = /^[\p{L}\p{N} .,()…'’:+-]{3,110}\. Your wallet: (?:(?:down|up) (?:about \d{1,6}(?:\.\d{1,2})?|less than 0\.01) SOL|unchanged|not known)\. Sign only if that is what you meant\.$/u;
  const { t } = jest.requireActual("@/copy") as typeof import("@/copy");
  expect(SIGN_LINE.test(t("additions.keeper.saySign", { what: speakableAmounts("Stake 0.070786437 SOL in a new Oath (solo)"), change: spokenSolChange(-73_605_757n) }))).toBe(true);
});
