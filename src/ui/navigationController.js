import { createStateChannel } from '../app/stateChannel.js';
import * as Cesium from 'cesium';
import {
  beginDeferredNavigation,
  layerVolumeNeedsFit,
  reassertNavigationHandoff,
  runExplicitNavigation,
} from '../navigationPolicy.js';

/** Own camera authority generations, pending search UI and tracking handoff. */
export class NavigationController {
  constructor({
    viewer,
    tracking,
    searchInput,
    interruptCameraMotion,
    isCockpitActive,
    clearLocation,
    cancelShareSelection,
    getDataManager,
    stopOrbit,
    showToast,
    cancelOrientation = () => {},
    prefersReducedMotion = () =>
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ===
      true,
    projectToWindow = Cesium.SceneTransforms.worldToWindowCoordinates,
  }) {
    Object.assign(this, {
      viewer,
      tracking,
      searchInput,
      interruptCameraMotion,
      isCockpitActive,
      clearLocation,
      cancelShareSelection,
      getDataManager,
      stopOrbit,
      showToast,
      cancelOrientation,
      prefersReducedMotion,
      projectToWindow,
    });
    this._navigationGeneration = 0;
    this._cameraHandoffs = createStateChannel(() => ({
      generation: this._navigationGeneration,
    }));
    this._activeLocationSearchGeneration = null;
    this._layerFitTimer = null;
    this._pendingLayerFit = null;
    this._lastLayerFitResult = null;
    this._disposed = false;
  }
  /**
   * @param {object} [options]
   * @param {boolean} [options.cancelPendingSelection=true] - Supersede camera
   *   claims that have not landed yet (share selection, deferred restores).
   * @param {boolean} [options.clearSearchedLocation=true] - Blank the free-text
   *   location readout.
   * @param {boolean} [options.clearSelectedIdentity=true] - Null the stable
   *   `selected*TrackingId` of layers that are not actively following. A
   *   physical gesture passes `false`: it takes the camera, not the selection
   *   (P3.1).
   */
  _stampNavigation({
    cancelPendingSelection = true,
    clearSearchedLocation = true,
    clearSelectedIdentity = true,
  } = {}) {
    this.cancelOrientation();
    const { flightsLayer, militaryFlightsLayer, satellitesLayer } =
      this.tracking;
    this._navigationGeneration += 1;
    this._cameraHandoffs?.publish();
    // A newer destination owns the camera, so the last free-text search is no
    // longer where we are. DEFERRED navigation opts out here and clears at the
    // reassert seam instead: a geocode that never resolves moves no camera, and
    // a lookup that fails must not blank a readout that is still true.
    if (clearSearchedLocation) this.clearLocation();
    if (cancelPendingSelection) {
      const passivelyClearedShareSelection = this.cancelShareSelection();
      try {
        flightsLayer.cancelPendingTrackingRestore?.();
      } catch {
        /* best effort */
      }
      try {
        militaryFlightsLayer.cancelPendingTrackingRestore?.();
      } catch {
        /* best effort */
      }
      try {
        satellitesLayer.cancelPendingTrackingRestore?.();
      } catch {
        /* best effort */
      }
      // A deliberate destination supersedes share-selected entities that have
      // not arrived yet. Active owners publish their clear when released.
      if (
        clearSelectedIdentity &&
        !passivelyClearedShareSelection &&
        !flightsLayer.getTrackedInfo?.()
      ) {
        this.getDataManager()?.setLayerParams(
          'flights',
          {
            selectedFlightsTrackingId: null,
          },
          { origin: 'tool' },
        );
      }
      if (
        clearSelectedIdentity &&
        !passivelyClearedShareSelection &&
        !militaryFlightsLayer.getTrackedInfo?.()
      ) {
        this.getDataManager()?.setLayerParams(
          'military',
          {
            selectedMilitaryTrackingId: null,
          },
          { origin: 'tool' },
        );
      }
      if (
        clearSelectedIdentity &&
        !passivelyClearedShareSelection &&
        !satellitesLayer.getTrackedInfo?.()
      ) {
        this.getDataManager()?.setLayerParams(
          'satellites',
          {
            selectedSatTrackingId: null,
          },
          { origin: 'tool' },
        );
      }
    }
    if (this._activeLocationSearchGeneration !== null) {
      this._settleLocationSearchUi(this._activeLocationSearchGeneration);
    }
    return this._navigationGeneration;
  }

