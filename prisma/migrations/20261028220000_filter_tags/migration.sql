-- CreateTable
CREATE TABLE "filter_dimensions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "profileKey" TEXT NOT NULL DEFAULT 'categories',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filter_dimensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filter_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dimensionId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filter_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "filter_tag_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromTagId" UUID NOT NULL,
    "toTagId" UUID NOT NULL,
    "bidirectional" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filter_tag_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filter_dimensions_code_key" ON "filter_dimensions"("code");
CREATE INDEX "filter_dimensions_isActive_sortOrder_idx" ON "filter_dimensions"("isActive", "sortOrder");
CREATE UNIQUE INDEX "filter_tags_dimensionId_value_key" ON "filter_tags"("dimensionId", "value");
CREATE INDEX "filter_tags_dimensionId_isActive_sortOrder_idx" ON "filter_tags"("dimensionId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "filter_tag_mappings_fromTagId_toTagId_key" ON "filter_tag_mappings"("fromTagId", "toTagId");
CREATE INDEX "filter_tag_mappings_toTagId_idx" ON "filter_tag_mappings"("toTagId");

-- AddForeignKey
ALTER TABLE "filter_tags" ADD CONSTRAINT "filter_tags_dimensionId_fkey" FOREIGN KEY ("dimensionId") REFERENCES "filter_dimensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "filter_tag_mappings" ADD CONSTRAINT "filter_tag_mappings_fromTagId_fkey" FOREIGN KEY ("fromTagId") REFERENCES "filter_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "filter_tag_mappings" ADD CONSTRAINT "filter_tag_mappings_toTagId_fkey" FOREIGN KEY ("toTagId") REFERENCES "filter_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
