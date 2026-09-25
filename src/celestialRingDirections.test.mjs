import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import * as Cesium from 'cesium';
import { readRingDirections } from './celestialRingDirections.js';
import { createCelestialService } from './layers/moon/celestialService.js';
import { createMoonLayer } from './layers/moon/index.js';
import { ensureIcrfFixed } from './time/frames.js';
import {
  installNodeXys,
  loadRepoMoonTable,
} from './testSupport/xysForTests.mjs';

let restoreXys;
before(() => {
  restoreXys = installNodeXys();
});
after(() => restoreXys());

const TIME = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');

async function realService() {
  const table = await loadRepoMoonTable();
  return createCelestialService({
    createSource: () => ({
      moonPosition: (t, r) => table.moonPositionIcrf(t, r),
    }),
  });
}

function fakeViewer() {
  const list = [];
  return {
    list,
    clock: new Cesium.Clock(),
    scene: {
      moon: { show: false },
      preUpdate: new Cesium.Event(),
      primitives: {
        add: (p) => list.push(p),
        remove: (p) => list.splice(list.indexOf(p), 1).length > 0,
      },
    },
  };
}

test('P5-06: el marcador del anillo y la Luna 3D apuntan igual (≤ 1e-9 rad) con el mismo estado', async () => {
  await ensureIcrfFixed(TIME);
  const service = await realService();
  const viewer = fakeViewer();
  const layer = createMoonLayer({
    render: { hold() {}, release() {}, request() {} },
    documentRef: null,
    createPrimitive: () => ({
      show: false,
      modelMatrix: new Cesium.Matrix4(),
      appearance: { material: { isDestroyed: () => false, destroy() {} } },
      isDestroyed: () => false,
      destroy() {},
    }),
    celestialOf: () => service,
    sceneClockOf: () => ({
      getState: () => ({ mode: 'paused' }),
      subscribe: () => () => {},
    }),
  });
  layer.init(viewer);
  layer.enable();
  viewer.scene.preUpdate.raiseEvent(viewer.scene, TIME);
  const moon = layer.getState().positionFixedM;
  const sun = new Cesium.Cartesian3();
  const ring = new Cesium.Cartesian3();
  const out = readRingDirections(service.at(TIME), sun, ring);
  assert.deepEqual(out, { status: 'ok', moon: 'ok', moonSource: 'DE441' });
  const moonDir = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(moon.x, moon.y, moon.z),
    new Cesium.Cartesian3(),
  );
  const angle = Cesium.Cartesian3.angleBetween(moonDir, ring);
  assert.ok(angle <= 1e-9, `${angle} rad`);
  assert.ok(Math.abs(Cesium.Cartesian3.magnitude(sun) - 1) < 1e-12);
  layer.destroy();
});

test('sin marco el anillo no dibuja (ausencia), sin Luna oculta solo la Luna', () => {
  const sun = new Cesium.Cartesian3();
  const moon = new Cesium.Cartesian3();
  assert.deepEqual(
    readRingDirections({ sun: 'unavailable', moon: 'unavailable' }, sun, moon),
    { status: 'unavailable', moon: 'unavailable', moonSource: null },
  );
  const out = readRingDirections(
    {
      sun: 'ok',
      moon: 'out-of-range',
      sunFixedM: new Cesium.Cartesian3(1.5e11, 0, 0),
    },
    sun,
    moon,
  );
  assert.deepEqual(out, {
    status: 'ok',
    moon: 'out-of-range',
    moonSource: null,
  });
  assert.ok(Cesium.Cartesian3.equals(sun, Cesium.Cartesian3.UNIT_X));
});

test('el anillo ya no tiene su propio reloj: sin JulianDate.now() ni temporizador de 60 s', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('./celestialRing.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /JulianDate\.now\(\)/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.doesNotMatch(source, /celestialEphemeris/);
});
