import { classifyModelBand } from './modelLod.js';
import {
  SAT_MODEL_SECONDARY_ADD_M,
  SAT_MODEL_SECONDARY_ADD_PX,
  SAT_MODEL_SECONDARY_KEEP_M,
  SAT_MODEL_SECONDARY_KEEP_PX,
  SAT_MODEL_TRACKED_ADD_PX,
  SAT_MODEL_TRACKED_KEEP_PX,
} from './policy.js';

/**
 * Pure admission planning for near-field satellite models (P4 T4). models.js
 * measures candidates; this module decides which of them deserve a model.
 * Priority 1 is the eligible tracked satellite; priority 2 the nearest
 * eligible, on-screen secondaries. The cap counts active plus pending loads.
 */

/** Profiles that only ever model the tracked satellite (proposal §5). */
const TRACKED_ONLY_PROFILES = new Set(['low']);

/**
 * @param {{name: string}} profile One of SAT_MODEL_PROFILES.
 * @returns {boolean} Whether secondaries may receive a model.
 */
export function profileAllowsSecondaries(profile) {
  return Boolean(profile) && !TRACKED_ONLY_PROFILES.has(profile.name);
}

/**
 * Hysteretic band of the tracked satellite (pixel band only).
 * @param {{px: number, current: 'none'|'model'}} input
 * @returns {'none'|'model'}
 */
export function trackedBand({ px, current }) {
  return classifyModelBand({
    px,
    current,
    addPx: SAT_MODEL_TRACKED_ADD_PX,
    keepPx: SAT_MODEL_TRACKED_KEEP_PX,
  });
}

/**
 * Hysteretic band of a secondary: pixel band plus the distance ceiling. A new
 * secondary must also be on screen; one already held keeps its band while it
 * leaves the view (it is culled by Cesium, and re-entering would thrash).
 * @param {{px: number, distanceM: number, current: 'none'|'model',
 *   onScreen: boolean}} input
 * @returns {'none'|'model'}
 */
export function secondaryBand({ px, distanceM, current, onScreen }) {
  if (current === 'none' && onScreen !== true) return 'none';
  return classifyModelBand({
    px,
    current,
    addPx: SAT_MODEL_SECONDARY_ADD_PX,
    keepPx: SAT_MODEL_SECONDARY_KEEP_PX,
    distanceM,
    addM: SAT_MODEL_SECONDARY_ADD_M,
    keepM: SAT_MODEL_SECONDARY_KEEP_M,
  });
}

/**
 * Rank banded candidates and keep the first `cap`.
 * @param {{tracked: {noradId: number, band: string}|null,
 *   secondaries: Array<{noradId: number, band: string, distanceM: number}>,
 *   cap: number}} input
 * @returns {{desired: number[], inBand: Set<number>, byId: Map<number, object>}}
 *   `desired` in priority order; `inBand` every candidate whose band is
 *   'model' (desired or not); `byId` the candidate records.
 */
export function planModelSet({ tracked, secondaries, cap }) {
  const ranked = [];
  if (tracked?.band === 'model') ranked.push(tracked);
  const near = secondaries
    .filter((candidate) => candidate.band === 'model')
    .sort((a, b) => a.distanceM - b.distanceM);
  ranked.push(...near);
  const limit = Number.isInteger(cap) && cap > 0 ? cap : 0;
  return {
    desired: ranked.slice(0, limit).map((candidate) => candidate.noradId),
    inBand: new Set(ranked.map((candidate) => candidate.noradId)),
    byId: new Map(ranked.map((candidate) => [candidate.noradId, candidate])),
  };
}
