/**
 * EYEINSKY P3 · expediente contextual, medios y Mission Dock.
 *
 * El expediente PINTA; la autoridad sigue repartida como estaba: la selección
 * la deciden `contextStore` y las capas, la cámara el shell, y el trabajo de
 * carga el manager. Aquí sólo se observan esos dueños y se delegan acciones.
 */
import {
  createViewContext,
  isDossierVisible,
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

const DETAILED_ALT_M = 100000;

function viewFields(pose, stack) {
  const fields = [];
  const mapLabel =
    stack?.label || stack?.name || stack?.activeId || stack?.id || null;
  if (mapLabel) fields.push({ label: 'MAPA ACTIVO', value: mapLabel });
  if (Number.isFinite(pose?.alt))
    fields.push({
      label: 'ALTURA',
      value: (pose.alt / 1000).toFixed(pose.alt >= DETAILED_ALT_M ? 0 : 1),
      unit: 'km',
    });
  if (Number.isFinite(pose?.heading))
    fields.push({
      label: 'RUMBO',
      value: String(Math.round(((pose.heading % 360) + 360) % 360)),
      unit: '°',
    });
  return fields;
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
    if (!state.dossierState.context.position) return;
    shell.camera({
      ...shell.styleManager.getCameraState(),
      lat: state.dossierState.context.position.lat,
      lon: state.dossierState.context.position.lon,
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
   * Ficha de la vista con datos REALES: mapa activo y cámara de este instante.
   *
   * Sólo lee: no enciende capas, no mueve la cámara y no pide nada. Si un dato
   * no está disponible se omite el campo en vez de inventarlo.
   * @returns {object} Contexto de vista.
   */
  function currentViewContext() {
    const pose = styleManager.getCameraState?.() ?? null;
    const stack = mapStackController?.getState?.() ?? null;
    const fields = viewFields(pose, stack);
    return withResolvedMedia(
      createViewContext({
        position:
          Number.isFinite(pose?.lat) && Number.isFinite(pose?.lon)
            ? { lat: pose.lat, lon: pose.lon }
            : null,
        fields,
      }),
    );
  }
  function applyDossier() {
    const visible = isDossierVisible(state.dossierState);
    shell.setSurface('eye-mission-dock', visible);
    // `eyeInspecting` sigue significando «hay un objetivo inspeccionado». La
    // ficha de vista no es un objetivo, así que Home y el arranque no lo activan
    // y las regresiones que dependen de esa semántica siguen valiendo.
    document.body.dataset.eyeInspecting = String(
      visible && state.dossierState.context.kind !== 'view',
    );
    state.dockView = buildMissionDockView({
      dossier: state.dossierState,
      activity: state.activityState,
      dock: state.dockState,
      following: shell.isFollowingCurrentTarget(),
    });
    shell.missionDock.update(state.dockView);
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
    onClose: () => shell.closeInspector(),
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
