import * as Cesium from 'cesium';
import {
  destroyModels,
  modelStatus,
  releaseAllModels,
  releaseModel,
} from './modelLifecycle.js';
import { updateModelPoses } from './modelPose.js';
import { prefetchModel, reconcileModels } from './modelReconcile.js';
import {
  modelHandoffInput,
  modelScreenHit,
  modelTranslation,
} from './modelScreenHit.js';

/**
 * Near-field satellite models (P4 T4). The only part of the layer that
 * creates Cesium.Model primitives. It never touches the camera,
 * `viewer.trackedEntity`, `_trackedNorad` or the shared context: the layer
 * passes the tracked id in and keeps every one of those authorities. Points
 * stay visible and pickable (models load with `allowPicking: false`), and
 * SGP4 stays the only source of position.
 *
 * This module builds the context and the public façade; the work lives in
 * modelReconcile.js (LOD + cap), modelLifecycle.js (loads, eviction,
 * failures, teardown) and modelPose.js (per-frame pose).
 */

export const SAT_MODEL_EVENT_TYPES = Object.freeze([
  'model-ready',
  'model-evicted',
  'model-failed',
]);

const defaultLoadModel = (options) => Cesium.Model.fromGltfAsync(options);

const defaultToWindow = (scene, position, result) =>
  Cesium.SceneTransforms.worldToWindowCoordinates(scene, position, result);

const defaultIsCoarsePointer = () =>
  globalThis.matchMedia?.('(pointer: coarse)')?.matches === true;

/** Real load-timeout timers (unref'd: never hold a Node process). */
export const SAT_MODEL_DEFAULT_TIMERS = Object.freeze({
  set: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    // Node test runs must not wait 20 s on a load watchdog.
    handle?.unref?.();
    return handle;
  },
  clear: (handle) => clearTimeout(handle),
});

/** Frustum test built on the viewer camera; true when it cannot tell. */
function createFrustumVisibility(viewer) {
  const sphere = new Cesium.BoundingSphere();
  return (position, radiusM) => {
    const camera = viewer?.camera;
    const frustum = camera?.frustum;
    if (typeof frustum?.computeCullingVolume !== 'function') return true;
    const culling = frustum.computeCullingVolume(
      camera.positionWC,
      camera.directionWC,
      camera.upWC,
    );
    Cesium.Cartesian3.clone(position, sphere.center);
    sphere.radius = radiusM;
    return culling.computeVisibility(sphere) !== Cesium.Intersect.OUTSIDE;
  };
}

function createStore(profile) {
  return {
    profile,
    destroyed: false,
    epoch: 0,
    active: new Map(),
    pending: new Map(),
    gen: new Map(),
    failures: new Map(),
    outcomes: new Map(),
    timeouts: new Map(),
    vetoed: new Set(),
    cooldown: new Map(),
    collection: null,
    lastReconcileMs: Number.NEGATIVE_INFINITY,
    lastTracked: undefined,
    eligible: { key: null, list: [] },
    counters: { admissions: 0, evictions: 0, failed: 0 },
    creditShown: false,
    listeners: new Map(SAT_MODEL_EVENT_TYPES.map((type) => [type, new Set()])),
  };
}

function statsOf(store) {
  const entries = [...store.active.values()];
  return {
    active: store.active.size,
    ready: entries.filter((entry) => entry.ready).length,
    pending: store.pending.size,
    failed: store.counters.failed,
    admissions: store.counters.admissions,
    evictions: store.counters.evictions,
    ids: [...store.active.keys()],
    vetoed: [...store.vetoed],
    profile: store.profile?.name ?? null,
  };
}

function subscribe(store, type, listener) {
  const set = store.listeners.get(type);
  if (!set) throw new TypeError(`Unknown satellite model event: ${type}`);
  set.add(listener);
  return () => set.delete(listener);
}

/**
 * @param {object} options
 * @param {object} options.viewer Cesium viewer (scene.primitives, camera).
 * @param {object} options.state Layer state (read: _catalog, _points,
 *   _dockedCompanions, _catalogRevision; write: secondary point positions).
 * @param {{resolve: Function, version?: number}} options.registry Resolves a
 *   `{noradId, group}` subject to a manifest asset (modelRegistry.js).
 * @param {Readonly<object>} options.profile One of SAT_MODEL_PROFILES.
 * @param {(options: object) => Promise<object>} [options.loadModel]
 * @param {() => number} [options.now] Monotonic ms for cadence/debounce.
 * @param {() => number} [options.wallNow] Epoch ms for element age.
 * @param {(uri: string) => string} [options.resolveAsset]
 * @param {{register: Function, unregister: Function}|null} [options.credits]
 * @param {(position: object, radiusM: number) => boolean} [options.isVisible]
 * @param {(scene: object, position: object, result: object) => object}
 *   [options.toWindow] World → window CSS px (SceneTransforms by default).
 * @param {() => boolean} [options.isCoarsePointer]
 * @param {{set: Function, clear: Function}} [options.timers] Load timeouts.
 */
export function createSatelliteModels({
  viewer,
  state,
  registry,
  profile,
  loadModel = defaultLoadModel,
  now = () => performance.now(),
  wallNow = () => Date.now(),
  resolveAsset = (uri) => uri,
  credits = null,
  isVisible = null,
  toWindow = defaultToWindow,
  isCoarsePointer = defaultIsCoarsePointer,
  timers = SAT_MODEL_DEFAULT_TIMERS,
}) {
  const store = createStore(profile);
  const ctx = Object.freeze({
    viewer,
    state,
    registry,
    store,
    loadModel,
    now,
    wallNow,
    resolveAsset,
    credits,
    visible: isVisible ?? createFrustumVisibility(viewer),
    toWindow,
    isCoarsePointer,
    timers,
  });
  return createFacade(ctx);
}

/** Public façade over the models context. */
function createFacade(ctx) {
  const { store } = ctx;
  return {
    reconcile: (input) => reconcileModels(ctx, input),
    updatePoses: (frame) => updateModelPoses(ctx, frame),
    release: (id, reason) => releaseModel(ctx, id, reason),
    releaseAll: (reason) => releaseAllModels(ctx, reason),
    prefetch: (id) => prefetchModel(ctx, id),
    setProfile(nextProfile) {
      if (store.destroyed || nextProfile === store.profile) return;
      releaseAllModels(ctx, 'profile');
      store.profile = nextProfile;
    },
    getStats: () => statsOf(store),
    statusOf: (id) => modelStatus(store, id),
    screenHit: (windowPosition, id) => modelScreenHit(ctx, windowPosition, id),
    handoffInput: (id) => modelHandoffInput(ctx, id),
    translation: (id, result) => modelTranslation(ctx, id, result),
    on: (type, listener) => subscribe(store, type, listener),
    destroy: () => destroyModels(ctx),
  };
}
