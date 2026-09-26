/**
 * P5 T8: tira TIEMPO, capas en vivo suspendidas, Luna y retorno a Tierra.
 * El shell solo presta sus autoridades; la lógica vive en eyeinskyEarthMoon.
 * SISTEMA TIERRA–LUNA aparta callouts (GEO) y sismos que tapan la Tierra.
 */
import { mountEyeEarthMoon } from '../eyeinskyEarthMoon.js';
import { createSystemDeclutter } from '../eyeinskySystemView.js';
import {
  isDetectionSuspended,
  resumeDetection,
  suspendDetection,
} from '../../data/detection.js';
import { setOverlaySourceSuppressed } from '../../overlays/worldOverlay.js';
import { createMoonActionsHost, placeMoonActions } from './moonActionsHost.js';

function earthMoonShell(shell, systemDeclutter) {
  const { state, dataManager, styleManager } = shell;
  const select = (context, explicit) =>
    shell.publishDossier({
      type: 'select',
      context: shell.withResolvedMedia(context),
      explicit,
    });
  return {
    getDossier: () => state.dossierState,
    getDockState: () => state.dockState,
    isFollowing: shell.isFollowingCurrentTarget,
    releaseFollow: () => {
      if (shell.isFollowingCurrentTarget())
        shell.toggleFollowCurrentTarget(true);
    },
    refocus: (context) =>
      Boolean(
        dataManager.layers
          .get(context.layerId || '')
          ?.module?.refocusTrackedById?.(context.stableId, {
            origin: 'user',
          }),
      ),
    select: (context) => select(context, true),
    selectView: () => select(shell.currentViewContext(), false),
    refresh: (context) =>
      shell.publishDossier({
        type: 'refresh',
        context: shell.withResolvedMedia(context),
      }),
    collapseDock: () => shell.publishDock({ type: 'collapse' }),
    restoreDock: (dock) => {
      shell.publishDock({ type: 'select-pane', pane: dock.pane });
      shell.publishDock({ type: dock.expanded ? 'expand' : 'collapse' });
    },
    navigate: (noun, run) => styleManager._navigation.runOrientation(noun, run),
    notice: shell.notice,
    declutter: (on) => systemDeclutter.set(on),
    onSuspensionChange: () => shell.activeLayers?.sync(),
  };
}

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountEarthMoonBridge(shell) {
  const { viewer, dataManager, reduced, styleManager, defer } = shell;
  const systemDeclutter = createSystemDeclutter({
    detection: {
      suspend: suspendDetection,
      resume: resumeDetection,
      isSuspended: isDetectionSuspended,
    },
    overlays: { setSuppressed: setOverlaySourceSuppressed },
  });
  shell.systemDeclutter = systemDeclutter;
  defer(() => systemDeclutter.destroy());
  // Fase visual T3: el reloj vive en el pie global; las acciones de la Luna en
  // un contenedor que se mueve entre su fila de capa y su panel (D1-A).
  shell.moonActionsHost = createMoonActionsHost(document);
  document.querySelector('[data-eye-moon-menu]')?.append(shell.moonActionsHost);
  defer(() => {
    shell.moonActionsHost.remove();
    shell.moonActionsHost = null;
  });
  const earthMoon = mountEyeEarthMoon({
    viewer,
    dataManager,
    reduced,
    hosts: {
      time: document.querySelector('[data-eye-time-host]'),
      moon: shell.moonActionsHost,
    },
    ring: {
      get: () => styleManager.celestialRingEnabled === true,
      set: (on) => styleManager.setCelestialRingEnabled(on),
    },
    shell: earthMoonShell(shell, systemDeclutter),
  });
  shell.earthMoon = earthMoon;
  defer(() => earthMoon.destroy());
  placeMoonActions(shell);
}
