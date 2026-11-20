// The Prisma client every module uses. Each query in a scoped context runs in a
// short transaction that first switches to the restricted livingplus_app role
// and states who is asking, so PostgreSQL Row-Level Security filters it (see
// the tenant_isolation migration). System contexts use the owner connection.
import { PrismaClient } from '@prisma/client';
import { currentDbContext, scopedPropertyId, type DbContext } from './context.js';

/** The owner connection: bypasses RLS. Only for system jobs (asSystem) and migrations. */
export const systemPrisma = new PrismaClient({ omit: { pGProperty: { searchEmbedding: true } } }) as unknown as PrismaClient;

export const APP_DB_ROLE = 'livingplus_app';

/** One statement: switch role and set the caller for the rest of this transaction. */
function applyContext(client: any, context: DbContext) {
  return client.$executeRaw`SELECT
    set_config('role', ${APP_DB_ROLE}, true),
    set_config('app.user_id', ${context.userId ?? ''}, true),
    set_config('app.role', ${context.role ?? ''}, true),
    set_config('app.property_id', ${scopedPropertyId(context) ?? ''}, true)`;
}

const scoped = (systemPrisma as any).$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }: { args: any; query: (args: any) => Promise<any> }) {
        const context = currentDbContext();
        if (context.system) return query(args);
        const [, result] = await systemPrisma.$transaction([applyContext(systemPrisma, context), query(args) as any]);
        return result;
      }
    }
  }
});

async function transaction(arg: any, options?: any): Promise<any> {
  const context = currentDbContext();
  if (typeof arg === 'function') {
    // Interactive: the callback receives an owner-connection transaction with the context applied first.
    return systemPrisma.$transaction(async (tx: any) => {
      if (!context.system) await applyContext(tx, context);
      return arg(tx);
    }, options);
  }
  if (context.system) return systemPrisma.$transaction(arg, options);
  throw new Error('Use an interactive transaction (db.$transaction(async (tx) => ...)) in request code');
}

const RAW = new Set(['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe']);

function raw(method: string) {
  return async (...args: any[]) => {
    const context = currentDbContext();
    if (context.system) return (systemPrisma as any)[method](...args);
    const [, result] = await systemPrisma.$transaction([applyContext(systemPrisma, context), (systemPrisma as any)[method](...args)]);
    return result;
  };
}

export const prisma = new Proxy(scoped as any, {
  get(target, property) {
    if (property === '$transaction') return transaction;
    if (typeof property === 'string' && RAW.has(property)) return raw(property);
    return Reflect.get(target, property);
  }
}) as unknown as PrismaClient;
