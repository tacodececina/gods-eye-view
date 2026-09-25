import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOON_TABLE_PATH,
  createLazyMoonSource,
  moonTableUrl,
} from './moonSource.js';

const VALID_FROM = 0;
const VALID_TO = 100;
const flush = () => new Promise((resolve) => setImmediate(resolve));

const fakeTable = () => ({
  source: 'DE441',
  validFrom: VALID_FROM,
  validTo: VALID_TO,
  moonPositionIcrf: (t, r) =>
    t < VALID_FROM || t > VALID_TO
      ? {
          status: 'out-of-range',
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          source: 'DE441',
        }
      : { status: 'ok', position: Object.assign(r, { x: 1 }), source: 'DE441' },
});
const fakeFallback = () => ({
  source: 'astronomy-engine',
  toleranceKm: 20,
  moonPositionIcrf: (t, r) => ({
    status: 'ok',
    position: Object.assign(r, { x: 2 }),
    source: 'astronomy-engine',
    toleranceKm: 20,
  }),
});

/** Cargadores diferidos que el test resuelve a mano. */
function deferredLoaders() {
  const calls = { table: 0, fallback: 0 };
  const pending = {};
  const make = (key) => () => {
    calls[key] += 1;
    return new Promise((resolve, reject) => {
      pending[key] = { resolve, reject };
    });
  };
  return {
    calls,
    pending,
    loadTable: make('table'),
    loadFallback: make('fallback'),
  };
}

test('la URL de la tabla cuelga de BASE_URL', () => {
  assert.equal(MOON_TABLE_PATH, 'data/moon-de441-2021-2040.bin');
  assert.equal(moonTableUrl('/'), '/data/moon-de441-2021-2040.bin');
  assert.equal(moonTableUrl('/eye/'), '/eye/data/moon-de441-2021-2040.bin');
});

test('dentro del rango solo se pide la tabla: el respaldo (astronomy-engine) no se descarga', async () => {
  const loaders = deferredLoaders();
  let changes = 0;
  const source = createLazyMoonSource({
    ...loaders,
    onChange: () => {
      changes += 1;
    },
  });
  const r = { x: 0, y: 0, z: 0 };
  assert.deepEqual(source.moonPosition(50, r), {
    status: 'unavailable',
    reason: 'loading',
  });
  source.moonPosition(50, r);
  assert.equal(loaders.calls.table, 1, 'una sola petición de tabla');
  loaders.pending.table.resolve(fakeTable());
  await flush();
  assert.equal(source.moonPosition(50, r).source, 'DE441');
  assert.equal(loaders.calls.fallback, 0, 'sin respaldo dentro del rango');
  assert.equal(changes, 1);
  assert.deepEqual(source.getSources(), { table: 'ready', fallback: 'idle' });
});

test('fuera del rango pide el respaldo una vez; mientras llega, out-of-range honesto', async () => {
  const loaders = deferredLoaders();
  const source = createLazyMoonSource(loaders);
  const r = { x: 0, y: 0, z: 0 };
  source.moonPosition(500, r);
  loaders.pending.table.resolve(fakeTable());
  await flush();
  assert.equal(source.moonPosition(500, r).status, 'out-of-range');
  source.moonPosition(501, r);
  assert.equal(loaders.calls.fallback, 1);
  loaders.pending.fallback.resolve(fakeFallback());
  await flush();
  const sample = source.moonPosition(500, r);
  assert.equal(sample.source, 'astronomy-engine');
  assert.equal(sample.tableRange.validTo, VALID_TO);
  assert.equal(source.moonPosition(50, r).source, 'DE441', 'la tabla manda');
});

test('si la tabla falla pasa al respaldo rotulado y avisa del error', async () => {
  const loaders = deferredLoaders();
  const errors = [];
  const source = createLazyMoonSource({
    ...loaders,
    onError: (error) => errors.push(error.message),
  });
  const r = { x: 0, y: 0, z: 0 };
  source.moonPosition(50, r);
  loaders.pending.table.reject(new Error('HTTP 404'));
  await flush();
  assert.deepEqual(errors, ['HTTP 404']);
  assert.deepEqual(source.moonPosition(50, r), {
    status: 'unavailable',
    reason: 'loading',
  });
  assert.equal(loaders.calls.fallback, 1);
  loaders.pending.fallback.resolve(fakeFallback());
  await flush();
  assert.equal(source.moonPosition(50, r).source, 'astronomy-engine');
});

test('sin tabla ni respaldo: unavailable no-source, sin reintentos en bucle', async () => {
  const loaders = deferredLoaders();
  const source = createLazyMoonSource({ ...loaders, onError: () => {} });
  const r = { x: 0, y: 0, z: 0 };
  source.moonPosition(50, r);
  loaders.pending.table.reject(new Error('red'));
  await flush();
  source.moonPosition(50, r);
  loaders.pending.fallback.reject(new Error('chunk'));
  await flush();
  for (let i = 0; i < 3; i += 1)
    assert.deepEqual(source.moonPosition(50, r), {
      status: 'unavailable',
      reason: 'no-source',
    });
  assert.deepEqual(loaders.calls, { table: 1, fallback: 1 });
});

test('una carga que llega tras destroy no cambia nada ni avisa', async () => {
  const loaders = deferredLoaders();
  let changes = 0;
  const source = createLazyMoonSource({
    ...loaders,
    onChange: () => {
      changes += 1;
    },
  });
  source.moonPosition(50, { x: 0, y: 0, z: 0 });
  source.destroy();
  loaders.pending.table.resolve(fakeTable());
  await flush();
  assert.equal(changes, 0);
  assert.equal(
    source.moonPosition(50, { x: 0, y: 0, z: 0 }).status,
    'unavailable',
  );
});

test('P5-09: out-of-range dice si el respaldo aún puede cubrir o si ya no hay nada', async () => {
  const loaders = deferredLoaders();
  const source = createLazyMoonSource({ ...loaders, onError: () => {} });
  const r = { x: 0, y: 0, z: 0 };
  source.moonPosition(500, r);
  loaders.pending.table.resolve(fakeTable());
  await flush();
  const pending = source.moonPosition(500, r);
  assert.equal(pending.status, 'out-of-range');
  assert.equal(pending.reason, 'fallback-pending');
  assert.equal(pending.validTo, VALID_TO);
  loaders.pending.fallback.reject(new Error('chunk'));
  await flush();
  const final = source.moonPosition(500, r);
  assert.equal(final.status, 'out-of-range');
  assert.equal(final.reason, 'no-fallback');
  assert.equal(final.validFrom, VALID_FROM);
  assert.equal(source.moonPosition(50, r).status, 'ok', 'dentro, la tabla');
});

test('cobertura: el rango de la tabla CARGADA (cabecera) y el estado del respaldo', async () => {
  const loaders = deferredLoaders();
  const source = createLazyMoonSource({ ...loaders, onError() {} });
  assert.deepEqual(source.getCoverage(), {
    tableRange: null,
    fallback: 'idle',
  });
  source.moonPosition(50, { x: 0, y: 0, z: 0 });
  loaders.pending.table.resolve(fakeTable());
  await flush();
  assert.deepEqual(source.getCoverage(), {
    tableRange: { validFrom: VALID_FROM, validTo: VALID_TO },
    fallback: 'idle',
  });
  source.moonPosition(500, { x: 0, y: 0, z: 0 });
  loaders.pending.fallback.reject(new Error('bloqueado'));
  await flush();
  assert.equal(source.getCoverage().fallback, 'failed');
});
