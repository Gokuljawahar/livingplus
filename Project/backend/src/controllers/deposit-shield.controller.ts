// Deposit Shield: at check-out, Gemini compares the move-in and move-out
// condition photos and lists what changed, with a suggested charge for each
// item and normal wear always at ₹0. The owner picks what to charge; the
// resident sees the itemised breakdown with the same photos as evidence.
// Nothing is deducted automatically.
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { canManageProperty } from './pg.controller.js';
import { aiEnabled, generateStructured } from '../services/ai-provider.js';
import { readStoredFile } from '../services/storage.js';

const MONEY_ROLES = ['OWNER', 'ACCOUNTANT'];
const MAX_PHOTOS_PER_SIDE = 4;

const reviewSchema = z.object({
  changes: z.array(z.object({
    item: z.string().describe('What it is, e.g. "Wardrobe door", "Wall near the bed"'),
    change: z.string().describe('What is different now, in plain words, under 15 words'),
    kind: z.enum(['DAMAGE', 'MISSING', 'CLEANING', 'WEAR']),
    suggested: z.number().describe('Fair charge in rupees; 0 for normal wear and tear')
  })).describe('Only real differences between move-in and move-out; empty if nothing changed'),
  summary: z.string().describe('One plain sentence for the owner, under 25 words')
});
export type DepositReview = { changes: z.infer<typeof reviewSchema>['changes']; summary: string; suggestedTotal: number; photos: { moveIn: number; moveOut: number } };

let reviewOverride: ((input: { moveInNotes: string; moveOutNotes: string; photos: number }) => Promise<unknown>) | null = null;
/** Test hook: replace the Gemini call (null restores). */
export function setDepositReviewerForTests(run: typeof reviewOverride): void {
  reviewOverride = run;
}

/** Cleans the model's list: wear is never charged, charges are whole rupees within the deposit. */
export function settleReview(raw: z.infer<typeof reviewSchema>, deposit: number): Omit<DepositReview, 'photos'> {
  const changes = raw.changes.slice(0, 10).map((change) => ({
    item: change.item.trim().slice(0, 60),
    change: change.change.trim().slice(0, 140),
    kind: change.kind,
    suggested: change.kind === 'WEAR' ? 0 : Math.max(0, Math.round(Number(change.suggested) || 0))
  }));
  let room = Math.max(0, deposit);
  for (const change of changes) {
    change.suggested = Math.min(change.suggested, room);
    room -= change.suggested;
  }
  return { changes, summary: raw.summary.trim().slice(0, 200), suggestedTotal: changes.reduce((sum, change) => sum + change.suggested, 0) };
}

async function photoParts(keys: string[]): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [];
  for (const key of keys.slice(0, MAX_PHOTOS_PER_SIDE)) {
    try {
      const { data, contentType } = await readStoredFile(key);
      if (data.length && data.length < 6 * 1024 * 1024 && contentType.startsWith('image/')) parts.push({ inlineData: { mimeType: contentType, data: data.toString('base64') } });
    } catch {
      // A missing photo just isn't compared.
    }
  }
  return parts;
}

/** Owner: compare the latest move-in and move-out records for one resident. */
export const reviewDeposit = async (req: Request, res: Response): Promise<any> => {
  try {
    const tenant = await db.pGTenant.findUnique({ where: { id: String(req.params.tenantId) }, select: { id: true, propertyId: true, depositReceived: true } });
    if (!tenant || !await canManageProperty(req, tenant.propertyId, MONEY_ROLES)) return res.status(404).json({ message: 'Resident not found' });
    const [moveIn, moveOut] = await Promise.all(['MOVE_IN', 'MOVE_OUT'].map((kind) => db.pGConditionReport.findFirst({ where: { tenantId: tenant.id, kind }, orderBy: { createdAt: 'desc' } })));
    if (!moveIn || !moveOut) {
      return res.status(409).json({ code: 'NEED_BOTH_RECORDS', message: `Add a ${!moveIn ? 'move-in' : 'move-out'} condition record with photos first, then compare.` });
    }
    const moveInPhotos = (moveIn.photoUrls ?? []).slice(0, MAX_PHOTOS_PER_SIDE);
    const moveOutPhotos = (moveOut.photoUrls ?? []).slice(0, MAX_PHOTOS_PER_SIDE);
    if (!reviewOverride && !aiEnabled()) return res.status(503).json({ code: 'AI_UNAVAILABLE', message: 'Photo comparison is not available right now. Enter deductions yourself.' });
    let raw: unknown;
    if (reviewOverride) {
      raw = await reviewOverride({ moveInNotes: moveIn.notes || '', moveOutNotes: moveOut.notes || '', photos: moveInPhotos.length + moveOutPhotos.length });
    } else {
      const [beforeParts, afterParts] = await Promise.all([photoParts(moveInPhotos), photoParts(moveOutPhotos)]);
      raw = await generateStructured({
        system: [
          'You help a paying-guest (PG) owner in India settle a resident\'s security deposit fairly at move-out.',
          'Compare the move-in photos and notes with the move-out photos and notes of the same room. List only real differences.',
          'Normal wear and tear (faded paint, small scuffs, worn mattress, loose fittings from age) is kind WEAR and costs 0.',
          'For damage, missing items or cleaning beyond normal, suggest a modest, typical Chennai repair or cleaning cost in rupees.',
          'If the photos are unclear or do not show the same area, say so in the summary and do not guess.',
          'Never mention or judge the resident as a person.'
        ].join(' '),
        parts: [
          { text: `Move-in notes: ${moveIn.notes || 'none'}\nMove-in photos follow (${beforeParts.length}).` },
          ...beforeParts,
          { text: `Move-out notes: ${moveOut.notes || 'none'}\nMove-out photos follow (${afterParts.length}).` },
          ...afterParts
        ],
        schema: reviewSchema
      });
    }
    const review: DepositReview = { ...settleReview(reviewSchema.parse(raw), tenant.depositReceived), photos: { moveIn: moveInPhotos.length, moveOut: moveOutPhotos.length } };
    res.json(review);
  } catch (error) {
    logger.warn({ err: error }, 'Deposit review failed');
    res.status(502).json({ code: 'AI_FAILED', message: 'Could not compare the photos just now. Try again, or enter deductions yourself.' });
  }
};
