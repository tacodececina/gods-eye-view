import * as Cesium from 'cesium';
import { UiLifetime } from './uiLifetime.js';
import { mountOperationPanel } from './eyeinskyOperations.js';
import { mountEyeIcons } from './eyeinskyIcons.js';
import { mountEyeinskyLanguage } from './eyeinskyLanguage.js';
import { mountImmersiveMotion } from './eyeinskyImmersiveMotion.ts';
import { resetCameraNorth } from './cameraOrientationControls.js';
import { configureEyeCameraInteraction } from './eyeinskyCameraInteraction.js';
import { mountEyeScenePolicy } from './eyeinskyScenePolicy.js';
import { createDecorativeDecoder } from './eyeinskyDecode.js';
import { $ } from './shell/shellDom.js';
import { createShellState } from './shell/shellState.js';
import { mountVisualViewport } from './shell/visualViewport.js';
import { createNotice, mountDialog } from './shell/noticeDialog.js';
import {
  createPanels,
  mountCleanView,
  mountPanelNavigation,
} from './shell/shellPanels.js';
import { createCamera, mountCameraInstruments } from './shell/shellCamera.js';
import {
  createSignals,
  mountSignalControls,
  mountSignalFeed,
} from './shell/shellSignals.js';
import { createViewState } from './shell/shellViewState.js';
import { createLayers, mountLayerSurfaces } from './shell/shellLayers.js';
import { mountGraticule } from './shell/graticule.js';
import {
  createDockTargets,
  createDossierAuthority,
  mountDockSurfaces,
} from './shell/dockBridge.js';
import { initDockState, mountDockSources } from './shell/dockSources.js';
import {
  createSurfaceSuspension,
  mountSurfaceSuspension,
} from './shell/surfaceSuspension.js';
import { mountEarthMoonBridge } from './shell/earthMoonBridge.js';
import { createShareHelp, mountCommands } from './shell/shellCommands.js';
import { mountDebugHandle } from './shell/shellDebug.js';

const MAX_SHARED_HASH_LENGTH = 12000;
const OSM_CREDIT_HTML =
  'Referencias de infraestructura © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · Open Infrastructure Map · ODbL';

/** Relocate the live components before their owners bind; no cloned IDs or hidden backup shell. */
export function prepareEyeShell() {
  const move = (id, host) => {
    if ($(id) && $(host)) $(host).append($(id));
  };
  move('scene-panel', 'eye-director-host');
  move('scene-runtime', 'eye-director-host');
  move('cctv-panel', 'eye-sensor-host');
  move('radio-panel', 'eye-sensor-host');
  move('left-panel-stack', 'eye-native-layers');
  move('right-context-rail', 'eye-context-host');
  move('command-dock', 'eye-display-host');
  move('pp-toggles', 'eye-display-host');
  move('style-indicator', 'eye-display-host');
  move('intel-hud', 'eye-hud-host');
  const nativeSearch = document.querySelector('.location-search-wrap');
  if (nativeSearch && $('eye-search-host'))
    $('eye-search-host').append(nativeSearch);
  const cleanExit = $('clean-view-exit');
  if (cleanExit) document.body.append(cleanExit);
  for (const panel of document.querySelectorAll(
    '#eye-workspace .panel-collapsible',
  ))
    panel.classList.remove('collapsed');
  $('eye-native-stage')?.remove();
}

/**
 * Cabina fuerza abiertos los «Datos avanzados de vista» y, al salir, los deja
 * como la persona los tenía.
 * @param {(dispose: () => void) => void} defer Registro de limpieza.
 * @returns {HTMLDetailsElement|null} El HUD avanzado.
 */
function mountCockpitTelemetry(defer) {
  const advancedTelemetry = document.querySelector('.eye-hud-details');
  let advancedTelemetryWasOpen = advancedTelemetry?.open ?? false;
  let cockpitTelemetryForced = false;
  const syncCockpitTelemetry = () => {
    if (!advancedTelemetry) return;
    const cockpit = document.body.classList.contains('cockpit-mode');
    if (cockpit && !cockpitTelemetryForced) {
      advancedTelemetryWasOpen = advancedTelemetry.open;
      advancedTelemetry.open = true;
      cockpitTelemetryForced = true;
    } else if (!cockpit && cockpitTelemetryForced) {
      advancedTelemetry.open = advancedTelemetryWasOpen;
      cockpitTelemetryForced = false;
    }
  };
  const cockpitObserver = new MutationObserver(syncCockpitTelemetry);
  cockpitObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
  defer(() => cockpitObserver.disconnect());
  return advancedTelemetry;
}

