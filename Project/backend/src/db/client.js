// The Prisma client every module uses. Each query in a scoped context runs in a
// short transaction that first switches to the restricted livingplus_app role
// and states who is asking, so PostgreSQL Row-Level Security filters it (see
// the tenant_isolation migration). System contexts use the owner connection.
import { PrismaClient } from '@prisma/client';
import { currentDbContext, scopedPropertyId } from './context.js';
/** The owner connection: bypasses RLS. Only for system jobs (asSystem) and migrations. */
export const systemPrisma = new PrismaClient({ omit: { pGProperty: { searchEmbedding: true } } });
export const APP_DB_ROLE = 'livingplus_app';
/** One statement: switch role and set the caller for the rest of this transaction. */
function applyContext(client, context) {
    return client.$executeRaw `SELECT
    set_config('role', ${APP_DB_ROLE}, true),
    set_config('app.user_id', ${context.userId ?? ''}, true),
    set_config('app.role', ${context.role ?? ''}, true),
    set_config('app.property_id', ${scopedPropertyId(context) ?? ''}, true)`;
}
const scoped = systemPrisma.$extends({
    query: {
        $allModels: {
            async $allOperations({ args, query }) {
                const context = currentDbContext();
                if (context.system)
                    return query(args);
                const [, result] = await systemPrisma.$transaction([applyContext(systemPrisma, context), query(args)]);
                return result;
            }
        }
    }
});
async function transaction(arg, options) {
    const context = currentDbContext();
    if (typeof arg === 'function') {
        // Interactive: the callback receives an owner-connection transaction with the context applied first.
        return systemPrisma.$transaction(async (tx) => {
            if (!context.system)
                await applyContext(tx, context);
            return arg(tx);
        }, options);
    }
    if (context.system)
        return systemPrisma.$transaction(arg, options);
    throw new Error('Use an interactive transaction (db.$transaction(async (tx) => ...)) in request code');
}
const RAW = new Set(['$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe']);
function raw(method) {
    return async (...args) => {
        const context = currentDbContext();
        if (context.system)
            return systemPrisma[method](...args);
        const [, result] = await systemPrisma.$transaction([applyContext(systemPrisma, context), systemPrisma[method](...args)]);
        return result;
    };
}
export const prisma = new Proxy(scoped, {
    get(target, property) {
        if (property === '$transaction')
            return transaction;
        if (typeof property === 'string' && RAW.has(property))
            return raw(property);
        return Reflect.get(target, property);
    }
});
//# sourceMappingURL=client.js.map