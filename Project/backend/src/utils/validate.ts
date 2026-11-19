// Request body validation with Zod. Handlers keep their user-facing error
// message (so the frontend's toasts do not change) and also return the
// field-level issues for debugging.
import type { Request, Response } from 'express';
import { z } from 'zod';

/** Parses req.body; on failure sends 400 and returns null. */
export function parseBody<T extends z.ZodType>(schema: T, req: Request, res: Response, message: string): z.infer<T> | null {
  const result = schema.safeParse(req.body ?? {});
  if (result.success) return result.data;
  res.status(400).json({
    message,
    issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
  });
  return null;
}

// Building blocks shared by request schemas.

/** Required non-empty text, trimmed. */
export const text = (max = 500) => z.string().trim().min(1).max(max);

/** Optional text: absent, null or empty all mean "not given". */
export const optionalText = (max = 2000) => z
  .string()
  .max(max)
  .nullish()
  .transform((value) => (value == null || value.trim() === '' ? undefined : value.trim()));

/** A positive amount; numeric strings from form inputs are accepted. */
export const positiveAmount = () => z.coerce.number().finite().positive();

/** Case-insensitive choice, normalized to upper case. */
export const upperEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.string().transform((value) => value.trim().toUpperCase()).pipe(z.enum(values));
