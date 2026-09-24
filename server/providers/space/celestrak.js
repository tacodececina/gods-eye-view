import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { celestrakGpUrl } from '../../../src/data/spaceProviderRequests.js';

/**
 * Vite plugin: CelesTrak GP proxy (legacy TLE text or OMM JSON).
 *
 * CelesTrak does not send CORS headers, so this middleware fetches
 * satellite element sets server-side and forwards them to the browser.
 * Upstream: https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=<tle|json>
 * Route: /api/celestrak/<group>[?FORMAT=json] (FORMAT defaults to tle).
 * Only ALLOWED_GROUPS are forwarded; any other well-formed group gets a JSON
 * 404 without an upstream call (a malformed group or format is a 400).
 *
 * CelesTrak asks clients not to re-fetch GP data more than ~every 2 h and
 * throttles offenders; every dev reload used to refetch every group. Cache TTL
 * 6 h, keyed and single-flighted by `${group}:${format}`; on upstream failure
 * the freshest stale copy of that same format is served (stale elements beat
 * an empty satellites layer). Responses carry `x-tle-cache`
 * (HIT|MISS|STALE-ERROR|NONE|ERROR) and, when a copy exists,
 * `x-tle-fetched-at` (epoch ms of the upstream fetch). No credential is used
 * or echoed. Pattern mirrors openSkyProxy's cache+serve-stale. Adapted from
 * skylight's TleStore (MIT).
 *
 * @returns {import('vite').Plugin}
 */
