// Invoice codes must be unique (PGRentEntry.invoiceCode is @unique). They used
// to embed only the first 8 characters of the tenant id, which collide (all the
// demo ids start with "pg-demo-", and random ids collide as residents grow).
// A code is now the bill type, the period and a 12-character hash of the full
// tenant id: readable on a receipt, and stable for the same tenant and period,
// so re-running a monthly job finds the same bill instead of a clash.
import { createHash, randomUUID } from 'crypto';

export type InvoiceKind = 'RENT' | 'FOOD' | 'ELEC' | 'DEP' | 'PG';

const tenantTag = (tenantId: string) => createHash('sha256').update(tenantId).digest('hex').slice(0, 12).toUpperCase();

/** A stable, unique code for one tenant's bill of one kind (and period, when it has one). */
export function invoiceCode(kind: Exclude<InvoiceKind, 'PG'>, tenantId: string, period?: string): string {
  return period ? `${kind}-${period}-${tenantTag(tenantId)}` : `${kind}-${tenantTag(tenantId)}`;
}

/** A one-off charge added by hand: unique every time. */
export function adHocInvoiceCode(): string {
  return `PG-${randomUUID().slice(0, 13).toUpperCase()}`;
}
