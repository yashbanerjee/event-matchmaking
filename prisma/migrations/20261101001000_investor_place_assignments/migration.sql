-- CreateTable
CREATE TABLE "investor_place_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "placeId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investor_place_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "investor_place_assignments_organizationId_startsAt_endsAt_idx"
  ON "investor_place_assignments"("organizationId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "investor_place_assignments_placeId_startsAt_endsAt_idx"
  ON "investor_place_assignments"("placeId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "investor_place_assignments"
  ADD CONSTRAINT "investor_place_assignments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_place_assignments"
  ADD CONSTRAINT "investor_place_assignments_placeId_fkey"
  FOREIGN KEY ("placeId") REFERENCES "places"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_place_assignments"
  ADD CONSTRAINT "investor_place_assignments_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
