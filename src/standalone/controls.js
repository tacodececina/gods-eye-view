import { createApplicationControls } from '../app/controls.js';
import { getStandaloneCatalog } from './catalog.js';
import * as Cesium from 'cesium';
import { EyeinskyHud } from '../ui/eyeinskyHud.js';
import { prepareEyeShell } from '../ui/eyeinskyShell.js';
export function createStandaloneControls(options) {
  prepareEyeShell();
  return createApplicationControls({
    services: { IntelHUD: EyeinskyHud, workspaceLayout: true },
    initialView(viewer) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          -92,
          18,
          innerWidth < 650 ? 26000000 : 18000000,
        ),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
      return () => viewer.camera.cancelFlight();
    },
    catalog: options?.catalog ?? getStandaloneCatalog(),
    ...options,
  });
}
