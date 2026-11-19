// Semantic PG search: each published property gets an embedding of a stable
// description (location, rules, amenities, room types, rent range); queries
// like "quiet PG near the OMR tech park with veg food" are ranked by meaning.
//
// Vectors are stored as Float[] on PGProperty. Where the database offers
// pgvector (Cloud SQL does; see the property_search_pgvector migration) they
// are also kept in a vector column and ranked inside PostgreSQL with cosine
// distance. Elsewhere (the bundled local PostgreSQL) ranking happens in
// process, which is fast at PG-listing scale. Both return the same scores.
//
// Enabled with ENABLE_SEMANTIC_SEARCH=true and AI_EMBEDDING_MODEL.
import { createHash } from 'crypto';
import { prisma } from '../app.js';
import { createEmbeddings, embeddingModelId } from './ai-embeddings.js';
import { logger } from '../utils/logger.js';

const db = new Proxy({} as Record<string, any>, {
  get: (_target, property) => (prisma as any)[property]
});

export const semanticSearchEnabled = (): boolean => process.env.ENABLE_SEMANTIC_SEARCH === 'true' && embeddingModelId().includes(':');

/** Minimum cosine similarity for a meaning-only match (keyword matches always count). */
export const minSemanticScore = (): number => {
  const value = Number(process.env.SEMANTIC_SEARCH_MIN_SCORE);
  return Number.isFinite(value) && value > 0 && value < 1 ? value : 0.6;
};

const GENDER_TEXT: Record<string, string> = { MEN: 'men only', WOMEN: 'women only', ANY: 'all genders (co-living)' };

const INDEX_SELECT = {
  id: true, name: true, description: true, address: true, locality: true, city: true,
  genderPolicy: true, amenities: true, houseRules: true, searchTextHash: true, searchEmbeddingModel: true,
  rooms: { where: { status: 'ACTIVE' }, select: { roomType: true, hasAc: true, foodIncluded: true, monthlyRent: true } }
} as const;

/** Text a property is embedded from. Live data (free beds) is left out on purpose. */
export function propertySearchText(property: any): string {
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String).filter(Boolean).join(', ') : '');
  const rooms = (property.rooms || []) as any[];
  const rents = rooms.map((r) => Number(r.monthlyRent)).filter((n) => Number.isFinite(n) && n > 0);
  const roomTypes = [...new Set(rooms.map((r) => String(r.roomType || '').toLowerCase()).filter(Boolean))];
  const parts = [
    `${property.name}: a paying-guest (PG) accommodation in ${property.locality}, ${property.city}.`,
    property.description ? String(property.description) : '',
    `Address: ${property.address}.`,
    `For ${GENDER_TEXT[property.genderPolicy] || 'all genders'}.`,
    list(property.amenities) ? `Amenities: ${list(property.amenities)}.` : '',
    list(property.houseRules) ? `House rules: ${list(property.houseRules)}.` : '',
    roomTypes.length ? `Room types: ${roomTypes.join(', ')}.` : '',
    rooms.some((r) => r.hasAc) ? 'AC rooms available.' : '',
    rooms.some((r) => r.foodIncluded) ? 'Food included.' : '',
    rents.length ? `Monthly rent from ${Math.min(...rents)} to ${Math.max(...rents)} rupees.` : ''
  ];
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

let vectorColumn: Promise<boolean> | null = null;

