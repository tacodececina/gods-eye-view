import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';
import satellitesLayer, {
  _attachSatelliteModelsForTest,
  _runSatellitePreRenderForTest,
  _satelliteModelStatsForTest,
  _setSatelliteLabelLifecycleStateForTest,
  _trackedFrameCartesianForTest,
  _trackIssForTest,
} from './satellites.js';

// Real ISS elements (CelesTrak, 2026-09-24), as in orbits.test.mjs.
const SATREC = twoline2satrec(
  '1 25544U 98067A   26267.14191496  .00009634  00000+0  18116-3 0  9999',
  '2 25544  51.6318 170.3464 0004691 174.6338 185.4701 15.49258637587098',
);
const MANIFEST_TEXT = readFileSync(
  new URL('../../public/models/satellites/manifest.json', import.meta.url),
  'utf8',
);
const ISS_URL = '/app/models/satellites/iss-70d0619a.glb';
const flush = () => new Promise((resolve) => setImmediate(resolve));
const silentHost = { setEntries() {}, setVisible() {}, clearSource() {} };

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

function scene() {
  const layerViewer = {
    entities: new Cesium.EntityCollection(),
    trackedEntity: undefined,
    camera: null,
    scene: {
      frameState: { frameNumber: 1 },
      primitives: { add: (p) => p, remove() {} },
    },
  };
  const modelPrimitives = [];
  // The models part renders through the attached viewer: its camera sits 4 km
  // from the tracked satellite's shared per-frame sample.
  const modelsViewer = {
    scene: {
      canvas: { clientHeight: 1000 },
      primitives: {
        add: (p) => (modelPrimitives.push(p), p),
        remove: (p) => {
          const i = modelPrimitives.indexOf(p);
          if (i >= 0) modelPrimitives.splice(i, 1);
          p.destroy?.();
          return i >= 0;
        },
      },
    },
    camera: {
      frustum: { fovy: Math.PI / 3 },
      get positionWC() {
        return Cesium.Cartesian3.add(
          _trackedFrameCartesianForTest(),
          new Cesium.Cartesian3(4000, 0, 0),
          new Cesium.Cartesian3(),
        );
      },
    },
  };
  const point = {
    position: Cesium.Cartesian3.fromDegrees(-97.7, 30.2, 420_000),
    show: true,
    pixelSize: 12,
    color: Cesium.Color.RED,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
    disableDepthTestDistance: 0,
  };
  const loads = [];
  const warmed = [];
  const clock = { t: 1000 };
  const modelOptions = {
    resolveAsset: (uri) => `/app${uri}`,
    fetchText: async () => MANIFEST_TEXT,
    readSignals: () => ({ override: 'std' }),
    prefetchAsset: (url) => warmed.push(url),
    isVisible: () => true,
    now: () => (clock.t += 300),
    loadModel: (options) => {
      const call = { options, model: fakeModel() };
      call.promise = new Promise((resolve) => {
        call.resolve = async () => {
          resolve(call.model);
          await flush();
          call.model.ready = true;
          call.model.readyEvent.raiseEvent(call.model);
        };
      });
      loads.push(call);
      return call.promise;
    },
  };
  return {
    layerViewer,
    modelsViewer,
    modelPrimitives,
    point,
    loads,
    warmed,
    modelOptions,
  };
}

