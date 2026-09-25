import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  illuminatedFraction,
  isWaxing,
  phaseName,
  apparentDiameterDeg,
  MOON_MEAN_RADIUS_KM,
} from './lunarPhase.js';
import { loadRepoMoonTable } from '../../testSupport/xysForTests.mjs';
import { utcIsoToTdbSeconds } from '../../time/timeScales.js';

const PHASE = JSON.parse(
  readFileSync(
    new URL('../../data/fixtures/moon-horizons-phase.json', import.meta.url),
    'utf8',
  ),
);

/** Sol (Simon1994, m → km) y Luna (DE441) geocéntricos ICRF en `iso`. */
async function geometry(table, iso) {
  const time = Cesium.JulianDate.fromIso8601(iso);
  const sunM =
    Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
      time,
    );
  const sun = Cesium.Cartesian3.multiplyByScalar(
    sunM,
    1e-3,
    new Cesium.Cartesian3(),
  );
  const moon = table.moonPositionIcrf(
    utcIsoToTdbSeconds(iso),
    new Cesium.Cartesian3(),
  ).position;
  return { sun, moon };
}

test('P5-14: fase = Illu% de Horizons ±1 % en las 10 épocas del fixture', async () => {
  const table = await loadRepoMoonTable();
  assert.equal(PHASE.rows.length, 10);
  for (const row of PHASE.rows) {
    const { sun, moon } = await geometry(table, row.utcIso);
    const pct = illuminatedFraction(sun, moon) * 100;
    assert.ok(
      Math.abs(pct - row.illuPct) <= 1,
      `${row.utcIso}: ${pct.toFixed(3)} % frente a ${row.illuPct} %`,
    );
  }
});

test('diámetro aparente geocéntrico = Ang-diam de Horizons (±0,1 %)', async () => {
  const table = await loadRepoMoonTable();
  assert.equal(MOON_MEAN_RADIUS_KM, 1737.4);
  for (const row of PHASE.rows) {
    const { moon } = await geometry(table, row.utcIso);
    const deg = apparentDiameterDeg(Cesium.Cartesian3.magnitude(moon));
    const horizonsDeg = row.angDiamArcsec / 3600;
    assert.ok(
      Math.abs(deg / horizonsDeg - 1) < 1e-3,
      `${row.utcIso}: ${deg} frente a ${horizonsDeg}`,
    );
  }
});

test('creciente/menguante por la elongación sobre la eclíptica', () => {
  const sun = new Cesium.Cartesian3(1.496e8, 0, 0);
  const ecl = Cesium.Math.toRadians(23.4392911);
  const moonAt = (deg) => {
    const l = Cesium.Math.toRadians(deg);
    // Punto de la eclíptica a longitud l, en ecuatoriales ICRF (km).
    return new Cesium.Cartesian3(
      384_400 * Math.cos(l),
      384_400 * Math.sin(l) * Math.cos(ecl),
      384_400 * Math.sin(l) * Math.sin(ecl),
    );
  };
  assert.equal(isWaxing(sun, moonAt(45)), true);
  assert.equal(isWaxing(sun, moonAt(170)), true);
  assert.equal(isWaxing(sun, moonAt(190)), false);
  assert.equal(isWaxing(sun, moonAt(300)), false);
  const f90 = illuminatedFraction(sun, moonAt(90));
  assert.ok(Math.abs(f90 - 0.5) < 0.01, `cuarto ≈ 50 % (${f90})`);
  assert.ok(illuminatedFraction(sun, moonAt(180)) > 0.99);
  assert.ok(illuminatedFraction(sun, moonAt(0.5)) < 0.01);
});

test('nombres de fase en español, con cortes simétricos', () => {
  const cases = [
    [0.005, true, 'luna nueva'],
    [0.2, true, 'creciente'],
    [0.5, true, 'cuarto creciente'],
    [0.8, true, 'gibosa creciente'],
    [0.995, false, 'luna llena'],
    [0.8, false, 'gibosa menguante'],
    [0.5, false, 'cuarto menguante'],
    [0.2, false, 'menguante'],
  ];
  for (const [fraction, waxing, name] of cases)
    assert.equal(phaseName(fraction, waxing), name, `${fraction} ${waxing}`);
  assert.throws(() => phaseName(Number.NaN, true), RangeError);
  assert.throws(() => phaseName(1.2, true), RangeError);
});

test('vectores degenerados → RangeError, nunca NaN silencioso', () => {
  const zero = new Cesium.Cartesian3();
  const one = new Cesium.Cartesian3(1, 0, 0);
  assert.throws(() => illuminatedFraction(zero, one), RangeError);
  assert.throws(() => illuminatedFraction(one, zero), RangeError);
  assert.throws(() => apparentDiameterDeg(0), RangeError);
});
