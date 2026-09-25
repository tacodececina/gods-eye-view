import * as Cesium from 'cesium';

/**
 * Escalas de tiempo de P5. `JulianDate` de Cesium guarda TAI internamente
 * (`dayNumber` + `secondsOfDay`, con los segundos intercalares ya aplicados al
 * construirlo desde UTC), así que TT = TAI + 32,184 s sale sin volver a sumar
 * TAI−UTC. TDB = TT + (TDB−TT), con la fórmula de Cesium/SPICE (unitim.c).
 *
 * Todo en segundos desde J2000 (JD 2451545,0 en su propia escala).
 */

export const TT_MINUS_TAI_S = 32.184;
export const J2000_DAY_NUMBER = 2451545;
const SECONDS_PER_DAY = 86_400;
/** Constantes SPICE N0051 (igual que Simon1994PlanetaryPositions). */
const SPICE_M0 = 6.239996;
const SPICE_M0_DOT_PER_S = 1.99096871e-7;
const SPICE_EARTH_ECC = 1.671e-2;
const SPICE_K = 1.657e-3;

/** TDB−TT en s (|·| ≤ 1,7 ms) para `ttSeconds` s TT desde J2000. */
export function tdbMinusTtSeconds(ttSeconds) {
  const g = SPICE_M0 + SPICE_M0_DOT_PER_S * ttSeconds;
  return SPICE_K * Math.sin(g + SPICE_EARTH_ECC * Math.sin(g));
}

function assertJulianDate(julianDate) {
  if (
    !Number.isFinite(julianDate?.dayNumber) ||
    !Number.isFinite(julianDate?.secondsOfDay)
  )
    throw new TypeError('Se esperaba un JulianDate');
}

/** Segundos TT desde J2000 TT, leídos del TAI interno del JulianDate. */
export function ttSecondsFromJ2000(julianDate) {
  assertJulianDate(julianDate);
  return (
    (julianDate.dayNumber - J2000_DAY_NUMBER) * SECONDS_PER_DAY +
    julianDate.secondsOfDay +
    TT_MINUS_TAI_S
  );
}

/** Segundos TDB desde J2000 TDB para un JulianDate (reloj de escena). */
export function tdbSecondsFromJ2000(julianDate) {
  const tt = ttSecondsFromJ2000(julianDate);
  return tt + tdbMinusTtSeconds(tt);
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * ISO 8601 UTC estricta (con `Z`; admite `:60` en un segundo intercalar) →
 * JulianDate. Rechaza cualquier otra cosa con TypeError.
 */
export function parseUtcIso(iso) {
  if (typeof iso !== 'string' || !ISO_UTC.test(iso))
    throw new TypeError(`Fecha UTC ISO inválida: ${String(iso)}`);
  let julianDate;
  try {
    julianDate = Cesium.JulianDate.fromIso8601(iso);
  } catch {
    throw new TypeError(`Fecha UTC ISO inválida: ${iso}`);
  }
  if (!julianDate || !Number.isFinite(julianDate.secondsOfDay))
    throw new TypeError(`Fecha UTC ISO inválida: ${iso}`);
  return julianDate;
}

/** ISO 8601 UTC estricta → s TDB desde J2000 (TypeError si no es válida). */
export function utcIsoToTdbSeconds(iso) {
  return tdbSecondsFromJ2000(parseUtcIso(iso));
}

/**
 * TDB − UTC (s) en `julianDate`: 32,184 s + (TAI−UTC) + (TDB−TT). Para el
 * rótulo «TDB = UTC + 69,18 s» del panel OBJETIVO Luna.
 */
export function tdbMinusUtcSeconds(julianDate) {
  const tt = ttSecondsFromJ2000(julianDate);
  return (
    TT_MINUS_TAI_S +
    Cesium.JulianDate.computeTaiMinusUtc(julianDate) +
    tdbMinusTtSeconds(tt)
  );
}
