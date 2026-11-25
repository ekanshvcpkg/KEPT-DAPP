export const config = {
  port: Number(process.env.PORT ?? 3000),
  devnetRpcUrl: process.env.DEVNET_RPC_URL ?? "https://api.devnet.solana.com",
  programId: process.env.KEEPER_PROGRAM_ID || "7VpBDwXiDvvaG29VBFUPankoSWFVanyD9KcT7wbmLVzj",
  sessionSecret: process.env.SESSION_SECRET || "",
  verifierSecretKey: process.env.VERIFIER_SECRET_KEY || "",
  faucetSecretKey: process.env.FAUCET_SECRET_KEY || "",
  stakeMint: process.env.STAKE_MINT || "",
  treasuryTokenAccount: process.env.TREASURY_TOKEN_ACCOUNT || "",
  sgtMock: process.env.SGT_MOCK === "true",
  sgtMockAllowlist: (process.env.SGT_MOCK_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean),
  genesisGroup: process.env.GENESIS_GROUP || "",
  proofStorageDir: process.env.PROOF_STORAGE_DIR || "/tmp/kept-proofs",
  fcmServiceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON || "",
  adminSecret: process.env.ADMIN_SECRET || "",
  bountyPayer: process.env.BOUNTY_PAYER || "faucet",
  /** Default minutes between the start and end photo (Oaths without their own minMinutes). */
  sessionMinMinutes: Number(process.env.SESSION_MIN_MINUTES) || 30,
};
