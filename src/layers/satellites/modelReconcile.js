import * as Cesium from 'cesium';
import { classifyElementAge } from './elements.js';
import {
  evictModel,
  holdsModel,
  releaseModel,
  retireFailedModels,
  startLoad,
} from './modelLifecycle.js';
import { projectedDiameterPx } from './modelLod.js';
import {
  planModelSet,
  profileAllowsSecondaries,
  secondaryBand,
  trackedBand,
} from './modelPlanner.js';
import {
  SAT_MODEL_EVICT_DEBOUNCE_MS,
  SAT_MODEL_RECONCILE_MS,
  SAT_MODEL_RETRY_BACKOFF_MS,
} from './policy.js';

/**
 * Throttled LOD reconcile of satellite models (P4 T4): measure eligible
 * candidates against the camera, plan with modelPlanner.js, retire what left
 * the band (debounced) and admit what the cap allows. Plain functions over
 * the models context built by models.js.
 */

const REV_PER_DAY_PER_RAD_PER_MIN = 1440 / (2 * Math.PI);

/** Catalog members with a manifest asset, cached per revision/registry/profile. */
function eligibleList(ctx) {
  const { store, state } = ctx;
  const profileName = store.profile?.name ?? null;
  const key = `${state._catalogRevision}|${ctx.registry?.version ?? 0}|${profileName}`;
  if (store.eligible.key === key) return store.eligible.list;
  const list = [];
  for (const [noradId, sat] of state._catalog ?? []) {
    if (sat?.group === 'dense') continue;
    const asset = ctx.registry?.resolve?.(
      { noradId, group: sat?.group },
      { profile: profileName },
    );
    if (asset) list.push({ noradId, asset });
  }
  store.eligible = { key, list };
  return list;
}

function expired(sat, wallMs) {
  const meanMotion = Number(sat?.satrec?.no) * REV_PER_DAY_PER_RAD_PER_MIN;
  const age = classifyElementAge({
    elementEpochMs: sat?.elementEpochMs,
    now: wallMs,
    meanMotionRevPerDay: meanMotion,
  });
  return age === 'caducada';
}

function coolingDown(store, noradId, t) {
  const until = store.cooldown.get(noradId);
  if (until === undefined) return false;
  if (t < until) return true;
  store.cooldown.delete(noradId);
  return false;
}

function eligibleNow(ctx, { noradId, asset }, frame, isTracked) {
  const { store, state } = ctx;
  if (!isTracked && coolingDown(store, noradId, frame.t)) return false;
  if (store.vetoed.has(asset.uri)) return false;
  const failure = store.failures.get(asset.uri);
  if (failure && frame.t - failure.lastAt < SAT_MODEL_RETRY_BACKOFF_MS)
    return false;
  if (state._dockedCompanions?.has(noradId)) return false;
  return !expired(state._catalog.get(noradId), frame.wallMs);
}

function measure(ctx, { noradId, asset }, frame, isTracked) {
  const position =
    (isTracked ? frame.trackedPosition : null) ??
    ctx.state._points?.get(noradId)?.position;
  if (!position) return null;
  const distanceM = Cesium.Cartesian3.distance(position, frame.camera);
  const px = projectedDiameterPx({
    radiusM: asset.radiusM,
    distanceM,
    viewportHeightPx: frame.heightPx,
    fovyRad: frame.fovyRad,
  });
  return { noradId, asset, position, distanceM, px };
}

function band(ctx, candidate, isTracked) {
  const current = holdsModel(ctx.store, candidate.noradId) ? 'model' : 'none';
  if (isTracked) return trackedBand({ px: candidate.px, current });
  const onScreen =
    current === 'model' ||
    ctx.visible(candidate.position, candidate.asset.radiusM);
  return secondaryBand({ ...candidate, current, onScreen });
}

function collectCandidates(ctx, frame) {
  const secondariesAllowed = profileAllowsSecondaries(ctx.store.profile);
  let tracked = null;
  const secondaries = [];
  for (const item of eligibleList(ctx)) {
    const isTracked = item.noradId === frame.trackedNorad;
    if (!isTracked && !secondariesAllowed) continue;
    if (!eligibleNow(ctx, item, frame, isTracked)) continue;
    const candidate = measure(ctx, item, frame, isTracked);
    if (!candidate) continue;
    candidate.band = band(ctx, candidate, isTracked);
    if (isTracked) tracked = candidate;
    else secondaries.push(candidate);
  }
  return { tracked, secondaries };
}

