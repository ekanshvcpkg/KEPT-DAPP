import test from "node:test";
import assert from "node:assert/strict";
import { InviteResolveResponse, MeResponse, OathFactsResponse, PriceResponse } from "./index";

const wallet = "52eWttmzYBJn4awLjEMB42bw5oTFvL4XC1gDqFAQgPxJ";
const oathRead = {
  oathId: "1", creator: wallet, mint: "11111111111111111111111111111111", goalHash: "a".repeat(64), status: 0, startTs: 0, daySeconds: 86400,
  numDays: 7, objectId: 0, members: [wallet], daysKept: { [wallet]: 0 },
};

test("existing routes: the shapes backend returns today parse", () => {
  assert.equal(MeResponse.parse({ wallet, genesis: true, mocked: true, genesisMint: "mock-sgt-x" }).genesis, true);
  assert.equal(PriceResponse.parse({ usdPerSol: 200, usdPerSkr: 0.01, skrForUsd10: 1000, devnet: true, label: "Coinbase SOL/USD spot" }).usdPerSol, 200);
  assert.equal(InviteResolveResponse.parse({ oath: oathRead, goalText: "lift", alreadyStarted: false }).oath.numDays, 7);
});

test("drift is caught: wrong types are rejected", () => {
  assert.equal(MeResponse.safeParse({ wallet, genesis: "yes", mocked: false, genesisMint: null }).success, false);
  assert.equal(InviteResolveResponse.safeParse({ oath: { ...oathRead, status: 9 }, goalText: null, alreadyStarted: false }).success, false);
});

test("amounts parse to bigint, times to unix seconds", () => {
  const f = OathFactsResponse.parse({
    oath: { ...oathRead, tzOffsetMinutes: 330, stake: "1000000000", isSolo: false },
    details: { goalText: null, name: "Iron Week", reviewMode: "ai_group" },
    today: { dayIndex: 2, dayEndsAt: "2026-10-09T18:30:00Z", proof: { [wallet]: "photo1" } },
  });
  assert.equal(f.oath.stake, 1_000_000_000n);
  assert.equal(f.today?.dayEndsAt, 1791570600);
  assert.deepEqual(f.reviewRequests, []);
});
