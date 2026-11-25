-- The Keeper's server-side photo check: receipts whose hash goes on chain.
ALTER TABLE "ProofVerification" ADD COLUMN "photoHash" TEXT;
ALTER TABLE "ProofVerification" ADD COLUMN "receipt" JSONB;
ALTER TABLE "ProofVerification" ADD COLUMN "receiptHash" TEXT;
ALTER TABLE "ProofVerification" ADD COLUMN "model" TEXT;
ALTER TABLE "ProofVerification" ADD COLUMN "memoSignature" TEXT;
CREATE UNIQUE INDEX "ProofVerification_receiptHash_key" ON "ProofVerification"("receiptHash");
CREATE INDEX "ProofVerification_wallet_photoHash_idx" ON "ProofVerification"("wallet", "photoHash");

-- Challenges derived from a Solana blockhash.
ALTER TABLE "GestureChallenge" ADD COLUMN "slot" INTEGER;
ALTER TABLE "GestureChallenge" ADD COLUMN "blockhash" TEXT;
