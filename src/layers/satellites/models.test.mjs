import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';
import { createSatelliteModels } from './models.js';
import {
  loadSatelliteManifest,
  resolveSatelliteModel,
} from './modelRegistry.js';
import { SAT_MODEL_PROFILES } from './modelBudget.js';
import { elementEpochMs } from './elements.js';
import { propagateStateEcef } from './orbits.js';
import {
  SAT_MODEL_EVICT_DEBOUNCE_MS,
  SAT_MODEL_MAX_LOAD_FAILS,
  SAT_MODEL_RECONCILE_MS,
  SAT_MODEL_RETRY_BACKOFF_MS,
} from './policy.js';

const ISS = 25544;
const HST = 20580;
const CUBE_A = 43000;
const CUBE_B = 43001;
const DENSE_ISS_CLONE = 25544;

const MANIFEST = loadSatelliteManifest(
  readFileSync(
    new URL('../../../public/models/satellites/manifest.json', import.meta.url),
    'utf8',
  ),
);
assert.equal(MANIFEST.ok, true, MANIFEST.reason);

const L1 =
  '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927';
const L2 =
  '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537';
const SATREC = twoline2satrec(L1, L2);
const EPOCH_MS = elementEpochMs(SATREC);
const FRESH_WALL_MS = EPOCH_MS + 3_600_000;

/** Camera sits on +X; a satellite `d` metres further out is `d` away. */
const CAMERA = Object.freeze(new Cesium.Cartesian3(7_000_000, 0, 0));
const VIEW_HEIGHT_PX = 1000;
const FOVY = Math.PI / 3;
const TAN = Math.tan(FOVY / 2);
/** Distance at which an asset of radius `r` projects to `px`. */
const distanceForPx = (radiusM, px) => (radiusM * VIEW_HEIGHT_PX) / (px * TAN);
const RADIUS = Object.fromEntries(
  MANIFEST.assets.map((asset) => [asset.id, asset.radiusM]),
);

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakeModel(options) {
  return {
    options,
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

/** Loader whose promises the test settles by hand. */
function controlledLoader() {
  const calls = [];
  const load = (options) => {
    const call = { options, model: fakeModel(options) };
    call.promise = new Promise((resolve, reject) => {
      call.resolve = async ({ ready = true } = {}) => {
        resolve(call.model);
        await flush();
        if (ready) {
          call.model.ready = true;
          call.model.readyEvent.raiseEvent(call.model);
        }
      };
      call.reject = async (error = new Error('404 Not Found')) => {
        reject(error);
        await flush();
      };
    });
    calls.push(call);
    return call.promise;
  };
  return { load, calls };
}

function fakeViewer(heightPx = VIEW_HEIGHT_PX) {
  const list = [];
  return {
    list,
    scene: {
      canvas: { clientHeight: heightPx },
      primitives: {
        add(primitive) {
          list.push(primitive);
          return primitive;
        },
        remove(primitive) {
          const index = list.indexOf(primitive);
          if (index < 0) return false;
          list.splice(index, 1);
          primitive.destroy?.();
          return true;
        },
        contains: (primitive) => list.includes(primitive),
      },
    },
    camera: { frustum: { fovy: FOVY } },
  };
}

function fakePoint(distanceM) {
  return {
    position: new Cesium.Cartesian3(7_000_000 + distanceM, 0, 0),
    show: true,
    color: 'base-color',
    pixelSize: 6,
  };
}

/**
 * @param {Array<{noradId: number, group: string, distanceM: number}>} rows
 */
function fakeState(rows) {
  const state = {
    _catalog: new Map(),
    _points: new Map(),
    _dockedCompanions: new Set(),
    _catalogRevision: 1,
  };
  for (const row of rows) {
    state._catalog.set(row.noradId, {
      name: `SAT-${row.noradId}`,
      satrec: SATREC,
      group: row.group,
      elementEpochMs: EPOCH_MS,
    });
    state._points.set(row.noradId, fakePoint(row.distanceM));
  }
  return state;
}

const registry = {
  version: 1,
  resolve: (subject, options) =>
    resolveSatelliteModel(subject, MANIFEST.assets, options),
};

function harness({
  rows,
  profile = 'std',
  isVisible = () => true,
  wallMs = FRESH_WALL_MS,
  credits,
  viewHeightPx = VIEW_HEIGHT_PX,
} = {}) {
  const loader = controlledLoader();
  const viewer = fakeViewer(viewHeightPx);
  const state = fakeState(rows);
  const clock = { t: 10_000 };
  const events = [];
  const creditLog = [];
  const models = createSatelliteModels({
    viewer,
    state,
    registry,
    profile: SAT_MODEL_PROFILES[profile],
    loadModel: loader.load,
    now: () => clock.t,
    wallNow: () => wallMs,
    resolveAsset: (uri) => `/base${uri}`,
    isVisible,
    credits: credits ?? {
      register: (credit) => creditLog.push(['register', credit.key]),
      unregister: (credit) => creditLog.push(['unregister', credit.key]),
    },
  });
  for (const type of ['model-ready', 'model-evicted', 'model-failed']) {
    models.on(type, (detail) => events.push({ type, ...detail }));
  }
  const tick = (input = {}, stepMs = SAT_MODEL_RECONCILE_MS) => {
    clock.t += stepMs;
    return models.reconcile({ cameraPosition: CAMERA, ...input });
  };
  return { models, loader, viewer, state, clock, events, creditLog, tick };
}

const modelPrimitivesIn = (viewer) =>
  viewer.list.flatMap((collection) =>
    collection instanceof Cesium.PrimitiveCollection
      ? Array.from({ length: collection.length }, (_, i) => collection.get(i))
      : [collection],
  );

test('policy exposes the per-URI failure veto and retry backoff', () => {
  assert.equal(SAT_MODEL_MAX_LOAD_FAILS, 3);
  assert.equal(SAT_MODEL_RETRY_BACKOFF_MS, 1500);
});

test('load options: real scale, no tint, no picking, no shadows, async', async () => {
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 5000 }],
  });
  h.tick({ trackedNorad: ISS });
  assert.equal(h.loader.calls.length, 1);
  const iss = MANIFEST.assets.find((asset) => asset.id === 'nasa-iss');
  assert.deepEqual(h.loader.calls[0].options, {
    url: `/base${iss.uri}`,
    scale: iss.scaleMeters,
    minimumPixelSize: 0,
    allowPicking: false,
    shadows: Cesium.ShadowMode.DISABLED,
    environmentMapOptions: { enabled: false },
    asynchronous: true,
  });
  await h.loader.calls[0].resolve();
  const stats = h.models.getStats();
  assert.equal(stats.active, 1);
  assert.equal(stats.ready, 1);
  assert.deepEqual(stats.ids, [ISS]);
  assert.equal(stats.profile, 'std');
  assert.equal(h.events[0].type, 'model-ready');
  assert.deepEqual(
    { noradId: h.events[0].noradId, assetId: h.events[0].assetId },
    { noradId: ISS, assetId: 'nasa-iss' },
  );
});

