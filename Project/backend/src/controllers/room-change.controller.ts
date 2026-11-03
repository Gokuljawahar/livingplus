import type { Request, Response } from 'express';
import { prisma } from '../app.js';
import { actorFromRequest, toolCatalogue } from '../services/ai-tools.js';
import { currentUser } from './pg.controller.js';

const RESIDENT_ROLES = ['PG_TENANT'];
const STAFF_ROLES = ['PG_OWNER', 'PG_WARDEN', 'SUPER_ADMIN'];

const FRIENDLY_MESSAGES: Record<string, string> = {
  FORBIDDEN: 'You do not have access to this.',
  NO_TENANT_RECORD: 'No active stay found for this session.',
  NO_OPEN_REQUEST: 'Open a room change request first.',
  BED_REQUIRED: 'Choose a vacant bed for the move.',
  BED_UNAVAILABLE: 'That bed is no longer vacant.',
  PARTNER_UNAVAILABLE: 'That request is no longer open for swaps.',
  STALE_BEDS: 'Someone already moved; please review the latest requests.',
  INVALID_STATE: 'This request can no longer change that way.',
  SWAP_MATCHES_LATER: 'Swap partners are matched after you open the request.',
  NO_BED_ASSIGNED: 'Your stay has no bed assigned yet.',
  INVALID_REQUEST_TYPE: 'Choose a swap or a move.',
  INVALID_DECISION: 'Choose a valid decision.'
};

function errorMessage(error: any): string {
  const code = String(error?.message || '');
  return FRIENDLY_MESSAGES[code] || 'Could not complete the room change.';
}

function errorStatus(error: any): number {
  const code = String(error?.message || '');
  if (code === 'FORBIDDEN' || code === 'NO_TENANT_RECORD') return 403;
  if (code in FRIENDLY_MESSAGES) return 400;
  return 500;
}

async function runRoomChangeTool(
  req: Request,
  res: Response,
  toolName: string,
  args: Record<string, unknown>,
  roles: string[],
  roleMessage: string
): Promise<any> {
  const user = currentUser(req);
  if (!user || !roles.includes(user.role)) return res.status(403).json({ message: roleMessage });
  try {
    const actor = await actorFromRequest(req);
    const result = await (toolCatalogue as Record<string, any>)[toolName].execute(actor, args);
    res.json(result);
  } catch (error) {
    console.error(`Room change ${toolName} error:`, error);
    res.status(errorStatus(error)).json({ message: errorMessage(error) });
  }
}

export const listMyRoomChanges = async (req: Request, res: Response): Promise<any> =>
  runRoomChangeTool(req, res, 'get_my_room_change_requests', {}, RESIDENT_ROLES, 'Resident access is required.');

export const createRoomChange = async (req: Request, res: Response): Promise<any> =>
  runRoomChangeTool(req, res, 'request_room_change', {
    request_type: req.body?.request_type,
    to_bed_id: req.body?.to_bed_id,
    preferences: req.body?.preferences,
    reason: req.body?.reason
  }, RESIDENT_ROLES, 'Resident access is required.');

export const listRoomChangeMatches = async (req: Request, res: Response): Promise<any> =>
  runRoomChangeTool(req, res, 'find_room_change_matches', {}, RESIDENT_ROLES, 'Resident access is required.');

export const proposeRoomSwap = async (req: Request, res: Response): Promise<any> =>
  runRoomChangeTool(req, res, 'propose_room_swap', {
    my_request_id: req.params.requestId,
    their_request_id: req.body?.their_request_id
  }, RESIDENT_ROLES, 'Resident access is required.');

export const respondRoomSwap = async (req: Request, res: Response): Promise<any> =>
  runRoomChangeTool(req, res, 'respond_room_swap', {
    request_id: req.params.requestId,
    decision: req.body?.decision
  }, RESIDENT_ROLES, 'Resident access is required.');

export const listVacantBeds = async (req: Request, res: Response): Promise<any> => {
  const user = currentUser(req);
  if (!user || !RESIDENT_ROLES.includes(user.role)) {
    return res.status(403).json({ message: 'Resident access is required.' });
  }
  try {
    const actor = await actorFromRequest(req);
    if (!actor.propertyId || !actor.propertyIds.includes(actor.propertyId)) {
      return res.status(403).json({ message: 'You do not have access to this.' });
    }
    const beds = await prisma.pGBed.findMany({
      where: { status: 'AVAILABLE', room: { propertyId: actor.propertyId, status: 'ACTIVE' } },
      include: { room: true },
      orderBy: { label: 'asc' },
      take: 50
    });
    res.json(beds.map((bed: any) => ({
      bed_id: bed.id,
      label: bed.label,
      room_number: bed.room?.roomNumber || null,
      floor: bed.room?.floor ?? null,
      room_type: bed.room?.roomType || null,
      monthly_rent: bed.room?.monthlyRent ?? null
    })));
  } catch (error) {
    console.error('Room change vacant beds error:', error);
    res.status(500).json({ message: 'Could not load vacant beds.' });
  }
};

export const listStaffRoomChanges = async (req: Request, res: Response): Promise<any> =>
  runRoomChangeTool(req, res, 'list_room_change_requests', {
    status: typeof req.query?.status === 'string' ? req.query.status : undefined
  }, STAFF_ROLES, 'Staff access is required.');

export const decideRoomChange = async (req: Request, res: Response): Promise<any> =>
  runRoomChangeTool(req, res, 'decide_room_change', {
    request_id: req.params.requestId,
    decision: req.body?.decision,
    note: req.body?.note
  }, STAFF_ROLES, 'Staff access is required.');
