import { expect } from "chai";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { AccountLayout, AccountState, MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Clock, FailedTransactionMetadata, LiteSVM } from "litesvm";
import { AccountRole, Address, KeyPairSigner, address, appendTransactionMessageInstruction, createTransactionMessage, generateKeyPairSigner, lamports, pipe, setTransactionMessageFeePayerSigner, signTransactionMessageWithSigners } from "@solana/kit";
const idlJson = JSON.parse(readFileSync(path.join(__dirname, "..", "target", "idl", "kept_test.json"), "utf8"));

const PROGRAM = new PublicKey(idlJson.address);
const SO = path.join(__dirname, "..", "target", "deploy", "kept_test.so");
const DAY = 86_400n;
const SYSTEM=address("11111111111111111111111111111111");

function accountData(name: string, length: number) {
  const b=Buffer.alloc(length);createHash("sha256").update(`account:${name}`).digest().subarray(0,8).copy(b);return b;
}

class CheckinHarness {
  svm=new LiteSVM(); verifier!:KeyPairSigner; other!:KeyPairSigner; oath!:Address; config!:Address; keeper!:Address;
  static async create(){const h=new CheckinHarness();h.svm.addProgramFromFile(address(PROGRAM.toBase58()),SO);h.verifier=await generateKeyPairSigner();h.other=await generateKeyPairSigner();h.svm.airdrop(h.verifier.address,lamports(5_000_000_000n));h.svm.airdrop(h.other.address,lamports(5_000_000_000n));
    const [config,configBump]=PublicKey.findProgramAddressSync([Buffer.from("config")],PROGRAM);h.config=address(config.toBase58());
    const authority=new PublicKey(h.other.address);const oath=new PublicKey(randomBytes(32));h.oath=address(oath.toBase58());
    const c=accountData("Config",8+32+32+32+2+32+1);authority.toBuffer().copy(c,8);new PublicKey(h.verifier.address).toBuffer().copy(c,40);c[138]=configBump;
    h.put(h.config,c);
    const o=accountData("Oath",316);authority.toBuffer().copy(o,8);o.writeBigUInt64LE(77n,40);o.writeBigUInt64LE(0n,48);new PublicKey("So11111111111111111111111111111111111111112").toBuffer().copy(o,56);
    o[120]=0;o[121]=3;o.writeUInt32LE(120,122);o.writeBigInt64LE(10_000n,126);o.writeInt16LE(330,134);o[136]=1;o[137]=true;o[138]=1;
    new PublicKey(h.verifier.address).toBuffer().copy(o,139);o[171]=1; // member's staked flag
    h.put(h.oath,o);const [keeper]=PublicKey.findProgramAddressSync([Buffer.from("keeper"),authority.toBuffer()],PROGRAM);h.keeper=address(keeper.toBase58());const k=accountData("Keeper",126);authority.toBuffer().copy(k,8);k.writeBigUInt64LE(999n,40);h.put(h.keeper,k);h.setTime(10_000n);return h;}
  put(addr:Address,data:Buffer){this.svm.setAccount({address:addr,data,lamports:lamports(1_000_000_000n),programAddress:address(PROGRAM.toBase58()),executable:false,space:BigInt(data.length)});}
  setTime(unix:bigint){const c=this.svm.getClock();this.svm.setClock(new Clock(c.slot,c.epochStartTimestamp,c.epoch,c.leaderScheduleEpoch,unix));}
  async call(signer:KeyPairSigner,member:string,day=0){this.svm.expireBlockhash();const ixData=Buffer.concat([createHash("sha256").update("global:record_checkin").digest().subarray(0,8),Buffer.from([day]),Buffer.alloc(32,7)]);
    const tx=await pipe(createTransactionMessage({version:0}),(m)=>setTransactionMessageFeePayerSigner(signer,m),(m)=>this.svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),(m)=>appendTransactionMessageInstruction({programAddress:address(PROGRAM.toBase58()),accounts:[{address:this.config,role:AccountRole.READONLY},{address:this.oath,role:AccountRole.WRITABLE},{address:signer.address,role:AccountRole.READONLY_SIGNER},{address:address(member),role:AccountRole.READONLY}],data:new Uint8Array(ixData)},m),(m)=>signTransactionMessageWithSigners(m));return this.svm.sendTransaction(tx);}
  daysKept(){const a=this.svm.getAccount(this.oath);return a.data[139+33]|(a.data[139+34]<<8);}
  async fails(signer:KeyPairSigner,member:string,day:number,code:string){const result=await this.call(signer,member,day);expect(result).to.be.instanceOf(FailedTransactionMetadata);expect((result as FailedTransactionMetadata).meta().logs().join("\n")).to.contain(`Error Code: ${code}`);}
  async oathInstruction(signer:KeyPairSigner,name:"start_oath"|"cancel_oath") { this.svm.expireBlockhash();const disc=createHash("sha256").update(`global:${name}`).digest().subarray(0,8);const tx=await pipe(createTransactionMessage({version:0}),(m)=>setTransactionMessageFeePayerSigner(signer,m),(m)=>this.svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),(m)=>appendTransactionMessageInstruction({programAddress:address(PROGRAM.toBase58()),accounts:[{address:this.oath,role:AccountRole.WRITABLE},{address:signer.address,role:AccountRole.READONLY_SIGNER}],data:new Uint8Array(disc)},m),(m)=>signTransactionMessageWithSigners(m));return this.svm.sendTransaction(tx); }
  oathByte(offset:number){return this.svm.getAccount(this.oath).data[offset];}
  memberPayout(){return Buffer.from(this.svm.getAccount(this.oath).data).readBigUInt64LE(139+36);}
  async migrate(){this.svm.expireBlockhash();const disc=createHash("sha256").update("global:migrate_keeper").digest().subarray(0,8);const tx=await pipe(createTransactionMessage({version:0}),(m)=>setTransactionMessageFeePayerSigner(this.other,m),(m)=>this.svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),(m)=>appendTransactionMessageInstruction({programAddress:address(PROGRAM.toBase58()),accounts:[{address:this.keeper,role:AccountRole.WRITABLE},{address:this.other.address,role:AccountRole.READONLY_SIGNER},{address:SYSTEM,role:AccountRole.READONLY}],data:new Uint8Array(disc)},m),(m)=>signTransactionMessageWithSigners(m));return this.svm.sendTransaction(tx);}
}

