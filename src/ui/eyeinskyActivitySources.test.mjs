import test from 'node:test';
import assert from 'node:assert/strict';
import { connectActivitySources } from './eyeinskyActivitySources.js';

/** Manager mínimo con la misma forma pública que src/data/lifecycle.js. */
function createDataManager(layers = []) {
  const listeners = new Set();
  const activityListeners = new Set();
  const calls = [];
  return {
    calls,
    layers,
    getAll: () => layers,
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    subscribeActivity(callback) {
      activityListeners.add(callback);
      return () => activityListeners.delete(callback);
    },
    isEnabled: () => true,
    refreshLayer(layerId, options) {
      calls.push(['refreshLayer', layerId]);
      return options?.resolveWith ?? Promise.resolve(true);
    },
    emitActivity(event) {
      for (const listener of [...activityListeners]) listener(event);
    },
    listenerCount: () => listeners.size + activityListeners.size,
  };
}

function createEnvironment({ dataManager, cctv = null, mapStackController = null } = {}) {
  const previousWindow = globalThis.window;
  const host = new EventTarget();
  globalThis.window = host;
  const events = [];
  const sources = connectActivitySources({
    dataManager,
    cctv,
    mapStackController,
    onEvent: (event) => events.push(event),
  });
  return {
    host,
    events,
    sources,
    tasks: () => events.filter((e) => e.type === 'upsert').map((e) => e.task),
    emit(type, detail) {
      host.dispatchEvent(new CustomEvent(type, { detail }));
    },
    cleanup() {
      sources.destroy();
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    },
  };
}

test('al montar se lee la instantánea explícita: subscribe no la entrega', () => {
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: true, lifecycleState: 'enabling', stats: {} },
  ]);
  const env = createEnvironment({ dataManager });
  const tasks = env.tasks();
  assert.equal(tasks.length, 1, 'la capa en curso aparece sin esperar un evento');
  assert.equal(tasks[0].ownerKey, 'layer:flights');
  assert.equal(tasks[0].status, 'loading');
  env.cleanup();
});

// REPAIR-1 · Una capa apagada no es trabajo: no puede contarse «en curso».
test('las capas apagadas no se publican como trabajo', () => {
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: false, stats: {} },
    { id: 'vessels', name: 'Buques', enabled: false, stats: {} },
    { id: 'cctv', name: 'CCTV', enabled: true, lifecycleState: 'enabling', stats: {} },
  ]);
  const env = createEnvironment({ dataManager });
  const owners = env.tasks().map((task) => task.ownerKey);
  assert.deepEqual(owners, ['layer:cctv'], 'sólo lo que está trabajando aparece');
  env.cleanup();
});

test('el estado inicial no fabrica historial de resultados', () => {
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: true, stats: { count: 4, lastUpdate: 1 } },
  ]);
  const env = createEnvironment({ dataManager });
  const terminals = env
    .tasks()
    .filter((task) => ['ready', 'error', 'partial'].includes(task.status));
  assert.deepEqual(
    terminals,
    [],
    'montar el observador no es un resultado que haya ocurrido ahora',
  );
  env.cleanup();
});

test('observar no arranca trabajo en el manager', () => {
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: true, stats: { count: 4, lastUpdate: 1 } },
  ]);
  const env = createEnvironment({ dataManager });
  dataManager.emitActivity({ type: 'status' });
  assert.deepEqual(dataManager.calls, [], 'ningún refresh por el hecho de mirar');
  env.cleanup();
});

test('la geometría de cámaras es progreso propio, no el stream de vídeo', () => {
  let emit = null;
  const cctv = {
    subscribe(callback) {
      emit = callback;
      callback({ loading: { loaded: 0, total: 0 } });
      return () => {
        emit = null;
      };
    },
  };
  const env = createEnvironment({ dataManager: createDataManager(), cctv });
  emit({ loading: { loaded: 2, total: 4 }, activeCameraId: 'cam-1' });
  const task = env.tasks().at(-1);
  assert.equal(task.ownerKey, 'cctv:geometry');
  assert.equal(task.unit, 'cameras-geometry');
  assert.equal(task.loaded, 2);
  assert.equal(task.total, 4);
  assert.ok(
    !JSON.stringify(task).includes('stream'),
    'la cápsula no narra el vídeo, que no es trabajo suyo',
  );
  env.cleanup();
});

// REPAIR-2 · El contrato REAL de src/maps/controller.js:getState() es
// `{activeId, activeStack, stacks, status: 'ready'|'switching'|'error', lastError}`.
// Leer un `ready` booleano inventado dejaba «Mapa base · En curso» para siempre.
/**
 * @param {string} status Estado del controlador.
 * @param {object} [extra] Campos adicionales.
 * @returns {object} Instantánea con la forma pública real.
 */
