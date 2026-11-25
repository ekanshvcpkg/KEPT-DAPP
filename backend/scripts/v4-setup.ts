import "dotenv/config";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, getMint, mintTo } from "@solana/spl-token";

const rpc = process.env.DEVNET_RPC_URL || "https://api.devnet.solana.com";
const programId = new PublicKey(process.env.KEEPER_PROGRAM_ID || "7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj");
const treasuryOwner = new PublicKey(process.env.TREASURY_OWNER || "52eWttmzYBJn4awLjEMB42bw5oTFvL4XC1gDqFAQgPxJ");
const keyPath = process.env.ADMIN_KEYPAIR || path.join(homedir(), ".config/solana/id.json");
const secret = JSON.parse(await readFile(keyPath, "utf8")) as number[];
const admin = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(rpc, "confirmed");
// The verifier signs check-ins from the backend. Use a separate key so the server never holds the admin/upgrade key.
const verifier = process.env.VERIFIER_PUBKEY ? new PublicKey(process.env.VERIFIER_PUBKEY) : admin.publicKey;
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
const configInfo = await connection.getAccountInfo(configPda, "confirmed");
let mint: PublicKey;
let isNewMint = false;
if (configInfo) {
  if (!configInfo.owner.equals(programId) || !configInfo.data.subarray(0, 8).equals(createHash("sha256").update("account:Config").digest().subarray(0, 8))) {
    throw new Error("Config PDA exists but is not a KEPT V4 Config account");
  }
  mint = new PublicKey(configInfo.data.subarray(106, 138));
  if (process.env.STAKE_MINT && new PublicKey(process.env.STAKE_MINT).toBase58() !== mint.toBase58()) {
    throw new Error("STAKE_MINT does not match the stake mint already stored in the on-chain Config");
  }
} else if (process.env.STAKE_MINT) {
  mint = new PublicKey(process.env.STAKE_MINT);
} else {
  mint = await createMint(connection, admin, admin.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  isNewMint = true;
}

const mintInfo = await connection.getAccountInfo(mint, "confirmed");
if (!mintInfo) throw new Error(`Stake mint ${mint.toBase58()} was not found`);
const tokenProgram = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : mintInfo.owner.equals(TOKEN_PROGRAM_ID) ? TOKEN_PROGRAM_ID : null;
if (!tokenProgram) throw new Error("Stake mint must be owned by Token or Token-2022");
const treasury = await getOrCreateAssociatedTokenAccount(connection, admin, mint, treasuryOwner, false, "confirmed", undefined, tokenProgram);

// A new devnet mint gets its initial test supply in the admin's ATA, which is the faucet source.
// Keep faucet funds separate from the user's treasury so fees belong to the configured wallet.
if (isNewMint) {
  const faucet = await getOrCreateAssociatedTokenAccount(connection, admin, mint, admin.publicKey, false, "confirmed", undefined, tokenProgram);
  await mintTo(connection, admin, mint, faucet.address, admin, 5_000_000_000_000n, [], undefined, tokenProgram);
}

const configDisc = createHash("sha256").update("global:initialize_config").digest().subarray(0, 8);
const treasuryDisc = createHash("sha256").update("global:update_treasury").digest().subarray(0, 8);
let instruction: TransactionInstruction;
if (!configInfo) {
  const [programData] = PublicKey.findProgramAddressSync([programId.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));
  const fee = Buffer.alloc(2); fee.writeUInt16LE(1_000);
  instruction = new TransactionInstruction({ programId, keys: [
    { pubkey: configPda, isSigner: false, isWritable: true }, { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: programData, isSigner: false, isWritable: false }, { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: treasury.address, isSigner: false, isWritable: true }, { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data: Buffer.concat([configDisc, verifier.toBuffer(), fee]) });
} else {
  instruction = new TransactionInstruction({ programId, keys: [
    { pubkey: configPda, isSigner: false, isWritable: true }, { pubkey: admin.publicKey, isSigner: true, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: treasury.address, isSigner: false, isWritable: false },
  ], data: treasuryDisc });
}
const signature = await connection.sendTransaction(new Transaction().add(instruction), [admin]);
await connection.confirmTransaction(signature, "confirmed");
// Native SOL Oaths pay the protocol share into the treasury wallet. A wallet below the rent-exempt minimum makes a small
// share fail settlement ("insufficient funds for rent"), so make sure it is funded.
const rentMin = await connection.getMinimumBalanceForRentExemption(0);
const treasuryLamports = await connection.getBalance(treasuryOwner, "confirmed");
if (treasuryLamports < rentMin) {
  const topUp = await connection.sendTransaction(new Transaction().add(SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: treasuryOwner, lamports: rentMin - treasuryLamports })), [admin]);
  await connection.confirmTransaction(topUp, "confirmed");
  console.log(`Funded the treasury wallet to the rent-exempt minimum: ${topUp}`);
}
const mintState = await getMint(connection, mint, "confirmed", tokenProgram);
const faucetAta = await getAssociatedTokenAddress(mint, admin.publicKey, false, tokenProgram);
console.log("KEPT V4 treasury setup complete");
console.log(`KEEPER_PROGRAM_ID=${programId.toBase58()}`);
console.log(`STAKE_MINT=${mint.toBase58()}`);
console.log(`TREASURY_OWNER=${treasuryOwner.toBase58()}`);
console.log(`TREASURY_TOKEN_ACCOUNT=${treasury.address.toBase58()}`);
console.log(`FAUCET_TOKEN_ACCOUNT=${faucetAta.toBase58()}`);
console.log(`TOKEN_PROGRAM_ID=${tokenProgram.toBase58()}`);
console.log(`CONFIG_PDA=${configPda.toBase58()}`);
// An existing Config keeps its verifier (there is no instruction to change it): print that one.
const configuredVerifier = configInfo ? new PublicKey(configInfo.data.subarray(40, 72)) : verifier;
if (configInfo && process.env.VERIFIER_PUBKEY && !configuredVerifier.equals(verifier)) console.warn(`WARNING: the Config's verifier is ${configuredVerifier.toBase58()}, not VERIFIER_PUBKEY; it cannot be changed`);
console.log(`VERIFIER=${configuredVerifier.toBase58()}`);
console.log(`MINT_DECIMALS=${mintState.decimals}`);
console.log(`SETUP_SIGNATURE=${signature}`);
console.log("Set FAUCET_SECRET_KEY to the admin keypair that owns FAUCET_TOKEN_ACCOUNT and VERIFIER_SECRET_KEY to the configured verifier keypair; do not commit either value.");
