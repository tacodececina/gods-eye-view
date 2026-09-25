import * as Cesium from 'cesium';

/**
 * Rótulos de época del HUD con el reloj ÚNICO de escena (P5 T7): el sello UTC
 * y la elevación solar siguen a `viewer.clock`, no a la pared. En pausa o
 * simulación el sello lo dice.
 */

const scratchCarto = new Cesium.Cartographic();
const scratchUp = new Cesium.Cartesian3();
const scratchSun = new Cesium.Cartesian3();

/** Elevación (°) del Sol fijo (ECEF, m) sobre el horizonte geodésico en lat/lon. */
export function sunElevationDeg(sunFixedM, latDeg, lonDeg) {
  if (!sunFixedM) return Number.NaN;
  Cesium.Cartographic.fromDegrees(lonDeg, latDeg, 0, scratchCarto);
  Cesium.Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(
    scratchCarto,
    scratchUp,
  );
  Cesium.Cartesian3.normalize(sunFixedM, scratchSun);
  const cos = Cesium.Cartesian3.dot(scratchUp, scratchSun);
  return Cesium.Math.toDegrees(Math.asin(Math.max(-1, Math.min(1, cos))));
}

/** 'YYYY-MM-DD HH:MM:SSZ' de la escena (+ « · PAUSA» / « · SIM ×N»). */
export function formatSceneUtc(sceneState, wallNow = () => new Date()) {
  const iso = sceneState?.currentIso ?? wallNow().toISOString();
  const stamp = `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`;
  if (sceneState?.mode === 'paused') return `${stamp} · PAUSA`;
  if (sceneState?.mode === 'simulated')
    return `${stamp} · SIM ×${sceneState.multiplier}`;
  return stamp;
}
