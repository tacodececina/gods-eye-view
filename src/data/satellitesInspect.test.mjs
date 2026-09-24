/**
 * P4 T5 — INSPECCIONAR/ÓRBITA, clic sobre el casco y paso punto→modelo, por la
 * ruta de producción de la capa (tracking, interaction, rendering, models).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';
import satellitesLayer, {
  _attachSatelliteModelsForTest,
  _runSatellitePreRenderForTest,
  _setSatelliteLabelLifecycleStateForTest,
  _trackedFrameCartesianForTest,
  _trackIssForTest,
} from './satellites.js';
import { TRACK_VIEW_FROM_LEO } from '../layers/satellites/policy.js';
import {
  dockBiasElevation,
  targetElevation,
} from '../layers/satellites/dockBias.js';
import { SATELLITE_CONTEXT_KEYS } from '../layers/satellites/contextFields.js';
import { summarizeContextRecord } from '../voice/gevActions.js';
import { satelliteRecord } from '../testSupport/satelliteContextRecord.mjs';

const ISS = 25544;
const SATREC = twoline2satrec(
  '1 25544U 98067A   26267.14191496  .00009634  00000+0  18116-3 0  9999',
  '2 25544  51.6318 170.3464 0004691 174.6338 185.4701 15.49258637587098',
);
const MANIFEST_TEXT = readFileSync(
  new URL('../../public/models/satellites/manifest.json', import.meta.url),
  'utf8',
);
const ISS_INSPECT_RANGE_M = 8 * 72.068;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const silentHost = { setEntries() {}, setVisible() {}, clearSource() {} };

// The shared context slot hangs from `window`, as in the browser.
globalThis.window ??= new EventTarget();

// This viewer has a camera (the framing writes it) but no WebGL frame state:
// the focus-rectangle projection has nothing to project with in Node, so it
// reports "off screen" and the focus target is simply cleared.
Cesium.SceneTransforms.worldToWindowCoordinates = () => undefined;

function fakeModel() {
  return {
    show: true,
    ready: false,
    destroyed: false,
    modelMatrix: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
    readyEvent: new Cesium.Event(),
    errorEvent: new Cesium.Event(),
    destroy() {
      this.destroyed = true;
    },
    isDestroyed() {
      return this.destroyed;
    },
  };
}

/** Aim a local-frame camera straight at its origin (the tracked target). */
function aimAtOrigin(camera) {
  const d = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.negate(camera.position, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const z = Cesium.Cartesian3.UNIT_Z;
  const up = Cesium.Cartesian3.subtract(
    z,
    Cesium.Cartesian3.multiplyByScalar(
      d,
      Cesium.Cartesian3.dot(z, d),
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  camera.direction = d;
  camera.up = Cesium.Cartesian3.normalize(up, up);
}

/** Follow-camera viewer: assigning trackedEntity raises trackedEntityChanged. */
function followViewer() {
  const trackedEntityChanged = new Cesium.Event();
  const assignments = [];
  let tracked;
  const camera = {
    position: Cesium.Cartesian3.clone(TRACK_VIEW_FROM_LEO),
    transform: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
    frustum: { fovy: Math.PI / 3 },
    flightsCancelled: 0,
    lookAts: [],
    cancelFlight() {
      this.flightsCancelled += 1;
    },
    lookAtTransform(transform, offset) {
      this.lookAts.push(Cesium.Cartesian3.clone(offset));
      Cesium.Cartesian3.clone(offset, this.position);
      aimAtOrigin(this);
    },
  };
  aimAtOrigin(camera);
  return {
    entities: new Cesium.EntityCollection(),
    camera,
    trackedEntityChanged,
    assignments,
    get trackedEntity() {
      return tracked;
    },
    set trackedEntity(value) {
      if (value === tracked) return;
      tracked = value;
      assignments.push(value);
      trackedEntityChanged.raiseEvent(value);
    },
    scene: {
      frameState: { frameNumber: 1 },
      primitives: { add: (p) => p, remove() {} },
    },
  };
}

/** Viewer the models render through: its camera 4 km from the sample. */
function modelsViewerNearIss() {
  return {
    scene: {
      canvas: { clientHeight: 1000 },
      primitives: { add: (p) => p, remove: () => true },
    },
    camera: {
      frustum: { fovy: Math.PI / 3 },
      // 4 km from the tracked sample: ISS ≈ 31 px across.
      get positionWC() {
        return Cesium.Cartesian3.add(
          _trackedFrameCartesianForTest(),
          new Cesium.Cartesian3(4000, 0, 0),
          new Cesium.Cartesian3(),
        );
      },
    },
  };
}

/** Injected model seams: manifest, profile, projector and a manual loader. */
function modelOptionsFor({ profile, window, loads }) {
  return {
    resolveAsset: (uri) => `/app${uri}`,
    fetchText: async () => MANIFEST_TEXT,
    readSignals: () => ({ override: profile }),
    prefetchAsset: () => {},
    isVisible: () => true,
    toWindow: (s, position, result) =>
      Cesium.Cartesian2.fromElements(window.x, window.y, result),
    isCoarsePointer: () => false,
    loadModel: (options) => {
      const call = { options, model: fakeModel() };
      call.promise = new Promise((resolve, reject) => {
        call.resolve = async () => {
          resolve(call.model);
          await flush();
          call.model.ready = true;
          call.model.readyEvent.raiseEvent(call.model);
        };
        call.reject = async () => {
          reject(new Error('404 Not Found'));
          await flush();
        };
      });
      loads.push(call);
      return call.promise;
    },
  };
}

function scene({
  now = () => Date.UTC(2026, 8, 24, 6, 0, 0),
  profile = 'std',
  others = [],
  pointCollection = null,
  dockViewport = null,
} = {}) {
  const viewer = followViewer();
  const loads = [];
  const window = { x: 640, y: 400 };
  const modelsViewer = modelsViewerNearIss();
  _setSatelliteLabelLifecycleStateForTest({
    viewer,
    satrec: SATREC,
    point: {
      position: Cesium.Cartesian3.fromDegrees(-97.7, 30.2, 420_000),
      show: true,
      pixelSize: 12,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: 0,
    },
    overlayHost: silentHost,
    now,
    others,
    pointCollection,
    dockViewport,
  });
  // Production listener body, wired the way _installClickHandler wires it.
  viewer.trackedEntityChanged.addEventListener(() =>
    satellitesLayer._satelliteTrackedEntityChangedForTest(),
  );
  _attachSatelliteModelsForTest(
    modelsViewer,
    modelOptionsFor({ profile, window, loads }),
  );
  return { viewer, modelsViewer, loads, window };
}

const viewFromOf = (entity) =>
  entity.viewFrom.getValue(Cesium.JulianDate.now());
const range = (vector) => Cesium.Cartesian3.magnitude(vector);
const direction = (vector) =>
  Cesium.Cartesian3.normalize(vector, new Cesium.Cartesian3());
const contextRecord = (id = ISS) =>
  window.__gevContextStore?.entities?.get(String(id)) ?? null;

async function trackIss(options) {
  const s = scene(options);
  await flush();
  const entity = _trackIssForTest();
  assert.equal(s.viewer.trackedEntity, entity, 'precondition: following');
  s.viewer.assignments.length = 0;
  return { ...s, entity };
}

test('INSPECCIONAR (reduced motion): same NORAD, inspect range, instant, no auto-untrack', async () => {
  const s = await trackIss();
  const cleared = [];
  const onCleared = (event) => cleared.push(event.detail);
  window.addEventListener('gev:awareness-subject-cleared', onCleared);
  try {
    assert.equal(satellitesLayer.getTrackedFraming(), 'orbit');
    const ok = satellitesLayer.setTrackedFraming('inspect', {
      reducedMotion: true,
    });
    assert.equal(ok, true);
    const viewFrom = viewFromOf(s.entity);
    assert.ok(Math.abs(range(viewFrom) - ISS_INSPECT_RANGE_M) < 1e-6);
    assert.ok(
      Cesium.Cartesian3.equalsEpsilon(
        direction(viewFrom),
        direction(TRACK_VIEW_FROM_LEO),
        1e-12,
      ),
      'same direction as the orbit framing',
    );
    assert.deepEqual(
      s.viewer.assignments,
      [undefined, s.entity],
      'instant: the follow camera is re-engaged on the new viewFrom',
    );
    assert.equal(s.viewer.trackedEntity, s.entity);
    assert.equal(satellitesLayer.getParams().selectedSatTrackingId, ISS);
    assert.deepEqual(cleared, [], 'reassigning never auto-untracks');
    assert.equal(satellitesLayer.getTrackedFraming(), 'inspect');
    assert.equal(satellitesLayer.getTrackedInfo()?.framing, 'inspect');
    assert.equal(contextRecord()?.properties?.framing, 'inspect');
    assert.equal(contextRecord()?.id, String(ISS), 'context keeps its subject');
  } finally {
    window.removeEventListener('gev:awareness-subject-cleared', onCleared);
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('ÓRBITA returns to TRACK_VIEW_FROM_LEO with the same NORAD', async () => {
  const s = await trackIss();
  try {
    satellitesLayer.setTrackedFraming('inspect', { reducedMotion: true });
    assert.equal(
      satellitesLayer.setTrackedFraming('orbit', { reducedMotion: true }),
      true,
    );
    assert.ok(
      Cesium.Cartesian3.equalsEpsilon(
        viewFromOf(s.entity),
        TRACK_VIEW_FROM_LEO,
        1e-6,
      ),
      'ÓRBITA returns to TRACK_VIEW_FROM_LEO',
    );
    assert.equal(contextRecord()?.properties?.framing, 'orbit');
    assert.equal(satellitesLayer.getParams().selectedSatTrackingId, ISS);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('INSPECCIONAR with motion eases the camera offset without re-engaging', async () => {
  let nowMs = Date.UTC(2026, 8, 24, 6, 0, 0);
  const s = await trackIss({ now: () => nowMs });
  try {
    satellitesLayer.setTrackedFraming('inspect', { reducedMotion: false });
    assert.deepEqual(s.viewer.assignments, [], 'the camera is not yanked');
    const ranges = [];
    for (let i = 0; i < 10; i += 1) {
      nowMs += 100;
      s.viewer.scene.frameState.frameNumber += 1;
      _runSatellitePreRenderForTest();
      ranges.push(range(s.viewer.camera.position));
    }
    assert.ok(ranges[0] < range(TRACK_VIEW_FROM_LEO), 'moving in');
    for (let i = 1; i < ranges.length; i += 1)
      assert.ok(ranges[i] <= ranges[i - 1] + 1e-6, 'monotonic approach');
    assert.ok(
      Math.abs(ranges.at(-1) - ISS_INSPECT_RANGE_M) < 1e-6,
      `lands on the inspect range (${ranges.at(-1)})`,
    );
    const writes = s.viewer.camera.lookAts.length;
    nowMs += 100;
    _runSatellitePreRenderForTest();
    assert.equal(s.viewer.camera.lookAts.length, writes, 'tween finished');
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('a gesture releases the camera mid-tween; SEGUIR recovers inspect', async () => {
  let nowMs = Date.UTC(2026, 8, 24, 6, 0, 0);
  const s = await trackIss({ now: () => nowMs });
  try {
    satellitesLayer.setTrackedFraming('inspect', { reducedMotion: false });
    nowMs += 100;
    _runSatellitePreRenderForTest();
    const writes = s.viewer.camera.lookAts.length;
    assert.equal(
      satellitesLayer.releaseCameraOwnership({ origin: 'user' }),
      true,
    );
    nowMs += 100;
    _runSatellitePreRenderForTest();
    assert.equal(
      s.viewer.camera.lookAts.length,
      writes,
      'a released camera is never written by the tween',
    );
    assert.equal(satellitesLayer.getTrackedFraming(), 'inspect');
    assert.equal(satellitesLayer.refocusTrackedById(ISS), true);
    assert.equal(s.viewer.trackedEntity, s.entity);
    assert.ok(
      Math.abs(range(viewFromOf(s.entity)) - ISS_INSPECT_RANGE_M) < 1e-6,
      'SEGUIR lands on the framing in force',
    );
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('inspect is refused without a resolved asset or without a subject', async () => {
  // Profile 'off': the ISS resolves to no asset, it stays an SGP4 point.
  const s = scene({ profile: 'off' });
  await flush();
  const entity = _trackIssForTest();
  try {
    assert.equal(
      satellitesLayer.setTrackedFraming('inspect', { reducedMotion: true }),
      false,
    );
    assert.equal(satellitesLayer.getTrackedFraming(), 'orbit');
    assert.equal(satellitesLayer.setTrackedFraming('zoom'), false);
    assert.equal(s.viewer.trackedEntity, entity);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
  assert.equal(satellitesLayer.setTrackedFraming('orbit'), false);
  assert.equal(satellitesLayer.getTrackedFraming(), null);
});

test('a new target always starts in orbit framing', async () => {
  const s = await trackIss();
  satellitesLayer.setTrackedFraming('inspect', { reducedMotion: true });
  satellitesLayer.stopTracking({ origin: 'user' });
  const again = _trackIssForTest();
  assert.equal(satellitesLayer.getTrackedFraming(), 'orbit');
  assert.ok(
    Cesium.Cartesian3.equalsEpsilon(
      viewFromOf(again),
      TRACK_VIEW_FROM_LEO,
      1e-6,
    ),
  );
  assert.equal(s.viewer.trackedEntity, again);
  satellitesLayer.stopTracking({ origin: 'user' });
});

test('handoff: a ready model beyond 24 px turns the dot into a reticle', async () => {
  const s = await trackIss();
  try {
    s.viewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
    const graphic = s.entity.point;
    const now = Cesium.JulianDate.now();
    assert.equal(graphic.pixelSize.getValue(now), 14, 'dot while loading');
    await s.loads.at(-1).resolve();
    s.viewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
    assert.equal(graphic.pixelSize.getValue(now), 4, 'reticle');
    assert.equal(graphic.color.getValue(now).alpha, 0.5);
    assert.ok(s.entity.point, 'the point graphic is never removed');
    assert.equal(s.viewer.trackedEntity, s.entity);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('a click on the tracked hull keeps the selection; empty space clears it', async () => {
  const s = await trackIss();
  const clickViewer = {
    scene: { pick: () => undefined, drillPick: () => [] },
  };
  try {
    s.viewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
    await s.loads.at(-1).resolve();
    s.viewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
    // The model centre projects to (640, 400); 4 km away the ISS is ≈ 31 px
    // across (15.6 px radius): 10 px beside it is hull, 260 px is empty space.
    satellitesLayer._handleSatelliteClickForTest(clickViewer, {
      position: new Cesium.Cartesian2(650, 400),
    });
    assert.equal(satellitesLayer.getParams().selectedSatTrackingId, ISS);
    assert.equal(s.viewer.trackedEntity, s.entity, 'camera untouched');
    satellitesLayer._handleSatelliteClickForTest(clickViewer, {
      position: new Cesium.Cartesian2(900, 400),
    });
    assert.equal(
      satellitesLayer.getParams().selectedSatTrackingId,
      null,
      'a click off the hull on empty space still deselects',
    );
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('a pick on another satellite over the hull still switches target', async () => {
  const OTHER = 20580;
  const s = await trackIss({
    others: [
      {
        noradId: OTHER,
        name: 'HST',
        group: 'visual',
        point: {
          position: Cesium.Cartesian3.fromDegrees(-97.6, 30.2, 540_000),
          show: true,
        },
      },
    ],
  });
  try {
    s.viewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
    await s.loads.at(-1).resolve();
    s.viewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
    const otherPick = { primitive: { id: OTHER } };
    satellitesLayer._handleSatelliteClickForTest(
      { scene: { pick: () => otherPick, drillPick: () => [otherPick] } },
      { position: new Cesium.Cartesian2(645, 400) },
    );
    assert.equal(satellitesLayer.getParams().selectedSatTrackingId, OTHER);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('the tracked card welds to the rendered model, not the advanced sample', async () => {
  let nowMs = Date.UTC(2026, 8, 24, 6, 0, 0);
  const s = await trackIss({ now: () => nowMs });
  const tick = () =>
    Cesium.Cartesian3.clone(
      s.entity.position.getValue(Cesium.JulianDate.now()),
    );
  const frame = () => {
    s.viewer.scene.frameState.frameNumber += 1;
    nowMs += 100;
    _runSatellitePreRenderForTest();
  };
  try {
    assert.equal(typeof s.entity.gevVisualPosition, 'function');
    tick();
    frame();
    await s.loads.at(-1).resolve();
    const shown = tick();
    frame();
    assert.ok(
      Cesium.Cartesian3.distance(shown, _trackedFrameCartesianForTest()) > 100,
      'precondition: the preRender advanced the display cache',
    );
    const visual = s.entity.gevVisualPosition();
    assert.ok(
      Cesium.Cartesian3.equals(visual, shown),
      `card ${Cesium.Cartesian3.distance(visual, shown).toFixed(1)} m from the dot`,
    );
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('the tracked detection bracket sits on the drawn hull, not one frame ahead', async () => {
  let nowMs = Date.UTC(2026, 8, 24, 6, 0, 0);
  const s = await trackIss({
    now: () => nowMs,
    pointCollection: { show: true },
  });
  const tick = () =>
    Cesium.Cartesian3.clone(
      s.entity.position.getValue(Cesium.JulianDate.now()),
    );
  const frame = () => {
    s.viewer.scene.frameState.frameNumber += 1;
    nowMs += 100;
    _runSatellitePreRenderForTest();
  };
  try {
    tick();
    frame();
    await s.loads.at(-1).resolve();
    const shown = tick();
    frame();
    const tracked = satellitesLayer
      .getDetectableObjects()
      .find((object) => object.sourceId === ISS);
    assert.ok(tracked, 'the tracked satellite is still detectable');
    assert.ok(
      Cesium.Cartesian3.equals(tracked.position, shown),
      `bracket ${Cesium.Cartesian3.distance(tracked.position, shown).toFixed(1)} m from the hull`,
    );
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

const PHONE_DOCK = { bandPx: 442, widthPx: 390, heightPx: 844 };
const elevationOf = (camera) => targetElevation(camera);
const wantedFor = (viewport, camera) =>
  dockBiasElevation({ ...viewport, fovy: camera.frustum.fovy });

test('phone with the dock open: the follow camera lifts the target above the dock', async () => {
  let nowMs = Date.UTC(2026, 8, 24, 6, 0, 0);
  let viewport = PHONE_DOCK;
  const s = await trackIss({ now: () => nowMs, dockViewport: () => viewport });
  const camera = s.viewer.camera;
  const frame = () => {
    nowMs += 100;
    s.viewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
  };
  try {
    const wanted = wantedFor(PHONE_DOCK, camera);
    assert.ok(wanted > 0.2, `precondition: a real lift (${wanted})`);
    frame();
    assert.ok(Math.abs(elevationOf(camera) - wanted) < 1e-9, 'orbit: lifted');
    assert.ok(
      Math.abs(range(camera.position) - range(TRACK_VIEW_FROM_LEO)) < 1e-6,
      'the framing range is untouched',
    );
    satellitesLayer.setTrackedFraming('inspect', { reducedMotion: false });
    for (let i = 0; i < 10; i += 1) frame();
    assert.ok(Math.abs(range(camera.position) - ISS_INSPECT_RANGE_M) < 1e-6);
    assert.ok(Math.abs(elevationOf(camera) - wanted) < 1e-9, 'inspect: lifted');
    viewport = { ...PHONE_DOCK, widthPx: 1280 };
    frame();
    assert.ok(Math.abs(elevationOf(camera)) < 1e-9, 'wide viewport: centred');
    viewport = PHONE_DOCK;
    satellitesLayer.releaseCameraOwnership({ origin: 'user' });
    const released = Cesium.Cartesian3.clone(camera.direction);
    frame();
    assert.ok(
      Cesium.Cartesian3.equals(camera.direction, released),
      'a released camera is never pitched',
    );
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

// P4-21 on the REAL record: what tracking.js publishes to the context store
// (and what voice compacts from it) carries only the whitelisted flat keys,
// and attitude is a label — never a number, whatever key it hides under.
const ATTITUDE_LABELS = ['lvlh-nominal-aprox', 'desconocida', 'n/a'];
const QUATERNION_TEXT = /-?\d+(?:\.\d+)?(?:\s*[, ]\s*-?\d+(?:\.\d+)?){3}/;
const ANGLE_TEXT = /-?\d+(?:[.,]\d+)?\s*(?:°|deg|rad)\b/i;
const SUBJECTS = [
  { noradId: ISS, name: 'ISS (ZARYA)', group: 'stations', asset: true },
  { noradId: 20580, name: 'HST', group: 'visual', asset: true },
  { noradId: 43000, name: 'CUBE-1U', group: 'cubesat', asset: true },
  { noradId: 24876, name: 'GPS BIIR-2', group: 'gps-ops', asset: false },
];
const otherRows = SUBJECTS.filter((row) => row.noradId !== ISS).map((row) => ({
  ...row,
  point: {
    position: Cesium.Cartesian3.fromDegrees(-97.6, 30.2, 540_000),
    show: true,
  },
}));

function assertRealRecordClean(where, record) {
  assert.ok(record, `${where}: the layer published a record`);
  assert.deepEqual(
    Object.keys(record.properties),
    [...SATELLITE_CONTEXT_KEYS],
    `${where}: only the whitelisted flat keys`,
  );
  assert.ok(
    ATTITUDE_LABELS.includes(record.properties.attitude),
    `${where}: attitude is a label (${record.properties.attitude})`,
  );
  const voice = summarizeContextRecord(record, { includeProperties: true });
  for (const [key, value] of Object.entries(voice.properties)) {
    if (key === 'attitude')
      assert.doesNotMatch(value, /\d/, `${where}: voice ${key}=${value}`);
    assert.doesNotMatch(value, QUATERNION_TEXT, `${where}: voice ${key}`);
  }
  assert.doesNotMatch(
    JSON.stringify(record.properties),
    ANGLE_TEXT,
    `${where}: no angle text`,
  );
}

/** Drive one subject through orbit/inspect × model states; check each. */
async function walkSubject(s, subject, settle) {
  const seen = new Set();
  const read = (label) => {
    const record = contextRecord(subject.noradId);
    assertRealRecordClean(`${subject.name}/${label}`, record);
    seen.add(`${record.properties.framing}:${record.properties.modelStatus}`);
  };
  const frame = () => {
    s.viewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
  };
  const loadsBefore = s.loads.length;
  assert.equal(
    satellitesLayer.trackById(subject.noradId, { origin: 'user' }),
    true,
  );
  read('selected');
  frame();
  for (const framing of ['orbit', 'inspect']) {
    satellitesLayer.setTrackedFraming(framing, { reducedMotion: true });
    read(`${framing}/before-settle`);
  }
  for (const load of s.loads.slice(loadsBefore)) await load[settle]();
  frame();
  for (const framing of ['inspect', 'orbit']) {
    satellitesLayer.setTrackedFraming(framing, { reducedMotion: true });
    read(`${framing}/${settle}`);
  }
  return seen;
}

test('P4-21: the REAL published record has only whitelisted keys and no attitude numbers', async () => {
  const s = scene({ others: otherRows });
  await flush();
  const seen = new Set();
  try {
    for (const settle of ['resolve', 'reject']) {
      for (const subject of SUBJECTS) {
        for (const state of await walkSubject(s, subject, settle))
          seen.add(`${subject.asset ? 'asset' : 'none'}:${state}`);
        satellitesLayer.stopTracking({ origin: 'user' });
      }
    }
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
  for (const expected of [
    'asset:orbit:cargando',
    'asset:inspect:cargando',
    'asset:orbit:listo',
    'asset:inspect:listo',
    'asset:orbit:fallido',
    'asset:inspect:fallido',
    'none:orbit:n/a',
  ])
    assert.ok(seen.has(expected), `state ${expected} covered (${[...seen]})`);
});

test('the UI fixture record keeps parity with the record tracking.js publishes', async () => {
  await trackIss();
  try {
    const real = contextRecord(ISS);
    assert.deepEqual(
      Object.keys(satelliteRecord().properties),
      Object.keys(real.properties),
    );
    for (const key of ['id', 'layerId', 'layerName', 'source', 'status'])
      assert.equal(satelliteRecord()[key], real[key], key);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});
