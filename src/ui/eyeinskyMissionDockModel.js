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

import {
  resolveInspectAction,
  resolveSatelliteRail,
} from './eyeinskySatelliteChips.js';

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
  moon: 'OBJETIVO / LUNA',
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
  // Fase visual T3: el bloque de cámara solo se ve cuando hay algo que una
  // capa pueda seguir; para un sismo o la vista, «CÁMARA / LIBRE» es ruido.
  const visible = following === true || isFollowableContext(context);
  if (!hasTarget)
    return Object.freeze({
      id: 'free',
      label: 'CÁMARA / LIBRE',
      detail: 'Sin objetivo seleccionado.',
      visible,
    });
  if (following === true)
    return Object.freeze({
      id: 'following',
      label: 'CÁMARA / SIGUIENDO',
      detail: `La cámara sigue a ${context.title}.`,
      visible,
    });
  const selected = FEMININE_KINDS.has(context.kind)
    ? 'seleccionada'
    : 'seleccionado';
  return Object.freeze({
    id: 'selected-free',
    label: 'CÁMARA / LIBRE',
    detail: `${context.title} sigue ${selected}; la cámara es tuya.`,
    visible,
  });
}

/** Objetivos de nombre femenino (concordancia: «Luna sigue seleccionada»). */
const FEMININE_KINDS = Object.freeze(new Set(['moon']));

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
 * SEGUIR: siguiendo, recuperable, o imposible con su motivo.
 * @param {object} context Contexto normalizado.
 * @param {boolean} following Si una capa tiene la cámara sobre él.
 * @returns {Readonly<object>} Acción.
 */
