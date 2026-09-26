/**
 * Modelo puro del expediente contextual (EYEINSKY P3).
 *
 * Presentación, NO autoridad de selección: aquí no se elige nada ni se mueve la
 * cámara. La selección vigente la siguen decidiendo `src/data/contextStore.js`,
 * las capas de tracking y CCTV; este módulo sólo traduce lo que ya ocurrió a una
 * forma estable que la interfaz pueda pintar.
 *
 * Reglas que el reducer protege:
 *   - un refresh jamás reclama una selección distinta,
 *   - lo que la persona cerró no lo reabre un evento observado,
 *   - una respuesta tardía (medios de A) no puede pisar la ficha de B,
 *   - un dato ausente es `null`, nunca un cero ni una hora inventada.
 */

import { contextField } from './eyeinskyContextFields.js';

/** Identidad del contexto por defecto: el globo, sin nada seleccionado. */
export const EARTH_VIEW_KEY = 'earth:view';

/** Edad a partir de la cual una observación deja de considerarse fresca. */
export const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;

/** Tolerancia de reloj: una observación algo futura sigue siendo utilizable. */
const FUTURE_CLOCK_TOLERANCE_MS = 60 * 1000;

const VISIBILITIES = new Set(['summary', 'expanded', 'closed']);

/**
 * Campos que un registro puede aportar. El satélite seguido publica 15 no
 * vacíos (P4 T6); cortar en 12 perdía la procedencia del modelo y la caché.
 */
export const CONTEXT_FIELD_LIMIT = 16;

/**
 * Estados de frescura que un registro puede declarar por sí mismo:
 * `predicted` (posición calculada por SGP4, nadie la observó) y
 * `propagation-failed` (SGP4 no dio posición: no hay pose válida, P4-20).
 * Cualquier otro texto del proveedor se ignora en vez de pintarse como estado.
 */
const RECORD_STATUSES = new Set(['predicted', 'propagation-failed']);

/**
 * Número finito, o null. Un `0` legítimo se conserva; `NaN`, `''` y `undefined`
 * no se convierten en cero: un dato ausente tiene que poder decirse.
 * @param {unknown} value Valor crudo.
 * @returns {number|null} Número utilizable o null.
 */
function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Texto seguro para pintar con textContent. No se interpola markup en ningún
 * punto de esta ruta, así que el saneado es de forma, no de escapado.
 * @param {unknown} value Valor crudo.
 * @returns {string|null} Texto recortado o null.
 */
function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * URL de proveedor utilizable como enlace, o null.
 * @param {unknown} value Candidato.
 * @returns {string|null} URL http(s), o null.
 */
function httpUrlOrNull(value) {
  const text = textOrNull(value);
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : null;
}

/**
 * Par de coordenadas válido, o null. Media coordenada no es una posición: se
 * descarta entera antes de que ninguna superficie la dibuje.
 * @param {unknown} position Candidato `{lat, lon}`.
 * @returns {{lat:number, lon:number}|null} Posición validada.
 */
function normalizePosition(position) {
  if (!position || typeof position !== 'object') return null;
  const lat = finiteOrNull(position.lat ?? position.latitude);
  const lon = finiteOrNull(position.lon ?? position.longitude);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return Object.freeze({ lat, lon });
}

/**
 * Campos visibles del expediente. Una etiqueta vacía no aporta nada y se cae;
 * la unidad es explícita o `null`, nunca se supone.
 * @param {unknown} fields Lista cruda.
 * @returns {ReadonlyArray<{label:string, value:string, unit:string|null}>} Campos.
 */
function normalizeFields(fields) {
  if (!Array.isArray(fields)) return Object.freeze([]);
  const normalized = [];
  for (const field of fields) {
    const label = textOrNull(field?.label);
    const value = textOrNull(field?.value);
    if (!label || value === null) continue;
    // `key` y `code` son la clave y el valor crudos del registro: la etiqueta
    // y el valor visibles pueden traducirse sin que nadie pierda el dato.
    const key = textOrNull(field?.key);
    const code = textOrNull(field?.code);
    normalized.push(
      Object.freeze({
        ...(key ? { key } : {}),
        label,
        value,
        unit: textOrNull(field?.unit),
        ...(code ? { code } : {}),
      }),
    );
  }
  return Object.freeze(normalized);
}

