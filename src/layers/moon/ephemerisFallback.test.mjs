import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as Cesium from 'cesium';
import { decodeMoonTable, evaluateMoonTableKm } from './ephemerisFormat.js';
import { utcIsoToTdbSeconds } from '../../time/timeScales.js';
import {
  FALLBACK_TOLERANCE_KM,
  createMoonFallback,
  loadMoonFallback,
  ttMinusUtcSeconds,
} from './ephemerisFallback.js';

const FIXTURE = JSON.parse(
  readFileSync(
    new URL('../../data/fixtures/moon-horizons-icrf.json', import.meta.url),
    'utf8',
  ),
);
const TABLE = decodeMoonTable(
  readFileSync(
    new URL('../../../public/data/moon-de441-2021-2040.bin', import.meta.url),
  ),
);
const SWEEP_STEP_S = 6 * 3600;
const errKm = (p, r) => Math.hypot(p.x - r[0], p.y - r[1], p.z - r[2]);
/** Días UT desde J2000 (convención de astronomy-engine). */
const utDays = (iso) =>
  (Date.parse(iso) - Date.UTC(2000, 0, 1, 12)) / 86_400_000;

test('TT−UTC sale de JulianDate.leapSeconds (32,184 + TAI−UTC), no de un 75 s fijo', () => {
  assert.equal(ttMinusUtcSeconds(utDays('2016-12-31T23:59:59Z')), 32.184 + 36);
  assert.equal(ttMinusUtcSeconds(utDays('2017-01-01T00:00:01Z')), 32.184 + 37);
  assert.equal(
    ttMinusUtcSeconds(utDays('2035-06-01T00:00:00Z')),
    32.184 + 37,
    'último intercalar conocido',
  );
  const last = Cesium.JulianDate.leapSeconds.at(-1);
  assert.equal(
    last.offset,
    37,
    'la tabla de Cesium termina en 2017 (TAI−UTC = 37 s)',
  );
});

test('respaldo astronomy-engine GeoMoon dentro de la tolerancia frente a las 50 épocas del fixture', async () => {
  const fallback = await loadMoonFallback();
  const out = { x: 0, y: 0, z: 0 };
  const rows = [
    ...FIXTURE.icrfTdb.rows.map((r) => ({
      label: r.calendarTdb,
      tdb: r.tdbSecondsJ2000,
      rKm: r.rKm,
    })),
    ...FIXTURE.icrfUt.rows.map((r) => ({
      label: r.utcIso,
      tdb: utcIsoToTdbSeconds(r.utcIso),
      rKm: r.rKm,
    })),
  ];
  let worst = 0;
  for (const row of rows) {
    const sample = fallback.moonPositionIcrf(row.tdb, out);
    assert.equal(sample.status, 'ok');
    assert.equal(sample.source, 'astronomy-engine');
    assert.equal(sample.toleranceKm, FALLBACK_TOLERANCE_KM);
    worst = Math.max(worst, errKm(sample.position, row.rKm));
    assert.ok(
      errKm(sample.position, row.rKm) <= FALLBACK_TOLERANCE_KM,
      `${row.label}: ${errKm(sample.position, row.rKm).toFixed(2)} km`,
    );
  }
  assert.ok(
    worst > 1,
    'es un modelo analítico, no la tabla: el error es de km, no de m',
  );
});

test('el respaldo funciona fuera de 2021–2040 (p. ej. 2045 y 2019)', async () => {
  const fallback = await loadMoonFallback();
  for (const iso of ['2019-06-01T00:00:00Z', '2045-06-01T00:00:00Z']) {
    const sample = fallback.moonPositionIcrf(utcIsoToTdbSeconds(iso), {
      x: 0,
      y: 0,
      z: 0,
    });
    const r = Math.hypot(
      sample.position.x,
      sample.position.y,
      sample.position.z,
    );
    assert.ok(r > 356_000 && r < 407_000, `${iso}: ${r} km`);
  }
  assert.throws(
    () => fallback.moonPositionIcrf(Number.NaN, { x: 0, y: 0, z: 0 }),
    TypeError,
  );
});

