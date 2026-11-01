import type { PrismaClient } from '@prisma/client';
export declare function generateMonthlyRentEntries(prisma: PrismaClient, at?: Date): Promise<number>;
export declare function startMonthlyRentScheduler(prisma: PrismaClient): void;
//# sourceMappingURL=pg-rent-scheduler.d.ts.map