import * as Cesium from 'cesium';
import { createGlobeLighting } from './eyeinskyGlobeLighting.js';
import {
  createNightLightsLayer,
  nightLightsHealth,
} from '../maps/nightLights.js';

export const EYE_SCENE_NEAR_ENTER_M = 6_800_000;
export const EYE_SCENE_FAR_ENTER_M = 8_600_000;

/**
 * P5: una sola Luna. La `scene.moon` nativa de Cesium (Simon1994) queda
 * apagada en los dos regímenes; la Luna la dibuja la capa P5 (DE441).
 *
 * Fase visual T2: esta política es el ÚNICO dueño del halo (`skyAtmosphere`):
 * el viewer ya no lo escribe. Intensidad ≈ 22 lejos y 14 cerca, sin oscurecer
 * el anillo (brightnessShift 0). El casquete de Cesium es fijo (1,025 R ≈ 9 px
 * en Global) y con alturas de escala físicas el brillo muere en 2–3 px
 * (medido): lejos se triplican (30 km / 9 km) para que el halo tenga volumen;
 * cerca vuelven a las físicas (10 km / 3,2 km) y el cielo desde el suelo no
 * cambia.
 */
const HALO = Object.freeze({
  brightnessShift: 0,
  saturationShift: -0.06,
  hueShift: 0,
});

const APPEARANCES = Object.freeze({
  far: Object.freeze({
    skyBox: true,
    nativeMoon: false,
    background: '#000000',
    atmosphereLightIntensity: 22,
    halo: Object.freeze({
      atmosphereRayleighScaleHeight: 30_000,
      atmosphereMieScaleHeight: 9_000,
    }),
    imagery: Object.freeze({ brightness: 0.82, saturation: 0.78, gamma: 0.98 }),
  }),
  near: Object.freeze({
    skyBox: true,
    nativeMoon: false,
    background: '#000000',
    atmosphereLightIntensity: 14,
    halo: Object.freeze({
      atmosphereRayleighScaleHeight: 10_000,
      atmosphereMieScaleHeight: 3_200,
    }),
    imagery: Object.freeze({ brightness: 0.74, saturation: 0.9, gamma: 0.94 }),
  }),
});

/** Lado nocturno de la capa base con luz solar: casi negro, nunca vacío. */
export const BASE_NIGHT_ALPHA = 0.12;

/** Caras del SkyBox sobrio (scripts/eyeinsky-skybox.mjs, catálogo BSC5). */
export const SOBER_SKY_SOURCES = Object.freeze({
  positiveX: '/sky/px.png',
  negativeX: '/sky/nx.png',
  positiveY: '/sky/py.png',
  negativeY: '/sky/ny.png',
  positiveZ: '/sky/pz.png',
  negativeZ: '/sky/nz.png',
});

const NIGHT_ABSENT_CREDIT =
  'Luces nocturnas no disponibles: NASA GIBS no respondió';

export function createSceneRegime(heightM) {
  return Number(heightM) <= EYE_SCENE_NEAR_ENTER_M ? 'near' : 'far';
}

export function nextSceneRegime(current, heightM) {
  const height = Number(heightM);
  if (!Number.isFinite(height)) return current === 'near' ? 'near' : 'far';
  if (current === 'near')
    return height >= EYE_SCENE_FAR_ENTER_M ? 'far' : 'near';
  return height <= EYE_SCENE_NEAR_ENTER_M ? 'near' : 'far';
}

export function sceneAppearance(regime) {
  return APPEARANCES[regime === 'near' ? 'near' : 'far'];
}

const DEFAULT_FACTORIES = Object.freeze({
  createNightLayer: () => createNightLightsLayer({ Cesium }),
  createSkyBox: (sources) => new Cesium.SkyBox({ sources }),
});

/** SkyBox propio (D4): guarda el original y lo devuelve al desmontar. */
function mountSoberSky(scene, enabled, createSkyBox) {
  if (!enabled || !scene.skyBox) return () => {};
  const original = scene.skyBox;
  const own = createSkyBox(SOBER_SKY_SOURCES);
  own.show = true;
  scene.skyBox = own;
  return () => {
    if (scene.skyBox === own) scene.skyBox = original;
    own.destroy?.();
  };
}

/** Salud de la capa: tras 6 fallos sin éxito se retira y se dice. */
function watchNightHealth(viewer, layer, onAbsent) {
  const provider = layer.imageryProvider ?? layer.provider;
  if (!provider?.errorEvent?.addEventListener) return () => {};
  const health = nightLightsHealth({ maxErrors: 6 });
  const request = provider.requestImage?.bind(provider);
  if (request)
    provider.requestImage = (...args) => {
      const pending = request(...args);
      pending?.then?.(
        () => health.recordLoad(),
        () => {},
      );
      return pending;
    };
  return provider.errorEvent.addEventListener(() => {
    health.recordError();
    if (health.state() === 'absent') onAbsent();
  });
}

/** Capa nocturna por encima de la base; se retira al desmontar o si falta. */
function mountNightLights(viewer, enabled, createNightLayer) {
  const layers = viewer.imageryLayers;
  if (!enabled || !layers?.add) return { layer: null, destroy() {} };
  const layer = createNightLayer();
  layers.add(layer);
  const credits = viewer.cesiumWidget?.creditDisplay;
  let absentCredit = null;
  const stopHealth = watchNightHealth(viewer, layer, () => {
    if (layers.contains?.(layer)) layers.remove(layer, true);
    if (!absentCredit && credits) {
      absentCredit = new Cesium.Credit(NIGHT_ABSENT_CREDIT, false);
      credits.addStaticCredit(absentCredit);
    }
    viewer.scene?.requestRender?.();
  });
  return {
    layer,
    destroy() {
      stopHealth?.();
      if (layers.contains?.(layer)) layers.remove(layer, true);
      if (absentCredit) credits?.removeStaticCredit(absentCredit);
    },
  };
}

