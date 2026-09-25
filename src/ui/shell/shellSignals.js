/**
 * Panel Señales (USGS): pinta el registro, filtra, inspecciona un evento y
 * mantiene sincronizados los puntos del globo. La capa `earthquakes` sigue
 * siendo la dueña de los datos; aquí sólo se observa y se presenta.
 */
import * as Cesium from 'cesium';
import { filterSignals, signalState } from '../eyeinskySignals.js';
import { normalizeContext } from '../eyeinskyDossierModel.js';
import { $ } from './shellDom.js';
import { eyeDate, paintSignalList, SIGNAL_STATE_LABELS } from './signalList.js';

const ANALYST_RECORD_LIMIT = 5000;
const SIGNAL_HISTORY_LIMIT = 18;
const AGE_TICK_MS = 30000;
const INSPECT_ALT = 4500000;
const MOBILE_QUERY = '(max-width:650px)';
const FEED_MESSAGES = {
  off: 'La fuente está apagada. Pulsa Actualizar para consultar.',
  stale:
    'No se pudo consultar USGS. Se conserva el último conjunto disponible; vuelve a intentar con Actualizar.',
  error: 'No se pudo consultar USGS. Vuelve a intentar con Actualizar.',
  delayed:
    'La última consulta tiene más de cinco minutos. Actualiza para verificar.',
  loading: 'Consultando el registro público…',
};

function missingEarthquakeContext(id) {
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
}

function paintSourceSummary(current, stats, sourceState, rows) {
  $('eye-total').textContent = current?.enabled ? String(rows.length) : '—';
  $('eye-nav-count').textContent = rows.length ? String(rows.length) : '—';
  $('eye-source-state').textContent =
    `USGS · ${SIGNAL_STATE_LABELS[sourceState]}`;
  $('eye-source-detail').textContent = stats.lastUpdate
    ? `Consulta: ${eyeDate(stats.lastUpdate)}. ${SIGNAL_STATE_LABELS[sourceState]}.`
    : 'Fuente pública · sin consulta completada.';
}

function recordSignalSample(state, stats) {
  const sampleKey = `${stats.lastUpdate || ''}:${state.rows.length}`;
  if (stats.lastUpdate && sampleKey !== state.lastSignalSample) {
    state.lastSignalSample = sampleKey;
    state.signalHistory.push(state.rows.length);
    if (state.signalHistory.length > SIGNAL_HISTORY_LIMIT)
      state.signalHistory.shift();
  }
}

function paintTrend(signalHistory) {
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
}

function paintFeedStatus(current, stats, sourceState, visible, rows) {
  $('eye-connect-label').textContent = current?.enabled
    ? 'Ver señales'
    : 'Conectar USGS';
  $('eye-filter-count').textContent =
    `${visible.length} de ${rows.length} eventos`;
  $('eye-feed-status').textContent =
    FEED_MESSAGES[sourceState] ||
    `Última consulta: ${eyeDate(stats.lastUpdate)}`;
  $('eye-refresh').disabled = sourceState === 'loading';
}

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} Autoridades del panel Señales.
 */
