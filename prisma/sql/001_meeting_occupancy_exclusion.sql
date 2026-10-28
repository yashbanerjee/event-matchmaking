-- Prevent overlapping meeting occupancy for the same participant.
-- Uses a stored tstzrange column populated by trigger (expression indexes require IMMUTABLE).

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE meeting_occupancies
  ADD COLUMN IF NOT EXISTS occupied_range tstzrange;

CREATE OR REPLACE FUNCTION em_set_meeting_occupancy_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.occupied_range := tstzrange(NEW."startsAt", NEW."endsAt", '[)');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_occupancy_range ON meeting_occupancies;
CREATE TRIGGER trg_meeting_occupancy_range
BEFORE INSERT OR UPDATE OF "startsAt", "endsAt"
ON meeting_occupancies
FOR EACH ROW
EXECUTE FUNCTION em_set_meeting_occupancy_range();

UPDATE meeting_occupancies
SET occupied_range = tstzrange("startsAt", "endsAt", '[)')
WHERE occupied_range IS NULL;

ALTER TABLE meeting_occupancies
  DROP CONSTRAINT IF EXISTS meeting_occupancies_no_overlap;

ALTER TABLE meeting_occupancies
  ADD CONSTRAINT meeting_occupancies_no_overlap
  EXCLUDE USING gist (
    "participantKey" WITH =,
    occupied_range WITH &&
  );
