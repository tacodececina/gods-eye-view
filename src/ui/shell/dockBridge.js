/**
 * EYEINSKY P3 · expediente contextual, medios y Mission Dock.
 *
 * El expediente PINTA; la autoridad sigue repartida como estaba: la selección
 * la deciden `contextStore` y las capas, la cámara el shell, y el trabajo de
 * carga el manager. Aquí sólo se observan esos dueños y se delegan acciones.
 */
import {
  createViewContext,
  normalizeContext,
  reduceDossier,
} from '../eyeinskyDossierModel.js';
import { mountEyeDossier } from '../eyeinskyDossier.js';
import {
  buildMissionDockView,
  reduceMissionDock,
} from '../eyeinskyMissionDockModel.js';
import { mountEyeMissionDock } from '../eyeinskyMissionDock.js';
import { mountEyeMedia, resolveContextMedia } from '../eyeinskyMedia.js';
import { $ } from './shellDom.js';

import { placeMoonActions } from './moonActionsHost.js';
import { releaseDockTarget } from './dockRelease.js';

/**
 * Titular y revelación (fase visual T3): con objetivo visible, el titular es
 * el objetivo y el cuerpo publica `data-eye-reveal="target"`.
 * @param {object} shell Contexto del shell.
 * @param {object} view Vista del dock.
 * @returns {boolean} Si hay objetivo a la vista.
 */
function publishReveal(shell, view) {
  const target = view.visible && view.contextKind !== 'view';
  shell.reveal?.setTarget(target);
  shell.story?.setTarget(
    target ? { title: view.title, kicker: view.kicker } : null,
  );
  return target;
}

/**
 * Seguimiento y encuadre del objetivo vigente, siempre por el contrato
 * público de su capa. El dock no vuela por su cuenta.
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} Autoridades de objetivo.
 */
export function createDockTargets(shell) {
  const { state, dataManager, viewer, reduced } = shell;
  /**
   * ¿Tiene una capa la cámara puesta sobre el objetivo vigente?
   *
   * Dos condiciones REALES, no una suposición: la capa dueña sigue declarando
   * ese contacto como seleccionado, y el viewer tiene efectivamente una entidad
   * enganchada. Un gesto suelta lo segundo sin tocar lo primero (P3.1), y esa
   * es exactamente la diferencia que el dock tiene que saber decir.
   * @returns {boolean} True si la cámara sigue al objetivo.
   */
  function isFollowingCurrentTarget() {
    const context = state.dossierState.context;
    if (context.kind !== 'tracked' || !context.layerId) return false;
    const module = dataManager.layers.get(context.layerId)?.module;
    if (!module?.getTrackedInfo?.()) return false;
    return Boolean(viewer.trackedEntity);
  }
  /**
   * Devuelve o suelta la cámara sobre el objetivo vigente.
   * @param {boolean} pressed Si la cámara ya lo está siguiendo.
   * @returns {void}
   */
  function toggleFollowCurrentTarget(pressed) {
    const context = state.dossierState.context;
    const module = dataManager.layers.get(context.layerId || '')?.module;
    if (!module) return;
    if (pressed) module.releaseCameraOwnership?.({ origin: 'user' });
    else if (!module.refocusTrackedById?.(context.stableId, { origin: 'user' }))
      shell.notice('El contacto ya no está disponible para seguirlo.');
    shell.applyDossier();
  }
  /**
   * INSPECCIONAR / ÓRBITA (P4 T5): la capa de satélites es la única dueña de
   * la cámara y del encuadre; el dock sólo le pide el contrario del vigente.
   * @returns {void}
   */
  function toggleInspectCurrentTarget() {
    const module = dataManager.layers.get('satellites')?.module;
    if (state.dossierState.context.layerId !== 'satellites' || !module) return;
    const next =
      module.getTrackedFraming?.() === 'inspect' ? 'orbit' : 'inspect';
    if (!module.setTrackedFraming?.(next, { reducedMotion: reduced() }))
      shell.notice('Este satélite no tiene un modelo que inspeccionar.');
    shell.applyDossier();
  }
  function centerOnTarget() {
    const context = state.dossierState.context;
    // Objetivos en movimiento (satélites, vuelos, militar): centrar es volver
    // a engancharles la cámara, no volar a una posición ya obsoleta.
    const module = dataManager.layers.get(context.layerId || '')?.module;
    if (
      context.stableId &&
      module?.refocusTrackedById?.(context.stableId, { origin: 'user' })
    ) {
      shell.applyDossier();
      return;
    }
    if (!context.position) return;
    shell.camera({
      ...shell.styleManager.getCameraState(),
      lat: context.position.lat,
      lon: context.position.lon,
    });
  }
  return {
    isFollowingCurrentTarget,
    toggleFollowCurrentTarget,
    toggleInspectCurrentTarget,
    centerOnTarget,
  };
}

/**
 * Ficha de la vista, publicación del expediente y del dock.
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} Autoridades del expediente.
 */
