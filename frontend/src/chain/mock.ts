// Mock wallet and TxService: scripted outcomes per Dev scenario, with SignStatus-like delays.
import { duration } from "@/theme";
import { MOCK_WALLET } from "@/api/mock/slices";
import { mockOaths } from "@/features/oaths/mockStore";
import type { Scenario } from "@/api/mock/scenarios";
import { devWait } from "@/state/dev";
import { TxFailure } from "./types";
import type { TxService, WalletSession } from "./types";

const wait = devWait;
const fakeSig = () => Array.from({ length: 88 }, () => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 58)]).join("");

/** The failure a scenario forces on any signature, if any. */
function forced(s: Scenario): TxFailure | null {
  switch (s) {
    case "walletRejected": return new TxFailure("rejected", "mock: user declined");
    case "txFailed": return new TxFailure("failed", "mock: transaction failed");
    case "noSol": return new TxFailure("insufficientSol", "mock: not enough SOL");
    case "noSkr": return new TxFailure("insufficientSkr", "mock: not enough SKR");
    case "offline": return new TxFailure("offline", "mock: offline");
    default: return null;
  }
}

export function createMockWallet(scenario: () => Scenario, delayMs: number = duration.signAuto): WalletSession {
  return {
    connect: async () => { await wait(delayMs / 2); return MOCK_WALLET; },
    signMessage: async () => {
      await wait(delayMs);
      // Only a decline applies to a message signature; nothing is paid.
      if (scenario() === "walletRejected") throw new TxFailure("rejected", "mock: user declined");
      return { wallet: MOCK_WALLET, signature: new Uint8Array(64) };
    },
    forget: async () => undefined,
  };
}

/** Mock transactions apply to the mock store, so the next read shows their effect. */
export function createMockTx(scenario: () => Scenario, wallet: () => string | null, delayMs: number = duration.signAuto): TxService {
  async function sign<T extends object>(effect: () => T): Promise<{ signature: string } & T> {
    await wait(delayMs);
    const f = forced(scenario());
    if (f) throw f;
    return { signature: fakeSig(), ...effect() };
  }
  const w = () => wallet() ?? MOCK_WALLET;
  return {
    createOath: (i) => sign(() => ({ oath: mockOaths.create({ wallet: w(), goal: i.habits?.join(" · ") ?? i.goalText, name: i.name, habits: i.habits, objectId: i.objectId, numDays: i.numDays, stake: i.stake, isSolo: i.isSolo, reviewMode: i.reviewMode }).id, started: false })),
    joinOath: (id) => sign(() => { mockOaths.join(id, w()); return {}; }),
    startOath: (id) => sign(() => { mockOaths.start(id); return {}; }),
    cancelOath: (id) => sign(() => { mockOaths.cancel(id); return {}; }),
    claim: (id) => sign(() => ({ amount: mockOaths.claim(id, w()) })),
    settle: () => sign(() => ({})),
    fundBounty: () => sign(() => ({})),
    joinRematch: () => sign(() => ({})),
  };
}
