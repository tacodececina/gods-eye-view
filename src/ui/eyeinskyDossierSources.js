/**
 * Adaptadores observadores del expediente contextual (EYEINSKY P3).
 *
 * Escuchan a los dueños que ya existen — `contextStore`, las capas de tracking,
 * el manager, el controlador de mapas y CCTV — y traducen lo ocurrido a eventos
 * de presentación. Nada de lo que hay aquí mueve la cámara, enciende capas,
 * pide datos ni escribe en el store: observar no puede iniciar trabajo.
 */
import {
  EARTH_VIEW_KEY,
  contextFromRecord,
  createViewContext,
  normalizeContext,
} from './eyeinskyDossierModel.js';

/** Eventos de ventana que publican los dueños actuales. */
const ENTITY_SELECTED = 'gev:entity-selected';
const ENTITY_SELECTION_CLEARED = 'gev:entity-selection-cleared';
const SUBJECT_SELECTED = 'gev:awareness-subject-selected';
const SUBJECT_CLEARED = 'gev:awareness-subject-cleared';
const SUBJECT_UPDATED = 'gev:awareness-subject-updated';
const MAP_STACK_CHANGED = 'gev:map-stack-changed';

/**
 * Conecta las fuentes de contexto a un único callback de presentación.
 *
 * @param {object} options Colaboradores; todos opcionales y sin efectos.
 * @param {object} [options.viewer] Viewer Cesium, sólo para `selectedEntityChanged`.
 * @param {object} [options.dataManager] Manager de capas, sólo para leer/suscribir.
 * @param {object} [options.mapStackController] Controlador de mapas (lectura).
 * @param {object} [options.cctv] Controlador CCTV con `subscribe`.
 * @param {(event:{type:'select'|'refresh', context:object, explicit:boolean}) => void} options.onContext
 *   Receptor de eventos de presentación.
 * @returns {{destroy:() => void}} Cierre del observador.
 */
