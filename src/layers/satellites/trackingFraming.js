import * as Cesium from 'cesium';
import { SAT_FRAMING_TWEEN_MS } from './policy.js';
import {
  framingTweenOffset,
  inspectRefusal,
  inspectViewFrom,
  isTrackFraming,
} from './framing.js';
import { elementAgeOf } from './contextFields.js';
import {
  dockBiasElevation,
  readDockViewport,
  tiltTowardElevation,
} from './dockBias.js';

const scratchTweenOffset = new Cesium.Cartesian3();

/**
 * Camera framing of the tracked satellite (P4 T5, extracted from tracking.js
 * in T7): ÓRBITA / INSPECCIONAR, the eased tween between them and the phone
 * dock bias. It writes the follow camera and the entity's viewFrom only; the
 * NORAD id, the selection and the context subject stay with tracking.js,
 * which is told to republish the presentation after a framing change.
 * @param {{layerState: object, parts: object,
 *   publishPresentation: () => void}} context
 */
export function createTrackingFraming({
  layerState,
  parts,
  publishPresentation,
}) {
  /** Wall clock of the framing tween (the frame-test clock when seeded). */
  function _framingNowMs() {
    const seeded = layerState._trackedFrameNowForTest?.();
    return seeded === undefined || seeded === null
      ? Date.now()
      : Number(seeded);
  }

  /** The camera follows our entity, or nobody: a framing change may move it. */
  function _ownsOrFreeCamera() {
    const owner = layerState._viewer?.trackedEntity;
    return !owner || owner === layerState._trackedEntity;
  }

  /**
   * Move the follow camera onto a framing's viewFrom: eased from the current
   * offset while we hold the camera, or re-engaged at once (reduced motion,
   * or a released camera). Reassigning trackedEntity to OUR entity never
   * trips the cross-layer auto-untrack (interaction.js ignores its own).
   * @param {Cesium.Cartesian3} target New viewFrom.
   * @param {boolean} reducedMotion Land instantly.
   */
  function _applyFramingCamera(target, reducedMotion) {
    const viewer = layerState._viewer;
    const entity = layerState._trackedEntity;
    layerState._framingTween = null;
    if (!_ownsOrFreeCamera()) return;
    viewer.camera?.cancelFlight?.();
    const following = viewer.trackedEntity === entity;
    if (!reducedMotion && following && viewer.camera?.position) {
      layerState._framingTween = {
        from: Cesium.Cartesian3.clone(viewer.camera.position),
        to: Cesium.Cartesian3.clone(target),
        startMs: _framingNowMs(),
      };
      return;
    }
    viewer.trackedEntity = undefined;
    viewer.trackedEntity = entity;
  }

  /**
   * viewFrom of a framing for `id`, or null when refused. 'inspect' follows
   * the Mission Dock rule (framing.js inspectRefusal): a stale orbit, no
   * curated model or a failed model refuse it; 'orbit' is always available.
   */
  function _framingTarget(framing, id, orbit) {
    if (framing !== 'inspect') return Cesium.Cartesian3.clone(orbit);
    const asset = parts.models.assetFor(id);
    const refused = inspectRefusal({
      asset,
      elementAge: elementAgeOf(layerState._catalog.get(id), Date.now()),
      modelStatus: parts.models.statusOf(id),
      propagationFailed: layerState._trackedPropagationFailed === true,
    });
    return refused ? null : inspectViewFrom(orbit, asset.radiusM);
  }

  /**
   * Switch the tracked camera framing without touching the NORAD id, the
   * selection or the context subject. The framing is kept on the entity's
   * viewFrom so SEGUIR (_refocusTracked) lands on it after a gesture.
   * @param {'orbit'|'inspect'} framing
   * @param {{reducedMotion?: boolean}} [options]
   * @returns {boolean} Whether the framing is now in force.
   */
  function _setTrackedFraming(framing, { reducedMotion = false } = {}) {
    const id = layerState._trackedNorad;
    const orbit = layerState._trackedOrbitViewFrom;
    if (!isTrackFraming(framing) || id === null || !orbit) return false;
    if (!layerState._trackedEntity || !layerState._viewer) return false;
    const target = _framingTarget(framing, id, orbit);
    if (!target) return false;
    layerState._trackedFraming = framing;
    layerState._trackedEntity.viewFrom = target;
    _applyFramingCamera(target, reducedMotion === true);
    publishPresentation();
    return true;
  }

  /** One eased step of the framing tween (shared preRender tick). */
  function _advanceFramingTween(nowMs = _framingNowMs()) {
    const tween = layerState._framingTween;
    if (!tween) return;
    const viewer = layerState._viewer;
    const entity = layerState._trackedEntity;
    // A gesture (or anyone) took the camera: never write a released camera.
    if (!entity || viewer?.trackedEntity !== entity || !viewer.camera) {
      layerState._framingTween = null;
      return;
    }
    const t = (nowMs - tween.startMs) / SAT_FRAMING_TWEEN_MS;
    const offset = framingTweenOffset(
      tween.from,
      tween.to,
      t,
      scratchTweenOffset,
    );
    viewer.camera.lookAtTransform(viewer.camera.transform, offset);
    if (t >= 1) layerState._framingTween = null;
  }

  /**
   * Keep the followed target above the Mission Dock on a phone: pitch the
   * follow camera so the target projects at the centre of the free area over
   * `--eye-dock-band`, and back to the centre when the band or the phone
   * viewport goes away. Only while OUR entity holds the camera.
   */
  function _applyDockBias() {
    const viewer = layerState._viewer;
    const camera = viewer?.camera;
    const entity = layerState._trackedEntity;
    if (!entity || viewer.trackedEntity !== entity) return;
    if (!camera?.position || !camera.direction || !camera.up) return;
    const viewport = layerState._dockViewportForTest
      ? layerState._dockViewportForTest()
      : readDockViewport();
    const wanted = dockBiasElevation(
      viewport && { ...viewport, fovy: camera.frustum?.fovy },
    );
    const tilted = tiltTowardElevation(camera, wanted);
    if (!tilted) return;
    Cesium.Cartesian3.clone(tilted.direction, camera.direction);
    Cesium.Cartesian3.clone(tilted.up, camera.up);
  }

  return { _applyDockBias, _setTrackedFraming, _advanceFramingTween };
}
