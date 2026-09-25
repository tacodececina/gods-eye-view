/**
 * Fixture versionado de P5 (src/data/fixtures/moon-horizons-icrf.json):
 * vectores JPL Horizons DE441 para los tests, rotulados como FIXTURE.
 *
 * - `icrfTdb`: 40 vectores ICRF en medias horas TDB de 2021–2040 que NO
 *   entraron en el ajuste de la tabla.
 * - `icrfUt`: 10 vectores ICRF con época UTC (TIME_TYPE=UT) para probar que
 *   la vía UTC→TDB es la correcta.
 * - `subMoonItrf`: 10 puntos sublunares de Horizons en ITRF93 (observador en
 *   el centro de la Luna, objetivo la Tierra, QUANTITIES=14,20) en las mismas
 *   épocas UTC: dirección de la Luna en el marco fijo terrestre.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import * as prettier from 'prettier';
import {
  MOON_VECTOR_PARAMS,
  assertMoonVectorHeader,
  jdLiteral,
} from './eyeinsky-horizons.mjs';
import { parseHorizonsVectors } from './eyeinsky-moon-table.mjs';

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const FIXTURE_TDB_COUNT = 40;
const CHUNK_SECONDS = 128 * 86_400;

/** Épocas UTC del fixture: 2021–2040, incluye la de la evidencia (2026-09-25 18:45). */
export const FIXTURE_UTC_EPOCHS = Object.freeze([
  '2021-03-20T12:00:00Z',
  '2022-07-14T03:30:00Z',
  '2023-11-02T18:15:00Z',
  '2025-01-15T00:00:00Z',
  '2026-09-25T18:45:00Z',
  '2028-06-06T09:10:00Z',
  '2030-06-21T12:00:00Z',
  '2033-02-28T21:40:00Z',
  '2036-10-10T06:05:00Z',
  '2040-12-30T23:00:00Z',
]);

export const SUB_MOON_PARAMS = Object.freeze({
  format: 'text',
  COMMAND: '399',
  OBJ_DATA: 'NO',
  MAKE_EPHEM: 'YES',
  EPHEM_TYPE: 'OBSERVER',
  CENTER: '500@301',
  QUANTITIES: '14,20',
  ANG_FORMAT: 'DEG',
  CSV_FORMAT: 'YES',
  TIME_TYPE: 'UT',
  TIME_DIGITS: 'FRACSEC',
  EXTRA_PREC: 'YES',
  TLIST_TYPE: 'JD',
});

const utcSecondsFromJ2000 = (iso) => (Date.parse(iso) - J2000_MS) / 1000;
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const literal = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(([key]) => key !== 'format'),
  );

/** 40 medias horas equiespaciadas en la rejilla (no ajustadas). */
function pickTdbRows(grid, t0) {
  const held = grid.filter((s) => (s.tdb - t0) % 3600 !== 0);
  const step = Math.floor(held.length / FIXTURE_TDB_COUNT);
  return Array.from(
    { length: FIXTURE_TDB_COUNT },
    (_, i) => held[Math.floor(step / 2) + i * step],
  );
}

function parseSubMoon(text) {
  if (!/Target pole\/equ\s*:\s*ITRF93/.test(text))
    throw new Error('Sub-Luna sin ITRF93');
  const body = text
    .slice(text.indexOf('$$SOE') + 5, text.indexOf('$$EOE'))
    .trim()
    .split('\n');
  return body.map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const [lon, lat, deltaAu] = [
      Number(cells[3]),
      Number(cells[4]),
      Number(cells[5]),
    ];
    if (![lon, lat, deltaAu].every(Number.isFinite))
      throw new Error(`Fila sub-Luna ilegible: ${line}`);
    return {
      calendarUt: cells[0],
      apparentLonDeg: lon,
      apparentLatDeg: lat,
      deltaAu,
    };
  });
}

async function fetchUtVectors(client) {
  const params = {
    ...MOON_VECTOR_PARAMS,
    TIME_TYPE: 'UT',
    TLIST_TYPE: 'JD',
    TIME_DIGITS: 'FRACSEC',
    TLIST: FIXTURE_UTC_EPOCHS.map((iso) =>
      jdLiteral(utcSecondsFromJ2000(iso)),
    ).join("' '"),
  };
  const text = await client.get('fixture_icrf_ut', params);
  assertMoonVectorHeader(text, 'UT');
  const rows = parseHorizonsVectors(text, { timeScale: 'UT' });
  if (
    rows.map((r) => r.utcIso.replace('.000', '')).join() !==
    FIXTURE_UTC_EPOCHS.join()
  )
    throw new Error('Épocas UT del fixture no coinciden');
  return {
    query: literal(params),
    rawSha256: sha256(text),
    rows: rows.map((r) => ({
      utcIso: FIXTURE_UTC_EPOCHS[rows.indexOf(r)],
      rKm: r.r,
      vKmS: r.v,
    })),
  };
}

