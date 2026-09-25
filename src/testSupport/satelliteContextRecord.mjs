/**
 * The context record the satellites layer publishes for its tracked subject
 * (tracking.js _contextSubjectMetadata), built with the REAL flat-field
 * builder so UI tests read exactly what the layer writes (P4 T6).
 */
import { readFileSync } from 'node:fs';
import { twoline2satrec } from 'satellite.js';
import { satelliteContextFields } from '../layers/satellites/contextFields.js';
import { loadSatelliteManifest } from '../layers/satellites/modelRegistry.js';
import { elementEpochMs } from '../layers/satellites/elements.js';

export const SAT_MANIFEST = loadSatelliteManifest(
  readFileSync(
    new URL('../../public/models/satellites/manifest.json', import.meta.url),
    'utf8',
  ),
);

export const assetById = (id) =>
  SAT_MANIFEST.assets.find((asset) => asset.id === id) ?? null;

const SATREC = twoline2satrec(
  '1 25544U 98067A   26267.14191496  .00009634  00000+0  18116-3 0  9999',
  '2 25544  51.6318 170.3464 0004691 174.6338 185.4701 15.49258637587098',
);
export const SAT_EPOCH_MS = elementEpochMs(SATREC);

/**
 * @param {object} [options]
 * @param {string|null} [options.assetId] Manifest asset, or null (point only).
 * @param {string} [options.modelStatus]
 * @param {'orbit'|'inspect'} [options.framing]
 * @param {number} [options.ageMs] Wall clock minus element epoch.
 * @param {string} [options.cacheStatus]
 * @returns {object} Context-store record (without the carrier entity).
 */
export function satelliteRecord({
  noradId = 25544,
  name = 'ISS (ZARYA)',
  assetId = 'nasa-iss',
  modelStatus = 'inactivo',
  framing = 'orbit',
  ageMs = 3_600_000,
  cacheStatus = 'HIT',
} = {}) {
  const sat = {
    satrec: SATREC,
    elementFormat: 'omm',
    elementEpochMs: SAT_EPOCH_MS,
    fetchedAt: SAT_EPOCH_MS + 1_800_000,
    cacheStatus,
  };
  return {
    id: String(noradId),
    layerId: 'satellites',
    layerName: 'Satellites',
    source: 'CelesTrak',
    status: 'predicted',
    label: name,
    latitude: 30.2,
    longitude: -97.7,
    properties: {
      name,
      operator: '',
      noradId: String(noradId),
      class: 'Space station',
      altitude: '418 km',
      ...satelliteContextFields({
        sat,
        asset: assetId ? assetById(assetId) : null,
        modelStatus,
        framing,
        nowMs: SAT_EPOCH_MS + ageMs,
      }),
    },
    updatedAt: SAT_EPOCH_MS + ageMs,
  };
}
