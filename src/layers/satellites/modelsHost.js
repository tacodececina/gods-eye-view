import * as Cesium from 'cesium';
import { SAT_MODEL_EVENT_TYPES, createSatelliteModels } from './models.js';
import {
  loadSatelliteManifest,
  resolveSatelliteModel,
} from './modelRegistry.js';
import { profileOverrideFromSearch, selectProfile } from './modelBudget.js';
import { SAT_MODEL_MANIFEST_URI } from './policy.js';

/**
 * Layer glue for near-field satellite models (P4 T4). Owns the manifest
 * fetch, the profile choice and the one `createSatelliteModels` instance for
 * the viewer's lifetime (state._models). Lifecycle, rendering and tracking
 * call into this part; the camera, `trackedEntity`, `_trackedNorad` and the
 * shared context stay with them.
 */

async function defaultFetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

/** Warm the HTTP cache for a GLB; a failure only means no head start. */
function defaultPrefetchAsset(url) {
  if (typeof fetch !== 'function') return;
  fetch(url, { priority: 'low' })
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .catch(() => {});
}

function readBrowserSignals() {
  if (typeof window === 'undefined') return {};
  return {
    override: profileOverrideFromSearch(window.location?.search),
    coarsePointer: window.matchMedia?.('(pointer: coarse)')?.matches === true,
    viewportWidth: window.innerWidth,
    deviceMemory: globalThis.navigator?.deviceMemory,
  };
}

const DETACHED_STATS = Object.freeze({
  active: 0,
  ready: 0,
  pending: 0,
  failed: 0,
  admissions: 0,
  evictions: 0,
  ids: Object.freeze([]),
  vetoed: Object.freeze([]),
});

/** Manifest-backed registry; resolves nothing until the manifest is ready. */
function createRegistry(manifest) {
  return {
    get version() {
      return manifest.version;
    },
    resolve: (subject, resolveOptions) =>
      manifest.assets
        ? resolveSatelliteModel(subject, manifest.assets, resolveOptions)
        : null,
  };
}

function loadManifest(host) {
  const { manifest } = host;
  if (manifest.promise) return manifest.promise;
  manifest.status = 'loading';
  const url = host.options.resolveAsset(SAT_MODEL_MANIFEST_URI);
  manifest.promise = Promise.resolve()
    .then(() => host.options.fetchText(url))
    .then((text) => {
      const result = loadSatelliteManifest(text);
      if (!result.ok) throw new Error(result.reason);
      manifest.assets = result.assets;
      manifest.version += 1;
      manifest.status = 'ready';
    })
    .catch((error) => {
      manifest.status = 'failed';
      manifest.promise = null;
      console.warn('[Data:Satellites] Model manifest unavailable:', error);
    });
  return manifest.promise;
}

function creditsFor(host, viewer) {
  const credits = host.services?.credits;
  return {
    register: (credit) => credits?.registerDynamicCredit?.(viewer, credit),
    unregister: (credit) => credits?.unregisterDynamicCredit?.(viewer, credit),
  };
}

/**
 * Re-emit model events on window as gev:satellite-<type>, and republish the
 * tracked subject when its own model changed state (dossier chips, T6).
 */
function forwardEvents(host, models) {
  const tracking = host.parts.tracking;
  host.unsubscribers = SAT_MODEL_EVENT_TYPES.map((type) =>
    models.on(type, (detail) => {
      tracking?._emitAwarenessEvent?.(`gev:satellite-${type}`, detail);
      if (detail.noradId === host.layerState._trackedNorad)
        tracking?._publishTrackedPresentation?.();
    }),
  );
}

/** Optional createSatelliteModels seams a caller may inject (tests). */
const PASS_THROUGH_OPTIONS = Object.freeze([
  'loadModel',
  'now',
  'wallNow',
  'isVisible',
  'toWindow',
  'isCoarsePointer',
  'timers',
]);

function modelsFactoryOptions(host, viewer, profile) {
  const injected = {};
  for (const key of PASS_THROUGH_OPTIONS) {
    if (host.options[key]) injected[key] = host.options[key];
  }
  return {
    viewer,
    state: host.layerState,
    registry: host.registry,
    profile,
    resolveAsset: host.options.resolveAsset,
    credits: creditsFor(host, viewer),
    ...injected,
  };
}