async function fetchEarthBarycentric(client) {
  const params = {
    ...MOON_VECTOR_PARAMS,
    COMMAND: '399',
    CENTER: '500@0',
    TIME_TYPE: 'UT',
    TLIST_TYPE: 'JD',
    TIME_DIGITS: 'FRACSEC',
    TLIST: FIXTURE_UTC_EPOCHS.map((iso) =>
      jdLiteral(utcSecondsFromJ2000(iso)),
    ).join("' '"),
  };
  const text = await client.get('fixture_earth_barycentric_ut', params);
  const rows = parseHorizonsVectors(text, { timeScale: 'UT' });
  if (rows.length !== FIXTURE_UTC_EPOCHS.length)
    throw new Error('Tierra baricéntrica: filas ≠ épocas');
  return { query: literal(params), rawSha256: sha256(text), rows };
}

async function fetchSubMoon(client) {
  const earthQuery = await fetchEarthBarycentric(client);
  const earth = earthQuery.rows;
  const params = {
    ...SUB_MOON_PARAMS,
    TLIST: FIXTURE_UTC_EPOCHS.map((iso) =>
      jdLiteral(utcSecondsFromJ2000(iso)),
    ).join("' '"),
  };
  const text = await client.get('fixture_submoon_itrf', params);
  const rows = parseSubMoon(text);
  if (rows.length !== FIXTURE_UTC_EPOCHS.length)
    throw new Error('Sub-Luna: filas ≠ épocas');
  return {
    query: literal(params),
    rawSha256: sha256(text),
    earthBarycentricQuery: {
      query: earthQuery.query,
      rawSha256: earthQuery.rawSha256,
    },
    definition:
      'ObsSub-LON/ObsSub-LAT de Horizons: longitud Este y latitud planetodética (elipsoide 6378,137/6356,752 km) en ITRF93 del centro del disco terrestre visto desde el centro de la Luna; aparente (tiempo de luz), modelo de orientación terrestre de alta precisión (precesión, nutación, movimiento polar, UT1).',
    lightTimeModel:
      'Verificado 2026-09-24 (residuo ≤ 2,3″, solo en longitud = UT1−UTC): el punto se calcula con tiempo de luz y SIN aberración. Dirección equivalente: R_ICRF→ITRF(t − τ) · (rLuna_geo(t) + vTierra_bar(t)·τ), con τ = delta·149597870,7/299792,458 s y vTierra_bar de earthBarycentricVelocityKmS; la intersección con el elipsoide WGS84 da la latitud planetodética.',
    rows: rows.map((r, i) => ({
      utcIso: FIXTURE_UTC_EPOCHS[i],
      ...r,
      earthBarycentricVelocityKmS: earth[i].v,
    })),
  };
}

/** Consulta más antigua y más reciente de la caché (UTC ISO). */
function retrievedRange(index) {
  const stamps = Object.values(index.entries)
    .map((entry) => entry.fetchedAt)
    .sort();
  return { first: stamps[0], last: stamps.at(-1) };
}

/** Escribe el fixture y devuelve {path, sha256, cuentas} para summary.json. */
export async function buildMoonFixture(client, { grid, fixturePath }) {
  const t0 = grid[0].tdb;
  const tdbRows = pickTdbRows(grid, t0);
  const chunks = [
    ...new Set(tdbRows.map((r) => Math.floor((r.tdb - t0) / CHUNK_SECONDS))),
  ];
  const gridEntries = Object.entries(client.index.entries)
    .filter(([name]) => name.startsWith('grid_'))
    .sort();
  const fixture = {
    label:
      'FIXTURE de tests — vectores JPL Horizons DE441 consultados offline; NO son datos en vivo',
    attribution: 'NASA/JPL Horizons, DE441',
    retrievedAt: retrievedRange(client.index),
    icrfTdb: {
      note: 'Medias horas TDB NO usadas en el ajuste de public/data/moon-de441-2021-2040.bin',
      query: literal({
        ...MOON_VECTOR_PARAMS,
        TIME_TYPE: 'TDB',
        STEP_SIZE: '30 m',
      }),
      rawFiles: Object.fromEntries(
        chunks.map((c) => [gridEntries[c][0], gridEntries[c][1].sha256]),
      ),
      rows: tdbRows.map((r) => ({
        calendarTdb: r.calendar,
        tdbSecondsJ2000: r.tdb,
        rKm: r.r,
        vKmS: r.v,
      })),
    },
    icrfUt: await fetchUtVectors(client),
    subMoonItrf: await fetchSubMoon(client),
  };
  const options = (await prettier.resolveConfig(fixturePath)) ?? {};
  const text = await prettier.format(JSON.stringify(fixture), {
    ...options,
    filepath: fixturePath,
  });
  await fs.writeFile(fixturePath, text);
  return {
    path: 'src/data/fixtures/moon-horizons-icrf.json',
    sha256: sha256(text),
    icrfTdb: tdbRows.length,
    icrfUt: fixture.icrfUt.rows.length,
    subMoonItrf: fixture.subMoonItrf.rows.length,
  };
}
