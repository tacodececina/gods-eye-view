/**
 * P4 T7 — guardas de INSPECCIONAR por la ruta de producción: el tween con
 * movimiento no toca NORAD ni contexto, y la capa rechaza 'inspect' en los
 * mismos casos en que el Mission Dock deshabilita la acción (órbita caducada,
 * modelo fallido, sin modelo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISS,
  _trackIssForTest,
  contextRecord,
  flush,
  frame,
  satellitesLayer,
  scene,
  trackIss,
} from '../testSupport/satelliteTrackingScene.mjs';
import { contextFromRecord } from '../ui/eyeinskyDossierModel.js';
import { resolveInspectAction } from '../ui/eyeinskySatelliteChips.js';
import { createTrackedOverlayEntry } from './trackedReadout.js';
import { SAT_CARD_HULL_MARGIN_PX } from '../layers/satellites/policy.js';

const DAY_MS = 86_400_000;
const IDENTITY_KEYS = [
  'name',
  'noradId',
  'class',
  'geometryFidelity',
  'attitude',
  'framing',
  'modelStatus',
  'elementAge',
  'modelAsset',
];

/** Window events of the shared awareness bus, counted while `fn` runs. */
async function countAwareness(fn) {
  const counts = { selected: 0, cleared: 0 };
  const onSelected = () => (counts.selected += 1);
  const onCleared = () => (counts.cleared += 1);
  window.addEventListener('gev:awareness-subject-selected', onSelected);
  window.addEventListener('gev:awareness-subject-cleared', onCleared);
  try {
    await fn();
  } finally {
    window.removeEventListener('gev:awareness-subject-selected', onSelected);
    window.removeEventListener('gev:awareness-subject-cleared', onCleared);
  }
  return counts;
}

const identityOf = (record) =>
  Object.fromEntries(
    IDENTITY_KEYS.map((key) => [key, record?.properties?.[key]]),
  );

test('INSPECCIONAR with motion: every tween frame keeps NORAD, selection and context', async () => {
  const clock = { ms: Date.UTC(2026, 8, 24, 6, 0, 0) };
  const s = await trackIss({ now: () => clock.ms });
  try {
    assert.equal(
      satellitesLayer.setTrackedFraming('inspect', { reducedMotion: false }),
      true,
    );
    const store = window.__gevContextStore;
    const selectedId = store.selectedEntityId;
    const identity = identityOf(contextRecord());
    assert.equal(identity.framing, 'inspect');
    let tweenFrames = 0;
    const counts = await countAwareness(async () => {
      for (let i = 0; i < 12; i += 1) {
        frame(s, clock);
        if (satellitesLayer._trackedFramingForTest().tweening) tweenFrames += 1;
        assert.equal(satellitesLayer.getParams().selectedSatTrackingId, ISS);
        assert.equal(satellitesLayer.getTrackedFraming(), 'inspect');
        assert.equal(satellitesLayer.getTrackedInfo()?.noradId, ISS);
        assert.equal(s.viewer.trackedEntity, s.entity, 'still following');
        assert.equal(store.selectedEntityId, selectedId, 'same subject slot');
        assert.equal(contextRecord()?.id, String(ISS));
        assert.deepEqual(identityOf(contextRecord()), identity);
      }
    });
    assert.ok(tweenFrames >= 5, `the tween really ran (${tweenFrames})`);
    assert.deepEqual(counts, { selected: 0, cleared: 0 });
    assert.deepEqual(s.viewer.assignments, [], 'never re-engaged');
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

/** Dock verdict for the record the layer published right now. */
function dockAllowsInspect() {
  const context = contextFromRecord(contextRecord(), { kind: 'tracked' });
  return resolveInspectAction(context)?.enabled === true;
}

test('stale elements: the layer refuses inspect, like the dock', async () => {
  // The published age reads the wall clock: put the epoch 30 days behind it.
  const s = scene({
    issElements: {
      elementEpochMs: Date.now() - 30 * DAY_MS,
      elementFormat: 'omm',
    },
  });
  await flush();
  satellitesLayer.trackById(ISS, { origin: 'user' });
  try {
    assert.equal(contextRecord()?.properties?.elementAge, 'caducada');
    assert.equal(dockAllowsInspect(), false, 'dock: disabled');
    assert.equal(
      satellitesLayer.setTrackedFraming('inspect', { reducedMotion: true }),
      false,
      'layer: refused',
    );
    assert.equal(satellitesLayer.getTrackedFraming(), 'orbit');
    assert.equal(s.viewer.trackedEntity?.gevTrackedId, `satellites:${ISS}`);
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('failed model: the layer refuses inspect, like the dock; orbit stays allowed', async () => {
  const s = await trackIss();
  try {
    frame(s);
    await s.loads.at(-1).reject();
    frame(s);
    assert.equal(contextRecord()?.properties?.modelStatus, 'fallido');
    assert.equal(dockAllowsInspect(), false, 'dock: disabled');
    assert.equal(
      satellitesLayer.setTrackedFraming('inspect', { reducedMotion: true }),
      false,
      'layer: refused',
    );
    assert.equal(satellitesLayer.getTrackedFraming(), 'orbit');
    assert.equal(
      satellitesLayer.setTrackedFraming('orbit', { reducedMotion: true }),
      true,
      'orbit is always available',
    );
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('parity: fresh elements and a loading/ready model allow inspect in both', async () => {
  const s = await trackIss();
  try {
    assert.equal(dockAllowsInspect(), true);
    assert.equal(
      satellitesLayer.setTrackedFraming('inspect', { reducedMotion: true }),
      true,
    );
    satellitesLayer.setTrackedFraming('orbit', { reducedMotion: true });
    frame(s);
    await s.loads.at(-1).resolve();
    frame(s);
    assert.equal(contextRecord()?.properties?.modelStatus, 'listo');
    assert.equal(dockAllowsInspect(), true);
    assert.equal(
      satellitesLayer.setTrackedFraming('inspect', { reducedMotion: true }),
      true,
    );
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});

test('over the reticle, the tracked card is placed above the projected hull', async () => {
  const s = await trackIss();
  try {
    frame(s);
    const dotEntry = createTrackedOverlayEntry(s.entity);
    assert.equal(dotEntry.anchorRadiusPx, 10, 'dot: default clearance');
    await s.loads.at(-1).resolve();
    frame(s);
    // 4 km from the ISS (72.068 m radius), 1000 px tall at 60°: ≈ 31.2 px.
    const modelPx = (2 * 72.068 * 1000) / (2 * 4000 * Math.tan(Math.PI / 6));
    const entry = createTrackedOverlayEntry(s.entity);
    assert.equal(entry.anchorRadiusPx, 0, 'reticle: explicit gap');
    assert.ok(
      entry.gapPx >= modelPx / 2 + SAT_CARD_HULL_MARGIN_PX,
      `gap ${entry.gapPx} clears the hull radius ${modelPx / 2}`,
    );
    assert.ok(entry.leaderOffsetPx >= modelPx / 2, 'leader from the hull edge');
    satellitesLayer.stopTracking({ origin: 'user' });
    const again = _trackIssForTest();
    assert.equal(
      createTrackedOverlayEntry(again).anchorRadiusPx,
      10,
      'a new target starts with the dot clearance',
    );
  } finally {
    satellitesLayer.stopTracking({ origin: 'user' });
  }
});
