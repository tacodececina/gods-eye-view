import * as Cesium from 'cesium';
import {
  HIGH_ORBIT_ALTITUDE_M,
  SAT_INSPECT_MAX_RANGE_M,
  SAT_INSPECT_MIN_RANGE_M,
  SAT_INSPECT_RANGE_FACTOR,
  SAT_TRACK_FRAMINGS,
  TRACK_VIEW_FROM_HIGH_SCALE,
  TRACK_VIEW_FROM_LEO,
} from './policy.js';

/**
 * Pure camera framings for the tracked satellite (P4 T5). 'orbit' is the
 * user-validated landing (TRACK_VIEW_FROM_LEO, scaled up for high orbits);
 * 'inspect' keeps the same direction at clamp(8·radiusM, 30 m, 5 km) from
 * the resolved model asset. No camera or layer state is touched here.
 */

const scratchFrom = new Cesium.Cartesian3();
const scratchTo = new Cesium.Cartesian3();

/** @param {unknown} value @returns {boolean} */
export function isTrackFraming(value) {
  return SAT_TRACK_FRAMINGS.includes(value);
}

/**
 * @param {number} radiusM Asset bounding radius (manifest radiusM).
 * @returns {number|null} Inspect range in metres, or null without a radius.
 */
export function inspectRangeM(radiusM) {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return null;
  return Math.min(
    SAT_INSPECT_MAX_RANGE_M,
    Math.max(SAT_INSPECT_MIN_RANGE_M, SAT_INSPECT_RANGE_FACTOR * radiusM),
  );
}

/**
 * @param {number} altitudeM Tracked altitude when tracking started.
 * @param {Cesium.Cartesian3} [result]
 * @returns {Cesium.Cartesian3} The orbit framing offset (east-north-up m).
 */
export function orbitViewFrom(altitudeM, result = new Cesium.Cartesian3()) {
  const scale =
    Number.isFinite(altitudeM) && altitudeM > HIGH_ORBIT_ALTITUDE_M
      ? TRACK_VIEW_FROM_HIGH_SCALE
      : 1;
  return Cesium.Cartesian3.multiplyByScalar(TRACK_VIEW_FROM_LEO, scale, result);
}

/**
 * @param {Cesium.Cartesian3} orbit The orbit framing offset (not modified).
 * @param {number} radiusM Asset bounding radius.
 * @param {Cesium.Cartesian3} [result]
 * @returns {Cesium.Cartesian3|null} Same direction at the inspect range.
 */
export function inspectViewFrom(orbit, radiusM, result) {
  const range = inspectRangeM(radiusM);
  if (range === null || !orbit) return null;
  const out = Cesium.Cartesian3.normalize(
    orbit,
    result ?? new Cesium.Cartesian3(),
  );
  return Cesium.Cartesian3.multiplyByScalar(out, range, out);
}

const easeOutCubic = (t) => 1 - (1 - t) ** 3;

/**
 * Offset between two framings: direction interpolated on the unit sphere
 * (normalised lerp), range interpolated geometrically so a 726 km → 577 m
 * move reads as a steady approach instead of a jump at the end.
 * @param {Cesium.Cartesian3} from Current camera offset.
 * @param {Cesium.Cartesian3} to Target framing offset.
 * @param {number} t Progress; clamped to [0, 1].
 * @param {Cesium.Cartesian3} [result]
 * @returns {Cesium.Cartesian3}
 */
export function framingTweenOffset(from, to, t, result) {
  const out = result ?? new Cesium.Cartesian3();
  const k = easeOutCubic(Math.min(1, Math.max(0, Number(t) || 0)));
  if (k >= 1) return Cesium.Cartesian3.clone(to, out);
  const fromRange = Cesium.Cartesian3.magnitude(from);
  const toRange = Cesium.Cartesian3.magnitude(to);
  Cesium.Cartesian3.normalize(from, scratchFrom);
  Cesium.Cartesian3.normalize(to, scratchTo);
  Cesium.Cartesian3.lerp(scratchFrom, scratchTo, k, out);
  Cesium.Cartesian3.normalize(out, out);
  const range = Math.exp(
    Math.log(fromRange) + (Math.log(toRange) - Math.log(fromRange)) * k,
  );
  return Cesium.Cartesian3.multiplyByScalar(out, range, out);
}
