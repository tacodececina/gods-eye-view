import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  celestialFor,
  createCelestialService,
  releaseCelestial,
} from './celestialService.js';

const TIME = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');
const identity = {
  computeIcrfToFixedMatrix: (_t, r) =>
    Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY, r),
};

/** Fuente lunar falsa que cuenta evaluaciones y avisa cuando «carga». */
function fakeSource() {
  const calls = { position: 0 };
  let notify = () => {};
  return {
    calls,
    load: () => notify(),
    create: ({ onChange }) => {
      notify = onChange;
      return {
        moonPosition: (_t, r) => {
          calls.position += 1;
          return {
            status: 'ok',
            position: Object.assign(r, { x: 384_400, y: 1, z: 2 }),
            source: 'DE441',
            validFrom: 0,
            validTo: 1,
          };
        },
        destroy: () => {
          calls.destroyed = true;
        },
      };
    },
  };
}

test('un mismo instante se calcula una vez y todos leen el mismo estado', () => {
  const source = fakeSource();
  const service = createCelestialService({
    createSource: source.create,
    transforms: identity,
  });
  const a = service.at(TIME);
  const b = service.at(Cesium.JulianDate.clone(TIME));
  assert.equal(a, b);
  assert.equal(source.calls.position, 1);
  assert.equal(a.status, 'ok');
  service.at(Cesium.JulianDate.addSeconds(TIME, 1, new Cesium.JulianDate()));
  assert.equal(source.calls.position, 2);
});

test('un estado no «ok» no se cachea (el marco o la tabla pueden llegar en el mismo instante)', () => {
  const source = fakeSource();
  let loaded = false;
  const service = createCelestialService({
    createSource: source.create,
    transforms: {
      computeIcrfToFixedMatrix: (_t, r) =>
        loaded ? Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY, r) : undefined,
    },
  });
  assert.equal(service.at(TIME).status, 'unavailable');
  loaded = true;
  assert.equal(service.at(TIME).status, 'ok');
});

test('cuando la fuente carga se invalida la caché y se avisa a los suscriptores', () => {
  const source = fakeSource();
  const service = createCelestialService({
    createSource: source.create,
    transforms: identity,
  });
  const seen = [];
  const off = service.subscribe(() => seen.push('change'));
  service.at(TIME);
  source.load();
  service.at(TIME);
  assert.equal(source.calls.position, 2);
  assert.deepEqual(seen, ['change']);
  off();
  source.load();
  assert.deepEqual(seen, ['change']);
});

test('un servicio por viewer; release lo destruye', () => {
  const viewer = {};
  const source = fakeSource();
  const options = { createSource: source.create, transforms: identity };
  const service = celestialFor(viewer, options);
  assert.equal(celestialFor(viewer, options), service);
  releaseCelestial(viewer);
  releaseCelestial(viewer);
  assert.equal(source.calls.destroyed, true);
  assert.notEqual(celestialFor(viewer, options), service);
  releaseCelestial(viewer);
});

test('sunFixedAt da el Sol sin pedir la Luna (el HUD no descarga la tabla)', () => {
  const source = fakeSource();
  const service = createCelestialService({
    createSource: source.create,
    transforms: identity,
  });
  const sun = service.sunFixedAt(TIME, new Cesium.Cartesian3());
  assert.ok(Cesium.Cartesian3.magnitude(sun) > 1.4e11);
  assert.equal(source.calls.position, 0);
  const noFrame = createCelestialService({
    createSource: source.create,
    transforms: { computeIcrfToFixedMatrix: () => undefined },
  });
  assert.equal(noFrame.sunFixedAt(TIME, new Cesium.Cartesian3()), null);
});

test('tras releaseCelestial, el HUD/anillo no recrean un servicio huérfano', () => {
  const viewer = {};
  let created = 0;
  const source = fakeSource();
  const options = {
    createSource: (hooks) => {
      created += 1;
      return source.create(hooks);
    },
    transforms: identity,
  };
  celestialFor(viewer, options).at(TIME);
  releaseCelestial(viewer);
  const late = celestialFor(viewer, options);
  assert.equal(created, 1, 'no se crea otra fuente lunar');
  const state = late.at(TIME);
  assert.equal(state.status, 'unavailable');
  assert.equal(state.reason, 'released');
  assert.equal(late.sunFixedAt(TIME, new Cesium.Cartesian3()), null);
  const off = late.subscribe(() => assert.fail('no avisa'));
  off();
  late.destroy();
  assert.equal(celestialFor(viewer, options), late, 'siempre el mismo inerte');
  assert.equal(created, 1);
});
