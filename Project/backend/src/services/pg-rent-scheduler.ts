import type { PrismaClient } from '@prisma/client';

export async function generateMonthlyRentEntries(prisma: PrismaClient, at = new Date()): Promise<number> {
  const period = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
  const tenants = await prisma.pGTenant.findMany({
    where: { status: { in: ['ACTIVE', 'NOTICE_PERIOD'] } },
    include: { bed: { include: { room: true } }, property: { select: { rentDay: true, rentDueDay: true } } }
  });

  for (const tenant of tenants) {
    const room = tenant.bed?.room;
    const dueDay = Math.min(28, Math.max(1, (tenant as any).property?.rentDueDay || 5));
    const dueDate = new Date(at.getFullYear(), at.getMonth(), dueDay);
    const amount = tenant.monthlyRent + (room?.maintenanceFee || 0) + (room?.utilitiesSurcharge || 0);
    await prisma.pGRentEntry.upsert({
      where: {
        tenantId_period_entryType: {
          tenantId: tenant.id,
          period,
          entryType: 'RENT'
        }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        period,
        entryType: 'RENT',
        amount,
        dueDate,
        invoiceCode: `RENT-${period}-${tenant.id.slice(0, 8).toUpperCase()}`,
        status: 'DUE'
      }
    });
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