class TokenFlowHarness {
  svm=new LiteSVM(); admin!:KeyPairSigner; verifier!:KeyPairSigner; alice!:KeyPairSigner; bob!:KeyPairSigner;
  config!:Address; mint!:Address; treasury!:Address; aliceToken!:Address; bobToken!:Address; oath!:Address; vault!:Address; aliceKeeper!:Address; bobKeeper!:Address;
  static async create(){const h=new TokenFlowHarness();h.svm.addProgramFromFile(address(PROGRAM.toBase58()),SO);h.admin=await generateKeyPairSigner();h.verifier=await generateKeyPairSigner();h.alice=await generateKeyPairSigner();h.bob=await generateKeyPairSigner();for(const s of [h.admin,h.verifier,h.alice,h.bob])h.svm.airdrop(s.address,lamports(5_000_000_000n));
    const mint=new PublicKey(randomBytes(32)),treasury=new PublicKey(randomBytes(32)),aliceAta=new PublicKey(randomBytes(32)),bobAta=new PublicKey(randomBytes(32));h.mint=address(mint.toBase58());h.treasury=address(treasury.toBase58());h.aliceToken=address(aliceAta.toBase58());h.bobToken=address(bobAta.toBase58());
    const mintData=Buffer.alloc(82);MintLayout.encode({mintAuthorityOption:1,mintAuthority:new PublicKey(h.admin.address),supply:100_000n,decimals:6,isInitialized:true,freezeAuthorityOption:0,freezeAuthority:PublicKey.default},mintData);h.put(h.mint,mintData,address(TOKEN_PROGRAM_ID.toBase58()));
    h.put(h.treasury,h.tokenData(mint,new PublicKey(h.admin.address),0n),address(TOKEN_PROGRAM_ID.toBase58()));h.put(h.aliceToken,h.tokenData(mint,new PublicKey(h.alice.address),10_000n),address(TOKEN_PROGRAM_ID.toBase58()));h.put(h.bobToken,h.tokenData(mint,new PublicKey(h.bob.address),10_000n),address(TOKEN_PROGRAM_ID.toBase58()));
    const [config,configBump]=PublicKey.findProgramAddressSync([Buffer.from("config")],PROGRAM);h.config=address(config.toBase58());
    const [programData]=PublicKey.findProgramAddressSync([PROGRAM.toBuffer()],new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));const loaderData=Buffer.alloc(45);loaderData.writeUInt32LE(3,0);loaderData.writeBigUInt64LE(1n,4);loaderData[12]=1;new PublicKey(h.admin.address).toBuffer().copy(loaderData,13);h.put(address(programData.toBase58()),loaderData,address("BPFLoaderUpgradeab1e11111111111111111111111"));
    const configData=Buffer.concat([createHash("sha256").update("global:initialize_config").digest().subarray(0,8),new PublicKey(h.verifier.address).toBuffer(),Buffer.from([0xe8,0x03])]);
    const configResult=await h.send(h.admin,[{address:h.config,role:AccountRole.WRITABLE},{address:h.admin.address,role:AccountRole.WRITABLE_SIGNER},{address:address(programData.toBase58()),role:AccountRole.READONLY},{address:h.mint,role:AccountRole.READONLY},{address:h.treasury,role:AccountRole.WRITABLE},{address:address(TOKEN_PROGRAM_ID.toBase58()),role:AccountRole.READONLY},{address:SYSTEM,role:AccountRole.READONLY}],configData);if(configResult instanceof FailedTransactionMetadata)throw new Error(configResult.meta().logs().join("\n"));
    const id=BigInt(Date.now()),idBytes=Buffer.alloc(8);idBytes.writeBigUInt64LE(id);const [oath]=PublicKey.findProgramAddressSync([Buffer.from("oath"),new PublicKey(h.alice.address).toBuffer(),idBytes],PROGRAM);h.oath=address(oath.toBase58());const [vault]=PublicKey.findProgramAddressSync([Buffer.from("vault"),oath.toBuffer()],PROGRAM);h.vault=address(vault.toBase58());const [aliceKeeper]=PublicKey.findProgramAddressSync([Buffer.from("keeper"),new PublicKey(h.alice.address).toBuffer()],PROGRAM);h.aliceKeeper=address(aliceKeeper.toBase58());const [bobKeeper]=PublicKey.findProgramAddressSync([Buffer.from("keeper"),new PublicKey(h.bob.address).toBuffer()],PROGRAM);h.bobKeeper=address(bobKeeper.toBase58());
    const created=await h.createOath(id,1250n,false);if(created instanceof FailedTransactionMetadata)throw new Error(created.meta().logs().join("\n"));h.setTime(10_000n);return h;}
  tokenData(mint:PublicKey,owner:PublicKey,amount:bigint){const b=Buffer.alloc(165);AccountLayout.encode({mint,owner,amount,delegateOption:0,delegate:PublicKey.default,state:AccountState.Initialized,isNativeOption:0,isNative:0n,delegatedAmount:0n,closeAuthorityOption:0,closeAuthority:PublicKey.default},b);return b;}
  put(addr:Address,data:Buffer,owner=address(PROGRAM.toBase58())){this.svm.setAccount({address:addr,data,lamports:lamports(2_000_000_000n),programAddress:owner,executable:false,space:BigInt(data.length)});}
  setTime(unix:bigint){const c=this.svm.getClock();this.svm.setClock(new Clock(c.slot,c.epochStartTimestamp,c.epoch,c.leaderScheduleEpoch,unix));}
  async send(signer:KeyPairSigner,metas:{address:Address;role:AccountRole}[],data:Buffer,remaining:{address:Address;role:AccountRole}[]=[]){this.svm.expireBlockhash();const tx=await pipe(createTransactionMessage({version:0}),(m)=>setTransactionMessageFeePayerSigner(signer,m),(m)=>this.svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),(m)=>appendTransactionMessageInstruction({programAddress:address(PROGRAM.toBase58()),accounts:[...metas,...remaining],data:new Uint8Array(data)},m),(m)=>signTransactionMessageWithSigners(m));return this.svm.sendTransaction(tx);}
  async createOath(id:bigint,stake:bigint,solo:boolean){const idb=Buffer.alloc(8);idb.writeBigUInt64LE(id);const args=Buffer.concat([createHash("sha256").update("global:create_oath").digest().subarray(0,8),idb,Buffer.alloc(32,8),Buffer.from([0,3]),u32(86_400),i16(330),u64(stake),Buffer.from([solo?1:0])]);return this.send(this.alice,[{address:this.config,role:AccountRole.READONLY},{address:this.oath,role:AccountRole.WRITABLE},{address:this.vault,role:AccountRole.WRITABLE},{address:this.aliceKeeper,role:AccountRole.WRITABLE},{address:this.alice.address,role:AccountRole.WRITABLE_SIGNER},{address:this.mint,role:AccountRole.READONLY},{address:this.aliceToken,role:AccountRole.WRITABLE},{address:this.treasury,role:AccountRole.READONLY},{address:address(TOKEN_PROGRAM_ID.toBase58()),role:AccountRole.READONLY},{address:SYSTEM,role:AccountRole.READONLY}],args);}
  async join(){const d=createHash("sha256").update("global:join_oath").digest().subarray(0,8);return this.send(this.bob,[{address:this.config,role:AccountRole.READONLY},{address:this.oath,role:AccountRole.WRITABLE},{address:this.vault,role:AccountRole.WRITABLE},{address:this.bobKeeper,role:AccountRole.WRITABLE},{address:this.bob.address,role:AccountRole.WRITABLE_SIGNER},{address:this.mint,role:AccountRole.READONLY},{address:this.bobToken,role:AccountRole.WRITABLE},{address:this.treasury,role:AccountRole.READONLY},{address:address(TOKEN_PROGRAM_ID.toBase58()),role:AccountRole.READONLY},{address:SYSTEM,role:AccountRole.READONLY}],d);}
  async simple(signer:KeyPairSigner,name:"start_oath"|"cancel_oath"){return this.send(signer,[{address:this.oath,role:AccountRole.WRITABLE},{address:signer.address,role:AccountRole.READONLY_SIGNER}],createHash("sha256").update(`global:${name}`).digest().subarray(0,8));}
  async settle(){const metas=[{address:this.config,role:AccountRole.READONLY},{address:this.oath,role:AccountRole.WRITABLE},{address:this.vault,role:AccountRole.WRITABLE},{address:this.treasury,role:AccountRole.WRITABLE},{address:this.mint,role:AccountRole.READONLY},{address:address(TOKEN_PROGRAM_ID.toBase58()),role:AccountRole.READONLY}];return this.send(this.bob,metas,createHash("sha256").update("global:settle_oath").digest().subarray(0,8),[{address:this.aliceKeeper,role:AccountRole.WRITABLE},{address:this.bobKeeper,role:AccountRole.WRITABLE}]);}
  async claim(wallet:KeyPairSigner,destination:Address){return this.send(wallet,[{address:this.oath,role:AccountRole.WRITABLE},{address:this.vault,role:AccountRole.WRITABLE},{address:this.mint,role:AccountRole.READONLY},{address:destination,role:AccountRole.WRITABLE},{address:wallet.address,role:AccountRole.READONLY_SIGNER},{address:address(TOKEN_PROGRAM_ID.toBase58()),role:AccountRole.READONLY}],createHash("sha256").update("global:claim").digest().subarray(0,8));}
  readToken(addr:Address){return AccountLayout.decode(Buffer.from(this.svm.getAccount(addr).data)).amount;}
  async joinAfterStart(){return this.join();}
  async updateTreasury(signer:KeyPairSigner,treasury:Address){return this.send(signer,[{address:this.config,role:AccountRole.WRITABLE},{address:signer.address,role:AccountRole.READONLY_SIGNER},{address:this.mint,role:AccountRole.READONLY},{address:treasury,role:AccountRole.READONLY}],createHash("sha256").update("global:update_treasury").digest().subarray(0,8));}
}
function u64(n:bigint){const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;}
function u32(n:number){const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;}
function i16(n:number){const b=Buffer.alloc(2);b.writeInt16LE(n);return b;}

