import * as Cesium from 'cesium';

/**
 * Marcos de P5: ICRF → ITRF (ECEF) con IAU 2006 XYS de Cesium. Nunca cae a
 * TEME: sin datos XYS la respuesta es «unavailable» y la UI muestra la
 * ausencia (propuesta §4, P5-03/P5-10).
 */

/** Margen de precarga alrededor de la época (propuesta §4: ±1 d). */
export const ICRF_PRELOAD_MARGIN_DAYS = 1;

const UNAVAILABLE = Object.freeze({ status: 'unavailable', matrix: undefined });

function assertJulianDate(julianDate) {
  if (!(julianDate instanceof Cesium.JulianDate))
    throw new TypeError('Se esperaba un JulianDate');
}

/**
 * Matriz ICRF→ITRF en `result` para `julianDate`.
 * @returns {{status: 'ok', matrix: Cesium.Matrix3} | {status: 'unavailable', matrix: undefined}}
 */
export function icrfToFixed(
  julianDate,
  result,
  { transforms = Cesium.Transforms } = {},
) {
  assertJulianDate(julianDate);
  const matrix = transforms.computeIcrfToFixedMatrix(julianDate, result);
  return matrix ? { status: 'ok', matrix } : UNAVAILABLE;
}

/**
 * Intervalo de precarga [época − margen, época + margen]. Con addSeconds:
 * JulianDate.addDays no normaliza días fraccionarios.
 */
export function preloadInterval(
  julianDate,
  marginDays = ICRF_PRELOAD_MARGIN_DAYS,
) {
  assertJulianDate(julianDate);
  const marginSeconds = marginDays * 86_400;
  return new Cesium.TimeInterval({
    start: Cesium.JulianDate.addSeconds(
      julianDate,
      -marginSeconds,
      new Cesium.JulianDate(),
    ),
    stop: Cesium.JulianDate.addSeconds(
      julianDate,
      marginSeconds,
      new Cesium.JulianDate(),
    ),
  });
}

/**
 * Precarga XYS alrededor de `julianDate` con `Transforms.preloadIcrfFixed`.
 * Resuelve siempre: `{status:'ok', interval}` o
 * `{status:'unavailable', interval, reason}`; nunca activa TEME.
 */
export async function ensureIcrfFixed(
  julianDate,
  {
    transforms = Cesium.Transforms,
    marginDays = ICRF_PRELOAD_MARGIN_DAYS,
  } = {},
) {
  const interval = preloadInterval(julianDate, marginDays);
  try {
    await transforms.preloadIcrfFixed(interval);
  } catch (error) {
    return Object.freeze({
      status: 'unavailable',
      interval,
      reason: String(error?.message ?? error),
    });
  }
  return Object.freeze({ status: 'ok', interval });
}

/** Tras una precarga fallida, espera antes de reintentar (no martillea la red). */
export const FRAME_RETRY_MS = 30_000;
/** Re-precarga cuando la época queda a menos de esto del borde del intervalo. */
export const FRAME_REFRESH_MARGIN_DAYS = 0.5;

function nearEdge(interval, julianDate) {
  if (!interval || !Cesium.TimeInterval.contains(interval, julianDate))
    return true;
  const toStart = Cesium.JulianDate.daysDifference(julianDate, interval.start);
  const toStop = Cesium.JulianDate.daysDifference(interval.stop, julianDate);
  return Math.min(toStart, toStop) < FRAME_REFRESH_MARGIN_DAYS;
}

function startPreload(state, julianDate, options) {
  state.pending = true;
  ensureIcrfFixed(julianDate, { transforms: options.transforms }).then(
    (outcome) => {
      if (state.destroyed) return;
      state.pending = false;
      state.status = outcome.status;
      state.interval = outcome.status === 'ok' ? outcome.interval : null;
      state.failedAtMs = outcome.status === 'ok' ? null : options.now();
      options.onChange(outcome.status);
    },
  );
}

/**
 * Mantiene precargado IAU2006 XYS alrededor de la época del reloj de escena
 * (propuesta §4: ±1 d, re-precarga tras un seek o al acercarse al borde).
 * `check(jd)` es barato: llámalo en cada tick. Nunca TEME.
 * @param {{transforms?: object, now?: () => number,
 *   onChange?: (status: string) => void}} [options]
 */
export function createFrameKeeper({
  transforms = Cesium.Transforms,
  now = () => Date.now(),
  onChange = () => {},
} = {}) {
  const state = {
    status: 'idle',
    interval: null,
    pending: false,
    failedAtMs: null,
    destroyed: false,
  };
  const options = { transforms, now, onChange };
  const retryBlocked = () =>
    state.failedAtMs !== null && now() - state.failedAtMs < FRAME_RETRY_MS;
  return Object.freeze({
    check(julianDate) {
      if (state.destroyed || state.pending || retryBlocked()) return;
      if (!nearEdge(state.interval, julianDate)) return;
      if (state.status !== 'ok') state.status = 'loading';
      startPreload(state, julianDate, options);
    },
    status: () => state.status,
    icrfToFixed: (julianDate, result) =>
      icrfToFixed(julianDate, result, { transforms }),
    destroy() {
      state.destroyed = true;
    },
  });
}
