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
  /** The Keeper's vision model: an OpenAI-compatible chat-completions endpoint (OpenRouter by default). */
  openApiKey: process.env.OPEN_API_KEY || "",
  visionApiUrl: process.env.VISION_API_URL || "https://openrouter.ai/api/v1/chat/completions",
  visionModel: process.env.VISION_MODEL || "google/gemma-3-27b-it",
  /** Keep well under a 120 s demo day: upload + judge + record_checkin must all fit. */
  visionTimeoutMs: Number(process.env.VISION_TIMEOUT_MS) || 25_000,
  /** The Keeper's voice (ElevenLabs): the API key, the designed voice (scripts/keeper_voice_design.ts) and the TTS model. */
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || "",
  keeperVoiceId: process.env.KEEPER_VOICE_ID || "",
  elevenTtsModel: process.env.ELEVEN_TTS_MODEL || "eleven_flash_v2_5",
  elevenSttModel: process.env.ELEVEN_STT_MODEL || "scribe_v3",
  /** Text model for "Ask the Keeper" answers (same OpenAI-compatible endpoint and key as the vision judge). */
  askModel: process.env.ASK_MODEL || process.env.VISION_MODEL || "google/gemma-3-27b-it",
};
