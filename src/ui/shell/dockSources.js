/**
 * Fuentes del expediente y del dock: contexto observado, ficha de vista viva,
 * reapertura explícita, brújula y actividad (OPS) dentro del dock.
 */
import { createDossierState } from '../eyeinskyDossierModel.js';
import { createMissionDockState } from '../eyeinskyMissionDockModel.js';
import { connectDossierSources } from '../eyeinskyDossierSources.js';
import {
  createActivityState,
  reduceActivity,
} from '../eyeinskyActivityModel.js';
import { connectActivitySources } from '../eyeinskyActivitySources.js';
import { mountEyeActivity } from '../eyeinskyActivity.js';
import { $ } from './shellDom.js';

// Controlador público de CCTV: el mismo módulo que el manager ya registró,
// por la vía que este shell usa para `earthquakes`. No se crea ningún
// controlador simulado ni se toca una propiedad privada nueva.
function cctvController(dataManager) {
  const module = dataManager.layers.get('cctv')?.module;
  return typeof module?.subscribe === 'function' ? module : null;
}

/**
 * Estado inicial del expediente, del dock y de la actividad.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function initDockState(shell) {
  const { state } = shell;
  state.dossierState = createDossierState(shell.currentViewContext());
  state.dockState = createMissionDockState();
  state.dockView = null;
  state.activityState = createActivityState();
}

function mountDossierSources(shell) {
  const { viewer, dataManager, mapStackController, defer } = shell;
  const dossierSources = connectDossierSources({
    viewer,
    dataManager,
    mapStackController,
    cctv: cctvController(dataManager),
    onContext: ({ type, context, explicit }) => {
      // La vista del globo la describe el shell, que es quien puede leer cámara
      // y mapa sin pedirle nada a nadie.
      const enriched = shell.withResolvedMedia(
        context.kind === 'view' ? shell.currentViewContext() : context,
      );
      // Un evento observado nunca es explícito: no roba foco ni reabre.
      shell.publishDossier({ type, context: enriched, explicit });
    },
  });
  defer(() => dossierSources.destroy());
}

// La ficha de vista se mantiene viva con lecturas reales: al terminar un
// movimiento de cámara y cuando cambia el mapa. Es un refresh, así que no
// reabre lo cerrado ni cambia de objetivo.
function mountViewContextSync(shell) {
  const { lifetime, state, viewer, defer } = shell;
  const refreshViewContext = () => {
    if (lifetime.destroyed || state.dossierState.context.kind !== 'view')
      return;
    shell.publishDossier({
      type: 'refresh',
      context: shell.currentViewContext(),
    });
  };
  const removeViewSync =
    viewer.camera.moveEnd.addEventListener(refreshViewContext);
  defer(removeViewSync);
  lifetime.listen(window, 'gev:map-stack-changed', refreshViewContext);
}

function mountDossierReopen(shell) {
  const { lifetime, state } = shell;
  lifetime.listen(document, 'click', (event) => {
    const opener = event.target.closest?.('[data-eye-dossier-open]');
    if (!opener) return;
    // Acción visible para recuperar el expediente vigente tras cerrarlo. En
    // móvil el panel que contiene este botón ocupa la pantalla y mantiene viva
    // la razón `mobile-workspace`: sin retirarla, reabrir dejaba la ficha en
    // display:none. Se sale a Explorar primero y sólo después se mueve el foco.
    shell.openView('explore', opener);
    shell.publishDossier({ type: 'reopen' });
    // Vista limpia manda: si sigue activa, la ficha no debe aparecer ni robar
    // el foco; la reapertura queda registrada para cuando se restaure.
    if (state.suspensionReasons.size > 0) return;
    const target = $('eye-mission-dock-close');
    if (target && !$('eye-mission-dock').hidden)
      target.focus({ preventScroll: true });
  });
}

function mountCompass(shell) {
  const { lifetime, styleManager, viewer, defer } = shell;
  const syncCompass = () => {
    if (lifetime.destroyed) return;
    const heading = styleManager.getCameraState?.()?.heading;
    shell.missionDock.setHeading(Number.isFinite(heading) ? heading : null);
    shell.dossier.setHeading(Number.isFinite(heading) ? heading : null);
  };
  const removeCompassSync = viewer.camera.changed.addEventListener(syncCompass);
  defer(removeCompassSync);
  syncCompass();
}

// OPS vive DENTRO del dock: es el tercer panel del mismo objetivo, no una
// cápsula suelta junto a Ayuda. Su modelo y sus fuentes son los de P3.
function mountActivity(shell) {
  const { state, dataManager, mapStackController, defer } = shell;
  const activity = mountEyeActivity({
    host: shell.missionDock.getOpsHost(),
    onRetry: (taskId) => activitySources.retry(taskId),
    onCancel: (taskId) => activitySources.cancel(taskId),
  });
  shell.activity = activity;
  defer(() => activity.destroy());
  const activitySources = connectActivitySources({
    dataManager,
    mapStackController,
    cctv: cctvController(dataManager),
    onEvent: (event) => {
      const nextState = reduceActivity(state.activityState, event);
      if (nextState === state.activityState) return;
      state.activityState = nextState;
      activity.update(state.activityState);
      // La insignia de OPS cuenta trabajo real: se recalcula con él.
      shell.applyDossier();
    },
  });
  defer(() => activitySources.destroy());
  activity.update(state.activityState);
}

/**
 * Conecta las fuentes del expediente y del dock en el orden original.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountDockSources(shell) {
  mountDossierSources(shell);
  mountViewContextSync(shell);
  mountDossierReopen(shell);
  mountCompass(shell);
  mountActivity(shell);
}
