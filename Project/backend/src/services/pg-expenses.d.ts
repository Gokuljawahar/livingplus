export declare const EXPENSE_CATEGORIES: readonly ["FOOD", "STAFF", "MAINTENANCE", "UTILITIES", "OTHER"];
export interface ExpenseInput {
    propertyId: string;
    category?: string;
    amount: number;
    spentOn?: string;
    note?: string;
}
export interface ValidExpense {
    propertyId: string;
    category: string;
    amount: number;
    spentOn: Date;
    note: string | null;
}
export declare function validateExpenseInput(input: ExpenseInput): ValidExpense;
export declare function createExpense(db: any, actorId: string | null, input: ExpenseInput): Promise<any>;
export declare function listExpenses(db: any, propertyIds: string[], period?: string): Promise<{
    entries: any[];
    total: number;
    byCategory: Record<string, number>;
}>;
export declare function deleteExpense(db: any, actorId: string | null, id: string, propertyIds: string[]): Promise<void>;
//# sourceMappingURL=pg-expenses.d.ts.map