export function celestrakProxy() {
  // Groups the app requests: the core catalog (CATALOG_GROUPS paths in
  // src/layers/satellites/policy.js), the dense shell (DENSE_GROUP_PATH) and
  // the launches layer ('active'). Case-sensitive, as CelesTrak group names
  // are. Declared inside the plugin: the proxy-error fixtures evaluate this
  // function body in isolation.
  const ALLOWED_GROUPS = new Set([
    'stations',
    'cubesat',
    'visual',
    'gps-ops',
    'glo-ops',
    'galileo',
    'geo',
    'starlink',
    'active',
  ]);
  const TLE_TTL_MS = 6 * 3600_000;
  const CACHE_DIR = path.join(process.cwd(), '.gev-cache');
  const CONTENT_TYPES = { tle: 'text/plain', json: 'application/json' };
  const mem = new Map(); // `${group}:${format}` -> { at: epochMs, body: string }
  const inflight = new Map(); // same key -> Promise<{at, body}|null>

  // TLE keeps its historical file name so existing disk caches stay valid.
  // '.' can never appear in a group name, so other formats cannot collide.
  const diskPath = (group, format) =>
    path.join(
      CACHE_DIR,
      format === 'tle'
        ? `celestrak-${group}.json`
        : `celestrak-${group}.gp-${format}.json`,
    );

  async function readDisk(group, format) {
    try {
      const parsed = JSON.parse(
        await fsp.readFile(diskPath(group, format), 'utf8'),
      );
      if (typeof parsed?.body === 'string' && Number.isFinite(parsed?.at))
        return parsed;
    } catch {
      /* no disk cache yet */
    }
    return null;
  }

  async function writeDisk(group, format, entry) {
    try {
      await fsp.mkdir(CACHE_DIR, { recursive: true });
      await fsp.writeFile(
        diskPath(group, format),
        JSON.stringify(entry),
        'utf8',
      );
    } catch {
      console.warn('[celestrak-proxy] cache write failed');
    }
  }

  // An upstream error page is not an element set: reject it, keep the cache.
  function isValidBody(format, body) {
    if (format === 'tle') return /^1 /m.test(body);
    try {
      const records = JSON.parse(body);
      return (
        Array.isArray(records) &&
        records.length > 0 &&
        records.every(
          (record) =>
            record !== null &&
            typeof record === 'object' &&
            record.NORAD_CAT_ID !== undefined &&
            record.NORAD_CAT_ID !== null &&
            record.NORAD_CAT_ID !== '',
        )
      );
    } catch {
      return false;
    }
  }

  async function fetchUpstream(group, format) {
    const url = celestrakGpUrl(group, { format });
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(20000),
      // CelesTrak 403s bulk groups (e.g. `active`) unless the request carries a
      // descriptive User-Agent with a contact point.
      headers: {
        'User-Agent':
          'gods-eye-view-celestrak-proxy/1.0 (+https://github.com/bilawalsidhu/gods-eye-view)',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    if (!isValidBody(format, body)) throw new Error(`invalid ${format} body`);
    return { at: Date.now(), body };
  }

  /**
   * Parse `/<group>[?FORMAT=tle|json]`; `error` names the invalid part and
   * `notFound` marks a well-formed group outside ALLOWED_GROUPS.
   */
  function parseRoute(rawUrl) {
    const [group, query = ''] = String(rawUrl || '')
      .replace(/^\//, '')
      .split('?');
    if (!/^[a-z0-9-]+$/i.test(group)) return { error: 'invalid group' };
    if (!ALLOWED_GROUPS.has(group)) return { notFound: true };
    const requested = new URLSearchParams(query).get('FORMAT');
    const format = requested === null ? 'tle' : requested.toLowerCase();
    if (!Object.hasOwn(CONTENT_TYPES, format))
      return { error: 'invalid format' };
    return { group, format, key: `${group}:${format}` };
  }

  async function cachedEntry(route) {
    let entry = mem.get(route.key);
    if (!entry) {
      entry = await readDisk(route.group, route.format);
      if (entry) mem.set(route.key, entry);
    }
    return entry;
  }

  /** Stale or missing → refresh, single-flight per group and format. */
  function refresh(route) {
    if (!inflight.has(route.key)) {
      inflight.set(
        route.key,
        fetchUpstream(route.group, route.format)
          .then(async (fresh) => {
            mem.set(route.key, fresh);
            await writeDisk(route.group, route.format, fresh);
            return fresh;
          })
          .catch(() => {
            console.warn(
              '[celestrak-proxy] refresh failed — serving cache if any',
            );
            return null;
          })
          .finally(() => inflight.delete(route.key)),
      );
    }
    return inflight.get(route.key);
  }

  function createSender(res, format) {
    return (status, body, cacheStatus, entry = null) => {
      // Guard against a double-send (e.g. a throw AFTER a response already
      // went out routing into the catch's send): writeHead after headersSent
      // throws "Cannot set headers after they are sent".
      if (res.headersSent) return;
      const headers = {
        'Content-Type': status === 200 ? CONTENT_TYPES[format] : 'text/plain',
        'x-tle-cache': cacheStatus,
      };
      if (entry) headers['x-tle-fetched-at'] = String(entry.at);
      res.writeHead(status, headers);
      res.end(body);
    };
  }

  async function serve(route, send) {
    const now = Date.now();
    const entry = await cachedEntry(route);
    if (entry && now - entry.at < TLE_TTL_MS) {
      send(200, entry.body, 'HIT', entry);
      return;
    }
    const fresh = await refresh(route);
    if (fresh) {
      send(200, fresh.body, 'MISS', fresh);
    } else if (entry) {
      // Upstream down — stale elements beat an empty layer.
      send(200, entry.body, 'STALE-ERROR', entry);
    } else {
      send(502, 'celestrak fetch failed and no cache available', 'NONE');
    }
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/celestrak', async (req, res) => {
      const route = parseRoute(req.url);
      if (route.notFound) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unknown group' }));
        return;
      }
      if (route.error) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end(route.error);
        return;
      }
      const send = createSender(res, route.format);
      try {
        await serve(route, send);
      } catch {
        console.error('[celestrak-proxy] request failed');
        send(500, 'celestrak proxy error', 'ERROR');
      }
    });
  };
  return {
    name: 'celestrak-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
