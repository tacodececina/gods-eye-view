import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  TT_MINUS_TAI_S,
  tdbMinusTtSeconds,
  tdbSecondsFromJ2000,
  ttSecondsFromJ2000,
  utcIsoToTdbSeconds,
} from './timeScales.js';

const SECONDS_PER_DAY = 86_400;
/** «UTC tratado como TDB»: segundos de calendario UTC desde J2000 (el error). */
const naiveUtcSeconds = (iso) =>
  (Date.parse(iso) - Date.UTC(2000, 0, 1, 12)) / 1000;

/*
 * Vectores JPL Horizons DE441 de la evidencia de investigación
 * (output/eyeinsky-p5/ephemeris-eval, consultados 2026-09-24; COMMAND=301,
 * CENTER=500@399, REF_SYSTEM=ICRF, REF_PLANE=FRAME, VEC_CORR=NONE, km, km/s).
 * - dense_301.txt (TIME_TYPE=TDB, sha256 1e283676…48c5): dos filas TDB que
 *   rodean el instante.
 * - horizons_301.txt (TIME_TYPE=UT, sha256 b2935e4e…c2fd): la fila UT del
 *   mismo instante, que es la verdad independiente.
 */
const TDB_ROWS = Object.freeze([
  {
    tdbIso: '2026-09-25T18:30:00Z',
    r: [3.781232140988909e5, -6.146051493347037e4, -1.269038111756388e4],
    v: [1.120054366101709e-1, 9.02782432721691e-1, 4.838901621264264e-1],
  },
  {
    tdbIso: '2026-09-25T19:00:00Z',
    r: [3.783204801920434e5, -5.983479270873609e4, -1.181923290650083e4],
    v: [1.07178117565427e-1, 9.035721767539986e-1, 4.840504317620886e-1],
  },
]);
const UT_ROW = Object.freeze({
  utcIso: '2026-09-25T18:45:00Z',
  r: [3.782305087477635e5, -6.058534631891951e4, -1.222136053963852e4],
});

/** Hermite cúbico entre las dos filas TDB, evaluado en segundos TDB. */
function hermiteMoonKm(tdbSeconds) {
  const [a, b] = TDB_ROWS;
  const ta = naiveUtcSeconds(a.tdbIso); // calendario TDB → s TDB desde J2000
  const h = naiveUtcSeconds(b.tdbIso) - ta;
  const u = (tdbSeconds - ta) / h;
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return [0, 1, 2].map(
    (i) => h00 * a.r[i] + h10 * h * a.v[i] + h01 * b.r[i] + h11 * h * b.v[i],
  );
}

const errorKm = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const errorArcmin = (p, q) => {
  const dot = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const cos = dot / (Math.hypot(...p) * Math.hypot(...q));
  return ((Math.acos(Math.min(1, cos)) * 180) / Math.PI) * 60;
};

test('J2000 TT es 0 s TT y ≈0 s TDB (JulianDate guarda TAI: J2000 TT = TAI −32,184 s)', () => {
  const j2000Tt = new Cesium.JulianDate(
    2451545,
    -TT_MINUS_TAI_S,
    Cesium.TimeStandard.TAI,
  );
  assert.ok(Math.abs(ttSecondsFromJ2000(j2000Tt)) < 1e-9);
  assert.ok(Math.abs(tdbSecondsFromJ2000(j2000Tt)) < 1.7e-3);
});

test('TDB−TT sigue la fórmula de Cesium/SPICE (|·| ≤ 1,7 ms, periodo anual)', () => {
  const amplitude = Math.max(
    ...Array.from({ length: 366 }, (_, day) =>
      Math.abs(tdbMinusTtSeconds(day * SECONDS_PER_DAY)),
    ),
  );
  assert.ok(
    amplitude > 1.6e-3 && amplitude <= 1.658e-3,
    `amplitud ${amplitude}`,
  );
  // Mismo valor que Simon1994PlanetaryPositions (constantes SPICE unitim.c).
  const days = 9_700.25;
  const g = 6.239996 + 0.0172019696544 * days;
  const spice = 1.657e-3 * Math.sin(g + 1.671e-2 * Math.sin(g));
  assert.ok(Math.abs(tdbMinusTtSeconds(days * SECONDS_PER_DAY) - spice) < 1e-9);
});

