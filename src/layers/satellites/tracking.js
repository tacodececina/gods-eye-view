import * as Cesium from 'cesium';
import { satelliteClassLabel } from '../../data/satelliteClass.js';
import { ISS_NORAD, CONTEXT_REFRESH_INTERVAL_MS } from './policy.js';
import { orbitViewFrom } from './framing.js';
import {
  editorialCardDetails,
  orbitPathLook,
  trackedCardLook,
  trackedPointColor,
} from './presentation.js';
import { createTrackingFraming } from './trackingFraming.js';
import {
  PROPAGATION_FAILED_STATUS,
  PROPAGATION_FAILED_TEXT,
  createTrackingPropagation,
} from './trackingPropagation.js';
import {
  presentationSignature,
  satelliteContextFields,
} from './contextFields.js';

/** Reset the P4 T5 framing/presentation state of a tracked subject. */
function resetFramingState(layerState) {
  layerState._trackedFraming = 'orbit';
  layerState._trackedOrbitViewFrom = null;
  layerState._framingTween = null;
  layerState._trackedHandoffKey = null;
  layerState._trackedCardClearance = null;
  layerState._trackedCardClearanceKey = null;
  layerState._presentationSignature = null;
}

export function createTracking({ state: layerState, services, parts, source }) {
  const { clearFocusTarget, publishFocusTargetFromCachedPosition } =
    services.focus;
  const {
    clearTrackedSubjectContext,
    getContextStore,
    refreshTrackedSubjectContext,
    selectTrackedSubjectContext,
  } = services.context;
  const { refreshTrackedReadout } = services.readout;
  // P4-20: an SGP4 failure republishes the card and the context at once.
  const propagation = createTrackingPropagation({
    layerState,
    parts,
    onChange: () => {
      _updateTrackedSatelliteLabelModel();
      _publishTrackedPresentation();
    },
  });

  function _normalizeTrackedNorad(candidate) {
    const numeric = Number(candidate);
    if (!Number.isFinite(numeric)) return null;
    const rounded = Math.trunc(numeric);
    return rounded > 0 ? rounded : null;
  }

  function _emitAwarenessEvent(type, detail) {
    if (
      typeof window === 'undefined' ||
      !window.dispatchEvent ||
      typeof CustomEvent === 'undefined'
    )
      return;
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function _applyPendingTrackingRestore() {
    const pending = layerState._pendingTrackingRestore;
    if (
      !pending ||
      pending.generation !== layerState._trackingIntentGeneration ||
      !layerState._enabled
    )
      return false;
    if (
      !layerState._viewer ||
      !layerState._catalog.has(pending.id) ||
      !layerState._points.has(pending.id)
    )
      return false;
    layerState._pendingTrackingRestore = null;
    _trackSatellite(pending.id, { origin: pending.origin });
    return layerState._trackedNorad === pending.id;
  }

  function _cancelPendingTrackingRestore() {
    layerState._trackingIntentGeneration += 1;
    layerState._pendingTrackingRestore = null;
  }

  /**
   * Detach the follow camera without deselecting the satellite (P3.1).
   *
   * Camera ownership and selection identity are separate authorities. A wheel,
   * drag or pinch means "I want the camera", never "forget who I was reading",
   * so this hands `trackedEntity` back and deliberately does NOT touch
   * `_trackedNorad`, the tracked entity, the orbit path, the shared context slot
   * or the pending-restore latch, and emits no
   * `gev:awareness-subject-cleared`. `_clearTracking` remains the one
   * destructive deselect.
   *
   * Another layer holding `trackedEntity` keeps it.
   *
   * @param {object} [options]
   * @param {string} [options.origin='programmatic'] - Diagnostic release origin.
   * @returns {boolean} Whether a selection survived the release.
   */

  function _releaseCameraOwnership({ origin = 'programmatic' } = {}) {
    void origin;
    if (layerState._trackedNorad === null) return false;
    if (
      layerState._viewer &&
      layerState._viewer.trackedEntity === layerState._trackedEntity
    )
      layerState._viewer.trackedEntity = undefined;
    return true;
  }

  /**
   * Re-follow the already-selected satellite after a camera release (SEGUIR).
   *
   * Refuses when the id is not the current selection, or when a different layer
   * owns the follow camera; a free camera is reclaimable.
   * @param {number|string} noradId - Target satellite.
   * @returns {boolean} Whether the follow camera was reattached.
   */

  function _refocusTracked(noradId) {
    const id = _normalizeTrackedNorad(noradId);
    if (
      id === null ||
      id !== layerState._trackedNorad ||
      !layerState._viewer ||
      !layerState._trackedEntity
    )
      return false;
    const cameraOwner = layerState._viewer.trackedEntity;
    if (cameraOwner && cameraOwner !== layerState._trackedEntity) return false;
    layerState._viewer.camera?.cancelFlight?.();
    layerState._viewer.trackedEntity = layerState._trackedEntity;
    return true;
  }

  /**
   * Stop tracking the currently followed satellite.
   * @param {boolean} [skipViewerUntrack=false] - When ANOTHER layer just grabbed
   *   the follow-camera (viewer.trackedEntityChanged), tear down our own state
   *   but do NOT clear viewer.trackedEntity — the new owner controls it now,
   *   and clearing it would yank the camera off their target (mirror of flights).
   */

  /**
   * Re-show the primitive (hidden while the tracked entity rendered the dot)
   * and restore the original group palette from the shared style table (WS-D3).
   * @param {number} noradId The satellite being released.
   */
  function _restoreTrackedPoint(noradId) {
    const lastPos = layerState._points.get(noradId);
    if (!lastPos) return;
    const style = parts.controls._pointStyleFor(
      noradId,
      layerState._catalog.get(noradId)?.group,
    );
    lastPos.show = true;
    lastPos.pixelSize = style.pixelSize;
    lastPos.color = style.color;
    lastPos.outlineColor = style.outlineColor;
    lastPos.outlineWidth = style.outlineWidth;
    lastPos.disableDepthTestDistance = 0;
  }

  /** Invalidate the per-frame tracked-position cache (WS-D2). */
  function _invalidateTrackedFrameCache() {
    layerState._trackedFrameNumber = -1;
    layerState._trackedFrameGeo = null;
    layerState._trackedFrameDateMs = Number.NaN;
    propagation.reset();
  }

  function _clearTracking(
    skipViewerUntrack = false,
    { origin = 'programmatic', keepModelOf = null } = {},
  ) {
    // Untracking dissolves the cluster: every companion returns to its own
    // ambient label on the next collection.
    layerState._dockedCompanions = new Set();
    layerState._lastDockedScanMs = Number.NEGATIVE_INFINITY;
    if (!layerState._trackedNorad) {
      clearFocusTarget('satellites');
      parts.labels._syncIssOverlay();
      return;
    }
    const clearedNorad = layerState._trackedNorad;
    clearFocusTarget('satellites', layerState._trackedNorad);
    // Target change: the old target's model leaves at once (P4), unless the
    // same satellite is being re-tracked.
    if (clearedNorad !== keepModelOf) parts.models.releaseTarget(clearedNorad);

    _restoreTrackedPoint(clearedNorad);
    _invalidateTrackedFrameCache();

    // Remove tracked entity and orbit path (unless ISS — keep its path)
    if (layerState._trackedNorad !== ISS_NORAD) {
      parts.rendering._hideOrbitPath(layerState._trackedNorad);
    }
    if (layerState._viewer && !skipViewerUntrack)
      layerState._viewer.trackedEntity = undefined;
    if (layerState._trackedEntity) {
      layerState._viewer.entities.remove(layerState._trackedEntity);
      layerState._trackedEntity = null;
    }
    layerState._trackedNorad = null;
    resetFramingState(layerState);
    parts.labels._syncIssOverlay();
    clearTrackedSubjectContext('satellites');
    layerState._contextRefreshedAtMs = 0;
    _emitAwarenessEvent('gev:awareness-subject-cleared', {
      layerId: 'satellites',
      id: clearedNorad,
      origin,
    });
  }

  /**
   * Get the tracked satellite's geodetic position, propagated at most once per
   * rendered frame (WS-D2). All tracked-satellite consumers (entity position
   * callback → camera, host model, point primitive, getTrackedInfo) share this
   * single `new Date()` epoch per frame, so they can never diverge by the old
   * 200ms throttle. The matching ECEF position is left in
   * `_trackedFrameCartesian`. SGP4 for one satellite per frame is cheap.
   * @returns {{ longitude: number, latitude: number, altitude: number }|null}
   */

  function _getTrackedFramePosition() {
    if (layerState._trackedNorad === null) return null;
    const sat = layerState._catalog.get(layerState._trackedNorad);
    if (!sat) return null;

    const frameNumber =
      layerState._viewer?.scene?.frameState?.frameNumber ?? -1;
    if (propagation.needsSample(frameNumber)) {
      const sampleDate = layerState._trackedFrameNowForTest
        ? new Date(layerState._trackedFrameNowForTest())
        : new Date();
      const pos = parts.orbits.propagatePosition(sat.satrec, sampleDate);
      // P4-20: no sample is no pose — never the last good one dressed as now.
      if (!pos) {
        propagation.markFailed(frameNumber);
        return null;
      }
      if (propagation.markRecovered()) layerState._contextRefreshedAtMs = 0;
      layerState._trackedFrameGeo = pos;
      // The tracked model's attitude re-derives velocity at this same epoch.
      layerState._trackedFrameDateMs = sampleDate.getTime();
      Cesium.Cartesian3.fromDegrees(
        pos.longitude,
        pos.latitude,
        pos.altitude,
        undefined,
        layerState._trackedFrameCartesian,
      );
      layerState._trackedFrameNumber = frameNumber;
      // Throttled inside; membership changes are rare, so resync the ISS ambient
      // gate only when the cluster actually changed.
      const clusterChanged = parts.labels._refreshDockedCompanions(
        layerState._trackedFrameNowForTest
          ? layerState._trackedFrameNowForTest()
          : Date.now(),
      );
      _updateTrackedSatelliteLabelModel();
      // The card and the context slot describe the same satellite — keep them
      // together so voice never narrates a fix the card has already replaced.
      _refreshTrackedSubjectContext();
      if (clusterChanged) parts.labels._syncIssOverlay();
      const name = sat.name?.trim() || `SAT-${layerState._trackedNorad}`;
      const altitudeText = `${Math.round(pos.altitude / 1000)} km · NORAD ${layerState._trackedNorad}`;
      const labelWidthPx =
        Math.max(name.length, altitudeText.length) * 7.8 + 20;
      const labelHeightPx = 2 * 13 + 12;
      const trackedPointDiameterPx = 14 + 4; // point plus its 2 px outline on both sides
      // Exact SGP4 frame cache only: dot, host readout, camera, and focus rectangle all
      // share one epoch, avoiding a second propagation phase and its old jitter.
      publishFocusTargetFromCachedPosition({
        ownerLayer: 'satellites',
        id: layerState._trackedNorad,
        scene: layerState._viewer?.scene,
        camera: layerState._viewer?.camera,
        displayPosition: layerState._trackedFrameCartesian,
        widthPx: Math.max(trackedPointDiameterPx, Math.min(260, labelWidthPx)),
        // Union of the 14 px point and the two-line label shifted 18 px upward.
        heightPx: trackedPointDiameterPx + 18 + labelHeightPx,
      });
    }
    return layerState._trackedFrameGeo;
  }

  /** Cached ECEF display point only; never propagates a fresh SGP4 sample. */

  function _trackedDisplayCached() {
    return layerState._trackedFrameGeo
      ? layerState._trackedFrameCartesian
      : null;
  }

  /**
   * Describe the tracked satellite for the shared context slot the voice tools
   * read. Values come from the live per-frame propagation, not a selection-time
   * snapshot, so a long follow never narrates a position the satellite has left.
   * @param {number} noradId Catalog identity.
   * @param {{latitude: number, longitude: number, altitude: number}|null} [position]
   *   Explicit position; defaults to the current per-frame propagation.
   * @returns {object|null} Context metadata, or null when the satellite is gone.
   */

  function _contextSubjectMetadata(noradId, position = null) {
    const sat = layerState._catalog.get(noradId);
    if (!sat) return null;
    const pos = position || _getTrackedFramePosition();
    // P4-20: a tracked subject whose SGP4 failed keeps its record, posless.
    const failed =
      !pos && noradId === layerState._trackedNorad && propagation.isFailed();
    if (!pos && !failed) return null;
    const name = sat.name?.trim() || `SAT-${noradId}`;
    const altitudeKm = Number.isFinite(pos?.altitude)
      ? Math.round(pos.altitude / 1000)
      : null;
    return {
      id: String(noradId),
      layerId: 'satellites',
      layerName: 'Satellites',
      source: 'CelesTrak',
      // SGP4 computes the position from published elements: nobody observed it.
      status: failed ? PROPAGATION_FAILED_STATUS : 'predicted',
      label: name,
      latitude: pos?.latitude ?? null,
      longitude: pos?.longitude ?? null,
      // Flat text only: the voice payload compacts properties through a string
      // cleaner that drops nested objects. Order: contextFields.js.
      properties: {
        name,
        operator: '',
        noradId: String(noradId),
        class: satelliteClassLabel(sat.group, { isIss: noradId === ISS_NORAD }),
        altitude:
          altitudeKm === null ? '' : `${altitudeKm.toLocaleString('en-US')} km`,
        ...satelliteContextFields({
          sat,
          asset: parts.models.assetFor(noradId),
          modelStatus: parts.models.statusOf(noradId),
          framing: layerState._trackedFraming,
          nowMs: Date.now(),
        }),
      },
    };
  }

  /**
   * Announce a presentation change of the tracked subject (framing, model
   * status, element age...) so the dossier re-reads its record. Position-only
   * refreshes stay silent: the dock must not repaint every second.
   * @param {object|null} metadata Freshly published context metadata.
   */
  function _announcePresentation(metadata) {
    if (!metadata) return;
    const signature = presentationSignature(metadata.properties);
    if (signature === layerState._presentationSignature) return;
    layerState._presentationSignature = signature;
    _emitAwarenessEvent('gev:awareness-subject-updated', {
      layerId: 'satellites',
      id: metadata.id,
    });
  }

  /** Republish the tracked subject now (framing or model state changed). */
  function _publishTrackedPresentation() {
    if (layerState._trackedNorad === null) return;
    layerState._contextRefreshedAtMs = 0;
    _refreshTrackedSubjectContext();
  }

  /**
   * Reconcile the published subject with a freshly rebuilt catalog.
   *
   * A rebuild (dense↔core toggle, TLE refresh) clears and repopulates the
   * catalog, so the tracked satellite's entry is a NEW object with a new satrec.
   * A surviving subject is simply re-resolved against it. A subject that is GONE
   * must release the slot: the per-frame refresh cannot do this itself, because
   * `_getTrackedFramePosition` returns early once the satellite has no catalog
   * entry — so without this the record would linger and voice would narrate a
   * satellite the catalog no longer carries, frozen at its last position.
   *
   * Releasing is gated on PROOF. The subject is preserved unless it is absent
   * from a catalog that is both complete (`accepted`, no failed CelesTrak group)
   * and applicable (dense settled, when dense is the requested catalog). A
   * partial refresh, a failed dense load, or an empty catalog is unproven
   * absence, and unproven absence is not absence — the same honesty rule the
   * tracking-restore path already applies.
   * @returns {Promise<void>} Resolves once the applicable catalog has settled.
   */

  async function _reconcileTrackedSubjectContext() {
    const subjectAtStart = layerState._trackedNorad;
    if (subjectAtStart === null) return;
    // Dense extras land AFTER the core rebuild resolves. Deciding before they
    // settle called a dense subject missing and deleted its record; the record
    // then stayed gone, because a refresh can update an existing record but
    // cannot recreate one.
    const denseSettlement =
      layerState._params.catalog === 'dense'
        ? layerState._denseLoadPromise
        : null;
    if (denseSettlement) {
      try {
        await denseSettlement;
      } catch {
        // A failed dense load proves nothing about the subject; fall through and
        // let the outcome check below preserve it.
      }
    }
    // The operator may have moved on while we waited.
    if (layerState._trackedNorad !== subjectAtStart) return;

    const metadata = _contextSubjectMetadata(subjectAtStart);
    if (metadata) {
      const store = getContextStore();
      const key = String(subjectAtStart);
      if (store.entities.has(key)) {
        refreshTrackedSubjectContext(metadata);
      } else if (!store.selectedEntityId) {
        // The record was dropped while the subject was briefly unresolvable.
        // Restore it — but only into an EMPTY slot: a satellite reappearing must
        // never yank the subject away from something the operator selected since.
        selectTrackedSubjectContext(metadata);
      }
      layerState._contextRefreshedAtMs = Date.now();
      return;
    }

    // Absence only counts when EVERY catalog that could carry the subject
    // actually loaded. Unproven absence is not absence — the same honesty rule
    // the tracking-restore path applies.
    //
    // Deliberately NOT scoped to the group the subject was last seen in:
    // CelesTrak reclassifies satellites between groups, so a subject missing
    // from its old group may simply have moved to one that failed this refresh.
    // Believing the old group alone would drop it. Any failed or empty group is
    // therefore a reason to wait — and `accepted` already means every group
    // returned entries.
    if (layerState._catalog.size === 0) return;
    if (layerState._lastTrackingRefreshOutcome?.status !== 'accepted') return;
    // Dense is a potential carrier too whenever it was REQUESTED — and the
    // request is read from `denseSettlement`, captured before the await, not
    // from `_params.catalog` now. A failed dense load reverts the mode to 'core'
    // as part of settling (an ACTIVE chip over an empty sky would be a lie), so
    // by the time we get here the intent that made dense a carrier has been
    // erased. Re-reading it would skip this guard on exactly the runs that need
    // it and delete a subject the dense catalog might have carried.
    if (denseSettlement && layerState._denseStatus !== 'ready') return;
    clearTrackedSubjectContext('satellites');
    layerState._contextRefreshedAtMs = 0;
  }

  /**
   * Keep the shared context slot current with the tracked satellite, on the
   * propagation beat rather than the frame clock.
   * @returns {void}
   */

  function _refreshTrackedSubjectContext() {
    if (layerState._trackedNorad === null) return;
    const now = Date.now();
    if (now - layerState._contextRefreshedAtMs < CONTEXT_REFRESH_INTERVAL_MS)
      return;
    layerState._contextRefreshedAtMs = now;
    const metadata = _contextSubjectMetadata(layerState._trackedNorad);
    refreshTrackedSubjectContext(metadata);
    _announcePresentation(metadata);
  }

  function _updateTrackedSatelliteLabelModel(fallbackAltitudeM = null) {
    if (!layerState._trackedEntity || layerState._trackedNorad === null) return;
    const sat = layerState._catalog.get(layerState._trackedNorad);
    const title = sat?.name?.trim() || `SAT-${layerState._trackedNorad}`;
    const altitudeM =
      layerState._trackedFrameGeo?.altitude ?? fallbackAltitudeM;
    const detail = propagation.isFailed()
      ? `${PROPAGATION_FAILED_TEXT} · NORAD ${layerState._trackedNorad}`
      : `${Number.isFinite(altitudeM) ? Math.round(altitudeM / 1000) : '?'} km · NORAD ${layerState._trackedNorad}`;
    // Class leads the detail block: it is what tells the operator WHAT they are
    // looking at, and it stays readable under the IR styles that flatten the
    // dot colors to a single channel (the card is painted above post-FX).
    const details = [
      satelliteClassLabel(sat?.group, {
        isIss: layerState._trackedNorad === ISS_NORAD,
      }),
      detail,
    ];
    // Docked companions are consolidated onto the tracked card as SECONDARY info
    // instead of competing with it as separate ambient labels. Identities are
    // preserved: the catalog is untouched and every companion returns to its own
    // label the moment the cluster is no longer tracked.
    const companions = parts.labels._dockedCompanionNames();
    if (companions.length > 0) {
      const extra = companions.length - 1;
      details.push(
        `DOCKED · ${companions[0]}${extra > 0 ? ` · +${extra}` : ''}`,
      );
    }
    const look = trackedCardLook(layerState._presentation);
    const shown = look.typeface ? editorialCardDetails(details) : details;
    const current = layerState._trackedEntity.gevLabelModel;
    // Over a drawn model the card clears its projected hull (P4 T7).
    const clearance = layerState._trackedCardClearance;
    // Compare the WHOLE detail array: comparing only `details[0]` swallowed any
    // change confined to the companions line, so the card would never republish.
    const unchanged =
      current?.gapPx === clearance?.gapPx &&
      current?.title === title &&
      current?.details?.length === shown.length &&
      shown.every((line, index) => current.details[index] === line);
    if (unchanged) return;
    layerState._trackedEntity.gevLabelModel = {
      title,
      details: shown,
      ...look,
      ...clearance,
    };
    refreshTrackedReadout(layerState._trackedEntity);
  }

  /**
   * Claim the shared context slot for a newly tracked satellite. The selection
   * event already carries this presentation, so its signature is recorded
   * without announcing an update.
   */
  function _selectTrackedSubject(noradId, initialPos) {
    const metadata = _contextSubjectMetadata(noradId, initialPos);
    selectTrackedSubjectContext(metadata);
    layerState._presentationSignature = metadata
      ? presentationSignature(metadata.properties)
      : null;
    layerState._contextRefreshedAtMs = Date.now();
  }

  function _trackSatellite(noradId, { origin = 'programmatic' } = {}) {
    _clearTracking(false, { origin, keepModelOf: noradId });

    const point = layerState._points.get(noradId);
    const sat = layerState._catalog.get(noradId);
    if (!point || !sat) return;

    layerState._trackedNorad = noradId;
    layerState._trackedFrameNumber = -1;
    layerState._trackedFrameGeo = null;
    propagation.reset();
    parts.labels._syncIssOverlay();

    // Hide the primitive — the tracked ENTITY renders the dot below. The
    // entity must own a point graphic so the Viewer's tracking camera can
    // resolve a bounding sphere and engage viewFrom (a label-only entity
    // left the camera stranded; this mirrors the proven flights pattern).
    point.show = false;

    // Show orbital path
    parts.rendering._showOrbitPath(
      noradId,
      orbitPathLook(layerState._presentation, {
        iss: noradId === ISS_NORAD,
        tracked: true,
      }),
    );

    // Tracked entity position propagates per evaluation through the per-frame
    // cache (WS-D2) — dot, host readout, and camera share one SGP4 epoch per frame.
    // If SGP4 fails there is no position (P4-20): the dot is not drawn at a
    // stale pose; the card and the dossier say «propagación falló».
    const positionProperty = new Cesium.CallbackProperty(() => {
      const pos = _getTrackedFramePosition();
      return pos ? layerState._trackedFrameCartesian : undefined;
    }, false);

    const name = sat.name.trim();

    // Comfortable tracking landing: ~726 km back for LEO (user-validated
    // "slightly zoomed out" framing — no stutter, label reads cleanly), scaled
    // up for MEO/GEO so the camera doesn't land on top of a high-orbit dot.
    const initialPos = parts.orbits.propagatePosition(sat.satrec, new Date());
    const viewFrom = orbitViewFrom(initialPos?.altitude);
    // A new target always lands in orbit framing (P4 T5).
    resetFramingState(layerState);
    layerState._trackedOrbitViewFrom = Cesium.Cartesian3.clone(viewFrom);

    layerState._trackedEntity = layerState._viewer.entities.add({
      position: positionProperty,
      viewFrom,
      point: {
        pixelSize: 14,
        color: trackedPointColor(layerState._presentation),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    layerState._trackedEntity.gevSelectionOrigin = origin;
    layerState._trackedEntity.gevTrackedId = `satellites:${noradId}`;
    layerState._trackedEntity.gevDisplayPosition = _trackedDisplayCached;
    // The card welds to what is drawn (model or dot), not the advanced cache.
    layerState._trackedEntity.gevVisualPosition = parts.models.visualPosition;
    _updateTrackedSatelliteLabelModel(initialPos?.altitude ?? null);

    _emitAwarenessEvent('gev:awareness-subject-selected', {
      layerId: 'satellites',
      id: noradId,
      label: name,
      position: Cesium.Cartesian3.clone(point.position),
      origin,
    });
    _selectTrackedSubject(noradId, initialPos);

    layerState._viewer.trackedEntity = layerState._trackedEntity;
    // P4: reconcile at once for the new target and warm its model bytes.
    parts.models.prepareTarget(noradId);
    console.log(`[Data:Satellites] Tracking ${name} (NORAD ${noradId})`);
  }
  const framingParts = createTrackingFraming({
    layerState,
    parts,
    publishPresentation: _publishTrackedPresentation,
  });

  return {
    ...framingParts,
    _publishTrackedPresentation,
    _normalizeTrackedNorad,
    _emitAwarenessEvent,
    _applyPendingTrackingRestore,
    _cancelPendingTrackingRestore,
    _clearTracking,
    _releaseCameraOwnership,
    _refocusTracked,
    _getTrackedFramePosition,
    _trackedDisplayCached,
    _contextSubjectMetadata,
    _reconcileTrackedSubjectContext,
    _refreshTrackedSubjectContext,
    _updateTrackedSatelliteLabelModel,
    _trackSatellite,
  };
}
