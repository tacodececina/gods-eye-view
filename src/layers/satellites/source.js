const GROUPS = new Set([
  'stations',
  'cubesat',
  'visual',
  'gps-ops',
  'glo-ops',
  'galileo',
  'geo',
  'starlink',
]);

/** Element format → proxy query suffix (TLE is the proxy default). */
const FORMAT_QUERIES = Object.freeze({ tle: '', omm: '?FORMAT=json' });
const CACHE_STATUSES = new Set(['HIT', 'MISS', 'STALE-ERROR', 'NONE']);

const readHeader = (response, name) => response.headers?.get?.(name) ?? null;

/**
 * The format the proxy actually delivered. A proxy that ignores FORMAT still
 * answers TLE text, so the content type wins and, without one, the body shape
 * decides: an OMM body is a JSON array.
 */
function receivedFormat(response, text, requested) {
  if (!response.ok) return requested;
  const contentType = String(readHeader(response, 'content-type') || '');
  if (/json/i.test(contentType)) return 'omm';
  if (/text\/plain/i.test(contentType)) return 'tle';
  return text.trimStart().startsWith('[') ? 'omm' : 'tle';
}

function fetchedAtOf(response) {
  const raw = readHeader(response, 'x-tle-fetched-at');
  const value = raw === null || raw === '' ? NaN : Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function cacheStatusOf(response) {
  const raw = readHeader(response, 'x-tle-cache');
  return CACHE_STATUSES.has(raw) ? raw : 'NONE';
}

/** Read catalog elements from the group endpoint using a supplied transport. */
export function createSatelliteSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    /**
     * @param {string} group CelesTrak group path.
     * @param {{signal?: AbortSignal, format?: 'tle'|'omm'}} [options]
     * @returns {Promise<{ok: boolean, status: number, text: string,
     *   body: string, format: 'tle'|'omm', cacheStatus: string,
     *   fetchedAt: number|null}>} `text` mirrors `body` for older callers.
     */
    async readGroup(group, { signal, format = 'tle' } = {}) {
      if (!GROUPS.has(group)) throw new TypeError('Unknown satellite group');
      if (!Object.hasOwn(FORMAT_QUERIES, format))
        throw new TypeError('Unknown satellite element format');
      signal?.throwIfAborted();
      const response = await fetchImpl(
        `/api/celestrak/${group}${FORMAT_QUERIES[format]}`,
        { signal },
      );
      const text = response.ok ? await response.text() : '';
      signal?.throwIfAborted();
      return {
        ok: response.ok,
        status: response.status,
        text,
        body: text,
        format: receivedFormat(response, text, format),
        cacheStatus: cacheStatusOf(response),
        fetchedAt: fetchedAtOf(response),
      };
    },
  };
}
