/**
 * SGP4 health of the tracked satellite (P4-20). When the propagation of the
 * followed satellite fails there is NO valid pose: the layer must say
 * «propagación falló» instead of freezing the last good sample as if it were
 * current. The failure drops the tracked model at once, keeps the subject
 * (NORAD, selection, context slot) and clears when SGP4 answers again.
 */

/** Record status the dossier and the Mission Dock render (eyeinskyDossier*). */
export const PROPAGATION_FAILED_STATUS = 'propagation-failed';

/** Visible wording, shared by the tracked card, chips and dock hints. */
export const PROPAGATION_FAILED_TEXT = 'propagación falló';

/**
 * @param {{layerState: object, parts: object, onChange: () => void}} input
 *   `onChange` republishes the tracked card and context once per transition.
 */
export function createTrackingPropagation({ layerState, parts, onChange }) {
  /** Whether this frame still needs an SGP4 sample for the tracked satellite. */
  function needsSample(frameNumber) {
    if (frameNumber === -1) return true;
    if (frameNumber !== layerState._trackedFrameNumber) return true;
    // Same frame: a cached good sample, or a failure already recorded for it.
    return (
      layerState._trackedFrameGeo === null &&
      !layerState._trackedPropagationFailed
    );
  }

  /** SGP4 gave no position: no pose this frame, no model, one announcement. */
  function markFailed(frameNumber) {
    layerState._trackedFrameGeo = null;
    layerState._trackedFrameDateMs = Number.NaN;
    layerState._trackedFrameNumber = frameNumber;
    if (layerState._trackedPropagationFailed) return;
    layerState._trackedPropagationFailed = true;
    parts.models.releaseTarget(layerState._trackedNorad, 'propagation-failed');
    onChange();
  }

  /** @returns {boolean} True when a failure just cleared (republish now). */
  function markRecovered() {
    if (!layerState._trackedPropagationFailed) return false;
    layerState._trackedPropagationFailed = false;
    return true;
  }

  /** Forget the failure (new target, untrack, cache invalidation). */
  function reset() {
    layerState._trackedPropagationFailed = false;
  }

  /** @returns {boolean} Whether the tracked satellite has no valid pose now. */
  function isFailed() {
    return layerState._trackedPropagationFailed === true;
  }

  return { needsSample, markFailed, markRecovered, reset, isFailed };
}
