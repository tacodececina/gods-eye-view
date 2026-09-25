import * as Cesium from 'cesium';
import { icrfToFixed } from '../../time/frames.js';
import { tdbSecondsFromJ2000 } from '../../time/timeScales.js';
import {
  apparentDiameterDeg,
  illuminatedFraction,
  isWaxing,
  phaseName,
} from './lunarPhase.js';

/**
 * Estado celeste común de P5 (T5): Sol y Luna para UN JulianDate (el
 * `frameState.time` del reloj único). Lo leen la Luna 3D, el anillo y el HUD;
 * nadie más recalcula efemérides.
 *
 * - Luna: `moonPosition` (tabla DE441; respaldo rotulado fuera de rango), en
 *   TDB, geométrica, ICRF geocéntrica (km).
 * - Sol: Simon1994 (0,063′ medido; permitido SOLO para el Sol).
 * - ICRF→ITRF: frames.icrfToFixed (IAU2006 XYS). Sin marco → «unavailable»,
 *   nunca TEME.
 *
 * `result` se reutiliza (sin asignaciones por fotograma).
 */

export const LIGHT_SPEED_KM_S = 299_792.458;
const KM_TO_M = 1000;

/** Resultado reutilizable de getCelestialState. */
export function createCelestialResult() {
  return {
    status: 'unavailable',
    reason: null,
    sun: 'unavailable',
    moon: 'unavailable',
    epochIso: null,
    tdbSeconds: Number.NaN,
    icrfToFixed: new Cesium.Matrix3(),
    sunFixedM: new Cesium.Cartesian3(),
    moonFixedM: new Cesium.Cartesian3(),
    moonIcrfKm: new Cesium.Cartesian3(),
    distanceKm: Number.NaN,
    lightSeconds: Number.NaN,
    phaseFraction: Number.NaN,
    phaseName: null,
    subLunarLonLat: { lonDeg: Number.NaN, latDeg: Number.NaN },
    apparentDiameterDeg: Number.NaN,
    source: null,
    validity: null,
  };
}

function resetMoon(result, moonStatus) {
  result.moon = moonStatus;
  result.source = null;
  result.validity = null;
  result.distanceKm = Number.NaN;
  result.lightSeconds = Number.NaN;
  result.phaseFraction = Number.NaN;
  result.phaseName = null;
  result.apparentDiameterDeg = Number.NaN;
  result.subLunarLonLat.lonDeg = Number.NaN;
  result.subLunarLonLat.latDeg = Number.NaN;
}

/** Validez rotulada de la muestra lunar (rango de tabla o tolerancia). */
function validityOf(sample) {
  if (sample.toleranceKm !== undefined)
    return { toleranceKm: sample.toleranceKm, tableRange: sample.tableRange };
  if (sample.validFrom === undefined) return null;
  return { validFrom: sample.validFrom, validTo: sample.validTo };
}

const scratchCarto = new Cesium.Cartographic();
const scratchSurface = new Cesium.Cartesian3();

/** Punto sublunar geodésico WGS84 (el rayo geocéntrico corta el elipsoide). */
function writeSubLunar(moonFixedM, out) {
  const surface = Cesium.Ellipsoid.WGS84.scaleToGeocentricSurface(
    moonFixedM,
    scratchSurface,
  );
  const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(
    surface,
    scratchCarto,
  );
  out.lonDeg = Cesium.Math.toDegrees(carto.longitude);
  out.latDeg = Cesium.Math.toDegrees(carto.latitude);
}

function writeMoon(result, sample, matrix, sunIcrfM) {
  const km = result.moonIcrfKm;
  Cesium.Cartesian3.clone(sample.position, km);
  Cesium.Matrix3.multiplyByVector(matrix, km, result.moonFixedM);
  Cesium.Cartesian3.multiplyByScalar(
    result.moonFixedM,
    KM_TO_M,
    result.moonFixedM,
  );
  result.moon = 'ok';
  result.source = sample.source;
  result.validity = validityOf(sample);
  result.distanceKm = Cesium.Cartesian3.magnitude(km);
  result.lightSeconds = result.distanceKm / LIGHT_SPEED_KM_S;
  const sunKm = Cesium.Cartesian3.multiplyByScalar(sunIcrfM, 1e-3, scratchSun);
  result.phaseFraction = illuminatedFraction(sunKm, km);
  result.phaseName = phaseName(result.phaseFraction, isWaxing(sunKm, km));
  result.apparentDiameterDeg = apparentDiameterDeg(result.distanceKm);
  writeSubLunar(result.moonFixedM, result.subLunarLonLat);
}

const scratchSun = new Cesium.Cartesian3();

/**
 * Sol fijo (ECEF, m) en `sunFixedOut`; escribe la matriz ICRF→ITRF en
 * `matrix` y el Sol ICRF en `sunIcrfM`. false si no hay marco (nunca TEME).
 */
export function writeSunFixed(
  julianDate,
  { matrix, sunIcrfM, sunFixedOut, transforms = Cesium.Transforms },
) {
  if (icrfToFixed(julianDate, matrix, { transforms }).status !== 'ok')
    return false;
  Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
    julianDate,
    sunIcrfM,
  );
  Cesium.Matrix3.multiplyByVector(matrix, sunIcrfM, sunFixedOut);
  return true;
}

function assertJulianDate(julianDate) {
  if (!(julianDate instanceof Cesium.JulianDate))
    throw new TypeError('Se esperaba un JulianDate');
}

/**
 * @param {{moonPosition: Function, transforms?: object}} deps
 *   `moonPosition(tdbSeconds, result)` → muestra de createMoonPosition.
 * @returns {(julianDate: Cesium.JulianDate, result: object) => object}
 */
export function createCelestialStateReader({
  moonPosition,
  transforms = Cesium.Transforms,
}) {
  const matrix = new Cesium.Matrix3();
  const sunIcrfM = new Cesium.Cartesian3();
  const moonKm = new Cesium.Cartesian3();
  return function getCelestialState(julianDate, result) {
    assertJulianDate(julianDate);
    result.epochIso = Cesium.JulianDate.toIso8601(julianDate, 3);
    result.tdbSeconds = tdbSecondsFromJ2000(julianDate);
    const sunFixedOut = result.sunFixedM;
    if (
      !writeSunFixed(julianDate, { matrix, sunIcrfM, sunFixedOut, transforms })
    ) {
      Object.assign(result, { status: 'unavailable', reason: 'frame' });
      result.sun = 'unavailable';
      resetMoon(result, 'unavailable');
      return result;
    }
    Cesium.Matrix3.clone(matrix, result.icrfToFixed);
    result.sun = 'ok';
    const sample = moonPosition(result.tdbSeconds, moonKm);
    if (sample?.status !== 'ok') {
      resetMoon(result, sample?.status ?? 'unavailable');
      if (sample?.status === 'out-of-range')
        result.validity = validityOf(sample);
      result.status = sample?.status ?? 'unavailable';
      result.reason = sample?.reason ?? null;
      return result;
    }
    writeMoon(result, sample, matrix, sunIcrfM);
    result.status = 'ok';
    result.reason = null;
    return result;
  };
}
