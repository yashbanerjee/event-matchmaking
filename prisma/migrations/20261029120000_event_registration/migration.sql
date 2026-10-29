-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING_OTP', 'OTP_VERIFIED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EventRegistrationRole" AS ENUM ('CLIENT', 'GUEST');

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "role" "EventRegistrationRole" NOT NULL,
    "formVersionId" UUID NOT NULL,
    "responses" JSONB NOT NULL DEFAULT '{}',
    "organizationName" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpSentAt" TIMESTAMP(3),
    "emailVerifiedAt" TIMESTAMP(3),
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'PENDING_OTP',
    "organizationId" UUID,
    "userId" UUID,
    "submissionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_registrations_email_status_idx" ON "event_registrations"("email", "status");

-- CreateIndex
CREATE INDEX "event_registrations_status_idx" ON "event_registrations"("status");
