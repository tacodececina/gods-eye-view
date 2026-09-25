import { normalizeNoradId } from './elements.js';
import { SAT_MODEL_PROFILES, assetFitsProfile } from './modelBudget.js';

/**
 * Curated satellite geometry registry (P4 T2). Assets come from
 * public/models/satellites/manifest.json and are resolved by exact NORAD id
 * (specific) or exact catalog group (family) — never by name. No asset means
 * null: the satellite stays an SGP4 point.
 */

const LOCAL_URI = /^\/models\/satellites\/[a-z0-9][a-z0-9._-]*\.glb$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_REVISION = /^[0-9a-f]{40}$/;
const AXES = new Set(['+X', '-X', '+Y', '-Y', '+Z', '-Z']);
const FIDELITIES = new Set(['specific', 'family']);
const ATTITUDE_MODES = new Set(['lvlh-nominal', 'desconocida-ilustrativa']);

const nonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;
const positiveFinite = (value) => Number.isFinite(value) && value > 0;

function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const clean = url.protocol === 'https:' && !url.username && !url.password;
    return clean ? url : null;
  } catch {
    return null;
  }
}

function exactNoradIds(ids) {
  return Array.isArray(ids) && ids.every((id) => normalizeNoradId(id) === id);
}

function identityCheck(asset) {
  if (asset.fidelity === 'specific') {
    if (!exactNoradIds(asset.noradIds) || asset.noradIds.length === 0)
      return 'noradIds must list exact NORAD integers for a specific asset';
    return null;
  }
  if (!Array.isArray(asset.noradIds) || asset.noradIds.length > 0)
    return 'noradIds must be empty for a family asset';
  const families = asset.families;
  if (!Array.isArray(families) || families.length === 0)
    return 'families must list catalog groups for a family asset';
  return families.every(nonEmptyString)
    ? null
    : 'families must be nonempty group tags';
}

/** Ordered [check, reason] pairs; the first failing check names the field. */
const FIELD_CHECKS = [
  [(a) => nonEmptyString(a.id), 'id must be a nonempty string'],
  [
    (a) => LOCAL_URI.test(a.uri ?? ''),
    'uri must be a local /models/satellites/*.glb path',
  ],
  [
    (a) => typeof a.sha256 === 'string' && SHA256.test(a.sha256),
    'sha256 must be 64 lowercase hex',
  ],
  [
    (a) => Number.isSafeInteger(a.bytes) && a.bytes > 0,
    'bytes must be a positive integer',
  ],
  [
    (a) => GIT_REVISION.test(a.sourceRevision ?? ''),
    'sourceRevision must be a 40-hex commit',
  ],
  [
    (a) =>
      httpsUrl(a.sourceUrl)?.pathname.includes(`/${a.sourceRevision}/`) ===
      true,
    'sourceUrl must be https and pinned to sourceRevision',
  ],
  [(a) => httpsUrl(a.termsUrl) !== null, 'termsUrl must be an https URL'],
  [(a) => nonEmptyString(a.credit), 'credit must be a nonempty string'],
  [(a) => positiveFinite(a.scaleMeters), 'scaleMeters must be > 0'],
  [(a) => positiveFinite(a.radiusM), 'radiusM must be > 0'],
  [(a) => AXES.has(a.forwardAxis), 'forwardAxis must be one of ±X, ±Y, ±Z'],
  [(a) => AXES.has(a.upAxis), 'upAxis must be one of ±X, ±Y, ±Z'],
  [
    (a) => a.forwardAxis[1] !== a.upAxis[1],
    'axes: forwardAxis and upAxis must be different axes',
  ],
  [(a) => FIDELITIES.has(a.fidelity), 'fidelity must be specific or family'],
  [
    (a) => ATTITUDE_MODES.has(a.attitudeMode),
    'attitudeMode must be lvlh-nominal or desconocida-ilustrativa',
  ],
];

/**
 * Validate one manifest descriptor.
 * @param {unknown} asset
 * @returns {{ok: boolean, reason: string|null}}
 */
