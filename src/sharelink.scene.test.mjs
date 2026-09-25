/**
 * P5 T9 — ShareLinkManager lleva el reloj de escena y la escala lunar con
 * tokens nuevos (`t`, `tr`, `lm`) que no pisan ningún parámetro existente, y
 * la restauración del enlace los aplica por el aplicador de escena.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ShareLinkManager } from './sharelink.js';
import { createDefaultLayerState } from './data/layerState.js';
import { SCENE_SHARE_KEYS } from './sharelinkScene.js';

function makeManager(hash = '') {
  globalThis.window = { location: { hash, href: `http://localhost/${hash}` } };
  globalThis.history = { replaceState() {} };
  const viewer = {
    camera: {
      changed: { addEventListener: () => () => {} },
      positionCartographic: { latitude: 0.3, longitude: -1.7, height: 2e7 },
      heading: 0,
      pitch: -Math.PI / 2,
      roll: 0,
      flyTo() {},
    },
  };
  return new ShareLinkManager(viewer);
}

const SIM = Object.freeze({
  clock: {
    mode: 'simulated',
    multiplier: 3600,
    currentIso: '2027-03-14T06:00:00.000Z',
  },
  moonScale: 'didactic',
});

test('tokens nuevos: t, tr y lm no los usaba ningún parámetro del enlace', () => {
  const manager = makeManager();
  manager.setLayerStateProvider(() => createDefaultLayerState());
  manager.setPanelStateProvider(() => ({
    specs: [{ id: 'control-panel', collapsed: true, pinned: false }],
  }));
  const before = new Set(manager._buildHashParams().keys());
  for (const key of SCENE_SHARE_KEYS) assert.equal(before.has(key), false, key);
  manager.setSceneStateProvider(() => SIM);
  const after = manager._buildHashParams();
  assert.deepEqual(
    [...after.keys()].filter((key) => !before.has(key)),
    ['t', 'tr', 'lm'],
  );
  assert.equal(after.get('t'), '2027-03-14T06:00:00Z');
  assert.equal(after.get('tr'), '3600');
  assert.equal(after.get('lm'), 'd');
  manager.destroy();
});

test('parseInitialHash decodifica el reloj y applyState lo entrega al aplicador', async () => {
  const manager = makeManager(
    '#v=2&lat=10&lon=20&alt=1000&t=2027-03-14T06:00:00Z&tr=600&lm=d',
  );
  const state = manager.parseInitialHash();
  assert.deepEqual(state.scene, {
    time: { mode: 'simulated', iso: '2027-03-14T06:00:00Z', multiplier: 600 },
    timeInvalid: false,
    moonScale: 'didactic',
  });
  const applied = [];
  manager.setSceneApplier((scene) => {
    applied.push(scene);
    return { time: 'applied' };
  });
  const result = await manager.applyState(state, { applyCamera: false });
  assert.deepEqual(applied, [state.scene]);
  assert.equal(result.scene, 'applied');
  manager.destroy();
});

test('enlace antiguo sin t: no toca el reloj (escala física)', async () => {
  const manager = makeManager('#v=2&lat=10&lon=20&alt=1000');
  const state = manager.parseInitialHash();
  assert.deepEqual(state.scene, {
    time: null,
    timeInvalid: false,
    moonScale: 'physical',
  });
  manager.destroy();
});

test('la restauración dice cuando la fecha del enlace se rechaza o abre en pausa', async () => {
  const { ShareRestoration } = await import('./ui/shareRestoration.js');
  const said = [];
  const owner = { showStatus: (text) => said.push(text) };
  for (const outcome of [
    'invalid',
    'out-of-range',
    'fallback',
    'applied',
    'skipped',
  ])
    ShareRestoration.prototype._announceSharedScene.call(owner, outcome);
  assert.deepEqual(said, [
    'Fecha del enlace inválida: el reloj sigue en vivo',
    'Fecha fuera de efemérides: reloj en PAUSA',
    'Fecha fuera de la tabla DE441: Luna por astronomy-engine ≤20 km',
  ]);
});

test('P4-02: un fallo del aplicador de escena no tumba la restauración del enlace', async () => {
  const manager = makeManager('#v=2&lat=10&lon=20&alt=1000&t=live&lm=f');
  const state = manager.parseInitialHash();
  manager.setSceneApplier(() => {
    throw new TypeError("Cannot read properties of null (reading 'hide')");
  });
  const result = await manager.applyState(state, { applyCamera: false });
  assert.equal(result.succeeded, true);
  assert.equal(result.scene, 'failed');
  manager.destroy();
});
