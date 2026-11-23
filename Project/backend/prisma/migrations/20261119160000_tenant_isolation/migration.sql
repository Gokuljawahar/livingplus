-- AlterTable
ALTER TABLE "PGBed" ADD COLUMN     "propertyId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PGRentEntry" ADD COLUMN     "propertyId" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "PGBed_propertyId_idx" ON "PGBed"("propertyId");

-- CreateIndex
CREATE INDEX "PGRentEntry_propertyId_period_idx" ON "PGRentEntry"("propertyId", "period");


-- ============================================================================
-- Workspace (PG) isolation enforced by PostgreSQL itself.
--
-- Every PG is a workspace. Requests run as the restricted role livingplus_app
-- (set per transaction by the Prisma client in src/db/client.ts) together with
-- who is asking: app.user_id, app.role and app.property_id. Row-Level Security
-- below then filters every query, so a forgotten WHERE clause cannot read or
-- change another PG's data. The connection's own role (owner of the tables)
-- is used only for migrations and explicitly marked system jobs.
-- ============================================================================

-- Backfill the new workspace keys.
UPDATE "PGBed" b SET "propertyId" = r."propertyId" FROM "PGRoom" r WHERE r."id" = b."roomId";
UPDATE "PGRentEntry" e SET "propertyId" = t."propertyId" FROM "PGTenant" t WHERE t."id" = e."tenantId";

-- Derived keys: always copied from the parent row, whatever the client sends.
CREATE OR REPLACE FUNCTION app_derive_property_id() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_id text;
BEGIN
  EXECUTE format('SELECT ($1).%I', TG_ARGV[0]) INTO parent_id USING NEW;
  EXECUTE format('SELECT "propertyId" FROM %I WHERE "id" = $1', TG_ARGV[1]) INTO NEW."propertyId" USING parent_id;
  IF NEW."propertyId" IS NULL THEN
    RAISE EXCEPTION '%: % does not exist', TG_TABLE_NAME, TG_ARGV[0] USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER app_derive_property_id BEFORE INSERT OR UPDATE OF "roomId", "propertyId" ON "PGBed"
  FOR EACH ROW EXECUTE FUNCTION app_derive_property_id('roomId', 'PGRoom');
CREATE TRIGGER app_derive_property_id BEFORE INSERT OR UPDATE OF "tenantId", "propertyId" ON "PGRentEntry"
  FOR EACH ROW EXECUTE FUNCTION app_derive_property_id('tenantId', 'PGTenant');

-- No cross-workspace references: each (column, table) pair must point at a row of the same PG.
CREATE OR REPLACE FUNCTION app_same_property() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i int := 0;
  ref_id text;
  ref_property text;
BEGIN
  WHILE i < TG_NARGS LOOP
    EXECUTE format('SELECT ($1).%I', TG_ARGV[i]) INTO ref_id USING NEW;
    IF ref_id IS NOT NULL THEN
      EXECUTE format('SELECT "propertyId" FROM %I WHERE "id" = $1', TG_ARGV[i + 1]) INTO ref_property USING ref_id;
      IF ref_property IS DISTINCT FROM NEW."propertyId" THEN
        RAISE EXCEPTION '%.% must belong to the same PG', TG_TABLE_NAME, TG_ARGV[i] USING ERRCODE = '42501';
      END IF;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER app_same_property BEFORE INSERT OR UPDATE ON "PGBooking"
  FOR EACH ROW EXECUTE FUNCTION app_same_property('bedId', 'PGBed');
CREATE TRIGGER app_same_property BEFORE INSERT OR UPDATE ON "PGTenant"
  FOR EACH ROW EXECUTE FUNCTION app_same_property('bedId', 'PGBed', 'bookingId', 'PGBooking');
CREATE TRIGGER app_same_property BEFORE INSERT OR UPDATE ON "PGMaintenanceTicket"
  FOR EACH ROW EXECUTE FUNCTION app_same_property('bedId', 'PGBed', 'tenantId', 'PGTenant');
CREATE TRIGGER app_same_property BEFORE INSERT OR UPDATE ON "PGPaymentClaim"
  FOR EACH ROW EXECUTE FUNCTION app_same_property('tenantId', 'PGTenant', 'rentEntryId', 'PGRentEntry');
CREATE TRIGGER app_same_property BEFORE INSERT OR UPDATE ON "PGResidentNotification"
  FOR EACH ROW EXECUTE FUNCTION app_same_property('tenantId', 'PGTenant');
CREATE TRIGGER app_same_property BEFORE INSERT OR UPDATE ON "PGRoomChangeRequest"
  FOR EACH ROW EXECUTE FUNCTION app_same_property('requesterId', 'PGTenant', 'partnerId', 'PGTenant', 'fromBedId', 'PGBed', 'toBedId', 'PGBed');

-- The restricted role requests run as. It cannot log in, owns nothing and cannot bypass RLS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'livingplus_app') THEN
    CREATE ROLE livingplus_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
-- Lets the app's connection switch to it inside a transaction (SET LOCAL ROLE).
GRANT livingplus_app TO CURRENT_USER;

