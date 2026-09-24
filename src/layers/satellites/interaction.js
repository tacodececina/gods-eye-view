import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import { PICK_STACK_LIMIT, resolveStackHost } from './pickHost.js';

export function createInteraction({
  state: layerState,
  services,
  parts,
  source,
}) {
  const { resolvePickId, isOwnedByOtherLayer } = services.picking;

  function _onKeyDown(e) {
    if (layerState._enabled && e.key === 'Escape' && layerState._trackedNorad) {
      parts.tracking._cancelPendingTrackingRestore();
      parts.tracking._clearTracking(false, { origin: 'user' });
    }
  }

  /** NORAD id of a satellite point pick, or null. */
  function _pickedNorad(picked) {
    const id = picked?.primitive?.id;
    if (id === null || id === undefined) return null;
    const noradId = Number(id);
    return Number.isNaN(noradId) || !layerState._catalog.has(noradId)
      ? null
      : noradId;
  }

  /** A click on co-located points (docked vehicles) selects the host. */
  function _resolveClickedNorad(viewer, position, pickedId) {
    const drilled = viewer.scene.drillPick?.(position, PICK_STACK_LIMIT) ?? [];
    const stackIds = [];
    for (const pick of drilled) {
      const id = _pickedNorad(pick);
      if (id !== null) stackIds.push(id);
    }
    return resolveStackHost({
      pickedId,
      stackIds,
      points: layerState._points,
      hasModel: (id) => parts.models?.hasAsset?.(id) === true,
    });
  }

  function _deselectUnlessSibling(picked) {
    // A pick that belongs to a sibling layer (plane, vessel, station, CCTV
    // camera…) is not "empty space" — leave OUR tracking (and crucially
    // viewer.trackedEntity, which that sibling may have JUST set) alone (H2).
    if (picked) {
      const pickedId = resolvePickId(picked);
      if (pickedId && isOwnedByOtherLayer('satellites', pickedId)) return;
    }
    // Clicked empty space — deselect
    if (layerState._trackedNorad) {
      parts.tracking._cancelPendingTrackingRestore();
      parts.tracking._clearTracking(false, { origin: 'user' });
    }
  }

  function _handleClick(viewer, click) {
    // A tool owns the pointer (src/data/inputOwnership.js): yield the click.
    if (!isPointerFree()) return;
    if (!layerState._enabled) return;
    const picked = viewer.scene.pick(click.position);
    // Clicking tracked entity itself — ignore
    if (picked && picked.id === layerState._trackedEntity) return;
    const pickedId = _pickedNorad(picked);
    if (pickedId === null) {
      _deselectUnlessSibling(picked);
      return;
    }
    const noradId = _resolveClickedNorad(viewer, click.position, pickedId);
    if (noradId === layerState._trackedNorad) return;
    parts.tracking._cancelPendingTrackingRestore();
    parts.tracking._trackSatellite(noradId, { origin: 'user' });
  }

  function _installClickHandler(viewer) {
    if (layerState._clickHandler) return; // already installed

    // Cross-layer untrack (H2, mirror of flights): if ANOTHER layer (flights,
    // military, …) grabs the follow-camera, drop our tracking so the orbit ring /
    // tracked entity don't orphan — without touching viewer.trackedEntity (the
    // new owner controls it). Guarded so our OWN switch (viewer.trackedEntity
    // briefly undefined mid-_trackSatellite) doesn't self-clear.
    if (!layerState._trackedEntityChangedRemove) {
      layerState._trackedEntityChangedRemove =
        viewer.trackedEntityChanged.addEventListener(() => {
          if (!layerState._enabled) return;
          if (
            layerState._trackedNorad &&
            layerState._viewer &&
            layerState._viewer.trackedEntity &&
            layerState._viewer.trackedEntity !== layerState._trackedEntity
          ) {
            parts.tracking._clearTracking(true, {
              origin:
                layerState._viewer.trackedEntity?.gevSelectionOrigin ||
                'programmatic',
            });
          }
        });
    }

    layerState._clickHandler = new Cesium.ScreenSpaceEventHandler(
      viewer.scene.canvas,
    );
    layerState._clickHandler.setInputAction(
      (click) => _handleClick(viewer, click),
      Cesium.ScreenSpaceEventType.LEFT_CLICK,
    );

    document.addEventListener('keydown', _onKeyDown);
  }
  return { _onKeyDown, _installClickHandler, _handleClick };
}