test('tracking wires the models part: warm, load, shared pose, release', async () => {
  const s = scene();
  _setSatelliteLabelLifecycleStateForTest({
    viewer: s.layerViewer,
    satrec: SATREC,
    point: s.point,
    overlayHost: silentHost,
  });
  _attachSatelliteModelsForTest(s.modelsViewer, s.modelOptions);
  await flush();
  assert.equal(_satelliteModelStatsForTest().manifest, 'ready');

  _trackIssForTest();
  assert.deepEqual(s.warmed, [ISS_URL], 'asset warmed inside _trackSatellite');
  s.layerViewer.scene.frameState.frameNumber += 1;
  _runSatellitePreRenderForTest();
  assert.equal(s.loads.length, 1, 'reconcile ran from _preRenderTick');
  assert.equal(s.loads[0].options.url, ISS_URL);
  assert.equal(s.loads[0].options.allowPicking, false);

  await s.loads[0].resolve();
  // The sample the dot/camera were placed with before this frame's refresh.
  const shown = Cesium.Cartesian3.clone(_trackedFrameCartesianForTest());
  s.layerViewer.scene.frameState.frameNumber += 1;
  _runSatellitePreRenderForTest();
  const model = s.loads[0].model;
  const translation = Cesium.Matrix4.getTranslation(
    model.modelMatrix,
    new Cesium.Cartesian3(),
  );
  assert.ok(
    Cesium.Cartesian3.equals(translation, shown),
    'model and tracked dot share one SGP4 sample',
  );
  assert.equal(model.show, true);
  assert.equal(_satelliteModelStatsForTest().ready, 1);
  assert.equal(
    s.layerViewer.trackedEntity?.gevTrackedId,
    'satellites:25544',
    'the layer still owns the follow camera',
  );

  satellitesLayer.stopTracking({ origin: 'user' });
  const stats = _satelliteModelStatsForTest();
  assert.equal(stats.active, 0, 'target change evicts at once');
  assert.equal(model.destroyed, true);
});

test('disable releases every model at once; destroy leaves no primitives', async () => {
  const s = scene();
  const realDocument = globalThis.document;
  globalThis.document ??= {
    addEventListener() {},
    removeEventListener() {},
  };
  try {
    _setSatelliteLabelLifecycleStateForTest({
      viewer: s.layerViewer,
      satrec: SATREC,
      point: s.point,
      overlayHost: silentHost,
    });
    _attachSatelliteModelsForTest(s.modelsViewer, s.modelOptions);
    await flush();
    _trackIssForTest();
    s.layerViewer.scene.frameState.frameNumber += 1;
    _runSatellitePreRenderForTest();
    await s.loads.at(-1).resolve();
    assert.equal(_satelliteModelStatsForTest().active, 1);

    satellitesLayer.disable(s.layerViewer);
    const disabled = _satelliteModelStatsForTest();
    assert.deepEqual(
      { active: disabled.active, pending: disabled.pending },
      { active: 0, pending: 0 },
    );
    satellitesLayer.destroy(s.layerViewer);
    const destroyed = _satelliteModelStatsForTest();
    assert.equal(destroyed.attached, false);
    assert.equal(s.modelPrimitives.length, 0, 'no orphan satellite primitives');
  } finally {
    globalThis.document = realDocument;
  }
});

test('the tracked model uses the sample the dot and camera show this frame', async () => {
  // Cesium order per frame: clock tick (entity dot + follow camera evaluate the
  // position callback while frameNumber is still N-1, so they read the cached
  // sample) → scene.render increments frameNumber → preRender resamples. The
  // model must sit where the dot and the camera are, not one frame ahead.
  const s = scene();
  let nowMs = Date.UTC(2026, 8, 24, 6, 0, 0);
  _setSatelliteLabelLifecycleStateForTest({
    viewer: s.layerViewer,
    satrec: SATREC,
    point: s.point,
    overlayHost: silentHost,
    now: () => nowMs,
  });
  _attachSatelliteModelsForTest(s.modelsViewer, s.modelOptions);
  await flush();
  const entity = _trackIssForTest();
  const tick = () =>
    Cesium.Cartesian3.clone(entity.position.getValue(Cesium.JulianDate.now()));
  const frame = () => {
    s.layerViewer.scene.frameState.frameNumber += 1;
    nowMs += 100;
    _runSatellitePreRenderForTest();
  };
  tick();
  frame();
  await s.loads.at(-1).resolve();
  const shown = tick();
  frame();
  const translation = Cesium.Matrix4.getTranslation(
    s.loads.at(-1).model.modelMatrix,
    new Cesium.Cartesian3(),
  );
  assert.ok(
    Cesium.Cartesian3.distance(shown, _trackedFrameCartesianForTest()) > 100,
    'precondition: preRender advanced the cache by ~760 m',
  );
  assert.ok(
    Cesium.Cartesian3.equals(translation, shown),
    `model ${Cesium.Cartesian3.distance(translation, shown).toFixed(1)} m from the displayed dot`,
  );
  satellitesLayer.stopTracking({ origin: 'user' });
});
