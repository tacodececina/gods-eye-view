import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';
import { createModelsHost } from './modelsHost.js';
import { elementEpochMs } from './elements.js';
import { SAT_MODEL_CREDIT } from './policy.js';

const ISS = 25544;
const HST = 20580;
const MANIFEST_TEXT = readFileSync(
  new URL('../../../public/models/satellites/manifest.json', import.meta.url),
  'utf8',
);
const SATREC = twoline2satrec(
  '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927',
  '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537',
);
const EPOCH_MS = elementEpochMs(SATREC);
const CAMERA = new Cesium.Cartesian3(7_000_000, 0, 0);
const flush = () => new Promise((resolve) => setImmediate(resolve));

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

function fixture({ signals = {}, manifestText = MANIFEST_TEXT } = {}) {
  const loads = [];
  const warmed = [];
  const awareness = [];
  const credits = [];
  const primitives = [];
  const viewer = {
    scene: {
      canvas: { clientHeight: 1000 },
      primitives: {
        add: (p) => (primitives.push(p), p),
        remove: (p) => {
          const i = primitives.indexOf(p);
          if (i >= 0) primitives.splice(i, 1);
          p.destroy?.();
          return i >= 0;
        },
      },
    },
    camera: { frustum: { fovy: Math.PI / 3 }, positionWC: CAMERA },
  };
  const point = (d) => ({
    position: new Cesium.Cartesian3(7_000_000 + d, 0, 0),
  });
  const state = {
    _catalog: new Map([
      [
        ISS,
        {
          name: 'ISS',
          satrec: SATREC,
          group: 'stations',
          elementEpochMs: EPOCH_MS,
        },
      ],
      [
        HST,
        {
          name: 'HST',
          satrec: SATREC,
          group: 'visual',
          elementEpochMs: EPOCH_MS,
        },
      ],
    ]),
    _points: new Map([
      [ISS, point(900_000)],
      [HST, point(900_000)],
    ]),
    _dockedCompanions: new Set(),
    _catalogRevision: 1,
    _trackedNorad: null,
    _trackedFrameGeo: null,
    _trackedFrameCartesian: new Cesium.Cartesian3(),
    _trackedFrameDateMs: Number.NaN,
    _models: null,
    _modelProfile: null,
  };
  const clock = { t: 1000 };
  const host = createModelsHost({
    state,
    services: {
      credits: {
        registerDynamicCredit: (v, credit) =>
          credits.push(['register', v, credit]),
        unregisterDynamicCredit: (v, credit) =>
          credits.push(['unregister', v, credit]),
      },
    },
    parts: {
      tracking: {
        _emitAwarenessEvent: (type, detail) => awareness.push({ type, detail }),
      },
    },
    modelOptions: {
      resolveAsset: (uri) => `/app${uri}`,
      fetchText: async (url) => {
        assert.equal(url, '/app/models/satellites/manifest.json');
        return manifestText;
      },
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
      prefetchAsset: (url) => warmed.push(url),
      readSignals: () => signals,
      now: () => clock.t,
      wallNow: () => EPOCH_MS + 3_600_000,
      isVisible: () => true,
    },
  });
  const trackAt = (id, distanceM) => {
    state._trackedNorad = id;
    state._trackedFrameGeo = { altitude: 400_000 };
    Cesium.Cartesian3.fromElements(
      7_000_000 + distanceM,
      0,
      0,
      state._trackedFrameCartesian,
    );
    state._trackedFrameDateMs = EPOCH_MS + 60_000;
  };
  const frame = (stepMs = 300) => {
    clock.t += stepMs;
    host.frame(viewer);
  };
  return {
    host,
    viewer,
    state,
    loads,
    warmed,
    awareness,
    credits,
    primitives,
    trackAt,
    frame,
  };
}

test('attach selects the profile from the browser signals', async () => {
  const low = fixture({ signals: { override: 'low' } });
  low.host.attach(low.viewer);
  assert.equal(low.host.getStats().profile, 'low');
  const coarse = fixture({ signals: { coarsePointer: true } });
  coarse.host.attach(coarse.viewer);
  assert.equal(coarse.host.getStats().profile, 'low');
  const desk = fixture({ signals: { viewportWidth: 1920, deviceMemory: 8 } });
  desk.host.attach(desk.viewer);
  assert.equal(desk.host.getStats().profile, 'std');
  assert.equal(desk.host.attach(desk.viewer), desk.state._models, 'idempotent');
});

