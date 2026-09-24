import { json2satrec, twoline2satrec } from 'satellite.js';
import {
  SAT_ELEMENT_HIGH_EXPIRED_MS,
  SAT_ELEMENT_HIGH_FRESH_MS,
  SAT_ELEMENT_LEO_EXPIRED_MS,
  SAT_ELEMENT_LEO_FRESH_MS,
  SAT_ELEMENT_LEO_MIN_REV_PER_DAY,
} from './policy.js';

/**
 * Canonical orbital element registry (P4 T1). Legacy TLE text and CelesTrak
 * OMM JSON both become one record shape, keyed by an exact integer NORAD id.
 * SGP4 (satellite.js) stays the only source of position; this module only
 * builds satrecs and labels their provenance and age.
 */

const DAY_MS = 86_400_000;
const REV_PER_DAY_PER_RAD_PER_MIN = 1440 / (2 * Math.PI);
const ELEMENT_FORMATS = new Set(['tle', 'omm']);
const CACHE_STATUSES = new Set(['HIT', 'MISS', 'STALE-ERROR', 'NONE']);
const OMM_EPOCH =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z?$/;

/**
 * Normalize a NORAD catalogue number to a safe positive integer.
 * Decimal, exponent, hex, signed and Alpha-5 (e.g. 'A1234') values return
 * null: nothing is truncated and no number is invented.
 * @param {unknown} value Number or digit string.
 * @returns {number|null} Exact integer id, or null when not representable.
 */
export function normalizeNoradId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  return normalizeNoradId(Number(text));
}

/**
 * UTC epoch of a satrec from its two-digit year and fractional day of year.
 * Years 57–99 are 19xx and 00–56 are 20xx, as in the TLE convention.
 * @param {{epochyr?: number, epochdays?: number}|null|undefined} satrec
 * @returns {number|null} Epoch in epoch-milliseconds, or null when invalid.
 */
export function elementEpochMs(satrec) {
  const yr = satrec?.epochyr;
  const days = satrec?.epochdays;
  if (!Number.isInteger(yr) || yr < 0 || yr > 99) return null;
  if (!Number.isFinite(days) || days < 1 || days >= 367) return null;
  const year = yr < 57 ? 2000 + yr : 1900 + yr;
  return Date.UTC(year, 0, 1) + (days - 1) * DAY_MS;
}

/**
 * Parse a CelesTrak OMM EPOCH ('YYYY-MM-DDTHH:MM:SS.ffffff', UTC, optional Z).
 * @param {unknown} epoch
 * @returns {number|null} Epoch-milliseconds (sub-millisecond kept), or null.
 */
function ommEpochMs(epoch) {
  const match = typeof epoch === 'string' ? OMM_EPOCH.exec(epoch.trim()) : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 60) return null;
  const fractionMs = match[7] ? Number(`0.${match[7]}`) * 1000 : 0;
  return Date.UTC(year, month - 1, day, hour, minute, second) + fractionMs;
}

/**
 * Classify element age against the regime thresholds in policy.js.
 * @param {{elementEpochMs: number, now: number, meanMotionRevPerDay: number}} input
 * @returns {'vigente'|'envejecida'|'caducada'|'futura'|null} null when any
 *   input is missing or not finite.
 */
export function classifyElementAge({
  elementEpochMs,
  now,
  meanMotionRevPerDay,
}) {
  const inputs = [elementEpochMs, now, meanMotionRevPerDay];
  if (!inputs.every((value) => Number.isFinite(value))) return null;
  if (meanMotionRevPerDay <= 0) return null;
  const ageMs = now - elementEpochMs;
  if (ageMs < 0) return 'futura';
  const leo = meanMotionRevPerDay > SAT_ELEMENT_LEO_MIN_REV_PER_DAY;
  const freshMs = leo ? SAT_ELEMENT_LEO_FRESH_MS : SAT_ELEMENT_HIGH_FRESH_MS;
  const expiredMs = leo
    ? SAT_ELEMENT_LEO_EXPIRED_MS
    : SAT_ELEMENT_HIGH_EXPIRED_MS;
  if (ageMs < freshMs) return 'vigente';
  if (ageMs > expiredMs) return 'caducada';
  return 'envejecida';
}

/**
 * Split three-line TLE text into `{name, line1, line2}` records. Same rule the
 * layer has always used: name line, then lines starting '1 ' and '2 '.
 * @param {string} text
 * @returns {Array<{name: string, line1: string, line2: string}>}
 */
export function parseTleText(text) {
  const lines = String(text ?? '')
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const result = [];
  for (let i = 0; i < lines.length - 2; i += 3) {
    const [name, line1, line2] = lines.slice(i, i + 3);
    if (line1.startsWith('1 ') && line2.startsWith('2 ')) {
      result.push({ name, line1, line2 });
    }
  }
  return result;
}

