import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EARTH_RADIUS_M,
  aimOrientation,
  earthMoonFraming,
  minimumFovRad,
} from './framing.js';

const MOON = { x: 3.1e8, y: -2.2e8, z: 0.4e8 };
const MOON_RADIUS_M = 1_737_400;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a) => Math.sqrt(dot(a, a));

/** Semiángulo que ocupa una esfera vista desde `eye` a lo largo de `dir`. */
function halfAngle(eye, dir, center, radius) {
  const to = sub(center, eye);
  const off = Math.acos(dot(to, dir) / (norm(to) * norm(dir)));
  return off + Math.asin(radius / norm(to));
}

test('FOV mínimo: el de la dimensión menor (Cesium aplica fov a la mayor)', () => {
  const fov = Math.PI / 3;
  assert.equal(minimumFovRad(fov, 1), fov);
  const landscape = minimumFovRad(fov, 1920 / 1080);
  const portrait = minimumFovRad(fov, 390 / 844);
  assert.ok(
    Math.abs(landscape - 2 * Math.atan(Math.tan(fov / 2) / (1920 / 1080))) <
      1e-12,
  );
  assert.ok(
    Math.abs(portrait - 2 * Math.atan(Math.tan(fov / 2) * (390 / 844))) < 1e-12,
  );
});

test('SISTEMA TIERRA–LUNA: ambas esferas caben en el FOV mínimo (escritorio y 390×844)', () => {
  for (const aspect of [1920 / 1080, 390 / 844]) {
    const fov = Math.PI / 3;
    const pose = earthMoonFraming({ moonFixedM: MOON, fovRad: fov, aspect });
    const limit = minimumFovRad(fov, aspect) / 2;
    const eye = pose.destination;
    assert.ok(
      halfAngle(eye, pose.direction, { x: 0, y: 0, z: 0 }, EARTH_RADIUS_M) <=
        limit,
    );
    assert.ok(halfAngle(eye, pose.direction, MOON, MOON_RADIUS_M) <= limit);
    assert.ok(Math.abs(dot(pose.direction, pose.up)) < 1e-12, 'up ⟂ dirección');
    assert.ok(Math.abs(norm(pose.up) - 1) < 1e-12);
    assert.ok(pose.distanceM > 3.8e8 && pose.distanceM < 3e9);
  }
});

test('APUNTAR: solo orientación; dirección a la Luna y up sin volcar', () => {
  const eye = { x: 7e6, y: 0, z: 0 };
  const { direction, up } = aimOrientation({
    cameraPosition: eye,
    target: MOON,
    currentUp: { x: 0, y: 0, z: 1 },
  });
  const to = sub(MOON, eye);
  assert.ok(Math.abs(dot(direction, to) / norm(to) - 1) < 1e-12);
  assert.ok(Math.abs(dot(direction, up)) < 1e-12);
  assert.ok(up.z > 0, 'conserva el sentido del up actual');
  const degenerate = aimOrientation({
    cameraPosition: eye,
    target: { x: 1e9, y: 0, z: 0 },
    currentUp: { x: 1, y: 0, z: 0 },
  });
  assert.ok(
    Math.abs(norm(degenerate.up) - 1) < 1e-12,
    'up paralelo: se elige otro',
  );
  assert.throws(
    () =>
      aimOrientation({
        cameraPosition: eye,
        target: eye,
        currentUp: { x: 0, y: 0, z: 1 },
      }),
    RangeError,
  );
});

test('área libre sobre el dock: FOV útil y giro para centrar el objetivo en ella', async () => {
  const { viewportFit, tiltTowardFreeArea } = await import('./framing.js');
  const fov = Math.PI / 3;
  const free = viewportFit({
    fovRad: fov,
    width: 1280,
    height: 800,
    bottomBandPx: 0,
  });
  assert.equal(free.tiltRad, 0);
  assert.ok(Math.abs(free.minFovRad - minimumFovRad(fov, 1280 / 800)) < 1e-12);
  const docked = viewportFit({
    fovRad: fov,
    width: 1280,
    height: 800,
    bottomBandPx: 400,
  });
  const focalY = 400 / Math.tan(minimumFovRad(fov, 1280 / 800) / 2);
  assert.ok(Math.abs(docked.tiltRad - Math.atan(200 / focalY)) < 1e-12);
  assert.ok(Math.abs(docked.minFovRad - 2 * Math.atan(200 / focalY)) < 1e-12);
  const capped = viewportFit({
    fovRad: fov,
    width: 390,
    height: 844,
    bottomBandPx: 800,
  });
  assert.ok(capped.minFovRad > 0, 'el área libre nunca baja del 40 %');
  const d = { x: 1, y: 0, z: 0 };
  const u = { x: 0, y: 0, z: 1 };
  const t = tiltTowardFreeArea({ direction: d, up: u }, 0.1);
  assert.ok(Math.abs(t.direction.z + Math.sin(0.1)) < 1e-12, 'mira más abajo');
  assert.ok(Math.abs(t.up.x - Math.sin(0.1)) < 1e-12);
  assert.ok(Math.abs(dot(t.direction, t.up)) < 1e-12);
});

test('SISTEMA con FOV útil explícito (área libre) encaja en ese FOV', () => {
  const pose = earthMoonFraming({ moonFixedM: MOON, minFovRad: 0.2 });
  assert.ok(
    halfAngle(pose.destination, pose.direction, MOON, MOON_RADIUS_M) <= 0.1,
  );
  assert.ok(
    halfAngle(
      pose.destination,
      pose.direction,
      { x: 0, y: 0, z: 0 },
      EARTH_RADIUS_M,
    ) <= 0.1,
  );
});
