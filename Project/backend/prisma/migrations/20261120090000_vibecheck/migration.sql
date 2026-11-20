-- VibeCheck: lifestyle answers on booking requests and residents.
-- Row-Level Security policies on both tables already cover the new columns.
ALTER TABLE "PGBooking" ADD COLUMN "vibeAnswers" JSONB;
ALTER TABLE "PGTenant" ADD COLUMN "vibeAnswers" JSONB;
-- Habit summaries written by the VibeCheck profile agent (habits only, no identity details).
ALTER TABLE "PGBooking" ADD COLUMN "vibeSummary" TEXT;
ALTER TABLE "PGTenant" ADD COLUMN "vibeSummary" TEXT;
