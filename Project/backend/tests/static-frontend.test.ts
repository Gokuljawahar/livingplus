// The API can serve the built frontend (one Cloud Run service). Runs in its
// own process because the option is read when the app module loads.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-dist-'));
fs.mkdirSync(path.join(dist, 'assets'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>LivingPlus</title>');
fs.writeFileSync(path.join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
process.env.FRONTEND_DIST_DIR = dist;
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'test-secret-for-static-frontend-32-bytes';

let server: http.Server;
let base = '';

before(async () => {
  const { default: app } = await import('../src/app.js');
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => {
  server?.close();
  fs.rmSync(dist, { recursive: true, force: true });
});

describe('serving the built frontend', () => {
  it('renders index.html for app routes, uncached', async () => {
    for (const route of ['/', '/pg/manage', '/resident', '/pg/resident?x=1']) {
      const res = await fetch(`${base}${route}`);
      assert.equal(res.status, 200, route);
      assert.match(await res.text(), /<title>LivingPlus<\/title>/);
      assert.equal(res.headers.get('cache-control'), 'no-cache');
    }
  });

  it('caches hashed assets long-term', async () => {
    const res = await fetch(`${base}/assets/app-abc123.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  });

  it('never answers API, cron or health routes with the app shell', async () => {
    for (const path of ['/health', '/healthz']) {
      const health = await fetch(`${base}${path}`);
      assert.deepEqual(await health.json(), { ok: true }, path);
    }
    const api = await fetch(`${base}/api/does-not-exist`);
    assert.doesNotMatch(await api.text(), /<title>LivingPlus/);
    const cron = await fetch(`${base}/internal/cron/monthly-rent`, { method: 'POST' });
    assert.equal(cron.status, 404);
    assert.doesNotMatch(await cron.text(), /<title>LivingPlus/);
  });
});
