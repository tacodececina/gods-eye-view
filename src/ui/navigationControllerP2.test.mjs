import assert from 'node:assert/strict';
import test from 'node:test';
import { NavigationController } from './navigationController.js';

function rig({
  reducedMotion = false,
  projectedPoint = { x: -100, y: -100 },
} = {}) {
  let pending = null;
  const calls = [];
  const camera = {
    heading: 0,
    pitch: -0.7,
    roll: 0,
    positionWC: { x: 1, y: 2, z: 3 },
    directionWC: { x: 0, y: 0, z: -1 },
    upWC: { x: 0, y: 1, z: 0 },
    _currentFlight: null,
    setView(options) {
      calls.push(['setView', options]);
    },
    flyTo(options) {
      calls.push(['flyTo', options]);
      pending = options;
      this._currentFlight = options;
    },
    cancelFlight() {
      const current = pending;
      pending = null;
      this._currentFlight = null;
      current?.cancel?.();
    },
    lookAtTransform() {
      calls.push(['lookAtTransform']);
    },
    flyToBoundingSphere(_sphere, options) {
      calls.push(['flyToBoundingSphere', options]);
      this._currentFlight = options;
    },
    viewBoundingSphere(_sphere, options) {
      calls.push(['viewBoundingSphere', options]);
      this._currentFlight = null;
    },
    distanceToBoundingSphere() {
      return 1;
    },
  };
  const emptyLayer = {
    cancelPendingTrackingRestore() {},
    getTrackedInfo: () => null,
    stopTracking() {},
  };
  const controller = new NavigationController({
    viewer: {
      camera,
      scene: { canvas: { clientWidth: 1000, clientHeight: 700 } },
    },
    tracking: {
      flightsLayer: emptyLayer,
      militaryFlightsLayer: emptyLayer,
      satellitesLayer: emptyLayer,
      aisLiveVesselsLayer: { clearSelection() {} },
      militaryAwarenessLayer: { releaseCameraOwnership() {} },
      rocketLaunchesLayer: { releaseCameraOwnership() {} },
    },
    searchInput: null,
    interruptCameraMotion: (reason) => calls.push(['interrupt', reason]),
    isCockpitActive: () => false,
    clearLocation() {},
    cancelShareSelection: () => true,
    getDataManager: () => null,
    stopOrbit() {},
    showToast() {},
    prefersReducedMotion: () => reducedMotion,
    projectToWindow: () => projectedPoint,
  });
  return {
    controller,
    calls,
    complete() {
      const current = pending;
      pending = null;
      camera._currentFlight = null;
      current?.complete?.();
    },
  };
}

test('a newer A to B plan cancels A and only B reports its exact identity', async () => {
  const h = rig();
  const a = h.controller.runCameraPlan('vista', [
    { lat: 1, lon: 2, alt: 1_000_000, duration: 1, targetId: 'earthquakes:A' },
  ]);
  const b = h.controller.runCameraPlan('vista', [
    { lat: 3, lon: 4, alt: 2_000_000, duration: 1, targetId: 'earthquakes:B' },
  ]);
  h.complete();
  assert.deepEqual(await a, { completed: false, stale: true });
  assert.equal((await b).targetId, 'earthquakes:B');
  assert.equal(h.calls.filter(([name]) => name === 'flyTo').length, 2);
});

test('reduced-motion final stage uses setView and human intent invalidates it once', async () => {
  const h = rig();
  const result = await h.controller.runCameraPlan('vista', [
    { lat: 1, lon: 2, alt: 1_000_000, duration: 0, targetId: 'sector:global' },
  ]);
  assert.equal(result.completed, true);
  assert.equal(result.targetId, 'sector:global');
  const before = result.generation;
  const after = h.controller.interruptHumanNavigation('wheel');
  assert.ok(after > before);
  assert.equal(h.controller._lastLayerFitResult.kind, 'wheel');
});

test('an empty layer activation records no-data and never claims the camera', () => {
  const h = rig();
  assert.equal(h.controller.requestLayerFit('satellites', []), false);
  assert.equal(h.controller._lastLayerFitResult.status, 'no-data');
  assert.equal(
    h.calls.some(([name]) => name === 'flyToBoundingSphere'),
    false,
  );
});

test('human interruption snapshots a finite world view before resetting the transform', () => {
  const h = rig();
  h.controller.viewer.camera._currentFlight = {};
  h.controller.interruptHumanNavigation('wheel');
  const names = h.calls.map(([name]) => name);
  assert.ok(names.includes('setView'));
  assert.ok(names.indexOf('setView') > names.indexOf('lookAtTransform'));
  const options = h.calls.find(([name]) => name === 'setView')[1];
  assert.deepEqual(
    [options.destination.x, options.destination.y, options.destination.z],
    [1, 2, 3],
  );
  assert.deepEqual(
    [
      options.orientation.direction.x,
      options.orientation.direction.y,
      options.orientation.direction.z,
    ],
    [0, 0, -1],
  );
});

/**
 * P3.1 — a physical gesture takes the camera, never the selection.
 *
 * `interruptHumanNavigation` used to stamp through the destructive path:
 * `_stampNavigation` nulled `selected*TrackingId` and `_releaseFollowCamera`
 * reached `stopTracking`, which clears the shared context slot and emits the
 * semantic clear the dossier listens to. Zooming therefore deselected.
 */
