import assert from 'node:assert/strict';
import test from 'node:test';
import { REGISTERED_LAYER_IDS } from '../data/layerState.js';
import { deriveActiveLayers } from './eyeinskyActiveLayers.js';
import { EYE_LAYER_GUIDE } from './eyeinskyCatalog.js';

test('the catalog guide covers every runtime layer with usable disclosure copy', () => {
  assert.deepEqual(
    Object.keys(EYE_LAYER_GUIDE).sort(),
    [...REGISTERED_LAYER_IDS].sort(),
  );
  for (const id of REGISTERED_LAYER_IDS) {
    const row = EYE_LAYER_GUIDE[id];
    assert.ok(row.icon && row.description.length > 20, `${id} description`);
    assert.ok(row.coverage.length > 20, `${id} coverage`);
    assert.ok(row.access.length > 20, `${id} access`);
  }
});

test('the active list derives every enabled ID, including local datacenters', () => {
  const rows = deriveActiveLayers([
    { id: 'flights', name: 'Flights', enabled: false },
    { id: 'local-datacenters', name: 'Datacenters', enabled: true },
    { id: 'satellites', name: 'Satellites', enabled: true },
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ['local-datacenters', 'satellites'],
  );
});
