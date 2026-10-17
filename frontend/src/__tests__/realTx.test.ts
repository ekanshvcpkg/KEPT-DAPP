// The real TxService's transactions, with the wallet and RPC stubbed: how many instructions go to the wallet.
import { Keypair, PublicKey } from "@solana/web3.js";
import { liveNativeSolOathsEnabled } from "@/config/env";
import { signAndSend } from "@/chain/mwa";
import { realTx } from "@/chain/realTx";
import { useSession } from "@/state/session";

const key = () => Keypair.generate().publicKey;
const TOKEN_2022 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const mockEnv = { programId: new PublicKey("6iXXBqsdiCnUTSVf8CW3Uuw8c7iYvZSj5haz64QMuMUh"), stakeMint: key(), treasury: key(), treasuryAuthority: key(), tokenProgram: TOKEN_2022 };

jest.mock("@/chain/mwa", () => ({ signAndSend: jest.fn(async () => "sig"), mwaWallet: {} }));
jest.mock("@/chain/program", () => ({ ...jest.requireActual("@/chain/program"), programEnv: async () => mockEnv }));
jest.mock("@/config/env", () => ({ ...jest.requireActual("@/config/env"), liveNativeSolOathsEnabled: jest.fn() }));

const input = { objectId: 3, numDays: 7, stake: 0n, goalText: "read", tzOffsetMinutes: 330, reviewMode: "ai" as const };
const instructionsSent = () => (jest.mocked(signAndSend).mock.calls.at(-1)![1] as { data: Buffer }[]);
const discriminator = (ix: { data: Buffer }) => Buffer.from(ix.data).subarray(0, 8).toString("hex");

beforeEach(() => {
  jest.mocked(signAndSend).mockClear();
  jest.mocked(liveNativeSolOathsEnabled).mockReturnValue(true);
  useSession.setState({ wallet: key().toBase58() });
});

describe("creating an Oath", () => {
  it("does not ask the wallet to sign a Live SOL Oath before deployment is enabled", async () => {
    jest.mocked(liveNativeSolOathsEnabled).mockReturnValue(false);
    await expect(realTx.createOath({ ...input, stake: 50_000_000n, isSolo: true })).rejects.toThrow(/disabled until the matching API and program are deployed/);
    expect(jest.mocked(signAndSend)).not.toHaveBeenCalled();
  });

  it("starts a solo Oath in the same transaction: one wallet approval, create then start", async () => {
    const r = await realTx.createOath({ ...input, stake: 50_000_000n, isSolo: true });
    expect(jest.mocked(signAndSend)).toHaveBeenCalledTimes(1);
    const ixs = instructionsSent();
    expect(ixs).toHaveLength(2);
    expect(discriminator(ixs[0]!)).not.toBe(discriminator(ixs[1]!)); // create_oath_sol, then start_oath
    expect(ixs[1]!.data).toHaveLength(8); // start_oath takes no arguments
    expect(r).toMatchObject({ signature: "sig", started: true });
  });

  it("sends only create for a group Oath, which waits for members", async () => {
    const r = await realTx.createOath({ ...input, isSolo: false, stake: 50_000_000n });
    expect(instructionsSent()).toHaveLength(1);
    expect(r.started).toBe(false);
  });
});