/**
 * Create the models instance for this viewer (idempotent).
 * @param {object} host
 * @param {object} viewer
 * @param {object|null} [overrides] modelOptions overrides (test seam); the
 *   options object is replaced, never mutated.
 */
function attach(host, viewer, overrides = null) {
  const { layerState } = host;
  if (layerState._models) return layerState._models;
  if (overrides) host.options = { ...host.options, ...overrides };
  if (!viewer?.scene?.primitives) return null;
  const profile = selectProfile(host.options.readSignals() ?? {});
  layerState._modelProfile = profile;
  const models = createSatelliteModels(
    modelsFactoryOptions(host, viewer, profile),
  );
  forwardEvents(host, models);
  host.viewer = viewer;
  layerState._models = models;
  if (profile.cap > 0) void loadManifest(host);
  return models;
}

/**
 * Snapshot the tracked sample the entity dot and the follow camera were
 * positioned with this frame. Cesium evaluates them on the clock tick, while
 * frameNumber is still the previous one (so they read the cached sample); the
 * preRender tick then resamples for the new frame. Call this before that
 * refresh so the model sits exactly on the dot, not one frame ahead.
 */
function captureTrackedSample(host) {
  const { layerState, shown, visual } = host;
  const trackedNorad = layerState._trackedNorad;
  shown.valid = trackedNorad !== null && Boolean(layerState._trackedFrameGeo);
  visual.valid = shown.valid;
  if (!shown.valid) return;
  shown.noradId = trackedNorad;
  Cesium.Cartesian3.clone(layerState._trackedFrameCartesian, shown.position);
  shown.dateMs = layerState._trackedFrameDateMs;
  // Kept for the whole frame (frame() consumes `shown`): the card reads it
  // after render, when the display cache has already moved one frame on.
  visual.noradId = trackedNorad;
  Cesium.Cartesian3.clone(shown.position, visual.position);
}

/**
 * Where the tracked satellite is DRAWN this frame (trackedReadout's
 * `gevVisualPosition` contract): its model's translation once shown, else the
 * sample the dot and the follow camera used. Never the display cache the
 * preRender already advanced — at 577 m that is one frame of 7.66 km/s,
 * ≈ 240 px of card drift (P4 T5, output/eyeinsky-p4/t5/run-2).
 * @returns {Cesium.Cartesian3|null} Null falls back to gevDisplayPosition.
 */
function visualPosition(host) {
  const { layerState, visual } = host;
  const trackedNorad = layerState._trackedNorad;
  if (trackedNorad === null) return null;
  const drawn = layerState._models?.translation(trackedNorad, visual.model);
  if (drawn) return drawn;
  return visual.valid && visual.noradId === trackedNorad
    ? visual.position
    : null;
}

/** The displayed tracked sample, falling back to the current cache. */
function trackedSample(host, trackedNorad) {
  const { layerState, shown } = host;
  if (shown.valid && shown.noradId === trackedNorad) return shown;
  if (trackedNorad === null || !layerState._trackedFrameGeo) return null;
  return {
    position: layerState._trackedFrameCartesian,
    dateMs: layerState._trackedFrameDateMs,
  };
}

/** Per-frame hook from the shared preRender tick (the attached viewer). */
function frame(host) {
  const models = host.layerState._models;
  if (!models || !host.viewer?.camera) return;
  const trackedNorad = host.layerState._trackedNorad;
  const sample = trackedSample(host, trackedNorad);
  host.shown.valid = false;
  const trackedPosition = sample?.position ?? null;
  models.reconcile({
    cameraPosition: host.viewer.camera.positionWC,
    trackedNorad,
    frameSamples: { trackedPosition },
  });
  models.updatePoses({
    trackedNorad,
    trackedPosition,
    trackedDateMs: sample?.dateMs ?? Number.NaN,
    nowMs: Date.now(),
  });
}

/** New target: reconcile next frame and warm its asset bytes once. */
function prepareTarget(host, noradId) {
  const asset = host.layerState._models?.prefetch(noradId);
  if (!asset) return;
  const url = host.options.resolveAsset(asset.uri);
  if (host.warmed.has(url)) return;
  host.warmed.add(url);
  host.options.prefetchAsset(url);
}

