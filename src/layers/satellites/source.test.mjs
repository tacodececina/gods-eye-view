import test from 'node:test';
import assert from 'node:assert/strict';
import { createSatelliteSource } from './source.js';
import { createSatellitesLayer } from './index.js';

test('satellite sources confine catalog groups and reject a cancelled body', async () => {
  const controller = new AbortController();
  let requests = 0;
  const source = createSatelliteSource({
    fetchImpl: async (url) => {
      requests++;
      assert.equal(url, '/api/celestrak/stations');
      return {
        ok: true,
        status: 200,
        text: async () => {
          controller.abort();
          return 'late catalog';
        },
      };
    },
  });
  await assert.rejects(
    source.readGroup('../active'),
    /Unknown satellite group/,
  );
  assert.equal(requests, 0);
  await assert.rejects(
    source.readGroup('stations', { signal: controller.signal }),
    { name: 'AbortError' },
  );
});

test('satellite factories keep control state separate and construct without requests', () => {
  const source = {
    readGroup() {
      assert.fail('construction fetched a catalog');
    },
  };
  const services = Object.fromEntries(
    [
      'picking',
      'focus',
      'readout',
      'overlays',
      'context',
      'render',
      'layerState',
    ].map((key) => [key, {}]),
  );
  services.layerState.isExplicitLayerStateOrigin = () => false;
  const first = createSatellitesLayer({ source, services });
  const second = createSatellitesLayer({ source, services });
  first.setParams({ showPoints: false });
  assert.equal(first.getParams().showPoints, false);
  assert.equal(second.getParams().showPoints, true);
  assert.notEqual(first.getStats(), second.getStats());
});

function headerBag(values) {
  return { get: (name) => values[name.toLowerCase()] ?? null };
}

test('satellite sources request OMM JSON and report proxy provenance', async () => {
  const urls = [];
  const source = createSatelliteSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        headers: headerBag({
          'content-type': 'application/json',
          'x-tle-cache': 'STALE-ERROR',
          'x-tle-fetched-at': '1790000000000',
        }),
        text: async () => '[{"NORAD_CAT_ID":25544}]',
      };
    },
  });
  const result = await source.readGroup('stations', { format: 'omm' });
  assert.deepEqual(urls, ['/api/celestrak/stations?FORMAT=json']);
  assert.equal(result.ok, true);
  assert.equal(result.format, 'omm');
  assert.equal(result.body, '[{"NORAD_CAT_ID":25544}]');
  assert.equal(result.text, result.body);
  assert.equal(result.cacheStatus, 'STALE-ERROR');
  assert.equal(result.fetchedAt, 1790000000000);
});

test('satellite sources keep TLE as the default and report absent provenance', async () => {
  const urls = [];
  const source = createSatelliteSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: true, status: 200, text: async () => '1 25544U' };
    },
  });
  const result = await source.readGroup('starlink');
  assert.deepEqual(urls, ['/api/celestrak/starlink']);
  assert.equal(result.format, 'tle');
  assert.equal(result.cacheStatus, 'NONE');
  assert.equal(result.fetchedAt, null);
});

test('satellite sources report the format actually received', async () => {
  const reply = (contentType, text) => ({
    ok: true,
    status: 200,
    headers: headerBag(contentType ? { 'content-type': contentType } : {}),
    text: async () => text,
  });
  const cases = [
    ['text/plain; charset=utf-8', 'ISS\n1 25544U\n2 25544', 'tle'],
    [null, 'ISS\n1 25544U\n2 25544', 'tle'],
    [null, ' [{"NORAD_CAT_ID":25544}]', 'omm'],
    ['application/json', '[]', 'omm'],
  ];
  for (const [contentType, text, expected] of cases) {
    const source = createSatelliteSource({
      fetchImpl: async () => reply(contentType, text),
    });
    const result = await source.readGroup('visual', { format: 'omm' });
    assert.equal(result.format, expected, `${contentType} ${text}`);
  }
});

test('satellite sources reject unknown formats before any request', async () => {
  let requests = 0;
  const source = createSatelliteSource({
    fetchImpl: async () => {
      requests++;
      return { ok: true, status: 200, text: async () => '' };
    },
  });
  for (const format of ['json', 'xml', 'OMM'])
    await assert.rejects(
      source.readGroup('visual', { format }),
      /Unknown satellite element format/,
    );
  assert.equal(requests, 0);
});

test('satellite sources accept the cubesat group', async () => {
  const urls = [];
  const source = createSatelliteSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return { ok: false, status: 502, text: async () => 'down' };
    },
  });
  const result = await source.readGroup('cubesat', { format: 'omm' });
  assert.deepEqual(urls, ['/api/celestrak/cubesat?FORMAT=json']);
  assert.equal(result.ok, false);
  assert.equal(result.body, '');
  assert.equal(result.format, 'omm');
});

test('core ingestion parses a format-less source reply as the requested OMM', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const omm = JSON.stringify([
    {
      OBJECT_NAME: 'ISS (ZARYA)',
      OBJECT_ID: '1998-067A',
      EPOCH: '2026-09-24T03:24:21.452544',
      MEAN_MOTION: 15.49258637,
      ECCENTRICITY: 0.00046914,
      INCLINATION: 51.6318,
      RA_OF_ASC_NODE: 170.3464,
      ARG_OF_PERICENTER: 174.6338,
      MEAN_ANOMALY: 185.4701,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: 25544,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 58709,
      BSTAR: 0.00018115501,
      MEAN_MOTION_DOT: 9.634e-5,
      MEAN_MOTION_DDOT: 0,
    },
  ]);
  const requested = [];
  // A custom source (e.g. a test double or an older adapter) that does not
  // report `format`: the core group must fall back to CORE_ELEMENT_FORMAT.
  const source = {
    async readGroup(group, { format } = {}) {
      requested.push(format);
      return group === 'stations'
        ? { ok: true, status: 200, text: omm, body: omm }
        : { ok: false, status: 502, text: '', body: '' };
    },
  };
  const services = Object.fromEntries(
    [
      'picking',
      'focus',
      'readout',
      'overlays',
      'context',
      'render',
      'layerState',
    ].map((key) => [key, {}]),
  );
  services.layerState.isExplicitLayerStateOrigin = () => false;
  const layer = createSatellitesLayer({ source, services });
  layer._setDenseCatalogStateForTest({});
  t.after(() => layer._clearDenseCatalogStateForTest());
  const viewer = { scene: { primitives: { add: (p) => p, remove() {} } } };
  await layer.update(viewer);
  assert.ok(requested.every((format) => format === 'omm'));
  assert.equal(layer._catalogGroupForTest(25544), 'stations');
  assert.equal(layer.getStats().count, 1);
});
