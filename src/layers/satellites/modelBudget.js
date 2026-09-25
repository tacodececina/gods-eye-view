import {
  SAT_MODEL_LOW_MAX_DEVICE_MEMORY_GB,
  SAT_MODEL_LOW_MAX_VIEWPORT_PX,
  SAT_MODEL_PROFILE_NAMES,
} from './policy.js';

/**
 * Near-field model budget profiles (P4 T3, proposal §5). `cap` counts active
 * plus pending loads; the per-model limits apply to the manifest measurements
 * (triangles, primitives, textureMaxEdge, gpuBytesEstimate). MiB units match
 * the budget verdicts recorded in public/models/satellites/manifest.json.
 */

const MIB = 1024 * 1024;

export const SAT_MODEL_PROFILES = Object.freeze({
  std: Object.freeze({
    name: 'std',
    cap: 2,
    triangles: 60000,
    primitives: 12,
    textureMaxEdge: 1024,
    gpuBytes: 6 * MIB,
    totalGpuBytes: 10 * MIB,
  }),
  low: Object.freeze({
    name: 'low',
    cap: 1,
    triangles: 30000,
    primitives: 8,
    textureMaxEdge: 512,
    gpuBytes: 2 * MIB,
    totalGpuBytes: 2 * MIB,
  }),
  off: Object.freeze({
    name: 'off',
    cap: 0,
    triangles: 0,
    primitives: 0,
    textureMaxEdge: 0,
    gpuBytes: 0,
    totalGpuBytes: 0,
  }),
});

const isProfileName = (value) => SAT_MODEL_PROFILE_NAMES.includes(value);

/**
 * Read a strict `satModels=std|low|off` override from a query string.
 * @param {string|undefined|null} search e.g. `location.search`.
 * @returns {'std'|'low'|'off'|null}
 */
export function profileOverrideFromSearch(search) {
  const value = new URLSearchParams(String(search ?? '')).get('satModels');
  return isProfileName(value) ? value : null;
}

/**
 * Pick the model profile: a valid override wins; otherwise a coarse pointer,
 * a viewport <= 650 px or deviceMemory <= 4 GB selects 'low', else 'std'.
 * @param {{override?: string|null, coarsePointer?: boolean,
 *   viewportWidth?: number, deviceMemory?: number}} signals
 * @returns {Readonly<object>} One of SAT_MODEL_PROFILES.
 */
export function selectProfile({
  override = null,
  coarsePointer = false,
  viewportWidth,
  deviceMemory,
} = {}) {
  if (isProfileName(override)) return SAT_MODEL_PROFILES[override];
  const small =
    Number.isFinite(viewportWidth) &&
    viewportWidth <= SAT_MODEL_LOW_MAX_VIEWPORT_PX;
  const lowMemory =
    Number.isFinite(deviceMemory) &&
    deviceMemory <= SAT_MODEL_LOW_MAX_DEVICE_MEMORY_GB;
  return coarsePointer === true || small || lowMemory
    ? SAT_MODEL_PROFILES.low
    : SAT_MODEL_PROFILES.std;
}

const within = (value, limit) => Number.isFinite(value) && value <= limit;

/**
 * Whether an asset may load under a profile. A recorded 'no-model' decision
 * always excludes it and an 'exception-accepted' decision admits it (the
 * exceedance stays recorded in the manifest); otherwise every measurement
 * must be present and within the profile's per-model limits.
 * @param {object} asset Manifest descriptor.
 * @param {Readonly<object>} profile One of SAT_MODEL_PROFILES.
 * @returns {boolean}
 */
export function assetFitsProfile(asset, profile) {
  if (!profile || profile.cap <= 0) return false;
  const decision = asset?.budget?.[profile.name]?.decision;
  if (decision === 'no-model') return false;
  if (decision === 'exception-accepted') return true;
  return (
    within(asset?.triangles, profile.triangles) &&
    within(asset?.primitives, profile.primitives) &&
    within(asset?.textureMaxEdge, profile.textureMaxEdge) &&
    within(asset?.gpuBytesEstimate, profile.gpuBytes)
  );
}
