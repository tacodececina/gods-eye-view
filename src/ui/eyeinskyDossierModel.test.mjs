import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTH_VIEW_KEY,
  contextFromRecord,
  createDossierState,
  createViewContext,
  normalizeContext,
  reduceDossier,
  resolveContextStatus,
} from './eyeinskyDossierModel.js';
import { satelliteRecord } from '../testSupport/satelliteContextRecord.mjs';

test('cerrar sobrevive al refresh y medios viejos no cambian B', () => {
  const a = { key: 'flights:fixture-a', title: 'Fixture A', assetIds: [] };
  const b = { key: 'flights:fixture-b', title: 'Fixture B', assetIds: [] };
  let state = createDossierState(a);
  state = reduceDossier(state, { type: 'close' });
  state = reduceDossier(state, { type: 'refresh', context: a });
  assert.equal(state.visibility, 'closed');
  state = reduceDossier(state, { type: 'select', context: b, explicit: true });
  const current = state;
  state = reduceDossier(state, {
    type: 'media-result',
    key: a.key,
    generation: 0,
    assetIds: ['old'],
  });
  assert.deepEqual(state, current);
  assert.equal(state.context.key, b.key);
  assert.equal(state.visibility, 'summary');
});

test('la vista Tierra es el contexto inicial y no inventa valores', () => {
  const view = createViewContext();
  assert.equal(view.key, EARTH_VIEW_KEY);
  assert.equal(view.kind, 'view');
  assert.equal(view.bodyId, 'earth');
  assert.equal(view.layerId, null);
  assert.equal(view.observedAt, null);
  assert.equal(view.fetchedAt, null);
  assert.equal(view.position, null);
  assert.equal(view.status, 'unreported');
  assert.deepEqual(view.fields, []);
  assert.deepEqual(view.assetIds, []);
});

test('un contexto sin datos conserva null en vez de ceros inventados', () => {
  const context = normalizeContext({ key: 'flights:abc', title: 'Vuelo' });
  assert.equal(context.observedAt, null);
  assert.equal(context.fetchedAt, null);
  assert.equal(context.localUpdatedAt, null);
  assert.equal(context.position, null);
  assert.equal(context.source, null);
  assert.equal(context.status, 'unreported');
  assert.deepEqual(context.fields, []);
});

test('una posición inválida se descarta entera, sin medio par de coordenadas', () => {
  assert.equal(
    normalizeContext({ key: 'k', position: { lat: 91, lon: 0 } }).position,
    null,
  );
  assert.equal(
    normalizeContext({ key: 'k', position: { lat: 10, lon: null } }).position,
    null,
  );
  assert.deepEqual(
    normalizeContext({ key: 'k', position: { lat: 19.4, lon: -99.1 } }).position,
    { lat: 19.4, lon: -99.1 },
  );
});

test('los campos sin unidad declarada no fingen una', () => {
  const context = normalizeContext({
    key: 'k',
    fields: [
      { label: 'Altitud', value: 10000, unit: 'm' },
      { label: 'Nota', value: 'sin unidad' },
      { label: '', value: 'descartado' },
      null,
    ],
  });
  assert.deepEqual(context.fields, [
    { label: 'Altitud', value: '10000', unit: 'm' },
    { label: 'Nota', value: 'sin unidad', unit: null },
  ]);
});

test('el estado de frescura distingue reportado, viejo y no reportado', () => {
  const now = 1_000_000;
  assert.equal(resolveContextStatus({ observedAt: null }, { now }), 'unreported');
  assert.equal(
    resolveContextStatus({ observedAt: now - 5_000 }, { now, staleAfterMs: 60_000 }),
    'ready',
  );
  assert.equal(
    resolveContextStatus({ observedAt: now - 120_000 }, { now, staleAfterMs: 60_000 }),
    'stale',
  );
  // Una observación del futuro es un reloj desalineado, no frescura perfecta.
  assert.equal(resolveContextStatus({ observedAt: now + 90_000 }, { now }), 'unreported');
});

