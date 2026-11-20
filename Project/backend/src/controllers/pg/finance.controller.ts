import type { Request, Response } from 'express';
import { db } from '../../db/index.js';
import { logAudit } from '../../services/pg-audit.js';
import { approveElectricityBill as approveBill, listElectricityBills as listBills, proposeElectricityBill as proposeBill } from '../../services/pg-billing.js';
import { createExpense, deleteExpense, listExpenses } from '../../services/pg-expenses.js';
import { sendDueRentReminders } from '../../services/pg-rent-reminders.js';
import { periodOf, periodRange } from '../../utils/app-time.js';
import { INVALID_REQUEST, parseBody } from '../../utils/validate.js';
import { logger } from '../../utils/logger.js';
import { paymentClaimBody, paymentClaimReviewBody, rentEntryBody, rentPaymentBody } from '../../validation/pg.schemas.js';
import { createOwnerExpenseBody, proposeElectricityBillBody, sendRentRemindersBody } from '../../validation/request.schemas.js';
import {
  accessiblePropertyIds,
  canManageProperty,
  createResidentNotification,
  currentUser,
  MONEY_ACCESS_ROLES,
  OPERATIONS_MONEY_ROLES,
  residentScope
} from './access.js';

export const listOwnerRentEntries = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, MONEY_ACCESS_ROLES);
    const period = req.query.period ? String(req.query.period) : undefined;
    const entries = await db.pGRentEntry.findMany({
      where: {
        tenant: { propertyId: { in: propertyIds } },
        ...(period ? { period } : {})
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            phone: true,
            property: { select: { id: true, name: true } },
            bed: { include: { room: { select: { roomNumber: true } } } }
          }
        }
      },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }]
    });
    res.json(entries);
  } catch (error) {
    logger.error({ err: error }, 'PG rent ledger list error');
    res.status(500).json({ message: 'Failed to fetch rent ledger' });
  }
};

export const createRentEntry = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(rentEntryBody, req, res, 'Tenant, period, positive amount and due date are required');
  if (!body) return;
  const { tenantId, period, amount: value, dueDate, entryType, notes } = body;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return res.status(400).json({ message: 'Tenant, period, positive amount and due date are required' });
  }

  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(tenantId) } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId, MONEY_ACCESS_ROLES)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const type = ['RENT', 'DEPOSIT', 'UTILITY'].includes(String(entryType || '').toUpperCase())
      ? String(entryType).toUpperCase()
      : 'RENT';
    const entry = await db.pGRentEntry.create({
      data: {
        tenantId: tenant.id,
        period: String(period).trim(),
        entryType: type,
        amount: value,
        dueDate: due,
        invoiceCode: `PG-${Date.now()}`,
        notes: notes || null
      }
    });
    res.status(201).json(entry);
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ message: 'A ledger entry already exists for this tenant and period' });
    logger.error({ err: error }, 'PG rent ledger create error');
    res.status(500).json({ message: 'Failed to create ledger entry' });
  }
};

export const sendRentReminders = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(sendRentRemindersBody, req, res, INVALID_REQUEST);
  if (!input) return;
  try {
    const propertyIds = await accessiblePropertyIds(req, OPERATIONS_MONEY_ROLES);
    const summary = await sendDueRentReminders(db, {
      propertyIds,
      period: input?.period ? String(input.period) : undefined,
      force: input?.force === true || input?.force === 'true',
      actorId: (req as any).user?.userId ? String((req as any).user.userId) : null
    });
    res.json(summary);
  } catch (error) {
    logger.error({ err: error }, 'PG rent reminders error');
    res.status(500).json({ message: 'Failed to send rent reminders' });
  }
};

export const listOwnerExpenses = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, OPERATIONS_MONEY_ROLES);
    const period = req.query.period ? String(req.query.period) : undefined;
    res.json(await listExpenses(db, propertyIds, period));
  } catch (error) {
    logger.error({ err: error }, 'PG expense list error');
    res.status(500).json({ message: 'Failed to load expenses' });
  }
};

export const createOwnerExpense = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(createOwnerExpenseBody, req, res, INVALID_REQUEST);
  if (!input) return;
  try {
    const propertyId = String(input?.propertyId || '');
    if (!propertyId || !await canManageProperty(req, propertyId, OPERATIONS_MONEY_ROLES)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const expense = await createExpense(db, (req as any).user?.userId ? String((req as any).user.userId) : null, {
      propertyId,
      category: input?.category,
      amount: input?.amount,
      spentOn: input?.spentOn,
      note: input?.note
    });
    res.status(201).json(expense);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (['INVALID_PROPERTY', 'INVALID_AMOUNT', 'INVALID_CATEGORY', 'INVALID_DATE'].includes(code)) {
      return res.status(400).json({ message: 'Expense needs a valid amount, category and date' });
    }
    if (code === 'PROPERTY_NOT_FOUND') return res.status(404).json({ message: 'Property is not available' });
    logger.error({ err: error }, 'PG expense create error');
    res.status(500).json({ message: 'Failed to record expense' });
  }
};

