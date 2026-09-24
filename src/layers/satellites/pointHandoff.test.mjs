import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePointModelHandoff } from './pointHandoff.js';
import {
  SAT_POINT_HANDOFF_PX,
  SAT_RETICLE_ALPHA,
  SAT_RETICLE_PX,
  SAT_TRACKED_POINT_PX,
} from './policy.js';

const DOT = Object.freeze({ pointSize: 14, pointAlpha: 1, reticle: false });
const RETICLE = Object.freeze({ pointSize: 4, pointAlpha: 0.5, reticle: true });

test('policy: 14 px dot, 4 px reticle at alpha 0.5 beyond 24 px', () => {
  assert.equal(SAT_TRACKED_POINT_PX, 14);
  assert.equal(SAT_RETICLE_PX, 4);
  assert.equal(SAT_RETICLE_ALPHA, 0.5);
  assert.equal(SAT_POINT_HANDOFF_PX, 24);
});

test('the dot stays a dot until a ready model is larger than 24 px', () => {
  assert.deepEqual(
    resolvePointModelHandoff({ modelReady: false, modelPx: 300 }),
    DOT,
  );
  assert.deepEqual(
    resolvePointModelHandoff({ modelReady: true, modelPx: 24 }),
    DOT,
  );
  assert.deepEqual(
    resolvePointModelHandoff({ modelReady: true, modelPx: 10 }),
    DOT,
  );
  assert.deepEqual(
    resolvePointModelHandoff({ modelReady: true, modelPx: Number.NaN }),
    DOT,
  );
  assert.deepEqual(resolvePointModelHandoff({}), DOT);
});

test('a ready model beyond 24 px turns the dot into a 4 px reticle', () => {
  assert.deepEqual(
    resolvePointModelHandoff({ modelReady: true, modelPx: 24.5 }),
    RETICLE,
  );
  assert.deepEqual(
    resolvePointModelHandoff({
      modelReady: true,
      modelPx: 277,
      reducedMotion: true,
    }),
    RETICLE,
    'reduced motion changes nothing: the switch is always discrete',
  );
});

test('the point is never removed: its size is always positive', () => {
  for (const modelPx of [0, 5, 24, 25, 1000]) {
    for (const modelReady of [true, false]) {
      const out = resolvePointModelHandoff({ modelReady, modelPx });
      assert.ok(out.pointSize > 0 && out.pointAlpha > 0);
      assert.ok(Object.isFrozen(out));
    }
  }
});
