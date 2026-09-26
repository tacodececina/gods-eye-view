import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EYE_SCENE_FAR_ENTER_M,
  EYE_SCENE_NEAR_ENTER_M,
  createSceneRegime,
  mountEyeScenePolicy,
  nextSceneRegime,
  sceneAppearance,
} from './eyeinskyScenePolicy.js';

test('far to near to far uses separate thresholds instead of flickering', () => {
  let regime = createSceneRegime(18_000_000);
  assert.equal(regime, 'far');
  regime = nextSceneRegime(regime, EYE_SCENE_NEAR_ENTER_M + 1);
  assert.equal(regime, 'far', 'approaching the threshold from space stays far');
  regime = nextSceneRegime(regime, EYE_SCENE_NEAR_ENTER_M - 1);
  assert.equal(regime, 'near');
  regime = nextSceneRegime(regime, EYE_SCENE_FAR_ENTER_M - 1);
  assert.equal(regime, 'near', 'the hysteresis band keeps the near regime');
  regime = nextSceneRegime(regime, EYE_SCENE_FAR_ENTER_M + 1);
  assert.equal(regime, 'far');
});

test('space remains black and starred while near treatment tints only imagery', () => {
  const far = sceneAppearance('far');
  const near = sceneAppearance('near');
  assert.equal(far.skyBox, true);
  assert.equal(near.skyBox, true);
  assert.equal(far.background, '#000000');
  assert.equal(near.background, '#000000');
  assert.ok(near.imagery.saturation > far.imagery.saturation);
  assert.ok(
    near.imagery.brightness > 0,
    'near imagery never becomes absolute black',
  );
});

/** Escena falsa con lo que la política toca, sin WebGL. */
function fakeViewer() {
  const scene = {
    moon: { show: true },
    skyBox: { show: true },
    skyAtmosphere: { atmosphereLightIntensity: 1 },
    backgroundColor: null,
    requestRender() {},
  };
  return {
    scene,
    imageryLayers: { get: () => null },
    camera: {
      positionCartographic: { height: 18_000_000 },
      moveEnd: { addEventListener: () => () => {} },
    },
  };
}

test('P5: una sola Luna — la política apaga scene.moon nativa en los dos regímenes', () => {
  assert.equal(sceneAppearance('far').nativeMoon, false);
  assert.equal(sceneAppearance('near').nativeMoon, false);
});

test('P5: montar la política apaga scene.moon y desmontarla la restaura', () => {
  const viewer = fakeViewer();
  const unmount = mountEyeScenePolicy(viewer, null);
  assert.equal(viewer.scene.moon.show, false, 'la Luna nativa queda apagada');
  unmount();
  assert.equal(viewer.scene.moon.show, true, 'se restaura el valor previo');
});

