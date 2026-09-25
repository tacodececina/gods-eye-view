import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadSatelliteManifest,
  resolveSatelliteModel,
  validateSatelliteModelAsset,
} from './modelRegistry.js';

const MANIFEST_TEXT = readFileSync(
  new URL('../../../public/models/satellites/manifest.json', import.meta.url),
  'utf8',
);

const REVISION = '11ebb4ee043715aefbba6aeec8a61746fad67fa7';
const BASE = Object.freeze({
  id: 'fixture',
  uri: '/models/satellites/fixture-aaaaaaaa.glb',
  fidelity: 'specific',
  noradIds: [25544],
  families: [],
  scaleMeters: 1,
  forwardAxis: '+Z',
  upAxis: '+Y',
  radiusM: 10,
  bytes: 1000,
  sha256: 'a'.repeat(64),
  attitudeMode: 'lvlh-nominal',
  sourceUrl: `https://raw.githubusercontent.com/nasa/NASA-3D-Resources/${REVISION}/3D%20Models/x.glb`,
  sourceRevision: REVISION,
  termsUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
  credit: 'Source: NASA 3D Resources',
});

const loaded = () => {
  const manifest = loadSatelliteManifest(MANIFEST_TEXT);
  assert.equal(manifest.ok, true, manifest.reason);
  return manifest.assets;
};

test('the curated public manifest loads and every entry validates', () => {
  const assets = loaded();
  assert.deepEqual(
    assets.map((asset) => asset.id),
    ['nasa-iss', 'nasa-hubble', 'nasa-cubesat-1u'],
  );
  for (const asset of assets)
    assert.deepEqual(validateSatelliteModelAsset(asset), {
      ok: true,
      reason: null,
    });
  assert.equal(Object.isFrozen(assets), true);
});

test('specific beats family, family needs the exact group, otherwise null', () => {
  const assets = loaded();
  const id = (subject, options) =>
    resolveSatelliteModel(subject, assets, options)?.id ?? null;
  assert.equal(id({ noradId: 25544, group: 'stations' }), 'nasa-iss');
  assert.equal(id({ noradId: 25544, group: 'cubesat' }), 'nasa-iss');
  assert.equal(id({ noradId: '25544', group: 'visual' }), 'nasa-iss');
  assert.equal(id({ noradId: 20580, group: 'visual' }), 'nasa-hubble');
  assert.equal(id({ noradId: 43013, group: 'cubesat' }), 'nasa-cubesat-1u');
  assert.equal(id({ noradId: 25545, group: 'stations' }), null);
  assert.equal(id({ noradId: 43013, group: 'visual' }), null);
  assert.equal(id({ noradId: 44444, group: 'dense' }), null);
  assert.equal(id({ noradId: NaN, group: 'stations' }), null);
});

test('specific assets win even when a family asset is listed first', () => {
  const assets = [
    {
      ...BASE,
      id: 'family',
      fidelity: 'family',
      noradIds: [],
      families: ['stations'],
    },
    { ...BASE, id: 'iss' },
  ];
  assert.equal(
    resolveSatelliteModel({ noradId: 25544, group: 'stations' }, assets).id,
    'iss',
  );
  assert.equal(
    resolveSatelliteModel({ noradId: 25545, group: 'stations' }, assets).id,
    'family',
  );
});

test('geometry is never resolved by name', () => {
  const assets = loaded();
  for (const subject of [
    { noradId: 99999, group: 'visual', name: 'ISS (ZARYA)' },
    { noradId: 99998, group: 'stations', name: 'CUBESAT 1U' },
    { noradId: 99997, group: 'visual', name: 'HST' },
    { noradId: null, group: 'geo', name: 'nasa-iss' },
  ])
    assert.equal(resolveSatelliteModel(subject, assets), null, subject.name);
});

test('the low profile leaves Hubble as a point; off resolves nothing', () => {
  const assets = loaded();
  const id = (subject, profile) =>
    resolveSatelliteModel(subject, assets, { profile })?.id ?? null;
  assert.equal(id({ noradId: 20580, group: 'visual' }, 'std'), 'nasa-hubble');
  assert.equal(id({ noradId: 20580, group: 'visual' }, 'low'), null);
  assert.equal(id({ noradId: 25544, group: 'stations' }, 'low'), 'nasa-iss');
  assert.equal(
    id({ noradId: 43013, group: 'cubesat' }, 'low'),
    'nasa-cubesat-1u',
  );
  for (const noradId of [25544, 20580])
    assert.equal(id({ noradId, group: 'visual' }, 'off'), null);
});

