import { expect } from "chai";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { PublicKey } from "@solana/web3.js";
import { AccountLayout, AccountState, MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Clock, FailedTransactionMetadata, LiteSVM } from "litesvm";
import { AccountRole, Address, KeyPairSigner, address, appendTransactionMessageInstruction, createTransactionMessage, generateKeyPairSigner, lamports, pipe, setTransactionMessageFeePayerSigner, signTransactionMessageWithSigners } from "@solana/kit";
const idlJson = JSON.parse(readFileSync(path.join(__dirname, "..", "target", "idl", "kept_test.json"), "utf8"));

// The backend's payout preview (src/shared/payout.ts) lives in an ESM package this CommonJS suite cannot import,
// so load that exact file through the TypeScript compiler. Settlement results below must equal it.
type SettlementV2 = { payouts: bigint[]; slashed: bigint; toTreasury: bigint; carryover: bigint; dust: bigint };
const shared = (() => {
  const source = readFileSync(path.join(__dirname, "..", "..", "backend", "src", "shared", "payout.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} as any };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports as {
    calculatePayoutsV2(stake: bigint, successes: boolean[], fees: bigint, freeze: bigint): SettlementV2 | null;
    calculatePayouts(stake: bigint, feeBps: number, successes: boolean[]): { payouts: bigint[]; fee: bigint; dust: bigint } | null;
    feeForStake(stake: bigint, feeBps: number): bigint | null;
  };
})();

const PROGRAM = new PublicKey(idlJson.address);
const PROGRAM_ADDR = address(PROGRAM.toBase58());
const SO = path.join(__dirname, "..", "target", "deploy", "kept_test.so");
const TOKEN = address(TOKEN_PROGRAM_ID.toBase58());
const SYSTEM = address("11111111111111111111111111111111");
const LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const DAY = 86_400n;
const T0 = 10_000n;
const LEGACY_FEE_BPS = 1_000;
const FEE_BPS = 1_500;
const FREEZE_PRICE = 40n;
const START_BALANCE = 10_000_000_000n;
const OATH_BASE = 316;
const MEMBER = (i: number) => 139 + i * 44;

const disc = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const i16 = (n: number) => { const b = Buffer.alloc(2); b.writeInt16LE(n); return b; };
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const pk = (a: Address) => new PublicKey(a);
const addr = (p: PublicKey) => address(p.toBase58());
const W = AccountRole.WRITABLE, R = AccountRole.READONLY, WS = AccountRole.WRITABLE_SIGNER, RS = AccountRole.READONLY_SIGNER;
type Meta = { address: Address; role: AccountRole };
type Result = Awaited<ReturnType<LiteSVM["sendTransaction"]>>;

function logs(r: Result) { return r instanceof FailedTransactionMetadata ? r.meta().logs().join("\n") : "success"; }
function ok(r: Result) { expect(r, logs(r)).not.to.be.instanceOf(FailedTransactionMetadata); }
function fails(r: Result, code: string) { expect(r).to.be.instanceOf(FailedTransactionMetadata); expect(logs(r)).to.contain(code); }

type User = { signer: KeyPairSigner; token: Address; keeper: Address };

class Harness {
  svm = new LiteSVM(); admin!: KeyPairSigner; verifier!: KeyPairSigner; users: User[] = [];
  config!: Address; mint!: Address; treasury!: Address; reserve!: Address;
  oath!: Address; vault!: Address; oathId = 0n;

  static async create(members = 4) {
    const h = new Harness();
    h.svm.addProgramFromFile(PROGRAM_ADDR, SO);
    h.admin = await generateKeyPairSigner(); h.verifier = await generateKeyPairSigner();
    h.svm.airdrop(h.admin.address, lamports(10_000_000_000n)); h.svm.airdrop(h.verifier.address, lamports(1_000_000_000n));
    const mint = new PublicKey(randomBytes(32)); h.mint = addr(mint);
    const mintData = Buffer.alloc(82);
    MintLayout.encode({ mintAuthorityOption: 1, mintAuthority: pk(h.admin.address), supply: 1_000_000n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, mintData);
    h.put(h.mint, mintData, TOKEN);
    h.treasury = addr(new PublicKey(randomBytes(32))); h.put(h.treasury, h.tokenData(pk(h.admin.address), 0n), TOKEN);
    for (let i = 0; i < members; i++) {
      const signer = await generateKeyPairSigner(); h.svm.airdrop(signer.address, lamports(5_000_000_000n));
      const token = addr(new PublicKey(randomBytes(32))); h.put(token, h.tokenData(pk(signer.address), START_BALANCE), TOKEN);
      h.users.push({ signer, token, keeper: addr(PublicKey.findProgramAddressSync([Buffer.from("keeper"), pk(signer.address).toBuffer()], PROGRAM)[0]) });
    }
    h.config = addr(PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM)[0]);
    h.reserve = addr(PublicKey.findProgramAddressSync([Buffer.from("carryover"), mint.toBuffer()], PROGRAM)[0]);
    const [programData] = PublicKey.findProgramAddressSync([PROGRAM.toBuffer()], new PublicKey(LOADER));
    const loaderData = Buffer.alloc(45); loaderData.writeUInt32LE(3, 0); loaderData.writeBigUInt64LE(1n, 4); loaderData[12] = 1; pk(h.admin.address).toBuffer().copy(loaderData, 13);
    h.put(addr(programData), loaderData, address(LOADER));
    ok(await h.send(h.admin, [{ address: h.config, role: W }, { address: h.admin.address, role: WS }, { address: addr(programData), role: R }, { address: h.mint, role: R }, { address: h.treasury, role: W }, { address: TOKEN, role: R }, { address: SYSTEM, role: R }],
      Buffer.concat([disc("initialize_config"), pk(h.verifier.address).toBuffer(), u16(LEGACY_FEE_BPS)])));
    h.setTime(T0);
    return h;
  }

  tokenData(owner: PublicKey, amount: bigint) {
    const b = Buffer.alloc(165);
    AccountLayout.encode({ mint: pk(this.mint), owner, amount, delegateOption: 0, delegate: PublicKey.default, state: AccountState.Initialized, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, b);
    return b;
  }
  put(a: Address, data: Buffer, owner: Address = PROGRAM_ADDR) { this.svm.setAccount({ address: a, data, lamports: lamports(2_000_000_000n), programAddress: owner, executable: false, space: BigInt(data.length) }); }
  setTime(unix: bigint) { const c = this.svm.getClock(); this.svm.setClock(new Clock(c.slot, c.epochStartTimestamp, c.epoch, c.leaderScheduleEpoch, unix)); }
  async send(signer: KeyPairSigner, metas: Meta[], data: Buffer, remaining: Meta[] = []) {
    this.svm.expireBlockhash();
    const tx = await pipe(createTransactionMessage({ version: 0 }), (m) => setTransactionMessageFeePayerSigner(signer, m), (m) => this.svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),
      (m) => appendTransactionMessageInstruction({ programAddress: PROGRAM_ADDR, accounts: [...metas, ...remaining], data: new Uint8Array(data) }, m), (m) => signTransactionMessageWithSigners(m));
    return this.svm.sendTransaction(tx);
  }
  token(a: Address) { return AccountLayout.decode(Buffer.from(this.svm.getAccount(a).data)).amount; }
  data(a: Address) { return Buffer.from(this.svm.getAccount(a).data); }

  configure(feeBps = FEE_BPS, price = FREEZE_PRICE, signer = this.admin) {
    return this.send(signer, [{ address: this.config, role: W }, { address: signer.address, role: WS }, { address: this.mint, role: R }, { address: this.reserve, role: W }, { address: TOKEN, role: R }, { address: SYSTEM, role: R }],
      Buffer.concat([disc("configure_economics"), u16(feeBps), u64(price)]));
  }
  useOath(creator: User, id: bigint) {
    this.oathId = id;
    const oath = PublicKey.findProgramAddressSync([Buffer.from("oath"), pk(creator.signer.address).toBuffer(), u64(id)], PROGRAM)[0];
    this.oath = addr(oath); this.vault = addr(PublicKey.findProgramAddressSync([Buffer.from("vault"), oath.toBuffer()], PROGRAM)[0]);
  }
  createOath(creator: User, stake: bigint, numDays = 3) {
    this.useOath(creator, BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6)));
    return this.send(creator.signer, [{ address: this.config, role: R }, { address: this.oath, role: W }, { address: this.vault, role: W }, { address: creator.keeper, role: W }, { address: creator.signer.address, role: WS }, { address: this.mint, role: R }, { address: creator.token, role: W }, { address: this.treasury, role: R }, { address: TOKEN, role: R }, { address: SYSTEM, role: R }],
      Buffer.concat([disc("create_oath"), u64(this.oathId), Buffer.alloc(32, 8), Buffer.from([0, numDays]), u32(Number(DAY)), i16(330), u64(stake), Buffer.from([0])]));
  }
  join(u: User) {
    return this.send(u.signer, [{ address: this.config, role: R }, { address: this.oath, role: W }, { address: this.vault, role: W }, { address: u.keeper, role: W }, { address: u.signer.address, role: WS }, { address: this.mint, role: R }, { address: u.token, role: W }, { address: this.treasury, role: R }, { address: TOKEN, role: R }, { address: SYSTEM, role: R }], disc("join_oath"));
  }
  createOathSol(creator: User, stake: bigint, numDays = 3, isSolo = false) {
    this.useOath(creator, BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6)));
    return this.send(creator.signer, [{ address: this.config, role: R }, { address: this.oath, role: W }, { address: creator.keeper, role: W }, { address: creator.signer.address, role: WS }, { address: this.mint, role: R }, { address: this.treasury, role: R }, { address: SYSTEM, role: R }],
      Buffer.concat([disc("create_oath_sol"), u64(this.oathId), Buffer.alloc(32, 8), Buffer.from([0, numDays]), u32(Number(DAY)), i16(330), u64(stake), Buffer.from([isSolo ? 1 : 0])]));
  }
  joinOathSol(u: User) {
    return this.send(u.signer, [{ address: this.config, role: R }, { address: this.oath, role: W }, { address: u.keeper, role: W }, { address: u.signer.address, role: WS }, { address: this.mint, role: R }, { address: this.treasury, role: R }, { address: SYSTEM, role: R }], disc("join_oath_sol"));
  }
  creatorIx(u: User, name: "start_oath" | "cancel_oath") { return this.send(u.signer, [{ address: this.oath, role: W }, { address: u.signer.address, role: RS }], disc(name)); }
  settle(payer: User) {
    const keepers = Array.from({ length: this.memberCount() }, (_, i) => ({ address: this.memberKeeper(i), role: W }));
    return this.send(payer.signer, [{ address: this.config, role: R }, { address: this.oath, role: W }, { address: this.vault, role: W }, { address: this.treasury, role: W }, { address: this.mint, role: R }, { address: TOKEN, role: R }], disc("settle_oath"), keepers);
  }
  settleSol(payer: User) {
    const keepers = Array.from({ length: this.memberCount() }, (_, i) => ({ address: this.memberKeeper(i), role: W }));
    return this.send(payer.signer, [{ address: this.config, role: R }, { address: this.oath, role: W }, { address: this.treasury, role: R }, { address: this.mint, role: R }, { address: this.admin.address, role: W }], disc("settle_oath_sol"), keepers);
  }
  claim(u: User) { return this.send(u.signer, [{ address: this.oath, role: W }, { address: this.vault, role: W }, { address: this.mint, role: R }, { address: u.token, role: W }, { address: u.signer.address, role: RS }, { address: TOKEN, role: R }], disc("claim")); }
  claimSol(u: User) { return this.send(u.signer, [{ address: this.oath, role: W }, { address: u.signer.address, role: WS }], disc("claim_sol")); }
  buyFreeze(u: User) { return this.send(u.signer, [{ address: this.oath, role: W }, { address: this.vault, role: W }, { address: this.mint, role: R }, { address: u.token, role: W }, { address: u.signer.address, role: RS }, { address: TOKEN, role: R }], disc("buy_freeze")); }
  useFreeze(u: User, day: number) { return this.send(u.signer, [{ address: this.oath, role: W }, { address: u.signer.address, role: RS }], Buffer.concat([disc("use_freeze"), Buffer.from([day])])); }
  sweep(payer: User) { return this.send(payer.signer, [{ address: this.config, role: W }, { address: this.oath, role: W }, { address: this.vault, role: W }, { address: this.reserve, role: W }, { address: this.mint, role: R }, { address: TOKEN, role: R }], disc("sweep_carryover")); }

  sweepHeld(payer: User, treasury: Address = this.treasury) { return this.send(payer.signer, [{ address: this.config, role: R }, { address: this.oath, role: W }, { address: this.vault, role: W }, { address: treasury, role: W }, { address: this.mint, role: R }, { address: TOKEN, role: R }], disc("sweep_held")); }
  sweepHeldSol(payer: User, authority: Address = this.admin.address) { return this.send(payer.signer, [{ address: this.config, role: R }, { address: this.oath, role: W }, { address: this.treasury, role: R }, { address: this.mint, role: R }, { address: authority, role: W }], disc("sweep_held_sol")); }
  solBalance(a: Address) { const balance = this.svm.getBalance(a); if (balance === null) throw new Error(`No lamport balance for ${a}`); return BigInt(balance); }

  memberCount() { return this.data(this.oath)[138]; }
  memberKeeper(i: number) { return addr(PublicKey.findProgramAddressSync([Buffer.from("keeper"), this.data(this.oath).subarray(MEMBER(i), MEMBER(i) + 32)], PROGRAM)[0]); }
  payouts() { const d = this.data(this.oath); return Array.from({ length: d[138] }, (_, i) => d.readBigUInt64LE(MEMBER(i) + 36)); }
  status() { return this.data(this.oath)[136]; }
  /** Stand-in for verifier check-ins: sets each member's days_kept bitmask directly. */
  setDaysKept(masks: number[]) {
    const d = this.data(this.oath); masks.forEach((m, i) => d.writeUInt16LE(m, MEMBER(i) + 33));
    const balance = this.svm.getBalance(this.oath);
    if (balance === null) throw new Error("Oath account has no lamport balance");
    this.svm.setAccount({ address: this.oath, data: d, lamports: balance, programAddress: PROGRAM_ADDR, executable: false, space: BigInt(d.length) });
  }
  daysKept(i: number) { return this.data(this.oath).readUInt16LE(MEMBER(i) + 33); }
  terms() {
    const d = this.data(this.oath);
    if (d.length === OATH_BASE) return null;
    const t = d.subarray(OATH_BASE);
    return { tag: t.subarray(0, 8).toString("latin1"), version: t[8], feeBps: t.readUInt16LE(9), feePerMember: t.readBigUInt64LE(11), freezePrice: t.readBigUInt64LE(19),
      feesCollected: t.readBigUInt64LE(27), freezeProceeds: t.readBigUInt64LE(35), bought: t[43], used: t[44], frozen: [0, 1, 2, 3].map((i) => t.readUInt16LE(45 + i * 2)),
      treasuryPaid: t.readBigUInt64LE(53), carryover: t.readBigUInt64LE(61), swept: t[69] === 1, dust: t.readBigUInt64LE(70),
      missBps: t.readUInt16LE(78), heldTotal: t.readBigUInt64LE(80), heldReleaseTs: t.readBigInt64LE(88), heldSwept: t[96] === 1, brokeDayPlusOne: t[97] };
  }
  reserveTotal() { return this.data(this.config).readBigUInt64LE(139 + 50); }

  /** Creates a group Oath with `n` members, starts it at T0 and returns them. */
  async activeOath(n: number, stake: bigint) {
    this.setTime(T0);
    ok(await this.createOath(this.users[0], stake));
    for (let i = 1; i < n; i++) ok(await this.join(this.users[i]));
    ok(await this.creatorIx(this.users[0], "start_oath"));
    return this.users.slice(0, n);
  }
  /**
   * Rewrites a fresh rules v3 Oath into the rules v2 state the program used to create (fee on top of each stake,
   * freeze price, escrowed fees), so the v2 settlement path, which still serves existing v2 Oaths, stays covered.
   */
  forceV2(n: number, stake: bigint) {
    const f = shared.feeForStake(stake, FEE_BPS)!;
    const d = this.data(this.oath); const t = OATH_BASE;
    d[t + 8] = 2; d.writeUInt16LE(FEE_BPS, t + 9); d.writeBigUInt64LE(f, t + 11); d.writeBigUInt64LE(FREEZE_PRICE, t + 19); d.writeBigUInt64LE(f * BigInt(n), t + 27);
    d.writeUInt16LE(0, t + 78); this.put(this.oath, d);
    this.put(this.vault, this.tokenData(pk(this.oath), (stake + f) * BigInt(n)), TOKEN);
    for (let i = 0; i < n; i++) this.put(this.users[i].token, this.tokenData(pk(this.users[i].signer.address), START_BALANCE - stake - f), TOKEN);
  }
  /** A started Oath in rules v2 state (see forceV2). */
  async activeV2Oath(n: number, stake: bigint) { const users = await this.activeOath(n, stake); this.forceV2(n, stake); return users; }
  afterGrace(numDays = 3n) { this.setTime(T0 + numDays * DAY + DAY); }
}

