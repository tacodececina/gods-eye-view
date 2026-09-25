import * as Cesium from 'cesium';
import { parseUtcIso } from './timeScales.js';

/**
 * Reloj único de escena (P5 T4). Gobierna `viewer.clock` —el que Cesium avanza
 * en `CesiumWidget.render` antes de `scene.render`, así que `frameState.time`
 * alimenta Luna, Sol, luz, anillo y rótulos a la vez—. Modos:
 *
 * - `live`: shouldAnimate, SYSTEM_CLOCK_MULTIPLIER ×1 y resincronía con la
 *   pared cada LIVE_RESYNC_INTERVAL_MS, con pasos de ≤ 1 fotograma
 *   (LIVE_MAX_SLEW_S): nunca un salto visible. Solo `setNow()` salta.
 * - `simulated`: SYSTEM_CLOCK_MULTIPLIER con ×1…×3600, sin resincronía.
 * - `paused`: shouldAnimate=false.
 *
 * Nunca TICK_DEPENDENT (deriva con la cadencia de render) ni SYSTEM_CLOCK
 * (salta a «ahora» en cada fotograma). La pared (`now`) se inyecta. SGP4 y
 * los feeds en vivo NO leen este reloj: siguen en Date.now().
 */

export const SCENE_CLOCK_MIN_MULTIPLIER = 1;
export const SCENE_CLOCK_MAX_MULTIPLIER = 3600;
export const LIVE_RESYNC_INTERVAL_MS = 2_000;
export const LIVE_MAX_SLEW_S = 1 / 60;

const GOVERNED = new WeakSet();

function assertMultiplier(multiplier) {
  if (
    !Number.isFinite(multiplier) ||
    multiplier < SCENE_CLOCK_MIN_MULTIPLIER ||
    multiplier > SCENE_CLOCK_MAX_MULTIPLIER
  )
    throw new RangeError(
      `Multiplicador fuera de ×${SCENE_CLOCK_MIN_MULTIPLIER}…×${SCENE_CLOCK_MAX_MULTIPLIER}: ${multiplier}`,
    );
}

const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

/** Aplica al Cesium.Clock el modo y ritmo del estado interno. */
function applyToClock(clock, internal) {
  clock.clockRange = Cesium.ClockRange.UNBOUNDED;
  clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  clock.multiplier = internal.mode === 'simulated' ? internal.multiplier : 1;
  clock.shouldAnimate = internal.mode !== 'paused';
}

const scratchGregorian = new Cesium.GregorianDate();

/** Milisegundos Unix (con fracción) de un JulianDate, sin redondear a 1 ms. */
export function julianDateToUnixMs(julianDate) {
  const g = Cesium.JulianDate.toGregorianDate(julianDate, scratchGregorian);
  return (
    Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute, g.second) +
    g.millisecond
  );
}

/** JulianDate de milisegundos Unix con fracción (Date solo guarda ms enteros). */
export function unixMsToJulianDate(ms) {
  const whole = Math.floor(ms);
  const date = Cesium.JulianDate.fromDate(new Date(whole));
  return Cesium.JulianDate.addSeconds(date, (ms - whole) / 1000, date);
}

const sceneMs = (clock) => julianDateToUnixMs(clock.currentTime);

/** Resincronía en vivo: corrige como mucho un fotograma, en el propio tick. */
function resyncLive(clock, internal, now, options) {
  if (internal.mode !== 'live') return;
  const wall = now();
  if (wall - internal.lastResyncWallMs < options.resyncIntervalMs) return;
  internal.lastResyncWallMs = wall;
  const lagS = (wall - sceneMs(clock)) / 1000;
  const step = clamp(lagS, options.maxSlewS);
  if (step !== 0)
    Cesium.JulianDate.addSeconds(clock.currentTime, step, clock.currentTime);
}