  _settleLocationSearchUi(generation) {
    if (this._activeLocationSearchGeneration !== generation) return;
    this._activeLocationSearchGeneration = null;
    this.searchInput?.classList.remove('searching', 'expanded');
    if (this.searchInput) this.searchInput.value = '';
    this.searchInput?.blur();
  }

  _releaseFollowCamera({
    preserveVesselSelection = true,
    preserveCameraFlight = false,
    trackingOrigin = 'tool',
  } = {}) {
    const {
      flightsLayer,
      militaryFlightsLayer,
      satellitesLayer,
      aisLiveVesselsLayer,
      militaryAwarenessLayer,
      rocketLaunchesLayer,
    } = this.tracking;
    let contactSelected = false;
    try {
      contactSelected = Boolean(
        militaryAwarenessLayer.releaseCameraOwnership?.({
          preserveVesselSelection,
          origin: trackingOrigin,
        }),
      );
    } catch {
      try {
        flightsLayer.stopTracking?.({ origin: trackingOrigin });
      } catch {
        /* best-effort release */
      }
      try {
        militaryFlightsLayer.stopTracking?.({ origin: trackingOrigin });
      } catch {
        /* best-effort release */
      }
      if (!preserveVesselSelection) {
        try {
          aisLiveVesselsLayer.clearSelection?.();
        } catch {
          /* best-effort release */
        }
      }
    }
    try {
      satellitesLayer.stopTracking?.({ origin: trackingOrigin });
    } catch {
      /* best-effort release */
    }
    try {
      rocketLaunchesLayer.releaseCameraOwnership?.();
    } catch {
      /* best-effort release */
    }
    this.viewer.trackedEntity = undefined;
    this.interruptCameraMotion('explicit-navigation');
    this.stopOrbit();
    if (!preserveCameraFlight) this._settleInterruptedFlight();
    return contactSelected;
  }

  /**
   * Cancel a Cesium tween and immediately commit its current world-space view.
   * Reading the world basis before clearing the transform flushes the tween's
   * pending camera members; otherwise a wheel event in the same render turn can
   * reach ScreenSpaceCameraController with a zero cross-product axis.
   */
  _settleInterruptedFlight() {
    const camera = this.viewer.camera;
    let snapshot = null;
    try {
      const position = Cesium.Cartesian3.clone(camera.positionWC);
      const direction = Cesium.Cartesian3.clone(camera.directionWC);
      const up = Cesium.Cartesian3.clone(camera.upWC);
      const finite = (value) =>
        value &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        Number.isFinite(value.z) &&
        Cesium.Cartesian3.magnitudeSquared(value) > Cesium.Math.EPSILON15;
      if (finite(position) && finite(direction) && finite(up))
        snapshot = { position, direction, up };
    } catch {
      /* camera may already be tearing down */
    }
    camera.cancelFlight();
    try {
      camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      if (snapshot)
        camera.setView({
          destination: snapshot.position,
          orientation: {
            direction: snapshot.direction,
            up: snapshot.up,
          },
        });
    } catch {
      /* teardown race */
    }
  }

  _runExplicitNavigation(noun, navigate, releaseOptions = undefined) {
    return runExplicitNavigation({
      disposed: this._disposed,
      cockpitActive: this.isCockpitActive(),
      noun,
      showToast: (text) => this.showToast(text),
      stamp: () => this._stampNavigation(),
      release: () => this._releaseFollowCamera(releaseOptions),
      navigate,
    });
  }

  /** Change the viewing angle without clearing selection or follow ownership. */
  runOrientation(noun, navigate) {
    return runExplicitNavigation({
      disposed: this._disposed,
      cockpitActive: this.isCockpitActive(),
      noun,
      showToast: (text) => this.showToast(text),
      stamp: () =>
        this._stampNavigation({
          cancelPendingSelection: false,
          clearSearchedLocation: false,
        }),
      release: () => {
        this.interruptCameraMotion('camera-orientation');
        this.stopOrbit();
        this._settleInterruptedFlight();
      },
      navigate,
    });
  }

