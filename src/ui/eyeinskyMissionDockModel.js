/**
 * Modelo puro del Mission Dock (EYEINSKY P3.1).
 *
 * El dock es la superficie contextual inferior que sustituye al expediente
 * lateral. NO es un modelo nuevo de datos: compone el estado real que ya
 * producen `eyeinskyDossierModel.js` (qué hay seleccionado) y
 * `eyeinskyActivityModel.js` (qué trabajo está ocurriendo), y le añade lo único
 * que el dock necesita decidir por su cuenta: qué panel se ve, si está
 * desplegado, y cómo se dice en voz alta la diferencia entre "esto está
 * seleccionado" y "la cámara está encima de esto".
 *
 * Reglas que protege:
 *   - MEDIOS no existe si no hay medios; no se muestra un panel vacío,
 *   - una acción imposible se ofrece deshabilitada CON su motivo, nunca oculta
 *     sin explicación ni habilitada para fallar al pulsarla,
 *   - sin posición del proveedor no se centra: no se inventa una coordenada,
 *   - el riel compacto lleva como mucho tres valores medidos,
 *   - un panel que deja de existir devuelve el dock a OBJETIVO, no a nada.
 */

/** Paneles admitidos, en el orden en que se leen de izquierda a derecha. */
export const MISSION_DOCK_PANES = Object.freeze(['objetivo', 'medios', 'ops']);

/** Cuántos valores medidos caben en el riel compacto. */
export const MISSION_DOCK_KEY_VALUE_LIMIT = 3;

/** Rótulo del tipo de contexto, en la cabecera del dock. */
const KIND_KICKERS = Object.freeze({
  view: 'VISTA / TIERRA',
  earthquake: 'INSPECCIONAR / USGS',
  tracked: 'SEGUIMIENTO / CONTACTO',
  camera: 'CÁMARA / CCTV',
  entity: 'INSPECCIONAR / CAPA',
});

const PANE_LABELS = Object.freeze({
  objetivo: 'Objetivo',
  medios: 'Medios',
  ops: 'OPS',
});

/**
 * Capas cuyo contrato público sabe volver a poner la cámara sobre una identidad
 * ya seleccionada (`refocusTrackedById`). Fuera de esta lista, SEGUIR no puede
 * prometer nada y se dice así.
 */
const FOLLOWABLE_LAYER_IDS = Object.freeze(
  new Set(['flights', 'military', 'satellites']),
);

/** Estados terminales que cuentan como fallo en la insignia de OPS. */
const FAILED_STATUSES = Object.freeze(new Set(['error']));

/**
 * ¿Puede una capa devolver la cámara a este contexto?
 * @param {object} context Contexto normalizado del expediente.
 * @returns {boolean} True cuando SEGUIR tiene a quién pedírselo.
 */
export function isFollowableContext(context) {
  return (
    context?.kind === 'tracked' &&
    typeof context?.layerId === 'string' &&
    FOLLOWABLE_LAYER_IDS.has(context.layerId) &&
    Boolean(context?.stableId)
  );
}

/**
 * Paneles disponibles para el contexto y la actividad de este instante.
 *
 * @param {object} options Composición.
 * @param {object} options.context Contexto normalizado.
 * @param {{tasks:Array, history:Array}} options.activity Estado de actividad.
 * @returns {ReadonlyArray<{id:string, label:string, badge:object|null}>} Paneles.
 */
export function resolveMissionDockPanes({ context, activity } = {}) {
  const panes = [
    Object.freeze({ id: 'objetivo', label: PANE_LABELS.objetivo, badge: null }),
  ];
  // MEDIOS sólo si el contexto trae activos admitidos. El permiso real lo sigue
  // decidiendo el manifiesto de `eyeinskyMedia.js`; aquí sólo se mira si hay
  // algo que ese manifiesto pueda llegar a resolver.
  if ((context?.assetIds?.length ?? 0) > 0)
    panes.push(
      Object.freeze({ id: 'medios', label: PANE_LABELS.medios, badge: null }),
    );
  const loading = activity?.tasks?.length ?? 0;
  const failed = (activity?.history ?? []).filter((task) =>
    FAILED_STATUSES.has(task?.status),
  ).length;
  // Trabajo en curso manda sobre un fallo pasado: lo que está ocurriendo ahora
  // es lo que la persona necesita ver primero.
  const badge =
    loading > 0
      ? Object.freeze({ kind: 'loading', count: loading })
      : failed > 0
        ? Object.freeze({ kind: 'error', count: failed })
        : null;
  panes.push(Object.freeze({ id: 'ops', label: PANE_LABELS.ops, badge }));
  return Object.freeze(panes);
}

/**
 * Cómo se dice el estado de la cámara respecto del objetivo.
 *
 * Los tres estados son distintos de verdad: seguir no es lo mismo que tener algo
 * seleccionado, y tener algo seleccionado no es lo mismo que no tener nada.
 * @param {object} options Composición.
 * @param {object} options.context Contexto normalizado.
 * @param {boolean} options.following Si una capa tiene la cámara sobre él.
 * @returns {Readonly<{id:string, label:string, detail:string}>} Estado.
 */
export function resolveCameraStatus({ context, following } = {}) {
  const hasTarget = Boolean(context) && context.kind !== 'view';
  if (!hasTarget)
    return Object.freeze({
      id: 'free',
      label: 'CÁMARA / LIBRE',
      detail: 'Sin objetivo seleccionado.',
    });
  if (following === true)
    return Object.freeze({
      id: 'following',
      label: 'CÁMARA / SIGUIENDO',
      detail: `La cámara sigue a ${context.title}.`,
    });
  return Object.freeze({
    id: 'selected-free',
    label: 'CÁMARA / LIBRE',
    detail: `${context.title} sigue seleccionado; la cámara es tuya.`,
  });
}