export const deleteOwnerExpense = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, MONEY_ACCESS_ROLES);
    await deleteExpense(db, (req as any).user?.userId ? String((req as any).user.userId) : null, String(req.params.expenseId), propertyIds);
    res.json({ message: 'Expense removed' });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'EXPENSE_NOT_FOUND') return res.status(404).json({ message: 'Expense not found' });
    if (code === 'FORBIDDEN') return res.status(403).json({ message: 'You do not have access to this expense' });
    logger.error({ err: error }, 'PG expense delete error');
    res.status(500).json({ message: 'Failed to remove expense' });
  }
};

export const listElectricityBills = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, OPERATIONS_MONEY_ROLES);
    const period = req.query.period ? String(req.query.period) : undefined;
    res.json(await listBills(db, propertyIds, period));
  } catch (error) {
    logger.error({ err: error }, 'PG electricity bill list error');
    res.status(500).json({ message: 'Failed to load electricity bills' });
  }
};

export const proposeElectricityBill = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(proposeElectricityBillBody, req, res, INVALID_REQUEST);
  if (!input) return;
  try {
    const propertyId = String(input?.propertyId || '');
    if (!propertyId || !await canManageProperty(req, propertyId, OPERATIONS_MONEY_ROLES)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const bill = await proposeBill(db, (req as any).user?.userId ? String((req as any).user.userId) : null, {
      propertyId, period: input?.period, totalAmount: input?.totalAmount, imageUrl: input?.imageUrl
    });
    res.status(201).json(bill);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (['INVALID_PROPERTY', 'INVALID_PERIOD', 'INVALID_AMOUNT'].includes(code)) {
      return res.status(400).json({ message: 'Bill needs a property, a YYYY-MM period and a positive total' });
    }
    if (code === 'PROPERTY_NOT_FOUND') return res.status(404).json({ message: 'Property is not available' });
    if (code === 'ALREADY_BILLED') return res.status(409).json({ message: 'This period is already billed' });
    if (code === 'NO_OCCUPANTS') return res.status(409).json({ message: 'No active tenants to split across' });
    logger.error({ err: error }, 'PG electricity bill propose error');
    res.status(500).json({ message: 'Failed to propose electricity bill' });
  }
};

export const approveElectricityBill = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, OPERATIONS_MONEY_ROLES);
    const result = await approveBill(db, (req as any).user?.userId ? String((req as any).user.userId) : null, String(req.params.billId), propertyIds);
    res.json(result);
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code === 'BILL_NOT_FOUND') return res.status(404).json({ message: 'Bill not found' });
    if (code === 'FORBIDDEN') return res.status(403).json({ message: 'You do not have access to this bill' });
    logger.error({ err: error }, 'PG electricity bill approve error');
    res.status(500).json({ message: 'Failed to approve electricity bill' });
  }
};

