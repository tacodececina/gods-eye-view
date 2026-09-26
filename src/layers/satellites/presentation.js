/**
 * Presentación de la capa de satélites por piel (fase visual T4). `legacy`
 * reproduce el look de siempre; `editorial` (flags `satStyle=editorial` y
 * `satLabels=intent`, que activa `?globe=editorial`) sigue el sistema
 * Editorial: verde mineral vivo, ámbar solo para el objetivo fijado, órbita
 * discontinua fina, ficha en Grotesk y rótulos por intención, sin corchetes.
 * Los colores de clase no cambian en ninguna piel.
 */
import * as Cesium from 'cesium';
import { ISS_NORAD, POINT_STYLES, SAT_LABEL_FAR_M } from './policy.js';

/** Tokens del sistema Editorial (§10): --ei-live, --ei-amber. */
export const EDITORIAL_SAT_COLORS = Object.freeze({
  live: '#a6d7c2',
  amber: '#e6b46d',
});

const STYLES = Object.freeze(['legacy', 'editorial']);
const LABELS = Object.freeze(['legacy', 'intent']);
const LEGACY_TRACKED_ACCENT = '#ffd84d';
const LEGACY_ISS_ACCENT = '#ff4444';

/**
 * @param {{style?: string, labels?: string}} [input]
 * @returns {Readonly<{style: 'legacy'|'editorial', labels: 'legacy'|'intent'}>}
 */
export function resolveSatellitePresentation(input = {}) {
  const style = STYLES.includes(input?.style) ? input.style : 'legacy';
  const labels = LABELS.includes(input?.labels) ? input.labels : 'legacy';
  return Object.freeze({ style, labels });
}

const isEditorial = (presentation) => presentation?.style === 'editorial';
const byIntent = (presentation) => presentation?.labels === 'intent';

const LIVE = Cesium.Color.fromCssColorString(EDITORIAL_SAT_COLORS.live);
const AMBER = Cesium.Color.fromCssColorString(EDITORIAL_SAT_COLORS.amber);

/** ISS editorial: 7 px en --ei-live con halo de su propio color a .25. */
const EDITORIAL_ISS_STYLE = Object.freeze({
  pixelSize: 7,
  color: LIVE,
  outlineColor: LIVE.withAlpha(0.25),
  outlineWidth: 3,
});

/**
 * Estilo de punto: la ISS cambia con la piel; el resto de clases, no.
 * @param {number} noradId
 * @param {string} group
 * @param {object} presentation
 * @returns {{pixelSize:number, color:object, outlineColor:object, outlineWidth:number}}
 */
export function pointStyleFor(noradId, group, presentation) {
  if (noradId === ISS_NORAD)
    return isEditorial(presentation) ? EDITORIAL_ISS_STYLE : POINT_STYLES.iss;
  return POINT_STYLES[group] || POINT_STYLES.visual;
}

/**
 * Anillo de órbita. Editorial: discontinuo, 1,5 px, verde a .7 (y .3 tras
 * la Tierra). Legacy: ISS roja 2,5 px, fijado amarillo 2 px, .6/.35.
 * @param {object} presentation
 * @param {{iss?: boolean, tracked?: boolean}} kind
 */
export function orbitPathLook(presentation, { iss = false, tracked = false }) {
  if (isEditorial(presentation))
    return Object.freeze({
      dashed: true,
      width: 1.5,
      color: LIVE.withAlpha(0.7),
      depthFailColor: LIVE.withAlpha(0.3),
    });
  const base = iss
    ? POINT_STYLES.iss.color
    : tracked
      ? Cesium.Color.YELLOW
      : Cesium.Color.CYAN;
  return Object.freeze({
    dashed: false,
    width: iss ? 2.5 : 2.0,
    color: base.withAlpha(0.6),
    depthFailColor: base.withAlpha(0.35),
  });
}

/**
 * Color del punto del objetivo fijado: ámbar en editorial.
 * @param {object} presentation
 * @returns {object} Cesium.Color
 */
export const trackedPointColor = (presentation) =>
  isEditorial(presentation) ? AMBER : Cesium.Color.YELLOW;

/**
 * Acento y tipografía de la ficha fijada.
 * @param {object} presentation
 * @returns {{accent: string, typeface?: 'editorial'}}
 */
export function trackedCardLook(presentation) {
  return isEditorial(presentation)
    ? { accent: EDITORIAL_SAT_COLORS.amber, typeface: 'editorial' }
    : { accent: LEGACY_TRACKED_ACCENT };
}

/** Vocabulario fijo de la ficha → español en tipo de frase. */
const CARD_WORDS = Object.freeze({
  STATION: 'Estación',
  NAV: 'Navegación',
  GEO: 'Geoestacionario',
  CUBESAT: 'CubeSat',
  VISUAL: 'Visible',
  COMMS: 'Comunicaciones',
  DOCKED: 'Acoplada',
});

/**
 * Traduce solo el primer término cuando es vocabulario fijo; los nombres
 * del catálogo (CelesTrak) se muestran tal como vienen, sin inventar grafía.
 * @param {string[]} details
 * @returns {string[]}
 */
export function editorialCardDetails(details) {
  return details.map((line) => {
    const text = String(line);
    const [head, ...rest] = text.split(' · ');
    const word = CARD_WORDS[head];
    return word ? [word, ...rest].join(' · ') : text;
  });
}

/**
 * Rótulo ambiental de la ISS. Con rótulos por intención se apaga por encima
 * de la altura lejana (`satelliteLabelBudget` = 0 en Global).
 * @param {object} presentation
 * @returns {object} Campos que se mezclan en la entrada del rótulo.
 */
export function issLabelLook(presentation) {
  if (!byIntent(presentation)) return { accent: LEGACY_ISS_ACCENT };
  return {
    accent: EDITORIAL_SAT_COLORS.live,
    typeface: 'editorial',
    altitudeFadeStart: SAT_LABEL_FAR_M * 0.9,
    altitudeFadeEnd: SAT_LABEL_FAR_M,
  };
}

/**
 * Con rótulos por intención los satélites no alimentan la detección: sin
 * corchetes de visor (§9) ni rótulos ambientales; se rotulan con hover o al
 * fijarlos.
 * @param {object} presentation
 * @returns {boolean}
 */
export const satelliteDetectionEnabled = (presentation) =>
  !byIntent(presentation);

/**
 * El hover solo existe con rótulos por intención.
 * @param {object} presentation
 * @returns {boolean}
 */
export const satelliteHoverEnabled = (presentation) => byIntent(presentation);