  /**
   * Detach every follow camera this app owns without deselecting anything.
   *
   * The gesture counterpart of `_releaseFollowCamera`. Camera ownership and
   * selection identity are separate authorities (P3.1): a wheel, drag or pinch
   * claims the camera, so each tracking layer is asked for its camera back
   * through `releaseCameraOwnership` — never `stopTracking`, which would clear
   * the shared context slot, emit the semantic clear the dossier listens to and
   * drop the stable id that SEGUIR needs. Vessel selection is left alone for the
   * same reason.
   *
   * Ordering matters: the follow must be released before the tween is
   * interrupted, because resetting the lookAt transform while an entity is
   * tracked flings the camera (see `interruptCameraMotion`).
   *
   * @param {object} [options]
   * @param {string} [options.origin='user'] - Diagnostic release origin.
   * @returns {boolean} Whether any semantic selection survived the release.
   */
  _releaseCameraOwnership({ origin = 'user' } = {}) {
    const {
      flightsLayer,
      militaryFlightsLayer,
      satellitesLayer,
      rocketLaunchesLayer,
    } = this.tracking;
    let selected = false;
    for (const layer of [flightsLayer, militaryFlightsLayer, satellitesLayer]) {
      try {
        if (layer?.releaseCameraOwnership?.({ origin })) selected = true;
      } catch {
        /* best-effort release */
      }
    }
    try {
      rocketLaunchesLayer.releaseCameraOwnership?.();
    } catch {
      /* best-effort release */
    }
    this.viewer.trackedEntity = undefined;
    this.interruptCameraMotion('human-gesture');
    this.stopOrbit();
    this._settleInterruptedFlight();
    return selected;
  }

  /** A physical gesture outranks every pending or followed camera owner. */
  interruptHumanNavigation(kind = 'gesture') {
    if (this._disposed || this.isCockpitActive()) return false;
    // A gesture still supersedes camera claims that have NOT landed yet (a
    // share restore still waiting for its contact to arrive), but it must not
    // touch selection identity that already exists on screen.
    const generation = this._stampNavigation({
      clearSearchedLocation: false,
      clearSelectedIdentity: false,
    });
    this._releaseCameraOwnership({ origin: 'user' });
    this._lastLayerFitResult = {
      status: 'cancelled-by-human',
      kind,
      generation,
    };
    return generation;
  }

  isCurrent(generation) {
    return !this._disposed && generation === this._navigationGeneration;
  }

  /** Play one cancelable target plan under a single navigation generation. */
  runCameraPlan(noun, stages = []) {
    if (!Array.isArray(stages) || stages.length === 0) return false;
    return this._runExplicitNavigation(noun, (generation) =>
      this._playCameraPlan(generation, stages),
    );
  }

  async _playCameraPlan(generation, stages) {
    for (const stage of stages) {
      if (!this.isCurrent(generation)) return { completed: false, stale: true };
      const options = {
        destination: Cesium.Cartesian3.fromDegrees(
          stage.lon,
          stage.lat,
          Math.max(1_000, stage.alt),
        ),
        orientation: {
          heading: Cesium.Math.toRadians(stage.heading ?? 0),
          pitch: Cesium.Math.toRadians(stage.pitch ?? -90),
          roll: Cesium.Math.toRadians(stage.roll ?? 0),
        },
      };
      if (!(stage.duration > 0)) {
        this.viewer.camera.setView(options);
        continue;
      }
      const completed = await new Promise((resolve) => {
        this.viewer.camera.flyTo({
          ...options,
          duration: stage.duration,
          easingFunction: stage.easing ?? Cesium.EasingFunction.CUBIC_IN_OUT,
          complete: () => resolve(true),
          cancel: () => resolve(false),
        });
      });
      if (!completed || !this.isCurrent(generation))
        return { completed: false, stale: true };
    }
    return {
      completed: true,
      generation,
      targetId: stages.at(-1)?.targetId || null,
    };
  }

