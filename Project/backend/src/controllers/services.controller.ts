// Meal orders and housekeeping bookings (buildathon answers Q1/Q4), plus the
// per-PG service switches owners use to turn them on (the "modular console").
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { logAudit } from '../services/pg-audit.js';
import { appTimeZone } from '../utils/app-time.js';
import { accessiblePropertyIds, canManageProperty, currentUser, ownStay } from './pg.controller.js';
import { cleanServiceSettings, isSlotFor, ORDER_DAYS_AHEAD, type ServiceSettings } from '@livingplus/shared';

/** "YYYY-MM-DD" for a date in the app time zone. */
const dayKey = (at: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: appTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
const asDate = (day: string): Date => new Date(`${day}T00:00:00.000Z`);

/** Who works on which orders (staff roles, see @livingplus/shared staff). */
const TYPES_BY_ROLE: Record<string, string[]> = { OWNER: ['MEAL', 'HOUSEKEEPING'], WARDEN: ['MEAL', 'HOUSEKEEPING'], COOK: ['MEAL'], HOUSEKEEPING: ['HOUSEKEEPING'] };
const SERVICE_STAFF = Object.keys(TYPES_BY_ROLE);

export async function settingsFor(propertyId: string): Promise<ServiceSettings> {
  const property = await db.pGProperty.findUnique({ where: { id: propertyId }, select: { serviceSettings: true } });
  return cleanServiceSettings(property?.serviceSettings);
}

/** Owner: which services this PG offers, and their prices. */
export const updateServiceSettings = async (req: Request, res: Response): Promise<any> => {
  const propertyId = String(req.params.propertyId);
  if (!await canManageProperty(req, propertyId, ['OWNER'])) return res.status(403).json({ message: 'Only the owner can change services' });
  try {
    const settings = cleanServiceSettings(req.body?.settings);
    await db.pGProperty.update({ where: { id: propertyId }, data: { serviceSettings: settings as unknown as Prisma.InputJsonValue } });
    logAudit(propertyId, currentUser(req)?.id ?? null, 'SERVICES_UPDATED', 'PGProperty', propertyId, JSON.stringify({ meals: settings.mealOrders.enabled, housekeeping: settings.housekeeping.enabled }));
    res.json(settings);
  } catch (error) {
    logger.error({ err: error }, 'Service settings error');
    res.status(500).json({ message: 'Could not save services' });
  }
};

/** Resident: my orders (upcoming first) and what my PG offers. */
export const listMyServiceOrders = async (req: Request, res: Response): Promise<any> => {
  if (!currentUser(req)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const tenant = await ownStay(req, String(req.params.tenantId));
    if (!tenant) return res.status(404).json({ message: 'Stay not found' });
    const [settings, orders] = await Promise.all([
      settingsFor(tenant.propertyId),
      db.pGServiceOrder.findMany({ where: { tenantId: tenant.id }, orderBy: [{ forDate: 'desc' }, { createdAt: 'desc' }], take: 60 })
    ]);
    res.json({ settings, orders, today: dayKey(new Date()), daysAhead: ORDER_DAYS_AHEAD });
  } catch (error) {
    logger.error({ err: error }, 'Service order list error');
    res.status(500).json({ message: 'Could not load your orders' });
  }
};

/** Resident: order a meal or book housekeeping for a day and slot. */
export const createServiceOrder = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  const body = req.body || {};
  const type = String(body.type || '');
  const slot = String(body.slot || '');
  const forDate = String(body.forDate || '');
  const quantity = type === 'MEAL' ? Math.min(5, Math.max(1, Math.round(Number(body.quantity) || 1))) : 1;
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 300) : '';
  if (!isSlotFor(type, slot)) return res.status(400).json({ message: 'Choose a valid service and time' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return res.status(400).json({ message: 'Choose a date' });
  const today = dayKey(new Date());
  const last = dayKey(new Date(Date.now() + ORDER_DAYS_AHEAD * 24 * 60 * 60 * 1000));
  if (forDate < today || forDate > last) return res.status(400).json({ message: `Choose a date from today up to ${ORDER_DAYS_AHEAD} days ahead` });
  try {
    const tenant = await ownStay(req, String(req.params.tenantId));
    if (!tenant) return res.status(404).json({ message: 'Stay not found' });
    if (!['ACTIVE', 'NOTICE_PERIOD'].includes(tenant.status)) return res.status(409).json({ message: 'Orders open once you have checked in' });
    const settings = await settingsFor(tenant.propertyId);
    const offered = type === 'MEAL' ? settings.mealOrders.enabled : settings.housekeeping.enabled;
    if (!offered) return res.status(409).json({ message: 'Your PG does not take these orders' });
    const unitPrice = type === 'MEAL' ? settings.mealOrders.prices[slot as keyof ServiceSettings['mealOrders']['prices']] : settings.housekeeping.price;
    const order = await db.pGServiceOrder.create({
      data: { propertyId: tenant.propertyId, tenantId: tenant.id, type, slot, forDate: asDate(forDate), quantity, unitPrice, notes: notes || null }
    });
    res.status(201).json(order);
  } catch (error) {
    logger.error({ err: error }, 'Service order create error');
    res.status(500).json({ message: 'Could not place the order' });
  }
};

/** Resident: cancel an order the PG has not confirmed yet. */
export const cancelMyServiceOrder = async (req: Request, res: Response): Promise<any> => {
  if (!currentUser(req)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const tenant = await ownStay(req, String(req.params.tenantId));
    if (!tenant) return res.status(404).json({ message: 'Stay not found' });
    const updated = await db.pGServiceOrder.updateMany({ where: { id: String(req.params.orderId), tenantId: tenant.id, status: 'REQUESTED' }, data: { status: 'CANCELLED' } });
    if (updated.count !== 1) return res.status(409).json({ message: 'Only requested orders can be cancelled' });
    res.json({ status: 'CANCELLED' });
  } catch (error) {
    logger.error({ err: error }, 'Service order cancel error');
    res.status(500).json({ message: 'Could not cancel the order' });
  }
};

/** Staff: orders for one day across my PGs, with meal head-counts for the kitchen. */
export const listStaffServiceOrders = async (req: Request, res: Response): Promise<any> => {
  if (!currentUser(req)) return res.status(401).json({ message: 'Unauthorized' });
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : dayKey(new Date());
  try {
    const propertyIds = await accessiblePropertyIds(req, SERVICE_STAFF);
    // Cooks see meal orders only, housekeeping sees cleaning only; owners and wardens see both.
    const access = await db.pGPropertyAccess.findMany({ where: { userId: currentUser(req)!.id, propertyId: { in: propertyIds } }, select: { propertyId: true, role: true } });
    const typesFor = (propertyId: string) => [...new Set(access.filter((a: any) => a.propertyId === propertyId).flatMap((a: any) => TYPES_BY_ROLE[a.role] ?? []))];
    const scopes = propertyIds.map((propertyId) => ({ propertyId, type: { in: typesFor(propertyId) } }));
    const [orders, properties] = await Promise.all([
      db.pGServiceOrder.findMany({
        where: { OR: scopes.length ? scopes : [{ propertyId: '__none__' }], forDate: asDate(day) },
        include: { tenant: { select: { name: true, bed: { select: { label: true, room: { select: { roomNumber: true } } } } } }, property: { select: { name: true } } },
        orderBy: [{ type: 'asc' }, { slot: 'asc' }, { createdAt: 'asc' }]
      }),
      db.pGProperty.findMany({ where: { id: { in: propertyIds } }, select: { id: true, name: true, serviceSettings: true } })
    ]);
    const mealCounts: Record<string, number> = { BREAKFAST: 0, LUNCH: 0, DINNER: 0 };
    for (const order of orders) if (order.type === 'MEAL' && order.status !== 'CANCELLED') mealCounts[order.slot] = (mealCounts[order.slot] ?? 0) + order.quantity;
    res.json({
      date: day,
      orders,
      mealCounts,
      properties: properties.map((property: any) => ({ id: property.id, name: property.name, settings: cleanServiceSettings(property.serviceSettings) }))
    });
  } catch (error) {
    logger.error({ err: error }, 'Staff service order list error');
    res.status(500).json({ message: 'Could not load orders' });
  }
};

/** Staff: confirm, complete or cancel an order. */
export const updateServiceOrderStatus = async (req: Request, res: Response): Promise<any> => {
  const status = String(req.body?.status || '');
  if (!['CONFIRMED', 'DONE', 'CANCELLED'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  try {
    const order = await db.pGServiceOrder.findUnique({ where: { id: String(req.params.orderId) } });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const roles = Object.entries(TYPES_BY_ROLE).filter(([, types]) => types.includes(order.type)).map(([role]) => role);
    if (!await canManageProperty(req, order.propertyId, roles)) return res.status(404).json({ message: 'Order not found' });
    if (['DONE', 'CANCELLED'].includes(order.status)) return res.status(409).json({ message: 'This order is already closed' });
    const updated = await db.pGServiceOrder.update({ where: { id: order.id }, data: { status } });
    res.json(updated);
  } catch (error) {
    logger.error({ err: error }, 'Service order update error');
    res.status(500).json({ message: 'Could not update the order' });
  }
};
