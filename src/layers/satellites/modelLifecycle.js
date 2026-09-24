import * as Cesium from 'cesium';
import {
  SAT_MODEL_CREDIT,
  SAT_MODEL_EVICT_DEBOUNCE_MS,
  SAT_MODEL_MAX_LOAD_FAILS,
} from './policy.js';

/**
 * Admission, eviction, failure accounting and teardown of satellite models
 * (P4 T4), as plain functions over the models context `ctx` built by
 * models.js ({viewer, state, store, loadModel, now, resolveAsset, credits}).
 *
 * Load pattern reused from flights `_ensureModel`: the cap counts pending
 * loads BEFORE the await; the lifecycle epoch, the per-NORAD generation and
 * the catalog revision are captured before it and re-checked after it, and a
 * late or stale model is destroyed without ever entering the scene.
 */

export function destroyQuietly(model) {
  try {
    if (!model?.isDestroyed?.()) model?.destroy?.();
  } catch {
    // Already gone.
  }
}

export function emit(store, type, detail) {
  for (const listener of store.listeners.get(type) ?? []) {
    try {
      listener(Object.freeze({ ...detail }));
    } catch (error) {
      console.warn(`[Data:Satellites] ${type} listener failed:`, error);
    }
  }
}

export const genOf = (store, id) => store.gen.get(id) ?? 0;

const bumpGen = (store, id) => store.gen.set(id, genOf(store, id) + 1);

function cleanupGen(store, id) {
  if (!store.pending.has(id) && !store.active.has(id)) store.gen.delete(id);
}

/** Whether `id` holds a live model or a load that is still wanted. */
export function holdsModel(store, id) {
  if (store.active.has(id)) return true;
  return (
    store.pending.has(id) && store.pending.get(id).gen === genOf(store, id)
  );
}

function ensureCollection(ctx) {
  const { store } = ctx;
  if (store.collection && !store.collection.isDestroyed()) {
    return store.collection;
  }
  store.collection = new Cesium.PrimitiveCollection({
    destroyPrimitives: true,
  });
  ctx.viewer.scene.primitives.add(store.collection);
  return store.collection;
}

/** NASA credit: shown from the first ready model until none is active. */
function syncCredit(ctx) {
  const { store } = ctx;
  const anyReady = [...store.active.values()].some((entry) => entry.ready);
  if (anyReady && !store.creditShown) {
    store.creditShown = true;
    ctx.credits?.register?.(SAT_MODEL_CREDIT);
  } else if (store.active.size === 0 && store.creditShown) {
    store.creditShown = false;
    ctx.credits?.unregister?.(SAT_MODEL_CREDIT);
  }
}

/** Remove an admitted model from the scene (the collection destroys it). */
function dropActive(store, id) {
  const entry = store.active.get(id);
  if (!entry) return null;
  for (const remove of entry.unsubscribe) remove();
  store.active.delete(id);
  const collection = store.collection;
  const removed =
    collection && !collection.isDestroyed() && collection.remove(entry.model);
  if (!removed) destroyQuietly(entry.model);
  return entry;
}

export function evictModel(ctx, id, reason) {
  const { store } = ctx;
  const entry = dropActive(store, id);
  if (!entry) return;
  bumpGen(store, id);
  cleanupGen(store, id);
  store.counters.evictions += 1;
  emit(store, 'model-evicted', {
    noradId: id,
    assetId: entry.asset.id,
    reason,
  });
  syncCredit(ctx);
}

function recordFailure(ctx, id, asset, error) {
  const { store } = ctx;
  const uri = asset.uri;
  const count = (store.failures.get(uri)?.count ?? 0) + 1;
  store.failures.set(uri, { count, lastAt: ctx.now() });
  store.counters.failed += 1;
  const vetoed = count >= SAT_MODEL_MAX_LOAD_FAILS;
  if (vetoed) store.vetoed.add(uri);
  emit(store, 'model-failed', {
    noradId: id,
    assetId: asset.id,
    reason: vetoed ? 'vetoed' : 'load-failed',
    message: String(error?.message ?? error ?? 'unknown'),
  });
}

function markReady(ctx, id, entry) {
  const { store } = ctx;
  if (entry.ready || entry.failed || store.active.get(id) !== entry) return;
  entry.ready = true;
  emit(store, 'model-ready', {
    noradId: id,
    assetId: entry.asset.id,
    reason: 'loaded',
  });
  syncCredit(ctx);
}

/**
 * A decode/render error after admission counts as a failed load. Cesium
 * raises errorEvent from inside Model.update while PrimitiveCollection.update
 * walks the collection, and Model.update keeps reading fields that destroy()
 * clears: tearing the model down here would throw out of Scene.render (and
 * shift the walk index). So only mark and hide it; retireFailedModels drops
 * it on the next frame, outside the primitive walk. Re-raises are ignored.
 */
function failActive(ctx, id, entry, error) {
  const { store } = ctx;
  if (entry.failed || store.active.get(id) !== entry) return;
  entry.failed = error ?? new Error('unknown model error');
  entry.model.show = false;
}