  /**
   * Batch user layer activations and fit only when their accepted points do not
   * already fit. Feed refreshes never call this method, so they cannot fly.
   */
  requestLayerFit(layerId, rows = [], delayMs = 160) {
    if (
      this._disposed ||
      !['flights', 'satellites', 'traffic'].includes(layerId) ||
      !Array.isArray(rows)
    )
      return false;
    const positions = rows.map((row) => row?.position).filter(Boolean);
    if (positions.length === 0) {
      this._lastLayerFitResult = { status: 'no-data', layerId };
      return false;
    }
    const generation = this._navigationGeneration;
    if (
      !this._pendingLayerFit ||
      this._pendingLayerFit.generation !== generation
    )
      this._pendingLayerFit = {
        generation,
        layerIds: new Set(),
        positions: [],
      };
    this._pendingLayerFit.layerIds.add(layerId);
    this._pendingLayerFit.positions.push(...positions);
    clearTimeout(this._layerFitTimer);
    this._layerFitTimer = setTimeout(() => this._flushLayerFit(), delayMs);
    return true;
  }

  _flushLayerFit() {
    clearTimeout(this._layerFitTimer);
    this._layerFitTimer = null;
    const pending = this._pendingLayerFit;
    this._pendingLayerFit = null;
    if (!pending || !this.isCurrent(pending.generation)) {
      this._lastLayerFitResult = { status: 'stale' };
      return false;
    }
    const scene = this.viewer.scene;
    const screenPoints = pending.positions.map((position) =>
      this.projectToWindow(scene, position),
    );
    const canvas = scene.canvas;
    const padding = {
      left: Math.min(420, canvas.clientWidth * 0.3),
      right: Math.min(360, canvas.clientWidth * 0.26),
      top: 88,
      bottom: 112,
    };
    if (
      !layerVolumeNeedsFit(screenPoints, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        padding,
      })
    ) {
      this._lastLayerFitResult = {
        status: 'already-fits',
        layerIds: [...pending.layerIds],
      };
      return false;
    }
    const sphere = Cesium.BoundingSphere.fromPoints(pending.positions);
    if (!Number.isFinite(sphere.radius)) return false;
    const currentRange = Math.max(
      sphere.radius * 2.8,
      this.viewer.camera.distanceToBoundingSphere?.(sphere) || 0,
    );
    const offset = new Cesium.HeadingPitchRange(
      this.viewer.camera.heading || 0,
      Cesium.Math.toRadians(-38),
      currentRange,
    );
    const reducedMotion = this.prefersReducedMotion();
    const accepted = this._runExplicitNavigation('layer volume', () => {
      if (reducedMotion) {
        this.viewer.camera.viewBoundingSphere(sphere, offset);
        this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      } else {
        this.viewer.camera.flyToBoundingSphere(sphere, {
          offset,
          duration: 0.7,
          easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
        });
      }
      return true;
    });
    this._lastLayerFitResult = {
      status:
        accepted === false ? 'refused' : reducedMotion ? 'fitted' : 'fitting',
      layerIds: [...pending.layerIds],
      pointCount: pending.positions.length,
    };
    return accepted;
  }

  _beginDeferredNavigation(
    noun = 'location',
    { cancelPendingSelection = true } = {},
  ) {
    return beginDeferredNavigation({
      disposed: this._disposed,
      cockpitActive: this.isCockpitActive(),
      noun,
      showToast: (text) => this.showToast(text),
      // The searched-location readout survives the STAMP; only a flight that
      // actually starts invalidates it (see the release hook below).
      stamp: () =>
        this._stampNavigation({
          cancelPendingSelection,
          clearSearchedLocation: false,
        }),
    });
  }

  _reassertNavigationHandoff(generation) {
    return reassertNavigationHandoff({
      generation,
      currentGeneration: this._navigationGeneration,
      cockpitActive: this.isCockpitActive(),
      disposed: this._disposed,
      showToast: (text) => this.showToast(text),
      // Reached only once the handoff is granted, immediately before the
      // deferred flight starts — so a lookup that failed, was superseded, or
      // was refused by the cockpit leaves the old readout standing.
      release: () => {
        this.clearLocation();
        return this._releaseFollowCamera();
      },
    });
  }
  /** Subscribe to ownership changes without claiming the camera or exposing mutable state. */
  subscribeCameraHandoff(listener) {
    return this._cameraHandoffs.subscribe(listener, { emitCurrent: false });
  }
  stop() {
    this._disposed = true;
    clearTimeout(this._layerFitTimer);
    this._layerFitTimer = null;
    this._pendingLayerFit = null;
    this._cameraHandoffs?.publish();
    this._cameraHandoffs?.destroy();
  }
  destroy() {
    this.stop();
    this._stampNavigation();
  }
}
