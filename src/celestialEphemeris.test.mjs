import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  createCelestialEphemeris,
  createLazyMoonPosition,
} from './celestialEphemeris.js';
import { tdbSecondsFromJ2000 } from './time/timeScales.js';

const TIME = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');
const MOON_KM = Object.freeze({ x: 0, y: 300_000, z: 0 });

/** Transforms falsos: identidad ICRF→Fixed, o ausente hasta precargar. */
function fakeTransforms({ loaded = true } = {}) {
  const calls = { preload: 0, teme: 0 };
  const state = { loaded };
  return {
    calls,
    state,
    computeIcrfToFixedMatrix: (_time, result) =>
      state.loaded
        ? Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY, result)
        : undefined,
    computeTemeToPseudoFixedMatrix: () => {
      calls.teme += 1;
      return Cesium.Matrix3.IDENTITY;
    },
    preloadIcrfFixed: async () => {
      calls.preload += 1;
      await Promise.resolve();
      state.loaded = true;
    },
  };
}

const okMoon =
  (seen = []) =>
  (tdbSeconds, result) => {
    seen.push(tdbSeconds);
    Object.assign(result, MOON_KM);
    return { status: 'ok', position: result, source: 'DE441' };
  };

const out = () => ({
  sun: new Cesium.Cartesian3(),
  moon: new Cesium.Cartesian3(),
});

test('la Luna del anillo sale de moonPosition en TDB y rota con icrfToFixed', () => {
  const seen = [];
  const ephemeris = createCelestialEphemeris({
    moonPosition: okMoon(seen),
    transforms: fakeTransforms(),
  });
  const { sun, moon } = out();
  const sample = ephemeris.sample(TIME, sun, moon);
  assert.equal(sample.status, 'ok');
  assert.equal(sample.moon, 'ok');
  assert.equal(sample.moonSource, 'DE441');
  assert.deepEqual(seen, [tdbSecondsFromJ2000(TIME)]);
  assert.ok(Math.abs(moon.y - 1) < 1e-12, 'dirección unitaria de la Luna');
  assert.ok(Math.abs(Cesium.Cartesian3.magnitude(sun) - 1) < 1e-12);
});

test('sin datos XYS no hay TEME: ausencia, una sola precarga y aviso al quedar lista', async () => {
  const transforms = fakeTransforms({ loaded: false });
  let ready = 0;
  const ephemeris = createCelestialEphemeris({
    moonPosition: okMoon(),
    transforms,
    onFrameReady: () => {
      ready += 1;
    },
  });
  const { sun, moon } = out();
  assert.equal(ephemeris.sample(TIME, sun, moon).status, 'unavailable');
  assert.equal(ephemeris.sample(TIME, sun, moon).status, 'unavailable');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(transforms.calls.preload, 1, 'una precarga en vuelo');
  assert.equal(transforms.calls.teme, 0, 'nunca TEME');
  assert.equal(ready, 1);
  assert.equal(ephemeris.sample(TIME, sun, moon).status, 'ok');
});

test('una Luna ausente se declara ausente sin tapar el Sol', () => {
  const ephemeris = createCelestialEphemeris({
    moonPosition: () => ({ status: 'unavailable' }),
    transforms: fakeTransforms(),
  });
  const { sun, moon } = out();
  const sample = ephemeris.sample(TIME, sun, moon);
  assert.equal(sample.status, 'ok');
  assert.equal(sample.moon, 'unavailable');
  assert.ok(Math.abs(Cesium.Cartesian3.magnitude(sun) - 1) < 1e-12);
});

test('la Luna perezosa usa el respaldo hasta cargar la tabla y luego la tabla', async () => {
  let resolveTable;
  const table = {
    source: 'DE441',
    validFrom: -1e12,
    validTo: 1e12,
    moonPositionIcrf: (t, r) => ({
      status: 'ok',
      position: r,
      source: 'DE441',
    }),
  };
  const fallback = {
    source: 'astronomy-engine',
    moonPositionIcrf: (t, r) => ({
      status: 'ok',
      position: r,
      source: 'astronomy-engine',
    }),
  };
  let loads = 0;
  const moonPosition = createLazyMoonPosition({
    createFallback: () => fallback,
    loadTable: () => {
      loads += 1;
      return new Promise((resolve) => {
        resolveTable = resolve;
      });
    },
  });
  const r = { x: 0, y: 0, z: 0 };
  assert.equal(moonPosition(0, r).source, 'astronomy-engine');
  assert.equal(moonPosition(0, r).source, 'astronomy-engine');
  assert.equal(loads, 1, 'la tabla se pide una vez');
  resolveTable(table);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(moonPosition(0, r).source, 'DE441');
});

test('si la tabla no carga, sigue el respaldo rotulado', async () => {
  const moonPosition = createLazyMoonPosition({
    createFallback: () => ({
      moonPositionIcrf: (t, r) => ({
        status: 'ok',
        position: r,
        source: 'astronomy-engine',
      }),
    }),
    loadTable: () => Promise.reject(new Error('HTTP 404')),
  });
  const r = { x: 0, y: 0, z: 0 };
  moonPosition(0, r);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(moonPosition(0, r).source, 'astronomy-engine');
});