/** Out of band: debounced eviction; a pending load is cancelled at once. */
function retireOutOfBand(ctx, plan, t) {
  const { store } = ctx;
  for (const [id, entry] of store.active) {
    if (plan.inBand.has(id)) {
      entry.evictAt = null;
      continue;
    }
    entry.evictAt ??= t + SAT_MODEL_EVICT_DEBOUNCE_MS;
    if (t >= entry.evictAt) evictModel(ctx, id, 'lod');
  }
  for (const id of store.pending.keys()) {
    if (!plan.inBand.has(id)) releaseModel(ctx, id, 'lod');
  }
}

function freeSlots(store) {
  const cap = store.profile?.cap ?? 0;
  return cap - store.active.size - store.pending.size;
}

/** Lowest-priority admitted model outside the desired set, or null. */
function victimFor(store, desired) {
  let victim = null;
  for (const [id, entry] of store.active) {
    if (desired.has(id)) continue;
    if (entry.evictAt !== null) return id;
    victim ??= id;
  }
  return victim;
}

/** Admit in priority order; a full cap displaces an undesired model at once. */
function admitDesired(ctx, plan) {
  const { store } = ctx;
  const desired = new Set(plan.desired);
  for (const id of plan.desired) {
    if (store.active.has(id) || store.pending.has(id)) continue;
    if (freeSlots(store) <= 0) {
      const victim = victimFor(store, desired);
      if (victim === null) return;
      evictModel(ctx, victim, 'displaced');
    }
    if (freeSlots(store) <= 0) return;
    void startLoad(ctx, id, plan.byId.get(id).asset);
  }
}

function readFrame(ctx, { cameraPosition, trackedNorad, frameSamples }, t) {
  const heightPx = ctx.viewer?.scene?.canvas?.clientHeight;
  const fovyRad = ctx.viewer?.camera?.frustum?.fovy;
  if (!cameraPosition || !Number.isFinite(heightPx)) return null;
  if (!Number.isFinite(fovyRad)) return null;
  return {
    camera: cameraPosition,
    trackedNorad,
    trackedPosition: frameSamples?.trackedPosition ?? null,
    heightPx,
    fovyRad,
    wallMs: ctx.wallNow(),
    t,
  };
}

/**
 * @param {object} ctx Models context.
 * @param {{cameraPosition: object, trackedNorad?: number|null,
 *   frameSamples?: {trackedPosition?: object|null}}} input
 * @returns {boolean} Whether a reconcile pass ran (throttled to
 *   SAT_MODEL_RECONCILE_MS unless the tracked target changed).
 */
export function reconcileModels(ctx, input = {}) {
  const { store } = ctx;
  if (store.destroyed) return false;
  retireFailedModels(ctx);
  const t = ctx.now();
  const trackedNorad = input.trackedNorad ?? null;
  const targetChanged = trackedNorad !== store.lastTracked;
  if (!targetChanged && t - store.lastReconcileMs < SAT_MODEL_RECONCILE_MS)
    return false;
  store.lastReconcileMs = t;
  store.lastTracked = trackedNorad;
  if ((store.profile?.cap ?? 0) <= 0) return true;
  const frame = readFrame(ctx, { ...input, trackedNorad }, t);
  if (!frame) return true;
  const { tracked, secondaries } = collectCandidates(ctx, frame);
  const plan = planModelSet({ tracked, secondaries, cap: store.profile.cap });
  retireOutOfBand(ctx, plan, t);
  admitDesired(ctx, plan);
  return true;
}

/**
 * Make the next reconcile run at once (new tracked target) and report the
 * asset the target would use, so the caller can warm its bytes.
 * @param {object} ctx Models context.
 * @param {number} noradId
 * @returns {object|null} The eligible asset, or null.
 */
export function prefetchModel(ctx, noradId) {
  const { store } = ctx;
  store.lastReconcileMs = Number.NEGATIVE_INFINITY;
  if (store.destroyed || (store.profile?.cap ?? 0) <= 0) return null;
  if (holdsModel(store, noradId)) return null;
  const item = eligibleList(ctx).find((entry) => entry.noradId === noradId);
  if (!item || store.vetoed.has(item.asset.uri)) return null;
  return item.asset;
}