export function createDossierAuthority(shell) {
  const { state, styleManager, mapStackController } = shell;
  function withResolvedMedia(context) {
    return normalizeContext({
      ...context,
      assetIds: resolveContextMedia(context?.key).map(({ id }) => id),
    });
  }
  /**
   * Ficha de la vista (a petición: Instrumentos → Panel de misión). Fase
   * visual T3 (V-04): mapa, altura, rumbo y coordenadas tienen UNA lectura, la
   * telemetría del pie; la ficha ya no los repite. Es la cámara de este
   * instante (`status: camera`), sin línea de fuente.
   * @returns {object} Contexto de vista.
   */
  function currentViewContext() {
    void styleManager;
    void mapStackController;
    return withResolvedMedia(createViewContext());
  }

  function applyDossier() {
    // Un objetivo sustituye a la ficha de vista pedida: al volver a la vista
    // (objetivo soltado, Home) no reaparece sola (D1-A).
    if (state.dossierState.context.kind !== 'view') state.viewRequested = false;
    state.dockView = buildMissionDockView({
      dossier: state.dossierState,
      activity: state.activityState,
      dock: state.dockState,
      following: shell.isFollowingCurrentTarget(),
      viewRequested: state.viewRequested,
    });
    const visible = state.dockView.visible;
    shell.setSurface('eye-mission-dock', visible);
    // `eyeInspecting` sigue significando «hay un objetivo inspeccionado». La
    // ficha de vista no es un objetivo, así que Home y el arranque no lo activan
    // y las regresiones que dependen de esa semántica siguen valiendo.
    document.body.dataset.eyeInspecting = String(
      publishReveal(shell, state.dockView),
    );
    shell.missionDock.update(state.dockView);
    placeMoonActions(shell);
    shell.dossier.update(state.dossierState);
    shell.dossierMedia.setContext({
      key: state.dossierState.context.key,
      generation: state.dossierState.generation,
    });
    // Los medios sólo suenan y sólo se mueven en su propio panel desplegado.
    const mediaOpen =
      state.dockView.expanded && state.dockView.pane === 'medios';
    if (!visible || !mediaOpen) shell.dossierMedia.pause();
  }
  function publishDossier(event) {
    if (event?.type === 'close') state.viewRequested = false;
    const nextState = reduceDossier(state.dossierState, event);
    if (nextState === state.dossierState) return;
    state.dossierState = nextState;
    applyDossier();
  }
  function publishDock(event) {
    const nextState = reduceMissionDock(state.dockState, event);
    if (nextState === state.dockState) return;
    state.dockState = nextState;
    applyDossier();
  }
  return {
    withResolvedMedia,
    currentViewContext,
    applyDossier,
    publishDossier,
    publishDock,
  };
}

function onDockAction(shell, { type }) {
  if (type === 'follow')
    shell.toggleFollowCurrentTarget(
      shell.state.dockView?.actions.find((item) => item.id === 'follow')
        ?.pressed === true,
    );
  if (type === 'inspect') shell.toggleInspectCurrentTarget();
  // Centrar reutiliza la cámara del shell; el dock nunca vuela solo.
  if (type === 'center') shell.centerOnTarget();
  // Norte pasa por la MISMA autoridad de navegación que el riel de cámara.
  if (type === 'north') shell.runNorth();
}

/**
 * Monta el dock, el expediente (panel OBJETIVO) y los medios, en ese orden.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountDockSurfaces(shell) {
  const { defer, reduced } = shell;
  shell.missionDock = mountEyeMissionDock({
    host: $('eye-mission-dock'),
    // × suelta el objetivo (reparación T5): sin esto la cámara seguía
    // enganchada a un objetivo sin panel y «Volver a Tierra» lo resucitaba.
    onClose: () => {
      releaseDockTarget({
        context: shell.state.dossierState.context,
        layers: shell.dataManager.layers,
        viewer: shell.viewer,
        goGlobal: () => shell.sector('global'),
      });
      shell.closeInspector();
    },
    onPane: (pane) => shell.publishDock({ type: 'select-pane', pane }),
    onToggle: (expanded) =>
      shell.publishDock({ type: expanded ? 'expand' : 'collapse' }),
    onAction: (action) => onDockAction(shell, action),
  });
  defer(() => shell.missionDock.destroy());
  // El expediente P3 sigue siendo el que PINTA el objetivo: aquí sólo cambia de
  // casa, del panel lateral al panel OBJETIVO del dock. Su modelo, sus fuentes y
  // sus reglas no se reimplementan.
  shell.dossier = mountEyeDossier({
    host: shell.missionDock.getObjetivoHost(),
    onAction: ({ type }) => {
      if (type === 'save-operation')
        shell.openView('operations', $('eye-home'));
      if (type === 'center') shell.centerOnTarget();
      if (type === 'north') shell.runNorth();
    },
  });
  defer(() => shell.dossier.destroy());
  shell.dossierMedia = mountEyeMedia({
    host: shell.missionDock.getMediaHost(),
    reducedMotion: reduced,
  });
  defer(() => shell.dossierMedia.destroy());
}
