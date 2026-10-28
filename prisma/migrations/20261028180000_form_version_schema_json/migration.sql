-- AlterTable
ALTER TABLE "form_versions" ADD COLUMN IF NOT EXISTS "schemaJson" JSONB;
