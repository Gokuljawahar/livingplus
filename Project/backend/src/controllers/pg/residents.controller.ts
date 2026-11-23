import { invoiceCode } from '../../services/invoice-code.js';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { cleanServiceSettings, isBloodGroup, isKycType, LIMITS, MESSAGES, phoneVariants } from '@livingplus/shared';
import { db } from '../../db/index.js';
import { logAudit } from '../../services/pg-audit.js';
import { calculateMonthlyRent, ensureFoodEntries } from '../../services/pg-billing.js';
import { checkKycDocument, type KycCheckDeps } from '../../services/kyc-check.js';
import { INVALID_REQUEST, parseBody } from '../../utils/validate.js';
import { logger } from '../../utils/logger.js';
import {
  checkOutTenantBody,
  markDepositRefundedBody,
  updateResidentProfileBody,
  updateTenantProfileBody
} from '../../validation/request.schemas.js';
import { accessiblePropertyIds, canManageProperty, currentUser, MONEY_ACCESS_ROLES, ownStay, requestPropertyId, residentScope } from './access.js';

async function runKycCheck(tenant: any, deps: KycCheckDeps = {}): Promise<any> {
  const property = await db.pGProperty.findUnique({ where: { id: tenant.propertyId }, select: { serviceSettings: true } });
  if (!cleanServiceSettings(property?.serviceSettings).kycAi) throw new Error('KYC_AI_OFF');
  const check = await checkKycDocument({ fileKey: tenant.kycDocumentUrl, declaredType: tenant.kycType, residentName: tenant.name }, deps);
  await db.pGTenant.update({ where: { id: tenant.id }, data: { kycAiCheck: check as unknown as Prisma.InputJsonValue } });
  return check;
}

function kycCheckError(res: Response, error: any): any {
  const message = String(error?.message || '');
  if (message.startsWith('AI_ORCHESTRATOR_NOT_CONFIGURED')) return res.status(503).json({ message: 'Automatic ID checks are not available right now. The owner will review your document.' });
  if (message === 'KYC_AI_OFF') return res.status(409).json({ message: 'Automatic ID checks are off at this PG. The owner will review your document.' });
  if (message === 'KYC_FILE_INVALID') return res.status(400).json({ message: 'That file could not be read. Upload a clear photo or PDF under 8 MB.' });
  logger.error({ err: error }, 'KYC AI check error');
  return res.status(502).json({ message: 'The document check failed. Your document is saved; try the check again later.' });
}

/** Resident: read my uploaded KYC document with AI right after uploading it. */
export function createCheckMyKycHandler(deps: KycCheckDeps = {}) {
  return async (req: Request, res: Response): Promise<any> => {
    if (!currentUser(req)) return res.status(401).json({ message: 'Unauthorized' });
    try {
      const tenant = await ownStay(req, String(req.params.tenantId));
      if (!tenant) return res.status(404).json({ message: 'Stay not found' });
      if (!tenant.kycDocumentUrl) return res.status(400).json({ message: 'Upload your ID document first' });
      res.json(await runKycCheck(tenant, deps));
    } catch (error) {
      return kycCheckError(res, error);
    }
  };
}

export const checkMyKyc = createCheckMyKycHandler();

/** Owner or warden: run (or re-run) the AI reading of a resident's KYC document. */
export function createCheckTenantKycHandler(deps: KycCheckDeps = {}) {
  return async (req: Request, res: Response): Promise<any> => {
    try {
      const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
      if (!tenant || !await canManageProperty(req, tenant.propertyId)) return res.status(404).json({ message: 'Resident not found' });
      if (!tenant.kycDocumentUrl) return res.status(400).json({ message: 'This resident has not uploaded an ID yet' });
      res.json(await runKycCheck(tenant, deps));
    } catch (error) {
      return kycCheckError(res, error);
    }
  };
}

export const checkTenantKyc = createCheckTenantKycHandler();

