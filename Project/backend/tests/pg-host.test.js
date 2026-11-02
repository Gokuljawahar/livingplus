import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePgHost } from '../src/middleware/pg-host.middleware.js';
import { resolveHostContext, slugifyPgName } from '../src/utils/pg-slug.js';
describe('PG host resolution', () => {
    it('distinguishes public, admin, API, and property hosts', () => {
        assert.deepEqual(resolveHostContext('livingplus.com'), { kind: 'public' });
        assert.deepEqual(resolveHostContext('www.livingplus.com'), { kind: 'public' });
        assert.deepEqual(resolveHostContext('admin.livingplus.com'), { kind: 'platform-admin' });
        assert.deepEqual(resolveHostContext('api.livingplus.com'), { kind: 'api' });
        assert.deepEqual(resolveHostContext('green-house.livingplus.com'), { kind: 'property', slug: 'green-house' });
    });
    it('rejects unknown and reserved production subdomains', () => {
        assert.deepEqual(resolveHostContext('unknown.example.com'), { kind: 'unknown' });
        assert.deepEqual(resolveHostContext('api.livingplus.com.evil.test'), { kind: 'unknown' });
        assert.deepEqual(resolveHostContext('login.livingplus.com'), { kind: 'unknown' });
    });
    it('resolves localhost property hosts outside production', () => {
        assert.deepEqual(resolveHostContext('green-house.localhost'), { kind: 'property', slug: 'green-house' });
    });
    it('creates valid slugs from property names and avoids reserved names', () => {
        assert.equal(slugifyPgName('Green House Chennai'), 'green-house-chennai');
        assert.equal(slugifyPgName('Living Plus'), 'living-plus');
        assert.equal(slugifyPgName('admin'), 'pg-admin');
    });
});
describe('PG host middleware', () => {
    it('resolves a validated development slug header to its active property', async () => {
        const request = {
            hostname: 'localhost',
            get: (name) => name.toLowerCase() === 'x-pg-slug' ? 'green-house' : undefined
        };
        const response = {
            statusCode: 200,
            body: undefined,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; }
        };
        let nextCalled = false;
        const middleware = resolvePgHost({
            pGProperty: { findFirst: async () => ({ id: 'property-id' }) }
        });
        await middleware(request, response, () => { nextCalled = true; });
        assert.equal(nextCalled, true);
        assert.equal(request.pgPropertyId, 'property-id');
        assert.equal(request.pgSlug, 'green-house');
    });
    it('rejects a host/header conflict and unknown property host', async () => {
        const response = {
            statusCode: 200,
            body: undefined,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; }
        };
        const middleware = resolvePgHost({ pGProperty: { findFirst: async () => null } });
        const conflictingRequest = {
            hostname: 'green-house.localhost',
            get: () => 'another-house'
        };
        await middleware(conflictingRequest, response, () => assert.fail('conflicting host must stop'));
        assert.equal(response.statusCode, 400);
        response.statusCode = 200;
        const unknownRequest = { hostname: 'unknown.example.com', get: () => undefined };
        await middleware(unknownRequest, response, () => assert.fail('unknown host must stop'));
        assert.equal(response.statusCode, 404);
    });
});
//# sourceMappingURL=pg-host.test.js.map