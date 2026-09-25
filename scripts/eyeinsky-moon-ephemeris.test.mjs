import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  buildMoonTable,
  encodeMoonTable,
  parseHorizonsVectors,
  validateMoonTable,
} from './lib/eyeinsky-moon-table.mjs';
import {
  MOON_TABLE_HEADER_BYTES,
  decodeMoonTable,
  evaluateMoonTableKm,
} from '../src/layers/moon/ephemerisFormat.js';

const HOUR = 3600;
const DAY = 86_400;
const SEGMENT = 8 * DAY;
const T0 = 662_731_200; // 2021-01-01T00:00 TDB en s desde J2000

/**
 * «Luna» sintética (sin red): elipse con precesión lenta y términos solares,
 * del mismo orden que la real (≈ 384 000 km, periodo 27,3 d).
 */
function syntheticMoonKm(t) {
  const n = (2 * Math.PI) / (27.321661 * DAY);
  const m = n * (t - T0);
  const r = 384_400 - 20_000 * Math.cos(m) + 3_000 * Math.cos(2 * m * 0.9);
  const lon = m + 0.1098 * Math.sin(m) + 0.02 * Math.sin(2 * m * 0.93);
  const lat = 0.0898 * Math.sin(m * 1.0038);
  return [
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.cos(lat) * Math.sin(lon) * 0.917,
    r * Math.sin(lat) + r * Math.cos(lat) * Math.sin(lon) * 0.398,
  ];
}

/** Muestras cada 30 min en [T0, T0 + días]. */
function samples(days) {
  const out = [];
  for (let t = T0; t <= T0 + days * DAY + 1e-6; t += HOUR / 2)
    out.push({ tdb: t, r: syntheticMoonKm(t) });
  return out;
}

const OPTIONS = Object.freeze({
  t0: T0,
  t1: T0 + 32 * DAY,
  segmentSeconds: SEGMENT,
  order: 10,
  source: 'DE441',
  frame: 'ICRF geocéntrico',
  units: 'km',
});

test('ajusta con las horas en punto y valida con las medias horas que no entraron', () => {
  const grid = samples(32);
  const table = buildMoonTable(grid, OPTIONS);
  assert.equal(table.segmentCount, 4);
  assert.equal(
    table.fitSamples,
    4 * 193 - 3,
    'horas en punto, fronteras compartidas',
  );
  const report = validateMoonTable(
    table,
    grid.filter((s) => (s.tdb - T0) % HOUR !== 0),
    {
      maxKm: 1,
      maxArcmin: 0.01,
    },
  );
  assert.equal(report.ok, true);
  assert.equal(report.count, 32 * 24, 'una media hora por hora');
  assert.ok(report.maxKm < 0.05, `máx ${report.maxKm} km`);
});

test('el .bin lleva cabecera EYMOON1 con DE441, rango, segmento, orden, marco, unidades y sha256', () => {
  const table = buildMoonTable(samples(32), OPTIONS);
  const bytes = encodeMoonTable(table);
  const payload = bytes.subarray(MOON_TABLE_HEADER_BYTES);
  assert.equal(
    payload.length,
    4 * 3 * 11 * 4,
    'float32: segmentos × 3 ejes × (orden+1)',
  );
  const decoded = decodeMoonTable(bytes);
  assert.deepEqual(
    {
      magic: decoded.magic,
      version: decoded.version,
      source: decoded.source,
      t0: decoded.t0,
      t1: decoded.t1,
      segmentSeconds: decoded.segmentSeconds,
      order: decoded.order,
      segmentCount: decoded.segmentCount,
      frame: decoded.frame,
      units: decoded.units,
    },
    {
      magic: 'EYMOON1',
      version: 1,
      source: 'DE441',
      t0: OPTIONS.t0,
      t1: OPTIONS.t1,
      segmentSeconds: SEGMENT,
      order: 10,
      segmentCount: 4,
      frame: 'ICRF geocéntrico',
      units: 'km',
    },
  );
  assert.equal(
    decoded.payloadSha256,
    createHash('sha256').update(payload).digest('hex'),
  );
});

test('lo que valida el generador es la evaluación del runtime sobre float32', () => {
  const table = buildMoonTable(samples(32), OPTIONS);
  const decoded = decodeMoonTable(encodeMoonTable(table));
  const t = T0 + 13.37 * DAY;
  const fromBin = evaluateMoonTableKm(decoded, t, [0, 0, 0]);
  const truth = syntheticMoonKm(t);
  assert.ok(Math.hypot(...fromBin.map((v, i) => v - truth[i])) < 0.05);
  const report = validateMoonTable(table, [{ tdb: t, r: truth }], {
    maxKm: 1,
    maxArcmin: 0.01,
  });
  assert.ok(
    Math.abs(
      report.maxKm - Math.hypot(...fromBin.map((v, i) => v - truth[i])),
    ) < 1e-12,
  );
});

test('el gate aborta si el error supera 1 km o 0,01′ (orden 3 no basta)', () => {
  const grid = samples(32);
  const coarse = buildMoonTable(grid, { ...OPTIONS, order: 3 });
  const report = validateMoonTable(coarse, grid, { maxKm: 1, maxArcmin: 0.01 });
  assert.equal(report.ok, false);
  assert.ok(report.worst.errKm > 1);
});

test('buildMoonTable rechaza huecos de datos en un segmento', () => {
  const grid = samples(32).filter(
    (s) => s.tdb < T0 + 10 * DAY || s.tdb > T0 + 11 * DAY,
  );
  assert.throws(() => buildMoonTable(grid, OPTIONS), /hueco|faltan/i);
});

test('parseHorizonsVectors lee JDTDB, calendario y X,Y,Z de un CSV VEC_TABLE=2', () => {
  const text = [
    'Reference frame : ICRF',
    '            JDTDB,            Calendar Date (TDB),   X, Y, Z, VX, VY, VZ,',
    '$$SOE',
    '2459215.500000000, A.D. 2021-Jan-01 00:00:00.0000, -2.068864848835185E+05,  2.891146376649539E+05,  1.515746879743575E+05, -8.366764353684139E-01, -5.602543705770857E-01, -1.710459443697999E-01,',
    '2459215.520833333, A.D. 2021-Jan-01 00:30:00.0000, -2.083901528648283E+05,  2.881029548494885E+05,  1.512651077779296E+05, -8.340623603619534E-01, -5.638358604151602E-01, -1.729315790360649E-01,',
    '$$EOE',
  ].join('\n');
  const rows = parseHorizonsVectors(text, { timeScale: 'TDB' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tdb, T0);
  assert.equal(rows[1].tdb, T0 + 1800);
  assert.deepEqual(
    rows[0].r,
    [-2.068864848835185e5, 2.891146376649539e5, 1.515746879743575e5],
  );
  assert.equal(rows[0].calendar, '2021-Jan-01 00:00:00.0000');
  assert.throws(
    () => parseHorizonsVectors('sin tabla', { timeScale: 'TDB' }),
    /SOE/,
  );
  assert.throws(
    () =>
      parseHorizonsVectors(text.replace('ICRF', 'ECLIPJ2000'), {
        timeScale: 'TDB',
      }),
    /ICRF/,
  );
});
