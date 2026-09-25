import * as Cesium from 'cesium';
import { UiLifetime } from './uiLifetime.js';
import { filterSignals, signalState } from './eyeinskySignals.js';
import { publicView } from './operations.js';
import { mountOperationPanel } from './eyeinskyOperations.js';
import { mountEyeIcons } from './eyeinskyIcons.js';
import { mountEyeinskyLanguage } from './eyeinskyLanguage.js';
import { mountImmersiveMotion } from './eyeinskyImmersiveMotion.ts';
import { resetCameraNorth } from './cameraOrientationControls.js';
import { configureEyeCameraInteraction } from './eyeinskyCameraInteraction.js';
import { mountEyeScenePolicy } from './eyeinskyScenePolicy.js';
import { mountEyeCatalog } from './eyeinskyCatalog.js';
import { contextLayerUnavailableLabel } from '../contextModePolicy.js';
import { mountEyeActiveLayers } from './eyeinskyActiveLayers.js';
import { planTargetCameraTransition } from '../navigationPolicy.js';
import { createDecorativeDecoder } from './eyeinskyDecode.js';
import {
  createDossierState,
  createViewContext,
  isDossierVisible,
  normalizeContext,
  reduceDossier,
} from './eyeinskyDossierModel.js';
import { connectDossierSources } from './eyeinskyDossierSources.js';
import { mountEyeDossier } from './eyeinskyDossier.js';
import {
  buildMissionDockView,
  createMissionDockState,
  reduceMissionDock,
} from './eyeinskyMissionDockModel.js';
import { mountEyeMissionDock } from './eyeinskyMissionDock.js';
import { mountEyeEarthMoon } from './eyeinskyEarthMoon.js';
import { createSystemDeclutter } from './eyeinskySystemView.js';
import {
  isDetectionSuspended,
  resumeDetection,
  suspendDetection,
} from '../data/detection.js';
import {
  getSuppressedOverlaySources,
  getWorldOverlayDiagnostics,
  setOverlaySourceSuppressed,
} from '../overlays/worldOverlay.js';
import { mountEyeMedia, resolveContextMedia } from './eyeinskyMedia.js';
import {
  createActivityState,
  reduceActivity,
} from './eyeinskyActivityModel.js';
import { connectActivitySources } from './eyeinskyActivitySources.js';
import { mountEyeActivity } from './eyeinskyActivity.js';

const $ = (id) => document.getElementById(id);
const viewTitles = {
  signals: ['02 / SEÑALES', 'Registro sísmico'],
  operations: ['03 / OPERACIÓN', 'Continuidad de trabajo'],
  catalog: ['INSTRUMENTOS / FUENTES', 'Capas y disponibilidad'],
  instruments: ['02 / INSTRUMENTOS', 'Funciones de observación'],
  more: ['04 / MÁS', 'Herramientas de la consola'],
  display: ['01 / EXPLORAR', 'Apariencia y destinos'],
  director: ['03 / OPERACIÓN', 'Director de escenas'],
  sensors: ['FUENTES / MEDIOS', 'Cámaras y radio'],
  preferences: ['CONFIGURACIÓN', 'Preferencias y cabina'],
};
const sectors = {
  global: { lat: 18, lon: -92, alt: 18000000 },
  mexico: { lat: 23, lon: -102, alt: 4500000 },
  pacific: { lat: 10, lon: -155, alt: 13000000 },
  europe: { lat: 48, lon: 15, alt: 4500000 },
};
const stateLabels = {
  off: 'Sin consultar',
  loading: 'Consultando',
  ready: 'Actualizado',
  empty: 'Sin eventos',
  stale: 'Sin conexión · datos anteriores',
  error: 'Fuente no disponible',
  delayed: 'Consulta retrasada',
};
const date = (value) =>
  value
    ? new Date(value).toLocaleString('es-MX', {
        timeZone: 'UTC',
        hour12: false,
      }) + ' UTC'
    : 'No informado';
const node = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (className) n.className = className;
  return n;
};

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

