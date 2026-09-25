import * as Cesium from 'cesium';
import {
  createCelestialResult,
  createCelestialStateReader,
  writeSunFixed,
} from './celestialState.js';
import { createLazyMoonSource } from './moonSource.js';

/**
 * Servicio celeste compartido por viewer (P5 T7): una fuente lunar perezosa,
 * un lector de estado celeste y una caché por instante. La Luna 3D (preUpdate),
 * el anillo (postRender) y el HUD leen el MISMO estado para el mismo
 * `frameState.time`: nadie recalcula por su cuenta.
 */

/** Lector con caché por instante (solo se cachean estados «ok»). */
function createCachedReader(moonPosition, transforms) {
  const read = createCelestialStateReader({ moonPosition, transforms });
  const result = createCelestialResult();
  const cache = { time: new Cesium.JulianDate(), valid: false };
  const sunScratch = {
    matrix: new Cesium.Matrix3(),
    sunIcrfM: new Cesium.Cartesian3(),
    transforms,
  };
  const hit = (julianDate) =>
    cache.valid && Cesium.JulianDate.equals(cache.time, julianDate);
  return {
    invalidate: () => {
      cache.valid = false;
    },
    /** Estado para `julianDate` (objeto compartido: no lo mutes). */
    at(julianDate) {
      if (hit(julianDate)) return result;
      read(julianDate, result);
      Cesium.JulianDate.clone(julianDate, cache.time);
      cache.valid = result.status === 'ok';
      return result;
    },
    /** Solo el Sol fijo (m) en `out`, sin pedir la Luna; null sin marco. */
    sunFixedAt(julianDate, out) {
      if (hit(julianDate))
        return Cesium.Cartesian3.clone(result.sunFixedM, out);
      const ok = writeSunFixed(julianDate, { ...sunScratch, sunFixedOut: out });
      return ok ? out : null;
    },
  };
}

/**
 * @param {{createSource?: Function, transforms?: object}} [options]
 */
export function createCelestialService({
  createSource = createLazyMoonSource,
  transforms = Cesium.Transforms,
} = {}) {
  const listeners = new Set();
  let reader = null;
  const source = createSource({
    onChange: () => {
      reader?.invalidate();
      for (const listener of [...listeners]) listener();
    },
  });
  reader = createCachedReader(source.moonPosition, transforms);
  return Object.freeze({
    at: reader.at,
    sunFixedAt: reader.sunFixedAt,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      listeners.clear();
      source.destroy?.();
    },
  });
}

const BY_VIEWER = new WeakMap();

/** Servicio celeste de `viewer` (se crea en el primer uso). */
export function celestialFor(viewer, options) {
  let service = BY_VIEWER.get(viewer);
  if (!service) {
    service = createCelestialService(options);
    BY_VIEWER.set(viewer, service);
  }
  return service;
}

/** Destruye el servicio de `viewer` (idempotente). */
export function releaseCelestial(viewer) {
  const service = BY_VIEWER.get(viewer);
  if (!service) return;
  BY_VIEWER.delete(viewer);
  service.destroy();
}
