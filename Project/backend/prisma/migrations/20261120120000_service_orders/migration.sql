-- AlterTable
ALTER TABLE "PGProperty" ADD COLUMN     "serviceSettings" JSONB;

-- CreateTable
CREATE TABLE "PGServiceOrder" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PGServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PGServiceOrder_propertyId_forDate_idx" ON "PGServiceOrder"("propertyId", "forDate");

-- CreateIndex
CREATE INDEX "PGServiceOrder_tenantId_forDate_idx" ON "PGServiceOrder"("tenantId", "forDate");

-- AddForeignKey
ALTER TABLE "PGServiceOrder" ADD CONSTRAINT "PGServiceOrder_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "PGProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PGServiceOrder" ADD CONSTRAINT "PGServiceOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "PGTenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolation (see tenant_isolation): orders belong to the resident's PG; that PG's
-- staff and residents can work with them (which resident sees which order is app logic).
CREATE TRIGGER app_same_property BEFORE INSERT OR UPDATE ON "PGServiceOrder"
  FOR EACH ROW EXECUTE FUNCTION app_same_property('tenantId', 'PGTenant');
ALTER TABLE "PGServiceOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_members ON "PGServiceOrder" FOR ALL TO livingplus_app
  USING (app_can_access_property("propertyId")) WITH CHECK (app_can_access_property("propertyId"));
