const BASE64_AUDIO = /^[A-Za-z0-9+/=]+$/;
export function createLiveProtocol(z) {
    const liveClientMessageSchema = z.discriminatedUnion('type', [
        z.object({
            type: z.literal('audio'),
            data: z.string().min(1).max(199_999).regex(BASE64_AUDIO)
        }),
        z.object({
            type: z.literal('text'),
            text: z.string().transform((value) => value.trim()).pipe(z.string().min(1)).transform((value) => value.slice(0, 1000))
        }),
        z.object({
            type: z.literal('pause')
        })
    ]);
    const liveServerMessageSchema = z.discriminatedUnion('type', [
        z.object({ type: z.literal('ready') }),
        z.object({
            type: z.literal('audio'),
            data: z.string().min(1),
            mimeType: z.string().default('audio/pcm;rate=24000')
        }),
        z.object({ type: z.literal('heard'), text: z.string() }),
        z.object({ type: z.literal('said'), text: z.string() }),
        z.object({ type: z.literal('interrupted') }),
        z.object({ type: z.literal('turn') }),
        z.object({
            type: z.literal('habits'),
            answers: z.record(z.string(), z.number().int().min(0).max(2)),
            summary: z.string().nullable(),
            done: z.boolean(),
            missing: z.array(z.string()).optional()
        }),
        z.object({ type: z.literal('error'), message: z.string() }),
        z.object({ type: z.literal('end'), reason: z.string().optional() })
    ]);
    function parseLiveClientMessage(raw) {
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const result = liveClientMessageSchema.safeParse(parsed);
            return result.success ? result.data : null;
        }
        catch {
            return null;
        }
    }
    function parseLiveServerMessage(raw) {
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const result = liveServerMessageSchema.safeParse(parsed);
            return result.success ? result.data : null;
        }
        catch {
            return null;
        }
    }
    return { liveClientMessageSchema, liveServerMessageSchema, parseLiveClientMessage, parseLiveServerMessage };
}
