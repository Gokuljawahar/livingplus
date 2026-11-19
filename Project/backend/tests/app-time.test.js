// Business-calendar math must not depend on the server's timezone: Cloud Run
// runs in UTC while rent periods follow the PG's local calendar.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dueDateIn, nextMonthStart, periodOf, periodRange, zonedDate } from '../src/utils/app-time.js';
import { calculateMonthlyRent } from '../src/services/pg-billing.js';
describe('app timezone calendar (Asia/Kolkata default)', () => {
    it('files a 1 Dec 02:00 IST event under December even on a UTC clock', () => {
        const at = new Date('2026-11-30T20:30:00Z'); // 02:00 IST on 1 Dec
        assert.equal(periodOf(at), '2026-12');
        assert.equal(periodOf(new Date('2026-11-30T18:29:59Z')), '2026-11');
    });
    it('computes local-midnight due dates and month ranges', () => {
        assert.equal(zonedDate(2026, 11, 5).toISOString(), '2026-12-04T18:30:00.000Z');
        assert.equal(dueDateIn(new Date('2026-11-30T20:30:00Z'), 5).toISOString(), '2026-12-04T18:30:00.000Z');
        assert.deepEqual(periodRange('2026-12'), {
            gte: new Date('2026-11-30T18:30:00.000Z'),
            lt: new Date('2026-12-31T18:30:00.000Z')
        });
    });
    it('schedules the monthly job at 00:05 local on the next 1st', () => {
        assert.equal(nextMonthStart(new Date('2026-11-19T10:00:00Z'), 0, 5).toISOString(), '2026-11-30T18:35:00.000Z');
        assert.equal(nextMonthStart(new Date('2026-12-31T20:00:00Z'), 0, 5).toISOString(), '2027-01-31T18:35:00.000Z');
    });
    it('bills rent for the local month with the property due day', () => {
        const rent = calculateMonthlyRent({ monthlyRent: 8000, property: { rentDueDay: 5 } }, new Date('2026-11-30T20:30:00Z'));
        assert.equal(rent.period, '2026-12');
        assert.equal(rent.dueDate.toISOString(), '2026-12-04T18:30:00.000Z');
    });
    it('honours APP_TIMEZONE', () => {
        const keep = process.env.APP_TIMEZONE;
        process.env.APP_TIMEZONE = 'UTC';
        try {
            assert.equal(periodOf(new Date('2026-11-30T20:30:00Z')), '2026-11');
        }
        finally {
            if (keep === undefined)
                delete process.env.APP_TIMEZONE;
            else
                process.env.APP_TIMEZONE = keep;
        }
    });
    it('gives identical results whatever TZ the process runs in', () => {
        const script = "import('./src/utils/app-time.ts').then(m => console.log(m.periodOf(new Date('2026-11-30T20:30:00Z')), m.zonedDate(2026, 11, 5).toISOString()))";
        const run = (tz) => execFileSync(process.execPath, ['--import', 'tsx', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim();
        const expected = '2026-12 2026-12-04T18:30:00.000Z';
        for (const tz of ['UTC', 'Asia/Kolkata', 'America/Los_Angeles'])
            assert.equal(run(tz), expected, tz);
    });
});
//# sourceMappingURL=app-time.test.js.map