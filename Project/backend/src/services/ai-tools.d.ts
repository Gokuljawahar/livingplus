export interface Actor {
    userId: string | null;
    role: string;
    phones: string[];
    propertyIds: string[];
    isSuperAdmin: boolean;
    propertyId?: string;
}
export declare function actorFromRequest(req: any): Promise<Actor>;
export interface ToolExecutor {
    description: string;
    parameters: Record<string, unknown>;
    requiresConfirmation: boolean;
    roles: string[];
    execute: (actor: Actor, args: any) => Promise<unknown>;
}
export declare const toolCatalogue: Record<string, ToolExecutor>;
export declare function toolDefinitionsFor(role: string): {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}[];
//# sourceMappingURL=ai-tools.d.ts.map