test('load options: the dynamic environment map is off (INSPECCIONAR cost, P4-24)', () => {
  // Cesium.Model enables DynamicEnvironmentMapManager by default: at 7.7 km/s
  // the ISS leaves its 1 km epsilon several times a second and the map is
  // regenerated with readPixels (output/eyeinsky-p4/t7/perf/diag/diag.json).
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 5000 }],
  });
  h.tick({ trackedNorad: ISS });
  assert.equal(h.loader.calls.length, 1);
  assert.equal(h.loader.calls[0].options.environmentMapOptions?.enabled, false);
});

test('cap counts pending loads (active + pending <= cap)', async () => {
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 3000 },
      { noradId: CUBE_A, group: 'cubesat', distanceM: 5 },
      { noradId: CUBE_B, group: 'cubesat', distanceM: 6 },
    ],
  });
  h.tick();
  assert.equal(h.loader.calls.length, 2, 'only cap loads start');
  for (let i = 0; i < 10; i += 1) h.tick();
  assert.equal(h.loader.calls.length, 2, 'pending loads hold their slots');
  const stats = h.models.getStats();
  assert.equal(stats.pending, 2);
  assert.ok(stats.active + stats.pending <= SAT_MODEL_PROFILES.std.cap);
  await h.loader.calls[0].resolve();
  h.tick();
  assert.equal(h.loader.calls.length, 2, 'still full: 1 active + 1 pending');
});

