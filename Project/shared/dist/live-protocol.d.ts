import type { z as ZodModule } from 'zod';
import type { VibeAnswers } from './vibecheck.js';
export type LiveClientMessage = {
    type: 'audio';
    data: string;
} | {
    type: 'text';
    text: string;
} | {
    type: 'pause';
};
export type LiveServerMessage = {
    type: 'ready';
} | {
    type: 'audio';
    data: string;
    mimeType: string;
} | {
    type: 'heard';
    text: string;
} | {
    type: 'said';
    text: string;
} | {
    type: 'interrupted';
} | {
    type: 'turn';
} | {
    type: 'habits';
    answers: VibeAnswers;
    summary: string | null;
    done: boolean;
    missing?: string[] | undefined;
} | {
    type: 'error';
    message: string;
} | {
    type: 'end';
    reason?: string | undefined;
};
export declare function createLiveProtocol(z: typeof ZodModule): {
    liveClientMessageSchema: ZodModule.ZodDiscriminatedUnion<[ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"audio">;
        data: ZodModule.ZodString;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"text">;
        text: ZodModule.ZodPipe<ZodModule.ZodPipe<ZodModule.ZodPipe<ZodModule.ZodString, ZodModule.ZodTransform<string, string>>, ZodModule.ZodString>, ZodModule.ZodTransform<string, string>>;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"pause">;
    }, ZodModule.core.$strip>], "type">;
    liveServerMessageSchema: ZodModule.ZodDiscriminatedUnion<[ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"ready">;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"audio">;
        data: ZodModule.ZodString;
        mimeType: ZodModule.ZodDefault<ZodModule.ZodString>;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"heard">;
        text: ZodModule.ZodString;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"said">;
        text: ZodModule.ZodString;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"interrupted">;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"turn">;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"habits">;
        answers: ZodModule.ZodRecord<ZodModule.ZodString, ZodModule.ZodNumber>;
        summary: ZodModule.ZodNullable<ZodModule.ZodString>;
        done: ZodModule.ZodBoolean;
        missing: ZodModule.ZodOptional<ZodModule.ZodArray<ZodModule.ZodString>>;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"error">;
        message: ZodModule.ZodString;
    }, ZodModule.core.$strip>, ZodModule.ZodObject<{
        type: ZodModule.ZodLiteral<"end">;
        reason: ZodModule.ZodOptional<ZodModule.ZodString>;
    }, ZodModule.core.$strip>], "type">;
    parseLiveClientMessage: (raw: unknown) => LiveClientMessage | null;
    parseLiveServerMessage: (raw: unknown) => LiveServerMessage | null;
};
