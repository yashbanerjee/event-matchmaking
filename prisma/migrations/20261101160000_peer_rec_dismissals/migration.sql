-- Persist "not interested" so dismissed peers never reappear after recompute.
CREATE TABLE IF NOT EXISTS "org_peer_recommendation_dismissals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromOrgId" UUID NOT NULL,
    "toOrgId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_peer_recommendation_dismissals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_peer_recommendation_dismissals_fromOrgId_toOrgId_key"
  ON "org_peer_recommendation_dismissals"("fromOrgId", "toOrgId");

CREATE INDEX IF NOT EXISTS "org_peer_recommendation_dismissals_fromOrgId_idx"
  ON "org_peer_recommendation_dismissals"("fromOrgId");

CREATE INDEX IF NOT EXISTS "org_peer_recommendation_dismissals_toOrgId_idx"
  ON "org_peer_recommendation_dismissals"("toOrgId");

DO $$ BEGIN
  ALTER TABLE "org_peer_recommendation_dismissals"
    ADD CONSTRAINT "org_peer_recommendation_dismissals_fromOrgId_fkey"
    FOREIGN KEY ("fromOrgId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "org_peer_recommendation_dismissals"
    ADD CONSTRAINT "org_peer_recommendation_dismissals_toOrgId_fkey"
    FOREIGN KEY ("toOrgId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
