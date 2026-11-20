export interface A2uiComponent {
    id: string;
    component: string;
    [key: string]: unknown;
}
export interface A2uiMessage {
    version: '1.0';
    createSurface: {
        surfaceId: string;
        catalogId: string;
        components: A2uiComponent[];
        dataModel: Record<string, unknown>;
    };
}
/** Property results as selectable cards; the book button reports back as an agent event. */
export declare function propertyResultsSurface(result: unknown): A2uiMessage[];
/** The confirmation prompt as a card whose buttons resolve the paused tool. */
export declare function confirmationSurface(confirmationId: string, preview: string): A2uiMessage[];
/** Surfaces for one chat turn, from the tools that ran (in execution order). */
export declare function surfacesForOutcomes(outcomes: Array<{
    tool: string;
    result: unknown;
}>): A2uiMessage[];
//# sourceMappingURL=a2ui.d.ts.map