/** One UI lifetime, observing the existing manager and the existing USGS layer. */
export function mountEyeinsky({ scene, controls, data, tools, signal, defer }) {
  const { viewer, mapStackController } = scene,
    { styleManager } = controls,
    { dataManager } = data;
  const lifetime = new UiLifetime();
  defer(() => lifetime.destroy());
  defer(
    configureEyeCameraInteraction(viewer, (kind) => {
      const generation =
        styleManager._navigation.interruptHumanNavigation(kind);
      applyDossier();
      return generation;
    }),
  );
  const releaseIcons = mountEyeIcons();
  defer(releaseIcons);
  defer(mountEyeinskyLanguage());
  defer(mountEyeScenePolicy(viewer));
  let selection = null,
    filters = { magnitude: 2.5, hours: 24, sector: 'all' },
    activeView = 'explore',
    panelTrigger = null,
    inspectorTrigger = null;
  let rows = [],
    generation = 0,
    noticeTimer = null,
    dialogResolve = null,
    lastListSignature = '',
    lastSignalSample = '';
  const signalHistory = [];
  let catalog = null,
    activeLayers = null,
    lastCameraTargetId = null;
  // Razones de suspensión de las superficies P3. Se declaran aquí porque
  // `openView` puede correr durante el arranque, antes de que existan.
  const suspensionReasons = new Set();
  let eyeSurfacesReady = false;
  let restoreController = null;
  const layer = () => dataManager.getAll().find((l) => l.id === 'earthquakes');
  const earthquake = () => dataManager.layers.get('earthquakes')?.module;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  const visualViewportProperties = [
    '--eye-viewport-height',
    '--eye-viewport-width',
    '--eye-visual-left',
    '--eye-visual-right',
    '--eye-visual-top',
    '--eye-visual-bottom',
    '--eye-visual-center-x',
    '--eye-visual-center-y',
  ];
  const syncVisualViewport = () => {
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const right = Math.max(0, window.innerWidth - left - width);
    const bottom = Math.max(0, window.innerHeight - top - height);
    const properties = {
      '--eye-viewport-height': height,
      '--eye-viewport-width': width,
      '--eye-visual-left': left,
      '--eye-visual-right': right,
      '--eye-visual-top': top,
      '--eye-visual-bottom': bottom,
      '--eye-visual-center-x': left + width / 2,
      '--eye-visual-center-y': top + height / 2,
    };
    for (const [name, value] of Object.entries(properties)) {
      document.documentElement.style.setProperty(
        name,
        `${Math.round(value)}px`,
      );
    }
  };
  syncVisualViewport();
  lifetime.listen(window, 'resize', syncVisualViewport);
  lifetime.listen(window.visualViewport, 'resize', syncVisualViewport);
  lifetime.listen(window.visualViewport, 'scroll', syncVisualViewport);
  defer(() => {
    for (const property of visualViewportProperties) {
      document.documentElement.style.removeProperty(property);
    }
  });
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
  const setSurface = (id, open) => motion.setOpen($(id), open);
  const notice = (message, { actionLabel, action, focusAfter } = {}) => {
    const host = $('eye-notice');
    host.replaceChildren(node('span', message));
    if (actionLabel && action) {
      const button = node('button', actionLabel);
      button.addEventListener(
        'click',
        async () => {
          button.disabled = true;
          await action();
          host.hidden = true;
          focusAfter?.focus?.({ preventScroll: true });
        },
        { once: true },
      );
      host.append(button);
    }
    host.hidden = false;
    lifetime.cancelTimeout(noticeTimer);
    noticeTimer = lifetime.timeout(() => ($('eye-notice').hidden = true), 7000);
  };
  function openView(view, trigger = document.activeElement) {
    if (view !== 'explore' && !viewTitles[view]) return;
    activeView = view;
    panelTrigger = trigger;
    setSurface('eye-workspace', view !== 'explore');
    document.body.dataset.eyeActive = String(view !== 'explore');
    for (const panel of document.querySelectorAll('[data-eye-panel]'))
      panel.hidden = panel.dataset.eyePanel !== view;
    $('eye-workspace').querySelector('.eye-workspace-content').scrollTop = 0;
    for (const b of document.querySelectorAll(
      '.eye-view-controls [data-eye-view]',
    ))
      b.setAttribute('aria-pressed', String(b.dataset.eyeView === view));
    if (viewTitles[view]) {
      panelKickerDecode.reveal(viewTitles[view][0]);
      $('eye-panel-title').textContent = viewTitles[view][1];
      $('eye-panel-close').focus({ preventScroll: true });
    }
    if (view === 'signals') void refresh();
    if (view === 'operations') operations.refresh();
    // En móvil el panel ocupa la pantalla: el expediente se SUSPENDE mientras
    // tanto. Antes se cerraba, y abrir Catálogo o Preferencias equivalía a
    // cerrarlo para siempre, perdiendo la ficha vigente sin que nadie lo pidiera.
    setEyeSurfaceSuspension(
      'mobile-workspace',
      matchMedia('(max-width:650px)').matches && view !== 'explore',
    );
  }
  function closePanel() {
    openView('explore', panelTrigger);
    panelTrigger?.focus?.({ preventScroll: true });
  }
  function closeInspector(focus = true) {
    // Cerrar es una decisión de la persona: el expediente la recuerda y ningún
    // refresh posterior lo reabre por su cuenta.
    publishDossier({ type: 'close' });
    if (focus) {
      const mobileReturn =
        activeView === 'signals' && matchMedia('(max-width:650px)').matches;
      if (mobileReturn) openView('explore', $('eye-home'));
      else if (activeView === 'signals') setSurface('eye-workspace', true);
      const currentRow = [
        ...$('eye-signal-list').querySelectorAll('button'),
      ].find((button) => button.dataset.signalId === selection);
      const target = mobileReturn
        ? $('eye-home')
        : inspectorTrigger?.isConnected &&
            inspectorTrigger.getClientRects().length
          ? inspectorTrigger
          : currentRow || $('eye-command-open');
      target.focus({ preventScroll: true });
    }
  }
  function dialog(
    title,
    { text = '', input, label = 'Texto', confirm = null, content } = {},
  ) {
    if (dialogResolve) {
      dialogResolve({ confirmed: false });
      dialogResolve = null;
    }
    const el = $('eye-dialog'),
      trigger = document.activeElement;
    el.close();
    $('eye-dialog-title').textContent = title;
    $('eye-dialog-body').replaceChildren();
    if (text) $('eye-dialog-body').append(node('p', text));
    let field;
    if (input !== undefined) {
      const wrapper = node('label', label);
      field = node('input');
      field.value = input;
      field.maxLength = 80;
      wrapper.append(field);
      $('eye-dialog-body').append(wrapper);
    }
    content?.($('eye-dialog-body'));
    $('eye-dialog-confirm').hidden = !confirm;
    $('eye-dialog-confirm').textContent = confirm || '';
    $('eye-dialog-cancel').textContent = confirm ? 'Cancelar' : 'Cerrar';
    el.returnValue = '';
    el.showModal();
    (field || $('eye-dialog-cancel')).focus();
    return new Promise((resolve) => {
      dialogResolve = (result) => {
        const target =
          trigger?.isConnected && trigger.getClientRects().length
            ? trigger
            : $('eye-command-open');
        target.focus({ preventScroll: true });
        resolve(result);
      };
      el._eyeField = field;
    });
  }
  lifetime.listen($('eye-dialog'), 'close', () => {
    const resolve = dialogResolve;
    dialogResolve = null;
    resolve?.({
      confirmed: $('eye-dialog').returnValue === 'confirm',
      value: $('eye-dialog')._eyeField?.value,
    });
  });
  defer(() => {
    dialogResolve?.({ confirmed: false });
    $('eye-dialog').close();
    $('eye-commands').close();
  });
  function camera(pose, { targetId = null } = {}) {
    const target = {
      ...pose,
      id: targetId,
      heading: pose.heading ?? 0,
      pitch: pose.pitch ?? -90,
      roll: pose.roll ?? 0,
    };
    const changedTarget = targetId && targetId !== lastCameraTargetId;
    const stages = changedTarget
      ? planTargetCameraTransition({
          current: styleManager.getCameraState(),
          target,
          reducedMotion: reduced(),
        })
      : [{ ...target, phase: 'final', duration: reduced() ? 0 : 0.62 }];
    const accepted = styleManager._navigation.runCameraPlan('vista', stages);
    if (accepted !== false) lastCameraTargetId = targetId;
    viewer.scene.requestRender();
    return accepted;
  }
  function sector(id) {
    const pose = sectors[id];
    if (!pose) return;
    camera(
      {
        ...pose,
        alt: id === 'global' && innerWidth < 650 ? 26000000 : pose.alt,
      },
      { targetId: `sector:${id}` },
    );
    $('eye-sector-name').textContent =
      id === 'global'
        ? 'GLOBAL'
        : { mexico: 'MÉXICO', pacific: 'PACÍFICO', europe: 'EUROPA' }[id];
  }
  function getEntities() {
    const found = [];
    for (let i = 0; i < viewer.dataSources.length; i++) {
      const ds = viewer.dataSources.get(i);
      if (ds.name === 'earthquakes') found.push(...ds.entities.values);
    }
    return found;
  }
  function selectedEntity(id) {
    return getEntities().find((e) => e.properties?.usgsId?.getValue() === id);
  }
  /**
   * Contexto de presentación de un evento USGS.
   *
   * La autoridad sigue siendo esta función: identidad, cámara y guardado no se
   * mueven al expediente. El expediente sólo PINTA lo que aquí se decide.
   * @param {string} id Identidad USGS.
   * @param {object|undefined} row Registro del último conjunto consultado.
   * @returns {object} Contexto normalizado.
   */
  function earthquakeContext(id, row) {
    if (!row)
      return normalizeContext({
        key: `earthquakes:${id}`,
        kind: 'earthquake',
        layerId: 'earthquakes',
        stableId: id,
        title: 'Evento no disponible',
        source: 'USGS',
        fields: [
          { label: 'ID USGS', value: id },
          {
            label: 'SITUACIÓN',
            value: `El contacto ${id} no está en el último conjunto consultado. Su ausencia no demuestra que el evento haya desaparecido.`,
          },
        ],
      });
    return normalizeContext({
      key: `earthquakes:${row.id}`,
      kind: 'earthquake',
      layerId: 'earthquakes',
      stableId: row.id,
      title: row.place || 'Ubicación no informada',
      source: 'USGS',
      sourceUrl: `https://earthquake.usgs.gov/earthquakes/eventpage/${encodeURIComponent(row.id)}`,
      observedAt: row.timeMs ?? null,
      fetchedAt: layer()?.stats?.lastUpdate ?? null,
      position: { lat: row.lat, lon: row.lon },
      fields: [
        { label: 'MAGNITUD', value: `M${row.magnitude.toFixed(1)}` },
        { label: 'ID USGS', value: row.id },
        { label: 'HORA DEL EVENTO', value: date(row.timeMs) },
        { label: 'ÚLTIMA CONSULTA', value: date(layer()?.stats.lastUpdate) },
        {
          label: 'PROFUNDIDAD',
          value:
            row.depthKm == null ? 'No informada' : `${row.depthKm.toFixed(1)}`,
          unit: row.depthKm == null ? null : 'km',
        },
        { label: 'ESTADO', value: stateLabels[signalState(layer())] },
      ],
    });
  }
  function inspect(id, { fly = true, trigger = document.activeElement } = {}) {
    const row = rows.find((r) => r.id === id);
    selection = id;
    inspectorTrigger = trigger;
    // Un clic es una petición explícita: reabre el expediente si estaba cerrado.
    publishDossier({
      type: 'select',
      context: earthquakeContext(id, row),
      explicit: true,
    });
    if (!row) return;
    const entity = selectedEntity(id);
    if (entity && viewer.selectedEntity !== entity)
      viewer.selectedEntity = entity;
    if (fly)
      camera(
        { lon: row.lon, lat: row.lat, alt: 4500000 },
        { targetId: `earthquakes:${row.id}` },
      );
    // En móvil el panel ocupa la pantalla y mantiene viva la razón
    // `mobile-workspace`. Ocultar sólo la superficie dejaba la ficha
    // suspendida (dock oculto) sin lista ni expediente: se retira la razón al
    // mostrar la ficha. La vista sigue siendo Señales para que cerrar vuelva
    // a inicio como decide closeInspector.
    if (matchMedia('(max-width:650px)').matches) {
      setSurface('eye-workspace', false);
      setEyeSurfaceSuspension('mobile-workspace', false);
    }
    lastListSignature = '';
    paintFeed();
  }
  function paintFeed() {
    if (lifetime.destroyed || document.hidden) return;
    const current = layer(),
      stats = current?.stats || {},
      state = signalState(current);
    rows = earthquake()?.getAnalystRecords(5000) || [];
    const visible = filterSignals(rows, filters);
    $('eye-total').textContent = current?.enabled ? String(rows.length) : '—';
    $('eye-nav-count').textContent = rows.length ? String(rows.length) : '—';
    $('eye-source-state').textContent = `USGS · ${stateLabels[state]}`;
    $('eye-source-detail').textContent = stats.lastUpdate
      ? `Consulta: ${date(stats.lastUpdate)}. ${stateLabels[state]}.`
      : 'Fuente pública · sin consulta completada.';
    const sampleKey = `${stats.lastUpdate || ''}:${rows.length}`;
    if (stats.lastUpdate && sampleKey !== lastSignalSample) {
      lastSignalSample = sampleKey;
      signalHistory.push(rows.length);
      if (signalHistory.length > 18) signalHistory.shift();
    }
    const trend = $('eye-source-trend');
    if (trend && signalHistory.length) {
      const max = Math.max(1, ...signalHistory);
      trend.setAttribute(
        'points',
        signalHistory
          .map((value, index) => {
            const x =
              signalHistory.length === 1
                ? 90
                : (index / (signalHistory.length - 1)) * 180;
            const y = 24 - (value / max) * 20;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(' '),
      );
      $('eye-source-trend-label').textContent =
        signalHistory.length === 1
          ? '1 muestra aceptada'
          : `${signalHistory.length} muestras aceptadas`;
    } else if ($('eye-source-trend-label')) {
      $('eye-source-trend-label').textContent = 'Sin datos aceptados';
    }
    $('eye-connect-label').textContent = current?.enabled
      ? 'Ver señales'
      : 'Conectar USGS';
    $('eye-filter-count').textContent =
      `${visible.length} de ${rows.length} eventos`;
    const feedMessages = {
      off: 'La fuente está apagada. Pulsa Actualizar para consultar.',
      stale:
        'No se pudo consultar USGS. Se conserva el último conjunto disponible; vuelve a intentar con Actualizar.',
      error: 'No se pudo consultar USGS. Vuelve a intentar con Actualizar.',
      delayed:
        'La última consulta tiene más de cinco minutos. Actualiza para verificar.',
      loading: 'Consultando el registro público…',
    };
    $('eye-feed-status').textContent =
      feedMessages[state] || `Última consulta: ${date(stats.lastUpdate)}`;
    $('eye-refresh').disabled = state === 'loading';
    const signature = JSON.stringify([
      visible.map((r) => [r.id, r.timeMs, r.magnitude]),
      selection,
    ]);
    if (signature !== lastListSignature) {
      lastListSignature = signature;
      const focusId = document.activeElement?.dataset.signalId;
      const list = $('eye-signal-list');
      list.replaceChildren();
      for (const row of visible) {
        const li = node('li'),
          button = node('button');
        button.dataset.signalId = row.id;
        button.setAttribute('aria-pressed', String(selection === row.id));
        button.append(node('span', row.magnitude.toFixed(1), 'eye-mag'));
        const body = node('span');
        body.append(
          node('strong', row.place || 'Ubicación no informada'),
          node('small', `${row.id} · ${date(row.timeMs)}`),
        );
        button.append(body);
        li.append(button);
        list.append(li);
      }
      if (!visible.length)
        list.append(
          node(
            'li',
            rows.length
              ? 'Ningún evento coincide con estos filtros. Amplía el sector, la antigüedad o la magnitud mínima.'
              : state === 'loading'
                ? 'Esperando respuesta de USGS…'
                : 'No hay eventos disponibles. Consulta la fuente o vuelve a intentar.',
            'eye-empty',
          ),
        );
      if (focusId)
        [...list.querySelectorAll('button')]
          .find((b) => b.dataset.signalId === focusId)
          ?.focus({ preventScroll: true });
    }
    const ids = new Set(visible.map((r) => r.id));
    earthquake()?.setVisibleIds([...ids]);
    for (const e of getEntities()) {
      const id = e.properties.usgsId.getValue();
      e.show = ids.has(id);
      if (!e.point)
        e.point = new Cesium.PointGraphics({
          pixelSize: 7,
          color: Cesium.Color.fromCssColorString('#e6b46d'),
          outlineColor: Cesium.Color.fromCssColorString('#071110'),
          outlineWidth: 2,
          disableDepthTestDistance: 0,
        });
    }
    viewer.scene.requestRender();
  }
  async function refresh() {
    if (signal.aborted) return;
    if (!dataManager.isEnabled('earthquakes'))
      await dataManager.setEnabled('earthquakes', true, { origin: 'user' });
    else if (!layer()?.stats.refreshing)
      await dataManager.refreshLayer('earthquakes', { signal });
    if (!signal.aborted) paintFeed();
  }
  const readView = () => ({
    camera: styleManager.getCameraState(),
    layers: dataManager
      .getAll()
      .filter((l) => l.enabled)
      .map((l) => l.id),
    filters: { ...filters },
    selection,
  });
  async function restoreView(input) {
    const view = publicView(input),
      own = ++generation;
    restoreController?.abort();
    restoreController = new AbortController();
    const requestSignal = AbortSignal.any([signal, restoreController.signal]);
    camera(view.camera);
    filters = { ...view.filters };
    selection = view.selection;
    syncFilters();
    const restricted = view.layers.filter((id) => !dataManager.layers.has(id));
    for (const entry of dataManager.getAll()) {
      if (own !== generation || requestSignal.aborted)
        return { superseded: true };
      const enabled = view.layers.includes(entry.id);
      await dataManager.setEnabled(entry.id, enabled, { origin: 'user' });
    }
    if (view.layers.includes('earthquakes'))
      await dataManager.refreshLayer('earthquakes', { signal: requestSignal });
    if (own !== generation || requestSignal.aborted)
      return { superseded: true };
    paintFeed();
    if (selection) {
      inspect(selection, { fly: false });
      if (activeView === 'operations' && innerWidth <= 650)
        closeInspector(false);
      setSurface('eye-workspace', activeView !== 'explore');
    }
    const missing = selection && !rows.some((r) => r.id === selection);
    return {
      message: [
        restricted.length
          ? `Fuentes sin configurar: ${restricted.join(', ')}.`
          : '',
        missing ? 'El contacto guardado no está en el conjunto actual.' : '',
        view.layers.includes('earthquakes')
          ? layer()?.stats.error
            ? 'USGS no respondió; consulta pendiente.'
            : 'Datos consultados de nuevo.'
          : 'Vista restaurada. USGS permanece sin consultar.',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  defer(() => restoreController?.abort());
  const operations = mountOperationPanel({
    lifetime,
    readView,
    restoreView,
    notice,
    dialog,
    openView,
  });
  function syncFilters() {
    $('eye-filter-mag').value = String(filters.magnitude);
    $('eye-filter-hours').value = String(filters.hours);
    $('eye-filter-sector').value = filters.sector;
  }
  lifetime.listen(document, 'click', (event) => {
    const b = event.target.closest('[data-eye-view]');
    if (b) openView(b.dataset.eyeView, b);
    const s = event.target.closest('[data-eye-sector]');
    if (s) sector(s.dataset.eyeSector);
    const layerButton = event.target.closest('[data-eye-layer]');
    if (layerButton) void toggleDirectLayer(layerButton);
  });
  async function toggleDirectLayer(button) {
    const id = button.dataset.eyeLayer;
    if (!id || !dataManager.layers.has(id)) {
      notice(
        `La fuente ${id || 'solicitada'} no está disponible en este runtime.`,
      );
      openView('catalog', button);
      return;
    }
    return toggleLayer(id, button, { returnToCatalog: true });
  }
  async function toggleLayer(
    id,
    button,
    { returnToCatalog = false, returnToActive = false } = {},
  ) {
    const wasEnabled = dataManager.isEnabled(id);
    const nextEnabled = !wasEnabled;
    button.setAttribute('aria-busy', 'true');
    try {
      const accepted = await dataManager.setEnabled(id, nextEnabled, {
        origin: 'user',
      });
      // Un modo de contexto aislado (Misiones espaciales) rechaza la capa: se
      // dice el motivo en vez de fallar en silencio.
      const refusal =
        nextEnabled && accepted === false && !dataManager.isEnabled(id)
          ? contextLayerUnavailableLabel({
              contextMode: currentContextMode(),
              layerId: id,
            })
          : null;
      if (refusal) {
        const name = dataManager.layers.get(id)?.module?.name || id;
        notice(`${name}: ${refusal}`);
      } else if (nextEnabled) {
        const module = dataManager.layers.get(id)?.module;
        styleManager._navigation.requestLayerFit(
          id,
          module?.getAllPositions?.(400) || [],
        );
      } else {
        if (!reduced()) {
          button.classList.add('eye-layer-vanish');
          lifetime.timeout(
            () => button.classList.remove('eye-layer-vanish'),
            240,
          );
        }
        if (returnToCatalog) openView('catalog', button);
        catalog?.sync();
        lifetime.timeout(
          () => {
            // Undo or another enable makes this delayed disable focus stale.
            if (dataManager.isEnabled(id)) return;
            if (returnToActive) activeLayers?.focusAdd();
            else catalog?.focus(id);
          },
          reduced() ? 0 : 170,
        );
        notice(`Se apagó ${id}.`, {
          actionLabel: 'Deshacer',
          action: async () => {
            await dataManager.setEnabled(id, true, { origin: 'user' });
            syncDirectLayers();
            catalog?.sync();
            if (returnToActive) activeLayers?.focus(id);
            else catalog?.focus(id);
          },
        });
      }
    } catch (error) {
      notice(`No se pudo cambiar ${id}: ${error?.message || error}`);
    } finally {
      button.removeAttribute('aria-busy');
      syncDirectLayers();
    }
  }
  /** Modo de contexto vigente (o entrando): el catálogo dice qué no admite. */
  function currentContextMode() {
    return (
      styleManager._contextControls?._contextModeEntering ||
      styleManager._contextMode ||
      null
    );
  }
  function syncDirectLayers() {
    for (const button of document.querySelectorAll('[data-eye-layer]')) {
      const enabled = dataManager.isEnabled(button.dataset.eyeLayer);
      button.setAttribute('aria-pressed', String(enabled));
      button.dataset.active = String(enabled);
    }
    const count = dataManager.getAll().filter((entry) => entry.enabled).length;
    if ($('eye-active-layer-count'))
      $('eye-active-layer-count').textContent = String(count);
    activeLayers?.sync();
    catalog?.sync();
  }
  lifetime.listen($('eye-panel-close'), 'click', closePanel);
  lifetime.listen($('eye-connect'), 'click', () =>
    openView('signals', $('eye-connect')),
  );
  lifetime.listen($('eye-refresh'), 'click', () => void refresh());
  lifetime.listen($('eye-signal-list'), 'click', (event) => {
    const b = event.target.closest('[data-signal-id]');
    if (b) inspect(b.dataset.signalId, { trigger: b });
  });
  for (const id of ['eye-filter-mag', 'eye-filter-hours', 'eye-filter-sector'])
    lifetime.listen($(id), 'change', () => {
      filters = {
        magnitude: Number($('eye-filter-mag').value),
        hours: Number($('eye-filter-hours').value),
        sector: $('eye-filter-sector').value,
      };
      paintFeed();
    });
  const removeSelection = viewer.selectedEntityChanged.addEventListener(
    (entity) => {
      const id = entity?.properties?.usgsId?.getValue();
      if (id && id !== selection) inspect(String(id));
    },
  );
  defer(removeSelection);
  const unsubscribe = dataManager.subscribe(() => {
    paintFeed();
    syncDirectLayers();
    catalog?.sync();
  });
  defer(unsubscribe);
  const ageTick = () => {
    if (!document.hidden) paintFeed();
    lifetime.timeout(ageTick, 30000);
  };
  lifetime.timeout(ageTick, 30000);
  lifetime.listen(document, 'visibilitychange', () => {
    if (!document.hidden) {
      paintFeed();
      styleManager.hud.update?.();
    }
  });
  const returnHome = (trigger) => {
    // Home vuelve a la vista del globo. No apaga capas ni suelta el
    // seguimiento: sólo deja de inspeccionar un objetivo concreto.
    selection = null;
    publishDossier({
      type: 'select',
      context: currentViewContext(),
      explicit: true,
    });
    openView('explore', trigger);
    sector('global');
    trigger?.focus?.({ preventScroll: true });
  };
  lifetime.listen($('eye-home'), 'click', (event) =>
    returnHome(event.currentTarget),
  );
  lifetime.listen(
    document.querySelector('.eye-orbit-brand'),
    'click',
    (event) => {
      event.preventDefault();
      returnHome(event.currentTarget);
    },
  );
  lifetime.listen($('eye-north'), 'click', () => {
    styleManager._navigation.runOrientation('vista', () =>
      resetCameraNorth(viewer),
    );
  });
  for (const [id, factor] of [
    ['eye-zoom-in', 0.72],
    ['eye-zoom-out', 1.4],
  ])
    lifetime.listen($(id), 'click', () => {
      const p = styleManager.getCameraState();
      camera({ ...p, alt: Math.max(1000, Math.min(70000000, p.alt * factor)) });
    });
  const grid = new Cesium.CustomDataSource('eyeinsky-graticule');
  viewer.dataSources.add(grid);
  defer(() => viewer.dataSources.remove(grid, true));
  const line = (positions) =>
    grid.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(positions),
        width: 1,
        material: Cesium.Color.fromCssColorString('#a6d7c2').withAlpha(0.14),
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
  for (let lon = -180; lon < 180; lon += 30) {
    const p = [];
    for (let lat = -89; lat <= 89; lat += 2) p.push(lon, lat);
    line(p);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const p = [];
    for (let lon = -180; lon <= 180; lon += 2) p.push(lon, lat);
    line(p);
  }
  lifetime.listen($('eye-grid'), 'click', () => {
    grid.show = !grid.show;
    $('eye-grid').setAttribute('aria-pressed', String(grid.show));
    viewer.scene.requestRender();
  });
  // ─── EYEINSKY P3 · expediente contextual, medios y actividad real ───
  //
  // El expediente PINTA; la autoridad sigue repartida como estaba: la selección
  // la deciden `contextStore` y las capas, la cámara el shell, y el trabajo de
  // carga el manager. Aquí sólo se observan esos dueños y se delegan acciones.
  // Controlador público de CCTV: el mismo módulo que el manager ya registró,
  // por la vía que este shell usa para `earthquakes`. No se crea ningún
  // controlador simulado ni se toca una propiedad privada nueva.
  const cctvController = () => {
    const module = dataManager.layers.get('cctv')?.module;
    return typeof module?.subscribe === 'function' ? module : null;
  };
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
    const context = dossierState.context;
    if (context.kind !== 'tracked' || !context.layerId) return false;
    const module = dataManager.layers.get(context.layerId)?.module;
    if (!module?.getTrackedInfo?.()) return false;
    return Boolean(viewer.trackedEntity);
  }
  /**
   * Devuelve o suelta la cámara sobre el objetivo vigente, siempre por el
   * contrato público de su capa. El dock no vuela por su cuenta.
   * @param {boolean} pressed Si la cámara ya lo está siguiendo.
   * @returns {void}
   */
  function toggleFollowCurrentTarget(pressed) {
    const context = dossierState.context;
    const module = dataManager.layers.get(context.layerId || '')?.module;
    if (!module) return;
    if (pressed) module.releaseCameraOwnership?.({ origin: 'user' });
    else if (!module.refocusTrackedById?.(context.stableId, { origin: 'user' }))
      notice('El contacto ya no está disponible para seguirlo.');
    applyDossier();
  }
  /**
   * INSPECCIONAR / ÓRBITA (P4 T5): la capa de satélites es la única dueña de
   * la cámara y del encuadre; el dock sólo le pide el contrario del vigente.
   * @returns {void}
   */
  function toggleInspectCurrentTarget() {
    const module = dataManager.layers.get('satellites')?.module;
    if (dossierState.context.layerId !== 'satellites' || !module) return;
    const next =
      module.getTrackedFraming?.() === 'inspect' ? 'orbit' : 'inspect';
    if (!module.setTrackedFraming?.(next, { reducedMotion: reduced() }))
      notice('Este satélite no tiene un modelo que inspeccionar.');
    applyDossier();
  }
  const missionDock = mountEyeMissionDock({
    host: $('eye-mission-dock'),
    onClose: () => closeInspector(),
    onPane: (pane) => publishDock({ type: 'select-pane', pane }),
    onToggle: (expanded) =>
      publishDock({ type: expanded ? 'expand' : 'collapse' }),
    onAction: ({ type }) => {
      if (type === 'follow')
        toggleFollowCurrentTarget(
          dockView?.actions.find((item) => item.id === 'follow')?.pressed ===
            true,
        );
      if (type === 'inspect') toggleInspectCurrentTarget();
      // Centrar reutiliza la cámara del shell; el dock nunca vuela solo.
      if (type === 'center' && dossierState.context.position)
        camera({
          ...styleManager.getCameraState(),
          lat: dossierState.context.position.lat,
          lon: dossierState.context.position.lon,
        });
      // Norte pasa por la MISMA autoridad de navegación que el riel de cámara.
      if (type === 'north')
        styleManager._navigation.runOrientation('vista', () =>
          resetCameraNorth(viewer),
        );
    },
  });
  defer(() => missionDock.destroy());
  // El expediente P3 sigue siendo el que PINTA el objetivo: aquí sólo cambia de
  // casa, del panel lateral al panel OBJETIVO del dock. Su modelo, sus fuentes y
  // sus reglas no se reimplementan.
  const dossier = mountEyeDossier({
    host: missionDock.getObjetivoHost(),
    onAction: ({ type }) => {
      if (type === 'save-operation') openView('operations', $('eye-home'));
      if (type === 'center' && dossierState.context.position)
        camera({
          ...styleManager.getCameraState(),
          lat: dossierState.context.position.lat,
          lon: dossierState.context.position.lon,
        });
      if (type === 'north')
        styleManager._navigation.runOrientation('vista', () =>
          resetCameraNorth(viewer),
        );
    },
  });
  defer(() => dossier.destroy());
  const dossierMedia = mountEyeMedia({
    host: missionDock.getMediaHost(),
    reducedMotion: reduced,
  });
  defer(() => dossierMedia.destroy());
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
    const fields = [];
    const mapLabel =
      stack?.label || stack?.name || stack?.activeId || stack?.id || null;
    if (mapLabel) fields.push({ label: 'MAPA ACTIVO', value: mapLabel });
    if (Number.isFinite(pose?.alt))
      fields.push({
        label: 'ALTURA',
        value: (pose.alt / 1000).toFixed(pose.alt >= 100000 ? 0 : 1),
        unit: 'km',
      });
    if (Number.isFinite(pose?.heading))
      fields.push({
        label: 'RUMBO',
        value: String(Math.round(((pose.heading % 360) + 360) % 360)),
        unit: '°',
      });
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
  function withResolvedMedia(context) {
    return normalizeContext({
      ...context,
      assetIds: resolveContextMedia(context?.key).map(({ id }) => id),
    });
  }
  let dossierState = createDossierState(currentViewContext());
  let dockState = createMissionDockState();
  let dockView = null;
  let activityState = createActivityState();
  function applyDossier() {
    const visible = isDossierVisible(dossierState);
    setSurface('eye-mission-dock', visible);
    // `eyeInspecting` sigue significando «hay un objetivo inspeccionado». La
    // ficha de vista no es un objetivo, así que Home y el arranque no lo activan
    // y las regresiones que dependen de esa semántica siguen valiendo.
    document.body.dataset.eyeInspecting = String(
      visible && dossierState.context.kind !== 'view',
    );
    dockView = buildMissionDockView({
      dossier: dossierState,
      activity: activityState,
      dock: dockState,
      following: isFollowingCurrentTarget(),
    });
    missionDock.update(dockView);
    dossier.update(dossierState);
    dossierMedia.setContext({
      key: dossierState.context.key,
      generation: dossierState.generation,
    });
    // Los medios sólo suenan y sólo se mueven en su propio panel desplegado.
    if (!visible || !(dockView.expanded && dockView.pane === 'medios'))
      dossierMedia.pause();
  }
  function publishDossier(event) {
    const nextState = reduceDossier(dossierState, event);
    if (nextState === dossierState) return;
    dossierState = nextState;
    applyDossier();
  }
  function publishDock(event) {
    const nextState = reduceMissionDock(dockState, event);
    if (nextState === dockState) return;
    dockState = nextState;
    applyDossier();
  }
  const dossierSources = connectDossierSources({
    viewer,
    dataManager,
    mapStackController,
    cctv: cctvController(),
    onContext: ({ type, context, explicit }) => {
      // La vista del globo la describe el shell, que es quien puede leer cámara
      // y mapa sin pedirle nada a nadie.
      const enriched = withResolvedMedia(
        context.kind === 'view' ? currentViewContext() : context,
      );
      // Un evento observado nunca es explícito: no roba foco ni reabre.
      publishDossier({ type, context: enriched, explicit });
    },
  });
  defer(() => dossierSources.destroy());
  // La ficha de vista se mantiene viva con lecturas reales: al terminar un
  // movimiento de cámara y cuando cambia el mapa. Es un refresh, así que no
  // reabre lo cerrado ni cambia de objetivo.
  const refreshViewContext = () => {
    if (lifetime.destroyed || dossierState.context.kind !== 'view') return;
    publishDossier({ type: 'refresh', context: currentViewContext() });
  };
  const removeViewSync =
    viewer.camera.moveEnd.addEventListener(refreshViewContext);
  defer(removeViewSync);
  lifetime.listen(window, 'gev:map-stack-changed', refreshViewContext);
  lifetime.listen(document, 'click', (event) => {
    const opener = event.target.closest?.('[data-eye-dossier-open]');
    if (!opener) return;
    // Acción visible para recuperar el expediente vigente tras cerrarlo. En
    // móvil el panel que contiene este botón ocupa la pantalla y mantiene viva
    // la razón `mobile-workspace`: sin retirarla, reabrir dejaba la ficha en
    // display:none. Se sale a Explorar primero y sólo después se mueve el foco.
    openView('explore', opener);
    publishDossier({ type: 'reopen' });
    // Vista limpia manda: si sigue activa, la ficha no debe aparecer ni robar
    // el foco; la reapertura queda registrada para cuando se restaure.
    if (suspensionReasons.size > 0) return;
    const target = $('eye-mission-dock-close');
    if (target && !$('eye-mission-dock').hidden)
      target.focus({ preventScroll: true });
  });
  const syncCompass = () => {
    if (lifetime.destroyed) return;
    const heading = styleManager.getCameraState?.()?.heading;
    missionDock.setHeading(Number.isFinite(heading) ? heading : null);
    dossier.setHeading(Number.isFinite(heading) ? heading : null);
  };
  const removeCompassSync = viewer.camera.changed.addEventListener(syncCompass);
  defer(removeCompassSync);
  syncCompass();

  // OPS vive DENTRO del dock: es el tercer panel del mismo objetivo, no una
  // cápsula suelta junto a Ayuda. Su modelo y sus fuentes son los de P3.
  const activity = mountEyeActivity({
    host: missionDock.getOpsHost(),
    onRetry: (taskId) => activitySources.retry(taskId),
    onCancel: (taskId) => activitySources.cancel(taskId),
  });
  defer(() => activity.destroy());
  const activitySources = connectActivitySources({
    dataManager,
    mapStackController,
    cctv: cctvController(),
    onEvent: (event) => {
      const nextState = reduceActivity(activityState, event);
      if (nextState === activityState) return;
      activityState = nextState;
      activity.update(activityState);
      // La insignia de OPS cuenta trabajo real: se recalcula con él.
      applyDossier();
    },
  });
  defer(() => activitySources.destroy());
  activity.update(activityState);

  /**
   * Aplica una razón de suspensión. Las razones son independientes y pueden
   * solaparse: salir de Vista limpia mientras el panel móvil sigue abierto NO
   * restaura. Suspender no es cerrar: el cierre explícito, la selección y el
   * foco se conservan intactos al volver.
   * @param {string} reason Identidad de la razón.
   * @param {boolean} active Si esa razón está vigente.
   * @returns {void}
   */
  function setEyeSurfaceSuspension(reason, active) {
    if (active) suspensionReasons.add(reason);
    else suspensionReasons.delete(reason);
    if (!eyeSurfacesReady) return;
    const suspended = suspensionReasons.size > 0;
    if (
      suspended === dossierState.suspended &&
      suspended === activity.isSuspended()
    )
      return;
    publishDossier({ type: 'suspend', value: suspended });
    activity.suspend(suspended);
  }
  // La otra ruta de Vista limpia es la del producto base (`ui-clean-view`), que
  // sólo cambia una clase del body: se observa en vez de duplicar su control.
  const cleanObserver = new MutationObserver(() => {
    setEyeSurfaceSuspension(
      'clean-view',
      document.body.classList.contains('ui-clean-view') ||
        document.body.classList.contains('eye-clean'),
    );
  });
  cleanObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
  defer(() => cleanObserver.disconnect());
  eyeSurfacesReady = true;
  // Aplica lo que se haya acumulado mientras las superficies se montaban.
  setEyeSurfaceSuspension('init', false);
  applyDossier();
  // P5 T8: tira TIEMPO, capas en vivo suspendidas, Luna y retorno a Tierra.
  // El shell solo presta sus autoridades; la lógica vive en eyeinskyEarthMoon.
  // SISTEMA TIERRA–LUNA aparta callouts (GEO) y sismos que tapan la Tierra.
  const systemDeclutter = createSystemDeclutter({
    detection: {
      suspend: suspendDetection,
      resume: resumeDetection,
      isSuspended: isDetectionSuspended,
    },
    overlays: { setSuppressed: setOverlaySourceSuppressed },
  });
  defer(() => systemDeclutter.destroy());
  const earthMoon = mountEyeEarthMoon({
    viewer,
    dataManager,
    reduced,
    hosts: { time: missionDock.getTimeHost(), moon: missionDock.getMoonHost() },
    ring: {
      get: () => styleManager.celestialRingEnabled === true,
      set: (on) => styleManager.setCelestialRingEnabled(on),
    },
    shell: earthMoonShell(),
  });
  defer(() => earthMoon.destroy());
  function earthMoonShell() {
    const select = (context, explicit) =>
      publishDossier({
        type: 'select',
        context: withResolvedMedia(context),
        explicit,
      });
    return {
      getDossier: () => dossierState,
      getDockState: () => dockState,
      isFollowing: isFollowingCurrentTarget,
      releaseFollow: () => {
        if (isFollowingCurrentTarget()) toggleFollowCurrentTarget(true);
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
      selectView: () => select(currentViewContext(), false),
      refresh: (context) =>
        publishDossier({
          type: 'refresh',
          context: withResolvedMedia(context),
        }),
      collapseDock: () => publishDock({ type: 'collapse' }),
      restoreDock: (dock) => {
        publishDock({ type: 'select-pane', pane: dock.pane });
        publishDock({ type: dock.expanded ? 'expand' : 'collapse' });
      },
      navigate: (noun, run) =>
        styleManager._navigation.runOrientation(noun, run),
      notice,
      declutter: (on) => systemDeclutter.set(on),
      onSuspensionChange: () => activeLayers?.sync(),
    };
  }

  function clean(value) {
    document.body.classList.toggle('eye-clean', value);
    // Suspender, no destruir: al salir de Vista limpia el expediente y la
    // cápsula vuelven exactamente como estaban, con su carrusel en pausa.
    setEyeSurfaceSuspension('clean-view', value);
    $('eye-clean-exit').hidden = !value;
    $('eye-clean').setAttribute('aria-pressed', String(value));
    if (value) $('eye-clean-exit').focus();
    else $('eye-clean').focus();
  }
  lifetime.listen($('eye-clean'), 'click', () => clean(true));
  lifetime.listen($('eye-clean-exit'), 'click', () => clean(false));
  async function share() {
    const payload = publicView(readView());
    const url = new URL(location.href);
    url.search = '';
    url.hash = 'eye=' + encodeURIComponent(JSON.stringify(payload));
    await dialog('Compartir vista pública', {
      text: 'El enlace contiene cámara, capas, filtros e ID del evento. No incluye el nombre de la operación ni sus notas privadas.',
      content: (host) => {
        const label = node('label', 'Enlace público');
        const field = node('textarea');
        field.readOnly = true;
        field.value = url.href;
        field.rows = 4;
        label.append(field);
        host.append(label);
        const button = node('button', 'Copiar enlace');
        button.onclick = async () => {
          try {
            await navigator.clipboard.writeText(url.href);
            button.textContent = 'Enlace copiado';
          } catch {
            field.select();
            notice('Selecciona y copia el enlace con Ctrl+C.');
          }
        };
        host.append(button);
      },
    });
  }
  lifetime.listen($('eye-share'), 'click', () => void share());
  const help = () =>
    dialog('EYEINSKY / Guía de campo', {
      content: (host) => {
        for (const text of [
          'Arrastra el planeta para rotar. Usa la rueda o dos dedos para acercar. Los instrumentos permiten regresar al globo, orientar al norte y mostrar la retícula.',
          'Señales consulta USGS M2.5+ / 24 h. Selecciona un evento para ver fecha, ubicación, profundidad y procedencia. Las magnitudes y ubicaciones pueden revisarse.',
          'Operación guarda la cámara, capas, filtros, selección y notas en este navegador. No vigila cuando la pestaña está cerrada. Borrar datos del navegador elimina las operaciones.',
          'Teclado: Tab recorre controles; Enter activa; Escape cierra paneles y diálogos; Ctrl+K abre acciones. Los modos térmico y nocturno son filtros visuales.',
        ])
          host.append(node('p', text));
        const links = [
          [
            'Código upstream: Bilawal Sidhu · MIT',
            'https://github.com/bilawalsidhu/gods-eye-view',
          ],
          ['CesiumJS · Apache 2.0', 'https://cesium.com/'],
          [
            'Natural Earth · dominio público',
            'https://www.naturalearthdata.com/about/terms-of-use/',
          ],
          [
            'Datos sísmicos · U.S. Geological Survey',
            'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
          ],
        ];
        for (const [label, url] of links) {
          const p = node('p'),
            a = node('a', label);
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          p.append(a);
          host.append(p);
        }
      },
    });
  lifetime.listen($('eye-help'), 'click', () => void help());
  lifetime.listen($('eye-more-help'), 'click', () => void help());
  const actions = [
    ['Explorar el globo', () => sector('global')],
    ['Ver señales USGS', () => openView('signals')],
    ['Guardar una operación', () => openView('operations')],
    ['Catálogo de fuentes', () => openView('catalog')],
    ['Apariencia y destinos', () => openView('display')],
    ['Director de escenas', () => openView('director')],
    ['Cámaras y radio', () => openView('sensors')],
    ['Voz y preferencias', () => openView('preferences')],
    ['Compartir vista pública', share],
    ['Apagar todas las capas', () => styleManager.clearSelectedLayers()],
    ['Ayuda y créditos', help],
  ];
  function commands() {
    const q = $('eye-command-search').value.toLocaleLowerCase('es');
    $('eye-command-list').replaceChildren();
    actions.forEach(([label], index) => {
      if (!label.toLocaleLowerCase('es').includes(q)) return;
      const b = node('button', label);
      b.dataset.eyeAction = String(index);
      $('eye-command-list').append(b);
    });
    if (!$('eye-command-list').children.length)
      $('eye-command-list').append(node('p', 'Sin acciones coincidentes.'));
  }
  let commandTrigger;
  function openCommands() {
    commandTrigger = document.activeElement;
    $('eye-command-search').value = '';
    commands();
    $('eye-commands').showModal();
    $('eye-command-search').focus();
  }
  lifetime.listen($('eye-command-open'), 'click', openCommands);
  lifetime.listen($('eye-command-search'), 'input', commands);
  lifetime.listen($('eye-commands'), 'close', () => commandTrigger?.focus?.());
  lifetime.listen($('eye-command-list'), 'click', (event) => {
    const b = event.target.closest('[data-eye-action]');
    if (!b) return;
    $('eye-commands').close();
    void actions[Number(b.dataset.eyeAction)]?.[1]();
  });
  lifetime.listen(document, 'keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommands();
      return;
    }
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if (document.body.classList.contains('ui-clean-view')) {
        styleManager.toggleCleanView(false);
        $('clean-view-toggle')?.focus();
        return;
      }
      if (document.body.classList.contains('eye-clean')) clean(false);
      else if (document.body.dataset.eyeInspecting === 'true') {
        closeInspector();
        if (activeView === 'signals') setSurface('eye-workspace', true);
      } else closePanel();
    }
  });
  catalog = mountEyeCatalog({
    host: $('eye-catalog'),
    dataManager,
    getContextMode: currentContextMode,
    onToggle: (entry, button) =>
      toggleLayer(entry.id, button, { returnToCatalog: false }),
    onConfigure: (entry, button) => {
      openView('preferences', button);
      notice(`${entry.name} requiere configuraci\u00f3n del proveedor.`);
    },
  });
  defer(() => catalog?.destroy());
  activeLayers = mountEyeActiveLayers({
    host: $('eye-active-layers'),
    dataManager,
    onAdd: (button) => openView('catalog', button),
    onDisable: (id, button) =>
      toggleLayer(id, button, { returnToActive: true }),
    getSuspended: () => earthMoon.debug?.suspended() ?? [],
  });
  defer(() => activeLayers?.destroy());
  lifetime.listen($('eye-catalog-back'), 'click', closePanel);
  lifetime.listen($('eye-instrument-layers'), 'click', () => {
    closePanel();
    activeLayers?.focusAdd();
  });
  lifetime.listen($('eye-instrument-data'), 'click', () => {
    advancedTelemetry.open = true;
    closePanel();
    advancedTelemetry.focus?.({ preventScroll: true });
  });
  const osmCredit = new Cesium.Credit(
    'Referencias de infraestructura © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> · Open Infrastructure Map · ODbL',
    false,
  );
  viewer.cesiumWidget.creditDisplay.addStaticCredit(osmCredit);
  defer(() => viewer.cesiumWidget.creditDisplay.removeStaticCredit(osmCredit));
  const mapListener = () => {
    $('eye-map-label').textContent =
      mapStackController.getActiveStack()?.label || 'Sin cartografía';
  };
  lifetime.listen(window, 'gev:map-stack-changed', mapListener);
  mapListener();
  syncDirectLayers();
  if (location.hash.startsWith('#eye=')) {
    try {
      if (location.hash.length > 12000)
        throw new Error('Enlace demasiado largo');
      void restoreView(JSON.parse(decodeURIComponent(location.hash.slice(5))))
        .then((result) => notice(result.message))
        .catch((e) => notice(`No se restauró el enlace: ${e.message}`));
    } catch (e) {
      notice(`Enlace inválido: ${e.message}`);
    }
  }
  paintFeed();
  const debug = {
    readView,
    restoreView,
    refresh,
    openView,
    get selectedId() {
      return selection;
    },
    get rows() {
      return rows;
    },
    earthMoon: earthMoon.debug,
    /** Arnés P5: despeje de SISTEMA (callouts de detección y sismos). */
    systemDeclutter: () => {
      const overlay = getWorldOverlayDiagnostics();
      return {
        active: systemDeclutter.isActive(),
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
