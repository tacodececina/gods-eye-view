import * as Cesium from 'cesium';
import { loadMoonEphemeris } from './layers/moon/ephemeris.js';
import { createMoonFallback } from './layers/moon/ephemerisFallback.js';
import { createMoonPosition } from './layers/moon/position.js';
import { ensureIcrfFixed, icrfToFixed } from './time/frames.js';
import { tdbSecondsFromJ2000 } from './time/timeScales.js';

/**
 * Direcciones Sol/Luna del anillo celeste (P5). La Luna sale de
 * `createMoonPosition` (tabla DE441 dentro de 2021–2040, respaldo rotulado
 * fuera) en TDB, nunca de Simon1994; el paso ICRF→ECEF usa `icrfToFixed` con
 * precarga `ensureIcrfFixed`, nunca TEME: sin marco, la respuesta es ausencia.
 */

export const MOON_TABLE_PATH = 'data/moon-de441-2021-2040.bin';

const UNAVAILABLE = Object.freeze({ status: 'unavailable' });

function moonTableUrl() {
  return `${import.meta.env?.BASE_URL || '/'}${MOON_TABLE_PATH}`;
}

/**
 * Posición lunar que arranca con el respaldo y pasa a la tabla DE441 cuando
 * se carga (se pide una vez, en el primer uso). Si la tabla falla, sigue el
 * respaldo, que ya va rotulado con su tolerancia.
 */
export function createLazyMoonPosition({
  createFallback = createMoonFallback,
  loadTable = () => loadMoonEphemeris(moonTableUrl()),
  onTableError = (error) =>
    globalThis.console?.warn?.(
      '[moon] tabla DE441 no disponible; sigue el respaldo rotulado',
      error,
    ),
} = {}) {
  let fallback = null;
  let current = null;
  let requested = false;
  const requestTable = () => {
    requested = true;
    let pending;
    try {
      pending = Promise.resolve(loadTable());
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending
      .then((table) => {
        current = createMoonPosition({ table, fallback });
      })
      .catch(onTableError);
  };
  return (tdbSeconds, result) => {
    if (!current) {
      fallback = createFallback();
      current = createMoonPosition({ fallback });
    }
    if (!requested) requestTable();
    return current(tdbSeconds, result);
  };
}

/**
 * @param {object} [options]
 * @param {Function} [options.moonPosition] (tdbSeconds, result) → muestra de createMoonPosition.
 * @param {object} [options.transforms] Cesium.Transforms (inyectable en tests).
 * @param {Function} [options.onFrameReady] Aviso cuando termina la precarga XYS.
 */
export function createCelestialEphemeris({
  moonPosition = createLazyMoonPosition(),
  transforms = Cesium.Transforms,
  onFrameReady = () => {},
} = {}) {
  const matrix = new Cesium.Matrix3();
  const sunInertial = new Cesium.Cartesian3();
  const moonKm = new Cesium.Cartesian3();
  let preloading = false;

  const requestFrame = (time) => {
    if (preloading) return;
    preloading = true;
    ensureIcrfFixed(time, { transforms }).then((outcome) => {
      preloading = false;
      if (outcome.status === 'ok') onFrameReady();
    });
  };

  /** Escribe direcciones unitarias ECEF en `sunFixed`/`moonFixed`. */
  const sample = (time, sunFixed, moonFixed) => {
    const frame = icrfToFixed(time, matrix, { transforms });
    if (frame.status !== 'ok') {
      requestFrame(time);
      return UNAVAILABLE;
    }
    Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
      time,
      sunInertial,
    );
    Cesium.Matrix3.multiplyByVector(matrix, sunInertial, sunFixed);
    Cesium.Cartesian3.normalize(sunFixed, sunFixed);
    const moon = moonPosition(tdbSecondsFromJ2000(time), moonKm);
    if (moon?.status !== 'ok')
      return { status: 'ok', moon: 'unavailable', moonSource: null };
    Cesium.Matrix3.multiplyByVector(matrix, moonKm, moonFixed);
    Cesium.Cartesian3.normalize(moonFixed, moonFixed);
    return { status: 'ok', moon: 'ok', moonSource: moon.source };
  };
  return Object.freeze({ sample });
}