/**
 * IDs de activos admitidos. Aquí sólo se conserva la referencia: el permiso lo
 * decide el manifiesto en `eyeinskyMedia.js`, no este modelo.
 * @param {unknown} assetIds Lista cruda.
 * @returns {ReadonlyArray<string>} IDs saneados.
 */
function normalizeAssetIds(assetIds) {
  if (!Array.isArray(assetIds)) return Object.freeze([]);
  const ids = [];
  for (const id of assetIds) {
    const text = textOrNull(id);
    if (text && !ids.includes(text)) ids.push(text);
  }
  return Object.freeze(ids);
}

/**
 * Frescura declarada de un contexto.
 *
 * `unreported` no es un fallo: es la respuesta honesta cuando la fuente no
 * publica hora de observación. Tampoco se premia un reloj adelantado.
 * @param {{observedAt?:number|null}} context Contexto o parcial.
 * @param {object} [options] Reloj y umbral.
 * @param {number} [options.now] Ahora en ms UTC.
 * @param {number} [options.staleAfterMs] Edad máxima considerada fresca.
 * @returns {'ready'|'stale'|'unreported'} Estado de frescura.
 */
export function resolveContextStatus(
  context,
  { now = Date.now(), staleAfterMs = DEFAULT_STALE_AFTER_MS } = {},
) {
  const observedAt = finiteOrNull(context?.observedAt);
  if (observedAt === null) return 'unreported';
  const age = now - observedAt;
  if (age < -FUTURE_CLOCK_TOLERANCE_MS) return 'unreported';
  return age > staleAfterMs ? 'stale' : 'ready';
}

/**
 * Lleva cualquier descripción a la forma única del expediente.
 * @param {object} raw Contexto crudo.
 * @returns {Readonly<object>} Contexto normalizado e inmutable.
 */
export function normalizeContext(raw) {
  const key = textOrNull(raw?.key) || EARTH_VIEW_KEY;
  const stableId =
    textOrNull(raw?.stableId) || key.split(':').slice(1).join(':') || 'view';
  const status = textOrNull(raw?.status);
  return Object.freeze({
    key,
    bodyId: textOrNull(raw?.bodyId) || 'earth',
    kind: textOrNull(raw?.kind) || (key === EARTH_VIEW_KEY ? 'view' : 'entity'),
    layerId: textOrNull(raw?.layerId),
    stableId,
    title: textOrNull(raw?.title) || 'Vista · Tierra',
    source: textOrNull(raw?.source),
    // Enlace al registro del proveedor. Sólo http(s): un `javascript:` en un
    // campo de datos no puede convertirse en un enlace pulsable.
    sourceUrl: httpUrlOrNull(raw?.sourceUrl),
    observedAt: finiteOrNull(raw?.observedAt),
    fetchedAt: finiteOrNull(raw?.fetchedAt),
    localUpdatedAt: finiteOrNull(raw?.localUpdatedAt),
    status: status || 'unreported',
    position: normalizePosition(raw?.position),
    fields: normalizeFields(raw?.fields),
    assetIds: normalizeAssetIds(raw?.assetIds),
  });
}

/**
 * Contexto de la vista del globo: lo que se muestra cuando no hay selección.
 * @param {object} [options] Datos opcionales de la vista.
 * @returns {Readonly<object>} Contexto de vista.
 */
export function createViewContext({
  bodyId = 'earth',
  title = 'Vista · Tierra',
  position = null,
  fields = [],
  assetIds = [],
} = {}) {
  return normalizeContext({
    key: EARTH_VIEW_KEY,
    bodyId,
    kind: 'view',
    layerId: null,
    stableId: 'view',
    title,
    // Lectura de la cámara de este instante, no observación de una fuente.
    status: 'camera',
    position,
    fields,
    assetIds,
  });
}

/**
 * Traduce un registro de `contextStore` a contexto de presentación.
 *
 * `updatedAt` del registro es la hora en que ESTA aplicación lo guardó: se
 * publica como `localUpdatedAt` y nunca como observación del proveedor.
 * @param {object} record Registro del store.
 * @param {object} [options] Ajustes de traducción.
 * @param {string} [options.kind] Tipo de contexto si el llamador lo conoce.
 * @returns {Readonly<object>|null} Contexto, o null sin identidad.
 */