function realMapState(status, extra = {}) {
  return {
    activeId: 'satellite',
    activeStack: { id: 'satellite', label: 'Satélite' },
    stacks: [{ id: 'satellite', label: 'Satélite' }],
    status,
    lastError: null,
    ...extra,
  };
}

test('un mapa ya listo al montar no publica trabajo ni historia', () => {
  const mapStackController = { getState: () => realMapState('ready') };
  const env = createEnvironment({
    dataManager: createDataManager(),
    mapStackController,
  });
  assert.deepEqual(
    env.tasks().filter((task) => task.ownerKey === 'map:stack'),
    [],
    'el mapa en reposo no es trabajo en curso ni un resultado de ahora',
  );
  env.cleanup();
});

test('un cambio de mapa publica trabajo y su final lo cierra', () => {
  let status = 'switching';
  const mapStackController = { getState: () => realMapState(status) };
  const env = createEnvironment({
    dataManager: createDataManager(),
    mapStackController,
  });
  const loading = env.tasks().find((task) => task.ownerKey === 'map:stack');
  assert.equal(loading?.status, 'loading', 'switching sí es trabajo en curso');
  assert.equal(loading.total, null, 'sin recuento real de teselas no hay denominador');

  status = 'ready';
  env.emit('gev:map-stack-changed', {});
  const settled = env.tasks().at(-1);
  assert.equal(settled.ownerKey, 'map:stack');
  assert.equal(settled.status, 'ready', 'el cambio terminado cierra el intento');
  env.cleanup();
});

test('la instantánea terminal del evento cierra el cambio aunque getState siga switching durante la emisión', () => {
  // MapStackController emite ready/error de forma síncrona ANTES de limpiar
  // `_isSwitching`; durante ese callback getState() todavía responde switching.
  const mapStackController = { getState: () => realMapState('switching') };
  const env = createEnvironment({
    dataManager: createDataManager(),
    mapStackController,
  });
  env.emit('gev:map-stack-changed', realMapState('ready'));
  const settled = env.tasks().at(-1);
  assert.equal(settled.ownerKey, 'map:stack');
  assert.equal(
    settled.status,
    'ready',
    'el detalle terminal emitido por el controlador gana a la relectura síncrona',
  );
  env.cleanup();
});

test('un mapa en error se publica como fallo, no como «en curso»', () => {
  const mapStackController = {
    getState: () => realMapState('error', { lastError: 'proveedor caído' }),
  };
  const env = createEnvironment({
    dataManager: createDataManager(),
    mapStackController,
  });
  const task = env.tasks().find((t) => t.ownerKey === 'map:stack');
  assert.equal(task.status, 'error');
  assert.equal(task.safeError, 'proveedor caído');
  env.cleanup();
});

test('el mapa se lee del estado, no de un evento histórico inventado', () => {
  const mapStackController = {
    getState: () => realMapState('switching'),
  };
  const env = createEnvironment({
    dataManager: createDataManager(),
    mapStackController,
  });
  const task = env.tasks().find((t) => t.ownerKey === 'map:stack');
  assert.ok(task, 'el mapa aparece al montar aunque nunca haya emitido evento');
  assert.equal(task.status, 'loading');
  env.cleanup();
});

test('stack listo no significa teselas listas: no se declara terminado de más', () => {
  // La forma es la REAL del controlador; el estado terminal nunca trae
  // denominador de teselas porque el controlador no publica ninguno.
  let status = 'switching';
  const mapStackController = { getState: () => realMapState(status) };
  const env = createEnvironment({
    dataManager: createDataManager(),
    mapStackController,
  });
  status = 'ready';
  env.emit('gev:map-stack-changed', {});
  const task = env.tasks().at(-1);
  assert.equal(task.ownerKey, 'map:stack');
  assert.equal(task.status, 'ready');
  assert.equal(
    task.total,
    null,
    'sin recuento real de teselas no se publica denominador',
  );
  env.cleanup();
});

test('reintentar una capa pasa por refreshLayer con un solo vuelo', async () => {
  const dataManager = createDataManager([
    {
      id: 'flights',
      name: 'Vuelos',
      enabled: true,
      stats: { error: 'feed caído' },
    },
  ]);
  const env = createEnvironment({ dataManager });
  dataManager.emitActivity({ type: 'status' });
  const failed = env.tasks().find((t) => t.ownerKey === 'layer:flights');
  assert.equal(failed.status, 'error');
  assert.equal(failed.canRetry, true);
  const a = env.sources.retry(failed.taskId);
  const b = env.sources.retry(failed.taskId);
  assert.equal(a, b, 'el doble clic comparte el intento');
  await a;
  assert.deepEqual(dataManager.calls, [['refreshLayer', 'flights']]);
  env.cleanup();
});