test('la tolerancia rotulada acota el barrido completo 2021–2040 contra la tabla DE441 (cada 6 h)', async () => {
  const fallback = await loadMoonFallback();
  const out = { x: 0, y: 0, z: 0 };
  const ref = [0, 0, 0];
  let worst = { km: 0, tdb: Number.NaN };
  let samples = 0;
  for (let tdb = TABLE.t0; tdb <= TABLE.t1; tdb += SWEEP_STEP_S) {
    evaluateMoonTableKm(TABLE, tdb, ref);
    const km = errKm(fallback.moonPositionIcrf(tdb, out).position, ref);
    if (km > worst.km) worst = { km, tdb };
    samples += 1;
  }
  assert.ok(samples > 29_000, `muestras: ${samples}`);
  assert.ok(
    worst.km < FALLBACK_TOLERANCE_KM,
    `máximo ${worst.km.toFixed(2)} km (TDB ${worst.tdb} s) ≥ ${FALLBACK_TOLERANCE_KM} km`,
  );
});

/** TAI−UTC vigente en `iso` leído directamente de JulianDate.leapSeconds. */
function leapOffsetAt(iso) {
  const date = Cesium.JulianDate.fromIso8601(iso);
  let offset = null;
  for (const leap of Cesium.JulianDate.leapSeconds)
    if (Cesium.JulianDate.lessThanOrEquals(leap.julianDate, date))
      offset = leap.offset;
  return offset;
}

/** astronomy-engine falso: captura la función ΔT que instala el respaldo. */
function fakeAstronomy() {
  const seen = { deltaT: null };
  return {
    seen,
    SetDeltaTFunction: (fn) => {
      seen.deltaT = fn;
    },
    DeltaT_EspenakMeeus: () => 999,
    MakeTime: (ut) => ({ ut }),
    GeoMoon: () => ({ x: 0.00257, y: 0, z: 0 }),
  };
}

test('ΔT del respaldo fuera de 2021–2040: 1990 y 2035 salen de JulianDate.leapSeconds', () => {
  const astronomy = fakeAstronomy();
  createMoonFallback({ astronomy });
  const cases = [
    ['1990-06-01T00:00:00Z', 25],
    ['2035-06-01T00:00:00Z', 37],
  ];
  for (const [iso, expected] of cases) {
    assert.equal(leapOffsetAt(iso), expected, `TAI−UTC de Cesium en ${iso}`);
    const want = 32.184 + leapOffsetAt(iso);
    assert.equal(ttMinusUtcSeconds(utDays(iso)), want, iso);
    assert.equal(
      astronomy.seen.deltaT(utDays(iso)),
      want,
      `ΔT instalado ${iso}`,
    );
  }
  assert.equal(
    astronomy.seen.deltaT(utDays('1965-01-01T00:00:00Z')),
    999,
    'antes del primer intercalar (1972) manda la librería',
  );
});

test('el respaldo real en 1990 y 2035 da una Luna plausible con ese ΔT', async () => {
  const fallback = await loadMoonFallback();
  for (const iso of ['1990-06-01T00:00:00Z', '2035-06-01T00:00:00Z']) {
    const { position } = fallback.moonPositionIcrf(utcIsoToTdbSeconds(iso), {
      x: 0,
      y: 0,
      z: 0,
    });
    const r = Math.hypot(position.x, position.y, position.z);
    assert.ok(r > 356_000 && r < 407_000, `${iso}: ${r} km`);
  }
});

test('astronomy-engine se importa en diferido: sin import estático en el módulo', () => {
  const source = readFileSync(
    new URL('./ephemerisFallback.js', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /^import[^;]*from\s+['"]astronomy-engine['"]/m);
  assert.match(source, /import\(\s*['"]astronomy-engine['"]\s*\)/);
});

test('loadMoonFallback usa el cargador inyectado y exige la API GeoMoon', async () => {
  const astronomy = fakeAstronomy();
  let imports = 0;
  const fallback = await loadMoonFallback({
    importAstronomy: async () => {
      imports += 1;
      return astronomy;
    },
  });
  assert.equal(imports, 1);
  assert.equal(fallback.source, 'astronomy-engine');
  await assert.rejects(
    loadMoonFallback({ importAstronomy: async () => ({}) }),
    TypeError,
  );
});
