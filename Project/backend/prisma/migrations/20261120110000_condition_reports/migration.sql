-- CreateTable
CREATE TABLE "PGConditionReport" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "notes" TEXT,
    "photoUrls" TEXT[],
    "createdBy" TEXT,
    "createdByRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PGConditionReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PGConditionReport_tenantId_createdAt_idx" ON "PGConditionReport"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PGConditionReport_propertyId_idx" ON "PGConditionReport"("propertyId");

-- AddForeignKey
ALTER TABLE "PGConditionReport" ADD CONSTRAINT "PGConditionReport_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGConditionReport" ADD CONSTRAINT "PGConditionReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PGTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Isolation (see tenant_isolation): the report must belong to the resident's PG,
-- and records are append-only: staff and that PG's residents may add and read, nobody edits or deletes.
CREATE TRIGGER app_same_property BEFORE INSERT OR UPDATE ON "PGConditionReport"
  FOR EACH ROW EXECUTE FUNCTION app_same_property('tenantId', 'PGTenant');
GRANT SELECT, INSERT ON "PGConditionReport" TO livingplus_app;
REVOKE UPDATE, DELETE ON "PGConditionReport" FROM livingplus_app;
ALTER TABLE "PGConditionReport" ENABLE ROW LEVEL SECURITY;
CREATE POLICY condition_read ON "PGConditionReport" FOR SELECT TO livingplus_app USING (app_can_access_property("propertyId"));
CREATE POLICY condition_add ON "PGConditionReport" FOR INSERT TO livingplus_app WITH CHECK (app_can_access_property("propertyId"));
