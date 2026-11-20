import type { Request, Response } from 'express';
import { LIMITS, phoneVariants } from '@livingplus/shared';
import { db } from '../../db/index.js';
import { INVALID_REQUEST, parseBody } from '../../utils/validate.js';
import { logger } from '../../utils/logger.js';
import {
  createMaintenanceTicketBody,
  createTenantTicketBody,
  updateMaintenanceStatusBody
} from '../../validation/request.schemas.js';
import { accessiblePropertyIds, canManageProperty, createResidentNotification, currentUser, requestPropertyId } from './access.js';

export const listOwnerTickets = async (req: Request, res: Response): Promise<any> => {
  try {
    const propertyIds = await accessiblePropertyIds(req);
    const tickets = await db.pGMaintenanceTicket.findMany({
      where: { propertyId: { in: propertyIds } },
      include: { property: { select: { name: true } }, tenant: { select: { name: true, phone: true } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }]
    });
    const assignedIds = [...new Set(tickets.map((ticket: any) => ticket.assignedTo).filter(Boolean))];
    const assignedUsers = assignedIds.length ? await db.user.findMany({ where: { id: { in: assignedIds } }, select: { id: true, name: true } }) : [];
    const assignedNames = new Map(assignedUsers.map((assigned: { id: string; name: string }) => [assigned.id, assigned.name]));
    res.json(tickets.map((ticket: any) => ({ ...ticket, assignedName: ticket.assignedTo ? assignedNames.get(ticket.assignedTo) || null : null })));
  } catch (error) {
    logger.error({ err: error }, 'PG maintenance list error');
    res.status(500).json({ message: 'Failed to fetch maintenance tickets' });
  }
};

export const listTenantTickets = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  const propertyId = requestPropertyId(req) || user?.propertyId;
  if (!user || user.role !== 'PG_TENANT') return res.status(403).json({ message: 'Resident access is required' });
  if (!propertyId || (user.propertyId && user.propertyId !== propertyId)) {
    return res.status(403).json({ message: 'This resident session belongs to a different PG' });
  }

  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const phones = phoneVariants(String(account?.phone || ''));
    const tenants = await db.pGTenant.findMany({
      where: { propertyId, phone: { in: phones }, status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
      select: { id: true }
    });
    const tickets = await db.pGMaintenanceTicket.findMany({
      where: { propertyId, tenantId: { in: tenants.map((tenant: { id: string }) => tenant.id) } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tickets);
  } catch (error) {
    logger.error({ err: error }, 'PG resident maintenance list error');
    res.status(500).json({ message: 'Failed to fetch maintenance requests' });
  }
};

export const createTenantTicket = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(createTenantTicketBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const user = currentUser(req);
  const propertyId = requestPropertyId(req) || user?.propertyId;
  const { tenantId, title, description, category } = input;
  if (!user || user.role !== 'PG_TENANT') return res.status(403).json({ message: 'Resident access is required' });
  if (!propertyId || (user.propertyId && user.propertyId !== propertyId)) {
    return res.status(403).json({ message: 'This resident session belongs to a different PG' });
  }
  if (!tenantId || !title?.trim() || !description?.trim()) {
    return res.status(400).json({ message: 'Stay, title and description are required' });
  }
  if (title.trim().length > LIMITS.ticketTitle || description.trim().length > LIMITS.ticketDetails) {
    return res.status(400).json({ message: `Title must be ${LIMITS.ticketTitle} characters or less and description ${LIMITS.ticketDetails.toLocaleString('en-IN')} characters or less` });
  }
  const allowedCategories = ['PLUMBING', 'ELECTRICAL', 'APPLIANCE', 'CLEANING', 'SAFETY', 'PEST', 'OTHER'];
  const ticketCategory = String(category || 'OTHER').toUpperCase();
  if (!allowedCategories.includes(ticketCategory)) return res.status(400).json({ message: 'Invalid maintenance category' });

  try {
    const account = await db.user.findUnique({ where: { id: user.id }, select: { phone: true } });
    const phones = phoneVariants(String(account?.phone || ''));
    const tenant = await db.pGTenant.findFirst({
      where: {
        id: String(tenantId),
        propertyId,
        phone: { in: phones },
        status: { in: ['ACTIVE', 'NOTICE_PERIOD'] }
      },
      select: { id: true, bedId: true }
    });
    if (!tenant) return res.status(404).json({ message: 'Active stay not found for this resident on this PG' });

    const ticket = await db.pGMaintenanceTicket.create({
      data: {
        propertyId,
        tenantId: tenant.id,
        bedId: tenant.bedId,
        title: title.trim(),
        description: description.trim(),
        category: ticketCategory,
        priority: 'NORMAL'
      }
    });
    res.status(201).json(ticket);
  } catch (error) {
    logger.error({ err: error }, 'PG resident maintenance creation error');
    res.status(500).json({ message: 'Failed to create maintenance request' });
  }
};

export const createMaintenanceTicket = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(createMaintenanceTicketBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const { propertyId, tenantId, title, description, category, priority, imageUrl, assignedTo } = input;
  if (!propertyId || !title?.trim() || !description?.trim()) {
    return res.status(400).json({ message: 'Property, title and description are required' });
  }
  if (!await canManageProperty(req, String(propertyId))) {
    return res.status(403).json({ message: 'You do not have access to this property' });
  }

  try {
    if (assignedTo) {
      const staffAccess = await db.pGPropertyAccess.findFirst({
        where: { propertyId: String(propertyId), userId: String(assignedTo), role: 'WARDEN' },
        select: { id: true }
      });
      if (!staffAccess) return res.status(400).json({ message: 'Assigned warden must have access to this property' });
    }
    const ticket = await db.pGMaintenanceTicket.create({
      data: {
        propertyId: String(propertyId),
        tenantId: tenantId || null,
        title: title.trim(),
        description: description.trim(),
        category: category?.trim() || 'OTHER',
        priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority) ? priority : 'NORMAL',
        imageUrl: imageUrl?.trim() || null,
        assignedTo: assignedTo ? String(assignedTo) : null
      }
    });
    res.status(201).json(ticket);
  } catch (error) {
    logger.error({ err: error }, 'PG maintenance creation error');
    res.status(500).json({ message: 'Failed to create maintenance ticket' });
  }
};

