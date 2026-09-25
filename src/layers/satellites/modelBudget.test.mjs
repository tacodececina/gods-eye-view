import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SAT_MODEL_PROFILES,
  assetFitsProfile,
  profileOverrideFromSearch,
  selectProfile,
} from './modelBudget.js';
import { loadSatelliteManifest } from './modelRegistry.js';

const MIB = 1024 * 1024;
const { assets } = loadSatelliteManifest(
  readFileSync(
    new URL('../../../public/models/satellites/manifest.json', import.meta.url),
    'utf8',
  ),
);
const byId = Object.fromEntries(assets.map((asset) => [asset.id, asset]));

test('profiles carry the approved caps and are immutable', () => {
  assert.deepEqual(SAT_MODEL_PROFILES.std, {
    name: 'std',
    cap: 2,
    triangles: 60000,
    primitives: 12,
    textureMaxEdge: 1024,
    gpuBytes: 6 * MIB,
    totalGpuBytes: 10 * MIB,
  });
  assert.deepEqual(SAT_MODEL_PROFILES.low, {
    name: 'low',
    cap: 1,
    triangles: 30000,
    primitives: 8,
    textureMaxEdge: 512,
    gpuBytes: 2 * MIB,
    totalGpuBytes: 2 * MIB,
  });
  assert.equal(SAT_MODEL_PROFILES.off.cap, 0);
  assert.equal(Object.isFrozen(SAT_MODEL_PROFILES), true);
  assert.equal(Object.isFrozen(SAT_MODEL_PROFILES.std), true);
});

test('selectProfile honours the override, then falls back to device signals', () => {
  const desktop = {
    coarsePointer: false,
    viewportWidth: 1920,
    deviceMemory: 16,
  };
  assert.equal(selectProfile(desktop).name, 'std');
  assert.equal(selectProfile({ ...desktop, coarsePointer: true }).name, 'low');
  assert.equal(selectProfile({ ...desktop, viewportWidth: 650 }).name, 'low');
  assert.equal(selectProfile({ ...desktop, viewportWidth: 651 }).name, 'std');
  assert.equal(selectProfile({ ...desktop, deviceMemory: 4 }).name, 'low');
  assert.equal(
    selectProfile({ ...desktop, deviceMemory: undefined }).name,
    'std',
  );
  assert.equal(selectProfile({ ...desktop, override: 'off' }).name, 'off');
  assert.equal(
    selectProfile({ coarsePointer: true, viewportWidth: 390, override: 'std' })
      .name,
    'std',
  );
  assert.equal(selectProfile({ ...desktop, override: 'ultra' }).name, 'std');
  assert.equal(selectProfile({}).name, 'std');
});

test('the ?satModels override is parsed strictly', () => {
  assert.equal(profileOverrideFromSearch('?satModels=low'), 'low');
  assert.equal(profileOverrideFromSearch('?a=1&satModels=off'), 'off');
  assert.equal(profileOverrideFromSearch('satModels=std'), 'std');
  assert.equal(profileOverrideFromSearch('?satModels=LOW'), null);
  assert.equal(profileOverrideFromSearch('?satModels=ultra'), null);
  assert.equal(profileOverrideFromSearch(''), null);
  assert.equal(profileOverrideFromSearch(undefined), null);
});

test('curated assets follow the recorded budget decisions', () => {
  const { std, low, off } = SAT_MODEL_PROFILES;
  assert.equal(assetFitsProfile(byId['nasa-iss'], std), true);
  assert.equal(assetFitsProfile(byId['nasa-iss'], low), true);
  assert.equal(
    assetFitsProfile(byId['nasa-hubble'], std),
    true,
    'std exception',
  );
  assert.equal(assetFitsProfile(byId['nasa-hubble'], low), false, 'no-model');
  assert.equal(assetFitsProfile(byId['nasa-cubesat-1u'], std), true);
  assert.equal(assetFitsProfile(byId['nasa-cubesat-1u'], low), true);
  for (const asset of assets) assert.equal(assetFitsProfile(asset, off), false);
});

test('without a recorded exception, measurements must fit every cap', () => {
  const { std } = SAT_MODEL_PROFILES;
  const fits = {
    triangles: 100,
    primitives: 1,
    textureMaxEdge: 0,
    gpuBytesEstimate: 1000,
  };
  assert.equal(assetFitsProfile(fits, std), true);
  for (const patch of [
    { triangles: 60001 },
    { primitives: 13 },
    { textureMaxEdge: 2048 },
    { gpuBytesEstimate: 6 * MIB + 1 },
    { gpuBytesEstimate: undefined },
    { triangles: NaN },
  ])
    assert.equal(
      assetFitsProfile({ ...fits, ...patch }, std),
      false,
      JSON.stringify(patch),
    );
  const recordedFail = {
    ...fits,
    primitives: 13,
    budget: { std: { ok: false } },
  };
  assert.equal(assetFitsProfile(recordedFail, std), false);
  const noModel = {
    ...fits,
    budget: { std: { ok: true, decision: 'no-model' } },
  };
  assert.equal(assetFitsProfile(noModel, std), false);
});