function followAction(context, following) {
  if (!isFollowableContext(context)) {
    const hasTarget = Boolean(context) && context.kind !== 'view';
    return action(
      'follow',
      'Seguir',
      false,
      false,
      hasTarget
        ? 'Este registro no se puede seguir'
        : 'Sin contacto seleccionado',
    );
  }
  return following === true
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
      );
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
  const follow = followAction(context, following);
  const center = context?.position
    ? action('center', 'Centrar', true, false, 'Lleva la vista a esta posición')
    : action(
        'center',
        'Centrar',
        false,
        false,
        'La fuente no informa una posición',
      );
  // P4 T5: sólo el satélite seguido ofrece INSPECCIONAR / ÓRBITA, y la
  // ofrece deshabilitada con su motivo cuando no hay modelo que inspeccionar.
  const inspect = resolveInspectAction(context);
  return Object.freeze([
    follow,
    ...(inspect
      ? [
          action(
            'inspect',
            inspect.label,
            inspect.enabled,
            inspect.pressed,
            inspect.hint,
          ),
        ]
      : []),
    center,
    // Norte lo ejecuta la brújula del dock (fase visual T3): no se repite.
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
 * Motivo visible de una acción deshabilitada (P4 T7): hoy sólo INSPECCIONAR,
 * cuyo porqué (sin modelo, órbita caducada, modelo no disponible) no puede
 * vivir sólo en un `title` que ni el tacto ni muchos lectores alcanzan.
 * @param {ReadonlyArray<object>} actions Acciones del dock.
 * @returns {Readonly<{actionId:string, text:string}>|null}
 */
function resolveActionReason(actions) {
  const inspect = actions.find((item) => item.id === 'inspect');
  return inspect && !inspect.enabled && inspect.hint
    ? Object.freeze({ actionId: inspect.id, text: inspect.hint })
    : null;
}

/**
 * Vista inmutable del dock, compuesta del estado real de sus dueños.
 *
 * @param {object} options Composición.
 * @param {object} options.dossier Estado del expediente (P3).
 * @param {{tasks:Array, history:Array}} options.activity Estado de actividad (P3).
 * @param {Readonly<object>} options.dock Estado propio del dock.
 * @param {boolean} options.following Si una capa tiene la cámara sobre el objetivo.
 * @param {boolean} [options.viewRequested] La persona pidió la ficha de la
 *   vista (Instrumentos → Panel de misión). Sin objetivo y sin esa petición
 *   no hay dock (fase visual T3, D1-A).
 * @returns {Readonly<object>} Vista del dock.
 */
export function buildMissionDockView({
  dossier,
  activity,
  dock = createMissionDockState(),
  following = false,
  viewRequested = false,
} = {}) {
  const context = dossier?.context ?? null;
  const panes = resolveMissionDockPanes({ context, activity });
  // Un panel que dejó de existir (se fueron los medios) devuelve a OBJETIVO.
  const pane = panes.some(({ id }) => id === dock.pane)
    ? dock.pane
    : 'objetivo';
  const actions = resolveMissionDockActions({ context, following });
  return Object.freeze({
    visible:
      Boolean(context) &&
      (context.kind !== 'view' || viewRequested === true) &&
      dossier?.suspended !== true &&
      dossier?.visibility !== 'closed',
    expanded: dock.expanded === true,
    contextKey: context?.key ?? null,
    contextKind: context?.kind ?? null,
    layerId: context?.layerId ?? null,
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
    // reales del expediente, recortados al ancho que el dock puede leer. El
    // satélite seguido elige los suyos: ALT · ÉPOCA · MODELO (P4 T6).
    keyValues:
      resolveSatelliteRail(context) ??
      Object.freeze(
        (context?.fields ?? []).slice(0, MISSION_DOCK_KEY_VALUE_LIMIT),
      ),
    fields: context?.fields ?? Object.freeze([]),
    assetIds: context?.assetIds ?? Object.freeze([]),
    camera: resolveCameraStatus({ context, following }),
    actions,
    actionReason: resolveActionReason(actions),
  });
}

// ─── P5 T8 · Tira TIEMPO ────────────────────────────────────────────────────
//
// El reloj de escena es UNO (src/time/sceneClock.js). La tira dice en cuál de
// sus tres estados está, sin eufemismos: vivo, simulación (ámbar, con ritmo) o
// pausa (con motivo). Los feeds en vivo no se re-propagan: fuera de «vivo» se
// suspenden y se dice; los satélites siguen en hora real y también se dice.

/**
 * Ritmos del botón AVANCE, en el orden en que se recorren: 1→60→600→3600→1.
 * El botón muestra el ritmo ACTUAL (vivo = ×1, pausa = ×0) y aplica el
 * siguiente; desde vivo o pausa, el primero es ×60.
 */
export const TIME_ADVANCE_STEPS = Object.freeze([1, 60, 600, 3600]);
/** Primer ritmo al simular desde vivo o pausa. */
const FIRST_ADVANCE = 60;
/** Una pausa más alejada de la pared que esto ya no es «ahora». */
export const LIVE_TOLERANCE_MS = 60_000;
const FIELD_MIN_YEAR = 1900;
const FIELD_MAX_YEAR = 2100;
const FIELD_INVALID = 'Fecha inválida: usa AAAA-MM-DD hh:mm (UTC)';
const FIELD_RANGE = `Fecha fuera de ${FIELD_MIN_YEAR}–${FIELD_MAX_YEAR} UTC`;

/**
 * ¿La escena ya no muestra «ahora»? Simulando siempre; en pausa, si deriva
 * más de `toleranceMs` (60 s; el arnés lo baja para no esperar de verdad).
 */
export function isSceneOffLive(
  clock,
  { toleranceMs = LIVE_TOLERANCE_MS } = {},
) {
  if (clock?.mode === 'simulated') return true;
  return (
    clock?.mode === 'paused' &&
    Math.abs(Number(clock.driftMs) || 0) > toleranceMs
  );
}

/**
 * A dónde vuelve REANUDAR. `running` es el último modo en marcha antes de la
 * pausa: una simulación sigue a su ritmo; una pausa hecha en vivo vuelve a
 * vivo solo si no derivó más de la tolerancia (si no, simula ×1 desde ahí).
 * @param {object} clock Estado pausado de sceneClock.getState().
 * @param {{mode: string, multiplier?: number}} [running]
 */
export function resolveResume(clock, running) {
  if (running?.mode === 'simulated')
    return Object.freeze({ type: 'simulate', multiplier: running.multiplier });
  if (Math.abs(Number(clock?.driftMs) || 0) <= LIVE_TOLERANCE_MS)
    return Object.freeze({ type: 'now' });
  return Object.freeze({ type: 'simulate', multiplier: 1 });
}

/** Ritmo que aplicará el siguiente AVANCE. */
export function nextAdvanceMultiplier(clock) {
  if (clock?.mode !== 'simulated') return FIRST_ADVANCE;
  const index = TIME_ADVANCE_STEPS.indexOf(clock.multiplier);
  if (index === -1) return FIRST_ADVANCE;
  return TIME_ADVANCE_STEPS[(index + 1) % TIME_ADVANCE_STEPS.length];
}

/** 'YYYY-MM-DD', 'hh:mm' y 'hh:mm:ss' de un ISO UTC. */
function isoParts(iso) {
  const text = typeof iso === 'string' ? iso : '';
  return {
    date: text.slice(0, 10),
    minutes: text.slice(11, 16),
    seconds: text.slice(11, 19),
  };
}

/** Ritmo ACTUAL del reloj: vivo ×1, pausa ×0, simulación ×N. */
function currentRate(clock) {
  if (clock?.mode === 'simulated') return clock.multiplier;
  return clock?.mode === 'paused' ? 0 : 1;
}

/** Botón AVANCE: rótulo con el ritmo actual; aplica el siguiente. */
function advanceButton(clock) {
  const current = currentRate(clock);
  const next = nextAdvanceMultiplier(clock);
  const live = clock?.mode !== 'simulated' && clock?.mode !== 'paused';
  return Object.freeze({
    label: `AVANCE ×${current}`,
    short: `×${current}`,
    current,
    multiplier: next,
    ariaLabel: `AVANCE, ritmo actual ×${current}${live ? ' (hora real)' : ''}. Pulsa para simular a ×${next}`,
    hint: `Simula a ×${next} (Luna, Sol y luz; los feeds no)`,
  });
}

/**
 * Aviso de la pausa larga hecha en vivo (P5-11): al pasar la tolerancia las
 * capas en vivo se suspenden; se dice, y se ofrecen REANUDAR y AHORA.
 */
function suspensionNotice(
  clock,
  { suspendedCount = 0, pausedFromLive = false, liveToleranceMs },
) {
  const toleranceMs = liveToleranceMs ?? LIVE_TOLERANCE_MS;
  if (clock?.mode !== 'paused' || !pausedFromLive || suspendedCount < 1)
    return null;
  if (!isSceneOffLive(clock, { toleranceMs })) return null;
  return Object.freeze({
    text: `Capas en vivo suspendidas: la pausa supera ${Math.round(toleranceMs / 1000)} s`,
    actions: Object.freeze(['pause', 'now']),
  });
}

/**
 * Deriva máxima para llamar «en vivo» al reloj (plan: `shouldAnimate &&
 * multiplier === 1 && deriva < 5 s`). Más allá, el modo vivo se está
 * resincronizando y se dice.
 */
export const LIVE_LABEL_MAX_DRIFT_MS = 5_000;

/** Rótulo, detalle y anuncio de cada modo (D5: el rótulo describe el reloj). */
function stripWording(clock) {
  const { date, minutes, seconds } = isoParts(clock?.currentIso);
  if (clock?.mode === 'simulated')
    return {
      tone: 'sim',
      icon: '◆',
      label: `Simulación ×${clock.multiplier}`,
      detail: `${date} ${minutes} UTC`,
      announcement: `Simulación ×${clock.multiplier}`,
    };
  if (clock?.mode === 'paused')
    return {
      tone: 'paused',
      icon: '❚❚',
      label: 'En pausa',
      detail: `· ${clock.reason || `${date} ${seconds} UTC`}`,
      announcement: clock.reason ? `En pausa: ${clock.reason}` : 'En pausa',
    };
  const inSync =
    Math.abs(Number(clock?.driftMs) || 0) < LIVE_LABEL_MAX_DRIFT_MS;
  const label = inSync ? 'Reloj en vivo' : 'Reloj resincronizando';
  return {
    tone: 'live',
    icon: '●',
    label,
    detail: `${seconds} UTC`,
    announcement: label,
  };
}

const MONTHS = Object.freeze(
  'ENE FEB MAR ABR MAY JUN JUL AGO SEP OCT NOV DIC'.split(' '),
);

/**
 * Chip de la cabecera compacta (§6 móvil): «◆ SIM 07-OCT 03:12 ×3600»,
 * «● VIVO 14:32 UTC» o «❚❚ PAUSA 14-MAR 06:00». Abre la hoja de controles.
 */
function stripChip(clock, words) {
  const { date, minutes } = isoParts(clock?.currentIso);
  const month = MONTHS[Number(date.slice(5, 7)) - 1] ?? '';
  const day = `${date.slice(8, 10)}-${month} ${minutes}`;
  const text =
    clock?.mode === 'simulated'
      ? `${words.icon} SIM ${day} ×${clock.multiplier}`
      : clock?.mode === 'paused'
        ? `${words.icon} PAUSA ${day}`
        : `${words.icon} VIVO ${minutes} UTC`;
  return Object.freeze({
    text,
    tone: words.tone,
    label: `Tiempo: ${words.announcement}. Abre los controles de tiempo`,
  });
}

/** Notas visibles fuera de «vivo»: lo que NO se simula. */
function stripNotes(
  clock,
  {
    suspendedCount = 0,
    satellitesEnabled = false,
    liveToleranceMs = LIVE_TOLERANCE_MS,
    moonSource = null,
  },
) {
  if (!isSceneOffLive(clock, { toleranceMs: liveToleranceMs })) return [];
  const notes = [];
  if (suspendedCount > 0)
    notes.push(
      `Sin histórico: solo hora real · ${suspendedCount} ${suspendedCount === 1 ? 'capa en vivo suspendida' : 'capas en vivo suspendidas'}`,
    );
  if (satellitesEnabled)
    notes.push('Satélites: puntos SGP4 en hora real, no simulados');
  if (moonSource === 'astronomy-engine') notes.push(FALLBACK_NOTE);
  return notes;
}

/** Rótulo del respaldo fuera de la tabla DE441 (P5-09, enlace compartido). */
export const FALLBACK_NOTE =
  'Luna: astronomy-engine ≤20 km (fuera de la tabla DE441)';

/**
 * Vista inmutable de la tira TIEMPO.
 * @param {object} clock Estado de sceneClock.getState().
 * @param {{suspendedCount?:number, satellitesEnabled?:boolean,
 *   pausedFromLive?:boolean, liveToleranceMs?:number,
 *   moonSource?:string|null}} [context]
 * @returns {Readonly<object>} Texto, tono, anuncio, botones y notas.
 */
export function resolveTimeStrip(clock, context = {}) {
  const notice = suspensionNotice(clock, context);
  const base = stripWording(clock);
  const words = notice
    ? { ...base, announcement: `${base.announcement}. ${notice.text}` }
    : base;
  const paused = clock?.mode === 'paused';
  const live = clock?.mode === 'live';
  return Object.freeze({
    mode: clock?.mode ?? 'live',
    ...words,
    text: `${words.icon} ${words.label} ${words.detail}`,
    chip: stripChip(clock, base),
    // Cambia de rótulo (PAUSA ↔ REANUDAR): no es un conmutador aria-pressed.
    pause: Object.freeze({
      label: paused ? 'REANUDAR' : 'PAUSA',
      short: paused ? 'REANUDAR' : 'PAUSA',
      hint: paused
        ? 'Reanuda el reloj de escena'
        : 'Congela el reloj de escena',
    }),
    advance: advanceButton(clock),
    suspensionNotice: notice,
    now: Object.freeze({
      label: 'AHORA',
      short: 'AHORA',
      enabled: !live,
      hint: live ? 'Ya estás en la hora real' : 'Vuelve a la hora real',
    }),
    notes: Object.freeze(stripNotes(clock, context)),
  });
}

/** Valor del campo datetime-local (UTC) para un ISO. */
export function utcDateFieldValue(iso) {
  return typeof iso === 'string' && iso.length >= 19 ? iso.slice(0, 19) : '';
}

/**
 * Valida el campo de fecha, SIEMPRE en UTC (datetime-local no lleva zona).
 * @param {string} value 'AAAA-MM-DDThh:mm' o con ':ss'.
 * @returns {{ok:true, iso:string}|{ok:false, error:string}}
 */
export function parseUtcDateField(value) {
  const match =
    typeof value === 'string' &&
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return { ok: false, error: FIELD_INVALID };
  const [year, month, day, hour, minute, second = 0] = match
    .slice(1)
    .map((part) => Number(part ?? 0));
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  const back = new Date(ms);
  const exact =
    back.getUTCFullYear() === year &&
    back.getUTCMonth() === month - 1 &&
    back.getUTCDate() === day &&
    back.getUTCHours() === hour &&
    back.getUTCMinutes() === minute;
  if (!exact) return { ok: false, error: FIELD_INVALID };
  if (year < FIELD_MIN_YEAR || year > FIELD_MAX_YEAR)
    return { ok: false, error: FIELD_RANGE };
  return { ok: true, iso: `${back.toISOString().slice(0, 19)}Z` };
}
