/**
 * P3.1 — camera ownership is not selection identity.
 *
 * A physical gesture (wheel, drag, pinch) must take the camera back from a
 * follow without deselecting the contact the operator is reading. Before P3.1
 * the only release route was `stopTracking`, which clears the tracked id, wipes
 * the shared context slot and emits `gev:awareness-subject-cleared` — so the
 * dossier fell back to Earth on every zoom.
 *
 * These pins hold the two verbs apart on the three tracking layers that share
 * the defect, through their real public layer contracts:
 *
 *   stopTracking({origin})          → deliberate, destructive deselection.
 *   releaseCameraOwnership({origin}) → detach the follow camera only.
 *
 * and they pin the return path: after a release, the same stable id can be
 * re-followed (SEGUIR) without re-selecting anything.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';

import flightsLayer, {
  _setTrackedFlightRefreshStateForTest,
} from './flights.js';
import militaryFlightsLayer, {
  _setTrackedMilitaryRefreshStateForTest,
} from './militaryFlights.js';
import satellitesLayer, {
  _setTrackedSatelliteRefreshStateForTest,
} from './satellites.js';

const ISS_L1 =
  '1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927';
const ISS_L2 =
  '2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537';

/**
 * Capture the semantic clear event the dossier listens to. Node has no window,
 * so one is installed for the duration of a case and removed afterwards.
 */
function withSubjectClearRecorder(run) {
  const previousWindow = globalThis.window;
  const cleared = [];
  const listeners = new Set();
  globalThis.window = {
    addEventListener: (type, handler) => {
      if (type === 'gev:awareness-subject-cleared') listeners.add(handler);
    },
    removeEventListener: (_type, handler) => listeners.delete(handler),
    dispatchEvent: (event) => {
      if (event?.type === 'gev:awareness-subject-cleared')
        cleared.push(event.detail);
      for (const handler of listeners) handler(event);
      return true;
    },
  };
  try {
    return run(cleared);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

/** A viewer stub with exactly the surface the release/refocus paths touch. */
function trackingViewer(entity) {
  return {
    trackedEntity: entity,
    camera: { cancelFlight() {} },
    entities: { contains: () => true, remove() {} },
    scene: { primitives: { remove() {} }, frameState: { frameNumber: 1 } },
  };
}

test('a released flight follow keeps its exact selection and can be re-followed', () => {
  const id = 'ae1fa4';
  const entity = { gevTrackedId: `flights:${id}` };
  const viewer = trackingViewer(entity);
  withSubjectClearRecorder((cleared) => {
    _setTrackedFlightRefreshStateForTest({
      icao24: id,
      entity,
      billboard: {
        position: Cesium.Cartesian3.fromDegrees(-97.71, 30.21, 10_668),
        show: true,
      },
      billboardCollection: { show: true, remove() {} },
      viewer,
      meta: { callsign: 'TEST123', altitude: 10_668, klass: 'airliner' },
    });
    viewer.trackedEntity = entity;

    const survived = flightsLayer.releaseCameraOwnership({ origin: 'user' });

    assert.equal(survived, true, 'the release reports a surviving selection');
    assert.equal(
      viewer.trackedEntity,
      undefined,
      'the follow camera is detached, so the gesture owns the camera',
    );
    assert.equal(
      flightsLayer.getParams().selectedFlightsTrackingId,
      id,
      'the stable selected id is untouched',
    );
    assert.deepEqual(
      cleared,
      [],
      'a camera release emits no semantic selection-cleared event',
    );

    // SEGUIR: reattach to the exact same contact, no re-selection required.
    assert.equal(flightsLayer.refocusTrackedById(id, { origin: 'user' }), true);
    assert.equal(viewer.trackedEntity, entity);
    assert.equal(flightsLayer.getParams().selectedFlightsTrackingId, id);
  });
});

test('a released military follow keeps its exact selection and can be re-followed', () => {
  const id = 'ae5f20';
  const entity = { gevTrackedId: `military:${id}` };
  const viewer = trackingViewer(entity);
  withSubjectClearRecorder((cleared) => {
    _setTrackedMilitaryRefreshStateForTest({
      icao24: id,
      entity,
      billboard: {
        position: Cesium.Cartesian3.fromDegrees(-97.4, 30.4, 9_144),
        show: true,
      },
      billboardCollection: { show: true, remove() {} },
      viewer,
      meta: { callsign: 'RCH451', altitude: 9_144, klass: 'military' },
    });
    viewer.trackedEntity = entity;

    const survived = militaryFlightsLayer.releaseCameraOwnership({
      origin: 'user',
    });

    assert.equal(survived, true);
    assert.equal(viewer.trackedEntity, undefined);
    assert.equal(
      militaryFlightsLayer.getParams().selectedMilitaryTrackingId,
      id,
    );
    assert.deepEqual(cleared, []);

    assert.equal(
      militaryFlightsLayer.refocusTrackedById(id, { origin: 'user' }),
      true,
    );
    assert.equal(viewer.trackedEntity, entity);
  });
});

test('a released satellite follow keeps its exact selection and can be re-followed', () => {
  const noradId = 25544;
  const entity = { gevTrackedId: `satellites:${noradId}` };
  const viewer = trackingViewer(entity);
  withSubjectClearRecorder((cleared) => {
    _setTrackedSatelliteRefreshStateForTest({
      noradId,
      name: 'ISS (ZARYA)',
      satrec: twoline2satrec(ISS_L1, ISS_L2),
      entity,
      point: {
        position: Cesium.Cartesian3.fromDegrees(-97.7, 30.2, 420_000),
        show: false,
        pixelSize: 12,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: 0,
      },
      viewer,
    });
    viewer.trackedEntity = entity;

    const survived = satellitesLayer.releaseCameraOwnership({ origin: 'user' });

    assert.equal(survived, true);
    assert.equal(viewer.trackedEntity, undefined);
    assert.equal(satellitesLayer.getParams().selectedSatTrackingId, noradId);
    assert.deepEqual(cleared, []);

    assert.equal(
      satellitesLayer.refocusTrackedById(noradId, { origin: 'user' }),
      true,
    );
    assert.equal(viewer.trackedEntity, entity);
  });
});

test('releasing nothing reports no surviving selection and touches no camera', () => {
  const viewer = trackingViewer(undefined);
  withSubjectClearRecorder((cleared) => {
    _setTrackedFlightRefreshStateForTest({
      icao24: 'ae1fa4',
      entity: null,
      billboard: { position: null, show: true },
      billboardCollection: { show: false, remove() {} },
      viewer,
      meta: {},
      tracked: false,
    });
    const other = { gevTrackedId: 'vessels:1' };
    viewer.trackedEntity = other;

    assert.equal(flightsLayer.releaseCameraOwnership({ origin: 'user' }), false);
    assert.equal(
      viewer.trackedEntity,
      other,
      'a layer with no selection never yanks another owner off the camera',
    );
    assert.deepEqual(cleared, []);
  });
});
