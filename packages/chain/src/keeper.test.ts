import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, checkinsFromLogs, combinedHabitsHash, receiptHashOf } from "./keeper";

// The same receipt the backend hashes in backend/src/v4/keeper.ts: both sides must give this exact hash.
const RECEIPT = {
  v: 1, kind: "oath", wallet: "W", target: "O", dayIndex: 0, habit: 0, photoSha256: "ab", expected: { object: "book", gesture: "thumbs up" },
  challenge: { gesture: "Thumb_Up", slot: 1, blockhash: "bh", issuedAt: "2026-11-26T00:00:00.000Z" }, model: "m",
  verdict: { objectPresent: true, objectConfidence: 0.9, gestureSeen: "thumbs up", gestureMatches: true, looksLikeScreenOrPrintout: false, reason: "ok — ✓ \"q\"" },
  pass: true, checkedAt: "2026-11-26T00:00:01.000Z",
};

test("receipt hash matches the backend's (canonical JSON, key order independent)", () => {
  assert.equal(receiptHashOf(RECEIPT), "e4cce985886ed30026e4b8a300b760f52253ef63ff2ca462612a765df9b85f9e");
  const shuffled = Object.fromEntries(Object.entries(RECEIPT).reverse());
  assert.equal(receiptHashOf(shuffled), receiptHashOf(RECEIPT));
  assert.equal(canonicalJson({ b: [2, { d: 1, c: undefined }], a: null }), '{"a":null,"b":[2,{"d":1}]}');
});

test("combinedHabitsHash is SHA-256 of the receipt hashes in habit order", () => {
  // sha256(0x11 * 32 || 0x22 * 32), as backend/src/v4/habits.ts computes it.
  assert.equal(combinedHabitsHash(["1".repeat(64), "2".repeat(64)]), "5189c77d29fe5d546a045ec46986852785fea5c13ac7da9c115ff5fb6edf817c");
  assert.notEqual(combinedHabitsHash(["1".repeat(64), "2".repeat(64)]), combinedHabitsHash(["2".repeat(64), "1".repeat(64)]));
});

test("reads CheckinRecorded from a real Devnet record_checkin transaction's logs", () => {
  // Day 1 of the native-SOL E2E Oath 2CN2S6K8… (tx 3RTovBZB…, 2026-11-26); its proof_hash was sha256("e2e-<oath>-<member>-0").
  const logs = [
    "Program 7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj invoke [1]",
    "Program log: Instruction: RecordCheckin",
    "Program data: VQqzGXNXbH8RxNk5S+AmY6l96GNkbHGYyZ2RWqKYIVtcvuPnuD21CwAdv3OUbNmOBQ3OEQ0W9T6jh/zx8imKS7UpG7NZJ1AqADHHjiyRmpfW4Dq1/onwsCGsdxSIwibMJPv7MBi1UEOs",
    "Program data: not-an-event",
  ];
  assert.deepEqual(checkinsFromLogs(logs), [{
    oath: "2CN2S6K8CU97M3SkShsETNFm6GZWvyYsxiF6HSonxcpJ", member: "1TJw11wfUfYFm7R3kcKwQwkMagTvvZJ6tZNieY7yqPo", dayIndex: 0,
    proofHash: "31c78e2c919a97d6e03ab5fe89f0b021ac771488c226cc24fbfb3018b55043ac",
  }]);
});