/** Colección de capas falsa con el orden y el evento layerAdded de Cesium. */
function fakeLayers(initial = []) {
  const list = [...initial];
  const listeners = new Set();
  return {
    list,
    get length() {
      return list.length;
    },
    get: (i) => list[i] ?? null,
    indexOf: (layer) => list.indexOf(layer),
    add(layer, index = list.length) {
      list.splice(index, 0, layer);
      for (const cb of [...listeners]) cb(layer, index);
    },
    remove(layer) {
      const i = list.indexOf(layer);
      if (i >= 0) list.splice(i, 1);
      return i >= 0;
    },
    contains: (layer) => list.includes(layer),
    layerAdded: {
      addEventListener(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
  };
}

function editorialViewer(layers = fakeLayers()) {
  const viewer = fakeViewer();
  viewer.imageryLayers = layers;
  viewer.scene.skyAtmosphere = {
    atmosphereLightIntensity: 1,
    brightnessShift: -0.08,
    saturationShift: -0.12,
  };
  viewer.scene.globe = {
    enableLighting: false,
    dynamicAtmosphereLighting: true,
    dynamicAtmosphereLightingFromSun: false,
    showGroundAtmosphere: true,
    lightingFadeOutDistance: 1e7,
    lightingFadeInDistance: 2e7,
    nightFadeOutDistance: 1e7,
    nightFadeInDistance: 5e7,
  };
  return viewer;
}

const EDITORIAL = Object.freeze({
  lighting: '1',
  nightLights: '1',
  stars: 'sober',
});

function factories() {
  const made = { night: [], skyBoxes: [] };
  return {
    made,
    createNightLayer: () => {
      const layer = { kind: 'night', nightAlpha: 1, dayAlpha: 0 };
      made.night.push(layer);
      return layer;
    },
    createSkyBox: (sources) => {
      const box = {
        sources,
        show: true,
        destroyed: false,
        destroy() {
          this.destroyed = true;
        },
      };
      made.skyBoxes.push(box);
      return box;
    },
  };
}

test('T2 halo: un solo dueño; far 20–24, near 12–16 y brightnessShift 0', () => {
  const far = sceneAppearance('far');
  const near = sceneAppearance('near');
  assert.ok(
    far.atmosphereLightIntensity >= 20 && far.atmosphereLightIntensity <= 24,
  );
  assert.ok(
    near.atmosphereLightIntensity >= 12 && near.atmosphereLightIntensity <= 16,
  );
  const viewer = editorialViewer();
  const unmount = mountEyeScenePolicy(viewer, null);
  assert.equal(viewer.scene.skyAtmosphere.brightnessShift, 0);
  assert.equal(
    viewer.scene.skyAtmosphere.atmosphereLightIntensity,
    far.atmosphereLightIntensity,
  );
  unmount();
  assert.equal(viewer.scene.skyAtmosphere.brightnessShift, -0.08, 'restaura');
});

test('T2 [G-2]: la capa base se lee en cada aplicación, no al montar', () => {
  const layers = fakeLayers();
  const viewer = editorialViewer(layers);
  const unmount = mountEyeScenePolicy(viewer, null);
  const base = { brightness: 1, saturation: 1, gamma: 1 };
  layers.add(base, 0);
  assert.equal(base.brightness, sceneAppearance('far').imagery.brightness);
  unmount();
  assert.equal(base.brightness, 1, 'la base vuelve a su valor');
});

test('T2 legacy: sin flags no cambian luz, noche ni cielo', () => {
  const viewer = editorialViewer();
  const originalSky = viewer.scene.skyBox;
  const f = factories();
  const unmount = mountEyeScenePolicy(viewer, null, { ...f });
  assert.equal(viewer.scene.globe.enableLighting, false);
  assert.equal(viewer.scene.skyBox, originalSky);
  assert.equal(f.made.night.length, 0);
  unmount();
});

test('T2 editorial: luz solar, capa nocturna sobre la base y noche de la base 0.08–0.15', () => {
  const layers = fakeLayers();
  const viewer = editorialViewer(layers);
  const f = factories();
  const unmount = mountEyeScenePolicy(viewer, null, { flags: EDITORIAL, ...f });
  assert.equal(viewer.scene.globe.enableLighting, true);
  const base = { brightness: 1, saturation: 1, gamma: 1, nightAlpha: 1 };
  layers.add(base, 0);
  const night = f.made.night[0];
  assert.ok(night, 'se crea la capa nocturna');
  assert.ok(
    layers.indexOf(night) > layers.indexOf(base),
    'noche sobre la base',
  );
  assert.ok(
    base.nightAlpha >= 0.08 && base.nightAlpha <= 0.15,
    `${base.nightAlpha}`,
  );
  const replacement = { brightness: 1, saturation: 1, gamma: 1, nightAlpha: 1 };
  layers.add(replacement, 0);
  assert.ok(layers.indexOf(night) > layers.indexOf(replacement));
  unmount();
  assert.equal(layers.contains(night), false, 'se retira al desmontar');
  assert.equal(viewer.scene.globe.enableLighting, false);
  assert.equal(replacement.nightAlpha, 1);
});

test('T2 cielo sobrio: SkyBox propio visible, fondo negro y restauración', () => {
  const viewer = editorialViewer();
  const original = viewer.scene.skyBox;
  const f = factories();
  const unmount = mountEyeScenePolicy(viewer, null, { flags: EDITORIAL, ...f });
  const own = f.made.skyBoxes[0];
  assert.equal(viewer.scene.skyBox, own);
  assert.equal(viewer.scene.skyBox.show, true);
  assert.deepEqual(Object.keys(own.sources).sort(), [
    'negativeX',
    'negativeY',
    'negativeZ',
    'positiveX',
    'positiveY',
    'positiveZ',
  ]);
  assert.equal(own.sources.positiveX, '/sky/px.png');
  unmount();
  assert.equal(viewer.scene.skyBox, original);
  assert.equal(own.destroyed, true);
});

test('T2 halo con volumen: alturas de escala ×3 lejos, físicas cerca, y restauración', () => {
  const far = sceneAppearance('far');
  const near = sceneAppearance('near');
  assert.equal(far.halo.atmosphereRayleighScaleHeight, 30_000);
  assert.equal(far.halo.atmosphereMieScaleHeight, 9_000);
  assert.equal(near.halo.atmosphereRayleighScaleHeight, 10_000);
  assert.equal(near.halo.atmosphereMieScaleHeight, 3_200);
  const viewer = editorialViewer();
  Object.assign(viewer.scene.skyAtmosphere, {
    atmosphereRayleighScaleHeight: 10_000,
    atmosphereMieScaleHeight: 3_200,
  });
  const unmount = mountEyeScenePolicy(viewer, null);
  assert.equal(
    viewer.scene.skyAtmosphere.atmosphereRayleighScaleHeight,
    30_000,
  );
  unmount();
  assert.equal(
    viewer.scene.skyAtmosphere.atmosphereRayleighScaleHeight,
    10_000,
  );
  assert.equal(viewer.scene.skyAtmosphere.atmosphereMieScaleHeight, 3_200);
});