test('cancelled loads keep their slots until they settle', async () => {
  const h = harness({
    rows: [
      { noradId: CUBE_A, group: 'cubesat', distanceM: 5 },
      { noradId: CUBE_B, group: 'cubesat', distanceM: 6 },
      { noradId: ISS, group: 'stations', distanceM: 900_000 },
      { noradId: HST, group: 'visual', distanceM: 900_000 },
    ],
  });
  h.tick();
  assert.equal(h.loader.calls.length, 2);
  const move = (id, d) => {
    h.state._points.get(id).position = new Cesium.Cartesian3(
      7_000_000 + d,
      0,
      0,
    );
  };
  move(CUBE_A, 900_000);
  move(CUBE_B, 900_000);
  move(ISS, 3000);
  move(HST, 800);
  h.tick();
  assert.equal(h.loader.calls.length, 2, 'in-flight loads still count');
  await h.loader.calls[0].resolve();
  await h.loader.calls[1].resolve();
  assert.equal(h.loader.calls[0].model.destroyed, true);
  assert.equal(h.loader.calls[1].model.destroyed, true);
  h.tick();
  assert.equal(h.loader.calls.length, 4, 'slots free once they settle');
});

test('reconcile is throttled unless the tracked target changes', () => {
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 3000 },
      { noradId: HST, group: 'visual', distanceM: 800 },
    ],
  });
  assert.equal(h.tick({}, 0), true);
  assert.equal(h.tick({}, 10), false, 'within SAT_MODEL_RECONCILE_MS');
  assert.equal(h.tick({ trackedNorad: HST }, 10), true, 'target change');
});

test('the tracked target displaces a secondary at once', async () => {
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 3000 },
      { noradId: CUBE_A, group: 'cubesat', distanceM: 5 },
      { noradId: HST, group: 'visual', distanceM: 1500 },
    ],
  });
  h.tick();
  await h.loader.calls[0].resolve();
  await h.loader.calls[1].resolve();
  assert.equal(h.models.getStats().active, 2);
  h.tick({ trackedNorad: HST }, 1);
  const evicted = h.events.filter((event) => event.type === 'model-evicted');
  assert.equal(evicted.length, 1);
  assert.equal(evicted[0].noradId, ISS, 'the farther secondary yields');
  assert.equal(evicted[0].reason, 'displaced');
  assert.equal(h.loader.calls.length, 3);
  assert.equal(
    h.loader.calls[2].options.url,
    '/base/models/satellites/hubble-e5ba4de1.glb',
  );
  const stats = h.models.getStats();
  assert.ok(stats.active + stats.pending <= 2);
});

test('no thrashing at the hysteresis edges (100 alternating reconciles)', async () => {
  const radius = RADIUS['nasa-iss'];
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 0 }],
  });
  const at = (px) => {
    h.state._points.get(ISS).position = new Cesium.Cartesian3(
      7_000_000 + distanceForPx(radius, px),
      0,
      0,
    );
  };
  // ADD edge: 6 px ± 0.5.
  for (let i = 0; i < 100; i += 1) {
    at(i % 2 === 0 ? 6.5 : 5.5);
    h.tick({ trackedNorad: ISS }, SAT_MODEL_RECONCILE_MS + 50);
    if (i === 0) await h.loader.calls[0].resolve();
  }
  // KEEP edge: 3 px ± 0.5, each dip shorter than the eviction debounce.
  for (let i = 0; i < 100; i += 1) {
    at(i % 2 === 0 ? 2.5 : 3.5);
    h.tick({ trackedNorad: ISS }, SAT_MODEL_RECONCILE_MS + 50);
  }
  const stats = h.models.getStats();
  assert.equal(stats.admissions, 1, 'one add, no extra');
  assert.equal(stats.evictions, 0, 'no extra removal');
  assert.equal(h.loader.calls.length, 1);
});

test('leaving the band evicts only after the debounce', async () => {
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 5000 }],
  });
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].resolve();
  h.state._points.get(ISS).position = new Cesium.Cartesian3(9e9, 0, 0);
  h.tick({ trackedNorad: ISS });
  assert.equal(h.models.getStats().active, 1, 'still inside the debounce');
  h.tick({ trackedNorad: ISS }, SAT_MODEL_EVICT_DEBOUNCE_MS);
  assert.equal(h.models.getStats().active, 0);
  const evicted = h.events.find((event) => event.type === 'model-evicted');
  assert.equal(evicted.reason, 'lod');
});