/** The manifest asset this satellite resolves to in the active profile. */
function assetFor(host, noradId) {
  const sat = host.layerState._catalog?.get(noradId);
  if (!sat || sat.group === 'dense') return null;
  const profile = host.layerState._modelProfile?.name ?? null;
  return (
    host.registry.resolve({ noradId, group: sat.group }, { profile }) ?? null
  );
}

/** Model status of a satellite ('inactivo' when no models are attached). */
function statusOf(host, noradId) {
  return host.layerState._models?.statusOf(noradId) ?? 'inactivo';
}

/** Whether a click (window CSS px) falls on the TRACKED model's hull. */
function screenHit(host, windowPosition) {
  const trackedNorad = host.layerState._trackedNorad;
  if (trackedNorad === null) return false;
  return (
    host.layerState._models?.screenHit(windowPosition, trackedNorad) === true
  );
}

/** Point→model handoff input for the tracked satellite. */
function handoffInput(host) {
  const trackedNorad = host.layerState._trackedNorad;
  const models = host.layerState._models;
  if (trackedNorad === null || !models)
    return { modelReady: false, modelPx: 0 };
  return models.handoffInput(trackedNorad);
}

/** The previous target's model leaves at once (target change). */
function releaseTarget(host, noradId) {
  if (noradId === null || noradId === undefined) return;
  host.layerState._models?.release(noradId, 'target-change');
}

function destroy(host) {
  for (const unsubscribe of host.unsubscribers) unsubscribe();
  host.unsubscribers = [];
  host.layerState._models?.destroy();
  host.layerState._models = null;
  host.viewer = null;
}

function getStats(host) {
  const { layerState } = host;
  const base = layerState._models?.getStats() ?? {
    ...DETACHED_STATS,
    profile: layerState._modelProfile?.name ?? null,
  };
  return {
    ...base,
    attached: Boolean(layerState._models),
    manifest: host.manifest.status,
  };
}

function createHost({ state, services, parts, modelOptions }) {
  const manifest = { status: 'idle', assets: null, version: 0, promise: null };
  return {
    layerState: state,
    services,
    parts,
    options: {
      resolveAsset: (uri) => uri,
      fetchText: defaultFetchText,
      prefetchAsset: defaultPrefetchAsset,
      readSignals: readBrowserSignals,
      ...modelOptions,
    },
    manifest,
    registry: createRegistry(manifest),
    warmed: new Set(),
    unsubscribers: [],
    viewer: null,
    shown: {
      valid: false,
      noradId: null,
      position: new Cesium.Cartesian3(),
      dateMs: Number.NaN,
    },
    visual: {
      valid: false,
      noradId: null,
      position: new Cesium.Cartesian3(),
      model: new Cesium.Cartesian3(),
    },
  };
}

/**
 * @param {{state: object, services: object, parts: object,
 *   modelOptions?: object}} context `modelOptions` may override resolveAsset,
 *   fetchText, loadModel, prefetchAsset, readSignals, now, wallNow, isVisible,
 *   toWindow, isCoarsePointer, timers.
 */
export function createModelsHost({
  state,
  services,
  parts,
  modelOptions = {},
}) {
  const host = createHost({ state, services, parts, modelOptions });
  return {
    attach: (viewer, overrides) => attach(host, viewer, overrides),
    captureTrackedSample: () => captureTrackedSample(host),
    frame: () => frame(host),
    releaseTarget: (noradId) => releaseTarget(host, noradId),
    prepareTarget: (noradId) => prepareTarget(host, noradId),
    hasAsset: (noradId) => assetFor(host, noradId) !== null,
    assetFor: (noradId) => assetFor(host, noradId),
    statusOf: (noradId) => statusOf(host, noradId),
    screenHit: (windowPosition) => screenHit(host, windowPosition),
    handoffInput: () => handoffInput(host),
    visualPosition: () => visualPosition(host),
    releaseAll: (reason) => state._models?.releaseAll(reason),
    destroy: () => destroy(host),
    getStats: () => getStats(host),
  };
}