GRANT USAGE ON SCHEMA public TO livingplus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO livingplus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO livingplus_app;
REVOKE ALL ON "_prisma_migrations" FROM livingplus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO livingplus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO livingplus_app;

-- Who is asking, as set by the app for this transaction ('' and unset mean nobody).
CREATE OR REPLACE FUNCTION app_ctx(key text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.' || key, true), '') $$;

-- Owners and wardens of the PG (staff), within the PG the request is scoped to, if any.
CREATE OR REPLACE FUNCTION app_can_manage_property(pid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pid IS NOT NULL
    AND app_ctx('role') IN ('PG_OWNER', 'PG_WARDEN')
    AND (app_ctx('property_id') IS NULL OR app_ctx('property_id') = pid)
    AND EXISTS (SELECT 1 FROM "PGPropertyAccess" a WHERE a."propertyId" = pid AND a."userId" = app_ctx('user_id'))
$$;

-- Staff of the PG, or a resident with a stay there (matched on the account's phone number).
CREATE OR REPLACE FUNCTION app_can_access_property(pid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_can_manage_property(pid) OR (
    pid IS NOT NULL
    AND app_ctx('role') = 'PG_TENANT'
    AND (app_ctx('property_id') IS NULL OR app_ctx('property_id') = pid)
    AND EXISTS (
      SELECT 1 FROM "PGTenant" t JOIN "User" u ON u."id" = app_ctx('user_id')
      WHERE t."propertyId" = pid
        AND right(regexp_replace(t."phone", '\D', '', 'g'), 10) = right(regexp_replace(u."phone", '\D', '', 'g'), 10)
    )
  )
$$;

-- Published PGs: their listing, rooms and beds are public.
CREATE OR REPLACE FUNCTION app_property_is_public(pid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM "PGProperty" p WHERE p."id" = pid AND p."status" = 'ACTIVE')
$$;

-- Listings, rooms and beds.
ALTER TABLE "PGProperty" ENABLE ROW LEVEL SECURITY;
CREATE POLICY listing_read ON "PGProperty" FOR SELECT TO livingplus_app USING ("status" = 'ACTIVE' OR app_can_access_property("id"));
CREATE POLICY staff_update ON "PGProperty" FOR UPDATE TO livingplus_app USING (app_can_manage_property("id")) WITH CHECK (app_can_manage_property("id"));
CREATE POLICY staff_delete ON "PGProperty" FOR DELETE TO livingplus_app USING (app_can_manage_property("id"));
-- (No INSERT policy: new workspaces are created only by the registration and add-property system flows.)

ALTER TABLE "PGRoom" ENABLE ROW LEVEL SECURITY;
CREATE POLICY listing_read ON "PGRoom" FOR SELECT TO livingplus_app USING (app_property_is_public("propertyId") OR app_can_access_property("propertyId"));
CREATE POLICY staff_write ON "PGRoom" FOR ALL TO livingplus_app USING (app_can_manage_property("propertyId")) WITH CHECK (app_can_manage_property("propertyId"));

ALTER TABLE "PGBed" ENABLE ROW LEVEL SECURITY;
CREATE POLICY listing_read ON "PGBed" FOR SELECT TO livingplus_app USING (app_property_is_public("propertyId") OR app_can_access_property("propertyId"));
CREATE POLICY staff_write ON "PGBed" FOR ALL TO livingplus_app USING (app_can_manage_property("propertyId")) WITH CHECK (app_can_manage_property("propertyId"));

-- Staff-only workspace data.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['PGPropertyAccess', 'PGBooking', 'PGExpense', 'PGElectricityBill'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY workspace_staff ON %I FOR ALL TO livingplus_app USING (app_can_manage_property("propertyId")) WITH CHECK (app_can_manage_property("propertyId"))', t);
  END LOOP;
END $$;

-- Data shared by a PG's staff and its residents (which resident sees which row is still decided by the app).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['PGTenant', 'PGRentEntry', 'PGMaintenanceTicket', 'PGPaymentClaim', 'PGResidentNotification', 'PGRoomChangeRequest'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY workspace_members ON %I FOR ALL TO livingplus_app USING (app_can_access_property("propertyId")) WITH CHECK (app_can_access_property("propertyId"))', t);
  END LOOP;
END $$;

-- Audit log: anyone in the PG may record an action; only staff read it. Entries are never edited.
ALTER TABLE "PHAuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_write ON "PHAuditLog" FOR INSERT TO livingplus_app WITH CHECK (app_can_access_property("propertyId"));
CREATE POLICY audit_read ON "PHAuditLog" FOR SELECT TO livingplus_app USING (app_can_manage_property("propertyId"));

-- Assistant conversations belong to the account that started them (guests share the anonymous bucket).
ALTER TABLE "ConversationSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_sessions ON "ConversationSession" FOR ALL TO livingplus_app
  USING ("userId" IS NOT DISTINCT FROM app_ctx('user_id')) WITH CHECK ("userId" IS NOT DISTINCT FROM app_ctx('user_id'));

-- "User" and "OtpCode" are global identity tables (sign-in looks up any phone number);
-- they stay outside RLS and are protected by the auth code.