test('A→B: the late load of A is invalidated and destroyed', async () => {
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 5000 },
      { noradId: HST, group: 'visual', distanceM: 900 },
    ],
  });
  h.tick({ trackedNorad: ISS });
  const lateIss = h.loader.calls[0];
  h.models.release(ISS, 'target-change');
  h.tick({ trackedNorad: HST }, 1);
  await lateIss.resolve();
  assert.equal(lateIss.model.destroyed, true, 'late model destroyed');
  assert.equal(modelPrimitivesIn(h.viewer).includes(lateIss.model), false);
  assert.equal(h.models.getStats().ids.includes(ISS), false);
  await h.loader.calls.at(-1).resolve();
  assert.deepEqual(h.models.getStats().ids, [HST]);
});

test('a catalog rebuild during a load discards the loaded model', async () => {
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 5000 }],
  });
  h.tick({ trackedNorad: ISS });
  h.state._catalogRevision += 1;
  await h.loader.calls[0].resolve();
  assert.equal(h.loader.calls[0].model.destroyed, true);
  assert.equal(h.models.getStats().active, 0);
});

test('404 or a corrupt model keeps the point and vetoes the URI after 3', async () => {
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 5000 }],
  });
  const point = h.state._points.get(ISS);
  const before = {
    ...point,
    position: Cesium.Cartesian3.clone(point.position),
  };
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].reject();
  h.tick({ trackedNorad: ISS }, SAT_MODEL_RETRY_BACKOFF_MS);
  // Corrupt: fromGltfAsync resolves, the decode fails in the scene update.
  await h.loader.calls[1].resolve({ ready: false });
  h.loader.calls[1].model.errorEvent.raiseEvent(new Error('Draco decode'));
  // The next frame retires it (failure timestamped there); retry after backoff.
  h.tick({ trackedNorad: ISS }, 1);
  assert.equal(h.loader.calls[1].model.destroyed, true);
  h.tick({ trackedNorad: ISS }, SAT_MODEL_RETRY_BACKOFF_MS);
  await h.loader.calls[2].reject();
  for (let i = 0; i < 10; i += 1)
    h.tick({ trackedNorad: ISS }, SAT_MODEL_RETRY_BACKOFF_MS);
  assert.equal(h.loader.calls.length, 3, 'vetoed after 3 failures');
  assert.equal(h.loader.calls[1].model.destroyed, true);
  const stats = h.models.getStats();
  assert.equal(stats.failed, 3);
  assert.equal(stats.active + stats.pending, 0);
  assert.deepEqual(stats.vetoed, ['/models/satellites/iss-70d0619a.glb']);
  const failures = h.events.filter((event) => event.type === 'model-failed');
  assert.equal(failures.length, 3);
  assert.equal(failures.at(-1).reason, 'vetoed');
  assert.equal(point.show, before.show);
  assert.equal(point.color, before.color);
  assert.equal(point.pixelSize, before.pixelSize);
  assert.ok(Cesium.Cartesian3.equals(point.position, before.position));
  assert.equal(modelPrimitivesIn(h.viewer).length, 0);
});

test('an errorEvent raised inside Model.update defers teardown to the next frame', async () => {
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 5000 }],
  });
  h.tick({ trackedNorad: ISS });
  const call = h.loader.calls[0];
  const { model } = call;
  // Same order as Cesium 1.138 Model.update: handleError raises errorEvent,
  // then updateImageBasedLighting reads a field that destroy() clears.
  model._imageBasedLighting = { update() {} };
  model.update = function update() {
    if (!this.raised) {
      this.raised = true;
      this.errorEvent.raiseEvent(new Error('Draco decode'));
    }
    this._imageBasedLighting.update();
  };
  const baseDestroy = model.destroy;
  model.destroy = function destroy() {
    this._imageBasedLighting = undefined;
    baseDestroy.call(this);
  };
  await call.resolve({ ready: false });
  const collection = h.viewer.list[0];
  assert.ok(collection instanceof Cesium.PrimitiveCollection);
  const neighbour = {
    updates: 0,
    update() {
      this.updates += 1;
    },
    destroy() {},
    isDestroyed: () => false,
  };
  collection.add(neighbour);
  assert.doesNotThrow(() => collection.update({}));
  assert.equal(neighbour.updates, 1, 'the next primitive is not skipped');
  assert.equal(model.destroyed, false, 'not destroyed inside its own update');
  assert.equal(model.show, false, 'hidden at once');
  model.errorEvent.raiseEvent(new Error('Draco decode again'));
  h.models.updatePoses({ trackedNorad: ISS, nowMs: FRESH_WALL_MS });
  assert.equal(model.destroyed, true, 'retired on the next frame');
  assert.equal(collection.contains(model), false);
  const failures = h.events.filter((event) => event.type === 'model-failed');
  assert.equal(failures.length, 1, 'repeated raises are idempotent');
  assert.equal(failures[0].reason, 'load-failed');
  const stats = h.models.getStats();
  assert.equal(stats.active, 0);
  assert.equal(stats.failed, 1);
});

