-- CreateTable
CREATE TABLE "PlatformCatalog" (
    "key" TEXT NOT NULL,
    "description" TEXT,
    "data" JSONB NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCatalog_pkey" PRIMARY KEY ("key")
);

-- Enable RLS: public read for everyone, write restricted to PLATFORM_ADMIN
ALTER TABLE "PlatformCatalog" ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_public_read ON "PlatformCatalog"
  FOR SELECT TO livingplus_app
  USING (true);

CREATE POLICY catalog_admin_write ON "PlatformCatalog"
  FOR ALL TO livingplus_app
  USING (app_is_platform_admin())
  WITH CHECK (app_is_platform_admin());
