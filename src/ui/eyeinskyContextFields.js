/**
 * Etiquetas y valores legibles de los campos de contexto por capa (EYEINSKY
 * P4 T6).
 *
 * El registro de `contextStore` conserva sus claves y valores crudos: son los
 * que consume la voz (`src/voice/gevActions.js`) y no se tocan. Esta tabla sólo
 * decide cómo se LEEN en el expediente y en el dock. Una capa sin tabla sigue
 * mostrando sus claves tal cual, como antes.
 */

/** Etiqueta en español de cada clave, por capa. */
const FIELD_LABELS = Object.freeze({
  satellites: Object.freeze({
    name: 'NOMBRE',
    operator: 'OPERADOR',
    noradId: 'NORAD',
    class: 'CLASE',
    altitude: 'ALTITUD',
    elementAge: 'EDAD DE ELEMENTOS',
    elementEpoch: 'ÉPOCA',
    geometryFidelity: 'GEOMETRÍA',
    attitude: 'ACTITUD',
    visualScale: 'ESCALA',
    framing: 'ENCUADRE',
    modelStatus: 'MODELO',
    elementFormat: 'FORMATO',
    fetchedAt: 'DESCARGA',
    cacheStatus: 'CACHÉ',
    modelAsset: 'ACTIVO 3D',
  }),
});

/** Valores enumerados que se leen mejor en palabras. */
const VALUE_LABELS = Object.freeze({
  satellites: Object.freeze({
    geometryFidelity: Object.freeze({
      specific: 'específico',
      family: 'familia',
      none: 'sin modelo',
    }),
    attitude: Object.freeze({
      'lvlh-nominal-aprox': 'LVLH nominal (aprox.)',
      desconocida: 'desconocida (ilustrativa)',
      'n/a': 'no aplica',
    }),
    visualScale: Object.freeze({ real: 'real', 'n/a': 'no aplica' }),
    framing: Object.freeze({ orbit: 'órbita', inspect: 'inspección' }),
    modelStatus: Object.freeze({
      listo: 'listo',
      cargando: 'cargando',
      fallido: 'no disponible',
      inactivo: 'inactivo',
      'n/a': 'no aplica',
    }),
    elementFormat: Object.freeze({ omm: 'OMM', tle: 'TLE' }),
  }),
});

/** Claves que llevan una fecha ISO y se leen en minutos UTC. */
const DATE_KEYS = Object.freeze(new Set(['elementEpoch', 'fetchedAt']));

/**
 * @param {string} iso Fecha ISO.
 * @returns {string} `AAAA-MM-DD HH:MM UTC`, o el texto original si no es ISO.
 */
function isoToMinutesUtc(iso) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return match ? `${match[1]} ${match[2]} UTC` : iso;
}

/**
 * Traduce una propiedad cruda de un registro a campo del expediente.
 * @param {string|null} layerId Capa dueña del registro.
 * @param {string} key Clave cruda (la que lee la voz).
 * @param {unknown} value Valor crudo.
 * @returns {{key:string, label:string, value:unknown, code?:string}} Campo.
 */
export function contextField(layerId, key, value) {
  const labels = FIELD_LABELS[layerId];
  if (!labels || !Object.hasOwn(labels, key)) return { key, label: key, value };
  const code = String(value);
  const named = VALUE_LABELS[layerId]?.[key]?.[code];
  const shown = named ?? (DATE_KEYS.has(key) ? isoToMinutesUtc(code) : code);
  return { key, label: labels[key], value: shown, code };
}
