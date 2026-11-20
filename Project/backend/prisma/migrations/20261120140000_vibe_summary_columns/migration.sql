-- The vibeSummary columns were added to the 20261120090000_vibecheck migration
-- after that migration had already been applied to some databases, so those
-- databases never got them. Add them where missing; a no-op elsewhere.
ALTER TABLE "PGTenant" ADD COLUMN IF NOT EXISTS "vibeSummary" TEXT;
ALTER TABLE "PGBooking" ADD COLUMN IF NOT EXISTS "vibeSummary" TEXT;