const fee = (stake: bigint) => shared.feeForStake(stake, FEE_BPS)!;

describe("KEPT rules v2 economics", () => {
  it("IDL has the economics instructions", () => {
    const names = idlJson.instructions.map((i: any) => i.name);
    for (const name of ["configure_economics", "buy_freeze", "use_freeze", "sweep_carryover", "sweep_held"]) expect(names).to.include(name);
  });

  it("only the config admin can activate rules v2, and the fee/freeze price are validated", async () => {
    const h = await Harness.create(1);
    fails(await h.configure(FEE_BPS, FREEZE_PRICE, h.users[0].signer), "ConstraintHasOne");
    fails(await h.configure(10_001, FREEZE_PRICE), "InvalidFee");
    fails(await h.configure(FEE_BPS, 0n), "InvalidFreezePrice");
    ok(await h.configure());
    expect(h.token(h.reserve)).to.equal(0n, "locked carryover reserve created");
    ok(await h.configure(2_000, 99n)); // re-configuring keeps the same reserve
  });

  it("new Oaths record rules v3 and charge no entry fee, even after rules v2 were configured", async () => {
    const h = await Harness.create(2); ok(await h.configure());
    const [alice, bob] = h.users;
    ok(await h.createOath(alice, 1_000n));
    expect(h.token(alice.token)).to.equal(START_BALANCE - 1_000n, "stake only");
    expect(h.terms()).to.include({ tag: "KEPTTRM1", version: 3, feePerMember: 0n, feesCollected: 0n, freezePrice: 0n, missBps: 1_000 });
    ok(await h.configure(2_000, 99n));
    ok(await h.join(bob));
    expect(h.token(bob.token)).to.equal(START_BALANCE - 1_000n);
    expect(h.token(h.vault)).to.equal(2_000n, "exactly the stakes are escrowed");
    expect(h.token(h.treasury)).to.equal(0n);
    expect(h.terms()).to.include({ version: 3, feesCollected: 0n });
  });

  it("refunds the stake when the creator cancels while Open; claims are once only", async () => {
    const h = await Harness.create(3);
    const [alice, bob, carol] = h.users;
    ok(await h.createOath(alice, 1_000n)); ok(await h.join(bob));
    fails(await h.buyFreeze(bob), "LegacyRules"); // rules v3 has no freezes
    fails(await h.creatorIx(bob, "cancel_oath"), "ConstraintHasOne");
    ok(await h.creatorIx(alice, "cancel_oath"));
    expect(h.payouts()).to.deep.equal([1_000n, 1_000n]);
    ok(await h.claim(alice)); ok(await h.claim(bob));
    expect(h.token(alice.token)).to.equal(START_BALANCE); expect(h.token(bob.token)).to.equal(START_BALANCE);
    expect(h.token(h.vault)).to.equal(0n); expect(h.token(h.treasury)).to.equal(0n);
    fails(await h.claim(alice), "AlreadyClaimed");
    fails(await h.claim(carol), "NotMember");
    fails(await h.creatorIx(alice, "cancel_oath"), "NotOpen");
  });

  it("a rules v3 Oath has no freezes", async () => {
    const h = await Harness.create(2);
    const [, bob] = await h.activeOath(2, 1_000n);
    fails(await h.buyFreeze(bob), "LegacyRules");
    fails(await h.useFreeze(bob, 0), "LegacyRules");
  });

  it("freeze credits: one per member, bought with un-staked SKR, at the snapshotted price", async () => {
    const h = await Harness.create(3); ok(await h.configure());
    const [alice, bob] = await h.activeV2Oath(2, 1_000n);
    const outsider = h.users[2];
    fails(await h.buyFreeze(outsider), "NotMember");
    ok(await h.buyFreeze(bob));
    expect(h.token(bob.token)).to.equal(START_BALANCE - 1_150n - FREEZE_PRICE);
    fails(await h.buyFreeze(bob), "FreezeAlreadyBought");
    expect(h.terms()).to.include({ bought: 0b10, freezeProceeds: FREEZE_PRICE });
    expect(h.token(h.vault)).to.equal(2_300n + FREEZE_PRICE);
    void alice;
  });

  it("freeze use: only for a closed, unkept day, only once, only by its owner", async () => {
    const h = await Harness.create(2); ok(await h.configure());
    const [alice, bob] = await h.activeV2Oath(2, 1_000n);
    ok(await h.buyFreeze(bob));
    h.setTime(T0 + DAY / 2n);
    fails(await h.useFreeze(bob, 0), "DayNotClosed"); // current day
    fails(await h.useFreeze(bob, 2), "DayNotClosed"); // future day
    fails(await h.useFreeze(bob, 3), "InvalidDay");
    h.setDaysKept([0b001, 0b001]); h.setTime(T0 + 2n * DAY + 1n); // days 0 and 1 closed; bob kept day 0, missed day 1
    fails(await h.useFreeze(bob, 0), "DayAlreadyKept");
    fails(await h.useFreeze(alice, 1), "NoFreezeCredit"); // bob's credit is wallet-bound
    ok(await h.useFreeze(bob, 1));
    expect(h.terms()).to.include({ used: 0b10 }); expect(h.terms()!.frozen).to.deep.equal([0, 0b010, 0, 0]);
    expect(h.daysKept(1)).to.equal(0b001, "proof bits are not rewritten; the freeze is tracked separately");
    fails(await h.useFreeze(bob, 1), "FreezeAlreadyUsed");
    fails(await h.buyFreeze(bob), "FreezeAlreadyBought"); // no second credit to cover another day
  });

  it("all succeed (one day covered by a freeze): everyone recovers the full stake, treasury gets fees and freeze price", async () => {
    const h = await Harness.create(2); ok(await h.configure());
    const [alice, bob] = await h.activeV2Oath(2, 1_000n);
    ok(await h.buyFreeze(bob));
    h.setDaysKept([0b111, 0b101]); h.setTime(T0 + 2n * DAY);
    ok(await h.useFreeze(bob, 1));
    h.setTime(T0 + 3n * DAY);
    fails(await h.settle(alice), "TooEarly"); // the last day's freeze window is still open
    h.afterGrace();
    ok(await h.settle(alice));
    const expected = shared.calculatePayoutsV2(1_000n, [true, true], 300n, FREEZE_PRICE)!;
    expect(h.payouts()).to.deep.equal(expected.payouts).and.deep.equal([1_000n, 1_000n]);
    expect(h.token(h.treasury)).to.equal(expected.toTreasury).and.equal(340n);
    ok(await h.claim(alice)); ok(await h.claim(bob));
    expect(h.token(alice.token)).to.equal(START_BALANCE - 150n, "full stake recovered; only the fee is spent");
    expect(h.token(h.vault)).to.equal(0n, "every escrowed token accounted for");
    const keeper = h.data(bob.keeper);
    expect(keeper.readUInt32LE(44)).to.equal(1, "a frozen day counts as kept for the Oath");
  });

  it("one unsuccessful member: 50% back once (despite two misses), the other 50% to successful members; dust to treasury", async () => {
    const h = await Harness.create(4); ok(await h.configure());
    const users = await h.activeV2Oath(4, 1_001n);
    h.setDaysKept([0b111, 0b111, 0b111, 0b100]); h.afterGrace();
    ok(await h.settle(users[0]));
    const f = fee(1_001n);
    const expected = shared.calculatePayoutsV2(1_001n, [true, true, true, false], 4n * f, 0n)!;
    expect(h.payouts()).to.deep.equal(expected.payouts).and.deep.equal([1_167n, 1_167n, 1_167n, 501n]);
    expect(h.token(h.treasury)).to.equal(expected.toTreasury).and.equal(4n * f + 2n);
    expect(h.terms()).to.include({ dust: 2n, carryover: 0n, treasuryPaid: 4n * f + 2n });
    for (const u of users) ok(await h.claim(u));
    expect(h.token(h.vault)).to.equal(0n);
    expect(h.data(users[3].keeper).readUInt32LE(48)).to.equal(1, "oaths_missed");
  });

  it("no successful member: slashed half is carryover in the locked reserve, not treasury; sweep runs once", async () => {
    const h = await Harness.create(2); ok(await h.configure());
    const [alice, bob] = await h.activeV2Oath(2, 1_000n);
    h.setDaysKept([0b011, 0b000]); h.afterGrace();
    fails(await h.sweep(alice), "NotSettled");
    ok(await h.settle(bob));
    expect(h.payouts()).to.deep.equal([500n, 500n]);
    expect(h.token(h.treasury)).to.equal(300n, "treasury gets only the fees");
    expect(h.terms()).to.include({ carryover: 1_000n, swept: false });
    expect(h.token(h.vault)).to.equal(2_000n, "payouts and carryover still escrowed");
    ok(await h.sweep(alice));
    expect(h.token(h.reserve)).to.equal(1_000n); expect(h.reserveTotal()).to.equal(1_000n);
    fails(await h.sweep(alice), "NothingToSweep");
    expect(h.token(h.reserve)).to.equal(1_000n, "retry moved nothing");
    ok(await h.claim(alice)); ok(await h.claim(bob));
    expect(h.token(h.vault)).to.equal(0n);
    expect(h.token(alice.token) + h.token(bob.token) + h.token(h.treasury) + h.token(h.reserve)).to.equal(2n * START_BALANCE, "conservation");
  });

  it("settlement and claim retries are rejected without moving tokens", async () => {
    const h = await Harness.create(2); ok(await h.configure());
    const [alice, bob] = await h.activeV2Oath(2, 1_000n);
    h.setDaysKept([0b111, 0b011]); h.afterGrace();
    ok(await h.settle(alice));
    const treasury = h.token(h.treasury), vault = h.token(h.vault);
    fails(await h.settle(bob), "NotActive");
    expect(h.token(h.treasury)).to.equal(treasury); expect(h.token(h.vault)).to.equal(vault);
    fails(await h.useFreeze(bob, 2), "NotActive"); // nothing changes after settlement
    ok(await h.claim(bob)); fails(await h.claim(bob), "AlreadyClaimed");
    expect(h.token(bob.token)).to.equal(START_BALANCE - 1_150n + 500n);
  });

  it("on-chain payouts equal the TypeScript preview for every 3-member outcome", async () => {
    for (let mask = 0; mask < 8; mask++) {
      const h = await Harness.create(3); ok(await h.configure());
      const users = await h.activeV2Oath(3, 2_500_000_001n);
      const successes = [0, 1, 2].map((i) => (mask & (1 << i)) !== 0);
      h.setDaysKept(successes.map((s) => (s ? 0b111 : 0b010))); h.afterGrace();
      ok(await h.settle(users[0]));
      const expected = shared.calculatePayoutsV2(2_500_000_001n, successes, 3n * fee(2_500_000_001n), 0n)!;
      expect(h.payouts(), `mask ${mask}`).to.deep.equal(expected.payouts);
      expect(h.token(h.treasury)).to.equal(expected.toTreasury);
      expect(h.terms()).to.include({ carryover: expected.carryover, dust: expected.dust });
    }
  });

  it("a pre-upgrade 316-byte Active Oath is still read and settled under rules v1 after activation", async () => {
    const h = await Harness.create(2); ok(await h.configure());
    const [alice, bob] = h.users;
    h.useOath(alice, 77n);
    const [, bump] = PublicKey.findProgramAddressSync([Buffer.from("oath"), pk(alice.signer.address).toBuffer(), u64(77n)], PROGRAM);
    const o = Buffer.alloc(OATH_BASE); createHash("sha256").update("account:Oath").digest().subarray(0, 8).copy(o);
    pk(alice.signer.address).toBuffer().copy(o, 8); o.writeBigUInt64LE(77n, 40); o.writeBigUInt64LE(1_250n, 48); pk(h.mint).toBuffer().copy(o, 56);
    o[120] = 0; o[121] = 3; o.writeUInt32LE(Number(DAY), 122); o.writeBigInt64LE(T0, 126); o.writeInt16LE(330, 134); o[136] = 1; o[137] = 0; o[138] = 2;
    [alice, bob].forEach((u, i) => { pk(u.signer.address).toBuffer().copy(o, MEMBER(i)); o[MEMBER(i) + 32] = 1; });
    o.writeUInt16LE(0b111, MEMBER(0) + 33); o.writeUInt16LE(0b001, MEMBER(1) + 33); o[315] = bump;
    h.put(h.oath, o); h.put(h.vault, h.tokenData(pk(h.oath), 2_500n), TOKEN);
    for (const u of [alice, bob]) { const k = Buffer.alloc(126); createHash("sha256").update("account:Keeper").digest().subarray(0, 8).copy(k); pk(u.signer.address).toBuffer().copy(k, 8); k.write("KEPTV4!!", 61, "latin1"); h.put(u.keeper, k); }
    h.setTime(T0 + 3n * DAY + 1n);
    fails(await h.buyFreeze(bob), "LegacyRules");
    fails(await h.useFreeze(bob, 1), "LegacyRules");
    ok(await h.settle(alice));
    expect(h.data(h.oath).length).to.equal(OATH_BASE, "legacy account is not resized or rewritten");
    expect(h.payouts()).to.deep.equal([2_375n, 0n], "v1: 10% of the forfeited stake to treasury, 90% to the keeper");
    expect(h.token(h.treasury)).to.equal(125n);
    ok(await h.claim(alice)); expect(h.token(h.vault)).to.equal(0n);
    fails(await h.sweep(alice), "LegacyRules");
  });
});

