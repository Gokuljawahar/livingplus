import type { PrismaClient } from '@prisma/client';
import { calculateMonthlyRent, ensureFoodEntries } from './pg-billing.js';

export async function generateMonthlyRentEntries(prisma: PrismaClient, at = new Date()): Promise<number> {
  const tenants = await prisma.pGTenant.findMany({
    where: { status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
    include: { bed: { include: { room: true } }, property: { select: { rentDay: true, rentDueDay: true } } }
  });

  for (const tenant of tenants) {
    const rent = calculateMonthlyRent(tenant, at);
    await prisma.pGRentEntry.upsert({
      where: {
        tenantId_period_entryType: {
          tenantId: tenant.id,
          period: rent.period,
          entryType: 'RENT'
        }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        period: rent.period,
        entryType: 'RENT',
        amount: rent.amount,
        dueDate: rent.dueDate,
        invoiceCode: `RENT-${rent.period}-${tenant.id.slice(0, 8).toUpperCase()}`,
        status: 'DUE'
      }
    });
    await ensureFoodEntries(prisma, tenant, rent.period, rent.dueDate);
  }

  return tenants.length;
}

export function startMonthlyRentScheduler(prisma: PrismaClient): void {
  const maxTimerDelay = 2_147_000_000;
  const now = new Date();
  void generateMonthlyRentEntries(prisma, now)
    .then((count) => console.log(`[PG billing] Ensured ${count} rent entries for ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`))
    .catch((error) => console.error('[PG billing] Monthly rent generation failed:', error));

  const scheduleNextRun = () => {
    const current = new Date();
    const nextRun = new Date(current.getFullYear(), current.getMonth() + 1, 1, 0, 5, 0, 0);
    const timer = setTimeout(() => {
      if (Date.now() < nextRun.getTime()) {
        scheduleNextRun();
        return;
      }

      void generateMonthlyRentEntries(prisma, nextRun)
        .then((count) => console.log(`[PG billing] Ensured ${count} rent entries for ${nextRun.getFullYear()}-${String(nextRun.getMonth() + 1).padStart(2, '0')}`))
        .catch((error) => console.error('[PG billing] Monthly rent generation failed:', error))
        .finally(scheduleNextRun);
    }, Math.min(maxTimerDelay, Math.max(0, nextRun.getTime() - current.getTime())));
    timer.unref();
  };

  scheduleNextRun();
}
