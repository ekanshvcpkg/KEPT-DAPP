-- AlterTable
ALTER TABLE "OathDetails"
ADD COLUMN "habits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Existing Oaths used their one goal string as their only habit.
UPDATE "OathDetails"
SET "habits" = ARRAY["goalText"]::TEXT[]
WHERE cardinality("habits") = 0;
