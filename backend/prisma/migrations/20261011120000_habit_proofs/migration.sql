-- One photo proves one habit (DECISIONS D-98): each habit keeps the object it is proven with, and each passed photo is a row.

-- AlterTable: what each habit is proven with (the text the on-device model is asked for), same order as "habits".
-- Empty for Oaths made before this: every habit then uses the Oath's own object.
ALTER TABLE "OathDetails"
ADD COLUMN "habitObjects" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable: the habit a photo check was for (null for checks sent without one, e.g. bounties and the earlier two-photo flow).
ALTER TABLE "ProofVerification"
ADD COLUMN "habit" INTEGER;

-- CreateTable: a habit's proven photo for a day. The day is recorded on chain once every habit has a row.
CREATE TABLE "HabitProof" (
    "id" SERIAL NOT NULL,
    "oath" TEXT NOT NULL,
    "wallet" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "habit" INTEGER NOT NULL,
    "proofHash" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitProof_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HabitProof_oath_wallet_dayIndex_habit_key" ON "HabitProof"("oath", "wallet", "dayIndex", "habit");

-- CreateIndex
CREATE INDEX "ProofVerification_wallet_oath_dayIndex_habit_idx" ON "ProofVerification"("wallet", "oath", "dayIndex", "habit");
