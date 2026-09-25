/**
 * Núcleo sin red del generador de la tabla lunar P5: parseo de vectores
 * JPL Horizons, ajuste Chebyshev por mínimos cuadrados por segmento,
 * codificación EYMOON1 y validación con la MISMA evaluación del runtime
 * (src/layers/moon/ephemerisFormat.js, sobre coeficientes float32).
 */
import { createHash } from 'node:crypto';
import {
  HEADER_FIELDS,
  MOON_TABLE_HEADER_BYTES,
  MOON_TABLE_MAGIC,
  MOON_TABLE_VERSION,
  evaluateMoonTableKm,
} from '../../src/layers/moon/ephemerisFormat.js';

const HOUR_S = 3600;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MONTHS = Object.freeze({
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
});

/** «2021-Jan-01 00:30:00.0000» → ms de calendario (sin zona). */
export function horizonsCalendarMs(calendar) {
  const match =
    /^(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(
      calendar,
    );
  if (!match || !(match[2] in MONTHS))
    throw new Error(`Fecha Horizons ilegible: ${calendar}`);
  const [, y, mon, d, h, mi, s] = match;
  const whole = Math.floor(Number(s));
  return (
    Date.UTC(+y, MONTHS[mon], +d, +h, +mi, whole) +
    Math.round((Number(s) - whole) * 1e4) / 10
  );
}

function parseRow(line, timeScale) {
  const cells = line.split(',').map((cell) => cell.trim());
  const jd = Number(cells[0]);
  const calendar = cells[1].replace(/^A\.D\. /, '');
  const ms = horizonsCalendarMs(calendar);
  const r = [Number(cells[2]), Number(cells[3]), Number(cells[4])];
  const v = [Number(cells[5]), Number(cells[6]), Number(cells[7])];
  if (![jd, ...r, ...v].every(Number.isFinite))
    throw new Error(`Fila Horizons no numérica: ${line}`);
  const seconds = (ms - J2000_MS) / 1000;
  if (Math.abs((jd - 2451545) * 86400 - seconds) > 1e-3)
    throw new Error(`JD y calendario no cuadran: ${line}`);
  const row = { jd, calendar, r, v };
  return timeScale === 'TDB'
    ? { ...row, tdb: seconds }
    : { ...row, utcIso: new Date(ms).toISOString() };
}

/**
 * Filas `$$SOE..$$EOE` de un CSV de vectores (VEC_TABLE=2). El tiempo sale
 * del calendario (exacto), contrastado con el JD (±1 ms).
 * @param {'TDB'|'UT'} options.timeScale
 */
export function parseHorizonsVectors(text, { timeScale }) {
  if (!['TDB', 'UT'].includes(timeScale))
    throw new Error(`Escala de tiempo no soportada: ${timeScale}`);
  const start = text.indexOf('$$SOE');
  const end = text.indexOf('$$EOE');
  if (start === -1 || end === -1 || end < start)
    throw new Error('Respuesta de Horizons sin bloque $$SOE/$$EOE');
  if (!/Reference frame\s*:\s*ICRF\b/.test(text))
    throw new Error('La respuesta de Horizons no está en ICRF');
  return text
    .slice(start + 5, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseRow(line, timeScale));
}

/** Mínimos cuadrados (ecuaciones normales + eliminación) para n pequeño. */
function leastSquares(rows, rhs) {
  const n = rows[0].length;
  const m = Array.from({ length: n }, () => new Float64Array(n));
  const y = new Float64Array(n);
  rows.forEach((row, r) => {
    for (let i = 0; i < n; i += 1) {
      y[i] += row[i] * rhs[r];
      for (let j = 0; j < n; j += 1) m[i][j] += row[i] * row[j];
    }
  });
  for (let i = 0; i < n; i += 1)
    for (let k = i + 1; k < n; k += 1) {
      const f = m[k][i] / m[i][i];
      for (let j = i; j < n; j += 1) m[k][j] -= f * m[i][j];
      y[k] -= f * y[i];
    }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = y[i];
    for (let j = i + 1; j < n; j += 1) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x;
}

function chebyshevRow(x, order) {
  const t = [1, x];
  for (let k = 2; k <= order; k += 1) t.push(2 * x * t[k - 1] - t[k - 2]);
  return t.slice(0, order + 1);
}

/** Muestras en punto de hora (las que entran en el ajuste) de un segmento. */
function segmentFitSamples(byTime, start, segmentSeconds) {
  const out = [];
  for (let t = start; t <= start + segmentSeconds; t += HOUR_S) {
    const sample = byTime.get(t);
    if (!sample)
      throw new Error(
        `Faltan muestras (hueco) en t=${t} s TDB del segmento ${start}`,
      );
    out.push(sample);
  }
  return out;
}

function fitSegment(fit, start, segmentSeconds, order) {
  const rows = fit.map((s) =>
    chebyshevRow((2 * (s.tdb - start)) / segmentSeconds - 1, order),
  );
  return [0, 1, 2].map((axis) =>
    leastSquares(
      rows,
      fit.map((s) => s.r[axis]),
    ),
  );
}

/**
 * Ajuste Chebyshev por segmentos con las muestras a hora en punto
 * (t − t0 múltiplo de 3600 s). Coeficientes redondeados a float32.
 */
export function buildMoonTable(samples, options) {
  const { t0, t1, segmentSeconds, order } = options;
  if (segmentSeconds % HOUR_S !== 0)
    throw new Error('El segmento debe ser múltiplo de 1 h');
  const byTime = new Map(
    samples.filter((s) => (s.tdb - t0) % HOUR_S === 0).map((s) => [s.tdb, s]),
  );
  const segmentCount = Math.ceil((t1 - t0) / segmentSeconds);
  const stride = order + 1;
  const coefficients = new Float64Array(segmentCount * 3 * stride);
  const used = new Set();
  for (let s = 0; s < segmentCount; s += 1) {
    const start = t0 + s * segmentSeconds;
    const fit = segmentFitSamples(byTime, start, segmentSeconds);
    fit.forEach((sample) => used.add(sample.tdb));
    fitSegment(fit, start, segmentSeconds, order).forEach((axis, a) =>
      axis.forEach((c, k) => {
        coefficients[s * 3 * stride + a * stride + k] = Math.fround(c);
      }),
    );
  }
  return Object.freeze({
    ...options,
    segmentCount,
    coefficients,
    fitSamples: used.size,
  });
}

function writeText(bytes, [offset, length], text) {
  const encoded = new TextEncoder().encode(text);
  if (encoded.length > length)
    throw new Error(`Campo demasiado largo: ${text}`);
  bytes.set(encoded, offset);
}

/** Tabla → bytes EYMOON1 (cabecera + carga float32 LE + sha256 de la carga). */
export function encodeMoonTable(table) {
  const payloadBytes = table.coefficients.length * 4;
  const bytes = new Uint8Array(MOON_TABLE_HEADER_BYTES + payloadBytes);
  const view = new DataView(bytes.buffer);
  writeText(bytes, HEADER_FIELDS.magic, MOON_TABLE_MAGIC);
  view.setUint32(HEADER_FIELDS.version, MOON_TABLE_VERSION, true);
  view.setUint32(HEADER_FIELDS.headerBytes, MOON_TABLE_HEADER_BYTES, true);
  writeText(bytes, HEADER_FIELDS.source, table.source);
  view.setFloat64(HEADER_FIELDS.t0, table.t0, true);
  view.setFloat64(HEADER_FIELDS.t1, table.t1, true);
  view.setFloat64(HEADER_FIELDS.segmentSeconds, table.segmentSeconds, true);
  view.setUint32(HEADER_FIELDS.order, table.order, true);
  view.setUint32(HEADER_FIELDS.segmentCount, table.segmentCount, true);
  writeText(bytes, HEADER_FIELDS.frame, table.frame);
  writeText(bytes, HEADER_FIELDS.units, table.units);
  view.setUint32(HEADER_FIELDS.payloadBytes, payloadBytes, true);
  table.coefficients.forEach((c, i) =>
    view.setFloat32(MOON_TABLE_HEADER_BYTES + i * 4, c, true),
  );
  const payload = bytes.subarray(MOON_TABLE_HEADER_BYTES);
  bytes.set(
    createHash('sha256').update(payload).digest(),
    HEADER_FIELDS.sha256[0],
  );
  return bytes;
}

const RAD_TO_ARCMIN = (180 / Math.PI) * 60;

/** Error de la tabla frente a una muestra de referencia (km y ′). */
export function sampleError(table, sample, scratch = [0, 0, 0]) {
  const p = evaluateMoonTableKm(table, sample.tdb, scratch);
  const q = sample.r;
  const errKm = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const cos =
    (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) /
    (Math.hypot(p[0], p[1], p[2]) * Math.hypot(q[0], q[1], q[2]));
  return { errKm, errArcmin: Math.acos(Math.min(1, cos)) * RAD_TO_ARCMIN };
}

/**
 * Valida la tabla contra muestras NO usadas en el ajuste.
 * @returns {{ok, count, maxKm, maxArcmin, rmsKm, worst}}
 */
export function validateMoonTable(table, samples, { maxKm, maxArcmin }) {
  const scratch = [0, 0, 0];
  let worst = null;
  let sumSq = 0;
  let maxA = 0;
  for (const sample of samples) {
    const e = sampleError(table, sample, scratch);
    sumSq += e.errKm ** 2;
    maxA = Math.max(maxA, e.errArcmin);
    if (!worst || e.errKm > worst.errKm) worst = { tdb: sample.tdb, ...e };
  }
  const count = samples.length;
  const max = worst?.errKm ?? 0;
  return {
    ok: count > 0 && max <= maxKm && maxA <= maxArcmin,
    count,
    maxKm: max,
    maxArcmin: maxA,
    rmsKm: count ? Math.sqrt(sumSq / count) : 0,
    worst,
  };
}
