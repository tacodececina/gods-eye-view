/**
 * Presupuesto de textura de la Luna (P5 T9). Textura LROC del CGI Moon Kit de
 * NASA SVS (svs.gsfc.nasa.gov/4720; dominio público, crédito «NASA's
 * Scientific Visualization Studio»; ledger en docs/eyeinsky/p5/ASSET-LEDGER.md):
 *
 * - 1k (`lroc_color_poles_1k.jpg`, mapa 2019, polos rellenos con LDAM): por
 *   defecto, también en móvil y con save-data.
 * - 2k (`lroc_color_2k.jpg`, mapa 2025): solo escritorio, sin save-data y con
 *   la Luna > 300 px en pantalla. Nunca más de 2k (lo demás es P6).
 * - Si la textura no carga, se queda el placeholder gris rotulado.
 */

export const MOON_TEXTURES = Object.freeze({
  '1k': 'models/moon/lroc-color-1k-b246064f.jpg',
  '2k': 'models/moon/lroc-color-2k-f7130a18.jpg',
});
export const MOON_2K_MIN_PX = 300;

/**
 * @param {{mobile: boolean, saveData: boolean, moonPx: number}} input
 * @returns {'1k'|'2k'}
 */
export function chooseMoonTexture({ mobile, saveData, moonPx }) {
  return !mobile && !saveData && moonPx > MOON_2K_MIN_PX ? '2k' : '1k';
}

/** Diámetro aparente (px) de una esfera de `radiusM` a `distanceM` de la cámara. */
export function moonDiameterPx({ distanceM, radiusM, fovyRad, heightPx }) {
  if (!(distanceM > radiusM)) return Infinity;
  const focal = heightPx / 2 / Math.tan(fovyRad / 2);
  return 2 * focal * Math.tan(Math.asin(radiusM / distanceM));
}

/** Entorno del navegador: móvil (puntero grueso o estrecho) y save-data. */
export function browserTextureEnv(view = globalThis) {
  const coarse = view.matchMedia?.('(pointer: coarse)')?.matches === true;
  const narrow = view.matchMedia?.('(max-width: 760px)')?.matches === true;
  return {
    mobile: coarse || narrow,
    saveData: view.navigator?.connection?.saveData === true,
  };
}