/** Atribución OSM estática y rótulo del mapa activo en la telemetría. */
function mountAttributionAndMap({
  viewer,
  mapStackController,
  lifetime,
  defer,
}) {
  const osmCredit = new Cesium.Credit(OSM_CREDIT_HTML, false);
  viewer.cesiumWidget.creditDisplay.addStaticCredit(osmCredit);
  defer(() => viewer.cesiumWidget.creditDisplay.removeStaticCredit(osmCredit));
  const mapListener = () => {
    $('eye-map-label').textContent =
      mapStackController.getActiveStack()?.label || 'Sin cartografía';
  };
  lifetime.listen(window, 'gev:map-stack-changed', mapListener);
  mapListener();
}

/** Restaura una vista compartida por `#eye=` (acotada y validada). */
function restoreSharedView(shell) {
  if (!location.hash.startsWith('#eye=')) return;
  try {
    if (location.hash.length > MAX_SHARED_HASH_LENGTH)
      throw new Error('Enlace demasiado largo');
    void shell
      .restoreView(JSON.parse(decodeURIComponent(location.hash.slice(5))))
      .then((result) => shell.notice(result.message))
      .catch((e) => shell.notice(`No se restauró el enlace: ${e.message}`));
  } catch (e) {
    shell.notice(`Enlace inválido: ${e.message}`);
  }
}

/**
 * Autoridades sin efectos: funciones que los módulos se piden entre sí por el
 * contexto `shell`. Crearlas no registra listeners ni limpiezas.
 */
function createAuthorities(shell) {
  return {
    ...createPanels(shell),
    ...createCamera(shell),
    ...createSignals(shell),
    ...createViewState(shell),
    ...createLayers(shell),
    ...createDockTargets(shell),
    ...createDossierAuthority(shell),
    setEyeSurfaceSuspension: createSurfaceSuspension(shell),
  };
}

/**
 * One UI lifetime, observing the existing manager and the existing USGS layer.
 *
 * Composición: el ORDEN de montaje (listeners, observadores y `defer`) es el
 * de la función monolítica original, paso por paso. `shell` es el contexto
 * compartido de esta vida: los módulos lo reciben y se llaman a través de él,
 * por eso se completa aquí (única mutación, en la raíz de composición).
 */
export function mountEyeinsky({ scene, controls, data, tools, signal, defer }) {
  const { viewer, mapStackController } = scene,
    { styleManager } = controls,
    { dataManager } = data;
  const lifetime = new UiLifetime();
  defer(() => lifetime.destroy());
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const shell = {
    viewer,
    mapStackController,
    styleManager,
    dataManager,
    signal,
    defer,
    lifetime,
    reduced,
    state: createShellState(),
  };
  defer(
    configureEyeCameraInteraction(viewer, (kind) => {
      const generation =
        styleManager._navigation.interruptHumanNavigation(kind);
      shell.applyDossier();
      return generation;
    }),
  );
  const releaseIcons = mountEyeIcons();
  defer(releaseIcons);
  defer(mountEyeinskyLanguage());
  defer(mountEyeScenePolicy(viewer));
  const motion = mountImmersiveMotion({
    root: document.body,
    signal,
    reducedMotion: reduced,
  });
  defer(() => motion.destroy());
  const panelKickerDecode = createDecorativeDecoder($('eye-panel-kicker'), {
    reducedMotion: reduced,
  });
  defer(() => panelKickerDecode.destroy());
  mountVisualViewport({ lifetime, defer });
  const advancedTelemetry = mountCockpitTelemetry(defer);
  Object.assign(shell, {
    panelKickerDecode,
    setSurface: (id, open) => motion.setOpen($(id), open),
    notice: createNotice({ lifetime }),
    // Norte pasa siempre por la MISMA autoridad de navegación (riel y dock).
    runNorth: () =>
      styleManager._navigation.runOrientation('vista', () =>
        resetCameraNorth(viewer),
      ),
    dialog: mountDialog({ lifetime, defer }),
  });
  Object.assign(shell, createAuthorities(shell));
  Object.assign(shell, createShareHelp(shell));
  defer(() => shell.state.restoreController?.abort());
  shell.operations = mountOperationPanel({
    lifetime,
    readView: shell.readView,
    restoreView: shell.restoreView,
    notice: shell.notice,
    dialog: shell.dialog,
    openView: shell.openView,
  });
  mountPanelNavigation(shell);
  mountSignalControls(shell);
  mountSignalFeed(shell);
  mountCameraInstruments(shell);
  mountGraticule({ viewer, lifetime, defer });
  mountDockSurfaces(shell);
  initDockState(shell);
  mountDockSources(shell);
  mountSurfaceSuspension(shell);
  mountEarthMoonBridge(shell);
  mountCleanView(shell);
  mountCommands(shell);
  mountLayerSurfaces(shell, advancedTelemetry);
  mountAttributionAndMap(shell);
  shell.syncLayers();
  restoreSharedView(shell);
  shell.paintFeed();
  return mountDebugHandle(shell);
}
