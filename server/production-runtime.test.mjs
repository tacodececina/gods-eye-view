import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  contentTypeFor,
  createProductionRuntime,
  isEntryModule,
  installProcessGuards,
} from './production-runtime.js';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eyeinsky-runtime-'));
  await fs.writeFile(
    path.join(root, 'index.html'),
    '<!doctype html><h1>SPA</h1>',
  );
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
  assert.equal(
    (await request(runtime.server, '/%252e%252e/index.html')).status,
    404,
  );
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

  assert.deepEqual(
    await (await request(runtime.server, '/api/provider-test')).json(),
    { ok: true },
  );
  const missing = await request(runtime.server, '/api/not-mounted');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('content-type'), 'application/json');
  assert.equal(
    (await request(runtime.server, '/api/setup/keys', { method: 'POST' }))
      .status,
    404,
  );
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

test('production runtime serves correct MIME types for built assets', () => {
  const cases = {
    'a.css': 'text/css; charset=utf-8',
    'a.wasm': 'application/wasm',
    'a.json': 'application/json; charset=utf-8',
    'a.svg': 'image/svg+xml',
    'a.png': 'image/png',
    'a.jpg': 'image/jpeg',
    'a.jpeg': 'image/jpeg',
    'a.webp': 'image/webp',
    'a.woff2': 'font/woff2',
    'a.glb': 'model/gltf-binary',
    'a.gltf': 'model/gltf+json',
    'a.ico': 'image/x-icon',
    'a.map': 'application/json; charset=utf-8',
    'a.txt': 'text/plain; charset=utf-8',
    'a.webmanifest': 'application/manifest+json',
    'a.JS': 'text/javascript; charset=utf-8',
    'a.unknown': 'application/octet-stream',
  };
  for (const [file, type] of Object.entries(cases))
    assert.equal(contentTypeFor(file), type, file);
});

test('production runtime sends served css with its MIME type', async (t) => {
  const dist = await fixture();
  await fs.writeFile(path.join(dist, 'style.abc.css'), 'body{}');
  const runtime = createProductionRuntime({ dist, providers: [] });
  t.after(() => runtime.close());
  await runtime.listen(0);
  const css = await request(runtime.server, '/style.abc.css');
  assert.equal(css.status, 200);
  assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
});

test('production runtime rejects oversized or unsized API bodies', async (t) => {
  const dist = await fixture();
  let reached = 0;
  const runtime = createProductionRuntime({
    dist,
    maxBodyBytes: 16,
    providers: [
      {
        configureServer(app) {
          app.middlewares.use('/api/echo', (_req, res) => {
            reached += 1;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{}');
          });
        },
      },
    ],
  });
  t.after(() => runtime.close());
  await runtime.listen(0);
  const big = await request(runtime.server, '/api/echo', {
    method: 'POST',
    body: 'x'.repeat(17),
  });
  assert.equal(big.status, 413);
  const ok = await request(runtime.server, '/api/echo', {
    method: 'POST',
    body: 'x'.repeat(16),
  });
  assert.equal(ok.status, 200);
  assert.equal(reached, 1);
});

test('production runtime configures server timeouts', async (t) => {
  const runtime = createProductionRuntime({
    dist: await fixture(),
    providers: [],
  });
  t.after(() => runtime.close());
  assert.equal(runtime.server.headersTimeout, 15_000);
  assert.equal(runtime.server.requestTimeout, 30_000);
  assert.equal(runtime.server.keepAliveTimeout, 5_000);
});

test('production runtime answers 500 when a static stream fails', async (t) => {
  const dist = await fixture();
  const runtime = createProductionRuntime({
    dist,
    providers: [],
    createReadStream: () => {
      const stream = new PassThrough();
      setImmediate(() => stream.destroy(new Error('EIO')));
      return stream;
    },
  });
  t.after(() => runtime.close());
  await runtime.listen(0);
  const failed = await request(runtime.server, '/assets.abc.js');
  assert.equal(failed.status, 500);
  assert.equal(failed.headers.get('content-type'), 'application/json');
});

test('process guards log only the message and exit for systemd restart', () => {
  const proc = new EventEmitter();
  const exits = [];
  const logs = [];
  proc.exit = (code) => exits.push(code);
  installProcessGuards(proc, (...args) => logs.push(args.join(' ')));
  proc.emit('uncaughtException', new Error('boom secret-stack'));
  proc.emit('unhandledRejection', new Error('late'));
  assert.deepEqual(exits, [1, 1]);
  assert.equal(logs.length, 2);
  assert.match(logs[0], /boom/);
  assert.doesNotMatch(logs.join('\n'), /at .*production-runtime/);
});

test('entry detection resolves symlinked argv paths to the real module', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eyeinsky-entry-'));
  const real = path.join(root, 'release');
  await fs.mkdir(real);
  const mod = path.join(real, 'runtime.js');
  await fs.writeFile(mod, '');
  const link = path.join(root, 'current');
  await fs.symlink(real, link, 'junction');
  const url = new URL(`file:///${mod.replace(/\\/g, '/')}`).href;
  assert.equal(isEntryModule(path.join(link, 'runtime.js'), url), true);
  assert.equal(isEntryModule(mod, url), true);
  assert.equal(isEntryModule(path.join(root, 'missing.js'), url), false);
});
