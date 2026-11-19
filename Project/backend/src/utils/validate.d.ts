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
/** Text or a number (some clients send phones as numbers); null/absent allowed. */
export declare const textField: (max?: number) => z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodPipe<z.ZodNumber, z.ZodTransform<string, number>>]>>>;
/** A number or numeric-looking string, validated further by the handler. */
export declare const numberLike: () => z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
/** Boolean; "true"/"false" strings become real booleans. */
export declare const booleanLike: () => z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodBoolean, z.ZodPipe<z.ZodEnum<{
    true: "true";
    false: "false";
}>, z.ZodTransform<boolean, "true" | "false">>]>>>;
/** A list of strings (or a single string, which handlers treat as no list). */
export declare const textList: () => z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodString]>>>;
export declare const INVALID_REQUEST = "Some fields have the wrong format";
//# sourceMappingURL=validate.d.ts.map