export const checkInTenant = async (req: Request, res: Response): Promise<any> => {
  try {
    const tenant = await db.pGTenant.findUnique({
      where: { id: String(req.params.tenantId) },
      include: { bed: { include: { room: true } }, property: { select: { rentDueDay: true } } }
    });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    if (tenant.status !== 'RESERVED') return res.status(409).json({ message: 'Only approved tenants can be checked in' });

    const now = new Date();
    const rent = calculateMonthlyRent(tenant, now);
    const checkedIn = await db.$transaction(async (tx: any) => {
      if (tenant.bedId) {
        const occupied = await tx.pGBed.updateMany({
          where: { id: tenant.bedId, status: 'RESERVED' },
          data: { status: 'OCCUPIED' }
        });
        if (occupied.count !== 1) throw new Error('BED_UNAVAILABLE');
      }

      const transitioned = await tx.pGTenant.updateMany({
        where: { id: tenant.id, status: 'RESERVED' },
        data: { status: 'ACTIVE', checkedInAt: now }
      });
      if (transitioned.count !== 1) throw new Error('TENANT_STATE_CHANGED');
      const activeTenant = await tx.pGTenant.findUniqueOrThrow({ where: { id: tenant.id } });
      const tenantDigits = String(tenant.phone || '').replace(/\D/g, '');
      const tenantNormalized = tenantDigits.length === 10 ? `91${tenantDigits}` : tenantDigits;
      const existingLogin = await tx.user.findFirst({ where: { phone: { in: [tenantDigits, tenantNormalized] } }, select: { id: true } });
      if (!existingLogin) {
        const hashedPassword = await bcrypt.hash(randomUUID(), 10);
        await tx.user.create({ data: { name: tenant.name, phone: tenantNormalized, password: hashedPassword, role: 'PG_TENANT' } });
      }
      if (tenant.bookingId) {
        await tx.pGBooking.update({ where: { id: tenant.bookingId }, data: { status: 'CHECKED_IN' } });
      }

      await tx.pGRentEntry.upsert({
        where: { tenantId_period_entryType: { tenantId: tenant.id, period: rent.period, entryType: 'RENT' } },
        update: {},
        create: {
          tenantId: tenant.id,
          period: rent.period,
          amount: rent.amount,
          dueDate: rent.dueDate,
          entryType: 'RENT',
          invoiceCode: invoiceCode('RENT', tenant.id, rent.period)
        }
      });
      await ensureFoodEntries(tx, tenant, rent.period, rent.dueDate);
      if (tenant.depositAmount > 0) {
        await tx.pGRentEntry.upsert({
          where: { tenantId_period_entryType: { tenantId: tenant.id, period: 'DEPOSIT', entryType: 'DEPOSIT' } },
          update: {},
          create: {
            tenantId: tenant.id,
            period: 'DEPOSIT',
            entryType: 'DEPOSIT',
            amount: tenant.depositAmount,
            dueDate: now,
            invoiceCode: invoiceCode('DEP', tenant.id)
          }
        });
      }
      return activeTenant;
    });
    logAudit(tenant.propertyId, currentUser(req)?.id, 'TENANT_CHECKED_IN', 'PGTenant', tenant.id, tenant.name);
    res.json(checkedIn);
  } catch (error: any) {
    if (error?.message === 'BED_UNAVAILABLE') return res.status(409).json({ message: 'This bed is no longer reserved for the tenant' });
    if (error?.message === 'TENANT_STATE_CHANGED') return res.status(409).json({ message: 'Tenant status changed; refresh and try again' });
    logger.error({ err: error }, 'PG tenant check-in error');
    res.status(500).json({ message: 'Failed to check in tenant' });
  }
};

export const checkOutTenant = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(checkOutTenantBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const depositDeductions = input?.depositDeductions === undefined ? 0 : Number(input.depositDeductions);
  if (!Number.isFinite(depositDeductions) || depositDeductions < 0) {
    return res.status(400).json({ message: 'Deposit deductions must be a non-negative amount' });
  }
  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    if (tenant.status !== 'ACTIVE') return res.status(409).json({ message: 'Only active tenants can be checked out' });
    if (depositDeductions > tenant.depositReceived) {
      return res.status(400).json({ message: 'Deductions cannot exceed the deposit received' });
    }
    const depositRefundAmount = Math.max(0, tenant.depositReceived - depositDeductions);
    const depositRefundStatus = tenant.depositReceived <= 0 ? 'NOT_APPLICABLE' : depositRefundAmount > 0 ? 'PENDING' : 'SETTLED';

    const now = new Date();
    const checkedOut = await db.$transaction(async (tx: any) => {
      if (tenant.bedId) {
        const released = await tx.pGBed.updateMany({
          where: { id: tenant.bedId, status: 'OCCUPIED' },
          data: { status: 'AVAILABLE' }
        });
        if (released.count !== 1) throw new Error('BED_STATE_INVALID');
      }
      const updatedTenant = await tx.pGTenant.update({
        where: { id: tenant.id },
        data: { status: 'CHECKED_OUT', moveOutDate: now, checkedOutAt: now, depositDeductions, depositRefundAmount, depositRefundStatus, checkoutNote: String(input?.checkoutNote || '').trim() || null }
      });
      if (tenant.bookingId) {
        await tx.pGBooking.update({ where: { id: tenant.bookingId }, data: { status: 'CHECKED_OUT', moveOutDate: now } });
      }
      return updatedTenant;
    });
    logAudit(tenant.propertyId, currentUser(req)?.id, 'TENANT_CHECKED_OUT', 'PGTenant', tenant.id, `${tenant.name} · deductions ${depositDeductions}`);
    res.json(checkedOut);
  } catch (error: any) {
    if (error?.message === 'BED_STATE_INVALID') return res.status(409).json({ message: 'Bed status changed; refresh and try again' });
    logger.error({ err: error }, 'PG tenant check-out error');
    res.status(500).json({ message: 'Failed to check out tenant' });
  }
};

