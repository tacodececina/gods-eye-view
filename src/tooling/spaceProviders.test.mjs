import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import {
  celestrakProxy,
  rocketLaunchesProxy,
  launchLibraryRequestHeaders,
  LL2_CACHE_TTL_MS,
} from 'gods-eye-view/server/providers/space';
import {
  celestrakGpUrl,
  celestrakTleUrl,
  launchLibraryRecentUrl,
} from 'gods-eye-view/sources/space';
import * as compatibility from '../../server/providers/local.js';

function install(plugin, preview = false) {
  const routes = new Map();
  plugin[preview ? 'configurePreviewServer' : 'configureServer']({
    middlewares: {
      use(route, handler) {
        routes.set(route, handler);
      },
    },
  });
  return async (route, url = '/', method = 'GET') => {
    const res = {
      headersSent: false,
      writeHead(status, headers) {
        Object.assign(this, { status, headers, headersSent: true });
      },
      end(body) {
        this.body = body;
      },
    };
    await routes.get(route)({ url, method }, res);
    return res;
  };
}
function isolateDisk(t) {
  t.mock.method(fsp, 'readFile', async () => {
    throw Error('no cache');
  });
  t.mock.method(fsp, 'stat', async () => {
    throw Error('no cache');
  });
  t.mock.method(fsp, 'mkdir', async () => {});
  t.mock.method(fsp, 'writeFile', async () => {});
}

test('portable requests keep fixed origins, encode group data and preserve the 30-day UTC window', () => {
  const tle = celestrakTleUrl('stations&FORMAT=json');
  assert.equal(tle.origin, 'https://celestrak.org');
  assert.equal(tle.pathname, '/NORAD/elements/gp.php');
  assert.equal(tle.searchParams.get('GROUP'), 'stations&FORMAT=json');
  assert.equal(tle.searchParams.get('FORMAT'), 'tle');
  const end = new Date('2026-03-01T12:34:56.000Z');
  const url = launchLibraryRecentUrl(end);
  assert.equal(url.origin, 'https://ll.thespacedevs.com');
  assert.equal(url.pathname, '/2.3.0/launches/');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    net__gte: '2026-01-30T12:34:56.000Z',
    net__lte: '2026-03-01T12:34:56.000Z',
    limit: '100',
    mode: 'detailed',
  });
  assert.equal(end.toISOString(), '2026-03-01T12:34:56.000Z');
});

test('compatibility exports retain the same LL2 header helper and TTL', () => {
  assert.equal(
    compatibility.launchLibraryRequestHeaders,
    launchLibraryRequestHeaders,
  );
  assert.equal(compatibility.LL2_CACHE_TTL_MS, LL2_CACHE_TTL_MS);
});

test('exported CelesTrak plugin coalesces refreshes, retains stale TLEs, and reads disk in a new instance', async (t) => {
  isolateDisk(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'warn', () => {});
  const tle = 'ISS\n1 25544U fixture\n2 25544 fixture';
  let calls = 0,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    assert.equal(new URL(url).searchParams.get('GROUP'), 'stations');
    await gate;
    return new Response(tle);
  });
  const request = install(celestrakProxy());
  assert.equal((await request('/api/celestrak', '/../bad')).status, 400);
  assert.equal(calls, 0);
  const first = request('/api/celestrak', '/stations');
  const second = request('/api/celestrak', '/stations');
  release();
  for (const res of await Promise.all([first, second]))
    assert.equal(res.body, tle);
  assert.equal(calls, 1);
  assert.equal(
    (await request('/api/celestrak', '/stations')).headers['x-tle-cache'],
    'HIT',
  );
  now += 6 * 3600_000;
  t.mock.method(globalThis, 'fetch', async () => new Response('not a TLE'));
  const stale = await request('/api/celestrak', '/stations');
  assert.equal(stale.body, tle);
  assert.equal(stale.headers['x-tle-cache'], 'STALE-ERROR');
  t.mock.method(fsp, 'readFile', async () =>
    JSON.stringify({ at: now, body: tle }),
  );
  t.mock.method(globalThis, 'fetch', async () => {
    throw Error('fresh disk must prevent fetch');
  });
  const disk = await install(celestrakProxy())('/api/celestrak', '/stations');
  assert.equal(disk.headers['x-tle-cache'], 'HIT');
  assert.equal(disk.body, tle);
});

test('CelesTrak GP requests select TLE or OMM JSON and keep TLE as the default', () => {
  const json = celestrakGpUrl('stations', { format: 'json' });
  assert.equal(json.origin, 'https://celestrak.org');
  assert.equal(json.pathname, '/NORAD/elements/gp.php');
  assert.equal(json.searchParams.get('GROUP'), 'stations');
  assert.equal(json.searchParams.get('FORMAT'), 'json');
  assert.equal(celestrakGpUrl('visual').searchParams.get('FORMAT'), 'tle');
  assert.equal(
    celestrakTleUrl('visual').toString(),
    celestrakGpUrl('visual', { format: 'tle' }).toString(),
  );
  for (const format of ['xml', 'JSON', '', 'tle&FORMAT=json'])
    assert.throws(() => celestrakGpUrl('visual', { format }), TypeError);
});

