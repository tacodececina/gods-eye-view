/**
 * Generador OFFLINE del fixture de fase y orientación lunar de P5 T5 (fuera
 * de CI).
 *
 * Pide a JPL Horizons (DE441), para las 10 épocas UTC del fixture ICRF
 * (`FIXTURE_UTC_EPOCHS`), la Luna vista desde el geocentro con las cantidades
 * 10 (Illu%), 13 (diámetro angular) y 14 (punto sub-Tierra en MOON_ME, longitud
 * Este). Guarda la respuesta cruda con sha256 en `<out>/horizons/` y escribe
 * `src/data/fixtures/moon-horizons-phase.json`, rotulado FIXTURE.
 *
 * Uso: node scripts/eyeinsky-moon-phase-fixture.mjs [directorio-de-salida]
 *      (por defecto output/eyeinsky-p5/t5; la caché de Horizons se reutiliza)
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { createHorizonsClient, jdLiteral } from './lib/eyeinsky-horizons.mjs';
import { FIXTURE_UTC_EPOCHS } from './lib/eyeinsky-moon-fixture.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const FIXTURE_PATH = 'src/data/fixtures/moon-horizons-phase.json';
const J2000_MS = Date.UTC(2000, 0, 1, 12);

export const PHASE_PARAMS = Object.freeze({
  format: 'text',
  COMMAND: '301',
  OBJ_DATA: 'NO',
  MAKE_EPHEM: 'YES',
  EPHEM_TYPE: 'OBSERVER',
  CENTER: '500@399',
  QUANTITIES: '10,13,14',
  ANG_FORMAT: 'DEG',
  CSV_FORMAT: 'YES',
  TIME_TYPE: 'UT',
  TIME_DIGITS: 'FRACSEC',
  EXTRA_PREC: 'YES',
  TLIST_TYPE: 'JD',
});

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** Exige en la cabecera lo que el fixture declara (DE441, MOON_ME, Este). */
export function assertPhaseHeader(text) {
  const required = [
    [/Target body name: Moon \(301\)\s+\{source: DE441\}/, 'Luna DE441'],
    [/Center body name: Earth \(399\)/, 'centro Tierra'],
    [/Target pole\/equ\s*:\s*MOON_ME\s+\{East-longitude positive\}/, 'ME Este'],
    [/Target radii\s*:\s*1737\.4, 1737\.4, 1737\.4 km/, 'radio 1737,4 km'],
  ];
  for (const [pattern, label] of required)
    if (!pattern.test(text)) throw new Error(`Cabecera Horizons sin ${label}`);
}

/** Filas CSV entre $$SOE y $$EOE → {calendarUt, illuPct, angDiamArcsec, subEarth}. */
export function parsePhaseRows(text) {
  const body = text
    .slice(text.indexOf('$$SOE') + 5, text.indexOf('$$EOE'))
    .trim()
    .split('\n');
  return body.map((line) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const values = cells.slice(3, 7).map(Number);
    if (values.length !== 4 || !values.every(Number.isFinite))
      throw new Error(`Fila de fase ilegible: ${line}`);
    const [illuPct, angDiamArcsec, lonDeg, latDeg] = values;
    return {
      calendarUt: cells[0],
      illuPct,
      angDiamArcsec,
      subEarthLonDeg: lonDeg,
      subEarthLatDeg: latDeg,
    };
  });
}

async function buildFixture(client) {
  const params = {
    ...PHASE_PARAMS,
    TLIST: FIXTURE_UTC_EPOCHS.map((iso) =>
      jdLiteral((Date.parse(iso) - J2000_MS) / 1000),
    ).join("' '"),
  };
  const text = await client.get('fixture_phase_me', params);
  assertPhaseHeader(text);
  const rows = parsePhaseRows(text);
  if (rows.length !== FIXTURE_UTC_EPOCHS.length)
    throw new Error('Fase: filas ≠ épocas');
  const { format: _format, ...query } = params;
  return {
    label:
      'FIXTURE de tests — fase y orientación lunar JPL Horizons DE441 consultadas offline; NO son datos en vivo',
    attribution: 'NASA/JPL Horizons, DE441',
    retrievedAt: client.index.entries.fixture_phase_me.fetchedAt,
    query,
    rawSha256: sha256(text),
    definition:
      'Observador en el geocentro (500@399). Illu% = fracción iluminada del disco en %; Ang-diam = diámetro angular ecuatorial en ″ (radio 1737,4 km); ObsSub-LON/LAT = punto sub-Tierra en el marco lunar MOON_ME, longitud Este. Aparentes (tiempo de luz de bajada).',
    rows: rows.map((row, i) => ({ utcIso: FIXTURE_UTC_EPOCHS[i], ...row })),
  };
}

const out = path.resolve(ROOT, process.argv[2] ?? 'output/eyeinsky-p5/t5');
const client = await createHorizonsClient(path.join(out, 'horizons'));
const fixture = await buildFixture(client);
const target = path.join(ROOT, FIXTURE_PATH);
const options = (await prettier.resolveConfig(target)) ?? {};
const formatted = await prettier.format(JSON.stringify(fixture), {
  ...options,
  filepath: target,
});
await fs.writeFile(target, formatted);
console.log(`${FIXTURE_PATH} sha256 ${sha256(formatted)}`);