export function createSignals(shell) {
  const { state, viewer, dataManager, lifetime, signal } = shell;
  const layer = () => dataManager.getAll().find((l) => l.id === 'earthquakes');
  const earthquake = () => dataManager.layers.get('earthquakes')?.module;
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
    if (!row) return missingEarthquakeContext(id);
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
        { label: 'HORA DEL EVENTO', value: eyeDate(row.timeMs) },
        { label: 'ÚLTIMA CONSULTA', value: eyeDate(layer()?.stats.lastUpdate) },
        {
          label: 'PROFUNDIDAD',
          value:
            row.depthKm == null ? 'No informada' : `${row.depthKm.toFixed(1)}`,
          unit: row.depthKm == null ? null : 'km',
        },
        {
          label: 'ESTADO',
          value: SIGNAL_STATE_LABELS[signalState(layer())],
        },
      ],
    });
  }
  function inspect(id, { fly = true, trigger = document.activeElement } = {}) {
    const row = state.rows.find((r) => r.id === id);
    state.selection = id;
    state.inspectorTrigger = trigger;
    // Un clic es una petición explícita: reabre el expediente si estaba cerrado.
    shell.publishDossier({
      type: 'select',
      context: earthquakeContext(id, row),
      explicit: true,
    });
    if (!row) return;
    const entity = selectedEntity(id);
    if (entity && viewer.selectedEntity !== entity)
      viewer.selectedEntity = entity;
    if (fly)
      shell.camera(
        { lon: row.lon, lat: row.lat, alt: INSPECT_ALT },
        { targetId: `earthquakes:${row.id}` },
      );
    // En móvil el panel ocupa la pantalla y mantiene viva la razón
    // `mobile-workspace`. Ocultar sólo la superficie dejaba la ficha
    // suspendida (dock oculto) sin lista ni expediente: se retira la razón al
    // mostrar la ficha. La vista sigue siendo Señales para que cerrar vuelva
    // a inicio como decide closeInspector.
    if (matchMedia(MOBILE_QUERY).matches) {
      shell.setSurface('eye-workspace', false);
      shell.setEyeSurfaceSuspension('mobile-workspace', false);
    }
    state.lastListSignature = '';
    paintFeed();
  }
  function syncEntities(visible) {
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
  }
  function paintFeed() {
    if (lifetime.destroyed || document.hidden) return;
    const current = layer(),
      stats = current?.stats || {},
      sourceState = signalState(current);
    state.rows = earthquake()?.getAnalystRecords(ANALYST_RECORD_LIMIT) || [];
    const visible = filterSignals(state.rows, state.filters);
    paintSourceSummary(current, stats, sourceState, state.rows);
    recordSignalSample(state, stats);
    paintTrend(state.signalHistory);
    paintFeedStatus(current, stats, sourceState, visible, state.rows);
    paintSignalList(state, visible, sourceState);
    syncEntities(visible);
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
  function syncFilters() {
    $('eye-filter-mag').value = String(state.filters.magnitude);
    $('eye-filter-hours').value = String(state.filters.hours);
    $('eye-filter-sector').value = state.filters.sector;
  }
  return { layer, earthquakeContext, inspect, paintFeed, refresh, syncFilters };
}

/**
 * Conectar, Actualizar, lista y filtros del panel Señales.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountSignalControls(shell) {
  const { lifetime, state } = shell;
  lifetime.listen($('eye-connect'), 'click', () =>
    shell.openView('signals', $('eye-connect')),
  );
  lifetime.listen($('eye-refresh'), 'click', () => void shell.refresh());
  lifetime.listen($('eye-signal-list'), 'click', (event) => {
    const b = event.target.closest('[data-signal-id]');
    if (b) shell.inspect(b.dataset.signalId, { trigger: b });
  });
  for (const id of ['eye-filter-mag', 'eye-filter-hours', 'eye-filter-sector'])
    lifetime.listen($(id), 'change', () => {
      state.filters = {
        magnitude: Number($('eye-filter-mag').value),
        hours: Number($('eye-filter-hours').value),
        sector: $('eye-filter-sector').value,
      };
      shell.paintFeed();
    });
}

/**
 * Selección en el globo, suscripción al manager, reloj de antigüedad y
 * repintado al volver a la pestaña.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountSignalFeed(shell) {
  const { lifetime, state, viewer, dataManager, defer, styleManager } = shell;
  const removeSelection = viewer.selectedEntityChanged.addEventListener(
    (entity) => {
      const id = entity?.properties?.usgsId?.getValue();
      if (id && id !== state.selection) shell.inspect(String(id));
    },
  );
  defer(removeSelection);
  const unsubscribe = dataManager.subscribe(() => {
    shell.paintFeed();
    shell.syncLayers();
    shell.catalog?.sync();
  });
  defer(unsubscribe);
  const ageTick = () => {
    if (!document.hidden) shell.paintFeed();
    lifetime.timeout(ageTick, AGE_TICK_MS);
  };
  lifetime.timeout(ageTick, AGE_TICK_MS);
  lifetime.listen(document, 'visibilitychange', () => {
    if (!document.hidden) {
      shell.paintFeed();
      styleManager.hud.update?.();
    }
  });
}
