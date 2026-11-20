import { z } from 'zod';
export declare const bookingRequestBody: z.ZodObject<{
    propertyId: z.ZodString;
    bedId: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    residentName: z.ZodString;
    phone: z.ZodString;
    email: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    moveInDate: z.ZodString;
    notes: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    phoneToken: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    idempotencyKey: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    vibeAnswers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    vibeSummary: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
}, z.core.$strip>;
export declare const rentPaymentBody: z.ZodObject<{
    amount: z.ZodCoercedNumber<unknown>;
    method: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodEnum<{
        OTHER: "OTHER";
        CASH: "CASH";
        NEFT: "NEFT";
        UPI: "UPI";
    }>>;
    reference: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
}, z.core.$strip>;
export declare const rentEntryBody: z.ZodObject<{
    tenantId: z.ZodString;
    period: z.ZodString;
    amount: z.ZodCoercedNumber<unknown>;
    dueDate: z.ZodString;
    entryType: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    notes: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
}, z.core.$strip>;
export declare const paymentClaimBody: z.ZodObject<{
    tenantId: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    rentEntryId: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string | undefined, string | null | undefined>>;
    amount: z.ZodCoercedNumber<unknown>;
    reference: z.ZodString;
}, z.core.$strip>;
export declare const paymentClaimReviewBody: z.ZodObject<{
    status: z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>, z.ZodEnum<{
        APPROVED: "APPROVED";
        REJECTED: "REJECTED";
    }>>;
    responseNote: z.ZodPipe<z.ZodOptional<z.ZodNullable<z.ZodString>>, z.ZodTransform<string, string | null | undefined>>;
}, z.core.$strip>;
//# sourceMappingURL=pg.schemas.d.ts.map