test('refresh de otra identidad no roba la selección vigente', () => {
  const a = normalizeContext({ key: 'flights:a', title: 'A' });
  const b = normalizeContext({ key: 'flights:b', title: 'B' });
  let state = createDossierState(a);
  state = reduceDossier(state, { type: 'refresh', context: b });
  assert.equal(state.context.key, 'flights:a', 'refresh nunca reclama selección');
  assert.equal(state.generation, 0);
});

test('cambiar de identidad incrementa la generación; refrescar la misma no', () => {
  let state = createDossierState(normalizeContext({ key: 'a' }));
  assert.equal(state.generation, 0);
  state = reduceDossier(state, {
    type: 'select',
    context: normalizeContext({ key: 'b' }),
    explicit: true,
  });
  assert.equal(state.generation, 1);
  state = reduceDossier(state, {
    type: 'refresh',
    context: normalizeContext({ key: 'b', title: 'B2' }),
  });
  assert.equal(state.generation, 1);
  assert.equal(state.context.title, 'B2');
});

test('una selección observada no reabre lo que la persona cerró', () => {
  let state = createDossierState(normalizeContext({ key: 'a' }));
  state = reduceDossier(state, { type: 'close' });
  state = reduceDossier(state, {
    type: 'select',
    context: normalizeContext({ key: 'b' }),
    explicit: false,
  });
  assert.equal(state.visibility, 'closed');
  assert.equal(state.closedFor, 'b', 'el cierre sigue a la identidad vigente');
  // Pedirlo explícitamente sí lo reabre: es una acción de la persona.
  state = reduceDossier(state, {
    type: 'select',
    context: normalizeContext({ key: 'b' }),
    explicit: true,
  });
  assert.equal(state.visibility, 'summary');
  assert.equal(state.closedFor, null);
});

test('suspender y restaurar conserva la visibilidad exacta, incluso expandida', () => {
  let state = createDossierState(normalizeContext({ key: 'a' }));
  state = reduceDossier(state, { type: 'expand' });
  state = reduceDossier(state, { type: 'suspend', value: true });
  assert.equal(state.suspended, true);
  assert.equal(state.visibility, 'expanded', 'suspend no borra visibility');
  state = reduceDossier(state, { type: 'suspend', value: false });
  assert.equal(state.suspended, false);
  assert.equal(state.visibility, 'expanded');
});

test('expandir no reabre un expediente cerrado', () => {
  let state = createDossierState(normalizeContext({ key: 'a' }));
  state = reduceDossier(state, { type: 'close' });
  state = reduceDossier(state, { type: 'expand' });
  assert.equal(state.visibility, 'closed');
  state = reduceDossier(state, { type: 'reopen' });
  assert.equal(state.visibility, 'summary');
});

test('media-result vigente adopta los activos; uno de otra generación no', () => {
  let state = createDossierState(normalizeContext({ key: 'earth:view' }));
  state = reduceDossier(state, {
    type: 'media-result',
    key: 'earth:view',
    generation: 0,
    assetIds: ['earth-apollo17'],
  });
  assert.deepEqual(state.context.assetIds, ['earth-apollo17']);
  const current = state;
  state = reduceDossier(state, {
    type: 'media-result',
    key: 'earth:view',
    generation: 99,
    assetIds: ['otro'],
  });
  assert.equal(state, current, 'una generación ajena no toca el estado');
});

test('un evento desconocido devuelve el mismo estado, sin clonarlo', () => {
  const state = createDossierState(normalizeContext({ key: 'a' }));
  assert.equal(reduceDossier(state, { type: 'inventado' }), state);
  assert.equal(reduceDossier(state, null), state);
});

test('el estado y su contexto son inmutables para quien los recibe', () => {
  const state = createDossierState(normalizeContext({ key: 'a' }));
  assert.throws(() => {
    state.visibility = 'closed';
  }, TypeError);
  assert.throws(() => {
    state.context.title = 'otro';
  }, TypeError);
});