export function validateSatelliteModelAsset(asset) {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset))
    return { ok: false, reason: 'asset must be an object' };
  for (const [check, reason] of FIELD_CHECKS) {
    if (!check(asset)) return { ok: false, reason };
  }
  const identity = identityCheck(asset);
  return identity
    ? { ok: false, reason: identity }
    : { ok: true, reason: null };
}

function decodeManifest(json) {
  let records = json;
  if (typeof json === 'string') {
    try {
      records = JSON.parse(json);
    } catch {
      return { reason: 'manifest is not valid JSON' };
    }
  }
  if (!Array.isArray(records)) return { reason: 'manifest must be an array' };
  if (records.length === 0) return { reason: 'manifest is empty' };
  return { records };
}

function manifestConflict(asset, seen) {
  if (seen.ids.has(asset.id)) return `duplicate id ${asset.id}`;
  if (seen.uris.has(asset.uri)) return `duplicate uri ${asset.uri}`;
  for (const noradId of asset.noradIds) {
    const owner = seen.norads.get(noradId);
    if (owner) return `NORAD ${noradId} claimed by ${owner} and ${asset.id}`;
  }
  seen.ids.add(asset.id);
  seen.uris.add(asset.uri);
  for (const noradId of asset.noradIds) seen.norads.set(noradId, asset.id);
  return null;
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validate a whole manifest, fail-fast: one invalid entry rejects it all.
 * @param {string|unknown[]} json Manifest JSON text or decoded array.
 * @returns {{ok: boolean, assets: ReadonlyArray<object>, reason: string|null}}
 */
export function loadSatelliteManifest(json) {
  const fail = (reason) => ({ ok: false, assets: Object.freeze([]), reason });
  const decoded = decodeManifest(json);
  if (decoded.reason) return fail(decoded.reason);
  const seen = { ids: new Set(), uris: new Set(), norads: new Map() };
  for (const [index, asset] of decoded.records.entries()) {
    const label = `entry ${index} (${String(asset?.id ?? '?')})`;
    const verdict = validateSatelliteModelAsset(asset);
    if (!verdict.ok) return fail(`${label}: ${verdict.reason}`);
    const conflict = manifestConflict(asset, seen);
    if (conflict) return fail(`${label}: ${conflict}`);
  }
  const assets = decoded.records.map((asset) => structuredClone(asset));
  return { ok: true, assets: deepFreeze(assets), reason: null };
}

/** No profile means no budget filter; a named profile applies modelBudget. */
function profileAdmits(asset, profile) {
  if (profile === undefined || profile === null) return true;
  if (!Object.hasOwn(SAT_MODEL_PROFILES, profile))
    throw new TypeError(`Unknown satellite model profile: ${String(profile)}`);
  return assetFitsProfile(asset, SAT_MODEL_PROFILES[profile]);
}

/**
 * Resolve geometry for a catalog satellite. Precedence: specific (exact NORAD
 * id) > family (exact catalog group) > null. `name` is deliberately ignored.
 * @param {{noradId: unknown, group?: string, name?: string}} subject
 * @param {ReadonlyArray<object>} assets Assets from `loadSatelliteManifest`.
 * @param {{profile?: 'std'|'low'|'off'}} [options]
 * @returns {object|null} The asset descriptor, or null for point-only.
 */
export function resolveSatelliteModel(subject, assets, { profile } = {}) {
  const noradId = normalizeNoradId(subject?.noradId);
  const group = typeof subject?.group === 'string' ? subject.group : null;
  const usable = (assets ?? []).filter((asset) =>
    profileAdmits(asset, profile),
  );
  const specific =
    noradId === null
      ? null
      : usable.find(
          (asset) =>
            asset.fidelity === 'specific' && asset.noradIds.includes(noradId),
        );
  if (specific) return specific;
  if (group === null) return null;
  return (
    usable.find(
      (asset) => asset.fidelity === 'family' && asset.families.includes(group),
    ) ?? null
  );
}
