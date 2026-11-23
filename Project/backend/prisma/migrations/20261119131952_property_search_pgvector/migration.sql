-- Optional pgvector support for semantic search (see services/semantic-search.ts).
-- Servers that offer the extension (Cloud SQL for PostgreSQL does) get a
-- vector column ranked inside the database; others (the bundled local
-- PostgreSQL) skip this and rank in the application. The column is not in
-- schema.prisma on purpose: the app reads and writes it with SQL only when it
-- exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS vector;
    ALTER TABLE "PGProperty" ADD COLUMN IF NOT EXISTS "searchVector" vector;
  END IF;
END $$;
