import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { validateBody, validateQuery } from '../src/middleware/validate.middleware.js';
import { vibeProfileBody, kitchenForecastQuery } from '../src/validation/request.schemas.js';

function fakeRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; }
  };
}

describe('Zod validation middleware', () => {
  it('passes valid request bodies through and strips unknown fields', () => {
    const mw = validateBody(vibeProfileBody);
    const req: any = { body: { text: 'Early sleeper', extra: 'dropped' } };
    const res = fakeRes();
    let nextCalled = false;
    mw(req, res as any, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.deepEqual(req.body, { text: 'Early sleeper' });
  });

  it('rejects malformed bodies with 400 and the configured error message', () => {
    const mw = validateBody(z.object({ text: z.string() }), 'Bad input');
    const req: any = { body: { text: { nested: true } } };
    const res = fakeRes();
    let nextCalled = false;
    mw(req, res as any, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Bad input');
    assert.ok(Array.isArray(res.body.issues) && res.body.issues.length > 0);
  });

  it('validates query parameters and rejects overlong values', () => {
    const mw = validateQuery(kitchenForecastQuery);
    const okRes = fakeRes();
    let okNext = false;
    mw({ query: { propertyId: 'pg-1', date: '2026-11-21' } } as any, okRes as any, () => { okNext = true; });
    assert.equal(okNext, true);

    const badRes = fakeRes();
    let badNext = false;
    mw({ query: { date: 'x'.repeat(50) } } as any, badRes as any, () => { badNext = true; });
    assert.equal(badNext, false);
    assert.equal(badRes.statusCode, 400);
  });
});
