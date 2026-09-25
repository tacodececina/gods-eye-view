import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFromRecord } from './eyeinskyDossierModel.js';
import {
  isSatelliteContext,
  resolveSatelliteChips,
  resolveSatelliteRail,
} from './eyeinskySatelliteChips.js';
import { satelliteRecord } from '../testSupport/satelliteContextRecord.mjs';

const contextOf = (options) =>
  contextFromRecord(satelliteRecord(options), { kind: 'tracked' });
const texts = (options) =>
  resolveSatelliteChips(contextOf(options)).map(({ text }) => text);

test('ISS: specific NASA model at real scale, approximate attitude', () => {
  assert.deepEqual(texts({ assetId: 'nasa-iss' }), [
    'MODELO · ESPECÍFICO · NASA',
    'ESCALA REAL',
    'ACT. APROX.',
    'ÉPOCA · VIGENTE',
    'CACHÉ · ACIERTO',
  ]);
});

test('CubeSat: family geometry, attitude unknown (illustrative)', () => {
  assert.deepEqual(texts({ assetId: 'nasa-cubesat-1u' }), [
    'MODELO · FAMILIA CUBESAT 1U',
    'ESCALA REAL',
    'ACT. DESCONOCIDA',
    'ÉPOCA · VIGENTE',
    'CACHÉ · ACIERTO',
  ]);
});

test('no curated model: an SGP4 point, no scale and no attitude claims', () => {
  assert.deepEqual(texts({ assetId: null }), [
    'SIN MODELO — punto SGP4',
    'ÉPOCA · VIGENTE',
    'CACHÉ · ACIERTO',
  ]);
});

test('a failed model says so and keeps every other reading', () => {
  const chips = texts({ assetId: 'nasa-iss', modelStatus: 'fallido' });
  assert.equal(chips.at(-1), 'MODELO NO DISPONIBLE');
  assert.ok(chips.includes('ÉPOCA · VIGENTE'));
  assert.deepEqual(
    resolveSatelliteRail(
      contextOf({ assetId: 'nasa-iss', modelStatus: 'fallido' }),
    ).map(({ value }) => value),
    ['418 km', 'vigente', 'NO DISP.'],
  );
});

test('expired elements: no model claimed, the age is flagged', () => {
  const chips = resolveSatelliteChips(
    contextOf({ assetId: 'nasa-iss', ageMs: 30 * 86_400_000 }),
  );
  assert.equal(chips[0].text, 'SIN MODELO — órbita caducada');
  const epoch = chips.find(({ id }) => id === 'epoch');
  assert.deepEqual([epoch.text, epoch.tone], ['ÉPOCA · CADUCADA', 'danger']);
});

test('a stale cache is flagged, and nothing leaks to other layers', () => {
  const cache = resolveSatelliteChips(
    contextOf({ cacheStatus: 'STALE-ERROR' }),
  ).find(({ id }) => id === 'cache');
  assert.deepEqual([cache.text, cache.tone], ['CACHÉ · OBSOLETA', 'warn']);
  const flight = contextFromRecord({
    id: 'ae1fa4',
    layerId: 'flights',
    properties: { name: 'X', framing: 'orbit' },
  });
  assert.equal(isSatelliteContext(flight), false);
  assert.deepEqual(resolveSatelliteChips(flight), []);
  assert.equal(resolveSatelliteRail(flight), null);
});

test('the cache chip reads in Spanish: ACIERTO / FALLO / OBSOLETA / SIN INFORME', () => {
  const cacheChip = (cacheStatus) =>
    resolveSatelliteChips(contextOf({ cacheStatus })).find(
      ({ id }) => id === 'cache',
    );
  assert.deepEqual(
    ['HIT', 'MISS', 'STALE-ERROR', 'NONE'].map((status) => {
      const chip = cacheChip(status);
      return [chip.text, chip.tone];
    }),
    [
      ['CACHÉ · ACIERTO', 'info'],
      ['CACHÉ · FALLO', 'info'],
      ['CACHÉ · OBSOLETA', 'warn'],
      ['CACHÉ · SIN INFORME', 'muted'],
    ],
  );
});

test('the compact rail abbreviates MODELO so it never truncates', () => {
  const railModel = (options) =>
    resolveSatelliteRail(contextOf(options)).at(-1).value;
  assert.equal(railModel({ assetId: 'nasa-iss' }), 'ESPECÍF.');
  assert.equal(railModel({ assetId: 'nasa-cubesat-1u' }), 'FAMILIA');
  assert.equal(railModel({ assetId: null }), 'SIN MODELO');
  assert.equal(
    railModel({ assetId: 'nasa-iss', ageMs: 30 * 86_400_000 }),
    'SIN MODELO',
  );
  assert.equal(
    railModel({ assetId: 'nasa-iss', modelStatus: 'fallido' }),
    'NO DISP.',
  );
  for (const assetId of ['nasa-iss', 'nasa-cubesat-1u', null])
    assert.ok(railModel({ assetId }).length <= 10, 'short enough for 390 px');
});
