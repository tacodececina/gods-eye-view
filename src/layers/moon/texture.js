import * as Cesium from 'cesium';
import {
  MOON_TEXTURES,
  browserTextureEnv,
  chooseMoonTexture,
} from './textureBudget.js';

/**
 * Textura LROC de la Luna viva (P5 T9). La primitiva nace con el placeholder
 * gris; la imagen se precarga aparte y solo al llegar sustituye al uniform
 * (`material.uniforms.image`, que destruye la textura anterior al cambiar).
 * Si no carga, se queda el placeholder: nunca una Luna blanca por un 404.
 * Una carga que llega tras apagar se descarta (generación).
 */

export const MOON_TEXTURE_CREDIT = Object.freeze({
  key: 'nasa-svs-4720-lroc',
  html: "Moon texture: NASA's Scientific Visualization Studio, CGI Moon Kit (LRO LROC WAC color mosaic, LOLA), public domain.",
});

const TIER_STATE = Object.freeze({ '1k': 'lroc-1k', '2k': 'lroc-2k' });
/** Fuera del navegador (tests en Node) no hay imagen que cargar. */
const defaultLoad = (url) =>
  typeof globalThis.Image === 'function'
    ? Cesium.Resource.fetchImage({ url })
    : Promise.reject(new Error('sin navegador'));
const warn = (error) => {
  if (globalThis.document)
    globalThis.console?.warn?.('[moon] textura LROC no disponible', error);
};

/**
 * @param {{resolveAsset: (uri: string) => string, loadImage?: Function,
 *   env?: () => {mobile: boolean, saveData: boolean},
 *   credits: {register: Function, unregister: Function},
 *   onChange?: () => void}} options
 */
export function createMoonTexture({
  resolveAsset,
  loadImage = defaultLoad,
  env = browserTextureEnv,
  credits,
  onChange = () => {},
}) {
  const live = { generation: 0, tier: null, pending: null, credited: false };
  const apply = (primitive, tier, generation) => (image) => {
    if (generation !== live.generation || !image) return;
    primitive.appearance.material.uniforms.image = image;
    live.tier = tier;
    if (!live.credited) credits.register(MOON_TEXTURE_CREDIT);
    live.credited = true;
    onChange();
  };
  const load = (primitive, tier) => {
    live.pending = tier;
    const generation = live.generation;
    let request;
    try {
      request = Promise.resolve(loadImage(resolveAsset(MOON_TEXTURES[tier])));
    } catch (error) {
      request = Promise.reject(error);
    }
    request.then(apply(primitive, tier, generation), warn).finally(() => {
      if (generation === live.generation) live.pending = null;
    });
  };
  return Object.freeze({
    start(primitive) {
      live.generation += 1;
      load(primitive, '1k');
    },
    /** Sube a 2k una vez si el presupuesto lo permite (nunca baja). */
    frame(primitive, moonPx) {
      if (live.tier !== '1k' || live.pending) return;
      if (chooseMoonTexture({ ...env(), moonPx }) === '2k')
        load(primitive, '2k');
    },
    stop() {
      live.generation += 1;
      live.tier = null;
      live.pending = null;
      if (live.credited) credits.unregister(MOON_TEXTURE_CREDIT);
      live.credited = false;
    },
    state: () => TIER_STATE[live.tier] ?? 'placeholder',
  });
}
