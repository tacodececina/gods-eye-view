/**
 * Encuadres de cámara de la Luna (P5 T8), en matemática pura (m, ECEF):
 *
 * - `aimOrientation`: APUNTAR A LA LUNA reorienta sin mover la cámara.
 * - `earthMoonFraming`: SISTEMA TIERRA–LUNA coloca la cámara de lado respecto
 *   de la línea Tierra–Luna, a la distancia que hace caber ambas esferas en el
 *   FOV MÍNIMO (Cesium aplica `fov` a la dimensión mayor del lienzo: en
 *   vertical, la estrecha es la horizontal).
 */

export const EARTH_RADIUS_M = 6_378_137;
const MOON_RADIUS_M = 1_737_400;
/** Holgura del encuadre: deja sitio a la retícula junto a los bordes. */
const FRAMING_MARGIN = 1.3;

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

function unit(a, label = 'vector') {
  const length = Math.sqrt(dot(a, a));
  if (!Number.isFinite(length) || length < 1e-9)
    throw new RangeError(`${label} degenerado`);
  return scale(a, 1 / length);
}

/** FOV (rad) de la dimensión menor del lienzo para el `fov` de Cesium. */
export function minimumFovRad(fovRad, aspect) {
  const half = Math.tan(fovRad / 2);
  return aspect >= 1
    ? 2 * Math.atan(half / aspect)
    : 2 * Math.atan(half * aspect);
}

/** `up` ⟂ `direction`, lo más parecido a `preferred` (o a otro eje si es paralelo). */
function orthogonalUp(direction, preferred) {
  for (const candidate of [
    preferred,
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 0 },
  ]) {
    const projected = sub(
      candidate,
      scale(direction, dot(candidate, direction)),
    );
    if (Math.sqrt(dot(projected, projected)) > 1e-6) return unit(projected);
  }
  throw new RangeError('No hay up ortogonal');
}

/**
 * @param {{cameraPosition:object, target:object, currentUp:object}} input
 * @returns {{direction:object, up:object}}
 */
export function aimOrientation({ cameraPosition, target, currentUp }) {
  const direction = unit(sub(target, cameraPosition), 'dirección');
  return { direction, up: orthogonalUp(direction, currentUp) };
}

/** Parte mínima del alto que se considera libre aunque el dock sea enorme. */
const MIN_FREE_FRACTION = 0.4;

/**
 * FOV útil y giro para el ÁREA LIBRE del lienzo (sobre la franja del dock):
 * el objetivo se centra en ella, no bajo el dock.
 * @param {{fovRad:number, width:number, height:number, bottomBandPx:number}} v
 * @returns {{minFovRad:number, tiltRad:number}}
 */
export function viewportFit({ fovRad, width, height, bottomBandPx = 0 }) {
  const aspect = width / Math.max(1, height);
  const fovx =
    aspect >= 1 ? fovRad : 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
  const fovy =
    aspect >= 1 ? 2 * Math.atan(Math.tan(fovRad / 2) / aspect) : fovRad;
  const focalY = height / 2 / Math.tan(fovy / 2);
  const free = Math.max(height * MIN_FREE_FRACTION, height - bottomBandPx);
  const freeFov = 2 * Math.atan(free / 2 / focalY);
  const tiltRad = Math.atan((height - free) / 2 / focalY);
  return { minFovRad: Math.min(fovx, freeFov), tiltRad };
}

/**
 * Gira la mirada hacia abajo `tiltRad` (sobre el eje derecho): lo que estaba
 * en el centro sube en pantalla, al centro del área libre.
 */
export function tiltTowardFreeArea({ direction, up }, tiltRad) {
  const c = Math.cos(tiltRad);
  const s = Math.sin(tiltRad);
  return {
    direction: add(scale(direction, c), scale(up, -s)),
    up: add(scale(direction, s), scale(up, c)),
  };
}

/**
 * @param {{moonFixedM:object, fovRad?:number, aspect?:number,
 *   minFovRad?:number, margin?:number}} input `minFovRad` (FOV útil del
 *   área libre) manda sobre `fovRad`/`aspect`.
 * @returns {{destination:object, direction:object, up:object,
 *   distanceM:number, minFovRad:number}}
 */
export function earthMoonFraming({
  moonFixedM,
  fovRad,
  aspect,
  minFovRad,
  margin = FRAMING_MARGIN,
}) {
  const line = unit(moonFixedM, 'línea Tierra–Luna');
  const side = unit(
    Math.abs(line.z) > 0.9
      ? cross(line, { x: 1, y: 0, z: 0 })
      : cross(line, { x: 0, y: 0, z: 1 }),
  );
  const moonDistance = Math.sqrt(dot(moonFixedM, moonFixedM));
  const halfExtent = moonDistance / 2 + Math.max(EARTH_RADIUS_M, MOON_RADIUS_M);
  const minFov = minFovRad ?? minimumFovRad(fovRad, aspect);
  const distanceM = (halfExtent * margin) / Math.tan(minFov / 2);
  const center = scale(moonFixedM, 0.5);
  const destination = add(center, scale(side, distanceM));
  const direction = scale(side, -1);
  const up = unit(cross(direction, line));
  return { destination, direction, up, distanceM, minFovRad: minFov };
}