/**
 * @param {string} id Identidad de la acción.
 * @param {string} label Etiqueta visible.
 * @param {boolean} enabled Si puede ejecutarse ahora.
 * @param {boolean} pressed Estado de conmutación.
 * @param {string} hint Motivo o descripción, siempre presente.
 * @returns {Readonly<object>} Acción.
 */
function action(id, label, enabled, pressed, hint) {
  return Object.freeze({ id, label, enabled, pressed, hint });
}

/**
 * Acciones del dock, en su orden fijo.
 *
 * Una acción que no puede ejecutarse se devuelve deshabilitada y con el motivo
 * en `hint`: es más honesto que esconderla, y evita el botón que falla al
 * pulsarse.
 * @param {object} options Composición.
 * @param {object} options.context Contexto normalizado.
 * @param {boolean} options.following Si una capa tiene la cámara sobre él.
 * @returns {ReadonlyArray<Readonly<object>>} Acciones.
 */
export function resolveMissionDockActions({ context, following } = {}) {
  const hasTarget = Boolean(context) && context.kind !== 'view';
  const followable = isFollowableContext(context);
  const follow = followable
    ? following === true
      ? action(
          'follow',
          'Siguiendo',
          true,
          true,
          `Suelta la cámara de ${context.title}`,
        )
      : action(
          'follow',
          'Seguir',
          true,
          false,
          `Devuelve la cámara a ${context.title}`,
        )
    : action(
        'follow',
        'Seguir',
        false,
        false,
        hasTarget
          ? 'Este registro no se puede seguir'
          : 'Sin contacto seleccionado',
      );
  const center = context?.position
    ? action('center', 'Centrar', true, false, 'Lleva la vista a esta posición')
    : action(
        'center',
        'Centrar',
        false,
        false,
        'La fuente no informa una posición',
      );
  return Object.freeze([
    follow,
    center,
    action('north', 'Norte', true, false, 'Orienta la vista al norte'),
    action('more', 'Más', true, false, 'Abre el detalle completo'),
  ]);
}

/**
 * Estado propio del dock: qué panel y si está desplegado.
 * @returns {Readonly<{pane:string, expanded:boolean}>} Estado inicial.
 */
export function createMissionDockState() {
  return Object.freeze({ pane: 'objetivo', expanded: false });
}

/**
 * Reduce un evento del dock. Devuelve EL MISMO objeto cuando nada cambia, para
 * que la superficie pueda descartar repintados por identidad.
 * @param {Readonly<object>} state Estado previo.
 * @param {object} event Evento: select-pane | expand | collapse.
 * @returns {Readonly<object>} Estado resultante.
 */
export function reduceMissionDock(state, event) {
  switch (event?.type) {
    case 'select-pane': {
      const pane = String(event.pane ?? '');
      // Un panel inventado se ignora: el dock no se queda en blanco por un
      // identificador que nadie sabe pintar.
      if (!MISSION_DOCK_PANES.includes(pane)) return state;
      if (pane === state.pane) return state;
      return Object.freeze({ ...state, pane });
    }
    case 'expand':
      if (state.expanded) return state;
      return Object.freeze({ ...state, expanded: true });
    case 'collapse':
      if (!state.expanded) return state;
      return Object.freeze({ ...state, expanded: false });
    default:
      return state;
  }
}

/**
 * Vista inmutable del dock, compuesta del estado real de sus dueños.
 *
 * @param {object} options Composición.
 * @param {object} options.dossier Estado del expediente (P3).
 * @param {{tasks:Array, history:Array}} options.activity Estado de actividad (P3).
 * @param {Readonly<object>} options.dock Estado propio del dock.
 * @param {boolean} options.following Si una capa tiene la cámara sobre el objetivo.
 * @returns {Readonly<object>} Vista del dock.
 */
export function buildMissionDockView({
  dossier,
  activity,
  dock = createMissionDockState(),
  following = false,
} = {}) {
  const context = dossier?.context ?? null;
  const panes = resolveMissionDockPanes({ context, activity });
  // Un panel que dejó de existir (se fueron los medios) devuelve a OBJETIVO.
  const pane = panes.some(({ id }) => id === dock.pane)
    ? dock.pane
    : 'objetivo';
  return Object.freeze({
    visible:
      Boolean(context) &&
      dossier?.suspended !== true &&
      dossier?.visibility !== 'closed',
    expanded: dock.expanded === true,
    contextKey: context?.key ?? null,
    contextKind: context?.kind ?? null,
    generation: dossier?.generation ?? 0,
    kicker: KIND_KICKERS[context?.kind] || KIND_KICKERS.entity,
    title: context?.title ?? null,
    status: context?.status ?? null,
    source: context?.source ?? null,
    sourceUrl: context?.sourceUrl ?? null,
    observedAt: context?.observedAt ?? null,
    localUpdatedAt: context?.localUpdatedAt ?? null,
    position: context?.position ?? null,
    panes,
    pane,
    // El riel compacto no es un resumen inventado: son los primeros campos
    // reales del expediente, recortados al ancho que el dock puede leer.
    keyValues: Object.freeze(
      (context?.fields ?? []).slice(0, MISSION_DOCK_KEY_VALUE_LIMIT),
    ),
    fields: context?.fields ?? Object.freeze([]),
    assetIds: context?.assetIds ?? Object.freeze([]),
    camera: resolveCameraStatus({ context, following }),
    actions: resolveMissionDockActions({ context, following }),
  });
}
