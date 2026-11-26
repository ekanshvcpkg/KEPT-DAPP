import test from "node:test";
import assert from "node:assert/strict";
import { nudgeTargets } from "../src/v4/rules.js";
import { parseKeeper } from "../src/v4/reputation.js";
import { mockAllowlistActive } from "../src/genesis.js";

const base = { status: 1, members: ["me", "kept", "late", "nudged"], daysKept: { me: 0b10, kept: 0b10, late: 0b00, nudged: 0b00 }, viewer: "me", currentDay: 1, numDays: 3, nudgedToday: ["nudged"] };
const reasons = (input: typeof base) => Object.fromEntries(nudgeTargets(input).map((t) => [t.wallet, t.canNudge ? "yes" : t.reason]));

test("canNudge: only other members who have not checked in today and were not nudged today", () => {
  assert.deepEqual(reasons(base), { me: "self", kept: "already_checked_in", late: "yes", nudged: "already_nudged" });
});

test("canNudge is false for everyone when the Oath is not active or outside its days", () => {
  assert.deepEqual(Object.values(reasons({ ...base, status: 2 })), ["not_active", "not_active", "not_active", "not_active"]);
  assert.deepEqual(Object.values(reasons({ ...base, currentDay: 3 })), ["outside_day", "outside_day", "outside_day", "outside_day"]);
  assert.deepEqual(Object.values(reasons({ ...base, currentDay: -1 })), ["outside_day", "outside_day", "outside_day", "outside_day"]);
});

test("Keeper account parsing matches the V4 layout", () => {
  const data = Buffer.alloc(126);
  data.writeUInt16LE(5, 40); data.writeUInt16LE(14, 42); data.writeUInt32LE(3, 44); data.writeUInt32LE(2, 48);
  data.write("KEPTV4!!", 61, "latin1");
  assert.deepEqual(parseKeeper(data), { currentStreak: 5, bestStreak: 14, oathsKept: 3, oathsMissed: 2 });
  assert.equal(parseKeeper(Buffer.alloc(61)), "legacy", "pre-V4 account");
  assert.equal(parseKeeper(null), null);
});

test("the Devnet allowlist never applies on mainnet", () => {
  assert.equal(mockAllowlistActive(true, "https://devnet.helius-rpc.com/?api-key=x"), true);
  assert.equal(mockAllowlistActive(true, "https://mainnet.helius-rpc.com/?api-key=x"), false);
  assert.equal(mockAllowlistActive(false, "https://api.devnet.solana.com"), false);
});

test("identity and reputation expose the flat fields alongside the original ones", async () => {
  const { identityFields, reputationFields } = await import("../src/v4/reputation.js");
  assert.deepEqual(identityFields({ genesis: true, source: "genesis_token" }), { verifiedSeeker: true, method: "genesis_token" });
  assert.deepEqual(identityFields({ genesis: true, source: "devnet_allowlist" }), { verifiedSeeker: true, method: "devnet_allowlist" });
  assert.deepEqual(identityFields({ genesis: false, source: null }), { verifiedSeeker: false, method: "none" });
  assert.deepEqual(reputationFields({ kept: 12, missed: 2 }, { kept: 3, missed: 1 }), { kept: 12, missed: 2, oathsKept: 3, oathsBroken: 1 });
});

test('the Devnet mock allowlist: listed wallets, or every wallet with "*"', async () => {
  const { mockAllowed, mockAllowlistActive } = await import('../src/genesis.js');
  assert.equal(mockAllowed(['A', 'B'], 'A'), true);
  assert.equal(mockAllowed(['A', 'B'], 'C'), false);
  assert.equal(mockAllowed(['*'], 'C'), true);
  assert.equal(mockAllowed([], 'C'), false);
  assert.equal(mockAllowlistActive(true, 'https://api.mainnet-beta.solana.com'), false, 'never on mainnet, "*" or not');
});