function selectionRig({ tracked = true } = {}) {
  const verbs = [];
  const paramWrites = [];
  const trackingLayer = (layerId) => ({
    cancelPendingTrackingRestore() {
      verbs.push([layerId, 'cancelPendingTrackingRestore']);
    },
    getTrackedInfo: () => (tracked ? { id: `${layerId}-A` } : null),
    stopTracking({ origin } = {}) {
      verbs.push([layerId, 'stopTracking', origin]);
      return true;
    },
    releaseCameraOwnership({ origin } = {}) {
      verbs.push([layerId, 'releaseCameraOwnership', origin]);
      return true;
    },
  });
  const controller = new NavigationController({
    viewer: {
      camera: {
        positionWC: { x: 1, y: 2, z: 3 },
        directionWC: { x: 0, y: 0, z: -1 },
        upWC: { x: 0, y: 1, z: 0 },
        cancelFlight() {},
        lookAtTransform() {},
        setView() {},
      },
      scene: { canvas: { clientWidth: 1000, clientHeight: 700 } },
    },
    tracking: {
      flightsLayer: trackingLayer('flights'),
      militaryFlightsLayer: trackingLayer('military'),
      satellitesLayer: trackingLayer('satellites'),
      aisLiveVesselsLayer: {
        clearSelection() {
          verbs.push(['vessels', 'clearSelection']);
        },
      },
      militaryAwarenessLayer: {
        releaseCameraOwnership() {
          verbs.push(['awareness', 'releaseCameraOwnership']);
          return true;
        },
      },
      rocketLaunchesLayer: { releaseCameraOwnership() {} },
    },
    searchInput: null,
    interruptCameraMotion: (reason) => verbs.push(['camera', reason]),
    isCockpitActive: () => false,
    clearLocation() {
      verbs.push(['location', 'clear']);
    },
    cancelShareSelection: () => false,
    getDataManager: () => ({
      setLayerParams: (layerId, params, options) =>
        paramWrites.push([layerId, params, options?.origin]),
    }),
    stopOrbit() {},
    showToast() {},
  });
  return { controller, verbs, paramWrites };
}

test('a manual gesture releases the camera and keeps the exact selection', () => {
  const h = selectionRig();
  h.controller.interruptHumanNavigation('wheel');

  for (const layerId of ['flights', 'military', 'satellites']) {
    assert.deepEqual(
      h.verbs.find(([id, verb]) => id === layerId && verb.startsWith('stop')),
      undefined,
      `${layerId} must not be deselected by a gesture`,
    );
    assert.deepEqual(
      h.verbs.find(
        ([id, verb]) => id === layerId && verb === 'releaseCameraOwnership',
      ),
      [layerId, 'releaseCameraOwnership', 'user'],
      `${layerId} releases the camera as the user`,
    );
  }
  assert.deepEqual(
    h.paramWrites,
    [],
    'no selected*TrackingId is nulled by a gesture',
  );
  assert.equal(
    h.verbs.some(([id, verb]) => id === 'vessels' && verb === 'clearSelection'),
    false,
    'vessel selection behaviour is preserved',
  );
  assert.equal(
    h.verbs.some(([id]) => id === 'camera'),
    true,
    'the camera tween is still interrupted so the gesture owns the camera',
  );
  assert.equal(
    h.verbs.some(([id]) => id === 'location'),
    false,
    'the searched-location readout survives a gesture',
  );
});

test('explicit navigation still performs a deliberate destructive deselection', () => {
  // No active owner holds a tracked contact, so the controller itself is the
  // one that must null the pending selection identity — the branch a gesture
  // must never take.
  const h = selectionRig({ tracked: false });
  assert.equal(
    h.controller.runCameraPlan('vista', [
      { lat: 1, lon: 2, alt: 1_000_000, duration: 0 },
    ]) instanceof Promise,
    true,
  );
  assert.deepEqual(
    h.paramWrites.map(([layerId, params]) => [layerId, Object.values(params)]),
    [
      ['flights', [null]],
      ['military', [null]],
      ['satellites', [null]],
    ],
    'an explicit destination still clears pending selection identity',
  );
  assert.equal(
    h.verbs.some(([id, verb]) => id === 'awareness' && verb === 'releaseCameraOwnership'),
    true,
    'explicit navigation keeps its existing Contact release route',
  );
});

test('a reduced-motion layer fit uses an instantaneous view and leaves no flight', () => {
  const h = rig({ reducedMotion: true });
  h.controller.requestLayerFit(
    'satellites',
    [{ position: { x: 7_000_000, y: 0, z: 0 } }],
    60_000,
  );
  h.controller._flushLayerFit();
  assert.equal(
    h.calls.some(([name]) => name === 'flyToBoundingSphere'),
    false,
  );
  assert.equal(
    h.calls.some(([name]) => name === 'viewBoundingSphere'),
    true,
  );
  assert.equal(h.controller.viewer.camera._currentFlight, null);
  assert.equal(h.controller._lastLayerFitResult.status, 'fitted');
});
