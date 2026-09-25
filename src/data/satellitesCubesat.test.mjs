import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import satellitesLayer, {
  _catalogGroupForTest,
  _clearDenseCatalogStateForTest,
  _setDenseCatalogStateForTest,
} from './satellites.js';
import {
  SATELLITE_CLASSES,
  SATELLITE_CLASS_ORDER,
  satelliteClassLabel,
  satelliteClassOf,
} from './satelliteClass.js';
import { CATALOG_GROUPS, POINT_STYLES } from '../layers/satellites/policy.js';
import {
  loadSatelliteManifest,
  resolveSatelliteModel,
} from '../layers/satellites/modelRegistry.js';

// P4-18: the CubeSat 1U family model applies only to the CelesTrak `cubesat`
// group, never to `stations` and never by name.
const ISS_LINES = [
  '1 25544U 98067A   26267.14191496  .00009634  00000+0  18116-3 0  9999',
  '2 25544  51.6318 170.3464 0004691 174.6338 185.4701 15.49258637587098',
];
const tleAs = (satnum, name) =>
  [
    name,
    ISS_LINES[0].replace('25544U', `${satnum}U`),
    ISS_LINES[1].replace('2 25544', `2 ${satnum}`),
  ].join('\n');

const FEEDS = {
  '/api/celestrak/stations': tleAs('25544', 'ISS (ZARYA)'),
  // The ISS is listed again under cubesat to prove stations keeps it.
  '/api/celestrak/cubesat': [
    tleAs('25544', 'ISS (ZARYA)'),
    tleAs('43013', 'FIXTURE CUBESAT'),
  ].join('\n'),
  '/api/celestrak/visual': [
    tleAs('43013', 'FIXTURE CUBESAT'),
    tleAs('33333', 'CUBESAT LOOKALIKE'),
  ].join('\n'),
};

const pathOf = (url) => new URL(String(url), 'http://fixture.invalid').pathname;

test('cubesat is a catalog group after stations, with its own class and point style', () => {
  const tags = CATALOG_GROUPS.map((group) => group.tag);
  assert.deepEqual(
    CATALOG_GROUPS.find((group) => group.tag === 'cubesat'),
    { tag: 'cubesat', path: 'cubesat' },
  );
  assert.ok(tags.indexOf('stations') < tags.indexOf('cubesat'));
  assert.equal(satelliteClassOf('cubesat').klass, 'cubesat');
  assert.equal(satelliteClassLabel('cubesat'), 'CUBESAT');
  assert.ok(SATELLITE_CLASS_ORDER.includes('cubesat'));
  assert.ok(POINT_STYLES.cubesat, 'cubesat has a point style');
  assert.equal(
    POINT_STYLES.cubesat.color.toCssHexString(),
    SATELLITE_CLASSES.cubesat.color,
  );
});

test('dedupe keeps the ISS in stations and the CubeSat family only in cubesat', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url) => ({
    ok: true,
    status: 200,
    text: async () => FEEDS[pathOf(url)] ?? '',
  }));
  const manifest = loadSatelliteManifest(
    readFileSync(
      new URL('../../public/models/satellites/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  try {
    _setDenseCatalogStateForTest({});
    const viewer = { scene: { primitives: { add: (p) => p, remove() {} } } };
    await satellitesLayer.update(viewer);
    assert.equal(_catalogGroupForTest(25544), 'stations');
    assert.equal(_catalogGroupForTest(43013), 'cubesat');
    assert.equal(_catalogGroupForTest(33333), 'visual');
    const modelOf = (noradId, name) =>
      resolveSatelliteModel(
        { noradId, group: _catalogGroupForTest(noradId), name },
        manifest.assets,
      )?.id ?? null;
    assert.equal(modelOf(25544, 'ISS (ZARYA)'), 'nasa-iss');
    assert.equal(modelOf(43013, 'FIXTURE CUBESAT'), 'nasa-cubesat-1u');
    assert.equal(modelOf(33333, 'CUBESAT LOOKALIKE'), null);
  } finally {
    _clearDenseCatalogStateForTest();
  }
});
