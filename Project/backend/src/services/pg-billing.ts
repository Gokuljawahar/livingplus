// Electricity bill splitting and food charges (traditional, precise).
// One bill splits equally across occupied beds; vacant beds are absorbed by
// the owner. Shares round to whole rupees with the remainder settled on the
// largest share so the parts always sum to the bill total.
import { logAudit } from './pg-audit.js';

export interface SplitRow {
  tenantId: string;
  tenantName: string;
  roomNumber: string;
  share: number;
}

export interface ElectricitySplit {
  rows: SplitRow[];
  occupiedBeds: number;
  totalBeds: number;
  ownerAbsorbed: number;
}

export interface MonthlyRentDetails {
  period: string;
  amount: number;
  dueDate: Date;
}

export function calculateMonthlyRent(tenant: {
  monthlyRent: number;
  bed?: { room?: { maintenanceFee?: number | null; utilitiesSurcharge?: number | null } | null } | null;
  property?: { rentDueDay?: number | null } | null;
}, at = new Date()): MonthlyRentDetails {
  const period = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
  const dueDay = Math.min(28, Math.max(1, tenant.property?.rentDueDay || 5));
  return {
    period,
    amount: tenant.monthlyRent + (tenant.bed?.room?.maintenanceFee || 0) + (tenant.bed?.room?.utilitiesSurcharge || 0),
    dueDate: new Date(at.getFullYear(), at.getMonth(), dueDay)
  };
}

export function validateBillInput(input: { propertyId?: unknown; period?: unknown; totalAmount?: unknown }): { propertyId: string; period: string; totalAmount: number } {
  const propertyId = String(input.propertyId || '').trim();
  if (!propertyId) throw new Error('INVALID_PROPERTY');
  const period = String(input.period || '').trim();
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('INVALID_PERIOD');
  const totalAmount = Number(input.totalAmount);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || totalAmount > 10000000) throw new Error('INVALID_AMOUNT');
  return { propertyId, period, totalAmount };
}

export async function computeElectricitySplit(db: any, propertyId: string, totalAmount: number): Promise<ElectricitySplit> {
  const rooms = await db.pGRoom.findMany({
    where: { propertyId, status: 'ACTIVE' },
    include: {
      beds: {
        include: {
          tenants: { where: { status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } }, select: { id: true, name: true } }
        }
      }
    },
    orderBy: { roomNumber: 'asc' }
  });
  const occupants: Array<{ tenantId: string; tenantName: string; roomNumber: string }> = [];
  let totalBeds = 0;
  for (const room of rooms) {
    for (const bed of room.beds) {
      totalBeds += 1;
      const tenant = bed.tenants[0];
      if (tenant) occupants.push({ tenantId: tenant.id, tenantName: tenant.name, roomNumber: room.roomNumber });
    }
  }
  if (!occupants.length) throw new Error('NO_OCCUPANTS');
  const raw = totalAmount / occupants.length;
  const rows: SplitRow[] = occupants.map((o) => ({ ...o, share: Math.floor(raw) }));
  let remainder = Math.round(totalAmount - rows.reduce((t, r) => t + r.share, 0));
  let i = 0;
  while (remainder > 0) {
    rows[i % rows.length]!.share += 1;
    remainder -= 1;
    i += 1;
  }
  return {
    rows,
    occupiedBeds: occupants.length,
    totalBeds,
    ownerAbsorbed: Math.round((totalAmount * Math.max(0, totalBeds - occupants.length)) / Math.max(1, totalBeds))
  };
}

export async function proposeElectricityBill(db: any, actorId: string | null, input: { propertyId?: unknown; period?: unknown; totalAmount?: unknown; imageUrl?: unknown }): Promise<any> {
  const valid = validateBillInput(input);
  const property = await db.pGProperty.findFirst({ where: { id: valid.propertyId, status: 'ACTIVE' }, select: { id: true } });
  if (!property) throw new Error('PROPERTY_NOT_FOUND');
  const approved = await db.pGElectricityBill.findFirst({ where: { propertyId: property.id, period: valid.period, status: 'APPROVED' } });
  if (approved) throw new Error('ALREADY_BILLED');
  const split = await computeElectricitySplit(db, property.id, valid.totalAmount);
  const imageUrl = typeof input.imageUrl === 'string' && input.imageUrl ? String(input.imageUrl).slice(0, 500) : null;
  const existing = await db.pGElectricityBill.findFirst({ where: { propertyId: property.id, period: valid.period, status: 'DRAFT' } });
  const data = { totalAmount: valid.totalAmount, imageUrl, splitJson: JSON.stringify(split.rows), status: 'DRAFT' };
  const bill = existing
    ? await db.pGElectricityBill.update({ where: { id: existing.id }, data })
    : await db.pGElectricityBill.create({ data: { propertyId: property.id, period: valid.period, createdBy: actorId, ...data } });
  logAudit(property.id, actorId, 'ELECTRICITY_BILL_PROPOSED', 'PGElectricityBill', bill.id, `${valid.period} total ${valid.totalAmount}`);
  return { ...bill, split };
}