describe("KEPT rules v3 settlement (owner money model, DECISIONS D-93)", () => {
  const SKR = 1_000_000n;
  const days = (n: number) => (1 << n) - 1;
  /** One mask per member from marks like ["kkkm","kkkk"] (day by day, member by member). */
  const masksOf = (marks: string[], members: number) => Array.from({ length: members }, (_, i) => marks.reduce((m, day, d) => (day[i] === "k" ? m | (1 << d) : m), 0));

  it("all keep: everyone gets the full stake back, nothing reaches the treasury, no entry fee was ever charged", async () => {
    const h = await Harness.create(4);
    const users = await h.activeOath(4, 100n * SKR);
    h.setDaysKept([7, 7, 7, 7]); h.setTime(T0 + 3n * DAY);
    ok(await h.settle(users[0]));
    expect(h.payouts()).to.deep.equal(Array(4).fill(100n * SKR));
    expect(h.token(h.treasury)).to.equal(0n);
    for (const u of users) ok(await h.claim(u));
    for (const u of users) expect(h.token(u.token)).to.equal(START_BALANCE);
    expect(h.token(h.vault)).to.equal(0n);
    expect(h.terms()).to.include({ version: 3, treasuryPaid: 0n, heldTotal: 0n, brokeDayPlusOne: 0 });
  });

  it("the owner's examples: one miss splits 10 SKR four ways; two misses split each forfeiture three ways", async () => {
    const one = await Harness.create(4);
    let users = await one.activeOath(4, 100n * SKR);
    one.setDaysKept([7, 7, 7, 0b110]); one.setTime(T0 + 3n * DAY);
    ok(await one.settle(users[0]));
    expect(one.payouts()).to.deep.equal([102_500_000n, 102_500_000n, 102_500_000n, 90_000_000n]);
    expect(one.token(one.treasury)).to.equal(2_500_000n, "KEPT's equal share is transferred to the configured treasury");
    for (const u of users) ok(await one.claim(u));
    expect(one.token(one.vault)).to.equal(0n);

    const two = await Harness.create(4);
    users = await two.activeOath(4, 100n * SKR);
    two.setDaysKept([7, 7, 0b110, 0b110]); two.setTime(T0 + 3n * DAY);
    ok(await two.settle(users[0]));
    expect(two.payouts()).to.deep.equal([106_666_666n, 106_666_666n, 90_000_000n, 90_000_000n]);
    expect(two.token(two.treasury)).to.equal(6_666_668n, "the rounding remainder goes to KEPT");
  });

  it("settling early is rejected until every day has closed, and an Oath settles once", async () => {
    const h = await Harness.create(2);
    const [alice, bob] = await h.activeOath(2, 100n * SKR);
    h.setDaysKept([7, 7]);
    h.setTime(T0 + 3n * DAY - 1n); fails(await h.settle(alice), "TooEarly");
    h.setTime(T0 + 3n * DAY); ok(await h.settle(alice));
    fails(await h.settle(bob), "NotActive");
  });

  it("repeated misses cost the same 10 % every time", async () => {
    const h = await Harness.create(4);
    const users = await h.activeOath(4, 100n * SKR);
    // 7-day Oath is not available in this harness (3 days): member 3 misses every day except day 1.
    h.setDaysKept([7, 7, 7, 0b010]); h.setTime(T0 + 3n * DAY);
    ok(await h.settle(users[0]));
    expect(h.payouts()).to.deep.equal([105_000_000n, 105_000_000n, 105_000_000n, 80_000_000n]);
    expect(h.token(h.treasury)).to.equal(5_000_000n);
  });

  it("a day nobody keeps sends that day's forfeitures to the treasury", async () => {
    const h = await Harness.create(2);
    const [alice, bob] = await h.activeOath(2, 50n * SKR);
    h.setDaysKept([0b110, 0b110]); h.setTime(T0 + 3n * DAY);
    ok(await h.settle(alice));
    expect(h.payouts()).to.deep.equal([45n * SKR, 45n * SKR]);
    expect(h.token(h.treasury)).to.equal(10n * SKR);
    ok(await h.claim(alice)); ok(await h.claim(bob));
    expect(h.token(h.vault)).to.equal(0n);
  });

  it("a broken Oath (HP 0) settles once the breaking day closes: half the balances to the treasury, half held; held is swept after 7 days", async () => {
    const h = await Harness.create(4);
    const users = await h.activeOath(4, 1_000n * SKR);
    // Members 1-3 miss days 0 and 1: HP 100 -> 40 +10 -> 50 -> -10: broken on day 1.
    h.setDaysKept([7, 0b100, 0b100, 0b100]);
    h.setTime(T0 + 1n * DAY + DAY / 2n); fails(await h.settle(users[0]), "TooEarly");
    h.setTime(T0 + 2n * DAY);
    ok(await h.settle(users[0]));
    expect(h.payouts()).to.deep.equal([0n, 0n, 0n, 0n]);
    const t = h.terms()!;
    expect(t.brokeDayPlusOne).to.equal(2);
    expect(t.heldTotal + t.treasuryPaid).to.equal(4_000n * SKR);
    expect(h.token(h.treasury)).to.equal(t.treasuryPaid);
    expect(h.token(h.vault)).to.equal(t.heldTotal, "the held half stays in the vault");
    expect(t.heldReleaseTs).to.equal(T0 + 2n * DAY + 7n * DAY);
    fails(await h.sweepHeld(users[1]), "TooEarly");
    h.setTime(t.heldReleaseTs - 1n); fails(await h.sweepHeld(users[1]), "TooEarly");
    h.setTime(t.heldReleaseTs);
    const other = await generateKeyPairSigner(); void other;
    fails(await h.sweepHeld(users[1], h.users[0].token), "ConstraintAddress"); // only the configured treasury
    ok(await h.sweepHeld(users[1]));
    expect(h.token(h.treasury)).to.equal(4_000n * SKR);
    expect(h.token(h.vault)).to.equal(0n);
    fails(await h.sweepHeld(users[1]), "NothingToSweep");
    for (const u of users) ok(await h.claim(u)); // claims of 0 still succeed
    expect(h.data(users[0].keeper).readUInt32LE(48)).to.equal(1, "a broken Oath counts as missed for everyone");
  });

  it("nothing is held when the Oath does not break, and sweep_held rejects", async () => {
    const h = await Harness.create(2);
    const [alice, bob] = await h.activeOath(2, 100n * SKR);
    h.setDaysKept([7, 0b100]); h.setTime(T0 + 3n * DAY); ok(await h.settle(alice));
    fails(await h.sweepHeld(bob), "NothingToSweep");
  });

  it("only the configured treasury token account receives KEPT's share", async () => {
    const h = await Harness.create(2);
    const [alice, bob] = await h.activeOath(2, 100n * SKR);
    h.setDaysKept([7, 0b100]); h.setTime(T0 + 3n * DAY);
    const wrong = h.users[0].token;
    const keepers = [0, 1].map((i) => ({ address: h.memberKeeper(i), role: W }));
    fails(await h.send(alice.signer, [{ address: h.config, role: R }, { address: h.oath, role: W }, { address: h.vault, role: W }, { address: wrong, role: W }, { address: h.mint, role: R }, { address: TOKEN, role: R }], disc("settle_oath"), keepers), "ConstraintAddress");
    ok(await h.settle(alice));
    expect(h.token(h.treasury) > 0n).to.equal(true);
    void bob;
  });

  it("every group scenario in the shared engine vectors settles on chain to the same payouts, treasury and held amounts", async () => {
    const file = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "packages", "engine", "test-vectors", "oath-vectors.json"), "utf8"));
    let checked = 0;
    for (const v of file.vectors) {
      if (v.terms.solo || v.terms.days !== 3) continue; // the harness runs 3-day group Oaths
      const members = v.terms.members as number, stake = BigInt(v.terms.stake);
      const h = await Harness.create(members);
      const users = await h.activeOath(members, stake);
      h.setDaysKept(masksOf(v.marks, members));
      h.setTime(T0 + 3n * DAY); // every day has closed; an Oath that broke earlier is replayed the same way
      ok(await h.settle(users[0]));
      const e = v.expected;
      expect(h.payouts().map(String), v.name).to.deep.equal(e.balances);
      expect(h.token(h.treasury), v.name).to.equal(BigInt(e.fee) + BigInt(e.toTreasury));
      expect(h.terms()!.heldTotal, v.name).to.equal(e.held.reduce((a: bigint, x: string) => a + BigInt(x), 0n));
      expect(h.terms()!.brokeDayPlusOne, v.name).to.equal(e.brokeOnDay === null ? 0 : e.brokeOnDay + 1);
      checked++;
    }
    expect(checked).to.be.greaterThan(5);
  });

  it("conserves every token for every 3-member miss pattern, and settles under the unchanged account layout", async () => {
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b += 3) {
      const h = await Harness.create(3);
      const users = await h.activeOath(3, 333_333_337n);
      h.setDaysKept([7, a, b]); h.setTime(T0 + 3n * DAY);
      ok(await h.settle(users[0]));
      const t = h.terms()!;
      expect(h.payouts().reduce((x, y) => x + y, 0n) + h.token(h.treasury) + t.heldTotal, `${a}/${b}`).to.equal(3n * 333_333_337n);
      expect(h.token(h.vault)).to.equal(h.payouts().reduce((x, y) => x + y, 0n) + t.heldTotal);
      expect(h.data(h.oath).length).to.equal(OATH_BASE + 110, "Oath account size is unchanged by v3");
    }
  });
});

