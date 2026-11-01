-- Record on-site meeting start/stop times separately from scheduled slot times.
ALTER TABLE "meetings"
  ADD COLUMN IF NOT EXISTS "actualStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actualEndedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "actualDurationMinutes" INTEGER;