test('dense, docked companions and expired elements never get a model', () => {
  const dense = harness({
    rows: [{ noradId: DENSE_ISS_CLONE, group: 'dense', distanceM: 3000 }],
  });
  dense.tick({ trackedNorad: DENSE_ISS_CLONE });
  assert.equal(dense.loader.calls.length, 0, 'dense group');

  const docked = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 900_000 },
      { noradId: HST, group: 'visual', distanceM: 800 },
    ],
  });
  docked.state._dockedCompanions = new Set([HST]);
  docked.tick({ trackedNorad: ISS });
  assert.equal(docked.loader.calls.length, 0, 'docked companion');

  const expired = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 3000 }],
    wallMs: EPOCH_MS + 30 * 86_400_000,
  });
  expired.tick({ trackedNorad: ISS });
  assert.equal(expired.loader.calls.length, 0, "elementAge 'caducada'");
});

test('secondaries must be on screen and within the distance ceiling', () => {
  const offscreen = harness({
    rows: [{ noradId: CUBE_A, group: 'cubesat', distanceM: 5 }],
    isVisible: () => false,
  });
  offscreen.tick();
  assert.equal(offscreen.loader.calls.length, 0);
  // A 10 000 px viewport makes the ISS ~48 px at 26 km: only the distance
  // ceiling (SAT_MODEL_SECONDARY_ADD_M = 25 km) can refuse it.
  const far = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 26_000 }],
    viewHeightPx: 10_000,
  });
  far.tick();
  assert.equal(far.loader.calls.length, 0, 'beyond SAT_MODEL_SECONDARY_ADD_M');
  const near = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 24_000 }],
    viewHeightPx: 10_000,
  });
  near.tick();
  assert.equal(near.loader.calls.length, 1, 'inside the ceiling');
});

test('low profile: tracked only, and Hubble never', async () => {
  const h = harness({
    profile: 'low',
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 2000 },
      { noradId: HST, group: 'visual', distanceM: 300 },
    ],
  });
  h.tick();
  assert.equal(h.loader.calls.length, 0, 'no secondary in low');
  h.tick({ trackedNorad: HST });
  assert.equal(h.loader.calls.length, 0, 'Hubble is no-model in low');
  h.tick({ trackedNorad: ISS });
  assert.equal(h.loader.calls.length, 1);
  assert.equal(h.models.getStats().profile, 'low');
  const off = harness({
    profile: 'off',
    rows: [{ noradId: ISS, group: 'stations', distanceM: 2000 }],
  });
  off.tick({ trackedNorad: ISS });
  assert.equal(off.loader.calls.length, 0);
});

test('setProfile to a smaller cap trims at once', async () => {
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 3000 },
      { noradId: CUBE_A, group: 'cubesat', distanceM: 5 },
    ],
  });
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].resolve();
  await h.loader.calls[1].resolve();
  h.models.setProfile(SAT_MODEL_PROFILES.off);
  assert.equal(h.models.getStats().active, 0);
  assert.equal(h.models.getStats().profile, 'off');
});

