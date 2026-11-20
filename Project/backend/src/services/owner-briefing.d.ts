export declare const OWNER_BRIEFING_PATH = "/api/pg/owner/briefing/live";
/** A one-minute pass for the briefing connection. */
export declare function issueBriefingPass(userId: string): string;
/** The user id a pass belongs to, or null when it is missing, expired or for something else. */
export declare function readBriefingPass(pass: string | null): string | null;
/** Everything the briefing may talk about, for this person's PGs only. */
export declare function briefingFacts(userId: string): Promise<{
    firstName: string;
    facts: string;
} | null>;
export declare function briefingInstruction(facts: string): string;
//# sourceMappingURL=owner-briefing.d.ts.map