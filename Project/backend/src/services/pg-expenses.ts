// Property expense ledger: precise traditional bookkeeping underneath any
// conversational expense logging. Every write is validated and audited; the
// AI layer may only propose entries through the log_expense tool.
import { logAudit } from './pg-audit.js';
import { EXPENSE_CATEGORIES, isYearMonth } from '@livingplus/shared';
import { getPlatformCatalog } from './platform-catalog.js';
import { periodRange } from '../utils/app-time.js';

export { EXPENSE_CATEGORIES };

export interface ExpenseInput {
  propertyId: string;
  category?: string;
  amount: number;
  spentOn?: string;
  note?: string;
}

export interface ValidExpense {
  propertyId: string;
  category: string;
  amount: number;
  spentOn: Date;
  note: string | null;
}

export function validateExpenseInput(input: ExpenseInput, allowedCategories: readonly string[] = EXPENSE_CATEGORIES): ValidExpense {
  const propertyId = String(input.propertyId || '').trim();
  if (!propertyId) throw new Error('INVALID_PROPERTY');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) throw new Error('INVALID_AMOUNT');
  const category = String(input.category || 'OTHER').trim().toUpperCase();
  if (!allowedCategories.includes(category)) throw new Error('INVALID_CATEGORY');
  const spentOn = input.spentOn ? new Date(String(input.spentOn)) : new Date();
  if (Number.isNaN(spentOn.getTime())) throw new Error('INVALID_DATE');
  return { propertyId, category, amount, spentOn, note: String(input.note || '').trim().slice(0, 500) || null };
}

export async function createExpense(db: any, actorId: string | null, input: ExpenseInput): Promise<any> {
  const catalog = await getPlatformCatalog();
  const valid = validateExpenseInput(input, catalog.expenseCategories.map((c) => c.value));
  const property = await db.pGProperty.findFirst({ where: { id: valid.propertyId, status: 'ACTIVE' }, select: { id: true, name: true } });
  if (!property) throw new Error('PROPERTY_NOT_FOUND');
  const expense = await db.pGExpense.create({
    data: { propertyId: property.id, category: valid.category, amount: valid.amount, spentOn: valid.spentOn, note: valid.note, createdBy: actorId }
  });
  logAudit(property.id, actorId, 'EXPENSE_CREATED', 'PGExpense', expense.id, `${valid.category} ${valid.amount}`);
  return expense;
}

export async function listExpenses(db: any, propertyIds: string[], period?: string): Promise<{ entries: any[]; total: number; byCategory: Record<string, number> }> {
  const monthFilter = period && isYearMonth(period)
    ? periodRange(period)
    : undefined;
  const entries = await db.pGExpense.findMany({
    where: {
      propertyId: { in: propertyIds },
      ...(monthFilter ? { spentOn: monthFilter } : {})
    },
    include: { property: { select: { name: true } } },
    orderBy: { spentOn: 'desc' }
  });
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const entry of entries) {
    total += entry.amount;
    byCategory[entry.category] = (byCategory[entry.category] || 0) + entry.amount;
  }
  return { entries: entries.slice(0, 100), total, byCategory };
}

export async function deleteExpense(db: any, actorId: string | null, id: string, propertyIds: string[]): Promise<void> {
  const expense = await db.pGExpense.findUnique({ where: { id: String(id) } });
  if (!expense) throw new Error('EXPENSE_NOT_FOUND');
  if (!propertyIds.includes(expense.propertyId)) throw new Error('FORBIDDEN');
  await db.pGExpense.delete({ where: { id: expense.id } });
  logAudit(expense.propertyId, actorId, 'EXPENSE_DELETED', 'PGExpense', expense.id, `${expense.category} ${expense.amount}`);
}