export function contextFromRecord(record, { kind = 'entity' } = {}) {
  const id = textOrNull(record?.id);
  if (!id) return null;
  const layerId = textOrNull(record?.layerId);
  const fields = [];
  const properties = record?.properties;
  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties)) {
      // Un vacío no es un campo: no gasta plaza del límite.
      if (textOrNull(value) === null) continue;
      if (fields.length >= CONTEXT_FIELD_LIMIT) break;
      fields.push(contextField(layerId, key, value));
    }
  }
  return normalizeContext({
    key: `${layerId || 'entity'}:${id}`,
    kind,
    layerId,
    stableId: id,
    title: textOrNull(record?.label) || textOrNull(record?.layerName) || id,
    source: record?.source,
    observedAt: record?.observedAt,
    fetchedAt: record?.fetchedAt,
    localUpdatedAt: record?.updatedAt,
    status: RECORD_STATUSES.has(record?.status) ? record.status : null,
    position: { lat: record?.latitude, lon: record?.longitude },
    fields,
  });
}

/**
 * Estado inicial del expediente para un contexto dado.
 * @param {object} context Contexto inicial.
 * @returns {Readonly<object>} Estado inmutable.
 */
export function createDossierState(context) {
  return Object.freeze({
    context: normalizeContext(context),
    generation: 0,
    visibility: 'summary',
    closedFor: null,
    suspended: false,
  });
}

/**
 * @param {object} state Estado previo.
 * @param {object} patch Campos a sustituir.
 * @returns {Readonly<object>} Estado nuevo inmutable.
 */
function next(state, patch) {
  return Object.freeze({ ...state, ...patch });
}

/**
 * Reduce un evento de presentación sobre el estado del expediente.
 *
 * Devuelve EL MISMO objeto cuando el evento no cambia nada, para que la capa de
 * interfaz pueda descartar repintados por identidad.
 * @param {object} state Estado previo.
 * @param {object} event Evento admitido.
 * @returns {Readonly<object>} Estado resultante.
 */
export function reduceDossier(state, event) {
  const type = event?.type;
  if (!type) return state;

  switch (type) {
    case 'select': {
      const context = normalizeContext(event.context);
      const sameKey = context.key === state.context.key;
      const explicit = event.explicit === true;
      // Una petición explícita reabre; una selección observada respeta el
      // cierre anterior y se limita a seguir a la identidad vigente.
      const closed = !explicit && state.visibility === 'closed';
      return next(state, {
        context,
        generation: sameKey ? state.generation : state.generation + 1,
        visibility: closed ? 'closed' : explicit ? 'summary' : state.visibility,
        closedFor: closed ? context.key : explicit ? null : state.closedFor,
      });
    }
    case 'refresh': {
      const context = normalizeContext(event.context);
      // Un refresh de otra identidad es ruido de una fuente que llegó tarde.
      if (context.key !== state.context.key) return state;
      return next(state, { context });
    }
    case 'close':
      if (state.visibility === 'closed') return state;
      return next(state, {
        visibility: 'closed',
        closedFor: state.context.key,
      });
    case 'reopen':
      if (state.visibility !== 'closed') return state;
      return next(state, { visibility: 'summary', closedFor: null });
    case 'expand':
      if (state.visibility !== 'summary') return state;
      return next(state, { visibility: 'expanded' });
    case 'collapse':
      if (state.visibility !== 'expanded') return state;
      return next(state, { visibility: 'summary' });
    case 'suspend': {
      const suspended = event.value === true;
      if (suspended === state.suspended) return state;
      // Deliberadamente NO toca `visibility`: al restaurar hay que devolver la
      // superficie exactamente como la persona la dejó.
      return next(state, { suspended });
    }
    case 'media-result': {
      // Una respuesta de medios sólo vale para la ficha que la pidió.
      if (event.key !== state.context.key) return state;
      if (event.generation !== state.generation) return state;
      const assetIds = normalizeAssetIds(event.assetIds);
      const current = state.context.assetIds;
      if (
        assetIds.length === current.length &&
        assetIds.every((id, index) => id === current[index])
      )
        return state;
      return next(state, {
        context: Object.freeze({ ...state.context, assetIds }),
      });
    }
    default:
      return state;
  }
}

/**
 * ¿Puede pintarse el expediente en este estado?
 * @param {object} state Estado del expediente.
 * @returns {boolean} True cuando la superficie debe verse.
 */
export function isDossierVisible(state) {
  return (
    !state?.suspended &&
    VISIBILITIES.has(state?.visibility) &&
    state.visibility !== 'closed'
  );
}