/** Whether this database has the optional pgvector column (checked once). */
export function hasVectorColumn(): Promise<boolean> {
  if (!vectorColumn) {
    vectorColumn = db.$queryRawUnsafe(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'PGProperty' AND column_name = 'searchVector'`
    ).then((rows: unknown[]) => rows.length > 0).catch(() => false);
  }
  return vectorColumn!;
}

/** "pgvector" when ranking runs in PostgreSQL, else "in-process". */
export async function searchBackend(): Promise<'pgvector' | 'in-process'> {
  return (await hasVectorColumn()) ? 'pgvector' : 'in-process';
}

const vectorLiteral = (vector: number[]) => `[${vector.map((v) => (Number.isFinite(v) ? v : 0)).join(',')}]`;

const textHash = (model: string, text: string) => createHash('sha256').update(`${model}\n${text}`).digest('hex');

/**
 * Embeds published properties whose description (or the embedding model)
 * changed since they were last indexed. Pass ids to limit the scope.
 */
export async function indexProperties(options: { ids?: string[]; force?: boolean } = {}): Promise<{ indexed: number; skipped: number }> {
  if (!semanticSearchEnabled()) return { indexed: 0, skipped: 0 };
  const model = embeddingModelId();
  const properties = await db.pGProperty.findMany({
    where: { status: 'ACTIVE', ...(options.ids ? { id: { in: options.ids } } : {}) },
    select: INDEX_SELECT
  });
  const pending = properties
    .map((p: any) => ({ id: p.id, text: propertySearchText(p), previousHash: p.searchTextHash }))
    .map((p: any) => ({ ...p, hash: textHash(model, p.text) }))
    .filter((p: any) => options.force || p.hash !== p.previousHash);
  if (!pending.length) return { indexed: 0, skipped: properties.length };

  const embeddings = await createEmbeddings('document');
  const BATCH = 32;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const vectors = await embeddings.embedDocuments(batch.map((p: any) => p.text));
    const withVectorColumn = await hasVectorColumn();
    await Promise.all(batch.map(async (p: any, n: number) => {
      const vector = vectors[n] ?? [];
      await db.pGProperty.update({
        where: { id: p.id },
        data: { searchEmbedding: vector, searchEmbeddingModel: model, searchTextHash: p.hash, searchIndexedAt: new Date() }
      });
      if (withVectorColumn) {
        await db.$executeRawUnsafe(`UPDATE "PGProperty" SET "searchVector" = $1::vector WHERE "id" = $2`, vectorLiteral(vector), p.id);
      }
    }));
  }
  return { indexed: pending.length, skipped: properties.length - pending.length };
}

const scheduled = new Map<string, NodeJS.Timeout>();

/** Re-index a property shortly after it changes (edits often come in bursts). */
export function scheduleSearchIndex(propertyId: string | null | undefined): void {
  if (!propertyId || !semanticSearchEnabled()) return;
  clearTimeout(scheduled.get(propertyId));
  const timer = setTimeout(() => {
    scheduled.delete(propertyId);
    indexProperties({ ids: [propertyId] }).catch((error) => logger.warn({ err: error, propertyId }, '[search] re-index failed'));
  }, 3000);
  timer.unref();
  scheduled.set(propertyId, timer);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Typed queries repeat (debounced search boxes, retries): cache their vectors.
const queryCache = new Map<string, number[]>();
const QUERY_CACHE_MAX = 500;

async function embedQuery(query: string): Promise<number[]> {
  const key = `${embeddingModelId()}|${query.toLowerCase()}`;
  const hit = queryCache.get(key);
  if (hit) return hit;
  const embeddings = await createEmbeddings('query');
  const timeoutMs = Math.max(1000, Number(process.env.MODEL_API_TIMEOUT_MS) || 30000);
  let timer: NodeJS.Timeout | undefined;
  const vector = await Promise.race([
    embeddings.embedQuery(query),
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('EMBEDDINGS_TIMEOUT')), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
  if (queryCache.size >= QUERY_CACHE_MAX) queryCache.delete(queryCache.keys().next().value!);
  queryCache.set(key, vector);
  return vector;
}

/**
 * Similarity of each published property (matching `where`) to the query, by
 * meaning. Properties not yet indexed with the current model are left out.
 */
export async function semanticScores(query: string, where: Record<string, unknown> = {}): Promise<Map<string, number>> {
  const vector = await embedQuery(query);
  const model = embeddingModelId();
  const scores = new Map<string, number>();
  if (await hasVectorColumn()) {
    // Prisma applies the access filters; PostgreSQL ranks by cosine distance.
    const candidates = await db.pGProperty.findMany({ where: { status: 'ACTIVE', searchEmbeddingModel: model, ...where }, select: { id: true } });
    if (!candidates.length) return scores;
    const rows: { id: string; score: number }[] = await db.$queryRawUnsafe(
      `SELECT "id", 1 - ("searchVector" <=> $1::vector) AS "score"
         FROM "PGProperty"
        WHERE "id" = ANY($2::text[]) AND "searchVector" IS NOT NULL AND vector_dims("searchVector") = $3`,
      vectorLiteral(vector), candidates.map((c: { id: string }) => c.id), vector.length
    );
    // pgvector yields NaN for all-zero vectors; match the in-process result (0).
    for (const row of rows) scores.set(row.id, Number.isFinite(Number(row.score)) ? Number(row.score) : 0);
    return scores;
  }
  const rows = await db.pGProperty.findMany({
    where: { status: 'ACTIVE', searchEmbeddingModel: model, ...where },
    select: { id: true, searchEmbedding: true }
  });
  for (const row of rows) scores.set(row.id, cosineSimilarity(vector, row.searchEmbedding || []));
  return scores;
}

/** Clears cached query vectors (tests, model changes). */
export function clearSemanticQueryCache(): void {
  queryCache.clear();
}
