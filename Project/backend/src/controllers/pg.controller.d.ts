import type { Request, Response } from 'express';
export declare function currentUser(req: Request): {
    id: string;
    role: string;
    propertyId?: string;
} | null;
export declare function canManageProperty(req: Request, propertyId: string, roles?: string[]): Promise<boolean>;
export declare function accessiblePropertyIds(req: Request, roles?: string[]): Promise<string[]>;
export declare const getPublicConfig: (_req: Request, res: Response) => Promise<any>;
/**
 * Meaning-based search over published PGs. Returns ranked property ids; the
 * client combines them with its own keyword match and filters. Responds with
 * semantic: false (and no results) when semantic search is off or failing,
 * so the client simply keeps its keyword search.
 */
export declare const searchPropertiesSemantic: (req: Request, res: Response) => Promise<any>;
/** Public directory of PG resident sites (/stay/<slug>): name and place only. */
export declare const listPgSites: (req: Request, res: Response) => Promise<any>;
/** One PG resident site by slug, for the resident site header. */
export declare const getPgSite: (req: Request, res: Response) => Promise<any>;
export declare const listProperties: (req: Request, res: Response) => Promise<any>;
export declare const listOwnerProperties: (req: Request, res: Response) => Promise<any>;
export declare const createProperty: (req: Request, res: Response) => Promise<any>;
export declare const updateProperty: (req: Request, res: Response) => Promise<any>;
export declare const deleteProperty: (req: Request, res: Response) => Promise<any>;
export declare const createRoom: (req: Request, res: Response) => Promise<any>;
export declare const updateBedStatus: (req: Request, res: Response) => Promise<any>;
export declare const createBookingRequest: (req: Request, res: Response) => Promise<any>;
export declare const cancelBookingRequest: (req: Request, res: Response) => Promise<any>;
export declare const getPublicBookingStatus: (req: Request, res: Response) => Promise<any>;
export declare const listGuestBookings: (req: Request, res: Response) => Promise<any>;
/**
 * Public: turns a free-text description of someone's routine (any language)
 * into VibeCheck habits with one structured Gemini call. Nothing is stored;
 * the person reviews the result before using it.
 */
export declare const buildVibeProfileFromText: (req: Request, res: Response) => Promise<any>;
/**
 * Public: one turn of the voice VibeCheck interview. Gemini hears the answer
 * (audio or typed text), updates the habits and says the next question.
 * Nothing is stored; the person reviews the habits before matching.
 */
export declare const vibeInterviewStep: (req: Request, res: Response) => Promise<any>;
/**
 * Public VibeCheck for a published PG: scores the visitor's answers against the
 * residents of each room with a free bed. Returns scores and habit-level
 * reasons only, never residents' names or individual answers.
 */
export declare const vibeCheckProperty: (req: Request, res: Response) => Promise<any>;
/** The signed-in resident's own stay, or null (same ownership rule as notices). */
export declare function ownStay(req: Request, tenantId: string): Promise<any | null>;
/** Residents answer VibeCheck so future roommates can match with them. */
export declare const saveTenantVibe: (req: Request, res: Response) => Promise<any>;
/** The resident's match with their current roommates, and whether the rematch window is open. */
export declare const getTenantVibeMatch: (req: Request, res: Response) => Promise<any>;
/** Resident: read my uploaded KYC document with AI right after uploading it. */
export declare const checkMyKyc: (req: Request, res: Response) => Promise<any>;
/** Owner or warden: run (or re-run) the AI reading of a resident's KYC document. */
export declare const checkTenantKyc: (req: Request, res: Response) => Promise<any>;
/** Timestamped move-in / move-out condition records for one stay, newest first. */
export declare const listConditionReports: (req: Request, res: Response) => Promise<any>;
/** Adds a condition record. Records are never edited or deleted, so they can settle deposit disputes. */
export declare const createConditionReport: (req: Request, res: Response) => Promise<any>;
export declare const listOwnerBookings: (req: Request, res: Response) => Promise<any>;
export declare const updateBookingStatus: (req: Request, res: Response) => Promise<any>;
export declare const checkInTenant: (req: Request, res: Response) => Promise<any>;
export declare const checkOutTenant: (req: Request, res: Response) => Promise<any>;
export declare const listTenantStays: (req: Request, res: Response) => Promise<any>;
export declare const submitTenantNotice: (req: Request, res: Response) => Promise<any>;
export declare const cancelTenantNotice: (req: Request, res: Response) => Promise<any>;
export declare const listAuditLogs: (req: Request, res: Response) => Promise<any>;
export declare const markDepositRefunded: (req: Request, res: Response) => Promise<any>;
export declare const listOwnerTenants: (req: Request, res: Response) => Promise<any>;
export declare const updateTenantProfile: (req: Request, res: Response) => Promise<any>;
export declare const listPropertyStaff: (req: Request, res: Response) => Promise<any>;
export declare const createPropertyStaff: (req: Request, res: Response) => Promise<any>;
export declare const removePropertyStaff: (req: Request, res: Response) => Promise<any>;
export declare const listOwnerRentEntries: (req: Request, res: Response) => Promise<any>;
export declare const createRentEntry: (req: Request, res: Response) => Promise<any>;
export declare const sendRentReminders: (req: Request, res: Response) => Promise<any>;
export declare const listOwnerExpenses: (req: Request, res: Response) => Promise<any>;
export declare const createOwnerExpense: (req: Request, res: Response) => Promise<any>;
export declare const deleteOwnerExpense: (req: Request, res: Response) => Promise<any>;
export declare const listElectricityBills: (req: Request, res: Response) => Promise<any>;
export declare const proposeElectricityBill: (req: Request, res: Response) => Promise<any>;
export declare const approveElectricityBill: (req: Request, res: Response) => Promise<any>;
export declare const recordRentPayment: (req: Request, res: Response) => Promise<any>;
export declare const getOwnerReport: (req: Request, res: Response) => Promise<any>;
export declare const getOwnerSummary: (req: Request, res: Response) => Promise<any>;
export declare const listOwnerTickets: (req: Request, res: Response) => Promise<any>;
export declare const listTenantTickets: (req: Request, res: Response) => Promise<any>;
export declare const createTenantTicket: (req: Request, res: Response) => Promise<any>;
export declare const updateResidentProfile: (req: Request, res: Response) => Promise<any>;
export declare const listResidentNotifications: (req: Request, res: Response) => Promise<any>;
export declare const createResidentPaymentClaim: (req: Request, res: Response) => Promise<any>;
export declare const listResidentPaymentClaims: (req: Request, res: Response) => Promise<any>;
export declare const markResidentNotificationRead: (req: Request, res: Response) => Promise<any>;
export declare const createMaintenanceTicket: (req: Request, res: Response) => Promise<any>;
export declare const updateMaintenanceStatus: (req: Request, res: Response) => Promise<any>;
export declare const listOwnerPaymentClaims: (req: Request, res: Response) => Promise<any>;
export declare const reviewPaymentClaim: (req: Request, res: Response) => Promise<any>;
//# sourceMappingURL=pg.controller.d.ts.map