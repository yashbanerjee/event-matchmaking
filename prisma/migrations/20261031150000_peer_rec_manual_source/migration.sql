-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PeerRecommendationSource" AS ENUM ('COMPUTED', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "org_peer_recommendations"
  ADD COLUMN IF NOT EXISTS "source" "PeerRecommendationSource" NOT NULL DEFAULT 'COMPUTED';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "org_peer_recommendations_fromOrgId_source_idx"
  ON "org_peer_recommendations"("fromOrgId", "source");
