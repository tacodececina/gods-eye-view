/**
 * Cliente mínimo de la API pública de JPL Horizons para el generador P5.
 *
 * - Una petición cada vez (Horizons pide no paralelizar), con pausa entre
 *   peticiones y reintento con backoff exponencial ante 429/5xx/red.
 * - Cada respuesta cruda se guarda en `cacheDir` con su sha256 y la URL
 *   literal en `index.json`; una segunda corrida reutiliza la caché.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const PAUSE_MS = 400;
const MAX_ATTEMPTS = 6;
const FIRST_BACKOFF_MS = 2_000;
const TIMEOUT_MS = 180_000;

/** Parámetros comunes de vectores de la Luna geocéntrica, ICRF, geométricos. */
export const MOON_VECTOR_PARAMS = Object.freeze({
  format: 'text',
  COMMAND: '301',
  OBJ_DATA: 'NO',
  MAKE_EPHEM: 'YES',
  EPHEM_TYPE: 'VECTORS',
  CENTER: '500@399',
  REF_SYSTEM: 'ICRF',
  REF_PLANE: 'FRAME',
  VEC_CORR: 'NONE',
  VEC_TABLE: '2',
  OUT_UNITS: 'KM-S',
  CSV_FORMAT: 'YES',
  VEC_LABELS: 'NO',
});

/** URL literal: cada valor entre comillas simples, como pide la API. */
export function horizonsUrl(params) {
  const query = Object.entries(params)
    .map(([key, value]) =>
      key === 'format'
        ? `format=${value}`
        : `${key}=${encodeURIComponent(`'${value}'`)}`,
    )
    .join('&');
  return `${HORIZONS_API}?${query}`;
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readIndex(indexPath) {
  try {
    return JSON.parse(await fs.readFile(indexPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { entries: {} };
    throw error;
  }
}

async function fetchOnce(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  if (response.status === 429 || response.status >= 500)
    return { retry: true, reason: `HTTP ${response.status}` };
  if (!response.ok)
    throw new Error(`Horizons HTTP ${response.status}: ${text.slice(0, 300)}`);
  if (!text.includes('$$SOE'))
    return {
      retry: true,
      reason: `sin $$SOE: ${text.slice(0, 200).replace(/\s+/g, ' ')}`,
    };
  return { text };
}

async function fetchWithBackoff(url, log) {
  let delay = FIRST_BACKOFF_MS;
  for (let attempt = 1; ; attempt += 1) {
    let outcome;
    try {
      outcome = await fetchOnce(url);
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
      outcome = { retry: true, reason: String(error?.message ?? error) };
    }
    if (!outcome.retry) return outcome.text;
    if (attempt >= MAX_ATTEMPTS)
      throw new Error(
        `Horizons no respondió tras ${attempt} intentos: ${outcome.reason}`,
      );
    log(`  reintento ${attempt} en ${delay / 1000} s (${outcome.reason})`);
    await sleep(delay);
    delay *= 2;
  }
}

/**
 * Crea un cliente con caché en `cacheDir`.
 * `get(name, params)` → texto crudo; registra {url, file, sha256, fetchedAt}.
 */
export async function createHorizonsClient(
  cacheDir,
  { log = console.log } = {},
) {
  await fs.mkdir(cacheDir, { recursive: true });
  const indexPath = path.join(cacheDir, 'index.json');
  const index = await readIndex(indexPath);
  let last = 0;
  const get = async (name, params) => {
    const url = horizonsUrl(params);
    const file = path.join(cacheDir, `${name}.txt`);
    const cached = index.entries[name];
    if (cached?.url === url) {
      const text = await fs.readFile(file, 'utf8').catch(() => null);
      if (text !== null && sha256(text) === cached.sha256) return text;
    }
    await sleep(Math.max(0, last + PAUSE_MS - Date.now()));
    log(`Horizons ${name}`);
    const text = await fetchWithBackoff(url, log);
    last = Date.now();
    await fs.writeFile(file, text);
    index.entries[name] = {
      url,
      file: path.basename(file),
      sha256: sha256(text),
      bytes: Buffer.byteLength(text),
      fetchedAt: new Date().toISOString(),
    };
    await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    return text;
  };
  return { get, index, indexPath };
}

/** Comprueba en la cabecera de la respuesta lo que el ledger declara. */
export function assertMoonVectorHeader(text, timeScale) {
  const required = [
    [
      /Target body name: Moon \(301\)\s+\{source: DE441\}/,
      'Luna 301 con DE441',
    ],
    [
      /Center body name: Earth \(399\)\s+\{source: DE441\}/,
      'centro Tierra 399',
    ],
    [/Output type\s*:\s*GEOMETRIC cartesian states/, 'vectores geométricos'],
    [/Output units\s*:\s*KM-S/, 'unidades km'],
    [/Reference frame\s*:\s*ICRF/, 'ICRF'],
    [new RegExp(`Start time\\s*:.*\\b${timeScale}\\b`), `escala ${timeScale}`],
  ];
  for (const [pattern, label] of required)
    if (!pattern.test(text)) throw new Error(`Cabecera Horizons sin ${label}`);
}

/** JD con 10 decimales para TLIST (8,6 µs). */
export const jdLiteral = (secondsFromJ2000) =>
  (2451545 + secondsFromJ2000 / 86400).toFixed(10);