test('frame reconciles against the camera and the shared tracked sample', async () => {
  const f = fixture();
  f.host.attach(f.viewer);
  await flush();
  assert.equal(f.host.getStats().manifest, 'ready');
  f.trackAt(ISS, 4000);
  f.frame();
  assert.equal(f.loads.length, 1);
  assert.equal(
    f.loads[0].options.url,
    '/app/models/satellites/iss-70d0619a.glb',
  );
  await f.loads[0].resolve();
  f.frame();
  const model = f.loads[0].model;
  const translation = Cesium.Matrix4.getTranslation(
    model.modelMatrix,
    new Cesium.Cartesian3(),
  );
  assert.ok(
    Cesium.Cartesian3.equals(translation, f.state._trackedFrameCartesian),
  );
  assert.equal(model.show, true);
  const ready = f.awareness.find((e) => e.type === 'gev:satellite-model-ready');
  assert.equal(ready.detail.noradId, ISS);
  assert.deepEqual(f.credits[0], ['register', f.viewer, SAT_MODEL_CREDIT]);
});

test('frame without a tracked sample never reads a stale cartesian', async () => {
  const f = fixture();
  f.host.attach(f.viewer);
  await flush();
  f.state._trackedNorad = ISS;
  f.state._trackedFrameGeo = null; // cache invalidated by the tracker
  Cesium.Cartesian3.fromElements(
    7_004_000,
    0,
    0,
    f.state._trackedFrameCartesian,
  );
  f.frame();
  assert.equal(f.loads.length, 0, 'far point, stale cache ignored');
});

test('target change: release the old model, warm the new asset once', async () => {
  const f = fixture();
  f.host.attach(f.viewer);
  await flush();
  f.trackAt(ISS, 4000);
  f.frame();
  await f.loads[0].resolve();
  f.host.releaseTarget(ISS);
  assert.equal(f.host.getStats().active, 0, 'evicted at once');
  f.host.prepareTarget(HST);
  f.host.prepareTarget(HST);
  assert.deepEqual(f.warmed, ['/app/models/satellites/hubble-e5ba4de1.glb']);
  const evicted = f.awareness.find(
    (e) => e.type === 'gev:satellite-model-evicted',
  );
  assert.equal(evicted.detail.reason, 'target-change');
  assert.equal(f.credits.at(-1)[0], 'unregister');
});

test('releaseAll empties at once; destroy detaches and enable rebuilds', async () => {
  const f = fixture();
  f.host.attach(f.viewer);
  await flush();
  f.trackAt(ISS, 4000);
  f.frame();
  await f.loads[0].resolve();
  f.host.releaseAll('disabled');
  assert.equal(f.host.getStats().active, 0);
  assert.equal(f.host.getStats().pending, 0);
  f.host.destroy();
  assert.equal(f.state._models, null);
  assert.equal(f.host.getStats().attached, false);
  assert.equal(f.primitives.length, 0, 'no orphan collection');
  f.host.attach(f.viewer);
  f.frame();
  assert.equal(f.loads.length, 2, 'rebuilt after re-attach');
});

test('an invalid manifest leaves every satellite a point', async () => {
  const f = fixture({ manifestText: '[]' });
  const warn = console.warn;
  console.warn = () => {};
  try {
    f.host.attach(f.viewer);
    await flush();
  } finally {
    console.warn = warn;
  }
  assert.equal(f.host.getStats().manifest, 'failed');
  f.trackAt(ISS, 4000);
  f.frame();
  assert.equal(f.loads.length, 0);
});

test('hasAsset answers per profile once the manifest is ready', async () => {
  const std = fixture();
  assert.equal(std.host.hasAsset(ISS), false, 'no manifest yet');
  std.host.attach(std.viewer);
  await flush();
  assert.equal(std.host.hasAsset(ISS), true);
  assert.equal(std.host.hasAsset(HST), true);
  assert.equal(std.host.hasAsset(99999), false, 'not in the catalog');
  const low = fixture({ signals: { override: 'low' } });
  low.host.attach(low.viewer);
  await flush();
  assert.equal(low.host.hasAsset(ISS), true);
  assert.equal(low.host.hasAsset(HST), false, 'low profile: Hubble is a point');
});
