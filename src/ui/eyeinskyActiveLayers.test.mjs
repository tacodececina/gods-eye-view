import assert from 'node:assert/strict';
import test from 'node:test';
import { REGISTERED_LAYER_IDS } from '../data/layerState.js';
import {
  activeLayersHeading,
  deriveActiveLayers,
} from './eyeinskyActiveLayers.js';
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

test('P5-11: en simulación las capas en vivo suspendidas se listan con «Sin histórico: solo hora real»', () => {
  const rows = deriveActiveLayers(
    [
      { id: 'flights', name: 'Flights', enabled: false },
      { id: 'moon', name: 'Luna', enabled: true },
      { id: 'cctv', name: 'CCTV', enabled: false },
    ],
    ['flights'],
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.suspended, row.note]),
    [
      ['moon', false, null],
      ['flights', true, 'Sin histórico: solo hora real'],
    ],
  );
});

// ─── Fase visual T3 · capas en línea (§6.5) ───

test('T3: cada fila lleva un swatch semántico por familia (sismos ámbar, satélites y Luna paper)', () => {
  const rows = deriveActiveLayers([
    { id: 'earthquakes', name: 'Sismos USGS', enabled: true },
    { id: 'satellites', name: 'Satélites', enabled: true },
    { id: 'moon', name: 'Luna', enabled: true },
    { id: 'flights', name: 'Vuelos', enabled: true },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.id, row.swatch]),
    [
      ['earthquakes', 'amber'],
      ['satellites', 'paper'],
      ['moon', 'paper'],
      ['flights', 'live'],
    ],
  );
});

test('T3 (D3): la fila USGS lleva el estado de la fuente y abre Señales', () => {
  const [row] = deriveActiveLayers(
    [{ id: 'earthquakes', name: 'Sismos USGS', enabled: true }],
    [],
    { earthquakes: { count: 12, state: 'USGS · Actualizado' } },
  );
  assert.equal(row.count, 12);
  assert.equal(row.note, 'USGS · Actualizado');
  assert.equal(row.opens, 'signals');
  const [plain] = deriveActiveLayers([
    { id: 'flights', name: 'Vuelos', enabled: true },
  ]);
  assert.equal(plain.count, null, 'sin denominador ni conteo inventado');
  assert.equal(plain.opens, null);
});

test('T3: la cabecera dice «Capas en escena · N» y el vacío no se pinta en reposo', () => {
  assert.equal(activeLayersHeading(0), 'Capas en escena · 0');
  assert.equal(activeLayersHeading(3), 'Capas en escena · 3');
});
