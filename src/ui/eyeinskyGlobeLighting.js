/**
 * Luz solar del globo (fase visual T2). El Sol es el de la escena: Cesium lo
 * calcula del tiempo del frame, que gobierna el reloj único P5
 * (sceneClock), así que no hay otro reloj ni otro bucle de render.
 *
 * Los fundidos por defecto de Cesium (~10 000–20 000 km) apagaban la luz
 * justo en la altura Global (18 000 km); aquí la luz es plena por encima de
 * 3 500 km y se retira a escala de ciudad (1 200 km) para no oscurecer la
 * calle de noche.
 *
 * Noche: más allá de `nightFadeInDistance` GlobeFS sustituye el lado nocturno
 * por el color (oscuro) de la atmósfera de suelo y borra las luces de
 * ciudad (medido en T2). Se lleva más allá de la entrada (95 000 km).
 */
export const GLOBE_LIGHTING = Object.freeze({
  enableLighting: true,
  dynamicAtmosphereLighting: true,
  dynamicAtmosphereLightingFromSun: true,
  showGroundAtmosphere: true,
  lightingFadeOutDistance: 1.2e6,
  lightingFadeInDistance: 3.5e6,
  nightFadeOutDistance: 1.5e8,
  nightFadeInDistance: 3e8,
});

/**
 * @param {{globe: object|null}} options Globo de la escena.
 * @returns {{apply: (enabled: boolean) => void, restore: () => void}}
 */
export function createGlobeLighting({ globe }) {
  let previous = null;
  return {
    apply(enabled) {
      if (!enabled || !globe || previous) return;
      previous = Object.fromEntries(
        Object.keys(GLOBE_LIGHTING).map((key) => [key, globe[key]]),
      );
      Object.assign(globe, GLOBE_LIGHTING);
    },
    restore() {
      if (!previous || !globe) return;
      Object.assign(globe, previous);
      previous = null;
    },
  };
}
