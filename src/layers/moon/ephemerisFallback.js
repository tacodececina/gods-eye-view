import * as Cesium from 'cesium';
import { tdbMinusTtSeconds } from '../../time/timeScales.js';

/**
 * Respaldo de la Luna FUERA del rango de la tabla DE441 (opción b aprobada
 * por Alex, 2026-09-25): astronomy-engine `GeoMoon` (MIT), marco EQJ
 * (J2000 medio ≈ ICRF, sesgo < 0,03″), rotulado «modelo analítico ≤20 km».
 *
 * Tolerancia medida barriendo el respaldo contra la tabla DE441 (≤0,03 km de
 * Horizons) en 2021–2040: máximo 16,07 km (2040-07-30T23:30Z, paso 30 min);
 * el rótulo deja margen. Lo fija ephemerisFallback.test.mjs (paso 6 h).
 *
 * ΔT = TT − UT1 se toma como TT − UTC = 32,184 s + (TAI−UTC) de
 * `JulianDate.leapSeconds` (UT1≈UTC, ≤ 0,9 s), no el ΔT fijo ni el de
 * Espenak–Meeus. Antes del primer intercalar (1972) se usa el de la librería.
 *
 * astronomy-engine se importa en diferido (`loadMoonFallback`): el bundle
 * principal no la lleva y solo se descarga si la tabla no puede responder.
 */

export const FALLBACK_TOLERANCE_KM = 20;
export const FALLBACK_SOURCE = 'astronomy-engine';
const AU_KM = 149_597_870.7;
const SECONDS_PER_DAY = 86_400;
const TT_MINUS_TAI_S = 32.184;
const J2000_DAY_NUMBER = 2451545;

/** Instante UTC (días desde J2000) de cada intercalar y su TAI−UTC. */
function leapTable(leapSeconds) {
  return leapSeconds.map(({ julianDate, offset }) => ({
    utcDays:
      julianDate.dayNumber -
      J2000_DAY_NUMBER +
      (julianDate.secondsOfDay - offset) / SECONDS_PER_DAY,
    offset,
  }));
}

const DEFAULT_LEAPS = leapTable(Cesium.JulianDate.leapSeconds);

/**
 * TT − UTC (s) para `utDays` días UTC desde J2000. Antes del primer
 * intercalar devuelve `beforeLeaps(utDays)` (NaN si no se da).
 */
export function ttMinusUtcSeconds(
  utDays,
  leaps = DEFAULT_LEAPS,
  beforeLeaps = () => Number.NaN,
) {
  if (!leaps.length || utDays < leaps[0].utcDays) return beforeLeaps(utDays);
  let low = 0;
  let high = leaps.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (leaps[mid].utcDays <= utDays) low = mid;
    else high = mid - 1;
  }
  return TT_MINUS_TAI_S + leaps[low].offset;
}

/** Días UT desde J2000 para `ttDays` días TT, con el mismo ΔT que usa la librería. */
function utDaysFromTt(ttDays, deltaT) {
  const first = ttDays - deltaT(ttDays) / SECONDS_PER_DAY;
  return ttDays - deltaT(first) / SECONDS_PER_DAY;
}

/**
 * Crea el respaldo sobre el módulo `astronomy` ya cargado. Instala
 * `SetDeltaTFunction` (estado global de la librería; en la app solo la usa
 * este módulo).
 */
export function createMoonFallback({
  astronomy,
  leapSeconds = Cesium.JulianDate.leapSeconds,
} = {}) {
  if (typeof astronomy?.GeoMoon !== 'function')
    throw new TypeError('Se esperaba astronomy-engine (GeoMoon)');
  const leaps =
    leapSeconds === Cesium.JulianDate.leapSeconds
      ? DEFAULT_LEAPS
      : leapTable(leapSeconds);
  const deltaT = (ut) =>
    ttMinusUtcSeconds(ut, leaps, astronomy.DeltaT_EspenakMeeus);
  astronomy.SetDeltaTFunction(deltaT);
  const moonPositionIcrf = (tdbSeconds, result) => {
    if (!Number.isFinite(tdbSeconds))
      throw new TypeError('tdbSeconds debe ser finito');
    const ttSeconds = tdbSeconds - tdbMinusTtSeconds(tdbSeconds);
    const time = astronomy.MakeTime(
      utDaysFromTt(ttSeconds / SECONDS_PER_DAY, deltaT),
    );
    const v = astronomy.GeoMoon(time);
    result.x = v.x * AU_KM;
    result.y = v.y * AU_KM;
    result.z = v.z * AU_KM;
    return {
      status: 'ok',
      position: result,
      source: FALLBACK_SOURCE,
      toleranceKm: FALLBACK_TOLERANCE_KM,
    };
  };
  return Object.freeze({
    source: FALLBACK_SOURCE,
    toleranceKm: FALLBACK_TOLERANCE_KM,
    moonPositionIcrf,
  });
}

/**
 * Importa astronomy-engine en diferido y crea el respaldo. Rechaza con
 * TypeError si el módulo no trae GeoMoon.
 */
export async function loadMoonFallback({
  importAstronomy = () => import('astronomy-engine'),
  leapSeconds,
} = {}) {
  const astronomy = await importAstronomy();
  return createMoonFallback({ astronomy, leapSeconds });
}
