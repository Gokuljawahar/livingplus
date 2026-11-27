// Dynamic platform catalog service backed by PostgreSQL (`PlatformCatalog` table)
// and an in-memory `lru-cache` (60s TTL, instant invalidation on admin updates).
//
// On server startup, `provisionPlatformCatalog(systemPrisma)` inserts any missing
// catalog rows into PostgreSQL so every dropdown, facility category, landmark,
// VibeCheck question, KYC type, slot, price band, and assistant prompt is stored
// dynamically in the database and editable at runtime via `/admin/catalog`.
import type { Prisma, PrismaClient } from '@prisma/client';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import {
  INITIAL_PLATFORM_CATALOG_SEEDS,
  PLATFORM_CATALOG_DESCRIPTIONS,
  PLATFORM_CATALOG_KEYS,
  type PlatformCatalogData,
  type PlatformCatalogKey
} from '@livingplus/shared';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';

const catalogOptionSchema = z.object({
  value: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(160),
  shortLabel: z.string().trim().min(1).max(60).optional(),
  hint: z.string().trim().max(300).optional()
});

const vibeOptionSchema = z.object({
  value: z.number().int().min(0).max(2),
  label: z.string().trim().min(1).max(120)
});

const personaCopySchema = z.object({
  welcome: z.string().trim().min(1).max(1000),
  placeholder: z.string().trim().min(1).max(200),
  suggestedPrompts: z.array(z.string().trim().min(1).max(120)).max(10)
});

export const CATALOG_SECTION_SCHEMAS: { [K in PlatformCatalogKey]: z.ZodType<PlatformCatalogData[K]> } = {
  defaultCity: z.string().trim().min(1).max(100),
  amenityCategories: z.array(
    z.object({
      category: z.string().trim().min(1).max(80),
      options: z.array(z.string().trim().min(1).max(100)).min(1).max(50)
    })
  ).min(1).max(20),
  roomAmenityOptions: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  landmarks: z.array(
    z.object({
      id: z.string().trim().min(1).max(80),
      name: z.string().trim().min(1).max(160),
      kind: z.string().trim().min(1).max(40),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180)
    })
  ).max(200),
  propertyTypes: z.array(catalogOptionSchema).min(1).max(30),
  roomTypes: z.array(catalogOptionSchema).min(1).max(30),
  genderPolicies: z.array(catalogOptionSchema).min(1).max(10),
  priceBands: z.array(
    z.object({
      label: z.string().trim().min(1).max(80),
      min: z.string().trim().max(20),
      max: z.string().trim().max(20)
    })
  ).max(20),
  sortOptions: z.array(catalogOptionSchema).min(1).max(20),
  vibeQuestions: z.array(
    z.object({
      id: z.string().trim().min(1).max(40),
      question: z.string().trim().min(1).max(240),
      weight: z.number().min(1).max(5),
      options: z.tuple([vibeOptionSchema, vibeOptionSchema, vibeOptionSchema]),
      phrase: z.tuple([
        z.string().trim().min(1).max(120),
        z.string().trim().min(1).max(120),
        z.string().trim().min(1).max(120)
      ])
    })
  ).min(1).max(20),
  bloodGroups: z.array(z.string().trim().min(1).max(10)).min(1).max(20),
  kycTypes: z.array(catalogOptionSchema).min(1).max(30),
  paymentMethods: z.array(catalogOptionSchema).min(1).max(20),
  expenseCategories: z.array(catalogOptionSchema).min(1).max(30),
  maintenanceCategories: z.array(catalogOptionSchema).min(1).max(30),
  ticketPriorities: z.array(catalogOptionSchema).min(1).max(10),
  mealSlots: z.array(catalogOptionSchema).min(1).max(10),
  cleaningSlots: z.array(catalogOptionSchema).min(1).max(10),
  leadStatuses: z.array(catalogOptionSchema).min(1).max(20),
  defaultHouseRules: z.array(z.string().trim().min(1).max(300)).max(30),
  assistantPersonas: z.object({
    guest: personaCopySchema,
    resident: personaCopySchema,
    warden: personaCopySchema,
    owner: personaCopySchema
  })
};

const catalogCache = new LRUCache<string, PlatformCatalogData>({
  max: 1,
  ttl: 60_000
});

