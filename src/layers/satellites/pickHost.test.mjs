import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { resolveStackHost } from './pickHost.js';
import { createInteraction } from './interaction.js';
import { DOCKED_COMPANION_RADIUS_M, ISS_NORAD } from './policy.js';
import { claimPointer, releasePointer } from '../../data/inputOwnership.js';

const PROGRESS = 100712;
const STACK = [100712, 100057, 68837, 68689, 67796, 49044, 36086, ISS_NORAD];
const HUBBLE = 20580;
const CUBE = 43000;
const at = (x) => ({ position: new Cesium.Cartesian3(6_800_000 + x, 0, 0) });

function pointsFor(ids, offsetM = 0) {
  return new Map(ids.map((id) => [id, at(offsetM)]));
}

test('a click on the ISS stack resolves to the ISS host', () => {
  const points = pointsFor(STACK);
  const host = resolveStackHost({
    pickedId: PROGRESS,
    stackIds: STACK,
    points,
    hasModel: () => false,
  });
  assert.equal(host, ISS_NORAD);
});

test('without the ISS, the first co-located id with a model asset wins', () => {
  const points = pointsFor([CUBE, HUBBLE]);
  const host = resolveStackHost({
    pickedId: CUBE,
    stackIds: [CUBE, HUBBLE],
    points,
    hasModel: (id) => id === HUBBLE,
  });
  assert.equal(host, HUBBLE);
});

test('ids beyond the docked radius, or no asset anywhere, keep the pick', () => {
  const points = new Map([
    [PROGRESS, at(0)],
    [ISS_NORAD, at(DOCKED_COMPANION_RADIUS_M + 1)],
  ]);
  assert.equal(
    resolveStackHost({
      pickedId: PROGRESS,
      stackIds: [PROGRESS, ISS_NORAD],
      points,
      hasModel: () => true,
    }),
    PROGRESS,
  );
  assert.equal(
    resolveStackHost({
      pickedId: CUBE,
      stackIds: [CUBE, HUBBLE],
      points: pointsFor([CUBE, HUBBLE]),
      hasModel: () => false,
    }),
    CUBE,
  );
  assert.equal(
    resolveStackHost({
      pickedId: CUBE,
      stackIds: [CUBE],
      points: new Map(),
      hasModel: () => true,
    }),
    CUBE,
  );
});

function interactionHarness({ tracked = null } = {}) {
  const state = {
    _enabled: true,
    _trackedNorad: tracked,
    _trackedEntity: null,
    _catalog: new Map(STACK.map((id) => [id, { group: 'stations' }])),
    _points: pointsFor(STACK),
  };
  const calls = [];
  const parts = {
    tracking: {
      _cancelPendingTrackingRestore: () => {},
      _trackSatellite: (id, options) => calls.push(['track', id, options]),
      _clearTracking: () => calls.push(['clear']),
    },
    models: { hasAsset: (id) => id === ISS_NORAD },
  };
  const services = {
    picking: { resolvePickId: () => null, isOwnedByOtherLayer: () => false },
  };
  const pickOf = (id) => ({ id: String(id), primitive: { id: String(id) } });
  const drilled = [];
  const viewer = {
    scene: {
      pick: () => pickOf(PROGRESS),
      drillPick: (position, limit) => {
        drilled.push(limit);
        return STACK.map(pickOf);
      },
    },
  };
  const interaction = createInteraction({ state, services, parts });
  return { interaction, viewer, calls, drilled };
}

test('a real pointer click on the ISS point tracks the ISS, not PROGRESS', () => {
  const h = interactionHarness();
  h.interaction._handleClick(h.viewer, { position: { x: 10, y: 10 } });
  assert.deepEqual(h.calls, [['track', ISS_NORAD, { origin: 'user' }]]);
  assert.ok(h.drilled[0] > 0, 'drillPick is bounded');
});

test('a click while a tool owns the pointer is yielded', () => {
  const h = interactionHarness();
  const lease = claimPointer('draw');
  try {
    h.interaction._handleClick(h.viewer, { position: { x: 10, y: 10 } });
  } finally {
    releasePointer(lease);
  }
  assert.deepEqual(h.calls, []);
});

test('a click that resolves to the tracked host is a no-op', () => {
  const h = interactionHarness({ tracked: ISS_NORAD });
  h.interaction._handleClick(h.viewer, { position: { x: 10, y: 10 } });
  assert.deepEqual(h.calls, []);
});
