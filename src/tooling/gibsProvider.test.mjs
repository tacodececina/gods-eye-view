/**
 * Proxy de luces nocturnas NASA GIBS (fase visual T2, §2.4):
 * GET /api/gibs/night/{z}/{y}/{x}.jpg → una sola capa en lista blanca
 * (VIIRS_CityLights_2012, GoogleMapsCompatible_Level8), z 0–8, caché LRU por
 * proceso y en disco, single-flight, stale o 502 honesto, sin cabeceras del
 * origen. Montado también por el runtime de producción.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GIBS_NIGHT_LAYER,
  gibsNightProxy,
  gibsNightTileUrl,
  parseGibsNightRoute,
} from 'gods-eye-view/server/providers/space';
import { localProviderPlugins } from '../../server/providers/local.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

function install(plugin, preview = false) {
  const routes = new Map();
  plugin[preview ? 'configurePreviewServer' : 'configureServer']({
    middlewares: {
      use(route, handler) {
        routes.set(route, handler);
      },
    },
  });
  return async (url, method = 'GET') => {
    const res = {
      headersSent: false,
      writeHead(status, headers) {
        Object.assign(this, { status, headers, headersSent: true });
      },
      end(body) {
        this.body = body;
      },
    };
    await routes.get('/api/gibs/night')({ url, method }, res);
    return res;
  };
}

/** Disco en memoria: el proxy nunca toca .gev-cache en los tests. */
const memoryDisk = () => {
  const files = new Map();
  return {
    files,
    read: async (key) => files.get(key) ?? null,
    write: async (key, entry) => {
      files.set(key, entry);
    },
  };
};

const upstream = (body = JPEG, init = {}) =>
  new Response(body, {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'set-cookie': 'origin=secret',
      server: 'origin-internals',
    },
    ...init,
  });

test('la capa y la matriz están fijadas; la URL de origen es la verificada', () => {
  assert.equal(GIBS_NIGHT_LAYER.id, 'VIIRS_CityLights_2012');
  assert.equal(GIBS_NIGHT_LAYER.year, 2012);
  assert.equal(GIBS_NIGHT_LAYER.maxLevel, 8);
  assert.equal(
    gibsNightTileUrl({ z: 3, y: 2, x: 5 }),
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/default/GoogleMapsCompatible_Level8/3/2/5.jpeg',
  );
});

test('rechaza z > 8, coordenadas fuera de rango, rutas ajenas y path traversal', () => {
  assert.deepEqual(parseGibsNightRoute('/3/2/5.jpg'), {
    z: 3,
    y: 2,
    x: 5,
    key: '3/2/5',
  });
  for (const bad of [
    '/9/0/0.jpg',
    '/3/8/0.jpg',
    '/3/0/8.jpg',
    '/-1/0/0.jpg',
    '/3/2/5.png',
    '/3/2/5.jpg?layer=VIIRS_Black_Marble',
    '/../../etc/passwd',
    '/3/2/..%2F5.jpg',
    '/03/2/5.jpg',
    '',
  ])
    assert.equal(parseGibsNightRoute(bad), null, bad);
});

test('sirve la tesela con Cache-Control público y sin cabeceras del origen', async () => {
  const disk = memoryDisk();
  const request = install(
    gibsNightProxy({ fetchImpl: async () => upstream(), disk }),
  );
  const res = await request('/2/1/1.jpg');
  assert.equal(res.status, 200);
  assert.equal(res.headers['Content-Type'], 'image/jpeg');
  assert.match(res.headers['Cache-Control'], /^public, max-age=\d+/);
  assert.equal(res.headers['x-gibs-cache'], 'MISS');
  assert.equal(res.headers['set-cookie'], undefined);
  assert.equal(res.headers.server, undefined);
  assert.deepEqual(Buffer.from(res.body), JPEG);
  assert.ok(disk.files.has('2/1/1'), 'la clave de caché es z/y/x');
});

test('single-flight por clave y HIT de memoria después', async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const request = install(
    gibsNightProxy({
      fetchImpl: async () => {
        calls += 1;
        await gate;
        return upstream();
      },
      disk: memoryDisk(),
    }),
  );
  const pending = [request('/1/0/1.jpg'), request('/1/0/1.jpg')];
  release();
  const [a, b] = await Promise.all(pending);
  assert.equal(calls, 1);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const again = await request('/1/0/1.jpg');
  assert.equal(again.headers['x-gibs-cache'], 'HIT');
  assert.equal(calls, 1);
});

test('fallo de origen: stale si hay copia, 502 honesto si no', async () => {
  let now = 1_000;
  let fail = false;
  const disk = memoryDisk();
  const plugin = gibsNightProxy({
    fetchImpl: async () => {
      if (fail) throw new Error('upstream down');
      return upstream();
    },
    disk,
    now: () => now,
    ttlMs: 10,
  });
  const request = install(plugin);
  assert.equal((await request('/0/0/0.jpg')).status, 200);
  fail = true;
  now += 1_000;
  const stale = await request('/0/0/0.jpg');
  assert.equal(stale.status, 200);
  assert.equal(stale.headers['x-gibs-cache'], 'STALE-ERROR');
  const missing = await request('/0/0/0.jpg'.replace('0/0/0', '1/1/1'));
  assert.equal(missing.status, 502);
  assert.equal(missing.headers['Content-Type'], 'application/json');
  assert.equal(missing.headers['set-cookie'], undefined);
});

test('un cuerpo que no es JPEG no se cachea ni se sirve como tesela', async () => {
  const disk = memoryDisk();
  const request = install(
    gibsNightProxy({
      fetchImpl: async () => upstream(Buffer.from('<html>error</html>')),
      disk,
    }),
  );
  const res = await request('/2/1/1.jpg');
  assert.equal(res.status, 502);
  assert.equal(disk.files.size, 0);
});

test('solo GET/HEAD; ruta inválida → 400 sin llamar al origen', async () => {
  let calls = 0;
  const request = install(
    gibsNightProxy({
      fetchImpl: async () => {
        calls += 1;
        return upstream();
      },
      disk: memoryDisk(),
    }),
  );
  assert.equal((await request('/2/1/1.jpg', 'POST')).status, 405);
  assert.equal((await request('/12/1/1.jpg')).status, 400);
  assert.equal(calls, 0);
});

test('el runtime local y el de producción montan el proxy (preview incluido)', async () => {
  const plugins = localProviderPlugins();
  const gibs = plugins.filter((plugin) => plugin.name === 'gibs-night-proxy');
  assert.equal(gibs.length, 1);
  assert.equal(typeof gibs[0].configureServer, 'function');
  assert.equal(typeof gibs[0].configurePreviewServer, 'function');
});
