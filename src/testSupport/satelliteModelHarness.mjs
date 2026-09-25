/**
 * Shared fakes for satellite model tests (P4 T5): manifest, a loader whose
 * promises the test settles by hand, manual timers, a viewer with a fixed
 * camera and a layer-state stub. Mirrors the helpers in models.test.mjs.
 */
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';
import { createSatelliteModels } from '../layers/satellites/models.js';
import {
  loadSatelliteManifest,
  resolveSatelliteModel,
} from '../layers/satellites/modelRegistry.js';
import { SAT_MODEL_PROFILES } from '../layers/satellites/modelBudget.js';
import { elementEpochMs } from '../layers/satellites/elements.js';

export const ISS = 25544;
export const CUBE = 43000;

export const MANIFEST = loadSatelliteManifest(
  readFileSync(
    new URL('../../public/models/satellites/manifest.json', import.meta.url),
    'utf8',
  ),
);

export const SATREC = twoline2satrec(
  '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927',
  '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537',
);
export const EPOCH_MS = elementEpochMs(SATREC);
export const VIEW_HEIGHT_PX = 1000;
export const FOVY = Math.PI / 3;

export const flush = () => new Promise((resolve) => setImmediate(resolve));

export function fakeModel(options) {
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

/** Loader whose promises the test settles by hand (or never). */
export function controlledLoader() {
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

/** Manual timers: nothing fires until the test says so. */
export function manualTimers() {
  const pending = new Map();
  let next = 1;
  return {
    set(fn, ms) {
      const handle = next;
      next += 1;
      pending.set(handle, { fn, ms });
      return handle;
    },
    clear(handle) {
      pending.delete(handle);
    },
    fireAll() {
      const due = [...pending.values()];
      pending.clear();
      for (const { fn } of due) fn();
    },
    get size() {
      return pending.size;
    },
    delays: () => [...pending.values()].map(({ ms }) => ms),
  };
}

export function fakeViewer(cameraPosition) {
  const list = [];
  return {
    list,
    scene: {
      canvas: { clientHeight: VIEW_HEIGHT_PX },
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
      },
    },
    camera: { frustum: { fovy: FOVY }, positionWC: cameraPosition },
  };
}

export const registry = {
  version: 1,
  resolve: (subject, options) =>
    resolveSatelliteModel(subject, MANIFEST.assets, options),
};

/** Layer state with one satellite per row, `distanceM` along +X. */
export function fakeState(rows) {
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
    state._points.set(row.noradId, {
      position: new Cesium.Cartesian3(7_000_000 + row.distanceM, 0, 0),
    });
  }
  return state;
}

/**
 * @param {object} options
 * @param {Array<object>} options.rows
 * @param {string} [options.profile]
 * @param {object} [options.extra] Extra createSatelliteModels options.
 */
export function modelsHarness({ rows, profile = 'std', extra = {} } = {}) {
  const camera = new Cesium.Cartesian3(7_000_000, 0, 0);
  const loader = controlledLoader();
  const viewer = fakeViewer(camera);
  const state = fakeState(rows);
  const clock = { t: 10_000 };
  const events = [];
  const models = createSatelliteModels({
    viewer,
    state,
    registry,
    profile: SAT_MODEL_PROFILES[profile],
    loadModel: loader.load,
    now: () => clock.t,
    wallNow: () => EPOCH_MS + 3_600_000,
    isVisible: () => true,
    ...extra,
  });
  for (const type of ['model-ready', 'model-evicted', 'model-failed']) {
    models.on(type, (detail) => events.push({ type, ...detail }));
  }
  const tick = (input = {}, stepMs = 300) => {
    clock.t += stepMs;
    return models.reconcile({ cameraPosition: camera, ...input });
  };
  return { models, loader, viewer, state, clock, events, tick, camera };
}
