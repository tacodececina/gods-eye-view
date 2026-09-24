import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  framingTweenOffset,
  inspectRangeM,
  inspectViewFrom,
  isTrackFraming,
  orbitViewFrom,
} from './framing.js';
import {
  SAT_INSPECT_MAX_RANGE_M,
  SAT_INSPECT_MIN_RANGE_M,
  SAT_INSPECT_RANGE_FACTOR,
  TRACK_VIEW_FROM_HIGH_SCALE,
  TRACK_VIEW_FROM_LEO,
} from './policy.js';

const unit = (vector) =>
  Cesium.Cartesian3.normalize(vector, new Cesium.Cartesian3());
const close = (a, b, epsilon = 1e-9) =>
  Cesium.Cartesian3.equalsEpsilon(a, b, epsilon);

test('framings: only orbit and inspect exist', () => {
  assert.equal(isTrackFraming('orbit'), true);
  assert.equal(isTrackFraming('inspect'), true);
  for (const bad of ['', 'close', null, undefined, 1]) {
    assert.equal(isTrackFraming(bad), false);
  }
});

test('inspect range is clamp(8·radiusM, 30 m, 5 km)', () => {
  assert.equal(SAT_INSPECT_RANGE_FACTOR, 8);
  assert.equal(SAT_INSPECT_MIN_RANGE_M, 30);
  assert.equal(SAT_INSPECT_MAX_RANGE_M, 5000);
  assert.equal(inspectRangeM(72.068), 8 * 72.068, 'ISS');
  assert.equal(inspectRangeM(0.149), 30, 'CubeSat 1U hits the floor');
  assert.equal(inspectRangeM(2000), 5000, 'ceiling');
  for (const bad of [0, -1, Number.NaN, null, undefined, Infinity]) {
    assert.equal(inspectRangeM(bad), null, `invalid radius ${bad}`);
  }
});

test('orbit viewFrom is TRACK_VIEW_FROM_LEO, scaled up above 2000 km', () => {
  assert.ok(close(orbitViewFrom(420_000), TRACK_VIEW_FROM_LEO));
  const high = orbitViewFrom(20_200_000);
  assert.ok(
    close(
      high,
      Cesium.Cartesian3.multiplyByScalar(
        TRACK_VIEW_FROM_LEO,
        TRACK_VIEW_FROM_HIGH_SCALE,
        new Cesium.Cartesian3(),
      ),
    ),
  );
  assert.ok(close(orbitViewFrom(Number.NaN), TRACK_VIEW_FROM_LEO));
});

test('inspect keeps the orbit direction and only changes the range', () => {
  const orbit = orbitViewFrom(420_000);
  const inspect = inspectViewFrom(orbit, 72.068);
  assert.ok(close(unit(inspect), unit(orbit), 1e-12), 'same direction');
  assert.ok(
    Math.abs(Cesium.Cartesian3.magnitude(inspect) - 576.544) < 1e-6,
    'range 8·radiusM',
  );
  assert.ok(close(orbit, TRACK_VIEW_FROM_LEO), 'input left untouched');
  assert.equal(inspectViewFrom(orbit, 0), null, 'no radius, no inspect');
});

test('tween starts at the current offset and lands on the target', () => {
  const from = new Cesium.Cartesian3(-450_000, -450_000, 350_000);
  const to = inspectViewFrom(from, 72.068);
  assert.ok(close(framingTweenOffset(from, to, 0), from, 1e-6));
  assert.ok(close(framingTweenOffset(from, to, 1), to, 1e-9));
  assert.ok(close(framingTweenOffset(from, to, 3), to, 1e-9), 'clamped');
  const mid = Cesium.Cartesian3.magnitude(framingTweenOffset(from, to, 0.5));
  assert.ok(
    mid < Cesium.Cartesian3.magnitude(from) &&
      mid > Cesium.Cartesian3.magnitude(to),
    'range moves monotonically between the two',
  );
});
