import type { Request, Response } from 'express';
import { cleanServiceSettings, cleanVibeAnswers, cleanVibeSummary, type VibeAnswers, vibeTopicsFor } from '@livingplus/shared';
import { db } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import { buildVibeProfile, scoreVibeRooms, vibeInterviewTurn, type VibeInterviewerDeps, type VibeMatcherDeps, type VibeProfilerDeps } from '../../services/vibe-agent.js';
import { currentUser, ownStay, requestPropertyId } from './access.js';

const VIBE_ROOMMATE_STATUSES = ['ACTIVE', 'NOTICE_PERIOD', 'RESERVED'];
const VIBE_REMATCH_DAYS = 30;
const VIBE_AUDIO_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac']);
const MAX_VIBE_AUDIO_BASE64 = 900_000; // about 25 s of 16 kHz mono WAV

/** VibeCheck answers of the current residents of each room (excluding one resident, e.g. the caller). */
export async function roommateAnswersByRoom(roomIds: string[], excludeTenantId?: string): Promise<Map<string, VibeAnswers[]>> {
  const byRoom = new Map<string, VibeAnswers[]>();
  for (const [roomId, vibes] of await roommateVibesByRoom(roomIds, excludeTenantId)) byRoom.set(roomId, vibes.answers);
  return byRoom;
}

/** Residents' VibeCheck answers and habit summaries per room (never names). */
export async function roommateVibesByRoom(roomIds: string[], excludeTenantId?: string): Promise<Map<string, { answers: VibeAnswers[]; summaries: string[] }>> {
  const byRoom = new Map<string, { answers: VibeAnswers[]; summaries: string[] }>();
  if (!roomIds.length) return byRoom;
  const tenants = await db.pGTenant.findMany({
    where: { status: { in: VIBE_ROOMMATE_STATUSES }, bed: { roomId: { in: [...new Set(roomIds)] } }, ...(excludeTenantId ? { id: { not: excludeTenantId } } : {}) },
    select: { vibeAnswers: true, vibeSummary: true, bed: { select: { roomId: true } } }
  });
  for (const tenant of tenants) {
    const answers = cleanVibeAnswers(tenant.vibeAnswers);
    if (!answers || !tenant.bed) continue;
    const room = byRoom.get(tenant.bed.roomId) ?? { answers: [], summaries: [] };
    room.answers.push(answers);
    const summary = cleanVibeSummary(tenant.vibeSummary);
    if (summary) room.summaries.push(summary);
    byRoom.set(tenant.bed.roomId, room);
  }
  return byRoom;
}

/**
 * Public: turns a free-text description of someone's routine (any language)
 * into VibeCheck habits with one structured Gemini call. Nothing is stored;
 * the person reviews the result before using it.
 */
export function createBuildVibeProfileHandler(deps: VibeProfilerDeps = {}) {
  return async (req: Request, res: Response): Promise<any> => {
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (text.length < 10) return res.status(400).json({ message: 'Tell us a little more about your day, e.g. when you sleep and how tidy you are' });
    try {
      res.json(await buildVibeProfile(text, cleanVibeAnswers(req.body?.answers) ?? {}, deps));
    } catch (error: any) {
      if (error?.message === 'VIBE_AI_UNAVAILABLE') return res.status(503).json({ code: 'VIBE_AI_UNAVAILABLE', message: 'Describing your routine is not available right now. Answer the quick questions instead.' });
      logger.warn({ err: error }, 'VibeCheck profile agent failed');
      res.status(502).json({ code: 'VIBE_AI_FAILED', message: 'We could not read that just now. Answer the quick questions instead.' });
    }
  };
}

export const buildVibeProfileFromText = createBuildVibeProfileHandler();

/**
 * Public: one turn of the voice VibeCheck interview. Gemini hears the answer
 * (audio or typed text), updates the habits and says the next question.
 * Nothing is stored; the person reviews the habits before matching.
 */
export function createVibeInterviewStepHandler(deps: VibeInterviewerDeps = {}) {
  return async (req: Request, res: Response): Promise<any> => {
    const body = req.body ?? {};
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((turn: any) => turn && (turn.role === 'assistant' || turn.role === 'user') && typeof turn.text === 'string')
      .slice(-12)
      .map((turn: any) => ({ role: turn.role, text: String(turn.text).slice(0, 500) }));
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1000) : '';
    let audio: { mimeType: string; data: string } | undefined;
    if (body.audio && typeof body.audio === 'object') {
      const mimeType = String(body.audio.mimeType || '').split(';')[0]!.trim().toLowerCase();
      const data = String(body.audio.data || '');
      if (!VIBE_AUDIO_TYPES.has(mimeType) || !/^[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ message: 'That recording format is not supported. Type your answer instead.' });
      if (data.length > MAX_VIBE_AUDIO_BASE64) return res.status(413).json({ message: 'That recording is too long. Keep answers under 20 seconds.' });
      audio = { mimeType, data };
    }
    if (!text && !audio) return res.status(400).json({ message: 'Say or type your answer first' });
    try {
      const propertyId = typeof body.propertyId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.propertyId) ? body.propertyId : '';
      const place = propertyId ? await db.pGProperty.findFirst({
        where: { id: propertyId, status: 'ACTIVE' },
        select: { name: true, locality: true, amenities: true, rooms: { where: { status: 'ACTIVE' }, select: { hasAc: true, foodIncluded: true, foodCharge: true } } }
      }) : null;
      const topics = vibeTopicsFor(place && { ...place, amenities: Array.isArray(place.amenities) ? place.amenities.filter((item: unknown): item is string => typeof item === 'string') : [] });
      res.json(await vibeInterviewTurn({ history, known: cleanVibeAnswers(body.answers) ?? {}, topics, ...(text ? { text } : {}), ...(audio ? { audio } : {}) }, deps));
    } catch (error: any) {
      if (error?.message === 'VIBE_AI_UNAVAILABLE') return res.status(503).json({ code: 'VIBE_AI_UNAVAILABLE', message: 'Voice VibeCheck is not available right now. Answer the quick questions instead.' });
      logger.warn({ err: error }, 'VibeCheck interview turn failed');
      res.status(502).json({ code: 'VIBE_AI_FAILED', message: 'I did not catch that. Try again, or type your answer.' });
    }
  };
}

