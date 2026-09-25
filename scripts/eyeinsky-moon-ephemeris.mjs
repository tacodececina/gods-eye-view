/**
 * Generador OFFLINE de la tabla lunar de EYEINSKY P5 (fuera de CI).
 *
 * 1. Pide a JPL Horizons (DE441) la Luna geocéntrica ICRF, geométrica, en km,
 *    TDB, cada 30 min de 2021-01-01 al final del último segmento, por tramos
 *    de 128 d; guarda las respuestas crudas con sha256 en `<out>/horizons/`.
 * 2. Ajusta Chebyshev (orden 10, segmentos de 8 d, float32) SOLO con las
 *    horas en punto.
 * 3. Revalida con muestras NO usadas: las medias horas de los 20 años, las
 *    fronteras de segmento ±1 min y todos los perigeos (TLIST). Aborta sin
 *    escribir la tabla si algún error supera 1 km o 0,01′.
 * 4. Escribe `public/data/moon-de441-2021-2040.bin`, `<out>/summary.json` y el
 *    fixture versionado `src/data/fixtures/moon-horizons-icrf.json`.
 *
 * Uso: node scripts/eyeinsky-moon-ephemeris.mjs [directorio-de-salida]
 *      (por defecto output/eyeinsky-p5/t2; la caché de Horizons se reutiliza)
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MOON_VECTOR_PARAMS,
  assertMoonVectorHeader,
  createHorizonsClient,
  jdLiteral,
} from './lib/eyeinsky-horizons.mjs';
import {
  buildMoonTable,
  encodeMoonTable,
  parseHorizonsVectors,
  validateMoonTable,
} from './lib/eyeinsky-moon-table.mjs';
import { decodeMoonTable } from '../src/layers/moon/ephemerisFormat.js';
import { buildMoonFixture } from './lib/eyeinsky-moon-fixture.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DAY = 86_400;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const tdbFromCalendar = (iso) => (Date.parse(iso) - J2000_MS) / 1000;

export const TABLE_OPTIONS = Object.freeze({
  t0: tdbFromCalendar('2021-01-01T00:00:00Z'),
  t1: tdbFromCalendar('2041-01-01T00:00:00Z'),
  segmentSeconds: 8 * DAY,
  order: 10,
  source: 'DE441',
  frame: 'ICRF geocéntrico',
  units: 'km',
});
export const GATE = Object.freeze({ maxKm: 1, maxArcmin: 0.01 });
const CHUNK_DAYS = 128;
/** Horizons devuelve 502 con TLIST de 100 JD (URL ≈ 2,6 KB); 40 pasa. */
const TLIST_PER_QUERY = 40;
const MIN_PERIGEES = 20;
const BIN_PATH = 'public/data/moon-de441-2021-2040.bin';
const FIXTURE_PATH = 'src/data/fixtures/moon-horizons-icrf.json';

const segmentCount = () =>
  Math.ceil(
    (TABLE_OPTIONS.t1 - TABLE_OPTIONS.t0) / TABLE_OPTIONS.segmentSeconds,
  );
const coverageEnd = () =>
  TABLE_OPTIONS.t0 + segmentCount() * TABLE_OPTIONS.segmentSeconds;
const calendarOf = (tdb) =>
  new Date(J2000_MS + tdb * 1000).toISOString().replace('T', ' ').slice(0, 16);

/** Rejilla de 30 min, por tramos; filas únicas ordenadas por tiempo. */
async function fetchGrid(client) {
  const byTime = new Map();
  for (
    let start = TABLE_OPTIONS.t0;
    start < coverageEnd();
    start += CHUNK_DAYS * DAY
  ) {
    const stop = Math.min(start + CHUNK_DAYS * DAY, coverageEnd());
    const name = `grid_${calendarOf(start).slice(0, 10)}_${calendarOf(stop).slice(0, 10)}`;
    const text = await client.get(name, {
      ...MOON_VECTOR_PARAMS,
      TIME_TYPE: 'TDB',
      START_TIME: calendarOf(start),
      STOP_TIME: calendarOf(stop),
      STEP_SIZE: '30 m',
    });
    assertMoonVectorHeader(text, 'TDB');
    for (const row of parseHorizonsVectors(text, { timeScale: 'TDB' }))
      byTime.set(row.tdb, row);
  }
  const grid = [...byTime.values()].sort((a, b) => a.tdb - b.tdb);
  const expected = (coverageEnd() - TABLE_OPTIONS.t0) / 1800 + 1;
  if (grid.length !== expected)
    throw new Error(
      `Rejilla con ${grid.length} filas; se esperaban ${expected}`,
    );
  return grid;
}