export const recordRentPayment = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(rentPaymentBody, req, res, 'A positive payment amount and valid payment method are required');
  if (!body) return;
  const { amount, method } = body;

  try {
    const entry = await db.pGRentEntry.findUnique({
      where: { id: String(req.params.entryId) },
      include: { tenant: true }
    });
    if (!entry) return res.status(404).json({ message: 'Ledger entry not found' });
    if (!await canManageProperty(req, entry.tenant.propertyId, MONEY_ACCESS_ROLES)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const updated = await db.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT 1 FROM "PGRentEntry" WHERE "id" = ${entry.id} FOR UPDATE`;
      const current = await tx.pGRentEntry.findUnique({ where: { id: entry.id } });
      if (!current) throw new Error('LEDGER_ENTRY_NOT_FOUND');

      const paidAmount = Math.min(current.amount, current.paidAmount + amount);
      const status = paidAmount >= current.amount ? 'PAID' : 'PARTIAL';
      const changed = await tx.pGRentEntry.updateMany({
        where: { id: current.id, paidAmount: current.paidAmount, status: current.status },
        data: {
          paidAmount,
          status,
          method,
          reference: body.reference || current.reference,
          paidAt: status === 'PAID' ? new Date() : current.paidAt
        }
      });
      if (changed.count !== 1) throw new Error('PAYMENT_CONFLICT');
      if (entry.entryType === 'DEPOSIT') {
        await tx.pGTenant.update({
          where: { id: entry.tenantId },
          data: { depositReceived: { increment: paidAmount - current.paidAmount } }
        });
      }
      return tx.pGRentEntry.findUniqueOrThrow({ where: { id: current.id } });
    });
    logAudit(entry.tenant.propertyId, currentUser(req)?.id, 'RENT_PAYMENT_RECORDED', 'PGRentEntry', entry.id, `${updated.paidAmount}/${entry.amount} via ${method}`);
    res.json(updated);
  } catch (error) {
    if ((error as Error)?.message === 'PAYMENT_CONFLICT') {
      return res.status(409).json({ message: 'Payment changed concurrently; refresh the ledger and retry' });
    }
    logger.error({ err: error }, 'PG rent payment record error');
    res.status(500).json({ message: 'Failed to record payment' });
  }
};

export const getOwnerReport = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, MONEY_ACCESS_ROLES);
    const propertyId = req.query.propertyId ? String(req.query.propertyId) : undefined;
    if (propertyId && !propertyIds.includes(propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const scope = propertyId ? [propertyId] : propertyIds;
    const period = String(req.query.period || periodOf());
    const [year, month] = period.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) return res.status(400).json({ message: 'Period must be YYYY-MM' });
    const { gte: periodStart, lt: periodEnd } = periodRange(period);
    const [properties, tenants, entries, bookings] = await Promise.all([
      db.pGProperty.findMany({ where: { id: { in: scope } }, include: { rooms: { include: { beds: true } } } }),
      db.pGTenant.findMany({ where: { propertyId: { in: scope } }, select: { id: true, status: true, propertyId: true } }),
      db.pGRentEntry.findMany({
        where: { tenant: { propertyId: { in: scope } }, period },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              property: { select: { id: true, name: true } },
              bed: { include: { room: { select: { roomNumber: true } } } }
            }
          }
        }
      }),
      db.pGBooking.count({ where: { propertyId: { in: scope }, createdAt: { gte: periodStart, lt: periodEnd } } })
    ]);
    const totalBeds = properties.reduce((total: number, property: any) => total + property.rooms.reduce((roomTotal: number, room: any) => roomTotal + room.beds.length, 0), 0);
    const occupiedBeds = tenants.filter((tenant: any) => tenant.status === 'ACTIVE').length;
    const charged = entries.reduce((total: number, entry: any) => total + entry.amount, 0);
    const collected = entries.reduce((total: number, entry: any) => total + entry.paidAmount, 0);

    res.json({
      period,
      properties: properties.length,
      totalBeds,
      occupiedBeds,
      availableBeds: properties.reduce((total: number, property: any) => total + property.rooms.reduce((roomTotal: number, room: any) => roomTotal + room.beds.filter((bed: any) => bed.status === 'AVAILABLE').length, 0), 0),
      occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
      activeTenants: occupiedBeds,
      newBookings: bookings,
      rentCharged: charged,
      rentCollected: collected,
      outstanding: Math.max(0, charged - collected),
      entries
    });
  } catch (error) {
    logger.error({ err: error }, 'PG owner report error');
    res.status(500).json({ message: 'Failed to generate report' });
  }
};

export const createResidentPaymentClaim = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(paymentClaimBody, req, res, 'Enter a positive amount and a valid UPI transaction reference');
  if (!body) return;
  const { amount, reference } = body;

  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const tenant = scope.tenants.find((item: any) => item.id === String(body.tenantId) && ['ACTIVE', 'NOTICE_PERIOD'].includes(item.status));
    if (!tenant) return res.status(404).json({ message: 'Active stay not found' });
    const entry = await db.pGRentEntry.findFirst({
      where: {
        id: String(body.rentEntryId || ''),
        tenantId: tenant.id,
        entryType: { in: ['RENT', 'DEPOSIT', 'UTILITY', 'ELECTRICITY', 'FOOD'] },
        status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] }
      }
    });
    if (!entry) return res.status(404).json({ message: 'Outstanding rent entry not found' });
    if (amount > Math.round((entry.amount - entry.paidAmount) * 100) / 100) {
      return res.status(400).json({ message: 'Amount cannot exceed the outstanding balance' });
    }
    const property = await db.pGProperty.findUnique({ where: { id: scope.propertyId }, select: { upiId: true } });
    if (!property?.upiId) return res.status(409).json({ message: 'Online UPI payment is not set up for this PG yet' });
    const existing = await db.pGPaymentClaim.findFirst({ where: { rentEntryId: entry.id, status: 'PENDING' } });
    if (existing) return res.status(409).json({ message: 'A payment claim is already awaiting review for this rent entry' });

    const claim = await db.pGPaymentClaim.create({
      data: { propertyId: scope.propertyId, tenantId: tenant.id, rentEntryId: entry.id, amount, reference }
    });
    res.status(201).json({ ...claim, upiId: property.upiId });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ message: 'This transaction reference has already been submitted' });
    logger.error({ err: error }, 'PG resident payment claim error');
    res.status(500).json({ message: 'Failed to submit payment claim' });
  }
};

export const listResidentPaymentClaims = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const claims = await db.pGPaymentClaim.findMany({
      where: { propertyId: scope.propertyId, tenantId: { in: scope.tenantIds } },
      include: { rentEntry: { select: { id: true, entryType: true, period: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(claims);
  } catch (error) {
    logger.error({ err: error }, 'PG resident payment claim list error');
    res.status(500).json({ message: 'Failed to fetch payment claims' });
  }
};

export const listOwnerPaymentClaims = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req, MONEY_ACCESS_ROLES);
    const claims = await db.pGPaymentClaim.findMany({
      where: { propertyId: { in: propertyIds } },
      include: {
        tenant: { select: { id: true, name: true, phone: true } },
        rentEntry: { select: { id: true, entryType: true, period: true, amount: true, paidAmount: true, status: true } },
        property: { select: { id: true, name: true } }
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100
    });
    res.json(claims);
  } catch (error) {
    logger.error({ err: error }, 'PG payment claim list error');
    res.status(500).json({ message: 'Failed to fetch payment claims' });
  }
};

export const reviewPaymentClaim = async (req: Request, res: Response): Promise<any> => {
  const body = parseBody(paymentClaimReviewBody, req, res, 'Choose approve or reject');
  if (!body) return;
  const { status, responseNote } = body;
  if (status === 'REJECTED' && !responseNote) return res.status(400).json({ message: 'A reason is required when rejecting a payment claim' });

  try {
    const claim = await db.pGPaymentClaim.findUnique({
      where: { id: String(req.params.claimId) },
      include: { rentEntry: true, tenant: true }
    });
    if (!claim) return res.status(404).json({ message: 'Payment claim not found' });
    if (!await canManageProperty(req, claim.propertyId, MONEY_ACCESS_ROLES)) return res.status(403).json({ message: 'Only the property owner can verify a payment claim' });
    if (claim.status !== 'PENDING') return res.status(409).json({ message: 'This payment claim has already been reviewed' });

    const updated = await db.$transaction(async (tx: any) => {
      if (status === 'APPROVED') {
        const remaining = Math.max(0, claim.rentEntry.amount - claim.rentEntry.paidAmount);
        if (claim.amount > remaining || claim.rentEntry.status === 'PAID') throw new Error('PAYMENT_EXCEEDS_BALANCE');
        const paidAmount = claim.rentEntry.paidAmount + claim.amount;
        const ledgerUpdate = await tx.pGRentEntry.updateMany({
          where: { id: claim.rentEntryId, paidAmount: claim.rentEntry.paidAmount, status: claim.rentEntry.status },
          data: {
            paidAmount,
            status: paidAmount >= claim.rentEntry.amount ? 'PAID' : 'PARTIAL',
            paidAt: paidAmount >= claim.rentEntry.amount ? new Date() : claim.rentEntry.paidAt,
            method: 'UPI',
            reference: claim.reference
          }
        });
        if (ledgerUpdate.count !== 1) throw new Error('PAYMENT_CONFLICT');
        if (claim.rentEntry.entryType === 'DEPOSIT') {
          await tx.pGTenant.update({ where: { id: claim.tenantId }, data: { depositReceived: { increment: claim.amount } } });
        }
      }

      const reviewed = await tx.pGPaymentClaim.updateMany({
        where: { id: claim.id, status: 'PENDING' },
        data: { status, reviewedBy: currentUser(req)?.id || null, reviewedAt: new Date(), responseNote: responseNote || null }
      });
      if (reviewed.count !== 1) throw new Error('CLAIM_ALREADY_REVIEWED');
      await createResidentNotification(tx, {
        propertyId: claim.propertyId,
        tenantId: claim.tenantId,
        type: 'PAYMENT_CLAIM',
        title: status === 'APPROVED' ? 'Payment confirmed' : 'Payment needs attention',
        message: status === 'APPROVED' ? `Your UPI payment of Rs ${claim.amount} was confirmed.` : `Your payment claim was not confirmed. ${responseNote}`,
        entityId: claim.id
      });
      return tx.pGPaymentClaim.findUniqueOrThrow({ where: { id: claim.id } });
    });
    logAudit(claim.propertyId, currentUser(req)?.id, `PAYMENT_CLAIM_${status}`, 'PGPaymentClaim', claim.id, claim.reference);
    res.json(updated);
  } catch (error) {
    const code = String((error as Error)?.message || '');
    if (code === 'PAYMENT_EXCEEDS_BALANCE') return res.status(409).json({ message: 'The outstanding balance changed; refresh the ledger before reviewing this claim' });
    if (code === 'PAYMENT_CONFLICT' || code === 'CLAIM_ALREADY_REVIEWED') return res.status(409).json({ message: 'Payment data changed; refresh and try again' });
    logger.error({ err: error }, 'PG payment claim review error');
    res.status(500).json({ message: 'Failed to review payment claim' });
  }
};
