// Request schemas for booking and money endpoints. Unknown fields are
// dropped (the frontend sends whole form objects); types and required
// fields are enforced before any database work.
import { z } from 'zod';
import { MESSAGES, PATTERNS, PAYMENT_METHODS } from '@livingplus/shared';
import { optionalText, positiveAmount, text, upperEnum } from '../utils/validate.js';

export const bookingRequestBody = z.object({
  propertyId: text(100),
  bedId: optionalText(100),
  residentName: text(120),
  phone: text(20),
  email: optionalText(200),
  moveInDate: text(40),
  notes: optionalText(1000),
  phoneToken: optionalText(200),
  idempotencyKey: optionalText(200),
  /** VibeCheck answers; cleaned by cleanVibeAnswers (unknown keys and values dropped). */
  vibeAnswers: z.record(z.string().max(30), z.unknown()).optional(),
  vibeSummary: optionalText(300)
});

export const rentPaymentBody = z.object({
  amount: positiveAmount(),
  method: upperEnum(PAYMENT_METHODS),
  reference: optionalText(120)
});

export const rentEntryBody = z.object({
  tenantId: text(100),
  period: text(20),
  amount: positiveAmount(),
  dueDate: text(40),
  entryType: optionalText(20),
  notes: optionalText(1000)
});

export const paymentClaimBody = z.object({
  // Not required here: an unknown or missing stay/entry is reported as 404.
  tenantId: optionalText(100),
  rentEntryId: optionalText(100),
  amount: positiveAmount(),
  reference: z.string().trim().regex(PATTERNS.paymentReference, MESSAGES.paymentReference)
});

export const paymentClaimReviewBody = z.object({
  status: upperEnum(['APPROVED', 'REJECTED']),
  // Longer notes are trimmed to fit rather than rejected (existing behaviour).
  responseNote: z.string().nullish().transform((value) => String(value ?? '').trim().slice(0, 300))
});