test('CelesTrak proxy caches OMM JSON apart from TLE with its own single-flight', async (t) => {
  isolateDisk(t);
  const now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'warn', () => {});
  const omm = JSON.stringify([
    { OBJECT_NAME: 'ISS (ZARYA)', NORAD_CAT_ID: 25544 },
  ]);
  const tle = 'ISS\n1 25544U fixture\n2 25544 fixture';
  const upstream = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    const format = new URL(url).searchParams.get('FORMAT');
    upstream.push(format);
    await gate;
    return new Response(format === 'json' ? omm : tle);
  });
  const request = install(celestrakProxy());
  assert.equal(
    (await request('/api/celestrak', '/stations?FORMAT=xml')).status,
    400,
  );
  const pending = [
    request('/api/celestrak', '/stations?FORMAT=json'),
    request('/api/celestrak', '/stations?FORMAT=JSON'),
    request('/api/celestrak', '/stations'),
  ];
  release();
  const [first, second, legacy] = await Promise.all(pending);
  assert.deepEqual(upstream.sort(), ['json', 'tle']);
  assert.equal(first.body, omm);
  assert.equal(second.body, omm);
  assert.equal(first.headers['Content-Type'], 'application/json');
  assert.equal(first.headers['x-tle-cache'], 'MISS');
  assert.equal(first.headers['x-tle-fetched-at'], String(now));
  assert.equal(legacy.body, tle);
  assert.equal(legacy.headers['Content-Type'], 'text/plain');
  const hit = await request('/api/celestrak', '/stations?FORMAT=json');
  assert.equal(hit.headers['x-tle-cache'], 'HIT');
  assert.equal(hit.body, omm);
  const writes = fsp.writeFile.mock.calls.map((call) =>
    String(call.arguments[0]),
  );
  assert.equal(new Set(writes).size, 2, 'one disk cache file per format');
});

test('CelesTrak proxy rejects JSON without NORAD ids and serves the stale OMM copy', async (t) => {
  isolateDisk(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'warn', () => {});
  const omm = JSON.stringify([{ NORAD_CAT_ID: 123456, OBJECT_NAME: 'P4' }]);
  t.mock.method(globalThis, 'fetch', async () => new Response(omm));
  const request = install(celestrakProxy());
  const fresh = await request('/api/celestrak', '/cubesat?FORMAT=json');
  assert.equal(fresh.headers['x-tle-cache'], 'MISS');
  const fetchedAt = fresh.headers['x-tle-fetched-at'];
  now += 6 * 3600_000;
  for (const invalid of [
    '[]',
    '{"NORAD_CAT_ID":1}',
    '[{"OBJECT_NAME":"no id"}]',
    'No GP data found',
    'ISS\n1 25544U fixture\n2 25544 fixture',
  ]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(invalid));
    const stale = await request('/api/celestrak', '/cubesat?FORMAT=json');
    assert.equal(stale.status, 200);
    assert.equal(stale.body, omm);
    assert.equal(stale.headers['x-tle-cache'], 'STALE-ERROR');
    assert.equal(stale.headers['x-tle-fetched-at'], fetchedAt);
  }
  const none = await install(celestrakProxy())(
    '/api/celestrak',
    '/visual?FORMAT=json',
  );
  assert.equal(none.status, 502);
  assert.equal(none.headers['x-tle-cache'], 'NONE');
  assert.equal(none.headers['x-tle-fetched-at'], undefined);
});

for (const preview of [false, true])
  test(`exported launch plugin preserves optional server auth and cache in ${preview ? 'preview' : 'development'}`, async (t) => {
    isolateDisk(t);
    const prior = process.env.LL2_API_TOKEN;
    t.after(() => {
      if (prior === undefined) delete process.env.LL2_API_TOKEN;
      else process.env.LL2_API_TOKEN = prior;
    });
    process.env.LL2_API_TOKEN = ' fixture-token ';
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      calls++;
      assert.equal(url.searchParams.get('limit'), '100');
      assert.equal(options.headers.Authorization, 'Token fixture-token');
      return Response.json({ results: [{ id: 'launch-fixture' }] });
    });
    const request = install(rocketLaunchesProxy(), preview);
    assert.equal((await request('/api/launches', '/', 'POST')).status, 405);
    const first = await request('/api/launches');
    assert.equal(first.headers['X-GEV-Cache'], 'MISS');
    assert.doesNotMatch(first.body, /fixture-token/);
    const hit = await request('/api/launches');
    assert.equal(hit.headers['X-GEV-Cache'], 'HIT');
    assert.equal(hit.body, first.body);
    assert.equal(calls, 1);
  });
