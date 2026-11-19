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
// Type guards for handlers that validate values themselves: they reject
// wrong types (objects, arrays, booleans where text is expected) and pass
// values through unchanged, so existing rules and messages still apply.
/** Text or a number (some clients send phones as numbers); null/absent allowed. */
export const textField = (max = 5000) => z.union([z.string().max(max), z.number().transform(String)]).nullish();
/** A number or numeric-looking string, validated further by the handler. */
export const numberLike = () => z.union([z.number(), z.string().max(40)]).nullish();
/** Boolean; "true"/"false" strings become real booleans. */
export const booleanLike = () => z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]).nullish();
/** A list of strings (or a single string, which handlers treat as no list). */
export const textList = () => z.union([z.array(z.string().max(1000)).max(200), z.string().max(5000)]).nullish();
export const INVALID_REQUEST = 'Some fields have the wrong format';
//# sourceMappingURL=validate.js.map