/** Decode an OMM body (JSON text or an already-decoded array) to records. */
function ommRecords(body) {
  if (Array.isArray(body)) return body;
  if (typeof body !== 'string') return [];
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Split a response body into raw element records for `elementFromRecord`.
 * @param {'tle'|'omm'} format
 * @param {unknown} body TLE text, OMM JSON text or a decoded OMM array.
 * @returns {Array<object>}
 */
export function splitElementRecords(format, body) {
  assertElementFormat(format);
  if (format === 'omm') return ommRecords(body);
  return typeof body === 'string' ? parseTleText(body) : [];
}

function assertElementFormat(format) {
  if (!ELEMENT_FORMATS.has(format)) {
    throw new TypeError(`Unknown element format: ${String(format)}`);
  }
}

/** Build a TLE satrec, or null when it is not a valid, identifiable set. */
function tleSource(record) {
  const satrec = twoline2satrec(record.line1, record.line2);
  if (!satrec || satrec.error !== 0) return null;
  return {
    satrec,
    noradId: normalizeNoradId(satrec.satnum),
    epochMs: elementEpochMs(satrec),
    name: String(record.name ?? '').trim(),
  };
}

/** Build an OMM satrec, or null when the record is not usable. */
function ommSource(record) {
  if (!record || typeof record !== 'object') return null;
  const noradId = normalizeNoradId(record.NORAD_CAT_ID);
  const epochMs = ommEpochMs(record.EPOCH);
  if (noradId === null || epochMs === null) return null;
  const satrec = json2satrec(record);
  if (!satrec || satrec.error !== 0) return null;
  const name = String(record.OBJECT_NAME ?? '').trim();
  return { satrec, noradId, epochMs, name };
}

/** Clamp caller-supplied provenance to the documented value sets. */
function normalizeMeta({ group, fetchedAt, cacheStatus, now }) {
  return {
    group,
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : null,
    cacheStatus: CACHE_STATUSES.has(cacheStatus) ? cacheStatus : 'NONE',
    now: Number.isFinite(now) ? now : Date.now(),
  };
}

/**
 * Convert one raw record into a canonical element entry.
 * @param {'tle'|'omm'} format
 * @param {object} record Output of `splitElementRecords`.
 * @param {{group: string, fetchedAt?: number, cacheStatus?: string, now?: number}} meta
 * @returns {Readonly<object>|null} Canonical entry, or null when rejected.
 */
export function elementFromRecord(format, record, meta) {
  assertElementFormat(format);
  let source = null;
  try {
    source = format === 'omm' ? ommSource(record) : tleSource(record);
  } catch {
    return null;
  }
  if (!source || source.noradId === null || source.epochMs === null) {
    return null;
  }
  if (!Number.isFinite(source.satrec.no)) return null;
  const { group, fetchedAt, cacheStatus, now } = normalizeMeta(meta ?? {});
  return Object.freeze({
    noradId: source.noradId,
    name: source.name,
    satrec: source.satrec,
    group,
    elementFormat: format,
    elementEpochMs: source.epochMs,
    fetchedAt,
    cacheStatus,
    stale: cacheStatus === 'STALE-ERROR',
    elementAge: classifyElementAge({
      elementEpochMs: source.epochMs,
      now,
      meanMotionRevPerDay: source.satrec.no * REV_PER_DAY_PER_RAD_PER_MIN,
    }),
  });
}

/**
 * Parse a TLE or OMM body into canonical element entries.
 * `stale` is provenance: true when the proxy served STALE-ERROR. Element age
 * comes from the element epoch (`elementAge`), never from `fetchedAt`.
 * @param {{format: 'tle'|'omm', body: unknown, group: string,
 *   fetchedAt?: number|null, cacheStatus?: string, now?: number}} input
 * @returns {Array<Readonly<{noradId: number, name: string, satrec: object,
 *   group: string, elementFormat: 'tle'|'omm', elementEpochMs: number,
 *   fetchedAt: number|null, cacheStatus: 'HIT'|'MISS'|'STALE-ERROR'|'NONE',
 *   stale: boolean, elementAge: string|null}>>}
 */
export function parseSatelliteElements({
  format,
  body,
  group,
  fetchedAt = null,
  cacheStatus = 'NONE',
  now = Date.now(),
}) {
  const meta = { group, fetchedAt, cacheStatus, now };
  return splitElementRecords(format, body)
    .map((record) => elementFromRecord(format, record, meta))
    .filter((entry) => entry !== null);
}

/**
 * Keep the first entry per NORAD id, in input order (first group wins).
 * Entries without a valid id are dropped, so no NaN key can ever collapse
 * distinct objects in a Map or Set.
 * @template {{noradId: unknown}} T
 * @param {Iterable<T>} entries
 * @returns {T[]}
 */
export function dedupeElementsByNorad(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries ?? []) {
    const noradId = normalizeNoradId(entry?.noradId);
    if (noradId === null || seen.has(noradId)) continue;
    seen.add(noradId);
    result.push(entry);
  }
  return result;
}

/**
 * The layer catalog record for a canonical element: the fields the layer has
 * always read (`name`, `satrec`, `group`) plus element provenance. Element age
 * is not stored — it changes with time and is re-derived from the epoch.
 * @param {ReturnType<typeof elementFromRecord>} entry
 * @returns {{name: string, satrec: object, group: string,
 *   elementFormat: string, elementEpochMs: number,
 *   fetchedAt: number|null, cacheStatus: string}}
 */
export function catalogRecordFromElement(entry) {
  return {
    name: entry.name,
    satrec: entry.satrec,
    group: entry.group,
    elementFormat: entry.elementFormat,
    elementEpochMs: entry.elementEpochMs,
    fetchedAt: entry.fetchedAt,
    cacheStatus: entry.cacheStatus,
  };
}
