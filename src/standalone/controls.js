import { createApplicationControls } from '../app/controls.js';
import { getStandaloneCatalog } from './catalog.js';
import { EyeinskyHud } from '../ui/eyeinskyHud.js';
import { prepareEyeShell } from '../ui/eyeinskyShell.js';
import { readGlobeFlags } from '../ui/eyeinskyGlobeFlags.js';
import { resolveHomePose, setHomeView } from '../ui/shell/homeView.js';
export function createStandaloneControls(options) {
  prepareEyeShell();
  return createApplicationControls({
    services: { IntelHUD: EyeinskyHud, workspaceLayout: true },
    initialView(viewer) {
      // La pose Global (legacy o solar, §2.3) sale de un solo sitio; la
      // entrada animada, si la hay, la monta el shell.
      setHomeView(
        viewer,
        resolveHomePose(viewer, readGlobeFlags(location.search)),
      );
      return () => viewer.camera.cancelFlight();
    },
    catalog: options?.catalog ?? getStandaloneCatalog(),
    ...options,
  });
}
