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
 * (ModelUtility.getAxisCorrectionMatrix: the matrix Y_UP_TO_Z_UP·Z_UP_TO_X_UP,
 * so on a vertex Z_UP_TO_X_UP applies first), whose net mapping is glTF
 * +X→local +Y, +Y→local +Z, +Z→local +X (verified on Cesium 1.138, and pinned
 * by the composition test in attitude.test.mjs). The manifest's `forwardAxis`/`upAxis` are glTF axes and are
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
  '+X': Object.freeze(new Cesium.Cartesian3(0, 1, 0)),
  '-X': Object.freeze(new Cesium.Cartesian3(0, -1, 0)),
  '+Y': Object.freeze(new Cesium.Cartesian3(0, 0, 1)),
  '-Y': Object.freeze(new Cesium.Cartesian3(0, 0, -1)),
  '+Z': Object.freeze(new Cesium.Cartesian3(1, 0, 0)),
  '-Z': Object.freeze(new Cesium.Cartesian3(-1, 0, 0)),
});
const MODES = new Set(['lvlh-nominal', 'desconocida-ilustrativa']);
/** Below 1 m, 1 mm/s, or sin(r, v) < 1e-6 the LVLH basis is undefined. */
const MIN_RADIUS_M = 1;
const MIN_SPEED_MPS = 1e-3;
const MIN_BASIS_SIN = 1e-6;

/**
 * Validated axes descriptor → frozen inverse local frame (LOCAL → [forward,
 * up, forward × up]). Memoized by reference: a descriptor is validated once,
 * so descriptors must not be mutated after first use (manifest entries are
 * frozen). Only valid descriptors are cached; invalid ones throw every time.
 */
const localFrameCache = new WeakMap();

// Module scratch: attitudeMatrix is synchronous and never re-entered.
const scratchR = new Cesium.Cartesian3();
const scratchV = new Cesium.Cartesian3();
const scratchH = new Cesium.Cartesian3();
const scratchZenith = new Cesium.Cartesian3();
const scratchNadir = new Cesium.Cartesian3();
const scratchYL = new Cesium.Cartesian3();
const scratchXL = new Cesium.Cartesian3();
const scratchThird = new Cesium.Cartesian3();
const scratchTarget = new Cesium.Matrix3();

/** Copy {x, y, z} into `result`, or null when any component is not finite. */
function toCartesian(value, result) {
  const { x, y, z } = value ?? {};
  return [x, y, z].every((c) => Number.isFinite(c))
    ? Cesium.Cartesian3.fromElements(x, y, z, result)
    : null;
}

/** Columns [forward, up, forward × up] into `result`. */
function frame(forward, up, result) {
  const third = Cesium.Cartesian3.cross(forward, up, scratchThird);
  Cesium.Matrix3.setColumn(result, 0, forward, result);
  Cesium.Matrix3.setColumn(result, 1, up, result);
  return Cesium.Matrix3.setColumn(result, 2, third, result);
}

function localFrameInverse(axes) {
  const cached = localFrameCache.get(axes);
  if (cached) return cached;
  const forward = GLTF_TO_LOCAL[axes?.forwardAxis];
  const up = GLTF_TO_LOCAL[axes?.upAxis];
  if (!forward || !up || axes.forwardAxis[1] === axes.upAxis[1]) {
    throw new TypeError('Attitude axes must be two distinct glTF axes');
  }
  const inverse = Object.freeze(
    Cesium.Matrix3.transpose(
      frame(forward, up, new Cesium.Matrix3()),
      new Cesium.Matrix3(),
    ),
  );
  localFrameCache.set(axes, inverse);
  return inverse;
}

/** LVLH x_L and zenith (-z_L) in ECEF (module scratch), or null. */
function lvlhTargets(positionEcef, velocityEcef) {
  const r = toCartesian(positionEcef, scratchR);
  const v = toCartesian(velocityEcef, scratchV);
  if (!r || !v) return null;
  const rMag = Cesium.Cartesian3.magnitude(r);
  const vMag = Cesium.Cartesian3.magnitude(v);
  if (rMag < MIN_RADIUS_M || vMag < MIN_SPEED_MPS) return null;
  const h = Cesium.Cartesian3.cross(r, v, scratchH);
  const hMag = Cesium.Cartesian3.magnitude(h);
  if (!(hMag / (rMag * vMag) >= MIN_BASIS_SIN)) return null;
  const zenith = Cesium.Cartesian3.divideByScalar(r, rMag, scratchZenith);
  const nadir = Cesium.Cartesian3.negate(zenith, scratchNadir);
  const yL = Cesium.Cartesian3.divideByScalar(h, -hMag, scratchYL);
  const xL = Cesium.Cartesian3.cross(yL, nadir, scratchXL);
  return { forward: xL, up: zenith };
}

/**
 * Build the model-to-ECEF rotation for an approximate attitude mode.
 * @param {{positionEcef: {x:number,y:number,z:number}|null,
 *   velocityEcef: {x:number,y:number,z:number}|null,
 *   mode: 'lvlh-nominal'|'desconocida-ilustrativa',
 *   axes: {forwardAxis: string, upAxis: string},
 *   gmstRad?: number}} input Metres, m/s, radians (GMST for the inertial mode).
 *   `axes` is validated once per object reference; do not mutate it.
 * @param {Cesium.Matrix3} [result] Matrix to write into (Cesium style); a new
 *   one is allocated when omitted. Left untouched when null is returned.
 * @returns {Cesium.Matrix3|null} Rotation (local → ECEF), or null when the
 *   state is degenerate (|v|≈0, v ∥ r, NaN) or GMST is missing.
 * @throws {TypeError} Unknown mode or invalid/parallel axes.
 */
export function attitudeMatrix(
  { positionEcef, velocityEcef, mode, axes, gmstRad },
  result,
) {
  if (!MODES.has(mode)) {
    throw new TypeError(`Unknown attitude mode: ${String(mode)}`);
  }
  const fromLocal = localFrameInverse(axes);
  if (mode === 'desconocida-ilustrativa') {
    return Number.isFinite(gmstRad)
      ? Cesium.Matrix3.fromRotationZ(-gmstRad, result)
      : null;
  }
  const target = lvlhTargets(positionEcef, velocityEcef);
  if (!target) return null;
  const toTarget = frame(target.forward, target.up, scratchTarget);
  return Cesium.Matrix3.multiply(
    toTarget,
    fromLocal,
    result ?? new Cesium.Matrix3(),
  );
}
