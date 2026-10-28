-- AlterTable
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'INVITED';

CREATE INDEX IF NOT EXISTS "companies_matchingEligible_approvalStatus_idx"
  ON "companies"("matchingEligible", "approvalStatus");
