import * as Cesium from 'cesium';

/**
 * Medidas por píxeles del arnés P5 (puras, sin navegador): diámetro aparente
 * del disco iluminado y fracción iluminada por la posición del terminador.
 * La imagen es un array de luminancias (0–255) de `size × size`.
 */

const MIN_CONTRAST = 25;
const HALF_BAND = 4;
const STEP_PX = 0.5;
const LOW_LEVEL = 0.1;
const HIGH_LEVEL = 0.3;

const at = (lum, size, x, y) => {
  const xi = Math.round(x);
  const yi = Math.round(y);
  return xi < 0 || yi < 0 || xi >= size || yi >= size ? 0 : lum[yi * size + xi];
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Extensión (px) de los píxeles por encima de `threshold`: caja y diámetro. */
export function litExtentPx(lum, size, threshold) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      if (lum[y * size + x] <= threshold) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  if (minX > maxX) return { diameterPx: 0, width: 0, height: 0 };
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  return { diameterPx: Math.max(width, height), width, height };
}

/** Perfil de luminancia del limbo iluminado (+r) al opuesto (−r), suavizado. */
function profileAlong(lum, size, { center, axis, radiusPx }) {
  const norm = Math.hypot(axis.dx, axis.dy);
  const ux = axis.dx / norm;
  const uy = axis.dy / norm;
  const raw = [];
  for (let s = radiusPx; s >= -radiusPx; s -= STEP_PX) {
    const band = [];
    for (let o = -HALF_BAND; o <= HALF_BAND; o += 1)
      band.push(
        at(lum, size, center.x + ux * s - uy * o, center.y + uy * s + ux * o),
      );
    raw.push({ s, value: median(band) });
  }
  return raw.map((point, i) => ({
    s: point.s,
    value: median(raw.slice(Math.max(0, i - 2), i + 3).map((p) => p.value)),
  }));
}

/** Primer cruce (desde el limbo) del nivel `level` ∈ (0,1) entre suelo y pico. */
function crossing(profile, floor, peak, level) {
  const target = floor + level * (peak - floor);
  const start = profile.findIndex((p) => p.value === peak);
  for (let i = start + 1; i < profile.length; i += 1)
    if (profile[i].value <= target) return profile[i].s;
  return null;
}

/**
 * Terminador (s en px) desde los cruces del 10 % y el 30 %. Sobre el eje que
 * pasa por el centro, s = r·sin θ y Lambert da p − suelo ∝ sin(θ − θt):
 * sin(a)/sin(a + d) = 1/3 con a = θ10 − θt y d = θ30 − θ10.
 */
function terminatorFromCrossings(low, high, r) {
  const theta = (s) => Math.asin(Math.max(-1, Math.min(1, s / r)));
  const d = theta(high) - theta(low);
  const ratio = LOW_LEVEL / HIGH_LEVEL;
  const a = Math.atan((ratio * Math.sin(d)) / (1 - ratio * Math.cos(d)));
  return r * Math.sin(theta(low) - a);
}

/**
 * Fracción iluminada k por el terminador a lo largo del eje Sol en pantalla:
 * extensión iluminada = r(1 + cos i) = 2rk.
 * @returns {{status: 'ok'|'not-measurable', fraction: number|null, detail?: object}}
 */
export function litFractionAlongAxis(lum, size, geometry) {
  const profile = profileAlong(lum, size, geometry);
  const inner = profile.slice(
    Math.ceil(profile.length * 0.03),
    -Math.ceil(profile.length * 0.03),
  );
  const peak = Math.max(...inner.map((p) => p.value));
  const floor = median(
    inner.slice(-Math.ceil(inner.length * 0.1)).map((p) => p.value),
  );
  if (!(peak - floor >= MIN_CONTRAST))
    return {
      status: 'not-measurable',
      fraction: null,
      detail: { peak, floor },
    };
  const low = crossing(inner, floor, peak, LOW_LEVEL);
  const high = crossing(inner, floor, peak, HIGH_LEVEL);
  if (low === null || high === null)
    return {
      status: 'not-measurable',
      fraction: null,
      detail: { peak, floor },
    };
  const r = geometry.radiusPx;
  const terminator = terminatorFromCrossings(low, high, r);
  const fraction = Math.min(1, Math.max(0, (r - terminator) / (2 * r)));
  return {
    status: 'ok',
    fraction,
    detail: { peak, floor, low, high, terminator },
  };
}

/** Longitud de la racha iluminada desde el centro en la dirección (dx, dy). */
function runFromCenter(lum, size, threshold, dx, dy) {
  const c = Math.floor(size / 2);
  let dark = 0;
  let last = 0;
  for (let step = 1; step < size; step += 1) {
    const value = at(lum, size, c + dx * step, c + dy * step);
    if (value > threshold) {
      last = step;
      dark = 0;
    } else if (++dark >= 3) break;
  }
  return last;
}

/**
 * Diámetro por las cuerdas horizontal y vertical que pasan por el centro
 * (la mayor): no se deja inflar por estrellas sueltas del fondo.
 */
export function chordDiameterPx(lum, size, threshold) {
  const horizontal =
    runFromCenter(lum, size, threshold, 1, 0) +
    runFromCenter(lum, size, threshold, -1, 0) +
    1;
  const vertical =
    runFromCenter(lum, size, threshold, 0, 1) +
    runFromCenter(lum, size, threshold, 0, -1) +
    1;
  return { diameterPx: Math.max(horizontal, vertical), horizontal, vertical };
}

/**
 * Separación (′) entre el punto sublunar de la dirección ECEF `fixed` (el
 * rayo geocéntrico corta el elipsoide WGS84) y el de Horizons (lon/lat
 * planetodéticas aparentes del fixture).
 */
export function subPointArcmin(fixed, row) {
  const dir = Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(fixed.x, fixed.y, fixed.z),
    new Cesium.Cartesian3(),
  );
  const ray = new Cesium.Ray(Cesium.Cartesian3.ZERO, dir);
  const hit = Cesium.IntersectionTests.rayEllipsoid(
    ray,
    Cesium.Ellipsoid.WGS84,
  );
  const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(
    Cesium.Ray.getPoint(ray, hit.stop, new Cesium.Cartesian3()),
  );
  const lonDeg = Cesium.Math.toDegrees(carto.longitude);
  const dLon = ((lonDeg - row.apparentLonDeg + 540) % 360) - 180;
  const dLat = Cesium.Math.toDegrees(carto.latitude) - row.apparentLatDeg;
  const cosLat = Math.cos(Cesium.Math.toRadians(row.apparentLatDeg));
  return Math.hypot(dLon * cosLat, dLat) * 60;
}

/** Separación (′) entre un punto lon/lat (°) y el aparente de Horizons. */
export function lonLatArcmin({ lonDeg, latDeg }, row) {
  const dLon = ((lonDeg - row.apparentLonDeg + 540) % 360) - 180;
  const dLat = latDeg - row.apparentLatDeg;
  const cosLat = Math.cos(Cesium.Math.toRadians(row.apparentLatDeg));
  return Math.hypot(dLon * cosLat, dLat) * 60;
}
