export declare const whatsappInboundEnabled: () => boolean;
/** Meta's subscription handshake: echo the challenge when the verify token matches. */
export declare function verifySubscription(query: Record<string, unknown>): string | null;
/** True when the raw body was signed with our app secret. */
export declare function validSignature(rawBody: Buffer, header: string | undefined): boolean;
export interface InboundText {
    id: string;
    from: string;
    text: string;
}
export declare function textMessages(payload: any): InboundText[];
type Sender = (to: string, body: string) => Promise<void>;
type Chat = (req: any, input: {
    message: string;
    sessionId?: string;
    confirmationId?: string;
    cancelConfirmationId?: string;
}) => Promise<{
    reply: string;
    sessionId: string;
    needsConfirmation?: {
        confirmationId: string;
        preview: string;
    };
}>;
export declare function sendWhatsAppText(to: string, body: string): Promise<void>;
/** Answers one inbound text with the assistant. Duplicate deliveries (Meta retries) are ignored. */
export declare function handleInboundText(message: InboundText, deps: {
    chat: Chat;
    send?: Sender;
}): Promise<string | null>;
/** Test hook. */
export declare function resetWhatsAppStateForTests(): void;
export {};
//# sourceMappingURL=whatsapp-inbound.d.ts.map