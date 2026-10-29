-- AlterTable
ALTER TABLE "companies" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "companies_featured_matchingEligible_idx" ON "companies"("featured", "matchingEligible");

-- CreateIndex
CREATE INDEX "vendors_featured_matchingEligible_idx" ON "vendors"("featured", "matchingEligible");