/**
 * Drop the models marked failed by errorEvent. Called from the preRender
 * hooks (reconcile and pose), never from inside a primitive update.
 */
export function retireFailedModels(ctx) {
  const { store } = ctx;
  if (store.destroyed) return;
  for (const [id, entry] of [...store.active]) {
    if (!entry.failed) continue;
    dropActive(store, id);
    cleanupGen(store, id);
    recordFailure(ctx, id, entry.asset, entry.failed);
    syncCredit(ctx);
  }
}

function watchModel(ctx, id, entry) {
  const { model } = entry;
  if (model.readyEvent?.addEventListener) {
    entry.unsubscribe.push(
      model.readyEvent.addEventListener(() => markReady(ctx, id, entry)),
    );
  }
  if (model.errorEvent?.addEventListener) {
    entry.unsubscribe.push(
      model.errorEvent.addEventListener((error) =>
        failActive(ctx, id, entry, error),
      ),
    );
  }
  if (model.ready === true || !model.readyEvent) markReady(ctx, id, entry);
}

function admitLoaded(ctx, id, asset, model) {
  // Not placed yet: hidden until the first pose writes its matrix, so it
  // never draws a frame at the Earth's centre.
  model.show = false;
  model.gevSatelliteNorad = id;
  ensureCollection(ctx).add(model);
  const entry = {
    model,
    asset,
    ready: false,
    failed: null,
    evictAt: null,
    unsubscribe: [],
    sample: {
      position: new Cesium.Cartesian3(),
      velocity: new Cesium.Cartesian3(),
    },
  };
  ctx.store.active.set(id, entry);
  ctx.store.counters.admissions += 1;
  watchModel(ctx, id, entry);
}

function isStale(ctx, id, token) {
  const { store } = ctx;
  return (
    store.destroyed ||
    genOf(store, id) !== token.gen ||
    ctx.state._catalogRevision !== token.revision ||
    store.active.has(id) ||
    store.active.size >= (store.profile?.cap ?? 0)
  );
}

function settleLoad(ctx, id, asset, model, token) {
  const { store } = ctx;
  // A load from a previous lifecycle must not touch this one's state.
  if (token.epoch !== store.epoch) {
    destroyQuietly(model);
    return;
  }
  store.pending.delete(id);
  if (isStale(ctx, id, token)) {
    destroyQuietly(model);
    cleanupGen(store, id);
    return;
  }
  admitLoaded(ctx, id, asset, model);
}

/** Start one load; the caller has already checked the cap. */
export async function startLoad(ctx, id, asset) {
  const { store } = ctx;
  const token = {
    epoch: store.epoch,
    gen: genOf(store, id),
    revision: ctx.state._catalogRevision,
  };
  store.pending.set(id, token);
  let model;
  try {
    model = await ctx.loadModel({
      url: ctx.resolveAsset(asset.uri),
      scale: asset.scaleMeters,
      minimumPixelSize: 0,
      allowPicking: false,
      shadows: Cesium.ShadowMode.DISABLED,
      asynchronous: true,
    });
  } catch (error) {
    if (token.epoch !== store.epoch) return;
    store.pending.delete(id);
    cleanupGen(store, id);
    recordFailure(ctx, id, asset, error);
    return;
  }
  settleLoad(ctx, id, asset, model, token);
}

/**
 * Release one satellite's model. A 'target-change' release also keeps it
 * from re-entering as a secondary for SAT_MODEL_EVICT_DEBOUNCE_MS: the follow
 * camera reaches the new target a few frames later and would otherwise
 * re-admit the old one on the spot. A pending load keeps its slot until it
 * settles (its generation is bumped, so it is destroyed on arrival).
 */
export function releaseModel(ctx, id, reason = 'released') {
  const { store } = ctx;
  if (reason === 'target-change') {
    store.cooldown.set(id, ctx.now() + SAT_MODEL_EVICT_DEBOUNCE_MS);
  }
  if (store.active.has(id)) evictModel(ctx, id, reason);
  else if (store.pending.has(id)) bumpGen(store, id);
}

/** Immediate: evict every model; in-flight loads die on arrival (epoch). */
export function releaseAllModels(ctx, reason = 'released') {
  const { store } = ctx;
  store.epoch += 1;
  for (const id of [...store.active.keys()]) evictModel(ctx, id, reason);
  store.pending.clear();
  store.gen.clear();
  store.cooldown.clear();
  store.lastReconcileMs = Number.NEGATIVE_INFINITY;
  store.lastTracked = undefined;
  store.eligible = { key: null, list: [] };
}

export function destroyModels(ctx) {
  const { store } = ctx;
  if (store.destroyed) return;
  releaseAllModels(ctx, 'destroyed');
  store.destroyed = true;
  const collection = store.collection;
  store.collection = null;
  if (collection && !collection.isDestroyed()) {
    const primitives = ctx.viewer?.scene?.primitives;
    const removed = primitives?.remove?.(collection);
    if (!removed && !collection.isDestroyed()) collection.destroy();
  }
  for (const set of store.listeners.values()) set.clear();
}
