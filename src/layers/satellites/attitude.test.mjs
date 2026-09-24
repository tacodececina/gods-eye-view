import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { attitudeMatrix } from './attitude.js';

const GLTF_AXES = Object.freeze({ forwardAxis: '+Z', upAxis: '+Y' });
const r = new Cesium.Cartesian3(7000e3, 0, 0);
const v = new Cesium.Cartesian3(0, 7.5e3, 0);

const column = (m, i) =>
  Cesium.Matrix3.getColumn(m, i, new Cesium.Cartesian3());
const apply = (m, x, y, z) =>
  Cesium.Matrix3.multiplyByVector(
    m,
    new Cesium.Cartesian3(x, y, z),
    new Cesium.Cartesian3(),
  );

function assertVector(actual, expected, label) {
  for (const key of ['x', 'y', 'z'])
    assert.ok(
      Math.abs(actual[key] - expected[key]) < 1e-9,
      `${label}.${key}: ${actual[key]}`,
    );
}

function assertRotation(m) {
  const product = Cesium.Matrix3.multiply(
    m,
    Cesium.Matrix3.transpose(m, new Cesium.Matrix3()),
    new Cesium.Matrix3(),
  );
  for (let i = 0; i < 9; i++)
    assert.ok(
      Math.abs(product[i] - Cesium.Matrix3.IDENTITY[i]) < 1e-6,
      `R·Rᵀ[${i}] = ${product[i]}`,
    );
  assert.ok(
    Math.abs(Cesium.Matrix3.determinant(m) - 1) < 1e-6,
    'proper rotation',
  );
}

test('lvlh-nominal is orthonormal and maps forward to +velocity, up to zenith', () => {
  const m = attitudeMatrix({
    positionEcef: r,
    velocityEcef: v,
    mode: 'lvlh-nominal',
    axes: GLTF_AXES,
  });
  assert.ok(m instanceof Cesium.Matrix3);
  assertRotation(m);
  // Cesium turns glTF +Z forward / +Y up into local +X forward / +Z up.
  assertVector(column(m, 0), { x: 0, y: 1, z: 0 }, 'local forward (+X)');
  assertVector(column(m, 2), { x: 1, y: 0, z: 0 }, 'local up (+Z)');
  assertVector(apply(m, 0, 0, -1), { x: -1, y: 0, z: 0 }, 'model nadir');
  // Local +Y (glTF +X) points along the orbit normal r×v.
  assertVector(column(m, 1), { x: 0, y: 0, z: 1 }, 'local +Y');
});

test('lvlh-nominal honours other manifest axes through the same correction', () => {
  // glTF -Z forward (local -X) and +Y up (local +Z).
  const m = attitudeMatrix({
    positionEcef: r,
    velocityEcef: v,
    mode: 'lvlh-nominal',
    axes: { forwardAxis: '-Z', upAxis: '+Y' },
  });
  assertRotation(m);
  assertVector(apply(m, -1, 0, 0), { x: 0, y: 1, z: 0 }, 'glTF -Z forward');
  assertVector(apply(m, 0, 0, 1), { x: 1, y: 0, z: 0 }, 'glTF +Y up');
});

test('lvlh-nominal stays orthonormal on an inclined, eccentric state', () => {
  const m = attitudeMatrix({
    positionEcef: new Cesium.Cartesian3(4100e3, -3900e3, 3600e3),
    velocityEcef: new Cesium.Cartesian3(2.1e3, 5.4e3, 4.9e3),
    mode: 'lvlh-nominal',
    axes: GLTF_AXES,
  });
  assertRotation(m);
});

test('degenerate LVLH bases return null instead of a guessed pose', () => {
  const cases = [
    { positionEcef: r, velocityEcef: Cesium.Cartesian3.ZERO },
    { positionEcef: r, velocityEcef: new Cesium.Cartesian3(1e-9, 0, 0) },
    { positionEcef: r, velocityEcef: new Cesium.Cartesian3(7.5e3, 0, 0) },
    { positionEcef: r, velocityEcef: new Cesium.Cartesian3(-3e3, 0, 0) },
    { positionEcef: Cesium.Cartesian3.ZERO, velocityEcef: v },
    { positionEcef: new Cesium.Cartesian3(NaN, 0, 0), velocityEcef: v },
    { positionEcef: r, velocityEcef: new Cesium.Cartesian3(0, Infinity, 0) },
    { positionEcef: null, velocityEcef: v },
  ];
  for (const state of cases)
    assert.equal(
      attitudeMatrix({ ...state, mode: 'lvlh-nominal', axes: GLTF_AXES }),
      null,
      JSON.stringify(state),
    );
});

test('desconocida-ilustrativa is a fixed inertial pose, deterministic and state-free', () => {
  const at = (gmstRad, positionEcef, velocityEcef) =>
    attitudeMatrix({
      positionEcef,
      velocityEcef,
      mode: 'desconocida-ilustrativa',
      axes: GLTF_AXES,
      gmstRad,
    });
  const first = at(1.2, r, v);
  const second = at(
    1.2,
    new Cesium.Cartesian3(1, 2, 3),
    Cesium.Cartesian3.ZERO,
  );
  assertRotation(first);
  assert.ok(
    Cesium.Matrix3.equalsEpsilon(first, second, 1e-12),
    'independent of r and v',
  );
  assert.ok(
    Cesium.Matrix3.equalsEpsilon(at(0, r, v), Cesium.Matrix3.IDENTITY, 1e-12),
    'identity at GMST 0',
  );
  // ECI +X seen from ECEF rotates by -GMST about +Z.
  assertVector(
    column(at(Math.PI / 2, r, v), 0),
    { x: 0, y: -1, z: 0 },
    'ECI +X at GMST 90deg',
  );
  assert.equal(at(NaN, r, v), null);
});

test('unknown modes and invalid axes fail fast', () => {
  assert.throws(
    () =>
      attitudeMatrix({
        positionEcef: r,
        velocityEcef: v,
        mode: 'sun-pointing',
        axes: GLTF_AXES,
      }),
    TypeError,
  );
  for (const axes of [
    { forwardAxis: '+Y', upAxis: '+Y' },
    { forwardAxis: '+Z', upAxis: '-Z' },
    { forwardAxis: 'Z', upAxis: '+Y' },
    null,
  ])
    assert.throws(
      () =>
        attitudeMatrix({
          positionEcef: r,
          velocityEcef: v,
          mode: 'lvlh-nominal',
          axes,
        }),
      TypeError,
      JSON.stringify(axes),
    );
});