export async function approveElectricityBill(db: any, actorId: string | null, billId: string, propertyIds: string[]): Promise<{ bill: any; entries: number }> {
  const bill = await db.pGElectricityBill.findUnique({ where: { id: String(billId) } });
  if (!bill) throw new Error('BILL_NOT_FOUND');
  if (!propertyIds.includes(bill.propertyId)) throw new Error('FORBIDDEN');
  if (bill.status === 'APPROVED') {
    const entries = await db.pGRentEntry.count({ where: { tenant: { propertyId: bill.propertyId }, period: bill.period, entryType: 'ELECTRICITY' } });
    return { bill, entries };
  }
  const property = await db.pGProperty.findFirst({ where: { id: bill.propertyId, status: 'ACTIVE' }, select: { id: true, rentDueDay: true } });
  if (!property) throw new Error('PROPERTY_NOT_FOUND');
  const rows = JSON.parse(bill.splitJson || '[]') as SplitRow[];
  const dueDay = Math.min(28, Math.max(1, property.rentDueDay || 5));
  const [year, month] = bill.period.split('-').map(Number);
  const result = await db.$transaction(async (tx: any) => {
    let created = 0;
    for (const row of rows) {
      const tenant = await tx.pGTenant.findFirst({ where: { id: row.tenantId, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } }, select: { id: true } });
      if (!tenant) continue;
      await tx.pGRentEntry.upsert({
        where: { tenantId_period_entryType: { tenantId: tenant.id, period: bill.period, entryType: 'ELECTRICITY' } },
        update: { amount: row.share, status: 'DUE' },
        create: {
          tenantId: tenant.id, period: bill.period, entryType: 'ELECTRICITY',
          amount: row.share, dueDate: new Date((year as number), (month as number) - 1, dueDay),
          invoiceCode: `ELEC-${bill.period}-${tenant.id.slice(0, 8).toUpperCase()}`, status: 'DUE'
        }
      });
      created += 1;
    }
    const updated = await tx.pGElectricityBill.update({ where: { id: bill.id }, data: { status: 'APPROVED' } });
    return { bill: updated, entries: created };
  });
  logAudit(bill.propertyId, actorId, 'ELECTRICITY_BILL_APPROVED', 'PGElectricityBill', bill.id, `${bill.period} entries ${result.entries}`);
  return result;
}

export async function listElectricityBills(db: any, propertyIds: string[], period?: string): Promise<any[]> {
  return db.pGElectricityBill.findMany({
    where: { propertyId: { in: propertyIds }, ...(period ? { period } : {}) },
    include: { property: { select: { name: true } } },
    orderBy: { period: 'desc' }
  });
}

export async function setMealPreference(db: any, actor: { userId: string | null; phones: string[] }, optOut: boolean): Promise<any> {
  if (!actor.phones.length) throw new Error('NO_TENANT_RECORD');
  const tenant = await db.pGTenant.findFirst({
    where: { phone: { in: actor.phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
    select: { id: true, name: true, propertyId: true, foodOptOut: true }
  });
  if (!tenant) throw new Error('NO_TENANT_RECORD');
  const updated = await db.pGTenant.update({ where: { id: tenant.id }, data: { foodOptOut: optOut } });
  logAudit(tenant.propertyId, actor.userId, 'MEAL_PREFERENCE_SET', 'PGTenant', tenant.id, optOut ? 'opted out' : 'opted in');
  return { tenant: updated.name, food_opt_out: updated.foodOptOut };
}

export async function ensureFoodEntries(db: any, tenant: any, period: string, dueDate: Date): Promise<void> {
  const charge = Number(tenant?.bed?.room?.foodCharge || 0);
  if (!(charge > 0) || tenant.foodOptOut) return;
  await db.pGRentEntry.upsert({
    where: { tenantId_period_entryType: { tenantId: tenant.id, period, entryType: 'FOOD' } },
    update: {},
    create: {
      tenantId: tenant.id, period, entryType: 'FOOD', amount: charge, dueDate,
      invoiceCode: `FOOD-${period}-${tenant.id.slice(0, 8).toUpperCase()}`, status: 'DUE'
    }
  });
}