export function connectDossierSources({
  viewer = null,
  dataManager = null,
  mapStackController = null,
  cctv = null,
  onContext,
} = {}) {
  const host = typeof window !== 'undefined' ? window : null;
  const disposers = [];
  let destroyed = false;
  // Identidad vigente según lo observado. No es autoridad de selección: es la
  // referencia para saber a quién pertenece un refresh que llega después.
  let currentContext = createViewContext();
  // Cada intento de resolución tardía lleva su turno; sólo el último puede
  // publicar, de modo que una respuesta de A nunca pisa la ficha de B.
  let resolutionTurn = 0;

  const publish = (type, context, explicit = false) => {
    if (destroyed || typeof onContext !== 'function') return;
    currentContext = context;
    onContext({ type, context, explicit });
  };

  /**
   * Invalida cualquier resolución tardía en vuelo.
   *
   * La microtarea de tracking se rinde ante CUALQUIER selección posterior, no
   * sólo ante otra de su propio carril: una selección por entidad, por cámara o
   * por el viewer también es una decisión más reciente que la suya.
   * @returns {void}
   */
  const invalidatePendingResolution = () => {
    resolutionTurn += 1;
  };

  const select = (context, explicit) => {
    invalidatePendingResolution();
    publish('select', context, explicit);
  };
  const refresh = (context) => publish('refresh', context, false);

  const toViewContext = () => select(createViewContext(), false);

  const listen = (type, handler) => {
    if (!host?.addEventListener) return;
    host.addEventListener(type, handler);
    disposers.push(() => host.removeEventListener(type, handler));
  };

  // ─── Selección de entidad (USGS, infraestructura local, CCTV pickeada) ───
  listen(ENTITY_SELECTED, (event) => {
    const context = contextFromRecord(event?.detail);
    if (!context) return;
    // Un clic es una acción de la persona: puede reabrir lo que cerró.
    select(context, true);
  });

  listen(ENTITY_SELECTION_CLEARED, (event) => {
    const reason = event?.detail?.reason;
    const layerId = event?.detail?.layerId;
    if (layerId && currentContext.layerId && layerId !== currentContext.layerId)
      return;
    if (reason === 'evicted') {
      // El registro se cayó del feed; la persona no ha deseleccionado nada. La
      // ficha conserva sus últimos valores y sólo declara que ya no se observa.
      refresh(normalizeContext({ ...currentContext, status: 'missing' }));
      return;
    }
    toViewContext();
  });

  // ─── Sujeto de tracking (vuelos, militar, satélites) ───
  //
  // Las capas publican el evento ANTES de escribir el store
  // (src/layers/flights/tracking.js:67 precede a :78). Releer en una microtarea
  // y comprobar la identidad es la forma correcta de observarlo: cambiar el
  // orden de publicación de la capa sería tocar autoridad ajena para arreglar
  // una lectura.
  listen(SUBJECT_SELECTED, (event) => {
    const detail = event?.detail;
    const id = detail?.id ? String(detail.id) : null;
    const layerId = detail?.layerId ? String(detail.layerId) : null;
    if (!id || !layerId) return;
    const turn = ++resolutionTurn;
    queueMicrotask(() => {
      // Sólo el último turno publica: si llegó B mientras A esperaba, A calla.
      if (destroyed || turn !== resolutionTurn) return;
      const record = host?.__gevContextStore?.entities?.get(id) ?? null;
      const confirmed =
        record && record.layerId === layerId
          ? contextFromRecord(record, { kind: 'tracked' })
          : null;
      const context =
        confirmed ||
        // El store aún no lo tiene: se publica lo que el evento trajo, sin
        // escribir nada y sin inventar frescura.
        normalizeContext({
          key: `${layerId}:${id}`,
          kind: 'tracked',
          layerId,
          stableId: id,
          title: detail?.label ?? id,
        });
      select(context, true);
    });
  });

  // Una capa avisa de que su sujeto cambió algo que se lee (encuadre, estado
  // del modelo, edad de los elementos). Es un refresh del MISMO objetivo:
  // nunca selecciona, nunca reabre, y un aviso ajeno no pisa la ficha vigente.
  listen(SUBJECT_UPDATED, (event) => {
    const id = event?.detail?.id ? String(event.detail.id) : null;
    const layerId = event?.detail?.layerId ? String(event.detail.layerId) : '';
    if (!id || currentContext.key !== `${layerId}:${id}`) return;
    const record = host?.__gevContextStore?.entities?.get(id) ?? null;
    if (!record || record.layerId !== layerId) return;
    const context = contextFromRecord(record, { kind: currentContext.kind });
    if (context) refresh(context);
  });

  listen(SUBJECT_CLEARED, () => {
    resolutionTurn += 1; // invalida cualquier resolución en vuelo
    toViewContext();
  });

  // ─── Mapa base: refresca la vista, jamás selecciona ───
  listen(MAP_STACK_CHANGED, () => {
    refresh(currentContext);
  });

  // ─── Manager: apagar la capa de la ficha vigente la devuelve a la vista ───
  if (typeof dataManager?.subscribe === 'function') {
    const unsubscribe = dataManager.subscribe((event) => {
      if (event?.type !== 'visibility' || event.enabled !== false) return;
      if (!currentContext.layerId || event.layerId !== currentContext.layerId)
        return;
      toViewContext();
    });
    if (typeof unsubscribe === 'function') disposers.push(unsubscribe);
  }

  // ─── CCTV: su `subscribe` ya entrega instantánea al conectar ───
  if (typeof cctv?.subscribe === 'function') {
    let seenInitialSnapshot = false;
    const unsubscribe = cctv.subscribe((snapshot) => {
      const cameraId = snapshot?.activeCameraId
        ? String(snapshot.activeCameraId)
        : null;
      // La instantánea inicial describe el estado previo a este observador: no
      // puede comportarse como una selección recién hecha.
      if (!seenInitialSnapshot) {
        seenInitialSnapshot = true;
        if (!cameraId) return;
      }
      if (!cameraId) {
        if (currentContext.kind === 'camera') toViewContext();
        return;
      }
      // Forma pública real: `activeCamera` viene de `getPublicCameraState`
      // (src/layers/cctv/presentation.js). No existe `activeCameraName`,
      // `source` ni `observedAt` en la raíz, así que no se leen ni se inventan.
      const active = snapshot?.activeCamera ?? null;
      const fields = [];
      const push = (label, value, unit = null) => {
        if (value === null || value === undefined || value === '') return;
        fields.push({ label, value, unit });
      };
      push('PROVEEDOR', active?.provider);
      push('CIUDAD', active?.city);
      push('ESTADO DE LA FUENTE', active?.sourceStatus);
      push('TIPO DE SEÑAL', active?.feedType);
      if (Number.isFinite(active?.elevationM))
        push('ELEVACIÓN', String(Math.round(active.elevationM)), 'm');
      if (Number.isFinite(active?.headingDeg))
        push('ORIENTACIÓN', String(Math.round(active.headingDeg)), '°');
      const context = normalizeContext({
        key: `cctv:${cameraId}`,
        kind: 'camera',
        layerId: 'cctv',
        stableId: cameraId,
        title: active?.name || `Cámara ${cameraId}`,
        source: active?.sourceLabel || active?.provider || null,
        position:
          Number.isFinite(active?.lat) && Number.isFinite(active?.lon)
            ? { lat: active.lat, lon: active.lon }
            : null,
        fields,
      });
      if (context.key === currentContext.key) refresh(context);
      else select(context, false);
    });
    if (typeof unsubscribe === 'function') disposers.push(unsubscribe);
  }

  // ─── Viewer: selección nativa de Cesium (billboards, entidades USGS) ───
  if (typeof viewer?.selectedEntityChanged?.addEventListener === 'function') {
    const remove = viewer.selectedEntityChanged.addEventListener((entity) => {
      if (!entity) {
        if (currentContext.key !== EARTH_VIEW_KEY) toViewContext();
        return;
      }
      const contextId = entity.__gevContextId;
      const record = contextId
        ? (host?.__gevContextStore?.entities?.get(contextId) ?? null)
        : null;
      const context = record ? contextFromRecord(record) : null;
      if (context) select(context, true);
    });
    if (typeof remove === 'function') disposers.push(remove);
  }

  // Estado inicial explícito: las suscripciones del manager NO entregan
  // instantánea, así que sin esto el expediente arrancaría en blanco.
  const initialRecord = host?.__gevContextStore?.selectedEntityId
    ? (host.__gevContextStore.entities.get(
        host.__gevContextStore.selectedEntityId,
      ) ?? null)
    : null;
  const initialContext = initialRecord
    ? contextFromRecord(initialRecord)
    : null;
  // Arrancar no es un acto de la persona: `explicit:false` para no robar foco.
  select(initialContext || createViewContext(), false);

  void mapStackController; // observado por evento; no se le pide nada

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      resolutionTurn += 1;
      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {
          /* un desmontaje parcial no debe impedir el resto */
        }
      }
    },
  };
}
