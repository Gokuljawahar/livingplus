// Single typed database entrypoint. Every module imports `db` (or `prisma`)
// from here instead of wrapping `prisma` in an untyped `Record<string, any>`
// Proxy. Row-level security is enforced automatically by `client.ts`.
import type { PrismaClient } from '@prisma/client';
import { prisma, systemPrisma, APP_DB_ROLE } from './client.js';

export const db: PrismaClient = prisma;
export { prisma, systemPrisma, APP_DB_ROLE };
export { asSystem, currentDbContext, scopedPropertyId, systemRoute, type DbContext } from './context.js';
