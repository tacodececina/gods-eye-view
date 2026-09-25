/** Retícula lat/lon de Cesium y su interruptor #eye-grid. */
import * as Cesium from 'cesium';
import { $ } from './shellDom.js';

const GRID_COLOR = '#a6d7c2';
const GRID_ALPHA = 0.14;
const MERIDIAN_STEP = 30;
const PARALLEL_STEP = 30;
const SAMPLE_STEP = 2;

function addGraticuleLines(grid) {
  const line = (positions) =>
    grid.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(positions),
        width: 1,
        material:
          Cesium.Color.fromCssColorString(GRID_COLOR).withAlpha(GRID_ALPHA),
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
  for (let lon = -180; lon < 180; lon += MERIDIAN_STEP) {
    const p = [];
    for (let lat = -89; lat <= 89; lat += SAMPLE_STEP) p.push(lon, lat);
    line(p);
  }
  for (let lat = -60; lat <= 60; lat += PARALLEL_STEP) {
    const p = [];
    for (let lon = -180; lon <= 180; lon += SAMPLE_STEP) p.push(lon, lat);
    line(p);
  }
}

/**
 * @param {object} deps
 * @param {object} deps.viewer Cesium viewer.
 * @param {import('../uiLifetime.js').UiLifetime} deps.lifetime Dueño de listeners.
 * @param {(dispose: () => void) => void} deps.defer Registro de limpieza.
 * @returns {void}
 */
export function mountGraticule({ viewer, lifetime, defer }) {
  const grid = new Cesium.CustomDataSource('eyeinsky-graticule');
  viewer.dataSources.add(grid);
  defer(() => viewer.dataSources.remove(grid, true));
  addGraticuleLines(grid);
  lifetime.listen($('eye-grid'), 'click', () => {
    grid.show = !grid.show;
    $('eye-grid').setAttribute('aria-pressed', String(grid.show));
    viewer.scene.requestRender();
  });
}
