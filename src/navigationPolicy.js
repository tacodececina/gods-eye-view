/**
 * Camera-ownership policy for explicit and deferred navigation.
 *
 * Immediate destinations refuse Cockpit before mutation, then stamp, release,
 * and fly. Deferred destinations stamp without releasing; after resolution
 * they must recheck the stamp and Cockpit immediately before releasing and
 * flying.
 */

export const NAVIGATION_AUTHORITY_EVENT = 'gev:navigation-authority-taken';

export const NAVIGATION_PRIORITY = Object.freeze({
  incidental: 0,
  layerFit: 1,
  explicit: 2,
  human: 3,
});

export function cameraTargetIdentity(target = {}) {
  const layerId = String(target.layerId || '').trim();
  const id = String(target.id ?? '').trim();
  return layerId && id ? `${layerId}:${id}` : null;
}

export function layerVolumeNeedsFit(points = [], viewport = {}) {
  if (!Array.isArray(points) || points.length === 0) return false;
  const width = Number(viewport.width) || 0;
  const height = Number(viewport.height) || 0;
  const padding = viewport.padding || {};
  const left = Number(padding.left) || 0;
  const right = width - (Number(padding.right) || 0);
  const top = Number(padding.top) || 0;
  const bottom = height - (Number(padding.bottom) || 0);
  return points.some(
    (point) =>
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < left ||
      point.x > right ||
      point.y < top ||
      point.y > bottom,
  );
}

function normalizePose(pose = {}) {
  return {
    lat: Number(pose.lat) || 0,
    lon: Number(pose.lon) || 0,
    alt: Math.max(1_000, Number(pose.alt) || 1_000),
    heading: Number(pose.heading) || 0,
    pitch: Number.isFinite(Number(pose.pitch)) ? Number(pose.pitch) : -90,
    roll: Number(pose.roll) || 0,
  };
}

/** Pure target-change choreography. Every stage retains the exact target ID. */
export function planTargetCameraTransition({
  current,
  target,
  reducedMotion = false,
} = {}) {
  const from = normalizePose(current);
  const to = normalizePose(target);
  const targetId = String(target?.id ?? '') || null;
  if (reducedMotion) return [{ ...to, phase: 'final', duration: 0, targetId }];
  const pullbackAlt = Math.min(
    28_000_000,
    Math.max(from.alt, to.alt * 2.8, 3_200_000),
  );
  return [
    { ...from, alt: pullbackAlt, phase: 'pullback', duration: 0.42, targetId },
    { ...to, alt: pullbackAlt, phase: 'reframe', duration: 0.58, targetId },
    { ...to, phase: 'approach', duration: 0.72, targetId },
  ];
}

/**
 * Announce that a layer-owned camera flight is taking navigation authority.
 *
 * Aircraft focus reaches the stamp for free: it assigns `viewer.trackedEntity`,
 * and the UI stamps on `trackedEntityChanged`. Vessel and installation focus
 * fly the camera WITHOUT ever setting a tracked entity, so they have no such
 * seam — an earlier deferred geocode would still match the generation it
 * captured and could resolve on top of the new Context focus. This is that
 * missing seam, kept explicit so the flight and the stamp cannot drift apart.
 * @param {string} reason Diagnostic label for the taking path.
 * @param {object} [options] Authority options.
 * @param {EventTarget} [options.eventTarget=globalThis.window] Dispatch target.
 * @param {boolean} [options.cancelPendingSelection=true] Whether this is newer
 * direct intent that may supersede a passive selected-entity restore.
 * @returns {boolean} Whether the announcement was dispatched.
 */
export function announceNavigationAuthority(
  reason,
  { eventTarget = globalThis.window, cancelPendingSelection = true } = {},
) {
  if (typeof eventTarget?.dispatchEvent !== 'function') return false;
  eventTarget.dispatchEvent(
    new CustomEvent(NAVIGATION_AUTHORITY_EVENT, {
      detail: {
        reason: String(reason || 'layer-focus'),
        cancelPendingSelection: Boolean(cancelPendingSelection),
      },
    }),
  );
  return true;
}

/**
 * Register one authority listener and return an idempotent disposer.
 * @param {EventTarget} eventTarget Listener host.
 * @param {Function} listener Authority handler.
 * @returns {() => void} Idempotent disposer.
 */
export function registerNavigationAuthorityListener(eventTarget, listener) {
  if (
    !eventTarget?.addEventListener ||
    !eventTarget?.removeEventListener ||
    typeof listener !== 'function'
  )
    return () => {};
  eventTarget.addEventListener(NAVIGATION_AUTHORITY_EVENT, listener);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    eventTarget.removeEventListener(NAVIGATION_AUTHORITY_EVENT, listener);
  };
}

/**
 * Let a physical globe gesture supersede the delayed shared camera and Follow.
 * Ordinary layer visibility/options remain authoritative, but camera intent
 * from the recipient always wins over a passive selected-subject restore.
 * @param {Function} stamp Navigation stamp callback.
 * @returns {*} The callback result, when present.
 */
export function stampInitialShareGesture(stamp) {
  return stamp?.({ cancelPendingSelection: true });
}

/**
 * Run an immediate explicit camera navigation.
 * @param {Object} options
 * @returns {*} Navigation result, or false when disposed or Cockpit refuses.
 */
export function runExplicitNavigation({
  disposed = false,
  cockpitActive = false,
  noun = 'target',
  showToast,
  stamp,
  release,
  navigate,
} = {}) {
  if (disposed) return false;
  if (cockpitActive) {
    showToast?.(`Exit cockpit to fly to a ${noun}`);
    return false;
  }
  const generation = stamp?.();
  release?.();
  return navigate?.(generation);
}

/**
 * Accept a deferred navigation intent without releasing the current owner.
 * @param {Object} options
 * @returns {number|false} Generation stamp, or false when disposed or Cockpit refuses.
 */
export function beginDeferredNavigation({
  disposed = false,
  cockpitActive = false,
  noun = 'location',
  showToast,
  stamp,
} = {}) {
  if (disposed) return false;
  if (cockpitActive) {
    showToast?.(`Exit cockpit to fly to a ${noun}`);
    return false;
  }
  return stamp?.();
}

/**
 * Re-assert authority immediately before a deferred flight.
 * @param {Object} options
 * @returns {boolean} Whether the deferred flight still owns the camera.
 */
export function reassertNavigationHandoff({
  generation,
  currentGeneration,
  cockpitActive = false,
  disposed = false,
  showToast,
  release,
} = {}) {
  if (disposed || generation !== currentGeneration) return false;
  if (cockpitActive) {
    showToast?.('Exit cockpit to fly to a location');
    return false;
  }
  release?.();
  return true;
}
