import { z } from 'zod';
export interface Actor {
    userId: string | null;
    role: string;
    phones: string[];
    propertyIds: string[];
    propertyId?: string;
}
export declare function actorFromRequest(req: any): Promise<Actor>;
export interface ToolExecutor {
    description: string;
    /** Arguments the model may pass; also the source of the JSON schema it sees. */
    schema: z.ZodType;
    requiresConfirmation: boolean;
    roles: string[];
    execute: (actor: Actor, args: any) => Promise<unknown>;
}
/** JSON schema for a tool, in the plain subset every model provider accepts. */
export declare function toolParameters(schema: z.ZodType): Record<string, unknown>;
/** Validates and normalizes model-supplied arguments for a tool. */
export declare function parseToolArgs(name: string, args: unknown): {
    ok: true;
    args: Record<string, any>;
} | {
    ok: false;
    error: string;
};
export declare const toolCatalogue: Record<string, ToolExecutor>;
export declare function toolDefinitionsFor(role: string): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}[];
//# sourceMappingURL=ai-tools.d.ts.map