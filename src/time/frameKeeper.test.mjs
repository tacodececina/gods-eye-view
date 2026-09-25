import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { FRAME_RETRY_MS, createFrameKeeper } from './frames.js';

const EPOCH = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');
// addSeconds: JulianDate.addDays no normaliza días fraccionarios.
const at = (days) =>
  Cesium.JulianDate.addSeconds(EPOCH, days * 86_400, new Cesium.JulianDate());
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Transforms falso: la matriz existe solo dentro de lo precargado. */
function fakeTransforms() {
  const loaded = [];
  const calls = { preload: [], teme: 0 };
  const pending = [];
  return {
    calls,
    pending,
    computeIcrfToFixedMatrix: (time, result) =>
      loaded.some((i) => Cesium.TimeInterval.contains(i, time))
        ? Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY, result)
        : undefined,
    computeTemeToPseudoFixedMatrix: () => {
      calls.teme += 1;
    },
    preloadIcrfFixed(interval) {
      calls.preload.push(interval);
      return new Promise((resolve, reject) =>
        pending.push({
          resolve: () => {
            loaded.push(interval);
            resolve();
          },
          reject,
        }),
      );
    },
  };
}

function setup() {
  const transforms = fakeTransforms();
  const clock = { wallMs: 0 };
  const changes = [];
  const keeper = createFrameKeeper({
    transforms,
    now: () => clock.wallMs,
    onChange: (status) => changes.push(status),
  });
  return { transforms, clock, changes, keeper };
}

test('precarga ±1 d al primer uso, una sola en vuelo, y avisa al quedar lista', async () => {
  const { transforms, changes, keeper } = setup();
  assert.equal(
    keeper.icrfToFixed(EPOCH, new Cesium.Matrix3()).status,
    'unavailable',
  );
  keeper.check(EPOCH);
  keeper.check(EPOCH);
  assert.equal(keeper.status(), 'loading');
  assert.equal(transforms.calls.preload.length, 1);
  transforms.pending[0].resolve();
  await flush();
  assert.equal(keeper.status(), 'ok');
  assert.deepEqual(changes, ['ok']);
  assert.equal(keeper.icrfToFixed(EPOCH, new Cesium.Matrix3()).status, 'ok');
  assert.equal(transforms.calls.teme, 0);
});

test('re-precarga al acercarse al borde del intervalo (reloj simulado o seek), no antes', async () => {
  const { transforms, keeper } = setup();
  keeper.check(EPOCH);
  transforms.pending[0].resolve();
  await flush();
  keeper.check(at(0.4));
  assert.equal(transforms.calls.preload.length, 1, 'dentro del margen');
  keeper.check(at(0.6));
  assert.equal(transforms.calls.preload.length, 2, 'cerca del borde');
  const next = transforms.calls.preload[1];
  assert.ok(Cesium.TimeInterval.contains(next, at(1.5)));
  keeper.check(at(400));
  assert.equal(transforms.calls.preload.length, 2, 'una sola en vuelo');
});

test('si la precarga falla queda «unavailable» y solo reintenta tras FRAME_RETRY_MS', async () => {
  const { transforms, clock, changes, keeper } = setup();
  keeper.check(EPOCH);
  transforms.pending[0].reject(new Error('XYS 404'));
  await flush();
  assert.equal(keeper.status(), 'unavailable');
  assert.deepEqual(changes, ['unavailable']);
  keeper.check(EPOCH);
  assert.equal(transforms.calls.preload.length, 1);
  clock.wallMs = FRAME_RETRY_MS;
  keeper.check(EPOCH);
  assert.equal(transforms.calls.preload.length, 2);
});

test('destroy: una precarga tardía no avisa ni cambia el estado', async () => {
  const { transforms, changes, keeper } = setup();
  keeper.check(EPOCH);
  keeper.destroy();
  transforms.pending[0].resolve();
  await flush();
  assert.deepEqual(changes, []);
  keeper.check(at(5));
  assert.equal(transforms.calls.preload.length, 1);
});
