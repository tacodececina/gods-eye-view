import * as Cesium from 'cesium';
import { isPointerFree } from '../../data/inputOwnership.js';
import { PICK_STACK_LIMIT, resolveStackHost } from './pickHost.js';
import {
  HOVER_OVERLAY_SOURCE_ID,
  HOVER_OVERLAY_SOURCE_OPTIONS,
} from './policy.js';
import { createHoverLabel } from './hoverLabel.js';
import { EDITORIAL_SAT_COLORS, satelliteHoverEnabled } from './presentation.js';

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

  /**
   * Cross-layer untrack: only ANOTHER entity taking the follow camera clears
   * us. Our own reassignments (undefined → our entity, as a framing change or
   * SEGUIR does) never do.
   */
  function _onTrackedEntityChanged() {
    if (!layerState._enabled) return;
    const owner = layerState._viewer?.trackedEntity;
    if (!layerState._trackedNorad || !owner) return;
    if (owner === layerState._trackedEntity) return;
    parts.tracking._clearTracking(true, {
      origin: owner.gevSelectionOrigin || 'programmatic',
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
    // The model loads with allowPicking:false, so a click on the tracked
    // hull picks nothing: it is still the tracked satellite (P4 T5).
    if (!picked && parts.models?.screenHit?.(click.position)) return;
    if (pickedId === null) {
      _deselectUnlessSibling(picked);
      return;
    }
    const noradId = _resolveClickedNorad(viewer, click.position, pickedId);
    if (noradId === layerState._trackedNorad) return;
    parts.tracking._cancelPendingTrackingRestore();
    parts.tracking._trackSatellite(noradId, { origin: 'user' });
  }

  /** Rótulo del satélite bajo el ratón (piel Editorial, rótulos por intención). */
  function _hoverEntryFor(noradId) {
    if (noradId === layerState._trackedNorad) return null;
    const point = layerState._points.get(noradId);
    const sat = layerState._catalog.get(noradId);
    if (!point?.position || !sat || point.show === false) return null;
    return {
      id: String(noradId),
      position: () => layerState._points.get(noradId)?.position || null,
      variant: 'label',
      title: sat.name?.trim() || `SAT-${noradId}`,
      typeface: 'editorial',
      accent: EDITORIAL_SAT_COLORS.live,
      priority: 900,
      collisionGroup: 'ambient-label',
      paintLane: 'ambient-label',
      interactive: false,
      gapPx: 12,
      verticalOnly: true,
      placement: 'above',
      edgeFade: 'none',
      horizonCull: true,
      terrainOcclusion: false,
    };
  }

  function _installHover(viewer) {
    if (layerState._hover || !satelliteHoverEnabled(layerState._presentation))
      return;
    const canvas = viewer.scene.canvas;
    const host = layerState._overlayHost;
    const hover = createHoverLabel({
      pick: (x, y) =>
        layerState._enabled
          ? _pickedNorad(viewer.scene.pick(new Cesium.Cartesian2(x, y)))
          : null,
      entryFor: _hoverEntryFor,
      publish: (entries) => {
        host.setEntries(
          HOVER_OVERLAY_SOURCE_ID,
          entries,
          HOVER_OVERLAY_SOURCE_OPTIONS,
        );
        host.setVisible(HOVER_OVERLAY_SOURCE_ID, true);
      },
      clear: () => {
        host.clearSource(HOVER_OVERLAY_SOURCE_ID);
        host.setVisible(HOVER_OVERLAY_SOURCE_ID, false);
      },
    });
    const onMove = (event) =>
      hover.onPointerMove({
        pointerType: event.pointerType,
        x: event.offsetX,
        y: event.offsetY,
      });
    const onLeave = () => hover.reset();
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    layerState._hover = {
      reset: hover.reset,
      destroy() {
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerleave', onLeave);
        hover.destroy();
      },
    };
  }

  function _removeHover() {
    layerState._hover?.destroy();
    layerState._hover = null;
  }

  function _installClickHandler(viewer) {
    if (layerState._clickHandler) return; // already installed
    _installHover(viewer);

    // Cross-layer untrack (H2, mirror of flights): if ANOTHER layer (flights,
    // military, …) grabs the follow-camera, drop our tracking so the orbit ring /
    // tracked entity don't orphan — without touching viewer.trackedEntity (the
    // new owner controls it). Guarded so our OWN switch (viewer.trackedEntity
    // briefly undefined mid-_trackSatellite) doesn't self-clear.
    if (!layerState._trackedEntityChangedRemove) {
      layerState._trackedEntityChangedRemove =
        viewer.trackedEntityChanged.addEventListener(_onTrackedEntityChanged);
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
  return {
    _onKeyDown,
    _removeHover,
    _installClickHandler,
    _handleClick,
    _onTrackedEntityChanged,
  };
}
