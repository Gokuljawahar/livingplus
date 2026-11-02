export interface SplitRow {
    tenantId: string;
    tenantName: string;
    roomNumber: string;
    share: number;
}
export interface ElectricitySplit {
    rows: SplitRow[];
    occupiedBeds: number;
    totalBeds: number;
    ownerAbsorbed: number;
}
export interface MonthlyRentDetails {
    period: string;
    amount: number;
    dueDate: Date;
}
export declare function calculateMonthlyRent(tenant: {
    monthlyRent: number;
    bed?: {
        room?: {
            maintenanceFee?: number | null;
            utilitiesSurcharge?: number | null;
        } | null;
    } | null;
    property?: {
        rentDueDay?: number | null;
    } | null;
}, at?: Date): MonthlyRentDetails;
export declare function validateBillInput(input: {
    propertyId?: unknown;
    period?: unknown;
    totalAmount?: unknown;
}): {
    propertyId: string;
    period: string;
    totalAmount: number;
};
export declare function computeElectricitySplit(db: any, propertyId: string, totalAmount: number): Promise<ElectricitySplit>;
export declare function proposeElectricityBill(db: any, actorId: string | null, input: {
    propertyId?: unknown;
    period?: unknown;
    totalAmount?: unknown;
    imageUrl?: unknown;
}): Promise<any>;
export declare function approveElectricityBill(db: any, actorId: string | null, billId: string, propertyIds: string[]): Promise<{
    bill: any;
    entries: number;
}>;
export declare function listElectricityBills(db: any, propertyIds: string[], period?: string): Promise<any[]>;
export declare function setMealPreference(db: any, actor: {
    userId: string | null;
    phones: string[];
    propertyId?: string;
}, optOut: boolean): Promise<any>;
export declare function ensureFoodEntries(db: any, tenant: any, period: string, dueDate: Date): Promise<void>;
//# sourceMappingURL=pg-billing.d.ts.map