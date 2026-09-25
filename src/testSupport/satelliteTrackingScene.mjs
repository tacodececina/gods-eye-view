/**
 * Escena de seguimiento satelital para pruebas de nodo (P4 T5–T7): viewer con
 * cámara de seguimiento, cargador de modelos manual y la capa REAL
 * (tracking, interaction, rendering, models). La comparten las pruebas de
 * INSPECCIONAR y las del expediente, que así leen lo que la capa publica.
 */
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
} from '../data/satellites.js';
import { TRACK_VIEW_FROM_LEO } from '../layers/satellites/policy.js';

export const ISS = 25544;
export const SATREC = twoline2satrec(
  '1 25544U 98067A   26267.14191496  .00009634  00000+0  18116-3 0  9999',
  '2 25544  51.6318 170.3464 0004691 174.6338 185.4701 15.49258637587098',
);
const MANIFEST_TEXT = readFileSync(
  new URL('../../public/models/satellites/manifest.json', import.meta.url),
  'utf8',
);
export const ISS_INSPECT_RANGE_M = 8 * 72.068;
export const flush = () => new Promise((resolve) => setImmediate(resolve));
const silentHost = { setEntries() {}, setVisible() {}, clearSource() {} };

// The shared context slot hangs from `window`, as in the browser.
globalThis.window ??= new EventTarget();

// This viewer has a camera (the framing writes it) but no WebGL frame state:
// the focus-rectangle projection has nothing to project with in Node, so it
// reports "off screen" and the focus target is simply cleared.
Cesium.SceneTransforms.worldToWindowCoordinates = () => undefined;

export function fakeModel() {
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

export function scene({
  now = () => Date.UTC(2026, 8, 24, 6, 0, 0),
  profile = 'std',
  others = [],
  pointCollection = null,
  dockViewport = null,
  issElements = null,
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
    issElements,
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

export const viewFromOf = (entity) =>
  entity.viewFrom.getValue(Cesium.JulianDate.now());
export const range = (vector) => Cesium.Cartesian3.magnitude(vector);
export const direction = (vector) =>
  Cesium.Cartesian3.normalize(vector, new Cesium.Cartesian3());
export const contextRecord = (id = ISS) =>
  window.__gevContextStore?.entities?.get(String(id)) ?? null;

export async function trackIss(options) {
  const s = scene(options);
  await flush();
  const entity = _trackIssForTest();
  assert.equal(s.viewer.trackedEntity, entity, 'precondition: following');
  s.viewer.assignments.length = 0;
  return { ...s, entity };
}

/** Advance one rendered frame of the layer (optionally moving the clock). */
export function frame(s, clock = null, stepMs = 100) {
  if (clock) clock.ms += stepMs;
  s.viewer.scene.frameState.frameNumber += 1;
  _runSatellitePreRenderForTest();
}

export { satellitesLayer, _runSatellitePreRenderForTest };
export { _trackedFrameCartesianForTest, _trackIssForTest };
