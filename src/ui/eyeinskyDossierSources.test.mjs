import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_VIEW_KEY, contextFromRecord } from './eyeinskyDossierModel.js';
import { satelliteRecord } from '../testSupport/satelliteContextRecord.mjs';
import {
  contextRecord,
  flush,
  frame as sceneFrame,
  satellitesLayer,
  scene,
} from '../testSupport/satelliteTrackingScene.mjs';
import {
  ATTITUDE_SUBJECTS,
  attitudeSubjectRows,
  attitudeViolations,
  walkAttitudeSubject,
} from '../testSupport/satelliteAttitudeAudit.mjs';
import { connectDossierSources } from './eyeinskyDossierSources.js';

/** Evento sintético con la misma forma que usan las capas reales. */
class FakeCesiumEvent {
  constructor() {
    this.listeners = new Set();
  }

  addEventListener(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  raise(...args) {
    for (const listener of [...this.listeners]) listener(...args);
  }
}

/**
 * Entorno mínimo: `window` real como bus de eventos y un store de contexto
 * colgado de él, igual que hace src/data/contextStore.js.
 */
function createEnvironment({ dataManager = null } = {}) {
  const previousWindow = globalThis.window;
  const host = new EventTarget();
  host.__gevContextStore = {
    entities: new Map(),
    selectedEntityId: null,
    selectedAt: null,
  };
  globalThis.window = host;
  const selectedEntityChanged = new FakeCesiumEvent();
  const published = [];
  const sources = connectDossierSources({
    viewer: { selectedEntityChanged, selectedEntity: undefined },
    dataManager,
    onContext: (event) => published.push(event),
  });
  return {
    host,
    published,
    sources,
    selectedEntityChanged,
    /** Registra un sujeto en el store como lo hacen las capas de tracking. */
    storeSubject(record) {
      host.__gevContextStore.entities.set(record.id, {
        ...record,
        entity: { __gevContextId: record.id },
        updatedAt: 1700,
      });
      host.__gevContextStore.selectedEntityId = record.id;
    },
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

test('sin selección previa el primer contexto publicado es la vista Tierra', () => {
  const env = createEnvironment();
  assert.equal(env.published.length, 1);
  assert.equal(env.published[0].type, 'select');
  assert.equal(env.published[0].context.key, EARTH_VIEW_KEY);
  assert.equal(env.published[0].explicit, false, 'arrancar no roba el foco');
  env.cleanup();
});

test('una selección de entidad publica su identidad real', () => {
  const env = createEnvironment();
  env.emit('gev:entity-selected', {
    id: 'local-datacenters:42',
    layerId: 'local-datacenters',
    label: 'Sitio 42',
    latitude: 19.4,
    longitude: -99.1,
    source: 'Local',
  });
  const last = env.published.at(-1);
  assert.equal(last.type, 'select');
  assert.equal(last.explicit, true);
  assert.equal(last.context.stableId, 'local-datacenters:42');
  assert.equal(last.context.title, 'Sitio 42');
  env.cleanup();
});

test('el evento de tracking llega antes que el store: se relee en microtarea', async () => {
  const env = createEnvironment();
  const before = env.published.length;
  // Orden real de src/layers/flights/tracking.js:67 → :78.
  env.emit('gev:awareness-subject-selected', {
    layerId: 'flights',
    id: 'abc123',
    label: 'IBE6001',
  });
  assert.equal(env.published.length, before, 'no se publica antes de releer');
  env.storeSubject({ id: 'abc123', layerId: 'flights', label: 'IBE6001' });
  await Promise.resolve();
  await Promise.resolve();
  const last = env.published.at(-1);
  assert.equal(last.type, 'select');
  assert.equal(last.context.key, 'flights:abc123');
  assert.equal(last.context.kind, 'tracked');
  env.cleanup();
});

test('si el store no confirma la identidad se publica lo que el evento trajo', async () => {
  const env = createEnvironment();
  env.emit('gev:awareness-subject-selected', {
    layerId: 'flights',
    id: 'sin-store',
    label: 'AAL1',
  });
  await Promise.resolve();
  await Promise.resolve();
  const last = env.published.at(-1);
  assert.equal(last.context.key, 'flights:sin-store');
  assert.equal(last.context.title, 'AAL1');
  assert.equal(
    last.context.status,
    'unreported',
    'no se fabrica frescura que nadie reportó',
  );
  env.cleanup();
});

test('dos selecciones síncronas A y B dejan una sola vigente: B', async () => {
  const env = createEnvironment();
  const before = env.published.length;
  env.emit('gev:awareness-subject-selected', { layerId: 'flights', id: 'A' });
  env.emit('gev:awareness-subject-selected', { layerId: 'flights', id: 'B' });
  env.storeSubject({ id: 'B', layerId: 'flights', label: 'B' });
  await Promise.resolve();
  await Promise.resolve();
  const selects = env.published.slice(before).filter((e) => e.type === 'select');
  assert.equal(selects.length, 1, 'la respuesta de A se descarta, no se publica');
  assert.equal(selects[0].context.key, 'flights:B');
  env.cleanup();
});

// REPAIR-1 · La resolución tardía de tracking debe rendirse ante CUALQUIER
// selección posterior, no sólo ante otra de su propio carril.
test('la microtarea de tracking A no pisa una selección B llegada por otro carril', async () => {
  for (const lane of ['entity-selected', 'cctv', 'viewer']) {
    const previousWindow = globalThis.window;
    const host = new EventTarget();
    host.__gevContextStore = {
      entities: new Map(),
      selectedEntityId: null,
      selectedAt: null,
    };
    globalThis.window = host;
    const published = [];
    const selectedEntityChanged = new FakeCesiumEvent();
    let emitCamera = null;
    const sources = connectDossierSources({
      viewer: { selectedEntityChanged },
      cctv: {
        subscribe(callback) {
          emitCamera = callback;
          callback({ activeCameraId: null });
          return () => {};
        },
      },
      onContext: (event) => published.push(event),
    });

    // A: tracking publica su evento y deja la resolución en vuelo.
    host.dispatchEvent(
      new CustomEvent('gev:awareness-subject-selected', {
        detail: { layerId: 'flights', id: 'A', label: 'A' },
      }),
    );
    // B: llega por otro carril, ya resuelto.
    if (lane === 'entity-selected') {
      host.dispatchEvent(
        new CustomEvent('gev:entity-selected', {
          detail: { id: 'B', layerId: 'earthquakes', label: 'B' },
        }),
      );
    } else if (lane === 'cctv') {
      emitCamera({ activeCameraId: 'cam-B' });
    } else {
      const entity = { __gevContextId: 'B' };
      host.__gevContextStore.entities.set('B', {
        id: 'B',
        layerId: 'earthquakes',
        label: 'B',
        entity,
      });
      selectedEntityChanged.raise(entity);
    }
    // La microtarea de A corre ahora, con el store ya poblado para A.
    host.__gevContextStore.entities.set('A', {
      id: 'A',
      layerId: 'flights',
      label: 'A',
      entity: { __gevContextId: 'A' },
    });
    await Promise.resolve();
    await Promise.resolve();

    const last = published.at(-1);
    assert.ok(
      !last.context.key.startsWith('flights:'),
      `carril ${lane}: la resolución de A volvió a publicarse (${last.context.key})`,
    );
    sources.destroy();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('una expulsión conserva la ficha y la marca; un cierre deliberado vuelve a la vista', () => {
  const env = createEnvironment();
  env.emit('gev:entity-selected', {
    id: 'q1',
    layerId: 'earthquakes',
    label: 'M 5.1',
  });
  env.emit('gev:entity-selection-cleared', {
    layerId: 'earthquakes',
    reason: 'evicted',
  });
  const evicted = env.published.at(-1);
  assert.equal(evicted.type, 'refresh', 'una expulsión no es una selección nueva');
  assert.equal(evicted.context.key, 'earthquakes:q1', 'conserva la identidad');
  assert.equal(evicted.context.status, 'missing');

  env.emit('gev:entity-selection-cleared', {
    layerId: 'earthquakes',
    reason: 'deliberate',
  });
  const cleared = env.published.at(-1);
  assert.equal(cleared.type, 'select');
  assert.equal(cleared.context.key, EARTH_VIEW_KEY);
  assert.equal(cleared.explicit, false);
  env.cleanup();
});

test('apagar la capa de la ficha vigente la devuelve a la vista Tierra', () => {
  const listeners = new Set();
  const dataManager = {
    subscribe(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    isEnabled: () => false,
  };
  const env = createEnvironment({ dataManager });
  env.emit('gev:entity-selected', { id: 'q1', layerId: 'earthquakes' });
  for (const listener of listeners)
    listener({ type: 'visibility', layerId: 'earthquakes', enabled: false });
  const last = env.published.at(-1);
  assert.equal(last.context.key, EARTH_VIEW_KEY);
  env.cleanup();
});

test('un cambio de mapa refresca la vista pero nunca cambia de objetivo', () => {
  const env = createEnvironment();
  env.emit('gev:entity-selected', { id: 'q1', layerId: 'earthquakes' });
  const before = env.published.length;
  env.emit('gev:map-stack-changed', { generation: 3 });
  const after = env.published.slice(before);
  assert.ok(
    after.every((event) => event.type !== 'select'),
    'un mapa nuevo no selecciona nada',
  );
  assert.ok(
    after.every((event) => event.context.key === 'earthquakes:q1'),
    'la identidad vigente se conserva',
  );
  env.cleanup();
});

test('una instantánea de CCTV refresca su ficha, sin robar la selección ajena', () => {
  const previousWindow = globalThis.window;
  const host = new EventTarget();
  host.__gevContextStore = {
    entities: new Map(),
    selectedEntityId: null,
    selectedAt: null,
  };
  globalThis.window = host;
  const published = [];
  let emitSnapshot = null;
  const cctv = {
    subscribe(callback) {
      emitSnapshot = callback;
      // Igual que src/layers/cctv/controls.js: entrega instantánea al suscribir.
      callback({ activeCameraId: null, loading: { loaded: 0, total: 0 } });
      return () => {
        emitSnapshot = null;
      };
    },
  };
  const sources = connectDossierSources({
    viewer: { selectedEntityChanged: new FakeCesiumEvent() },
    cctv,
    onContext: (event) => published.push(event),
  });
  const selects = published.filter((e) => e.type === 'select');
  assert.equal(selects.length, 1, 'sólo el arranque selecciona la vista Tierra');
  assert.equal(selects[0].context.key, EARTH_VIEW_KEY);

  emitSnapshot({ activeCameraId: 'cam-7', loading: { loaded: 2, total: 4 } });
  const last = published.at(-1);
  assert.equal(last.type, 'select');
  assert.equal(last.context.key, 'cctv:cam-7');
  assert.equal(last.context.kind, 'camera');
  sources.destroy();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

// REPAIR-2 · La instantánea real de CCTV trae `activeCamera` con la forma de
// `getPublicCameraState`; no hay `activeCameraName`, `source` ni `observedAt`.
test('la ficha de cámara se construye con el contrato público real', () => {
  const previousWindow = globalThis.window;
  const host = new EventTarget();
  host.__gevContextStore = {
    entities: new Map(),
    selectedEntityId: null,
    selectedAt: null,
  };
  globalThis.window = host;
  const published = [];
  let emitSnapshot = null;
  const sources = connectDossierSources({
    viewer: { selectedEntityChanged: new FakeCesiumEvent() },
    cctv: {
      subscribe(callback) {
        emitSnapshot = callback;
        callback({ activeCameraId: null, activeCamera: null });
        return () => {};
      },
    },
    onContext: (event) => published.push(event),
  });

  emitSnapshot({
    activeCameraId: 'cam-7',
    activeCamera: {
      id: 'cam-7',
      name: 'Puente Zaragoza',
      city: 'Ciudad Juárez',
      provider: 'Gobierno municipal',
      lat: 31.7,
      lon: -106.45,
      elevationM: 1130,
      sourceLabel: 'Cámara pública',
      sourceStatus: 'online',
      feedType: 'mjpeg',
      active: true,
    },
    loading: { active: false, loaded: 12, total: 12 },
  });

  const last = published.at(-1);
  assert.equal(last.type, 'select');
  assert.equal(last.context.key, 'cctv:cam-7');
  assert.equal(last.context.kind, 'camera');
  assert.equal(last.context.stableId, 'cam-7');
  assert.equal(last.context.title, 'Puente Zaragoza');
  assert.equal(last.context.source, 'Cámara pública');
  assert.deepEqual(last.context.position, { lat: 31.7, lon: -106.45 });
  assert.equal(
    last.context.observedAt,
    null,
    'la instantánea no informa hora de observación y no se inventa',
  );
  const labels = last.context.fields.map((field) => field.label);
  assert.ok(labels.includes('PROVEEDOR'));
  assert.ok(labels.includes('ESTADO DE LA FUENTE'));
  const elevation = last.context.fields.find((f) => f.label === 'ELEVACIÓN');
  assert.equal(elevation.value, '1130');
  assert.equal(elevation.unit, 'm');

  sources.destroy();
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

test('destruido no publica nada, ni siquiera lo que ya estaba en vuelo', async () => {
  const env = createEnvironment();
  env.emit('gev:awareness-subject-selected', { layerId: 'flights', id: 'X' });
  env.sources.destroy();
  env.storeSubject({ id: 'X', layerId: 'flights', label: 'X' });
  await Promise.resolve();
  await Promise.resolve();
  const count = env.published.length;
  env.emit('gev:entity-selected', { id: 'otro', layerId: 'earthquakes' });
  assert.equal(env.published.length, count, 'un observador destruido está mudo');
  env.cleanup();
});

test('observar no arranca trabajo: no se toca cámara, capas ni fetch', () => {
  const calls = [];
  const dataManager = {
    subscribe() {
      return () => {};
    },
    isEnabled: (...args) => {
      calls.push(['isEnabled', ...args]);
      return true;
    },
    refreshLayer: () => calls.push(['refreshLayer']),
    setEnabled: () => calls.push(['setEnabled']),
  };
  const env = createEnvironment({ dataManager });
  env.emit('gev:entity-selected', { id: 'q1', layerId: 'earthquakes' });
  env.emit('gev:map-stack-changed', {});
  assert.deepEqual(
    calls.filter(([name]) => name !== 'isEnabled'),
    [],
    'ningún conector puede activar capas ni pedir refrescos por su cuenta',
  );
  env.cleanup();
});

// ─── P4 T6 · el satélite seguido se refresca por su propio aviso ───

test('gev:awareness-subject-updated refreshes the same subject, never selects', async () => {
  const env = createEnvironment();
  env.storeSubject(satelliteRecord({ framing: 'orbit' }));
  env.emit('gev:awareness-subject-selected', {
    layerId: 'satellites',
    id: 25544,
    label: 'ISS (ZARYA)',
  });
  await new Promise((resolve) => queueMicrotask(resolve));
  const selected = env.published.at(-1);
  assert.equal(selected.context.key, 'satellites:25544');
  assert.equal(selected.context.status, 'predicted');

  env.storeSubject(satelliteRecord({ framing: 'inspect' }));
  env.emit('gev:awareness-subject-updated', {
    layerId: 'satellites',
    id: '25544',
  });
  const refreshed = env.published.at(-1);
  assert.equal(refreshed.type, 'refresh');
  assert.equal(refreshed.explicit, false);
  const framing = refreshed.context.fields.find((f) => f.key === 'framing');
  assert.equal(framing.code, 'inspect');

  const before = env.published.length;
  env.emit('gev:awareness-subject-updated', { layerId: 'flights', id: 'x' });
  assert.equal(env.published.length, before, 'someone else is ignored');
  env.cleanup();
});

// P4-21 sobre lo que PUBLICA producción: la capa de satélites real sigue a
// cada sujeto, escribe el store y emite sus eventos; el expediente los observa
// con connectDossierSources. Se audita el registro del store, lo que la voz
// compacta de él y el contexto que el expediente publicó — nunca una copia.
async function auditPublishedAttitude(env, s, settle, onCase) {
  const seen = new Set();
  const frame = () => sceneFrame(s);
  for (const subject of ATTITUDE_SUBJECTS) {
    const onRead = (label) => {
      const record = contextRecord(subject.noradId);
      const published = env.published.at(-1)?.context ?? null;
      onCase(`${subject.name}/${label}`, record, published, subject);
      seen.add(
        `${subject.asset ? 'asset' : 'none'}:${record?.properties?.framing}:${record?.properties?.modelStatus}`,
      );
    };
    await walkAttitudeSubject(
      s,
      satellitesLayer,
      subject,
      settle,
      async (label) => {
        await flush();
        onRead(label);
      },
      frame,
    );
    await flush();
    satellitesLayer.stopTracking({ origin: 'user' });
  }
  return seen;
}

test('P4-21: no attitude numbers in what the layer publishes, the voice reads or the dossier shows', async () => {
  const env = createEnvironment();
  const s = scene({ others: attitudeSubjectRows() });
  await flush();
  const seen = new Set();
  let cases = 0;
  const onCase = (where, record, published, subject) => {
    cases += 1;
    assert.equal(
      published?.key,
      `satellites:${subject.noradId}`,
      `${where}: the dossier observed this subject`,
    );
    const framing = published.fields.find((f) => f.key === 'framing');
    assert.equal(
      framing?.code,
      record.properties.framing,
      `${where}: the dossier shows the published framing`,
    );
    assert.deepEqual(attitudeViolations(where, record, published), []);
  };
  try {
    for (const settle of ['resolve', 'reject'])
      for (const state of await auditPublishedAttitude(env, s, settle, onCase))
        seen.add(state);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
    env.cleanup();
  }
  assert.ok(cases >= 40, `cases audited: ${cases}`);
  for (const expected of [
    'asset:orbit:listo',
    'asset:inspect:listo',
    'asset:inspect:fallido',
    'none:orbit:n/a',
  ])
    assert.ok(seen.has(expected), `state ${expected} covered (${[...seen]})`);
});

test('P4-21: the audit catches a number injected into the published record', async () => {
  const env = createEnvironment();
  scene({ others: attitudeSubjectRows() });
  await flush();
  try {
    assert.equal(satellitesLayer.trackById(25544, { origin: 'user' }), true);
    await flush();
    const real = contextRecord(25544);
    const published = env.published.at(-1).context;
    assert.deepEqual(attitudeViolations('real', real, published), []);
    const tamper = (properties) => ({
      ...real,
      properties: { ...real.properties, ...properties },
    });
    for (const [label, record] of [
      ['número en attitude', tamper({ attitude: 'lvlh 12.5' })],
      ['ángulo en attitude', tamper({ attitude: '45°' })],
      ['cuaternión en attitude', tamper({ attitude: '0.1, 0.2, 0.3, 0.9' })],
    ]) {
      assert.ok(
        attitudeViolations(label, record).length > 0,
        `${label} must be caught`,
      );
      const context = contextFromRecord(record, { kind: 'tracked' });
      assert.ok(
        attitudeViolations(label, real, context).length > 0,
        `${label} must be caught in the dossier context`,
      );
    }
    const extraKey = { ...real, properties: { ...real.properties, yaw: '12' } };
    assert.ok(attitudeViolations('clave yaw', extraKey).length > 0);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
    env.cleanup();
  }
});
