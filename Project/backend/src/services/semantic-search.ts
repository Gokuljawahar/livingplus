// Semantic PG search: each published property gets an embedding of a stable
// description (location, rules, amenities, room types, rent range); queries
// like "quiet PG near the OMR tech park with veg food" are ranked by meaning.
//
// Vectors are stored as Float[] on PGProperty and ranked in process, which is
// fast at PG-listing scale (hundreds to low thousands) and needs no database
// extension, so it runs the same locally, in CI and on Cloud SQL. For much
// larger catalogues, move the column to pgvector (supported by Cloud SQL).
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
    await Promise.all(batch.map((p: any, n: number) => db.pGProperty.update({
      where: { id: p.id },
      data: { searchEmbedding: vectors[n] ?? [], searchEmbeddingModel: model, searchTextHash: p.hash, searchIndexedAt: new Date() }
    })));
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
  const rows = await db.pGProperty.findMany({
    where: { status: 'ACTIVE', searchEmbeddingModel: model, ...where },
    select: { id: true, searchEmbedding: true }
  });
  const scores = new Map<string, number>();
  for (const row of rows) scores.set(row.id, cosineSimilarity(vector, row.searchEmbedding || []));
  return scores;
}

/** Clears cached query vectors (tests, model changes). */
export function clearSemanticQueryCache(): void {
  queryCache.clear();
}