// REPAIR-1 · Un solo vuelo es un solo intento: un número, un estado, una llamada.
test('el doble clic produce UN intento, no dos números', async () => {
  let resolveRefresh;
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: true, stats: { error: 'caído' } },
  ]);
  dataManager.refreshLayer = (layerId) => {
    dataManager.calls.push(['refreshLayer', layerId]);
    return new Promise((resolve) => {
      resolveRefresh = resolve;
    });
  };
  const env = createEnvironment({ dataManager });
  // Montar ya no publica resultados anteriores: el fallo aparece cuando el
  // manager lo cuenta, que es cuando de verdad ocurre.
  dataManager.emitActivity({ type: 'status' });
  const failed = env.tasks().find((task) => task.ownerKey === 'layer:flights');
  const a = env.sources.retry(failed.taskId);
  const b = env.sources.retry(failed.taskId);
  const c = env.sources.retry(failed.taskId);
  assert.equal(a, b);
  assert.equal(b, c);
  assert.deepEqual(
    dataManager.calls,
    [['refreshLayer', 'flights']],
    'un vuelo, una llamada',
  );
  const attempts = new Set(
    env
      .tasks()
      .filter((task) => task.ownerKey === 'layer:flights')
      .map((task) => task.attempt),
  );
  assert.deepEqual(
    [...attempts],
    [1, 2],
    'sólo el intento original y el reintento en curso',
  );
  resolveRefresh(true);
  await a;
  env.cleanup();
});

test('el reintento publica un intento nuevo, no reescribe el viejo', async () => {
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: true, stats: { error: 'caído' } },
  ]);
  const env = createEnvironment({ dataManager });
  dataManager.emitActivity({ type: 'status' });
  const failed = env.tasks().find((t) => t.ownerKey === 'layer:flights');
  await env.sources.retry(failed.taskId);
  const latest = env.tasks().at(-1);
  assert.equal(latest.ownerKey, 'layer:flights');
  assert.ok(latest.attempt > failed.attempt, 'el intento se numera hacia delante');
  env.cleanup();
});

test('lo que no se puede reintentar responde false, sin fingir un intento', () => {
  const dataManager = createDataManager([
    { id: 'traffic', name: 'Tráfico', enabled: true, stats: { keyRequired: true } },
  ]);
  const env = createEnvironment({ dataManager });
  dataManager.emitActivity({ type: 'status' });
  const blocked = env.tasks().find((t) => t.ownerKey === 'layer:traffic');
  assert.equal(blocked.status, 'blocked');
  assert.equal(env.sources.retry(blocked.taskId), false);
  assert.equal(env.sources.retry('inexistente'), false);
  assert.deepEqual(dataManager.calls, []);
  env.cleanup();
});

test('sin señal propia no se ofrece cancelar', () => {
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: true, lifecycleState: 'enabling', stats: {} },
  ]);
  const env = createEnvironment({ dataManager });
  const task = env.tasks().at(-1);
  assert.equal(task.canCancel, false);
  assert.equal(env.sources.cancel(task.taskId), false);
  env.cleanup();
});

test('apagar la capa invalida el reintento en vuelo', async () => {
  let resolveRefresh;
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: true, stats: { error: 'caído' } },
  ]);
  dataManager.refreshLayer = (layerId) => {
    dataManager.calls.push(['refreshLayer', layerId]);
    return new Promise((resolve) => {
      resolveRefresh = resolve;
    });
  };
  const env = createEnvironment({ dataManager });
  dataManager.emitActivity({ type: 'status' });
  const failed = env.tasks().find((t) => t.ownerKey === 'layer:flights');
  const promise = env.sources.retry(failed.taskId);
  dataManager.layers.length = 0;
  env.sources.destroy();
  resolveRefresh(true);
  assert.equal(await promise, undefined, 'el resultado tardío se descarta');
  env.cleanup();
});

test('destruido deja de publicar y suelta sus suscripciones', () => {
  const dataManager = createDataManager([
    { id: 'flights', name: 'Vuelos', enabled: true, stats: {} },
  ]);
  const env = createEnvironment({ dataManager });
  env.sources.destroy();
  const count = env.events.length;
  dataManager.emitActivity({ type: 'status' });
  env.emit('gev:map-stack-changed', {});
  assert.equal(env.events.length, count);
  assert.equal(dataManager.listenerCount(), 0, 'no quedan suscripciones colgadas');
  env.cleanup();
});
