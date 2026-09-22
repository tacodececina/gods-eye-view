import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createProductionRuntime } from './production-runtime.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eyeinsky-runtime-'));
  await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><h1>SPA</h1>');
  await fs.writeFile(path.join(root, 'assets.abc.js'), 'hashed');
  await fs.writeFile(path.join(root, '.secret'), 'nope');
  return root;
}

async function request(server, pathname, options = {}) {
  const address = server.address();
  return fetch(`http://127.0.0.1:${address.port}${pathname}`, options);
}

test('production runtime serves static assets and SPA fallback safely', async (t) => {
  const dist = await fixture();
  const runtime = createProductionRuntime({ dist });
  t.after(() => runtime.close());
  await runtime.listen(0);

  const asset = await request(runtime.server, '/assets.abc.js');
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'hashed');
  assert.match(asset.headers.get('cache-control'), /immutable/);

  const spa = await request(runtime.server, '/mission/overview');
  assert.equal(spa.status, 200);
  assert.match(await spa.text(), /SPA/);
  assert.match(spa.headers.get('cache-control'), /no-store/);

  assert.equal((await request(runtime.server, '/.secret')).status, 404);
  assert.equal((await request(runtime.server, '/%252e%252e/index.html')).status, 404);
});

test('production runtime mounts providers but excludes credential setup', async (t) => {
  const dist = await fixture();
  const runtime = createProductionRuntime({
    dist,
    providers: [
      {
        configureServer(app) {
          app.middlewares.use('/api/provider-test', (_req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          });
        },
      },
    ],
  });
  t.after(() => runtime.close());
  await runtime.listen(0);

  assert.deepEqual(await (await request(runtime.server, '/api/provider-test')).json(), { ok: true });
  const missing = await request(runtime.server, '/api/not-mounted');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('content-type'), 'application/json');
  assert.equal((await request(runtime.server, '/api/setup/keys', { method: 'POST' })).status, 404);
});

test('production runtime exposes health and shuts down gracefully', async (t) => {
  const dist = await fixture();
  const runtime = createProductionRuntime({ dist });
  await runtime.listen(0);
  const health = await request(runtime.server, '/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'eyeinsky' });
  const closed = once(runtime.server, 'close');
  await runtime.close();
  await closed;
  t.after(() => runtime.close());
});
