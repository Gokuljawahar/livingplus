-- AlterTable
ALTER TABLE "PGProperty" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "foodDetails" TEXT,
ADD COLUMN     "highlights" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "nearbyPlaces" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "onboardedByAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "propertyType" TEXT NOT NULL DEFAULT 'PG',
ADD COLUMN     "tagline" TEXT;

-- AlterTable
ALTER TABLE "PGRoom" ADD COLUMN     "amenities" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "photoUrls" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "OwnerLead" (
    "id" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "propertyName" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Chennai',
    "locality" TEXT NOT NULL,
    "address" TEXT,
    "propertyType" TEXT NOT NULL DEFAULT 'PG',
    "genderPolicy" TEXT NOT NULL DEFAULT 'ANY',
    "propertyCount" INTEGER NOT NULL DEFAULT 1,
    "totalRooms" INTEGER,
    "totalBeds" INTEGER,
    "startingRent" DOUBLE PRECISION,
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "internalNotes" TEXT,
    "onboardedPropertyId" TEXT,
    "onboardedOwnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerLead_status_createdAt_idx" ON "OwnerLead"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OwnerLead_phone_idx" ON "OwnerLead"("phone");

-- ============================================================================
-- Internal LivingPlus concierge onboarding ops (PLATFORM_ADMIN).
-- Keeps existing PG_OWNER / PG_WARDEN / PG_TENANT isolation completely intact,
-- and never bypasses PG host scoping because admin endpoints enforce unscoped
-- main-host access before setting context.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT app_ctx('role') = 'PLATFORM_ADMIN' $$;

ALTER TABLE "OwnerLead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_all ON "OwnerLead" FOR ALL TO livingplus_app
  USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());

CREATE POLICY admin_all ON "PGProperty" FOR ALL TO livingplus_app
  USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());

CREATE POLICY admin_all ON "PGRoom" FOR ALL TO livingplus_app
  USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());

CREATE POLICY admin_all ON "PGBed" FOR ALL TO livingplus_app
  USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());

CREATE POLICY admin_all ON "PGPropertyAccess" FOR ALL TO livingplus_app
  USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());

CREATE POLICY admin_all ON "PHAuditLog" FOR ALL TO livingplus_app
  USING (app_is_platform_admin()) WITH CHECK (app_is_platform_admin());
