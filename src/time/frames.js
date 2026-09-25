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

/** Intervalo de precarga [época − margen, época + margen]. */
export function preloadInterval(
  julianDate,
  marginDays = ICRF_PRELOAD_MARGIN_DAYS,
) {
  assertJulianDate(julianDate);
  return new Cesium.TimeInterval({
    start: Cesium.JulianDate.addDays(
      julianDate,
      -marginDays,
      new Cesium.JulianDate(),
    ),
    stop: Cesium.JulianDate.addDays(
      julianDate,
      marginDays,
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
