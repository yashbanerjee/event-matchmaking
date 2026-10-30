-- CreateTable
CREATE TABLE "org_peer_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromOrgId" UUID NOT NULL,
    "toOrgId" UUID NOT NULL,
    "perspective" "OrganizationType" NOT NULL,
    "ruleScore" DOUBLE PRECISION NOT NULL,
    "aiScore" DOUBLE PRECISION,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiDescription" TEXT,
    "scoreBreakdown" JSONB NOT NULL DEFAULT '{}',
    "fromProfileVersion" INTEGER NOT NULL DEFAULT 1,
    "toProfileVersion" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_peer_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_peer_recommendations_fromOrgId_totalScore_idx" ON "org_peer_recommendations"("fromOrgId", "totalScore");

-- CreateIndex
CREATE INDEX "org_peer_recommendations_toOrgId_totalScore_idx" ON "org_peer_recommendations"("toOrgId", "totalScore");

-- CreateIndex
CREATE INDEX "org_peer_recommendations_perspective_computedAt_idx" ON "org_peer_recommendations"("perspective", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "org_peer_recommendations_fromOrgId_toOrgId_key" ON "org_peer_recommendations"("fromOrgId", "toOrgId");

-- AddForeignKey
ALTER TABLE "org_peer_recommendations" ADD CONSTRAINT "org_peer_recommendations_fromOrgId_fkey" FOREIGN KEY ("fromOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_peer_recommendations" ADD CONSTRAINT "org_peer_recommendations_toOrgId_fkey" FOREIGN KEY ("toOrgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