export const vibeInterviewStep = createVibeInterviewStepHandler();

/**
 * Public VibeCheck for a published PG: scores the visitor's answers against the
 * residents of each room with a free bed. Returns scores and habit-level
 * reasons only, never residents' names or individual answers.
 */
export function createVibeCheckPropertyHandler(deps: VibeMatcherDeps = {}) {
  return async (req: Request, res: Response): Promise<any> => {
    const answers = cleanVibeAnswers(req.body?.answers);
    if (!answers) return res.status(400).json({ message: 'Answer at least one VibeCheck question' });
    try {
      const scopedId = requestPropertyId(req);
      const property = await db.pGProperty.findFirst({
        where: { id: scopedId || String(req.params.propertyId), status: 'ACTIVE' },
        select: { id: true, serviceSettings: true, rooms: { where: { status: 'ACTIVE' }, select: { id: true, roomNumber: true, beds: { where: { status: 'AVAILABLE' }, select: { id: true, label: true } } } } }
      });
      if (!property) return res.status(404).json({ message: 'PG not found' });
      if (!cleanServiceSettings(property.serviceSettings).vibeCheck) return res.status(404).json({ message: 'VibeCheck is not offered by this PG' });
      const rooms = property.rooms.filter((room: any) => room.beds.length);
      const byRoom = await roommateVibesByRoom(rooms.map((room: any) => room.id));
      // AI judgment per room (one Gemini call, deterministic fallback inside).
      const matches = await scoreVibeRooms(answers, rooms.map((room: any) => ({
        roomId: String(room.id),
        roomNumber: String(room.roomNumber ?? ''),
        roommates: byRoom.get(room.id)?.answers ?? [],
        summaries: byRoom.get(room.id)?.summaries ?? []
      })), cleanVibeSummary(req.body?.summary), deps);
      res.json({
        beds: rooms.flatMap((room: any) => {
          const match = matches.get(room.id) ?? { score: null, compared: 0, reasons: [], differences: [], ai: false };
          return room.beds.map((bed: any) => ({ bedId: bed.id, roomId: room.id, roomNumber: room.roomNumber, label: bed.label, ...match }));
        })
      });
    } catch (error) {
      logger.error({ err: error }, 'VibeCheck error');
      res.status(500).json({ message: 'Could not run VibeCheck' });
    }
  };
}

export const vibeCheckProperty = createVibeCheckPropertyHandler();

/** Residents answer VibeCheck so future roommates can match with them. */
export const saveTenantVibe = async (req: Request, res: Response): Promise<any> => {
  if (!currentUser(req)) return res.status(401).json({ message: 'Unauthorized' });
  const answers = cleanVibeAnswers(req.body?.answers);
  if (!answers) return res.status(400).json({ message: 'Answer at least one VibeCheck question' });
  try {
    const tenant = await ownStay(req, String(req.params.tenantId));
    if (!tenant) return res.status(404).json({ message: 'Stay not found' });
    const summary = cleanVibeSummary(req.body?.summary);
    await db.pGTenant.update({ where: { id: tenant.id }, data: { vibeAnswers: answers, vibeSummary: summary } });
    res.json({ answers, summary });
  } catch (error) {
    logger.error({ err: error }, 'VibeCheck save error');
    res.status(500).json({ message: 'Could not save your answers' });
  }
};

/** The resident's match with their current roommates, and whether the rematch window is open. */
export const getTenantVibeMatch = async (req: Request, res: Response): Promise<any> => {
  if (!currentUser(req)) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const tenant = await ownStay(req, String(req.params.tenantId));
    if (!tenant) return res.status(404).json({ message: 'Stay not found' });
    const answers = cleanVibeAnswers(tenant.vibeAnswers);
    const roomId = tenant.bed?.roomId;
    const vibes = roomId ? (await roommateVibesByRoom([roomId], tenant.id)).get(roomId) : undefined;
    const match = answers && roomId
      ? (await scoreVibeRooms(answers, [{ roomId, roommates: vibes?.answers ?? [], summaries: vibes?.summaries ?? [] }], cleanVibeSummary(tenant.vibeSummary))).get(roomId) ?? null
      : null;
    const since = new Date(tenant.checkedInAt || tenant.moveInDate);
    const rematchUntil = new Date(since.getTime() + VIBE_REMATCH_DAYS * 24 * 60 * 60 * 1000);
    res.json({
      answers,
      summary: cleanVibeSummary(tenant.vibeSummary),
      match,
      rematchUntil: rematchUntil.toISOString(),
      rematchOpen: ['ACTIVE', 'RESERVED'].includes(tenant.status) && Date.now() <= rematchUntil.getTime()
    });
  } catch (error) {
    logger.error({ err: error }, 'VibeCheck match error');
    res.status(500).json({ message: 'Could not load your VibeCheck' });
  }
};
