import type { Request, Response } from 'express';
import { z } from 'zod';
/** Parses req.body; on failure sends 400 and returns null. */
export declare function parseBody<T extends z.ZodType>(schema: T, req: Request, res: Response, message: string): z.infer<T> | null;
/** Required non-empty text, trimmed. */
export declare const text: (max?: number) => z.ZodString;
/** Optional text: absent, null or empty all mean "not given". */
export declare const optionalText: (max?: number) => z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
/** A positive amount; numeric strings from form inputs are accepted. */
export declare const positiveAmount: () => z.ZodCoercedNumber<unknown>;
/** Case-insensitive choice, normalized to upper case. */
export declare const upperEnum: <const T extends readonly [string, ...string[]]>(values: T) => z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodEnum<{ [k_1 in T[number]]: k_1; } extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never>>;
//# sourceMappingURL=validate.d.ts.map