import { z } from 'zod';
/** Parses req.body; on failure sends 400 and returns null. */
export function parseBody(schema, req, res, message) {
    const result = schema.safeParse(req.body ?? {});
    if (result.success)
        return result.data;
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
export const upperEnum = (values) => z.string().transform((value) => value.trim().toUpperCase()).pipe(z.enum(values));
//# sourceMappingURL=validate.js.map