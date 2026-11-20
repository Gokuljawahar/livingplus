import type { Request, Response } from 'express';
import { db } from '../../db/index.js';
import { logAudit } from '../../services/pg-audit.js';
import { logger } from '../../utils/logger.js';
import { canManageProperty, currentUser, ownStay } from './access.js';

const FILE_KEY = /^(?:local\/[0-9a-f-]{36}\.(?:webp|pdf)|uploads\/[a-zA-Z0-9._-]+)$/i;

/** Staff of the resident's PG, or the resident themselves; returns the stay or null. */
async function conditionAccess(req: Request, tenantId: string): Promise<{ tenant: any; role: 'staff' | 'resident' } | null> {
  const user = currentUser(req);
  if (!user) return null;
  if (user.role === 'PG_TENANT') {
    const tenant = await ownStay(req, tenantId);
    return tenant ? { tenant, role: 'resident' } : null;
  }
  const tenant = await db.pGTenant.findUnique({ where: { id: tenantId } });
  return tenant && await canManageProperty(req, tenant.propertyId) ? { tenant, role: 'staff' } : null;
}

/** Timestamped move-in / move-out condition records for one stay, newest first. */
export const listConditionReports = async (req: Request, res: Response): Promise<any> => {
  if (!currentUser(req)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const access = await conditionAccess(req, String(req.query.tenantId || ''));
    if (!access) return res.status(404).json({ message: 'Stay not found' });
    const reports = await db.pGConditionReport.findMany({ where: { tenantId: access.tenant.id }, orderBy: { createdAt: 'desc' } });
    res.json(reports);
  } catch (error) {
    logger.error({ err: error }, 'Condition report list error');
    res.status(500).json({ message: 'Failed to load condition records' });
  }
};

/** Adds a condition record. Records are never edited or deleted, so they can settle deposit disputes. */
export const createConditionReport = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  const body = req.body || {};
  const kind = String(body.kind || '');
  if (!['MOVE_IN', 'MOVE_OUT'].includes(kind)) return res.status(400).json({ message: 'Choose move-in or move-out' });
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) : '';
  const photoUrls = Array.isArray(body.photoUrls) ? body.photoUrls.map(String) : [];
  if (photoUrls.length > 8 || photoUrls.some((key: string) => !FILE_KEY.test(key))) return res.status(400).json({ message: 'Add up to 8 photos' });
  if (!notes && !photoUrls.length) return res.status(400).json({ message: 'Add a photo or a note' });
  try {
    const access = await conditionAccess(req, String(body.tenantId || ''));
    if (!access) return res.status(404).json({ message: 'Stay not found' });
    if (access.role === 'resident' && ['CHECKED_OUT', 'CANCELLED'].includes(access.tenant.status)) {
      return res.status(409).json({ message: 'This stay has ended; ask your PG owner to add records' });
    }
    const report = await db.pGConditionReport.create({
      data: { propertyId: access.tenant.propertyId, tenantId: access.tenant.id, kind, notes: notes || null, photoUrls, createdBy: user.id, createdByRole: access.role === 'resident' ? 'RESIDENT' : user.role }
    });
    logAudit(access.tenant.propertyId, user.id, kind === 'MOVE_IN' ? 'MOVE_IN_RECORDED' : 'MOVE_OUT_RECORDED', 'PGConditionReport', report.id, `${photoUrls.length} photo(s)`);
    res.status(201).json(report);
  } catch (error) {
    logger.error({ err: error }, 'Condition report create error');
    res.status(500).json({ message: 'Failed to save the condition record' });
  }
};
