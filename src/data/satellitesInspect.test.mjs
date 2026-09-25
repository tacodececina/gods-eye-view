/**
 * P4 T5 — INSPECCIONAR/ÓRBITA, clic sobre el casco y paso punto→modelo, por la
 * ruta de producción de la capa (tracking, interaction, rendering, models).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  ISS,
  ISS_INSPECT_RANGE_M,
  _runSatellitePreRenderForTest,
  _trackedFrameCartesianForTest,
  _trackIssForTest,
  contextRecord,
  direction,
  flush,
  frame as sceneFrame,
  range,
  satellitesLayer,
  scene,
  trackIss,
  viewFromOf,
} from '../testSupport/satelliteTrackingScene.mjs';
import { TRACK_VIEW_FROM_LEO } from '../layers/satellites/policy.js';
import {
  dockBiasElevation,
  targetElevation,
} from '../layers/satellites/dockBias.js';
import {
  ATTITUDE_SUBJECTS,
  attitudeSubjectRows,
  attitudeViolations,
  walkAttitudeSubject,
} from '../testSupport/satelliteAttitudeAudit.mjs';
import { satelliteRecord } from '../testSupport/satelliteContextRecord.mjs';

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

/**
 * The reticle is still the tracked point: shown, non-zero and opaque enough
 * to draw, so Cesium keeps it in the pick pass and the follow camera keeps
 * its bounding sphere (kills a `graphic.show = !reticle` mutant).
 */
function assertPointVisibleAndPickable(entity, now, where) {
  const graphic = entity.point;
  assert.equal(entity.show, true, `${where}: entity shown`);
  assert.equal(entity.isShowing, true, `${where}: entity showing`);
  assert.equal(
    graphic.show?.getValue(now) ?? true,
    true,
    `${where}: point shown`,
  );
  assert.ok(graphic.pixelSize.getValue(now) > 0, `${where}: point has size`);
  assert.ok(graphic.color.getValue(now).alpha > 0, `${where}: point drawn`);
}

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
    assertPointVisibleAndPickable(s.entity, now, 'reticle');
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
test('P4-21: the REAL published record has only whitelisted keys and no attitude numbers', async () => {
  const s = scene({ others: attitudeSubjectRows() });
  await flush();
  const seen = new Set();
  const frame = () => sceneFrame(s);
  try {
    for (const settle of ['resolve', 'reject']) {
      for (const subject of ATTITUDE_SUBJECTS) {
        await walkAttitudeSubject(
          s,
          satellitesLayer,
          subject,
          settle,
          (label) => {
            const record = contextRecord(subject.noradId);
            assert.deepEqual(
              attitudeViolations(`${subject.name}/${label}`, record),
              [],
            );
            seen.add(
              `${subject.asset ? 'asset' : 'none'}:${record.properties.framing}:${record.properties.modelStatus}`,
            );
          },
          frame,
        );
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