describe("KEPT V4 Anchor security",()=>{
  it("IDL removes the legacy check-in args and includes all V4 instructions",()=>{
    const names=idlJson.instructions.map((i:any)=>i.name);
    for(const name of ["initialize_config","update_treasury","create_oath","join_oath","start_oath","cancel_oath","record_checkin","settle_oath","claim","migrate_keeper"])expect(names).to.include(name);
    expect(names).not.to.include("buy_soul");expect(names).not.to.include("debug_shift_day");
  });
  it("only the configured verifier can record a check-in",async()=>{const h=await CheckinHarness.create();await h.fails(h.other,h.verifier.address,0,"WrongVerifier");expect(h.daysKept()).to.equal(0);});
  it("lets only the config admin redirect future fees to a same-mint treasury",async()=>{const h=await TokenFlowHarness.create();const ok=await h.updateTreasury(h.admin,h.aliceToken);expect(ok).not.to.be.instanceOf(FailedTransactionMetadata);expect(new PublicKey(Buffer.from(h.svm.getAccount(h.config).data).subarray(72,104)).toBase58()).to.equal(new PublicKey(h.aliceToken).toBase58());const unauthorized=await h.updateTreasury(h.bob,h.treasury);expect(unauthorized).to.be.instanceOf(FailedTransactionMetadata);});
  it("rejects a non-member",async()=>{const h=await CheckinHarness.create();await h.fails(h.verifier,h.other.address,0,"NotMember");expect(h.daysKept()).to.equal(0);});
  it("rejects days outside the Oath",async()=>{const h=await CheckinHarness.create();await h.fails(h.verifier,h.verifier.address,3,"InvalidDay");expect(h.daysKept()).to.equal(0);});
  it("rejects a day before it starts",async()=>{const h=await CheckinHarness.create();h.setTime(9_999n);await h.fails(h.verifier,h.verifier.address,0,"DayNotStarted");expect(h.daysKept()).to.equal(0);});
  it("rejects a day after its window and accepts a check-in inside the window",async()=>{const h=await CheckinHarness.create();h.setTime(10_120n);await h.fails(h.verifier,h.verifier.address,0,"DayEnded");h.setTime(10_050n);const result=await h.call(h.verifier,h.verifier.address);expect(result).not.to.be.instanceOf(FailedTransactionMetadata);expect(h.daysKept()).to.equal(1);});
  it("rejects duplicate same-day check-ins",async()=>{const h=await CheckinHarness.create();await h.call(h.verifier,h.verifier.address);await h.fails(h.verifier,h.verifier.address,0,"DuplicateCheckin");expect(h.daysKept()).to.equal(1);});
  it("only the creator can start; a group needs a second member",async()=>{const h=await CheckinHarness.create();const data=Buffer.from(h.svm.getAccount(h.oath).data);data[136]=0;data[137]=0;h.put(h.oath,data);const wrong=await h.oathInstruction(h.verifier,"start_oath");expect(wrong).to.be.instanceOf(FailedTransactionMetadata);const needs=await h.oathInstruction(h.other,"start_oath");expect(needs).to.be.instanceOf(FailedTransactionMetadata);expect((needs as FailedTransactionMetadata).meta().logs().join("\n"),"failed tx logs").to.contain("NeedsMember");});
  it("creator starts a solo Oath and start closes cancellation",async()=>{const h=await CheckinHarness.create();const data=Buffer.from(h.svm.getAccount(h.oath).data);data[136]=0;data[137]=1;h.put(h.oath,data);const started=await h.oathInstruction(h.other,"start_oath");expect(started,"start tx logs: "+(started instanceof FailedTransactionMetadata?started.meta().logs().join("\n"):"success")).not.to.be.instanceOf(FailedTransactionMetadata);expect(h.oathByte(136)).to.equal(1);const cancel=await h.oathInstruction(h.other,"cancel_oath");expect(cancel).to.be.instanceOf(FailedTransactionMetadata);});
  it("creator cancels an Open group and records each refund amount",async()=>{const h=await CheckinHarness.create();const data=Buffer.from(h.svm.getAccount(h.oath).data);data[136]=0;data[137]=0;data.writeBigUInt64LE(1_250n,48);data[138]=2;const other=new PublicKey(h.other.address);other.toBuffer().copy(data,139+44);data[139+44+32]=1;h.put(h.oath,data);const result=await h.oathInstruction(h.other,"cancel_oath");expect(result,"cancel tx logs: "+(result instanceof FailedTransactionMetadata?result.meta().logs().join("\n"):"success")).not.to.be.instanceOf(FailedTransactionMetadata);expect(h.oathByte(136)).to.equal(3);expect(h.memberPayout()).to.equal(1_250n);});
  it("migrates a legacy Keeper once and preserves the V4 tag thereafter",async()=>{const h=await CheckinHarness.create();const result=await h.migrate();expect(result).not.to.be.instanceOf(FailedTransactionMetadata);const account=h.svm.getAccount(h.keeper);expect(Buffer.from(account.data).subarray(61,69).toString()).to.equal("KEPTV4!!");expect(Buffer.from(account.data).readUInt16LE(40)).to.equal(0);});
  it("creates and joins a token escrow, blocks joining after start, settles and prevents double claims",async()=>{
    const h=await TokenFlowHarness.create();
    expect(h.readToken(h.aliceToken)).to.equal(8_750n,"creator stake is escrowed");
    const premature=await h.simple(h.alice,"start_oath");expect(premature).to.be.instanceOf(FailedTransactionMetadata);
    const joined=await h.join();expect(joined).not.to.be.instanceOf(FailedTransactionMetadata);expect(h.readToken(h.bobToken)).to.equal(8_750n);
    const started=await h.simple(h.alice,"start_oath");expect(started).not.to.be.instanceOf(FailedTransactionMetadata);
    const lateJoin=await h.joinAfterStart();expect(lateJoin).to.be.instanceOf(FailedTransactionMetadata);expect((lateJoin as FailedTransactionMetadata).meta().logs().join("\n")).to.contain("NotOpen");
    const oath=Buffer.from(h.svm.getAccount(h.oath).data);oath[139+33]=7;oath[183+33]=0;h.put(h.oath,oath);h.setTime(10_000n+3n*DAY);
    const settled=await h.settle();expect(settled).not.to.be.instanceOf(FailedTransactionMetadata);
    // Rules v3: bob misses all 3 days, 125 (10% of 1,250) each. Each forfeiture splits two ways (alice, KEPT): 62 + 63.
    expect(h.readToken(h.treasury)).to.equal(189n,"KEPT's three equal shares of the forfeitures, incl. remainders, go to the treasury");
    expect(h.readToken(h.vault)).to.equal(2_311n,"vault holds alice's 1,436 and bob's remaining 875");
    const claimed=await h.claim(h.alice,h.aliceToken);expect(claimed).not.to.be.instanceOf(FailedTransactionMetadata);expect(h.readToken(h.aliceToken)).to.equal(10_186n);
    const twice=await h.claim(h.alice,h.aliceToken);expect(twice).to.be.instanceOf(FailedTransactionMetadata);expect((twice as FailedTransactionMetadata).meta().logs().join("\n")).to.contain("AlreadyClaimed");
  });
  it("cancels an Open group and returns the creator's stake through claim",async()=>{
    const h=await TokenFlowHarness.create();const cancelled=await h.simple(h.alice,"cancel_oath");expect(cancelled).not.to.be.instanceOf(FailedTransactionMetadata);
    const claim=await h.claim(h.alice,h.aliceToken);expect(claim).not.to.be.instanceOf(FailedTransactionMetadata);expect(h.readToken(h.aliceToken)).to.equal(10_000n);
  });
});
