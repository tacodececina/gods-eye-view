import { classifyElementAge } from './elements.js';

/**
 * Flat, honest context fields for the tracked satellite (P4 T6). They join
 * the shared context record the dossier and the voice tools read, so every
 * value is a short string: no nested objects (the voice cleaner drops them)
 * and never an attitude number — attitude is a LABEL ('lvlh-nominal-aprox',
 * 'desconocida' or 'n/a'), because the pose is a nominal approximation, not
 * telemetry.
 */

const REV_PER_DAY_PER_RAD_PER_MIN = 1440 / (2 * Math.PI);

const ATTITUDE_LABELS = Object.freeze({
  'lvlh-nominal': 'lvlh-nominal-aprox',
  'desconocida-ilustrativa': 'desconocida',
});

/**
 * Property keys of the tracked satellite's context record, in publication
 * order. The first ones are what the voice payload keeps under its 12-field
 * cap (src/voice/gevActions.js compactProperties).
 */
export const SATELLITE_CONTEXT_KEYS = Object.freeze([
  'name',
  'operator',
  'noradId',
  'class',
  'altitude',
  'elementAge',
  'elementEpoch',
  'geometryFidelity',
  'attitude',
  'visualScale',
  'framing',
  'modelStatus',
  'elementFormat',
  'fetchedAt',
  'cacheStatus',
  'modelAsset',
]);

/**
 * @param {{satrec?: object, elementEpochMs?: number}|null} sat Catalog row.
 * @param {number} nowMs Wall clock (ms).
 * @returns {'vigente'|'envejecida'|'caducada'|'futura'|null}
 */
export function elementAgeOf(sat, nowMs) {
  return classifyElementAge({
    elementEpochMs: sat?.elementEpochMs,
    now: nowMs,
    meanMotionRevPerDay: Number(sat?.satrec?.no) * REV_PER_DAY_PER_RAD_PER_MIN,
  });
}

const isoOrEmpty = (ms) =>
  Number.isFinite(ms) ? new Date(ms).toISOString() : '';

/**
 * @param {object} input
 * @param {object|null} input.sat Catalog row (elementFormat, elementEpochMs,
 *   fetchedAt, cacheStatus, satrec).
 * @param {object|null} input.asset Resolved manifest asset, or null.
 * @param {string} input.modelStatus modelLifecycle status of this satellite.
 * @param {'orbit'|'inspect'} input.framing Tracked camera framing.
 * @param {number} input.nowMs Wall clock (ms).
 * @returns {Readonly<Record<string, string>>} Flat text fields.
 */
export function satelliteContextFields({
  sat,
  asset,
  modelStatus,
  framing,
  nowMs,
}) {
  return Object.freeze({
    elementAge: elementAgeOf(sat, nowMs) ?? '',
    elementEpoch: isoOrEmpty(sat?.elementEpochMs),
    geometryFidelity: asset?.fidelity ?? 'none',
    attitude: asset
      ? (ATTITUDE_LABELS[asset.attitudeMode] ?? 'desconocida')
      : 'n/a',
    visualScale: asset ? 'real' : 'n/a',
    framing,
    modelStatus: asset ? String(modelStatus || 'inactivo') : 'n/a',
    elementFormat: sat?.elementFormat ?? '',
    fetchedAt: isoOrEmpty(sat?.fetchedAt),
    cacheStatus: sat?.cacheStatus ?? '',
    modelAsset: asset?.id ?? '',
  });
}

/**
 * What the dossier must repaint for: a change here is announced with
 * gev:awareness-subject-updated; position-only changes are not.
 * @param {Record<string, string>} properties Context properties.
 * @returns {string}
 */
export function presentationSignature(properties) {
  return [
    'framing',
    'modelStatus',
    'geometryFidelity',
    'attitude',
    'elementAge',
    'cacheStatus',
  ]
    .map((key) => properties?.[key] ?? '')
    .join('|');
}