test('validation rejects nonlocal URIs, bad hashes and incomplete rights', () => {
  const reject = (patch, pattern) => {
    const verdict = validateSatelliteModelAsset({ ...BASE, ...patch });
    assert.equal(verdict.ok, false, JSON.stringify(patch));
    assert.match(verdict.reason, pattern);
  };
  for (const uri of [
    'https://example.com/models/satellites/x.glb',
    '//cdn.example.com/models/satellites/x.glb',
    'models/satellites/x.glb',
    '/models/x.glb',
    '/models/satellites/../secrets.glb',
    '/models/satellites/x.glb?v=1',
    '/models/satellites/x.gltf',
  ])
    reject({ uri }, /uri/);
  for (const sha256 of ['a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64), 42])
    reject({ sha256 }, /sha256/);
  for (const bytes of [0, -1, 1.5, '1000']) reject({ bytes }, /bytes/);
  reject({ sourceUrl: BASE.sourceUrl.replace('https:', 'http:') }, /sourceUrl/);
  reject(
    {
      sourceUrl: 'https://github.com/nasa/NASA-3D-Resources/blob/master/x.glb',
    },
    /sourceUrl/,
  );
  reject({ sourceRevision: 'master' }, /sourceRevision/);
  reject({ termsUrl: undefined }, /termsUrl/);
  reject({ termsUrl: 'ftp://nasa.gov/terms' }, /termsUrl/);
  reject({ credit: '  ' }, /credit/);
  reject({ id: '' }, /id/);
});

test('validation rejects bad scale, contradictory axes and unknown modes', () => {
  const reject = (patch, pattern) => {
    const verdict = validateSatelliteModelAsset({ ...BASE, ...patch });
    assert.equal(verdict.ok, false, JSON.stringify(patch));
    assert.match(verdict.reason, pattern);
  };
  for (const scaleMeters of [0, -1, NaN, Infinity])
    reject({ scaleMeters }, /scaleMeters/);
  for (const radiusM of [0, -2, NaN]) reject({ radiusM }, /radiusM/);
  reject({ forwardAxis: 'Z' }, /forwardAxis/);
  reject({ upAxis: '+W' }, /upAxis/);
  reject({ forwardAxis: '+Y', upAxis: '+Y' }, /axes/);
  reject({ forwardAxis: '+Z', upAxis: '-Z' }, /axes/);
  reject({ fidelity: 'generic' }, /fidelity/);
  reject({ noradIds: [] }, /noradIds/);
  reject({ noradIds: [25544.5] }, /noradIds/);
  reject({ noradIds: ['T0002'] }, /noradIds/);
  reject({ fidelity: 'family', noradIds: [], families: [] }, /families/);
  reject({ fidelity: 'family', noradIds: [], families: [''] }, /families/);
  reject({ attitudeMode: 'sun-pointing' }, /attitudeMode/);
  assert.match(validateSatelliteModelAsset(null).reason, /object/);
});

test('one invalid entry rejects the whole manifest with a reason', () => {
  const assets = JSON.parse(MANIFEST_TEXT);
  const broken = assets.map((asset, index) =>
    index === 1 ? { ...asset, sha256: 'nope' } : asset,
  );
  const verdict = loadSatelliteManifest(broken);
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.assets, []);
  assert.match(verdict.reason, /nasa-hubble/);
  assert.match(verdict.reason, /sha256/);
});

test('the manifest rejects duplicates, double NORAD claims and non-arrays', () => {
  const assets = JSON.parse(MANIFEST_TEXT);
  const dupId = [
    ...assets,
    { ...assets[0], uri: '/models/satellites/other.glb' },
  ];
  assert.match(loadSatelliteManifest(dupId).reason, /duplicate id/);
  const doubleClaim = [
    ...assets,
    { ...assets[0], id: 'iss-b', uri: '/models/satellites/iss-b.glb' },
  ];
  assert.match(loadSatelliteManifest(doubleClaim).reason, /25544/);
  assert.match(loadSatelliteManifest('{"id":1}').reason, /array/);
  assert.match(loadSatelliteManifest('not json').reason, /JSON/);
  assert.match(loadSatelliteManifest([]).reason, /empty/);
});
