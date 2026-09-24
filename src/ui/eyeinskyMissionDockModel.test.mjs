/**
 * Modelo del Mission Dock (EYEINSKY P3.1).
 *
 * El dock sustituye al expediente lateral por una superficie inferior. Estas
 * pruebas fijan lo que el modelo puede y no puede decir: compone el estado real
 * del expediente y de la actividad, no inventa ni una posición ni un porcentaje,
 * y separa "quién está seleccionado" de "quién tiene la cámara".
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  contextFromRecord,
  createDossierState,
  normalizeContext,
} from './eyeinskyDossierModel.js';
import { satelliteRecord } from '../testSupport/satelliteContextRecord.mjs';
import { createActivityState, reduceActivity } from './eyeinskyActivityModel.js';
import {
  buildMissionDockView,
  createMissionDockState,
  reduceMissionDock,
  resolveCameraStatus,
  resolveMissionDockActions,
  resolveMissionDockPanes,
} from './eyeinskyMissionDockModel.js';

const trackedContext = (overrides = {}) =>
  normalizeContext({
    key: 'flights:ae1fa4',
    kind: 'tracked',
    layerId: 'flights',
    stableId: 'ae1fa4',
    title: 'TEST123',
    source: 'OpenSky Network',
    observedAt: Date.now(),
    position: { lat: 30.21, lon: -97.71 },
    fields: [
      { label: 'ALTURA', value: '10668', unit: 'm' },
      { label: 'VELOCIDAD', value: '250', unit: 'm/s' },
      { label: 'RUMBO', value: '95', unit: '°' },
      { label: 'CLASE', value: 'airliner' },
    ],
    ...overrides,
  });

const paneIds = (panes) => panes.map(({ id }) => id);
const actionById = (actions, id) => actions.find((action) => action.id === id);

test('MEDIOS only exists when the context actually carries media', () => {
  const activity = createActivityState();
  assert.deepEqual(
    paneIds(resolveMissionDockPanes({ context: trackedContext(), activity })),
    ['objetivo', 'ops'],
    'no assets means no media pane at all, not an empty one',
  );
  assert.deepEqual(
    paneIds(
      resolveMissionDockPanes({
        context: trackedContext({ assetIds: ['bhote-koshi-pre'] }),
        activity,
      }),
    ),
    ['objetivo', 'medios', 'ops'],
  );
});

test('the OPS pane badge counts real work, never a decorative number', () => {
  let activity = createActivityState();
  assert.equal(
    resolveMissionDockPanes({ context: trackedContext(), activity }).at(-1)
      .badge,
    null,
    'no work means no badge',
  );
  activity = reduceActivity(activity, {
    type: 'upsert',
    task: {
      taskId: 'layer:flights#1',
      ownerKey: 'layer:flights',
      status: 'loading',
      label: 'Vuelos',
      updatedAt: 1,
    },
  });
  const loading = resolveMissionDockPanes({
    context: trackedContext(),
    activity,
  }).at(-1);
  assert.deepEqual(loading.badge, { kind: 'loading', count: 1 });

  activity = reduceActivity(activity, {
    type: 'upsert',
    task: {
      taskId: 'layer:flights#2',
      ownerKey: 'layer:flights',
      attempt: 2,
      status: 'error',
      label: 'Vuelos',
      error: 'sin respuesta',
      updatedAt: 2,
    },
  });
  assert.deepEqual(
    resolveMissionDockPanes({ context: trackedContext(), activity }).at(-1)
      .badge,
    { kind: 'error', count: 1 },
    'a finished failure is reported as a failure, not as work in progress',
  );
});

test('camera status separates "selected" from "the camera is on it"', () => {
  const tracked = trackedContext();
  assert.deepEqual(
    resolveCameraStatus({ context: tracked, following: true }),
    {
      id: 'following',
      label: 'CÁMARA / SIGUIENDO',
      detail: 'La cámara sigue a TEST123.',
    },
  );
  assert.deepEqual(
    resolveCameraStatus({ context: tracked, following: false }),
    {
      id: 'selected-free',
      label: 'CÁMARA / LIBRE',
      detail: 'TEST123 sigue seleccionado; la cámara es tuya.',
    },
    'a gesture frees the camera without losing the target',
  );
  assert.deepEqual(
    resolveCameraStatus({ context: normalizeContext({}), following: false }),
    {
      id: 'free',
      label: 'CÁMARA / LIBRE',
      detail: 'Sin objetivo seleccionado.',
    },
  );
});

test('SEGUIR is offered only when there is something a layer can follow', () => {
  const free = resolveMissionDockActions({
    context: trackedContext(),
    following: false,
  });
  assert.deepEqual(actionById(free, 'follow'), {
    id: 'follow',
    label: 'Seguir',
    enabled: true,
    pressed: false,
    hint: 'Devuelve la cámara a TEST123',
  });

  const followingNow = resolveMissionDockActions({
    context: trackedContext(),
    following: true,
  });
  assert.equal(actionById(followingNow, 'follow').pressed, true);
  assert.equal(actionById(followingNow, 'follow').label, 'Siguiendo');

  const view = resolveMissionDockActions({
    context: normalizeContext({}),
    following: false,
  });
  assert.deepEqual(actionById(view, 'follow'), {
    id: 'follow',
    label: 'Seguir',
    enabled: false,
    pressed: false,
    hint: 'Sin contacto seleccionado',
  });

  const inspected = resolveMissionDockActions({
    context: normalizeContext({
      key: 'earthquakes:us7000',
      kind: 'earthquake',
      layerId: 'earthquakes',
      title: 'M4.2 · Oaxaca',
      position: { lat: 16.1, lon: -96.4 },
    }),
    following: false,
  });
  assert.deepEqual(actionById(inspected, 'follow'), {
    id: 'follow',
    label: 'Seguir',
    enabled: false,
    pressed: false,
    hint: 'Este registro no se puede seguir',
  });
});

test('CENTRAR refuses itself when the provider gave no position', () => {
  const withPosition = resolveMissionDockActions({
    context: trackedContext(),
    following: false,
  });
  assert.equal(actionById(withPosition, 'center').enabled, true);

  const without = resolveMissionDockActions({
    context: trackedContext({ position: null }),
    following: false,
  });
  assert.deepEqual(actionById(without, 'center'), {
    id: 'center',
    label: 'Centrar',
    enabled: false,
    pressed: false,
    hint: 'La fuente no informa una posición',
  });
});

test('NORTE and MÁS are always offered, in that exact dock order', () => {
  const actions = resolveMissionDockActions({
    context: normalizeContext({}),
    following: false,
  });
  assert.deepEqual(
    actions.map(({ id }) => id),
    ['follow', 'center', 'north', 'more'],
  );
  assert.equal(actionById(actions, 'north').enabled, true);
  assert.equal(actionById(actions, 'more').enabled, true);
});

test('pane selection survives a refresh and falls back when a pane disappears', () => {
  let state = createMissionDockState();
  assert.equal(state.pane, 'objetivo');
  assert.equal(state.expanded, false);

  state = reduceMissionDock(state, { type: 'select-pane', pane: 'medios' });
  assert.equal(state.pane, 'medios');
  assert.equal(
    reduceMissionDock(state, { type: 'select-pane', pane: 'medios' }),
    state,
    'a no-op event returns the same object so the surface can skip repaints',
  );
  assert.equal(
    reduceMissionDock(state, { type: 'select-pane', pane: 'inventada' }),
    state,
    'an unknown pane is ignored rather than blanking the dock',
  );

  const expanded = reduceMissionDock(state, { type: 'expand' });
  assert.equal(expanded.expanded, true);
  assert.equal(expanded.pane, 'medios', 'expanding never changes the pane');
  assert.equal(reduceMissionDock(expanded, { type: 'expand' }), expanded);
  assert.equal(reduceMissionDock(expanded, { type: 'collapse' }).expanded, false);
});

test('the dock view composes the real dossier and activity state', () => {
  const dossier = createDossierState(trackedContext());
  const activity = createActivityState();
  const view = buildMissionDockView({
    dossier,
    activity,
    dock: createMissionDockState(),
    following: true,
  });

  assert.equal(view.visible, true);
  assert.equal(view.title, 'TEST123');
  assert.equal(view.kicker, 'SEGUIMIENTO / CONTACTO');
  assert.equal(view.contextKey, 'flights:ae1fa4');
  assert.equal(view.camera.id, 'following');
  assert.deepEqual(paneIds(view.panes), ['objetivo', 'ops']);
  assert.equal(view.pane, 'objetivo');
  assert.deepEqual(
    view.keyValues.map(({ label }) => label),
    ['ALTURA', 'VELOCIDAD', 'RUMBO'],
    'the compact rail carries at most three measured values',
  );
  assert.deepEqual(
    view.actions.map(({ id }) => id),
    ['follow', 'center', 'north', 'more'],
  );
});

test('the dock falls back to OBJETIVO when its selected pane stops existing', () => {
  const withMedia = createDossierState(
    trackedContext({ assetIds: ['bhote-koshi-pre'] }),
  );
  const onMedia = reduceMissionDock(createMissionDockState(), {
    type: 'select-pane',
    pane: 'medios',
  });
  assert.equal(
    buildMissionDockView({
      dossier: withMedia,
      activity: createActivityState(),
      dock: onMedia,
      following: false,
    }).pane,
    'medios',
  );
  assert.equal(
    buildMissionDockView({
      dossier: createDossierState(trackedContext()),
      activity: createActivityState(),
      dock: onMedia,
      following: false,
    }).pane,
    'objetivo',
    'a pane that no longer exists must not leave the dock blank',
  );
});

test('a suspended or closed dossier keeps the dock off screen', () => {
  const base = {
    activity: createActivityState(),
    dock: createMissionDockState(),
    following: false,
  };
  const suspended = Object.freeze({
    ...createDossierState(trackedContext()),
    suspended: true,
  });
  assert.equal(
    buildMissionDockView({ ...base, dossier: suspended }).visible,
    false,
  );
  const closed = Object.freeze({
    ...createDossierState(trackedContext()),
    visibility: 'closed',
  });
  assert.equal(buildMissionDockView({ ...base, dossier: closed }).visible, false);
});

// ─── P4 T5 · INSPECCIONAR / ÓRBITA sobre el satélite seguido ───

const satelliteDossier = (options) =>
  createDossierState(
    contextFromRecord(satelliteRecord(options), { kind: 'tracked' }),
  );

const satelliteView = (options) =>
  buildMissionDockView({
    dossier: satelliteDossier(options),
    activity: createActivityState(),
    dock: createMissionDockState(),
    following: true,
  });

test('INSPECCIONAR sits after SEGUIR for a satellite with a curated model', () => {
  const view = satelliteView({ assetId: 'nasa-iss', framing: 'orbit' });
  assert.deepEqual(
    view.actions.map(({ id }) => id),
    ['follow', 'inspect', 'center', 'north', 'more'],
  );
  const inspect = actionById(view.actions, 'inspect');
  assert.equal(inspect.label, 'Inspeccionar');
  assert.equal(inspect.enabled, true);
  assert.match(inspect.hint, /escala real/i);
});

test('in inspect framing the same action reads ÓRBITA', () => {
  const inspect = actionById(
    satelliteView({ assetId: 'nasa-iss', framing: 'inspect' }).actions,
    'inspect',
  );
  assert.equal(inspect.label, 'Órbita');
  assert.equal(inspect.enabled, true);
});

test('no curated model: INSPECCIONAR is offered disabled with its reason', () => {
  const inspect = actionById(
    satelliteView({ assetId: null, name: 'GPS BIIR-2' }).actions,
    'inspect',
  );
  assert.equal(inspect.enabled, false);
  assert.equal(inspect.hint, 'Sin modelo curado: solo punto');
});

test('expired elements: INSPECCIONAR is disabled and says why', () => {
  const inspect = actionById(
    satelliteView({ assetId: 'nasa-iss', ageMs: 30 * 86_400_000 }).actions,
    'inspect',
  );
  assert.equal(inspect.enabled, false);
  assert.match(inspect.hint, /caducada/i);
});

test('a failed model disables INSPECCIONAR but keeps the point', () => {
  const inspect = actionById(
    satelliteView({ assetId: 'nasa-iss', modelStatus: 'fallido' }).actions,
    'inspect',
  );
  assert.equal(inspect.enabled, false);
  assert.match(inspect.hint, /no disponible/i);
});

test('other layers never get an inspect action', () => {
  const view = buildMissionDockView({
    dossier: createDossierState(trackedContext()),
    activity: createActivityState(),
    dock: createMissionDockState(),
    following: true,
  });
  assert.equal(actionById(view.actions, 'inspect'), undefined);
  assert.deepEqual(
    view.keyValues.map(({ label }) => label),
    ['ALTURA', 'VELOCIDAD', 'RUMBO'],
    'the flights rail is untouched',
  );
});

test('the satellite rail reads ALT · ÉPOCA · MODELO', () => {
  const view = satelliteView({ assetId: 'nasa-iss' });
  assert.deepEqual(
    view.keyValues.map(({ label, value }) => [label, value]),
    [
      ['ALT', '418 km'],
      ['ÉPOCA', 'vigente'],
      ['MODELO', 'específico'],
    ],
  );
  assert.equal(view.layerId, 'satellites');
  assert.deepEqual(
    satelliteView({ assetId: null }).keyValues.at(-1),
    { label: 'MODELO', value: 'punto', unit: null },
  );
});