test('pose: tracked uses the shared tracking sample; secondary writes its point', async () => {
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 5000 },
      { noradId: CUBE_A, group: 'cubesat', distanceM: 5 },
    ],
  });
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].resolve();
  await h.loader.calls[1].resolve();
  const shared = new Cesium.Cartesian3(1234, 5678, 9012);
  const dateMs = EPOCH_MS + 60_000;
  h.models.updatePoses({
    trackedNorad: ISS,
    trackedPosition: shared,
    trackedDateMs: dateMs,
    nowMs: dateMs,
  });
  const byId = new Map(
    h.loader.calls.map((call) => [call.options.url, call.model]),
  );
  const issModel = byId.get('/base/models/satellites/iss-70d0619a.glb');
  const cubeModel = byId.get('/base/models/satellites/cubesat-1u-bae308ea.glb');
  const translation = (model) =>
    Cesium.Matrix4.getTranslation(model.modelMatrix, new Cesium.Cartesian3());
  assert.ok(Cesium.Cartesian3.equals(translation(issModel), shared));
  assert.equal(issModel.show, true);
  const expected = propagateStateEcef(SATREC, new Date(dateMs)).position;
  assert.ok(
    Cesium.Cartesian3.equalsEpsilon(translation(cubeModel), expected, 0, 1e-6),
  );
  assert.ok(
    Cesium.Cartesian3.equalsEpsilon(
      h.state._points.get(CUBE_A).position,
      expected,
      0,
      1e-6,
    ),
    'secondary point shares the model sample',
  );
  const rotation = Cesium.Matrix4.getMatrix3(
    issModel.modelMatrix,
    new Cesium.Matrix3(),
  );
  assert.ok(
    Math.abs(Cesium.Matrix3.determinant(rotation) - 1) < 1e-9,
    'orthonormal pose',
  );
});

test('pose falls back to neutral ENU when attitude is degenerate', async () => {
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 5000 }],
  });
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].resolve();
  const position = new Cesium.Cartesian3(6_800_000, 0, 0);
  h.models.updatePoses({
    trackedNorad: ISS,
    trackedPosition: position,
    trackedDateMs: Number.NaN,
    nowMs: EPOCH_MS,
  });
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(position);
  assert.ok(
    Cesium.Matrix4.equalsEpsilon(
      h.loader.calls[0].model.modelMatrix,
      enu,
      1e-9,
    ),
  );
});

test('destroy: active 0, pending 0, no primitives left, late loads destroyed', async () => {
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 3000 },
      { noradId: CUBE_A, group: 'cubesat', distanceM: 5 },
    ],
  });
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].resolve();
  const late = h.loader.calls[1];
  h.models.destroy();
  await late.resolve();
  const stats = h.models.getStats();
  assert.equal(stats.active, 0);
  assert.equal(stats.pending, 0);
  assert.equal(h.viewer.list.length, 0, 'collection removed from the scene');
  assert.equal(h.loader.calls[0].model.destroyed, true);
  assert.equal(late.model.destroyed, true);
  assert.equal(h.tick({ trackedNorad: ISS }), false, 'inert after destroy');
});

test('releaseAll (disable) empties at once and survives late loads', async () => {
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 3000 },
      { noradId: CUBE_A, group: 'cubesat', distanceM: 5 },
    ],
  });
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].resolve();
  const late = h.loader.calls[1];
  h.models.releaseAll('disabled');
  assert.deepEqual(
    {
      active: h.models.getStats().active,
      pending: h.models.getStats().pending,
    },
    { active: 0, pending: 0 },
  );
  await late.resolve();
  assert.equal(late.model.destroyed, true);
  assert.equal(modelPrimitivesIn(h.viewer).length, 0);
  h.tick({ trackedNorad: ISS }, SAT_MODEL_RECONCILE_MS);
  assert.equal(h.loader.calls.length, 4, 'reconcile rebuilds after enable');
});

test('NASA credit registered on first model-ready, retired at active 0', async () => {
  const h = harness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 5000 }],
  });
  h.tick({ trackedNorad: ISS });
  assert.deepEqual(h.creditLog, [], 'nothing before the model is ready');
  await h.loader.calls[0].resolve();
  assert.deepEqual(h.creditLog, [['register', 'nasa-3d-resources']]);
  h.models.release(ISS, 'target-change');
  assert.deepEqual(h.creditLog.at(-1), ['unregister', 'nasa-3d-resources']);
});

test('a target-change release does not come straight back as a secondary', async () => {
  // The follow camera reaches the new target a few frames later; until then
  // it still sits next to the old one, which would re-enter the secondary
  // band at once (one add + one evict for nothing).
  const h = harness({
    rows: [
      { noradId: ISS, group: 'stations', distanceM: 3000 },
      { noradId: HST, group: 'visual', distanceM: 900_000 },
    ],
  });
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].resolve();
  h.models.release(ISS, 'target-change');
  h.tick({ trackedNorad: HST }, 1);
  h.tick({ trackedNorad: HST });
  assert.equal(h.loader.calls.length, 1, 'no reload while cooling down');
  h.tick({ trackedNorad: HST }, SAT_MODEL_EVICT_DEBOUNCE_MS);
  assert.equal(h.loader.calls.length, 2, 'a genuine secondary after it');
});