test('en 2026 TDB − «UTC como TDB» = 32,184 + 37 s (+ TDB−TT): sin sumar 37 s dos veces', () => {
  const iso = '2026-09-25T18:45:00Z';
  const offset = utcIsoToTdbSeconds(iso) - naiveUtcSeconds(iso);
  assert.ok(Math.abs(offset - 69.184) < 1.7e-3, `offset ${offset}`);
});

test('frontera del segundo intercalar 2016-12-31T23:59:60Z: 2 s TDB entre :59 y 00:00', () => {
  const before = utcIsoToTdbSeconds('2016-12-31T23:59:59Z');
  const leap = utcIsoToTdbSeconds('2016-12-31T23:59:60Z');
  const after = utcIsoToTdbSeconds('2017-01-01T00:00:00Z');
  assert.ok(Math.abs(leap - before - 1) < 1e-6, `leap−before ${leap - before}`);
  assert.ok(
    Math.abs(after - before - 2) < 1e-6,
    `after−before ${after - before}`,
  );
  const offBefore = before - naiveUtcSeconds('2016-12-31T23:59:59Z');
  const offAfter = after - naiveUtcSeconds('2017-01-01T00:00:00Z');
  assert.ok(Math.abs(offBefore - (32.184 + 36)) < 1.7e-3, `antes ${offBefore}`);
  assert.ok(Math.abs(offAfter - (32.184 + 37)) < 1.7e-3, `después ${offAfter}`);
});

test('tdbSecondsFromJ2000 lee el TAI interno (dayNumber/secondsOfDay), no toDate()', () => {
  const jd = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00.250Z');
  const expected =
    (jd.dayNumber - 2451545) * SECONDS_PER_DAY +
    jd.secondsOfDay +
    TT_MINUS_TAI_S;
  assert.equal(ttSecondsFromJ2000(jd), expected);
  assert.equal(tdbSecondsFromJ2000(jd), expected + tdbMinusTtSeconds(expected));
});

test('P5-02 RED→GREEN: evaluar DE441 con UTC en vez de TDB falla (~70 km, ~0,6′); la vía TDB pasa', () => {
  const tdbPath = hermiteMoonKm(utcIsoToTdbSeconds(UT_ROW.utcIso));
  const utcPath = hermiteMoonKm(naiveUtcSeconds(UT_ROW.utcIso));
  const tdbKm = errorKm(tdbPath, UT_ROW.r);
  const utcKm = errorKm(utcPath, UT_ROW.r);
  const utcArcmin = errorArcmin(utcPath, UT_ROW.r);
  assert.ok(
    tdbKm <= 1 && errorArcmin(tdbPath, UT_ROW.r) <= 0.01,
    `TDB ${tdbKm} km`,
  );
  assert.ok(utcKm > 60 && utcKm < 80, `UTC ${utcKm} km`);
  assert.ok(utcArcmin > 0.5 && utcArcmin < 0.7, `UTC ${utcArcmin}′`);
});

test('utcIsoToTdbSeconds rechaza entradas que no son fechas ISO', () => {
  for (const bad of ['', 'ayer', null, 42, '2026-13-40T00:00:00Z'])
    assert.throws(() => utcIsoToTdbSeconds(bad), TypeError);
});

test('TDB − UTC para el rótulo de época: 32,184 s + (TAI−UTC) + (TDB−TT)', async () => {
  const { tdbMinusUtcSeconds } = await import('./timeScales.js');
  const at = (iso) => tdbMinusUtcSeconds(Cesium.JulianDate.fromIso8601(iso));
  assert.ok(Math.abs(at('2026-09-25T18:45:00Z') - 69.184) < 0.002);
  assert.ok(
    Math.abs(at('2016-06-01T00:00:00Z') - 68.184) < 0.002,
    'antes del intercalar de 2017',
  );
});
