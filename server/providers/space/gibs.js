import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { readResponseBytesCapped } from '../common/http.js';

/**
 * Capa nocturna de la escena (fase visual T2, §2.4): NASA GIBS
 * «Earth at Night (2012, VIIRS, Suomi NPP)». Fijada con GetCapabilities
 * (EPSG:3857, best) el 2026-09-25: identificador VIIRS_CityLights_2012,
 * image/jpeg, GoogleMapsCompatible_Level8, sin dimensión temporal. Es un
 * compuesto de 2012: la app lo rotula «compuesto, no en vivo».
 */
export const GIBS_NIGHT_LAYER = Object.freeze({
  id: 'VIIRS_CityLights_2012',
  title: 'Earth at Night (2012, VIIRS, Suomi NPP)',
  year: 2012,
  tileMatrixSet: 'GoogleMapsCompatible_Level8',
  maxLevel: 8,
  format: 'image/jpeg',
});

const ORIGIN = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
/** Un compuesto estático: se refresca muy de tarde en tarde. */
const DEFAULT_TTL_MS = 30 * 24 * 3600_000;
const BROWSER_MAX_AGE_S = 7 * 24 * 3600;
const MAX_TILE_BYTES = 2 * 1024 * 1024;
const MAX_MEMORY_TILES = 512;
const FETCH_TIMEOUT_MS = 20_000;

/** URL de origen de una tesela ya validada (única capa en lista blanca). */
export function gibsNightTileUrl({ z, y, x }) {
  return `${ORIGIN}/${GIBS_NIGHT_LAYER.id}/default/default/${GIBS_NIGHT_LAYER.tileMatrixSet}/${z}/${y}/${x}.jpeg`;
}

/**
 * `/{z}/{y}/{x}.jpg` con enteros canónicos (sin ceros a la izquierda), 0 ≤ z
 * ≤ 8 y x, y dentro de la matriz; cualquier otra cosa (consulta, otra capa,
 * `..`) es null.
 */
export function parseGibsNightRoute(rawUrl) {
  const match =
    /^\/(0|[1-9]\d?)\/(0|[1-9]\d{0,2})\/(0|[1-9]\d{0,2})\.jpg$/.exec(
      String(rawUrl ?? ''),
    );
  if (!match) return null;
  const [z, y, x] = match.slice(1).map(Number);
  const span = 2 ** z;
  if (z > GIBS_NIGHT_LAYER.maxLevel || y >= span || x >= span) return null;
  return { z, y, x, key: `${z}/${y}/${x}` };
}

const isJpeg = (bytes) =>
  bytes?.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;

/** Caché en disco por defecto: .gev-cache/gibs-night/z-y-x.jpg (mtime = at). */
function fileDisk(dir) {
  const file = (key) => path.join(dir, `${key.replaceAll('/', '-')}.jpg`);
  return {
    async read(key) {
      try {
        const [body, info] = await Promise.all([
          fsp.readFile(file(key)),
          fsp.stat(file(key)),
        ]);
        return isJpeg(body) ? { at: info.mtimeMs, body } : null;
      } catch {
        return null;
      }
    },
    async write(key, entry) {
      try {
        await fsp.mkdir(dir, { recursive: true });
        await fsp.writeFile(file(key), entry.body);
      } catch {
        console.warn('[gibs-night-proxy] cache write failed');
      }
    },
  };
}

/** LRU por orden de inserción de Map. */
function memoryCache(limit) {
  const map = new Map();
  return {
    get(key) {
      const entry = map.get(key);
      if (entry) {
        map.delete(key);
        map.set(key, entry);
      }
      return entry ?? null;
    },
    set(key, entry) {
      map.delete(key);
      map.set(key, entry);
      while (map.size > limit) map.delete(map.keys().next().value);
    },
  };
}

function createSender(res, method) {
  return (status, { body = null, cache, json = null } = {}) => {
    if (res.headersSent) return;
    if (json) {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(json));
      return;
    }
    res.writeHead(status, {
      'Content-Type': GIBS_NIGHT_LAYER.format,
      'Content-Length': String(body.length),
      'Cache-Control': `public, max-age=${BROWSER_MAX_AGE_S}`,
      'x-gibs-cache': cache,
    });
    res.end(method === 'HEAD' ? undefined : body);
  };
}

/**
 * Vite/runtime plugin: GET|HEAD /api/gibs/night/{z}/{y}/{x}.jpg.
 * Caché LRU por proceso y en disco (TTL largo), single-flight por z/y/x;
 * ante un fallo del origen sirve la copia rancia o un 502 honesto. Nunca
 * reenvía cabeceras del origen.
 * @param {{fetchImpl?: typeof fetch, disk?: {read: Function, write: Function},
 *   now?: () => number, ttlMs?: number, maxEntries?: number}} [options]
 *   Costuras de prueba.
 * @returns {import('vite').Plugin}
 */
export function gibsNightProxy({
  fetchImpl = globalThis.fetch,
  disk = fileDisk(path.join(process.cwd(), '.gev-cache', 'gibs-night')),
  now = Date.now,
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = MAX_MEMORY_TILES,
} = {}) {
  const memory = memoryCache(maxEntries);
  const inflight = new Map();

  async function fetchTile(route) {
    const response = await fetchImpl(gibsNightTileUrl(route), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'eyeinsky-gibs-night-proxy/1.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = Buffer.from(
      await readResponseBytesCapped(response, MAX_TILE_BYTES),
    );
    if (!isJpeg(body)) throw new Error('not a JPEG tile');
    return { at: now(), body };
  }

  function refresh(route) {
    if (!inflight.has(route.key))
      inflight.set(
        route.key,
        fetchTile(route)
          .then(async (entry) => {
            memory.set(route.key, entry);
            await disk.write(route.key, entry);
            return entry;
          })
          .catch(() => {
            console.warn('[gibs-night-proxy] tile fetch failed');
            return null;
          })
          .finally(() => inflight.delete(route.key)),
      );
    return inflight.get(route.key);
  }

  async function cached(route) {
    const hot = memory.get(route.key);
    if (hot) return hot;
    const cold = await disk.read(route.key);
    if (cold) memory.set(route.key, cold);
    return cold;
  }

  async function serve(route, send) {
    const entry = await cached(route);
    if (entry && now() - entry.at < ttlMs) {
      send(200, { body: entry.body, cache: 'HIT' });
      return;
    }
    const fresh = await refresh(route);
    if (fresh) send(200, { body: fresh.body, cache: 'MISS' });
    else if (entry) send(200, { body: entry.body, cache: 'STALE-ERROR' });
    else send(502, { json: { error: 'Night-lights tile unavailable' } });
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/gibs/night', async (req, res) => {
      const method = String(req.method || 'GET').toUpperCase();
      const send = createSender(res, method);
      if (method !== 'GET' && method !== 'HEAD') {
        send(405, { json: { error: 'Method not allowed' } });
        return;
      }
      const route = parseGibsNightRoute(req.url);
      if (!route) {
        send(400, { json: { error: 'Invalid tile' } });
        return;
      }
      try {
        await serve(route, send);
      } catch {
        console.error('[gibs-night-proxy] request failed');
        send(500, { json: { error: 'Night-lights proxy error' } });
      }
    });
  };
  return {
    name: 'gibs-night-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
