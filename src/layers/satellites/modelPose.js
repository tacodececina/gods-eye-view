import * as Cesium from 'cesium';
import { gstime } from 'satellite.js';
import { attitudeMatrix } from './attitude.js';
import { retireFailedModels } from './modelLifecycle.js';
import { propagateStateEcef } from './orbits.js';

/**
 * Per-frame pose of admitted satellite models (P4 T4): never more than the
 * cap. Translation is the SGP4 sample (the tracked satellite's shared sample,
 * or a fresh one for a secondary, which also moves its point); rotation is
 * attitude.js's approximate pose, or neutral ENU when that is degenerate.
 * Allocation-free per frame: module scratch plus each entry's own sample.
 */

const scratchDate = new Date(0);
const scratchRotation = new Cesium.Matrix3();
const scratchEnu = new Cesium.Matrix4();

function rotationFor(entry, sample, position, dateMs) {
  const gmstRad = Number.isFinite(dateMs) ? gstime(scratchDate) : Number.NaN;
  const rotation = attitudeMatrix(
    {
      positionEcef: sample?.position ?? null,
      velocityEcef: sample?.velocity ?? null,
      mode: entry.asset.attitudeMode,
      axes: entry.asset,
      gmstRad,
    },
    scratchRotation,
  );
  if (rotation) return rotation;
  // Degenerate attitude: neutral ENU, and the position is never blocked.
  Cesium.Transforms.eastNorthUpToFixedFrame(
    position,
    Cesium.Ellipsoid.WGS84,
    scratchEnu,
  );
  return Cesium.Matrix4.getMatrix3(scratchEnu, scratchRotation);
}

function poseModel(state, id, entry, sharedPosition, dateMs) {
  const sat = state._catalog?.get(id);
  scratchDate.setTime(dateMs);
  const sample =
    sat && Number.isFinite(dateMs)
      ? propagateStateEcef(sat.satrec, scratchDate, entry.sample)
      : null;
  const position = sharedPosition ?? sample?.position ?? null;
  if (!position) {
    entry.model.show = false;
    return;
  }
  // A secondary's point shares this SGP4 sample, so dot and model agree.
  const point = sharedPosition ? null : state._points?.get(id);
  if (point) point.position = position;
  const rotation = rotationFor(entry, sample, position, dateMs);
  Cesium.Matrix4.fromRotationTranslation(
    rotation,
    position,
    entry.model.modelMatrix,
  );
  entry.model.show = true;
}

/**
 * @param {object} ctx Models context.
 * @param {{trackedNorad?: number|null, trackedPosition?: object|null,
 *   trackedDateMs?: number, nowMs?: number}} frame The tracked model uses
 *   the tracking layer's shared per-frame sample (position + its date).
 */
export function updateModelPoses(ctx, frame = {}) {
  const { store, state } = ctx;
  if (store.destroyed) return;
  retireFailedModels(ctx);
  if (store.active.size === 0) return;
  const {
    trackedNorad = null,
    trackedPosition = null,
    trackedDateMs = Number.NaN,
    nowMs = Date.now(),
  } = frame;
  for (const [id, entry] of store.active) {
    if (entry.failed) continue;
    const shared = id === trackedNorad ? trackedPosition : null;
    poseModel(state, id, entry, shared, shared ? trackedDateMs : nowMs);
  }
}