test('la URL de la fuente sólo se conserva si es http(s)', () => {
  assert.equal(
    normalizeContext({ key: 'k', sourceUrl: 'https://earthquake.usgs.gov/x' })
      .sourceUrl,
    'https://earthquake.usgs.gov/x',
  );
  assert.equal(
    normalizeContext({ key: 'k', sourceUrl: 'javascript:alert(1)' }).sourceUrl,
    null,
  );
  assert.equal(normalizeContext({ key: 'k' }).sourceUrl, null);
});

test('un registro de contexto se traduce sin inventar fuente ni hora', () => {
  const context = contextFromRecord({
    id: 'local-datacenters:42',
    layerId: 'local-datacenters',
    layerName: 'Datacenters',
    source: 'Local',
    label: 'Sitio 42',
    latitude: 19.4,
    longitude: -99.1,
    updatedAt: 1700,
    properties: { operator: 'Ejemplo' },
  });
  assert.equal(context.key, 'local-datacenters:local-datacenters:42');
  assert.equal(context.kind, 'entity');
  assert.equal(context.layerId, 'local-datacenters');
  assert.equal(context.title, 'Sitio 42');
  assert.equal(context.source, 'Local');
  assert.deepEqual(context.position, { lat: 19.4, lon: -99.1 });
  // `updatedAt` es hora local de registro, nunca observación del proveedor.
  assert.equal(context.localUpdatedAt, 1700);
  assert.equal(context.observedAt, null);
});

test('un registro sin identidad no produce contexto', () => {
  assert.equal(contextFromRecord(null), null);
  assert.equal(contextFromRecord({ layerId: 'flights' }), null);
});

// ─── P4 T6 · expediente honesto del satélite seguido ───

test('a tracked satellite keeps every field, in order, with Spanish labels', () => {
  const context = contextFromRecord(satelliteRecord(), { kind: 'tracked' });
  assert.deepEqual(
    context.fields.map(({ key }) => key),
    [
      'name',
      'noradId',
      'class',
      'altitude',
      'elementAge',
      'elementEpoch',
      'geometryFidelity',
      'attitude',
      'visualScale',
      'framing',
      'modelStatus',
      'elementFormat',
      'fetchedAt',
      'cacheStatus',
      'modelAsset',
    ],
    'no field lost past 12; the empty operator is not a field',
  );
  assert.deepEqual(
    context.fields.map(({ label }) => label),
    [
      'NOMBRE',
      'NORAD',
      'CLASE',
      'ALTITUD',
      'EDAD DE ELEMENTOS',
      'ÉPOCA',
      'GEOMETRÍA',
      'ACTITUD',
      'ESCALA',
      'ENCUADRE',
      'MODELO',
      'FORMATO',
      'DESCARGA',
      'CACHÉ',
      'ACTIVO 3D',
    ],
  );
  const byKey = Object.fromEntries(context.fields.map((f) => [f.key, f]));
  assert.equal(byKey.attitude.value, 'LVLH nominal (aprox.)');
  assert.equal(byKey.attitude.code, 'lvlh-nominal-aprox');
  assert.equal(byKey.geometryFidelity.value, 'específico');
  assert.equal(byKey.framing.value, 'órbita');
  assert.match(byKey.elementEpoch.value, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
});

test('the SGP4 position is labelled predicted, never "unreported"', () => {
  const context = contextFromRecord(satelliteRecord(), { kind: 'tracked' });
  assert.equal(context.status, 'predicted');
  const flight = contextFromRecord({
    id: 'ae1fa4',
    layerId: 'flights',
    status: 'whatever-the-feed-says',
    properties: { name: 'TEST123' },
  });
  assert.equal(flight.status, 'unreported', 'only known statuses pass');
  assert.deepEqual(
    flight.fields,
    [{ key: 'name', label: 'name', value: 'TEST123', unit: null }],
    'other layers keep their own labels',
  );
});
