import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';
import * as Cesium from 'cesium';
import {
  LIGHT_SPEED_KM_S,
  createCelestialResult,
  createCelestialStateReader,
} from './celestialState.js';
import {
  installNodeXys,
  loadRepoMoonTable,
} from '../../testSupport/xysForTests.mjs';
import { ensureIcrfFixed } from '../../time/frames.js';
import { utcIsoToTdbSeconds } from '../../time/timeScales.js';

const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../data/fixtures/${name}`, import.meta.url),
      'utf8',
    ),
  );
const PHASE = read('moon-horizons-phase.json');
const ICRF = read('moon-horizons-icrf.json');

let restoreXys;
before(() => {
  restoreXys = installNodeXys();
});
after(() => restoreXys());

const tableSource = async () => {
  const table = await loadRepoMoonTable();
  return (tdb, result) => table.moonPositionIcrf(tdb, result);
};

test('estado celeste en las épocas del fixture: Luna DE441, marco XYS, fase ±1 % y distancia', async () => {
  const getCelestialState = createCelestialStateReader({
    moonPosition: await tableSource(),
  });
  const result = createCelestialResult();
  for (const row of PHASE.rows) {
    const time = Cesium.JulianDate.fromIso8601(row.utcIso);
    assert.equal((await ensureIcrfFixed(time)).status, 'ok');
    const state = getCelestialState(time, result);
    assert.equal(state, result, 'reutiliza el resultado');
    assert.equal(state.status, 'ok');
    assert.equal(state.source, 'DE441');
    const ref = ICRF.icrfUt.rows.find((r) => r.utcIso === row.utcIso).rKm;
    assert.ok(Math.abs(state.distanceKm - Math.hypot(...ref)) < 1);
    assert.ok(
      Math.abs(state.lightSeconds - state.distanceKm / LIGHT_SPEED_KM_S) <
        1e-12,
    );
    assert.ok(Math.abs(state.phaseFraction * 100 - row.illuPct) <= 1);
    assert.ok(
      Math.abs(state.apparentDiameterDeg * 3600 - row.angDiamArcsec) < 2,
    );
    assert.equal(typeof state.phaseName, 'string');
    assert.ok(
      Cesium.Matrix3.equals(
        state.icrfToFixed,
        Cesium.Transforms.computeIcrfToFixedMatrix(time),
      ),
      'expone la matriz ICRF→ITRF usada (para la pose)',
    );
    const fixedKm = Cesium.Cartesian3.magnitude(state.moonFixedM) / 1000;
    assert.ok(Math.abs(fixedKm - state.distanceKm) < 1e-6, 'm = km·1000');
    assert.ok(Cesium.Cartesian3.magnitude(state.sunFixedM) > 1.4e11);
    assert.equal(state.validity.validFrom, 662_731_200);
  }
});

test('P5-03: el punto sublunar (con tiempo de luz) queda a ≤ 0,1′ del aparente de Horizons ITRF93 (el geométrico daba 0,64′)', async () => {
  const getCelestialState = createCelestialStateReader({
    moonPosition: await tableSource(),
  });
  const result = createCelestialResult();
  for (const row of ICRF.subMoonItrf.rows) {
    const time = Cesium.JulianDate.fromIso8601(row.utcIso);
    await ensureIcrfFixed(time);
    const { subLunarLonLat } = getCelestialState(time, result);
    const dLon =
      ((subLunarLonLat.lonDeg - row.apparentLonDeg + 540) % 360) - 180;
    const dLat = subLunarLonLat.latDeg - row.apparentLatDeg;
    const arcmin =
      Math.hypot(dLon * Math.cos((row.apparentLatDeg * Math.PI) / 180), dLat) *
      60;
    assert.ok(arcmin <= 0.1, `${row.utcIso}: ${arcmin.toFixed(3)}′`);
  }
});

/** Transforms sin datos XYS y con TEME envenenado. */
const noFrame = () => ({
  computeIcrfToFixedMatrix: () => undefined,
  computeTemeToPseudoFixedMatrix: () => {
    throw new Error('TEME prohibido');
  },
});
const identityFrame = () => ({
  computeIcrfToFixedMatrix: (_t, r) =>
    Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY, r),
});
const TIME = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');

test('sin marco: estado «unavailable» (frame), sin TEME ni posiciones', () => {
  let asked = 0;
  const getCelestialState = createCelestialStateReader({
    moonPosition: () => {
      asked += 1;
      return { status: 'ok' };
    },
    transforms: noFrame(),
  });
  const state = getCelestialState(TIME, createCelestialResult());
  assert.equal(state.status, 'unavailable');
  assert.equal(state.reason, 'frame');
  assert.equal(state.sun, 'unavailable');
  assert.equal(state.moon, 'unavailable');
  assert.equal(asked, 0);
});

test('Luna fuera de rango (sin respaldo): el Sol sigue y la ausencia se declara', () => {
  const getCelestialState = createCelestialStateReader({
    moonPosition: () => ({
      status: 'out-of-range',
      validFrom: 1,
      validTo: 2,
      source: 'DE441',
    }),
    transforms: identityFrame(),
  });
  const state = getCelestialState(TIME, createCelestialResult());
  assert.equal(state.status, 'out-of-range');
  assert.equal(state.sun, 'ok');
  assert.equal(state.moon, 'out-of-range');
  assert.deepEqual(state.validity, { validFrom: 1, validTo: 2 });
  assert.equal(state.source, null);
  assert.ok(Number.isNaN(state.distanceKm));
});

test('Luna por el respaldo: fuente astronomy-engine con tolerancia y rango de la tabla', () => {
  const getCelestialState = createCelestialStateReader({
    moonPosition: (_t, r) => ({
      status: 'ok',
      position: Object.assign(r, { x: 384_400, y: 0, z: 0 }),
      source: 'astronomy-engine',
      toleranceKm: 20,
      tableRange: { validFrom: 1, validTo: 2, source: 'DE441' },
    }),
    transforms: identityFrame(),
  });
  const state = getCelestialState(TIME, createCelestialResult());
  assert.equal(state.status, 'ok');
  assert.equal(state.source, 'astronomy-engine');
  assert.deepEqual(state.validity, {
    toleranceKm: 20,
    tableRange: { validFrom: 1, validTo: 2, source: 'DE441' },
  });
  assert.equal(state.moonFixedM.x, 384_400_000);
});

test('Luna cargando: unavailable con motivo y el Sol disponible', () => {
  const getCelestialState = createCelestialStateReader({
    moonPosition: () => ({ status: 'unavailable', reason: 'loading' }),
    transforms: identityFrame(),
  });
  const state = getCelestialState(TIME, createCelestialResult());
  assert.equal(state.status, 'unavailable');
  assert.equal(state.reason, 'loading');
  assert.equal(state.sun, 'ok');
});

test('rechaza lo que no es JulianDate', () => {
  const getCelestialState = createCelestialStateReader({
    moonPosition: () => ({ status: 'unavailable' }),
    transforms: identityFrame(),
  });
  assert.throws(
    () => getCelestialState('2026-09-25', createCelestialResult()),
    TypeError,
  );
});