export const listTenantStays = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  const scopedPropertyId = requestPropertyId(req);
  if (user.propertyId && scopedPropertyId && user.propertyId !== scopedPropertyId) {
    return res.status(403).json({ message: 'This resident session belongs to a different PG' });
  }
  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const phones = phoneVariants(String(account?.phone || ''));
    const tenants = await db.pGTenant.findMany({
      where: {
        phone: { in: phones },
        ...((scopedPropertyId || user.propertyId) ? { propertyId: scopedPropertyId || user.propertyId } : {})
      },
      include: {
        property: { select: { id: true, name: true, address: true, locality: true, city: true, contactPhone: true, upiId: true } },
        bed: { include: { room: { select: { roomNumber: true, roomType: true, foodIncluded: true, foodCharge: true } } } },
        rentEntries: { orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }] }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tenants);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant stay list error');
    res.status(500).json({ message: 'Failed to fetch your stays' });
  }
};

export const submitTenantNotice = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const tenant = await ownStay(req, String(req.params.tenantId));
    if (!tenant) return res.status(404).json({ message: 'Stay not found' });
    if (tenant.status !== 'ACTIVE') return res.status(409).json({ message: 'Only active stays can start a notice period' });
    const updated = await db.pGTenant.update({ where: { id: tenant.id }, data: { status: 'NOTICE_PERIOD', noticeDate: new Date() } });
    logAudit(tenant.propertyId, user.id, 'NOTICE_SUBMITTED', 'PGTenant', tenant.id, tenant.name);
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant notice error');
    res.status(500).json({ message: 'Failed to submit notice' });
  }
};

export const cancelTenantNotice = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const tenant = await ownStay(req, String(req.params.tenantId));
    if (!tenant) return res.status(404).json({ message: 'Stay not found' });
    if (tenant.status !== 'NOTICE_PERIOD') return res.status(409).json({ message: 'No active notice on this stay' });
    const updated = await db.pGTenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE', noticeDate: null } });
    logAudit(tenant.propertyId, user.id, 'NOTICE_CANCELLED', 'PGTenant', tenant.id, tenant.name);
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant notice cancel error');
    res.status(500).json({ message: 'Failed to cancel notice' });
  }
};

export const markDepositRefunded = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(markDepositRefundedBody, req, res, INVALID_REQUEST);
  if (!input) return;
  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId, MONEY_ACCESS_ROLES)) {
      return res.status(403).json({ message: 'Only property owners can mark a deposit refund' });
    }
    if (tenant.status !== 'CHECKED_OUT' || tenant.depositRefundStatus !== 'PENDING') {
      return res.status(409).json({ message: 'No pending deposit refund for this tenant' });
    }
    const updated = await db.pGTenant.update({
      where: { id: tenant.id },
      data: {
        depositRefundStatus: 'REFUNDED',
        depositRefundReference: String(input?.reference || '').trim() || null,
        depositRefundedAt: new Date()
      }
    });
    logAudit(tenant.propertyId, currentUser(req)?.id, 'DEPOSIT_REFUNDED', 'PGTenant', tenant.id, String(input?.reference || '').trim() || null);
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG deposit refund error');
    res.status(500).json({ message: 'Failed to record deposit refund' });
  }
};

export const listOwnerTenants = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req);
    const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
    const tenants = await db.pGTenant.findMany({
      where: {
        propertyId: { in: propertyIds },
        ...(status ? { status } : {})
      },
      include: {
        property: { select: { name: true, locality: true } },
        bed: { include: { room: { select: { roomNumber: true } } } }
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }]
    });
    res.json(tenants);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant list error');
    res.status(500).json({ message: 'Failed to fetch tenants' });
  }
};

