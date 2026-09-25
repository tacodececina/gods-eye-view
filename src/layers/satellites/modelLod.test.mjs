import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyModelBand, projectedDiameterPx } from './modelLod.js';
import {
  SAT_MODEL_EVICT_DEBOUNCE_MS,
  SAT_MODEL_RECONCILE_MS,
  SAT_MODEL_SECONDARY_ADD_M,
  SAT_MODEL_SECONDARY_ADD_PX,
  SAT_MODEL_SECONDARY_KEEP_M,
  SAT_MODEL_SECONDARY_KEEP_PX,
  SAT_MODEL_TRACKED_ADD_PX,
  SAT_MODEL_TRACKED_KEEP_PX,
} from './policy.js';

const FOVY_60 = Math.PI / 3;

test('LOD constants match the approved proposal', () => {
  assert.equal(SAT_MODEL_TRACKED_ADD_PX, 6);
  assert.equal(SAT_MODEL_TRACKED_KEEP_PX, 3);
  assert.equal(SAT_MODEL_SECONDARY_ADD_PX, 16);
  assert.equal(SAT_MODEL_SECONDARY_KEEP_PX, 10);
  assert.equal(SAT_MODEL_SECONDARY_ADD_M, 25000);
  assert.equal(SAT_MODEL_SECONDARY_KEEP_M, 30000);
  assert.equal(SAT_MODEL_RECONCILE_MS, 250);
  assert.equal(SAT_MODEL_EVICT_DEBOUNCE_MS, 2000);
});

test('the ISS bounding sphere at 10 km in a 1080 px, 60 deg view', () => {
  // 2·r·H / (2·d·tan(fovy/2)) with the T0 radius 72.068 m. The proposal's
  // "about 10 px" assumed a ~55 m half-span; the measured bounding sphere of
  // the curated GLB is larger, so the exact value is 13.48 px.
  const px = projectedDiameterPx({
    radiusM: 72.068,
    distanceM: 10_000,
    viewportHeightPx: 1080,
    fovyRad: FOVY_60,
  });
  assert.ok(Math.abs(px - 13.481) < 0.01, `${px}`);
  const far = projectedDiameterPx({
    radiusM: 72.068,
    distanceM: 726_000,
    viewportHeightPx: 1080,
    fovyRad: FOVY_60,
  });
  assert.ok(far < 0.2, `TRACK_VIEW_FROM_LEO distance stays sub-pixel: ${far}`);
});

test('projected diameter scales linearly and rejects invalid geometry', () => {
  const base = {
    radiusM: 1,
    distanceM: 100,
    viewportHeightPx: 1000,
    fovyRad: FOVY_60,
  };
  const px = projectedDiameterPx(base);
  assert.ok(
    Math.abs(projectedDiameterPx({ ...base, distanceM: 50 }) - 2 * px) < 1e-9,
  );
  for (const patch of [
    { radiusM: 0 },
    { radiusM: -1 },
    { distanceM: 0 },
    { distanceM: -5 },
    { distanceM: NaN },
    { viewportHeightPx: 0 },
    { fovyRad: 0 },
    { fovyRad: Math.PI },
    { radiusM: undefined },
  ])
    assert.equal(
      projectedDiameterPx({ ...base, ...patch }),
      0,
      JSON.stringify(patch),
    );
});

test('tracked band hysteresis adds at 6 px, keeps down to 3 px, never oscillates', () => {
  const walk = (samples) => {
    let current = 'none';
    return samples.map((px) => {
      current = classifyModelBand({
        px,
        current,
        addPx: SAT_MODEL_TRACKED_ADD_PX,
        keepPx: SAT_MODEL_TRACKED_KEEP_PX,
      });
      return current;
    });
  };
  assert.deepEqual(walk([5.9, 6, 4, 3, 2.99, 5, 5.99, 6]), [
    'none',
    'model',
    'model',
    'model',
    'none',
    'none',
    'none',
    'model',
  ]);
  // Jitter inside the hysteresis gap leaves the band untouched either way.
  const jitter = [4.2, 4.8, 3.6, 5.5, 4.1, 5.9, 3.1];
  assert.ok(
    walk([6, ...jitter])
      .slice(1)
      .every((band) => band === 'model'),
  );
  assert.ok(walk(jitter).every((band) => band === 'none'));
});

test('secondary models also need the distance ceiling, with its own hysteresis', () => {
  const band = (px, distanceM, current) =>
    classifyModelBand({
      px,
      current,
      addPx: SAT_MODEL_SECONDARY_ADD_PX,
      keepPx: SAT_MODEL_SECONDARY_KEEP_PX,
      distanceM,
      addM: SAT_MODEL_SECONDARY_ADD_M,
      keepM: SAT_MODEL_SECONDARY_KEEP_M,
    });
  assert.equal(band(20, 24_000, 'none'), 'model');
  assert.equal(band(20, 26_000, 'none'), 'none');
  assert.equal(band(12, 29_000, 'model'), 'model');
  assert.equal(band(12, 31_000, 'model'), 'none');
  assert.equal(band(9, 1_000, 'model'), 'none');
  assert.equal(band(15.9, 1_000, 'none'), 'none');
});

test('band classification fails closed on bad input', () => {
  const args = { px: 50, current: 'none', addPx: 6, keepPx: 3 };
  assert.equal(classifyModelBand({ ...args, px: NaN }), 'none');
  assert.equal(
    classifyModelBand({ ...args, current: 'model', px: NaN }),
    'none',
  );
  assert.equal(
    classifyModelBand({ ...args, distanceM: NaN, addM: 25000, keepM: 30000 }),
    'none',
  );
  assert.throws(
    () => classifyModelBand({ ...args, addPx: 3, keepPx: 6 }),
    RangeError,
  );
  assert.throws(
    () =>
      classifyModelBand({ ...args, distanceM: 1, addM: 30000, keepM: 25000 }),
    RangeError,
  );
  assert.throws(
    () => classifyModelBand({ ...args, current: 'maybe' }),
    TypeError,
  );
});

test('missing or non-finite thresholds fail closed to none, never a model', () => {
  const base = { px: 1e6, addPx: 6, keepPx: 3 };
  const pixelCases = [
    { addPx: undefined },
    { keepPx: undefined },
    { addPx: undefined, keepPx: undefined },
    { addPx: NaN },
    { keepPx: NaN },
    { addPx: -Infinity, keepPx: -Infinity },
    { addPx: null, keepPx: null },
    { addPx: '6', keepPx: '3' },
  ];
  const label = (override) =>
    Object.entries(override)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(',');
  const distanceCases = [
    { addM: 25_000 },
    { keepM: 30_000 },
    { addM: Infinity, keepM: Infinity },
    { addM: NaN, keepM: 30_000 },
    { addM: null, keepM: null },
  ];
  for (const current of ['none', 'model']) {
    for (const override of pixelCases)
      assert.equal(
        classifyModelBand({ ...base, current, ...override }),
        'none',
        `${current} ${label(override)}`,
      );
    for (const override of distanceCases)
      assert.equal(
        classifyModelBand({ ...base, current, distanceM: 1, ...override }),
        'none',
        `${current} distance ${label(override)}`,
      );
  }
});
