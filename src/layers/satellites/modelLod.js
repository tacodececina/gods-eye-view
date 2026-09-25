/**
 * Pure LOD helpers for near-field satellite models (P4 T3). Thresholds live in
 * policy.js (SAT_MODEL_*); this module only measures and classifies.
 */

const BANDS = new Set(['none', 'model']);

/**
 * Projected on-screen diameter of a bounding sphere, in pixels:
 * 2·radiusM·viewportHeightPx / (2·distanceM·tan(fovyRad / 2)).
 * @param {{radiusM: number, distanceM: number, viewportHeightPx: number,
 *   fovyRad: number}} input
 * @returns {number} Diameter in pixels; 0 for any invalid or non-positive
 *   input, so bad geometry never admits a model.
 */
export function projectedDiameterPx({
  radiusM,
  distanceM,
  viewportHeightPx,
  fovyRad,
}) {
  const positive = [radiusM, distanceM, viewportHeightPx, fovyRad].every(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (!positive || fovyRad >= Math.PI) return 0;
  return (
    (2 * radiusM * viewportHeightPx) / (2 * distanceM * Math.tan(fovyRad / 2))
  );
}

function assertHysteresis(add, keep, label) {
  if (label === 'px' ? add < keep : add > keep) {
    throw new RangeError(`Model band ${label} hysteresis is inverted`);
  }
}

const finite = (...values) => values.every((value) => Number.isFinite(value));

/**
 * Distance gate: optional (both limits omitted); entering needs <= addM,
 * staying needs <= keepM. A half-configured or non-finite ceiling fails closed.
 */
function withinDistance({ distanceM, addM, keepM }, current) {
  if (addM === undefined && keepM === undefined) return true;
  if (!finite(addM, keepM)) return false;
  assertHysteresis(addM, keepM, 'distance');
  if (!Number.isFinite(distanceM)) return false;
  return distanceM <= (current === 'model' ? keepM : addM);
}

/**
 * Hysteretic model band. From 'none' a model is added at px >= addPx; an
 * existing model is kept while px >= keepPx. With a distance ceiling
 * (distanceM, addM, keepM) both the pixel and the distance gates must pass.
 * @param {{px: number, current: 'none'|'model', addPx: number, keepPx: number,
 *   distanceM?: number, addM?: number, keepM?: number}} input
 * @returns {'none'|'model'} Non-finite measurements and missing or
 *   non-finite thresholds fail closed to 'none' (never a model).
 * @throws {TypeError|RangeError} Unknown band or inverted finite hysteresis.
 */
export function classifyModelBand(input) {
  const { px, current, addPx, keepPx } = input;
  if (!BANDS.has(current))
    throw new TypeError(`Unknown model band: ${current}`);
  if (!finite(addPx, keepPx)) return 'none';
  assertHysteresis(addPx, keepPx, 'px');
  if (!Number.isFinite(px)) return 'none';
  const threshold = current === 'model' ? keepPx : addPx;
  if (px < threshold) return 'none';
  return withinDistance(input, current) ? 'model' : 'none';
}
