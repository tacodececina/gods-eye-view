/**
 * `window.__eyeinsky`: la API de los arneses. Su forma es un contrato: no se
 * añaden, quitan ni renombran claves sin cambiar los arneses en RED.
 */
import { isDetectionSuspended } from '../../data/detection.js';
import {
  getSuppressedOverlaySources,
  getWorldOverlayDiagnostics,
} from '../../overlays/worldOverlay.js';

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} Manejador de depuración publicado en window.
 */
export function mountDebugHandle(shell) {
  const { state, defer } = shell;
  const debug = {
    readView: shell.readView,
    restoreView: shell.restoreView,
    refresh: shell.refresh,
    openView: shell.openView,
    get selectedId() {
      return state.selection;
    },
    get rows() {
      return state.rows;
    },
    earthMoon: shell.earthMoon.debug,
    /** Arnés P5: despeje de SISTEMA (callouts de detección y sismos). */
    systemDeclutter: () => {
      const overlay = getWorldOverlayDiagnostics();
      return {
        active: shell.systemDeclutter.isActive(),
        detectionSuspended: isDetectionSuspended(),
        suppressedSources: [...getSuppressedOverlaySources()],
        paintedEarthquakes: overlay.paintedBySource.earthquakes ?? 0,
      };
    },
  };
  window.__eyeinsky = debug;
  defer(() => {
    if (window.__eyeinsky === debug) delete window.__eyeinsky;
  });
  return debug;
}
