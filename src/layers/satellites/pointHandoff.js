import {
  SAT_CARD_GAP_STEP_PX,
  SAT_CARD_HULL_MARGIN_PX,
  SAT_POINT_HANDOFF_PX,
  SAT_RETICLE_ALPHA,
  SAT_RETICLE_PX,
  SAT_TRACKED_POINT_PX,
} from './policy.js';

/**
 * Point→model handoff for the tracked satellite (P4 T5). Pure: rendering.js
 * applies the result to the tracked entity's point graphic. The point is
 * NEVER removed — the follow camera resolves its bounding sphere from it.
 */

const DOT = Object.freeze({
  pointSize: SAT_TRACKED_POINT_PX,
  pointAlpha: 1,
  reticle: false,
});

const RETICLE = Object.freeze({
  pointSize: SAT_RETICLE_PX,
  pointAlpha: SAT_RETICLE_ALPHA,
  reticle: true,
});

/**
 * @param {{modelReady?: boolean, modelPx?: number, reducedMotion?: boolean}}
 *   input `reducedMotion` is accepted for callers that pass their motion
 *   preference through; it does not change the outcome, because the switch
 *   is always discrete (no fade to shorten).
 * @returns {Readonly<{pointSize: number, pointAlpha: number, reticle: boolean}>}
 */
export function resolvePointModelHandoff({ modelReady, modelPx } = {}) {
  const large = Number.isFinite(modelPx) && modelPx > SAT_POINT_HANDOFF_PX;
  return modelReady === true && large ? RETICLE : DOT;
}

/**
 * Where the tracked card goes while the model is drawn (reticle): above the
 * projected bounding sphere plus a margin, with the leader starting at the
 * hull edge. Null keeps the default dot clearance (trackedReadout.js).
 * @param {{reticle: boolean}} handoff resolvePointModelHandoff() result.
 * @param {number} modelPx Projected model diameter (CSS px).
 * @returns {Readonly<{anchorRadiusPx: 0, gapPx: number,
 *   leaderOffsetPx: number}>|null}
 */
export function trackedCardClearance(handoff, modelPx) {
  if (handoff?.reticle !== true || !Number.isFinite(modelPx)) return null;
  const step = SAT_CARD_GAP_STEP_PX;
  const radiusPx = Math.ceil(modelPx / 2 / step) * step;
  return Object.freeze({
    anchorRadiusPx: 0,
    gapPx: radiusPx + SAT_CARD_HULL_MARGIN_PX,
    leaderOffsetPx: radiusPx,
  });
}
