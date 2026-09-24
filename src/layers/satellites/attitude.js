import * as Cesium from 'cesium';

/**
 * Approximate, labelled visual attitude for satellite models (P4 T3).
 * SGP4 gives position and velocity only — never attitude — so every pose here
 * is illustrative and must be shown as "actitud aproximada", never as
 * telemetry. Callers fall back to a neutral ENU pose when this returns null.
 *
 * Frame convention. The returned Matrix3 R rotates the model's LOCAL frame
 * into ECEF and is meant for the rotation part of `Model.modelMatrix`. LOCAL is
 * the frame after Cesium's glTF axis correction
 * (ModelUtility.getAxisCorrectionMatrix: Y_UP_TO_Z_UP, then Z_UP_TO_X_UP),
 * which maps glTF +X→local +Y, +Y→local +Z, +Z→local +X (verified on
 * Cesium 1.138). The manifest's `forwardAxis`/`upAxis` are glTF axes and are
 * pushed through that same mapping first.
 *
 * 'lvlh-nominal' (ISS): LVLH from the SGP4 state, with r and v in ECEF axes
 *   (v = inertial velocity rotated to ECEF, as `propagateStateEcef` returns):
 *   z_L = -r̂ (nadir), y_L = -normalize(r × v), x_L = y_L × z_L (≈ +velocity).
 *   The model's forward axis is aligned with x_L and its up axis with -z_L
 *   (zenith); the third axis follows by right-handedness. For the ISS
 *   (glTF +Z forward / +Y up) that is local +X → x_L, local +Z → -z_L,
 *   local +Y → -y_L (the orbit normal r × v).
 * 'desconocida-ilustrativa' (CubeSat, Hubble): a fixed inertial pose — the
 *   local axes coincide with the ECI (TEME) axes — expressed in ECEF as the
 *   rotation of -GMST about +Z. Deterministic for a given `gmstRad`, and
 *   independent of r, v and the manifest axes.
 */

// glTF axis → LOCAL axis after Cesium's axis correction (see above).
const GLTF_TO_LOCAL = Object.freeze({
  '+X': [0, 1, 0],
  '-X': [0, -1, 0],
  '+Y': [0, 0, 1],
  '-Y': [0, 0, -1],
  '+Z': [1, 0, 0],
  '-Z': [-1, 0, 0],
});
const MODES = new Set(['lvlh-nominal', 'desconocida-ilustrativa']);
/** Below 1 m, 1 mm/s, or sin(r, v) < 1e-6 the LVLH basis is undefined. */
const MIN_RADIUS_M = 1;
const MIN_SPEED_MPS = 1e-3;
const MIN_BASIS_SIN = 1e-6;

function toCartesian(value) {
  const { x, y, z } = value ?? {};
  return [x, y, z].every((c) => Number.isFinite(c))
    ? new Cesium.Cartesian3(x, y, z)
    : null;
}

function localAxes(axes) {
  const forward = GLTF_TO_LOCAL[axes?.forwardAxis];
  const up = GLTF_TO_LOCAL[axes?.upAxis];
  if (!forward || !up || axes.forwardAxis[1] === axes.upAxis[1]) {
    throw new TypeError('Attitude axes must be two distinct glTF axes');
  }
  return {
    forward: Cesium.Cartesian3.fromArray(forward),
    up: Cesium.Cartesian3.fromArray(up),
  };
}

/** Matrix whose columns are the three given vectors. */
function fromColumns(a, b, c) {
  return Cesium.Matrix3.fromColumnMajorArray([
    a.x,
    a.y,
    a.z,
    b.x,
    b.y,
    b.z,
    c.x,
    c.y,
    c.z,
  ]);
}

/** Orthonormal, right-handed frame [forward, up, forward × up]. */
function frame(forward, up) {
  const third = Cesium.Cartesian3.cross(forward, up, new Cesium.Cartesian3());
  return fromColumns(forward, up, third);
}

/** LVLH x_L and zenith (-z_L) in ECEF, or null for a degenerate state. */
function lvlhTargets(positionEcef, velocityEcef) {
  const r = toCartesian(positionEcef);
  const v = toCartesian(velocityEcef);
  if (!r || !v) return null;
  const rMag = Cesium.Cartesian3.magnitude(r);
  const vMag = Cesium.Cartesian3.magnitude(v);
  if (rMag < MIN_RADIUS_M || vMag < MIN_SPEED_MPS) return null;
  const h = Cesium.Cartesian3.cross(r, v, new Cesium.Cartesian3());
  const hMag = Cesium.Cartesian3.magnitude(h);
  if (!(hMag / (rMag * vMag) >= MIN_BASIS_SIN)) return null;
  const zenith = Cesium.Cartesian3.divideByScalar(
    r,
    rMag,
    new Cesium.Cartesian3(),
  );
  const nadir = Cesium.Cartesian3.negate(zenith, new Cesium.Cartesian3());
  const yL = Cesium.Cartesian3.divideByScalar(
    h,
    -hMag,
    new Cesium.Cartesian3(),
  );
  const xL = Cesium.Cartesian3.cross(yL, nadir, new Cesium.Cartesian3());
  return { forward: xL, up: zenith };
}

/**
 * Build the model-to-ECEF rotation for an approximate attitude mode.
 * @param {{positionEcef: {x:number,y:number,z:number}|null,
 *   velocityEcef: {x:number,y:number,z:number}|null,
 *   mode: 'lvlh-nominal'|'desconocida-ilustrativa',
 *   axes: {forwardAxis: string, upAxis: string},
 *   gmstRad?: number}} input Metres, m/s, radians (GMST for the inertial mode).
 * @returns {Cesium.Matrix3|null} Rotation (local → ECEF), or null when the
 *   state is degenerate (|v|≈0, v ∥ r, NaN) or GMST is missing.
 * @throws {TypeError} Unknown mode or invalid/parallel axes.
 */
export function attitudeMatrix({
  positionEcef,
  velocityEcef,
  mode,
  axes,
  gmstRad,
}) {
  if (!MODES.has(mode)) {
    throw new TypeError(`Unknown attitude mode: ${String(mode)}`);
  }
  const local = localAxes(axes);
  if (mode === 'desconocida-ilustrativa') {
    return Number.isFinite(gmstRad)
      ? Cesium.Matrix3.fromRotationZ(-gmstRad)
      : null;
  }
  const target = lvlhTargets(positionEcef, velocityEcef);
  if (!target) return null;
  const toTarget = frame(target.forward, target.up);
  const fromLocal = Cesium.Matrix3.transpose(
    frame(local.forward, local.up),
    new Cesium.Matrix3(),
  );
  return Cesium.Matrix3.multiply(toTarget, fromLocal, new Cesium.Matrix3());
}