/** Recuerda los valores previos de cada capa base que toca, para restaurar. */
function createBaseImagery(viewer, nightLayer, lit) {
  const touched = new Map();
  return {
    apply(appearance) {
      const base = viewer.imageryLayers?.get?.(0) || null;
      if (!base || base === nightLayer) return;
      if (!touched.has(base))
        touched.set(base, {
          brightness: base.brightness,
          saturation: base.saturation,
          gamma: base.gamma,
          ...(lit ? { nightAlpha: base.nightAlpha } : {}),
        });
      Object.assign(base, appearance.imagery);
      if (lit) base.nightAlpha = BASE_NIGHT_ALPHA;
    },
    restore() {
      for (const [layer, values] of touched) Object.assign(layer, values);
      touched.clear();
    },
  };
}

function snapshotScene(scene) {
  const atmosphere = scene.skyAtmosphere;
  return {
    skyBox: scene.skyBox?.show,
    nativeMoon: scene.moon?.show,
    background: scene.backgroundColor,
    halo: atmosphere
      ? {
          atmosphereLightIntensity: atmosphere.atmosphereLightIntensity,
          brightnessShift: atmosphere.brightnessShift,
          saturationShift: atmosphere.saturationShift,
          hueShift: atmosphere.hueShift,
          atmosphereRayleighScaleHeight:
            atmosphere.atmosphereRayleighScaleHeight,
          atmosphereMieScaleHeight: atmosphere.atmosphereMieScaleHeight,
        }
      : null,
  };
}

function restoreScene(scene, previous) {
  if (scene.skyBox && previous.skyBox !== undefined)
    scene.skyBox.show = previous.skyBox;
  if (scene.moon && previous.nativeMoon !== undefined)
    scene.moon.show = previous.nativeMoon;
  scene.backgroundColor = previous.background;
  if (scene.skyAtmosphere && previous.halo)
    for (const [key, value] of Object.entries(previous.halo))
      if (value !== undefined) scene.skyAtmosphere[key] = value;
}

function applyAppearance(scene, appearance) {
  if (scene.skyBox) scene.skyBox.show = appearance.skyBox;
  if (scene.moon) scene.moon.show = appearance.nativeMoon;
  scene.backgroundColor = Cesium.Color.fromCssColorString(
    appearance.background,
  );
  if (scene.skyAtmosphere)
    Object.assign(scene.skyAtmosphere, HALO, appearance.halo, {
      atmosphereLightIntensity: appearance.atmosphereLightIntensity,
    });
}

/**
 * Aplica la apariencia por altura sin ser otro bucle de render. Con los flags
 * de la fase visual (§2.1) añade la luz solar, la capa nocturna y el SkyBox
 * sobrio; sin ellos (legacy) solo gobierna halo, Luna, fondo y la base.
 * @param {object} viewer Cesium viewer.
 * @param {HTMLElement|null} [root] Nodo que publica `data-eye-scene`.
 * @param {{flags?: {lighting?: string, nightLights?: string, stars?: string},
 *   createNightLayer?: Function, createSkyBox?: Function}} [options]
 * @returns {() => void} Desmontaje que restaura lo encontrado.
 */
export function mountEyeScenePolicy(
  viewer,
  root = globalThis.document?.body,
  { flags = {}, ...factories } = {},
) {
  const scene = viewer?.scene;
  if (!scene) return () => {};
  const { createNightLayer, createSkyBox } = {
    ...DEFAULT_FACTORIES,
    ...factories,
  };
  const lit = flags.lighting === '1';
  const previous = snapshotScene(scene);
  const lighting = createGlobeLighting({ globe: scene.globe ?? null });
  lighting.apply(lit);
  const restoreSky = mountSoberSky(
    scene,
    flags.stars === 'sober',
    createSkyBox,
  );
  const night = mountNightLights(
    viewer,
    flags.nightLights === '1',
    createNightLayer,
  );
  const base = createBaseImagery(viewer, night.layer, lit);
  let regime = createSceneRegime(viewer.camera?.positionCartographic?.height);
  let destroyed = false;

  const apply = (force = false) => {
    if (destroyed) return;
    const next = nextSceneRegime(
      regime,
      viewer.camera?.positionCartographic?.height,
    );
    if (!force && next === regime) return;
    regime = next;
    const appearance = sceneAppearance(regime);
    applyAppearance(scene, appearance);
    base.apply(appearance);
    if (root?.dataset) root.dataset.eyeScene = regime;
    scene.requestRender?.();
  };
  apply(true);
  const removeMoveEnd = viewer.camera?.moveEnd?.addEventListener?.(() =>
    apply(),
  );
  const removeLayerAdded = viewer.imageryLayers?.layerAdded?.addEventListener?.(
    () => apply(true),
  );

  return () => {
    if (destroyed) return;
    destroyed = true;
    removeMoveEnd?.();
    removeLayerAdded?.();
    night.destroy();
    restoreSky();
    base.restore();
    lighting.restore();
    restoreScene(scene, previous);
    if (root?.dataset) delete root.dataset.eyeScene;
  };
}