export function invalidatePlatformCatalogCache(): void {
  catalogCache.clear();
}

export function isPlatformCatalogKey(key: string): key is PlatformCatalogKey {
  return (PLATFORM_CATALOG_KEYS as readonly string[]).includes(key);
}

/**
 * Provisions any missing `PlatformCatalog` keys into PostgreSQL on startup or seed.
 * Existing database values edited by admins are never overwritten.
 */
export async function provisionPlatformCatalog(client: PrismaClient = db): Promise<number> {
  if (!(client as any).platformCatalog?.findMany) return 0;
  const existing = await client.platformCatalog.findMany({ select: { key: true } });
  const existingKeys = new Set(existing.map((row) => row.key));
  let inserted = 0;

  for (const key of PLATFORM_CATALOG_KEYS) {
    if (existingKeys.has(key)) continue;
    await client.platformCatalog.upsert({
      where: { key },
      update: {},
      create: {
        key,
        description: PLATFORM_CATALOG_DESCRIPTIONS[key],
        data: INITIAL_PLATFORM_CATALOG_SEEDS[key] as unknown as Prisma.InputJsonValue
      }
    });
    inserted += 1;
  }
  if (inserted > 0) invalidatePlatformCatalogCache();
  return inserted;
}

/**
 * Reads the complete dynamic `PlatformCatalogData` from PostgreSQL (cached via `lru-cache`).
 * Falls back gracefully per-key if a unit test mocks `db` without `platformCatalog`.
 */
export async function getPlatformCatalog(client: PrismaClient = db): Promise<PlatformCatalogData> {
  const cached = catalogCache.get('all');
  if (cached) return cached;

  const result: PlatformCatalogData = structuredClone(INITIAL_PLATFORM_CATALOG_SEEDS);
  try {
    if (typeof (client as any).platformCatalog?.findMany === 'function') {
      const rows = await client.platformCatalog.findMany();
      for (const row of rows) {
        if (isPlatformCatalogKey(row.key)) {
          const parsed = CATALOG_SECTION_SCHEMAS[row.key].safeParse(row.data);
          if (parsed.success) {
            (result as unknown as Record<string, unknown>)[row.key] = parsed.data;
          }
        }
      }
      catalogCache.set('all', result);
    }
  } catch (error) {
    logger.warn({ err: error }, 'PlatformCatalog read fell back to provisioned defaults');
  }
  return result;
}

export interface PlatformCatalogEntryMeta {
  key: PlatformCatalogKey;
  description: string;
  data: unknown;
  updatedBy: string | null;
  updatedAt: string | null;
}

export async function listPlatformCatalogEntries(client: PrismaClient = db): Promise<PlatformCatalogEntryMeta[]> {
  const rows = typeof (client as any).platformCatalog?.findMany === 'function'
    ? await client.platformCatalog.findMany()
    : [];
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return PLATFORM_CATALOG_KEYS.map((key) => {
    const row = byKey.get(key);
    const parsed = row ? CATALOG_SECTION_SCHEMAS[key].safeParse(row.data) : null;
    return {
      key,
      description: row?.description || PLATFORM_CATALOG_DESCRIPTIONS[key],
      data: parsed?.success ? parsed.data : INITIAL_PLATFORM_CATALOG_SEEDS[key],
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null
    };
  });
}

export async function updatePlatformCatalogSection<K extends PlatformCatalogKey>(
  key: K,
  rawData: unknown,
  actorId: string | null,
  client: PrismaClient = db
): Promise<PlatformCatalogData[K]> {
  const schema = CATALOG_SECTION_SCHEMAS[key];
  const parsed = schema.safeParse(rawData);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`INVALID_CATALOG_DATA: ${issue ? `${issue.path.join('.')}: ${issue.message}` : 'Invalid format'}`);
  }

  await client.platformCatalog.upsert({
    where: { key },
    update: {
      data: parsed.data as unknown as Prisma.InputJsonValue,
      updatedBy: actorId
    },
    create: {
      key,
      description: PLATFORM_CATALOG_DESCRIPTIONS[key],
      data: parsed.data as unknown as Prisma.InputJsonValue,
      updatedBy: actorId
    }
  });

  invalidatePlatformCatalogCache();
  return parsed.data;
}
