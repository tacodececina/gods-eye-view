/**
 * Fase lunar pura (P5 T5): fracción iluminada, creciente/menguante, nombre y
 * diámetro aparente, a partir de vectores geocéntricos Sol y Luna en el mismo
 * marco inercial (ICRF) y unidades. Geométrica: sin tiempo de luz; frente a
 * Illu% de Horizons (aparente) la diferencia es < 0,1 %.
 */

/** Radio medio de la Luna (km), el que usa Horizons para Ang-diam. */
export const MOON_MEAN_RADIUS_KM = 1737.4;
/** Oblicuidad J2000 (IAU 2006) para el polo de la eclíptica en ICRF. */
const OBLIQUITY_RAD = (23.4392911 * Math.PI) / 180;
const ECLIPTIC_POLE = Object.freeze({
  x: 0,
  y: -Math.sin(OBLIQUITY_RAD),
  z: Math.cos(OBLIQUITY_RAD),
});

const norm = (v) => Math.hypot(v.x, v.y, v.z);

function assertVector(v, label) {
  const n = norm(v ?? {});
  if (!Number.isFinite(n) || n === 0)
    throw new RangeError(`Vector ${label} degenerado`);
  return n;
}

/** Fracción iluminada k = (1 + cos i)/2, i = ángulo Sol–Luna–Tierra. */
export function illuminatedFraction(sunGeo, moonGeo) {
  assertVector(sunGeo, 'Sol');
  const moonNorm = assertVector(moonGeo, 'Luna');
  const toSun = {
    x: sunGeo.x - moonGeo.x,
    y: sunGeo.y - moonGeo.y,
    z: sunGeo.z - moonGeo.z,
  };
  const toSunNorm = assertVector(toSun, 'Luna→Sol');
  const cosPhase =
    -(toSun.x * moonGeo.x + toSun.y * moonGeo.y + toSun.z * moonGeo.z) /
    (toSunNorm * moonNorm);
  return (1 + Math.max(-1, Math.min(1, cosPhase))) / 2;
}

/** Creciente si la Luna va por delante del Sol en longitud eclíptica (0–180°). */
export function isWaxing(sunGeo, moonGeo) {
  const cross = {
    x: sunGeo.y * moonGeo.z - sunGeo.z * moonGeo.y,
    y: sunGeo.z * moonGeo.x - sunGeo.x * moonGeo.z,
    z: sunGeo.x * moonGeo.y - sunGeo.y * moonGeo.x,
  };
  return (
    cross.x * ECLIPTIC_POLE.x +
      cross.y * ECLIPTIC_POLE.y +
      cross.z * ECLIPTIC_POLE.z >
    0
  );
}

const NAMES = Object.freeze([
  [0.03, 'luna nueva', 'luna nueva'],
  [0.4, 'creciente', 'menguante'],
  [0.6, 'cuarto creciente', 'cuarto menguante'],
  [0.97, 'gibosa creciente', 'gibosa menguante'],
  [1, 'luna llena', 'luna llena'],
]);

/** Nombre de la fase en español para una fracción iluminada 0..1. */
export function phaseName(fraction, waxing) {
  if (!(fraction >= 0 && fraction <= 1))
    throw new RangeError(`Fracción iluminada fuera de 0..1: ${fraction}`);
  const [, wax, wane] = NAMES.find(([limit]) => fraction <= limit);
  return waxing ? wax : wane;
}

/** Diámetro aparente (°) de la Luna a `distanceKm` del observador. */
export function apparentDiameterDeg(distanceKm) {
  if (!(distanceKm > MOON_MEAN_RADIUS_KM))
    throw new RangeError(`Distancia inválida: ${distanceKm} km`);
  return (2 * Math.asin(MOON_MEAN_RADIUS_KM / distanceKm) * 180) / Math.PI;
}