function snapshot(clock, internal, now) {
  const current = sceneMs(clock);
  return Object.freeze({
    mode: internal.mode,
    multiplier: internal.mode === 'simulated' ? internal.multiplier : 1,
    currentIso: new Date(current).toISOString(),
    isLive: internal.mode === 'live',
    driftMs: current - now(),
    reason: internal.reason,
  });
}

function createController(clock, internal, now) {
  const listeners = new Set();
  const notify = () => {
    const state = snapshot(clock, internal, now);
    for (const listener of [...listeners]) listener(state);
  };
  const change = (mode, patch = {}) => {
    if (internal.destroyed) throw new Error('Reloj de escena destruido');
    Object.assign(internal, { mode, reason: null, ...patch });
    applyToClock(clock, internal);
    notify();
  };
  const jumpTo = (julianDate) => {
    clock.currentTime = julianDate;
    internal.lastResyncWallMs = now();
  };
  return { listeners, change, jumpTo };
}

/** Métodos públicos sobre el controlador y el estado interno. */
function publicApi({ clock, internal, now, controller, removeTick }) {
  const { listeners, change, jumpTo } = controller;
  const setNow = () => {
    jumpTo(unixMsToJulianDate(now()));
    change('live');
  };
  return {
    setNow,
    pause: (reason = null) => change('paused', { reason }),
    simulate: (multiplier) => {
      assertMultiplier(multiplier);
      change('simulated', { multiplier });
    },
    setTime: (iso) => {
      const julianDate = parseUtcIso(iso);
      if (internal.destroyed) throw new Error('Reloj de escena destruido');
      jumpTo(julianDate);
      change(internal.mode === 'simulated' ? 'simulated' : 'paused');
    },
    getState: () => snapshot(clock, internal, now),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => {
      if (internal.destroyed) return;
      internal.destroyed = true;
      removeTick();
      listeners.clear();
      GOVERNED.delete(clock);
    },
  };
}

/**
 * @param {{clock: Cesium.Clock, now?: () => number, resyncIntervalMs?: number,
 *   maxSlewS?: number}} options
 */
export function createSceneClock({
  clock,
  now = () => Date.now(),
  resyncIntervalMs = LIVE_RESYNC_INTERVAL_MS,
  maxSlewS = LIVE_MAX_SLEW_S,
}) {
  if (!clock?.onTick) throw new TypeError('Se esperaba un Cesium.Clock');
  if (GOVERNED.has(clock)) throw new Error('El reloj ya tiene gobernador');
  GOVERNED.add(clock);
  const internal = {
    mode: 'live',
    multiplier: 1,
    reason: null,
    destroyed: false,
    lastResyncWallMs: now(),
  };
  const options = { resyncIntervalMs, maxSlewS };
  const controller = createController(clock, internal, now);
  const removeTick = clock.onTick.addEventListener(() =>
    resyncLive(clock, internal, now, options),
  );
  const api = publicApi({ clock, internal, now, controller, removeTick });
  api.setNow();
  return Object.freeze(api);
}

const BY_VIEWER = new WeakMap();

/** Crea (una vez) el reloj de escena de `viewer` sobre `viewer.clock`. */
export function bindViewerSceneClock(viewer, options = {}) {
  const existing = BY_VIEWER.get(viewer);
  if (existing) return existing;
  const sceneClock = createSceneClock({ ...options, clock: viewer.clock });
  BY_VIEWER.set(viewer, sceneClock);
  return sceneClock;
}

/** Reloj de escena de `viewer`, o null si no tiene. */
export function getViewerSceneClock(viewer) {
  return BY_VIEWER.get(viewer) ?? null;
}

/** Suelta el reloj de escena de `viewer` (idempotente). */
export function unbindViewerSceneClock(viewer) {
  const sceneClock = BY_VIEWER.get(viewer);
  if (!sceneClock) return;
  BY_VIEWER.delete(viewer);
  sceneClock.destroy();
}
