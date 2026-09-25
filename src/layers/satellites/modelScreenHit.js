import * as Cesium from 'cesium';
import { projectedDiameterPx } from './modelLod.js';
import { SAT_HULL_HIT_MIN_COARSE_PX, SAT_HULL_HIT_MIN_PX } from './policy.js';

/**
 * Screen-space view of an admitted satellite model (P4 T5): its projected
 * size (point→model handoff) and whether a click falls on its hull (pick).
 * Plain functions over the models context built by models.js. The model loads
 * with `allowPicking: false`, so this is the only way a click can "hit" it.
 */

const scratchCenter = new Cesium.Cartesian3();
const scratchWindow = new Cesium.Cartesian2();
const scratchOrigin = new Cesium.Cartesian3();

/** World sphere of the model: Cesium's real one once ready, else the asset's. */
function sphereOf(entry) {
  try {
    const sphere = entry.model.boundingSphere;
    if (sphere?.center && Number.isFinite(sphere.radius) && sphere.radius > 0)
      return { center: sphere.center, radiusM: sphere.radius };
  } catch {
    // Not ready for Cesium yet: fall back to the posed origin.
  }
  const center = Cesium.Matrix4.getTranslation(
    entry.model.modelMatrix,
    scratchCenter,
  );
  return { center, radiusM: entry.asset.radiusM };
}

/**
 * @param {object} ctx Models context.
 * @param {number} id NORAD id.
 * @returns {{center: object, radiusM: number, px: number}|null} Null unless
 *   the model is admitted, ready, shown and measurable.
 */
function modelView(ctx, id) {
  const entry = ctx.store.active.get(id);
  if (!entry?.ready || entry.failed || entry.model.show !== true) return null;
  const camera = ctx.viewer?.camera;
  const heightPx = ctx.viewer?.scene?.canvas?.clientHeight;
  if (!camera?.positionWC) return null;
  const { center, radiusM } = sphereOf(entry);
  const projection = {
    distanceM: Cesium.Cartesian3.distance(camera.positionWC, center),
    viewportHeightPx: heightPx,
    fovyRad: camera.frustum?.fovy,
  };
  const px = projectedDiameterPx({ radiusM, ...projection });
  if (!(px > 0)) return null;
  // The tracked card anchors to the drawn ORIGIN, not the sphere centre: the
  // sphere around the origin that holds the hull is r + |centre − origin|.
  const origin = Cesium.Matrix4.getTranslation(
    entry.model.modelMatrix,
    scratchOrigin,
  );
  const offsetM = Cesium.Cartesian3.distance(center, origin);
  const anchorPx = projectedDiameterPx({
    radiusM: radiusM + offsetM,
    ...projection,
  });
  return { center, radiusM, px, anchorPx };
}

/**
 * Translation the model of `id` is rendering with this frame.
 * @param {object} ctx Models context.
 * @param {number} id NORAD id.
 * @param {Cesium.Cartesian3} result
 * @returns {Cesium.Cartesian3|null} Null unless admitted, ready and shown.
 */
export function modelTranslation(ctx, id, result) {
  const entry = ctx.store.active.get(id);
  if (!entry?.ready || entry.failed || entry.model.show !== true) return null;
  return Cesium.Matrix4.getTranslation(entry.model.modelMatrix, result);
}

/**
 * @param {object} ctx Models context.
 * @param {number} id NORAD id.
 * @returns {{modelReady: boolean, modelPx: number, anchorPx: number}}
 *   `modelPx` is the hull's projected diameter; `anchorPx` the diameter of
 *   the sphere around the drawn origin (card anchor) that holds the hull.
 */
export function modelHandoffInput(ctx, id) {
  const view = modelView(ctx, id);
  return {
    modelReady: view !== null,
    modelPx: view?.px ?? 0,
    anchorPx: view?.anchorPx ?? 0,
  };
}

/**
 * Whether a window position (CSS px, as ScreenSpaceEventHandler reports it)
 * falls inside the projected bounding sphere of `id`'s model, never less than
 * SAT_HULL_HIT_MIN_PX (SAT_HULL_HIT_MIN_COARSE_PX on a coarse pointer).
 * @param {object} ctx Models context.
 * @param {{x: number, y: number}} windowPosition
 * @param {number} id NORAD id.
 * @returns {boolean}
 */
export function modelScreenHit(ctx, windowPosition, id) {
  if (
    !Number.isFinite(windowPosition?.x) ||
    !Number.isFinite(windowPosition?.y)
  )
    return false;
  const view = modelView(ctx, id);
  if (!view) return false;
  const screen = ctx.toWindow(ctx.viewer.scene, view.center, scratchWindow);
  if (!Number.isFinite(screen?.x) || !Number.isFinite(screen?.y)) return false;
  const minPx = ctx.isCoarsePointer()
    ? SAT_HULL_HIT_MIN_COARSE_PX
    : SAT_HULL_HIT_MIN_PX;
  const radiusPx = Math.max(minPx, view.px / 2);
  const dx = windowPosition.x - screen.x;
  const dy = windowPosition.y - screen.y;
  return dx * dx + dy * dy <= radiusPx * radiusPx;
}
