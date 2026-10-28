-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "CorrectionStatus" AS ENUM ('OPEN', 'RESOLVED', 'SUPERSEDED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable vendors default for new rows
ALTER TABLE "vendors" ALTER COLUMN "approvalStatus" SET DEFAULT 'INVITED';

-- Normalize legacy status values
UPDATE "vendors" SET "approvalStatus" = 'INVITED' WHERE "approvalStatus" IN ('PENDING');
UPDATE "vendors" SET "approvalStatus" = 'VERIFIED' WHERE "approvalStatus" IN ('APPROVED');

-- CreateTable
CREATE TABLE IF NOT EXISTS "submission_corrections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submissionId" UUID NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'OPEN',
    "requestedById" UUID NOT NULL,
    "accessTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "submission_corrections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "submission_correction_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "correctionId" UUID NOT NULL,
    "fieldId" TEXT NOT NULL,
    "note" TEXT NOT NULL,

    CONSTRAINT "submission_correction_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "submission_corrections_accessTokenHash_key" ON "submission_corrections"("accessTokenHash");
CREATE INDEX IF NOT EXISTS "submission_corrections_submissionId_status_idx" ON "submission_corrections"("submissionId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "submission_correction_fields_correctionId_fieldId_key" ON "submission_correction_fields"("correctionId", "fieldId");
CREATE INDEX IF NOT EXISTS "submission_correction_fields_correctionId_idx" ON "submission_correction_fields"("correctionId");

DO $$ BEGIN
  ALTER TABLE "submission_corrections" ADD CONSTRAINT "submission_corrections_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "submission_corrections" ADD CONSTRAINT "submission_corrections_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "submission_correction_fields" ADD CONSTRAINT "submission_correction_fields_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "submission_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
