import {
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
