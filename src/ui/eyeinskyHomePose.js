/**
 * Pose de inicio (fase visual T2, §2.3), pura. El Sol entra como vector ECEF
 * (`celestialFor(viewer).sunFixedAt(<tiempo de escena>)`): la pose sigue al
 * reloj de escena P5, no a `Date`.
 *
 * - `solar`: centro 60° al este del punto subsolar y lat 20°, pitch −90 (globo
 *   centrado) y un rumbo que deja el Sol arriba a la izquierda, a 60° de la
 *   vertical: el terminador sale a 30° de la vertical (luz del noroeste, la
 *   convención cartográfica).
 * - `tilt`: la propuesta del sistema de diseño (pitch −70, rumbo −20),
 *   ORBITANDO el punto (lon, lat) a distancia `alt` (`frame: 'orbit'`): con
 *   la misma cámara y pitch −70 el disco caía fuera de cuadro.
 * - `legacy`: la pose anterior a la fase.
 */

const RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6_378_137;
const MOBILE_WIDTH = 650;
const DESKTOP_MIN_WIDTH = 1024;
/** Home Global (p012 `home-stable`): ≥ 17 000 km en escritorio. */
export const GLOBAL_MIN_ALT_M = 17_000_000;
const CENTER_OFFSET_DEG = 60;
const CENTER_LAT_DEG = 20;
/** Ángulo del Sol en pantalla, horario desde «arriba» (300° = arriba-izq.). */
const SUN_SCREEN_BEARING_DEG = 300;

const LEGACY = Object.freeze({ lon: -92, lat: 18, heading: 0, pitch: -90 });

const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Altura a la que el disco terrestre ocupa `fill` del lado corto.
 * @param {{viewport: {width: number, height: number}, fovy: number,
 *   fill: number, radius?: number}} options `fovy` vertical en radianes.
 * @returns {number} Altura sobre el elipsoide (m).
 */
export function fitHeight({ viewport, fovy, fill, radius = EARTH_RADIUS_M }) {
  const focal = viewport.height / 2 / Math.tan(fovy / 2);
  const discRadiusPx = (fill * Math.min(viewport.width, viewport.height)) / 2;
  const angular = Math.atan(discRadiusPx / focal);
  return radius / Math.sin(angular) - radius;
}

function legacyPose(viewport) {
  return {
    ...LEGACY,
    alt: viewport.width < MOBILE_WIDTH ? 26_000_000 : 18_000_000,
  };
}

/** Acimut (° desde el norte, horario) de la proyección del Sol en (lat, lon). */
function sunAzimuthDeg(sun, latDeg, lonDeg) {
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD;
  const east = -Math.sin(lon) * sun[0] + Math.cos(lon) * sun[1];
  const north =
    -Math.sin(lat) * Math.cos(lon) * sun[0] -
    Math.sin(lat) * Math.sin(lon) * sun[1] +
    Math.cos(lat) * sun[2];
  return Math.atan2(east, north) / RAD;
}

/**
 * @param {{sunEcef: number[]|{x:number,y:number,z:number}|null,
 *   viewport: {width: number, height: number}, fovy: number,
 *   mode?: 'solar'|'tilt'|'legacy'}} options
 * @returns {{lon: number, lat: number, alt: number, heading: number,
 *   pitch: number, frame?: 'camera'|'orbit'}} Grados y metros; con
 *   `orbit`, rumbo, inclinación y `alt` (distancia) son respecto al punto.
 */
/**
 * Resuelve `auto`: inclinada (tilt) en escritorio, cenital (solar) en
 * teléfono, donde la inclinación no se aprecia y recorta el disco.
 * @param {string} homePose Valor del flag.
 * @param {number} width Ancho del viewport en px.
 * @returns {'solar'|'tilt'|'legacy'}
 */
export function homePoseModeFor(homePose, width) {
  if (homePose === 'auto') return width >= MOBILE_WIDTH ? 'tilt' : 'solar';
  return homePose === 'tilt' || homePose === 'legacy' ? homePose : 'solar';
}

export function solarHomePose({ sunEcef, viewport, fovy, mode = 'solar' }) {
  const sun = Array.isArray(sunEcef)
    ? sunEcef
    : sunEcef
      ? [sunEcef.x, sunEcef.y, sunEcef.z]
      : null;
  const norm = sun ? Math.hypot(...sun) : 0;
  if (mode === 'legacy' || !(norm > 0)) return legacyPose(viewport);
  const unit = sun.map((v) => v / norm);
  const lon = wrap180(Math.atan2(unit[1], unit[0]) / RAD + CENTER_OFFSET_DEG);
  const lat = CENTER_LAT_DEG;
  // La pose inclinada extiende el disco: se encuadra algo más lejos para que
  // el anillo celeste conserve su holgura desde el inicio (P5 ring check).
  const fill =
    viewport.width < MOBILE_WIDTH ? 0.9 : mode === 'tilt' ? 0.64 : 0.74;
  const floor = viewport.width >= DESKTOP_MIN_WIDTH ? GLOBAL_MIN_ALT_M : 0;
  const alt = Math.max(fitHeight({ viewport, fovy, fill }), floor);
  if (mode === 'tilt')
    return { lon, lat, alt, heading: -20, pitch: -70, frame: 'orbit' };
  const heading = wrap180(
    sunAzimuthDeg(unit, lat, lon) - SUN_SCREEN_BEARING_DEG,
  );
  return { lon, lat, alt, heading, pitch: -90, frame: 'camera' };
}
