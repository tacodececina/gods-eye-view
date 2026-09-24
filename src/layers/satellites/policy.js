import * as Cesium from 'cesium';
import { satelliteClassColor } from '../../data/satelliteClass.js';

/**
 * Satellite Orbits — Real-time positions via CelesTrak TLE + SGP4 propagation.
 *
 * Loads six CelesTrak groups (~840 sats): stations, visual, GPS, GLONASS,
 * Galileo, and the geosynchronous belt. Optional dense mode (setParams
 * catalog:'dense') adds the Starlink shell as points-only extras.
 * Renders positions via PointPrimitiveCollection, orbital paths as polylines.
 * Click any satellite to track it with camera follow + orbital path.
 *
 * ISS gets special treatment: larger point, persistent host label, path shown by default.
 */

export const ISS_NORAD = 25544;

export const ISS_OVERLAY_SOURCE_ID = 'satellites-iss';

export const ISS_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: 1,
  collisionCapacity: 1,
  moving: true,
  solveIntervalMs: 125,
});

export const ORBIT_PATH_STEPS = 180;
// points per orbital path

export const POSITION_UPDATE_MS = 1000;
// re-propagate every 1s (SGP4 is smooth at this rate)

export const RING_ROTATION_MS = 1000;
// re-align baked orbit rings to current GMST every 1s

/**
 * CelesTrak groups loaded as the core catalog, in dedupe-priority order:
 * a satellite that appears in multiple groups keeps the FIRST (most specific)
 * tag. `path` is the upstream GROUP name forwarded by the /api/celestrak
 * proxy; `tag` is the internal group key used for POINT_STYLES lookup.
 * Note: CelesTrak's GLONASS group is named 'glo-ops' (not
 * 'glonass-operational' — that name 404s upstream).
 * 'cubesat' (P4) sits right after 'stations': a docked or station-listed
 * object keeps its station tag, and only members of this group can receive the
 * CubeSat 1U family model (never by name, never from 'stations').
 */

export const CATALOG_GROUPS = [
  { tag: 'stations', path: 'stations' },
  { tag: 'cubesat', path: 'cubesat' },
  { tag: 'visual', path: 'visual' },
  { tag: 'gps-ops', path: 'gps-ops' },
  { tag: 'glonass', path: 'glo-ops' },
  { tag: 'galileo', path: 'galileo' },
  { tag: 'geo', path: 'geo' },
];

/**
 * Element-set wire format requested per catalog (P4 T1). Core groups ask the
 * proxy for CelesTrak OMM JSON (FORMAT=json): it carries the exact NORAD
 * number (six digits included) and an ISO epoch. The dense Starlink shell stays
 * on legacy TLE text: ~10K records are parsed in chunks and the TLE body is
 * roughly a third of the JSON size. The source reports the format it actually
 * received, so a proxy that ignores FORMAT still parses as TLE.
 */

export const CORE_ELEMENT_FORMAT = 'omm';

export const DENSE_ELEMENT_FORMAT = 'tle';

/**
 * Orbital element age thresholds (P4 T1), measured from the element EPOCH —
 * never from the cache fetch time or TTL. SGP4 error grows fastest in LEO
 * (drag), so the regime split is by mean motion: above 11.25 rev/day
 * (period < 128 min) is LEO. Age < FRESH → 'vigente'; age > EXPIRED →
 * 'caducada'; in between → 'envejecida'; epoch after now → 'futura'.
 */

export const SAT_ELEMENT_LEO_MIN_REV_PER_DAY = 11.25;

const ELEMENT_DAY_MS = 86_400_000;

export const SAT_ELEMENT_LEO_FRESH_MS = 3 * ELEMENT_DAY_MS;

export const SAT_ELEMENT_LEO_EXPIRED_MS = 14 * ELEMENT_DAY_MS;

export const SAT_ELEMENT_HIGH_FRESH_MS = 14 * ELEMENT_DAY_MS;

export const SAT_ELEMENT_HIGH_EXPIRED_MS = 60 * ELEMENT_DAY_MS;

// Dense-catalog mode (setParams({ catalog: 'dense' })): Starlink shell as
// points-only extras — no labels, no detection-overlay participation, and a
// relaxed propagation budget (round-robin, ~1/5 of core cadence per sat).

export const DENSE_GROUP_PATH = 'starlink';

export const DENSE_REFRESH_FRAMES = 300;
// full dense pass spread over ~300 frames (~5s @ 60fps)

export const DENSE_CREATE_CHUNK = 1500;
// satrec builds per macro-task while loading

/**
 * Tracked-entity camera offset, east-north-up meters (Entity.viewFrom).
 * Magnitude ≈ 726 km — the user-validated "slightly zoomed out" framing for
 * LEO: far enough that per-frame satellite motion doesn't stutter the camera
 * or smear the label, with +Z biasing the view down onto the satellite.
 * High orbits (MEO nav / GEO belt) scale this up so the ring stays in frame.
 */

export const TRACK_VIEW_FROM_LEO = new Cesium.Cartesian3(
  -450000,
  -450000,
  350000,
);

export const HIGH_ORBIT_ALTITUDE_M = 2000000;

export const TRACK_VIEW_FROM_HIGH_SCALE = 4;
// ≈ 2900 km back for MEO/GEO

/**
 * Shared per-group point styling — single source of truth used by BOTH the
 * creation site (update) and tracking restore (_clearTracking) so deselecting
 * a satellite never loses the original palette (WS-D3).
 *
 * Colors come from `satelliteClass.js` so the dot, the class label on the
 * card, and the legend swatch on the layer row can never disagree. Only
 * pixelSize/outline live here — those encode per-group prominence, not class.
 * Converted once at module load; per-point color is a plain primitive
 * attribute, so classification costs nothing per frame.
 */

