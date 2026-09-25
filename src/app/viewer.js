import * as Cesium from 'cesium';
import {
  bindViewerSceneClock,
  unbindViewerSceneClock,
} from '../time/sceneClock.js';

/**
 * Create the standard globe viewer in caller-owned, visible containers.
 *
 * P5: `viewer.clock` is the single scene clock, governed by
 * src/time/sceneClock.js and started LIVE (it animates without the animation
 * widget). Data sources may not suspend it. Callers release it with
 * `unbindViewerSceneClock(viewer)` before `viewer.destroy()`.
 * @param {{container: string|Element, creditContainer: Element,
 *   Viewer?: typeof Cesium.Viewer}} options `Viewer` is a test seam.
 */
export function createApplicationViewer({
  container,
  creditContainer,
  Viewer = Cesium.Viewer,
}) {
  if (!container || !creditContainer)
    throw new TypeError('Viewer and credit containers are required');
  const viewer = new Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    selectionIndicator: false,
    infoBox: false,
    baseLayer: false,
    creditContainer,
    msaaSamples: 4,
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
  });
  try {
    viewer.targetFrameRate = 60;
    viewer.allowDataSourcesToSuspendAnimation = false;
    bindViewerSceneClock(viewer);
    viewer.scene.globe.show = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.skyAtmosphere.atmosphereLightIntensity = 18;
    viewer.scene.skyAtmosphere.saturationShift = -0.12;
    viewer.scene.skyAtmosphere.brightnessShift = -0.08;
    return viewer;
  } catch (error) {
    unbindViewerSceneClock(viewer);
    viewer.destroy();
    throw error;
  }
}