/** Vectores TDB en instantes arbitrarios (TLIST), por lotes. */
async function fetchTlist(client, prefix, times) {
  const rows = [];
  for (let i = 0; i < times.length; i += TLIST_PER_QUERY) {
    const batch = times.slice(i, i + TLIST_PER_QUERY);
    const text = await client.get(
      `${prefix}_${String(i / TLIST_PER_QUERY).padStart(3, '0')}`,
      {
        ...MOON_VECTOR_PARAMS,
        TIME_TYPE: 'TDB',
        TLIST_TYPE: 'JD',
        TIME_DIGITS: 'FRACSEC',
        TLIST: batch.map(jdLiteral).join("' '"),
      },
    );
    assertMoonVectorHeader(text, 'TDB');
    rows.push(...parseHorizonsVectors(text, { timeScale: 'TDB' }));
  }
  if (rows.length !== times.length)
    throw new Error(
      `${prefix}: ${rows.length} filas para ${times.length} instantes`,
    );
  return rows;
}

/** Medias horas (no ajustadas) por año TDB y en total. */
function validateHalfHours(table, grid) {
  const held = grid.filter((s) => (s.tdb - TABLE_OPTIONS.t0) % 3600 !== 0);
  const years = new Map();
  for (const s of held) {
    const year = s.calendar.slice(0, 4);
    if (!years.has(year)) years.set(year, []);
    years.get(year).push(s);
  }
  const perYear = [...years].map(([year, samples]) => ({
    year,
    ...validateMoonTable(table, samples, GATE),
  }));
  return { total: validateMoonTable(table, held, GATE), perYear };
}

/** Fronteras interiores ±60 s y salto entre segmentos contiguos en la frontera. */
async function validateBoundaries(client, table) {
  const boundaries = Array.from(
    { length: segmentCount() - 1 },
    (_, i) => TABLE_OPTIONS.t0 + (i + 1) * TABLE_OPTIONS.segmentSeconds,
  );
  const rows = await fetchTlist(
    client,
    'boundaries',
    boundaries.flatMap((b) => [b - 60, b + 60]),
  );
  let maxJumpKm = 0;
  const left = [0, 0, 0];
  boundaries.forEach((_, i) => {
    evaluateSegmentEnd(table, i, left);
    const next = evaluateSegmentStart(table, i + 1);
    maxJumpKm = Math.max(
      maxJumpKm,
      Math.hypot(left[0] - next[0], left[1] - next[1], left[2] - next[2]),
    );
  });
  return {
    count: rows.length,
    boundaries: boundaries.length,
    ...validateMoonTable(table, rows, GATE),
    maxJumpKm,
  };
}

/** Serie de un segmento evaluada en x = +1 (su final): suma de coeficientes. */
function evaluateSegmentEnd(table, segment, out) {
  const stride = table.order + 1;
  for (let axis = 0; axis < 3; axis += 1) {
    let sum = 0;
    for (let k = 0; k <= table.order; k += 1)
      sum += table.coefficients[segment * 3 * stride + axis * stride + k];
    out[axis] = sum;
  }
  return out;
}

/** Serie de un segmento en x = −1 (su inicio): Σ (−1)^k c_k. */
function evaluateSegmentStart(table, segment) {
  const stride = table.order + 1;
  return [0, 1, 2].map((axis) => {
    let sum = 0;
    for (let k = 0; k <= table.order; k += 1)
      sum +=
        (k % 2 ? -1 : 1) *
        table.coefficients[segment * 3 * stride + axis * stride + k];
    return sum;
  });
}

/** Perigeos: mínimos locales de |r| en la rejilla, refinados por parábola. */
export function findPerigees(grid) {
  const d = grid.map((s) => Math.hypot(...s.r));
  const out = [];
  for (let i = 1; i < d.length - 1; i += 1) {
    if (!(d[i] < d[i - 1] && d[i] <= d[i + 1])) continue;
    const h = grid[i].tdb - grid[i - 1].tdb;
    const denom = d[i - 1] - 2 * d[i] + d[i + 1];
    const shift = denom > 0 ? (h * (d[i - 1] - d[i + 1])) / (2 * denom) : 0;
    out.push(Math.round((grid[i].tdb + shift) * 1000) / 1000);
  }
  return out;
}

async function validatePerigees(client, table, grid) {
  const inside = findPerigees(grid).filter(
    (t) => t >= TABLE_OPTIONS.t0 && t <= TABLE_OPTIONS.t1,
  );
  const rows = await fetchTlist(client, 'perigees', inside);
  const distances = rows.map((r) => Math.hypot(...r.r));
  return {
    ...validateMoonTable(table, rows, GATE),
    minDistanceKm: Math.min(...distances),
    maxDistanceKm: Math.max(...distances),
    first: rows[0]?.calendar,
    last: rows.at(-1)?.calendar,
  };
}

