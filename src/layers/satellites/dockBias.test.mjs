import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  dockBiasElevation,
  readDockViewport,
  targetElevation,
  tiltTowardElevation,
} from './dockBias.js';
import { SAT_DOCK_BIAS_MAX_VIEWPORT_PX } from './policy.js';

const FOVY = Math.PI / 3;
const PHONE = { bandPx: 442, widthPx: 390, heightPx: 844, fovy: FOVY };

/** Screen y (CSS px from the top) where a target at `elevation` projects. */
const projectedY = (elevation, heightPx, fovy) =>
  heightPx / 2 - (Math.tan(elevation) / Math.tan(fovy / 2)) * (heightPx / 2);

test('phone with the dock open: the target lands mid-way in the free area', () => {
  assert.equal(SAT_DOCK_BIAS_MAX_VIEWPORT_PX, 650);
  const elevation = dockBiasElevation(PHONE);
  assert.ok(elevation > 0, 'the target is raised above the centre');
  const y = projectedY(elevation, PHONE.heightPx, FOVY);
  const freeCentre = (PHONE.heightPx - PHONE.bandPx) / 2;
  assert.ok(Math.abs(y - freeCentre) < 1e-6, `y=${y} vs ${freeCentre}`);
});

test('no bias on a wide viewport, without a dock band or with bad input', () => {
  assert.equal(dockBiasElevation({ ...PHONE, widthPx: 651 }), 0);
  assert.equal(dockBiasElevation({ ...PHONE, widthPx: 1280 }), 0);
  assert.equal(dockBiasElevation({ ...PHONE, bandPx: 0 }), 0);
  for (const bad of [
    null,
    undefined,
    { ...PHONE, bandPx: Number.NaN },
    { ...PHONE, heightPx: 0 },
    { ...PHONE, fovy: Number.NaN },
    { ...PHONE, widthPx: Number.NaN },
  ]) {
    assert.equal(dockBiasElevation(bad), 0, JSON.stringify(bad));
  }
  assert.ok(dockBiasElevation({ ...PHONE, widthPx: 650 }) > 0, '≤650 px');
});

test('a band taller than the viewport is capped: the target stays on screen', () => {
  const elevation = dockBiasElevation({ ...PHONE, bandPx: 5000 });
  const y = projectedY(elevation, PHONE.heightPx, FOVY);
  assert.ok(y > 0 && y < PHONE.heightPx / 2, `y=${y}`);
});

test('tilting reaches the wanted elevation and keeps an orthonormal basis', () => {
  // Camera 577 m from the target (at the origin), looking straight at it.
  const position = new Cesium.Cartesian3(-333, -333, 259);
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.negate(position, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const right = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(
      direction,
      Cesium.Cartesian3.UNIT_Z,
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3());
  const camera = { position, direction, up };
  assert.ok(Math.abs(targetElevation(camera)) < 1e-12, 'centred');
  const wanted = dockBiasElevation(PHONE);
  const tilted = tiltTowardElevation(camera, wanted);
  assert.ok(tilted, 'a change is needed');
  assert.ok(
    Math.abs(targetElevation({ position, ...tilted }) - wanted) < 1e-12,
  );
  assert.ok(
    Math.abs(Cesium.Cartesian3.magnitude(tilted.direction) - 1) < 1e-12,
  );
  assert.ok(
    Math.abs(Cesium.Cartesian3.dot(tilted.direction, tilted.up)) < 1e-12,
  );
  assert.ok(Math.abs(Cesium.Cartesian3.dot(tilted.direction, right)) < 1e-12);
  assert.ok(Cesium.Cartesian3.equals(camera.direction, direction), 'pure');
  const back = tiltTowardElevation({ position, ...tilted }, 0);
  assert.ok(Math.abs(targetElevation({ position, ...back })) < 1e-12);
  assert.equal(
    tiltTowardElevation({ position, ...tilted }, wanted),
    null,
    'already there: no write',
  );
});

test('readDockViewport reads the band the dock publishes, or nothing', () => {
  const style = new Map([['--eye-dock-band', '442px']]);
  const win = {
    innerWidth: 390,
    innerHeight: 844,
    document: {
      documentElement: {
        style: { getPropertyValue: (name) => style.get(name) ?? '' },
      },
    },
  };
  assert.deepEqual(readDockViewport(win), {
    bandPx: 442,
    widthPx: 390,
    heightPx: 844,
  });
  style.delete('--eye-dock-band');
  assert.equal(readDockViewport(win).bandPx, 0, 'no dock: no band');
  assert.equal(readDockViewport(undefined), null);
  assert.equal(readDockViewport({}), null);
});
