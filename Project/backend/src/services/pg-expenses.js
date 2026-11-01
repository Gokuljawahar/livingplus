// Property expense ledger: precise traditional bookkeeping underneath any
// conversational expense logging. Every write is validated and audited; the
// AI layer may only propose entries through the log_expense tool.
import { logAudit } from './pg-audit.js';
export const EXPENSE_CATEGORIES = ['FOOD', 'STAFF', 'MAINTENANCE', 'UTILITIES', 'OTHER'];
export function validateExpenseInput(input) {
    const propertyId = String(input.propertyId || '').trim();
    if (!propertyId)
        throw new Error('INVALID_PROPERTY');
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000)
        throw new Error('INVALID_AMOUNT');
    const category = String(input.category || 'OTHER').trim().toUpperCase();
    if (!EXPENSE_CATEGORIES.includes(category))
        throw new Error('INVALID_CATEGORY');
    const spentOn = input.spentOn ? new Date(String(input.spentOn)) : new Date();
    if (Number.isNaN(spentOn.getTime()))
        throw new Error('INVALID_DATE');
    return { propertyId, category, amount, spentOn, note: String(input.note || '').trim().slice(0, 500) || null };
}
export async function createExpense(db, actorId, input) {
    const valid = validateExpenseInput(input);
    const property = await db.pGProperty.findFirst({ where: { id: valid.propertyId, status: 'ACTIVE' }, select: { id: true, name: true } });
    if (!property)
        throw new Error('PROPERTY_NOT_FOUND');
    const expense = await db.pGExpense.create({
        data: { propertyId: property.id, category: valid.category, amount: valid.amount, spentOn: valid.spentOn, note: valid.note, createdBy: actorId }
    });
    logAudit(property.id, actorId, 'EXPENSE_CREATED', 'PGExpense', expense.id, `${valid.category} ${valid.amount}`);
    return expense;
}
export async function listExpenses(db, propertyIds, period) {
    const monthFilter = period && /^\d{4}-\d{2}$/.test(period)
        ? (() => {
            const [y = NaN, m = NaN] = period.split('-').map(Number);
            return { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
        })()
        : undefined;
    const entries = await db.pGExpense.findMany({
        where: {
            propertyId: { in: propertyIds },
            ...(monthFilter ? { spentOn: monthFilter } : {})
        },
        include: { property: { select: { name: true } } },
        orderBy: { spentOn: 'desc' }
    });
    const byCategory = {};
    let total = 0;
    for (const entry of entries) {
        total += entry.amount;
        byCategory[entry.category] = (byCategory[entry.category] || 0) + entry.amount;
    }
    return { entries: entries.slice(0, 100), total, byCategory };
}
export async function deleteExpense(db, actorId, id, propertyIds) {
    const expense = await db.pGExpense.findUnique({ where: { id: String(id) } });
    if (!expense)
        throw new Error('EXPENSE_NOT_FOUND');
    if (!propertyIds.includes(expense.propertyId))
        throw new Error('FORBIDDEN');
    await db.pGExpense.delete({ where: { id: expense.id } });
    logAudit(expense.propertyId, actorId, 'EXPENSE_DELETED', 'PGExpense', expense.id, `${expense.category} ${expense.amount}`);
}
//# sourceMappingURL=pg-expenses.js.map