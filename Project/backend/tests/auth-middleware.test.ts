import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { authenticate } from '../src/middleware/auth.middleware.js';

process.env.JWT_SECRET = 'testsecret12345678901234567890123456';
const SECRET = 'testsecret12345678901234567890123456';

function signToken(role: string, propertyId?: string): string {
  return jwt.sign(
    { userId: 'user-1', role, ...(propertyId ? { propertyId } : {}) },
    SECRET,
    { expiresIn: '1d' }
  );
}

function runMiddleware(hostPropertyId: string | undefined, token: string | undefined) {
  const request = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    pgPropertyId: hostPropertyId
  } as any;
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  };
  let nextCalled = false;
  authenticate(request, response as any, () => { nextCalled = true; });
  return { response, nextCalled, user: (request as any).user };
}

describe('authenticate PG host scoping', () => {
  it('accepts a property-scoped resident session on an unscoped host', () => {
    const { response, nextCalled } = runMiddleware(undefined, signToken('PG_TENANT', 'property-a'));
    assert.equal(nextCalled, true);
    assert.equal(response.statusCode, 200);
  });

  it('accepts an unscoped session on an unscoped host', () => {
    const { nextCalled } = runMiddleware(undefined, signToken('PG_OWNER'));
    assert.equal(nextCalled, true);
  });

  it('rejects a mismatched session on a property host', () => {
    const { response, nextCalled } = runMiddleware('property-b', signToken('PG_TENANT', 'property-a'));
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
  });

  it('rejects an unscoped session on a property host', () => {
    const { response, nextCalled } = runMiddleware('property-b', signToken('PG_OWNER'));
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 403);
  });

  it('accepts a matching session on its property host', () => {
    const { nextCalled } = runMiddleware('property-a', signToken('PG_TENANT', 'property-a'));
    assert.equal(nextCalled, true);
  });

  it('lets a super admin cross property hosts', () => {
    const { nextCalled } = runMiddleware('property-b', signToken('SUPER_ADMIN', 'property-a'));
    assert.equal(nextCalled, true);
  });

  it('requires a bearer token', () => {
    const { response, nextCalled } = runMiddleware(undefined, undefined);
    assert.equal(nextCalled, false);
    assert.equal(response.statusCode, 401);
  });
});