describe("native SOL Oath escrow", () => {
  it("accepts a nonzero solo stake, starts, settles, and returns the SOL while preserving Oath rent", async () => {
    const h = await Harness.create(1);
    const [alice] = h.users;
    const stake = 50_000_000n;
    ok(await h.createOathSol(alice, stake, 3, true));
    const rentReserve = h.solBalance(h.oath) - stake;
    expect(h.data(h.oath).subarray(56, 88).equals(Buffer.alloc(32))).to.equal(true, "all-ones System Program address marks native SOL");
    expect(h.token(alice.token)).to.equal(START_BALANCE, "creating an SOL Oath does not require or debit SKR");
    ok(await h.creatorIx(alice, "start_oath"));
    h.setDaysKept([7]); h.setTime(T0 + 3n * DAY);
    ok(await h.settleSol(alice));
    expect(h.payouts()).to.deep.equal([stake]);
    ok(await h.claimSol(alice));
    expect(h.solBalance(h.oath)).to.equal(rentReserve, "only the rent reserve remains in the Oath PDA");
    expect(h.token(alice.token)).to.equal(START_BALANCE);
  });

  it("refunds a cancelled group Oath in SOL without touching either member's SKR", async () => {
    const h = await Harness.create(2);
    const [alice, bob] = h.users;
    const stake = 100_000_000n;
    ok(await h.createOathSol(alice, stake));
    const rentReserve = h.solBalance(h.oath) - stake;
    ok(await h.joinOathSol(bob));
    expect(h.solBalance(h.oath)).to.equal(rentReserve + 2n * stake);
    expect(h.token(alice.token)).to.equal(START_BALANCE);
    expect(h.token(bob.token)).to.equal(START_BALANCE);
    ok(await h.creatorIx(alice, "cancel_oath"));
    expect(h.payouts()).to.deep.equal([stake, stake]);
    ok(await h.claimSol(alice)); ok(await h.claimSol(bob));
    expect(h.solBalance(h.oath)).to.equal(rentReserve);
    expect(h.token(alice.token)).to.equal(START_BALANCE);
    expect(h.token(bob.token)).to.equal(START_BALANCE);
  });

  it("routes the SOL share to the configured treasury authority and releases held SOL after the window", async () => {
    const h = await Harness.create(4);
    const stake = 100_000_000n;
    const users = h.users;
    h.setTime(T0);
    ok(await h.createOathSol(users[0], stake));
    const rentReserve = h.solBalance(h.oath) - stake;
    for (const user of users.slice(1)) ok(await h.joinOathSol(user));
    ok(await h.creatorIx(users[0], "start_oath"));
    expect(h.solBalance(h.oath)).to.equal(rentReserve + 4n * stake);
    const treasuryBefore = h.solBalance(h.admin.address);
    h.setDaysKept([7, 0b100, 0b100, 0b100]);
    h.setTime(T0 + 2n * DAY);
    fails(await h.send(users[0].signer, [{ address: h.config, role: R }, { address: h.oath, role: W }, { address: h.treasury, role: R }, { address: h.mint, role: R }, { address: users[0].signer.address, role: W }], disc("settle_oath_sol"), users.map((_, i) => ({ address: h.memberKeeper(i), role: W }))), "WrongTreasury");
    ok(await h.settleSol(users[0]));
    const terms = h.terms()!;
    expect(terms.heldTotal + terms.treasuryPaid).to.equal(4n * stake);
    expect(h.solBalance(h.oath)).to.equal(rentReserve + terms.heldTotal);
    expect(h.solBalance(h.admin.address) - treasuryBefore).to.equal(terms.treasuryPaid);
    fails(await h.sweepHeldSol(users[1]), "TooEarly");
    h.setTime(terms.heldReleaseTs);
    fails(await h.sweepHeldSol(users[1], users[0].signer.address), "WrongTreasury");
    const beforeSweep = h.solBalance(h.oath);
    ok(await h.sweepHeldSol(users[1]));
    expect(h.solBalance(h.oath)).to.equal(beforeSweep - terms.heldTotal);
    expect(h.solBalance(h.oath)).to.equal(rentReserve);
    expect(h.solBalance(h.admin.address) - treasuryBefore).to.equal(terms.treasuryPaid + terms.heldTotal);
    expect(h.terms()!.heldSwept).to.equal(true);
    for (const user of users) ok(await h.claimSol(user));
    expect(h.solBalance(h.oath)).to.equal(rentReserve);
  });
});