export const POINT_OUTLINE = Cesium.Color.WHITE.withAlpha(0.3);

export const _classColor = (group) =>
  Cesium.Color.fromCssColorString(satelliteClassColor(group));

export const POINT_STYLES = {
  // The ISS keeps its own long-standing red hero styling rather than the
  // STATION class color: it is the object most users open this layer for, it
  // carries a permanent name label, and its size/outline already set it apart.
  // Its card still reads "STATION · ISS", so the class stays legible.
  iss: {
    pixelSize: 12,
    color: Cesium.Color.fromCssColorString('#ff4444'),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 2,
  },
  stations: {
    pixelSize: 8,
    color: _classColor('stations'),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 0,
  },
  // CubeSats: small (the objects are 10 cm), mineral green of their class.
  cubesat: {
    pixelSize: 5,
    color: _classColor('cubesat'),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 0,
  },
  visual: {
    pixelSize: 6,
    color: _classColor('visual'),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 0,
  },
  // Nav constellations (GPS / GLONASS / Galileo) resolve to one shared NAV
  // color; 6px so the MEO shells read as clearly as the old visual group did.
  'gps-ops': {
    pixelSize: 6,
    color: _classColor('gps-ops'),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 0,
  },
  glonass: {
    pixelSize: 6,
    color: _classColor('glonass'),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 0,
  },
  galileo: {
    pixelSize: 6,
    color: _classColor('galileo'),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 0,
  },
  geo: {
    pixelSize: 5,
    color: _classColor('geo'),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 0,
  },
  // Dense-mode extras (Starlink): dim, small, points-only.
  dense: {
    pixelSize: 3,
    color: _classColor('dense').withAlpha(0.9),
    outlineColor: POINT_OUTLINE,
    outlineWidth: 0,
  },
};

/**
 * Physically DOCKED vehicles are separate real tracks sharing one position: the
 * station and everything berthed to it sit within metres of each other. Their
 * ambient labels therefore stack underneath the tracked card, which is what the
 * owner saw. This radius is deliberately tight — it must catch a docked stack
 * and nothing else, so an unrelated satellite in a similar orbit is never
 * suppressed. Formation-flying pairs are km apart; a docked stack is ~100 m.
 */

export const DOCKED_COMPANION_RADIUS_M = 2000;

/** The scan is O(points); the tracked label is rebuilt every frame, so throttle. */

export const DOCKED_SCAN_INTERVAL_MS = 1000;

/**
 * Shared-context refresh interval. The tracked satellite is re-propagated
 * every rendered frame; the voice context only needs to be current to about
 * the propagation cadence, so this refreshes on the same 1 s beat instead of
 * allocating a record 60 times a second.
 */

export const CONTEXT_REFRESH_INTERVAL_MS = 1000;

/**
 * Satellite model profiles (P4). 'std' desktop/GPD, 'low' coarse pointer or
 * small/low-memory devices, 'off' points only. Override: ?satModels=std|low|off.
 */

export const SAT_MODEL_PROFILE_NAMES = Object.freeze(['std', 'low', 'off']);

/**
 * Near-field model LOD (P4 T3), decided by projected diameter in CSS pixels
 * (see modelLod.js) with hysteresis: a model is added at ADD and kept until it
 * drops below KEEP. The tracked satellite needs only the pixel band; any other
 * satellite also needs the camera within ADD_M (kept until KEEP_M).
 * Provisional values from the approved proposal §5; T7 calibrates them on the
 * GPD and records the evidence path next to each change.
 */

export const SAT_MODEL_TRACKED_ADD_PX = 6;

export const SAT_MODEL_TRACKED_KEEP_PX = 3;

export const SAT_MODEL_SECONDARY_ADD_PX = 16;

export const SAT_MODEL_SECONDARY_KEEP_PX = 10;

export const SAT_MODEL_SECONDARY_ADD_M = 25000;

export const SAT_MODEL_SECONDARY_KEEP_M = 30000;

/** Model admission/eviction reconcile cadence; pose still updates per frame. */

export const SAT_MODEL_RECONCILE_MS = 250;

/** Leaving the band evicts after this delay (target change/disable: at once). */

export const SAT_MODEL_EVICT_DEBOUNCE_MS = 2000;

/** Device signals that select the 'low' profile when no override is given. */

export const SAT_MODEL_LOW_MAX_VIEWPORT_PX = 650;

export const SAT_MODEL_LOW_MAX_DEVICE_MEMORY_GB = 4;

/**
 * Per-URI load failure veto (mirror of flights TRACKED_MODEL_MAX_LOAD_FAILS):
 * after this many failed loads (404, network, Draco/glTF decode) the URI is
 * vetoed for the session and the satellite stays an SGP4 point. A failed
 * URI is retried no sooner than SAT_MODEL_RETRY_BACKOFF_MS.
 */

export const SAT_MODEL_MAX_LOAD_FAILS = 3;

export const SAT_MODEL_RETRY_BACKOFF_MS = 1500;

/**
 * Conditional credit for the curated NASA 3D Resources models: registered on
 * the first satellite model-ready and retired when no model is active
 * (public/models/README.md and the manifest `credit` field).
 */

export const SAT_MODEL_CREDIT = Object.freeze({
  key: 'nasa-3d-resources',
  html:
    'Satellite models: Source: ' +
    '<a href="https://github.com/nasa/NASA-3D-Resources" target="_blank" rel="noopener">NASA 3D Resources</a>',
});

/** Curated satellite model manifest (public/models/satellites/manifest.json). */

export const SAT_MODEL_MANIFEST_URI = '/models/satellites/manifest.json';
