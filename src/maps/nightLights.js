/**
 * Luces nocturnas de la escena (fase visual T2, §2.4). No es una capa de
 * datos: no pasa por dataManager (se mantienen 21 capas de ejecución y 24
 * filas de catálogo). Va por el proxy propio `/api/gibs/night` y se rotula
 * como lo que es: un compuesto VIIRS de 2012, no luces de esta noche.
 */

export const NIGHT_LIGHTS = Object.freeze({
  layer: 'VIIRS_CityLights_2012',
  year: 2012,
  maxLevel: 8,
  urlTemplate: '/api/gibs/night/{z}/{y}/{x}.jpg',
});

export const NIGHT_LIGHTS_CREDIT =
  'Luces nocturnas: NASA GIBS · VIIRS 2012 (compuesto, no en vivo)';

/** Versión de teléfono (≤ 650 px): abrevia, nunca oculta, la atribución. */
export const NIGHT_LIGHTS_CREDIT_SHORT = 'NASA GIBS VIIRS 2012 · no en vivo';

/** Un solo crédito con las dos versiones; la hoja elige por anchura. */
const NIGHT_LIGHTS_CREDIT_HTML =
  `<span class="eye-credit-long">${NIGHT_LIGHTS_CREDIT}</span>` +
  `<span class="eye-credit-short">${NIGHT_LIGHTS_CREDIT_SHORT}</span>`;

/**
 * Realce: el sombreado día/noche de Cesium deja el lado nocturno a 0,3
 * (GlobeFS, ENABLE_DAYNIGHT_SHADING); ×3 devuelve las ciudades a ~0,9 sin
 * quemarlas.
 */
const NIGHT_LAYER_LOOK = Object.freeze({
  dayAlpha: 0,
  nightAlpha: 1,
  brightness: 3.0,
  contrast: 1.2,
  gamma: 0.85,
  saturation: 0.6,
});

/**
 * @param {{Cesium: object, urlTemplate?: string, maxLevel?: number}} options
 *   `Cesium` se inyecta (los tests no necesitan WebGL).
 * @returns {object} ImageryLayer visible solo en el lado nocturno.
 */
export function createNightLightsLayer({
  Cesium,
  urlTemplate = NIGHT_LIGHTS.urlTemplate,
  maxLevel = NIGHT_LIGHTS.maxLevel,
}) {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: urlTemplate,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    maximumLevel: maxLevel,
    // En la línea de créditos mientras sus teselas se ven (crédito dinámico).
    credit: new Cesium.Credit(NIGHT_LIGHTS_CREDIT_HTML, true),
  });
  return new Cesium.ImageryLayer(provider, { ...NIGHT_LAYER_LOOK });
}

/**
 * Salud de la capa: 'ok' | 'degraded' | 'absent'. Solo se declara ausente
 * cuando falla `maxErrors` veces sin ninguna tesela buena; entonces la escena
 * la retira y lo dice, sin sustituto.
 */
export function nightLightsHealth({ maxErrors = 6 } = {}) {
  let errors = 0;
  let loads = 0;
  return {
    recordError() {
      errors += 1;
    },
    recordLoad() {
      loads += 1;
    },
    state() {
      if (errors >= maxErrors && loads === 0) return 'absent';
      return errors > 0 ? 'degraded' : 'ok';
    },
  };
}