export const updateTenantProfile = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(updateTenantProfileBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const inputFields = input as Record<string, any>;
  const allowedFields = [
    'permanentAddress',
    'bloodGroup',
    'institutionOrEmployer',
    'emergencyName',
    'emergencyPhone',
    'kycType',
    'kycDocumentUrl'
  ];
  const verifyKyc = input.kycVerified;

  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) } });
    if (!tenant) return res.status(404).json({ message: 'Tenant not found' });
    if (!await canManageProperty(req, tenant.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const data: Record<string, string | null | boolean | Date> = {};
    for (const field of allowedFields) {
      if (inputFields[field] !== undefined) data[field] = String(inputFields[field]).trim() || null;
    }
    if (verifyKyc !== undefined) {
      data.kycVerified = Boolean(verifyKyc);
      data.kycVerifiedAt = verifyKyc ? new Date() : null;
    }
    if (input.foodOptOut !== undefined) {
      data.foodOptOut = Boolean(input.foodOptOut);
    }
    const updated = await db.pGTenant.update({ where: { id: tenant.id }, data });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG tenant profile update error');
    res.status(500).json({ message: 'Failed to update tenant profile' });
  }
};

export const updateResidentProfile = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(updateResidentProfileBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const inputFields = input as Record<string, any>;
  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const tenant = await db.pGTenant.findFirst({
      where: {
        id: { equals: String(req.params.tenantId), in: scope.tenantIds },
        propertyId: scope.propertyId,
        status: { in: ['ACTIVE', 'NOTICE_PERIOD'] }
      }
    });
    if (!tenant) return res.status(404).json({ message: 'Active stay not found' });

    const allowedFields = ['permanentAddress', 'institutionOrEmployer', 'emergencyName', 'emergencyPhone'];
    const data: Record<string, string | null | boolean | Date> = {};
    for (const field of allowedFields) {
      if (inputFields[field] === undefined) continue;
      const value = String(inputFields[field]).trim();
      if (value.length > LIMITS.profileText) return res.status(400).json({ message: `${field} must be ${LIMITS.profileText} characters or less` });
      data[field] = value || null;
    }
    if (input.bloodGroup !== undefined) {
      const bloodGroup = String(input.bloodGroup).toUpperCase();
      if (bloodGroup && !isBloodGroup(bloodGroup)) {
        return res.status(400).json({ message: MESSAGES.bloodGroup });
      }
      data.bloodGroup = bloodGroup || null;
    }
    if (input.kycType !== undefined) {
      const kycType = String(input.kycType).toUpperCase();
      if (kycType && !isKycType(kycType)) {
        return res.status(400).json({ message: MESSAGES.kycType });
      }
      data.kycType = kycType || null;
    }
    if (input.kycDocumentUrl !== undefined) {
      const fileKey = String(input.kycDocumentUrl || '').trim();
      if (fileKey && !/^(?:local\/[0-9a-f-]{36}\.(?:webp|pdf)|uploads\/[a-zA-Z0-9._-]+)$/i.test(fileKey)) {
        return res.status(400).json({ message: 'Invalid KYC document reference' });
      }
      data.kycDocumentUrl = fileKey || null;
      data.kycVerified = false;
      data.kycVerifiedAt = null;
    }
    if (input.foodOptOut !== undefined) data.foodOptOut = Boolean(input.foodOptOut);

    const updated = await db.pGTenant.update({ where: { id: tenant.id }, data });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'PG resident profile update error');
    res.status(500).json({ message: 'Failed to update resident profile' });
  }
};

export const listResidentNotifications = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const notifications = await db.pGResidentNotification.findMany({
      where: { propertyId: scope.propertyId, tenantId: { in: scope.tenantIds } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ notifications, unreadCount: notifications.filter((notification: any) => !notification.readAt).length });
  } catch (error) {
    logger.error({ err: error }, 'PG resident notification list error');
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

export const markResidentNotificationRead = async (req: Request, res: Response): Promise<any> => {
  try {
    const scope = await residentScope(req);
    if (!scope) return res.status(403).json({ message: 'Resident access is required on this PG host' });
    const updated = await db.pGResidentNotification.updateMany({
      where: {
        id: String(req.params.notificationId),
        propertyId: scope.propertyId,
        tenantId: { in: scope.tenantIds },
        readAt: null
      },
      data: { readAt: new Date() }
    });
    if (!updated.count) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    logger.error({ err: error }, 'PG resident notification update error');
    res.status(500).json({ message: 'Failed to update notification' });
  }
};