export const updateMaintenanceStatus = async (req: Request, res: Response): Promise<any> => {
  const input: any = parseBody(updateMaintenanceStatusBody, req, res, INVALID_REQUEST);
  if (!input) return;
  const status = String(input.status || '').toUpperCase();
  if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
    return res.status(400).json({ message: 'Invalid maintenance status' });
  }

  try {
    const ticket = await db.pGMaintenanceTicket.findUnique({ where: { id: String(req.params.ticketId) } });
    if (!ticket) return res.status(404).json({ message: 'Maintenance ticket not found' });
    if (!await canManageProperty(req, ticket.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this property' });
    }
    const updated = await db.$transaction(async (tx: any) => {
      const changed = await tx.pGMaintenanceTicket.updateMany({
        where: { id: ticket.id, status: ticket.status },
        data: { status }
      });
      if (changed.count !== 1) throw new Error('TICKET_STATUS_CHANGED');
      if (ticket.tenantId && ticket.status !== status) {
        await createResidentNotification(tx, {
          propertyId: ticket.propertyId,
          tenantId: ticket.tenantId,
          type: 'MAINTENANCE_STATUS',
          title: 'Maintenance request updated',
          message: `Your request "${ticket.title}" is now ${status.toLowerCase().replace('_', ' ')}.`,
          entityId: ticket.id
        });
      }
      return tx.pGMaintenanceTicket.findUniqueOrThrow({ where: { id: ticket.id } });
    });
    res.json(updated);
  } catch (error) {
    if ((error as Error)?.message === 'TICKET_STATUS_CHANGED') return res.status(409).json({ message: 'Ticket status changed; refresh and try again' });
    logger.error({ err: error }, 'PG maintenance status update error');
    res.status(500).json({ message: 'Failed to update maintenance ticket' });
  }
};
