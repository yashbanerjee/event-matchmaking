-- CreateEnum
CREATE TYPE "MeetingRequestStatus" AS ENUM (
  'PENDING',
  'INTEREST_ACCEPTED',
  'AWAITING_CONFIRMATION',
  'SCHEDULED',
  'DECLINED',
  'CANCELLED'
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromOrgId" UUID NOT NULL,
    "toOrgId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "status" "MeetingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "proposedStartsAt" TIMESTAMP(3),
    "proposedEndsAt" TIMESTAMP(3),
    "proposedByOrgId" UUID,
    "placeId" UUID,
    "meetingId" UUID,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_requests_pkey" PRIMARY KEY ("id")
);

-- AlterTable: peer meetings can exist without a schedule version
ALTER TABLE "meetings" ALTER COLUMN "scheduleVersionId" DROP NOT NULL;
ALTER TABLE "meetings" ADD COLUMN "placeId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");
CREATE UNIQUE INDEX "places_code_key" ON "places"("code");
CREATE INDEX "places_isActive_name_idx" ON "places"("isActive", "name");
CREATE UNIQUE INDEX "meeting_requests_meetingId_key" ON "meeting_requests"("meetingId");
CREATE INDEX "meeting_requests_fromOrgId_status_idx" ON "meeting_requests"("fromOrgId", "status");
CREATE INDEX "meeting_requests_toOrgId_status_idx" ON "meeting_requests"("toOrgId", "status");
CREATE INDEX "meeting_requests_status_createdAt_idx" ON "meeting_requests"("status", "createdAt");
CREATE INDEX "meetings_placeId_startsAt_endsAt_idx" ON "meetings"("placeId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_fromOrgId_fkey" FOREIGN KEY ("fromOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_toOrgId_fkey" FOREIGN KEY ("toOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meeting_requests" ADD CONSTRAINT "meeting_requests_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;