const round = (value, digits = 4) => Number(value.toFixed(digits));
const compact = ({ ok, count, maxKm, maxArcmin, rmsKm }) => ({
  ok,
  count,
  maxKm: round(maxKm),
  rmsKm: round(rmsKm),
  maxArcmin: round(maxArcmin, 6),
});
const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function generatorHashes() {
  const files = [
    'scripts/eyeinsky-moon-ephemeris.mjs',
    'scripts/lib/eyeinsky-moon-table.mjs',
    'scripts/lib/eyeinsky-horizons.mjs',
    'scripts/lib/eyeinsky-moon-fixture.mjs',
    'src/layers/moon/ephemerisFormat.js',
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (f) => [
        f,
        sha256Hex(await fs.readFile(path.join(ROOT, f))),
      ]),
    ),
  );
}

/** Escribe el .bin y devuelve su ficha (tamaño y hashes). */
async function writeTable(table) {
  const bytes = encodeMoonTable(table);
  const decoded = decodeMoonTable(bytes);
  if (decoded.payloadSha256 !== sha256Hex(decoded.payload))
    throw new Error('Hash de la carga incoherente');
  await fs.mkdir(path.join(ROOT, path.dirname(BIN_PATH)), { recursive: true });
  await fs.writeFile(path.join(ROOT, BIN_PATH), bytes);
  return {
    path: BIN_PATH,
    bytes: bytes.length,
    fileSha256: sha256Hex(bytes),
    payloadSha256: decoded.payloadSha256,
    segmentCount: decoded.segmentCount,
    headerBytes: decoded.headerBytes,
  };
}

const PARAMETERS = Object.freeze({
  ...TABLE_OPTIONS,
  horizons: MOON_VECTOR_PARAMS,
  timeType: 'TDB',
  stepSize: '30 m',
  fit: 'horas en punto (1 h)',
  validation: 'medias horas + fronteras ±60 s + perigeos (TLIST)',
});

/** Resumen de la validación (medias horas por año, fronteras, perigeos). */
function validationSummary({ halfHours, boundaries, perigees }) {
  return {
    halfHours: {
      total: compact(halfHours.total),
      worst: halfHours.total.worst,
      perYear: halfHours.perYear.map(({ year, ...r }) => ({
        year,
        ...compact(r),
      })),
    },
    boundaries: {
      ...compact(boundaries),
      boundaries: boundaries.boundaries,
      maxJumpKm: round(boundaries.maxJumpKm, 6),
      worst: boundaries.worst,
    },
    perigees: {
      ...compact(perigees),
      minDistanceKm: round(perigees.minDistanceKm, 3),
      maxDistanceKm: round(perigees.maxDistanceKm, 3),
      first: perigees.first,
      last: perigees.last,
      worst: perigees.worst,
    },
  };
}

const writeSummary = (out, summary) =>
  fs.writeFile(
    path.join(out, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}
`,
  );

/** Valida la tabla contra Horizons (sin reutilizar muestras del ajuste). */
async function validateAll(client, table, grid) {
  const halfHours = validateHalfHours(table, grid);
  const boundaries = await validateBoundaries(client, table);
  const perigees = await validatePerigees(client, table, grid);
  const ok =
    halfHours.total.ok &&
    boundaries.ok &&
    perigees.ok &&
    perigees.count >= MIN_PERIGEES;
  return { ok, ...validationSummary({ halfHours, boundaries, perigees }) };
}

async function main() {
  const out = path.resolve(ROOT, process.argv[2] ?? 'output/eyeinsky-p5/t2');
  await fs.mkdir(out, { recursive: true });
  const client = await createHorizonsClient(path.join(out, 'horizons'));
  const grid = await fetchGrid(client);
  const table = buildMoonTable(grid, TABLE_OPTIONS);
  const validation = await validateAll(client, table, grid);
  const base = {
    generatedAt: new Date().toISOString(),
    gate: GATE,
    parameters: { ...PARAMETERS, coverageEnd: coverageEnd() },
    samples: { grid: grid.length, fit: table.fitSamples },
    ...validation,
    generator: await generatorHashes(),
    horizonsIndex: path
      .relative(ROOT, client.indexPath)
      .split(path.sep)
      .join('/'),
  };
  if (!validation.ok) {
    await writeSummary(out, base);
    throw new Error(
      'Gate de la tabla NO superado (> 1 km o > 0,01′): no se escribe el .bin',
    );
  }
  const summary = {
    ...base,
    table: await writeTable(table),
    fixture: await buildMoonFixture(client, {
      grid,
      fixturePath: path.join(ROOT, FIXTURE_PATH),
    }),
  };
  await writeSummary(out, summary);
  const { ok, halfHours, boundaries, perigees } = summary;
  console.log(
    JSON.stringify(
      {
        ok,
        table: summary.table,
        halfHours: halfHours.total,
        boundaries: boundaries.maxKm,
        perigees: perigees.count,
      },
      null,
      2,
    ),
  );
}

const invoked =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
