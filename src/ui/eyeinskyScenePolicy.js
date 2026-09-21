import * as Cesium from 'cesium';

export const EYE_SCENE_NEAR_ENTER_M = 6_800_000;
export const EYE_SCENE_FAR_ENTER_M = 8_600_000;

const APPEARANCES = Object.freeze({
  far: Object.freeze({
    skyBox: true,
    background: '#000000',
    atmosphereLightIntensity: 7,
    imagery: Object.freeze({ brightness: 0.82, saturation: 0.78, gamma: 0.98 }),
  }),
  near: Object.freeze({
    skyBox: true,
    background: '#000000',
    atmosphereLightIntensity: 9,
    imagery: Object.freeze({ brightness: 0.74, saturation: 0.9, gamma: 0.94 }),
  }),
});

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

/** Apply one altitude-owned appearance without becoming another render loop. */
export function mountEyeScenePolicy(viewer, root = globalThis.document?.body) {
  const scene = viewer?.scene;
  if (!scene) return () => {};
  const imagery = viewer.imageryLayers?.get?.(0) || null;
  const previous = {
    skyBox: scene.skyBox?.show,
    background: scene.backgroundColor,
    atmosphereLightIntensity: scene.skyAtmosphere?.atmosphereLightIntensity,
    imagery: imagery
      ? {
          brightness: imagery.brightness,
          saturation: imagery.saturation,
          gamma: imagery.gamma,
        }
      : null,
  };
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
    if (scene.skyBox) scene.skyBox.show = appearance.skyBox;
    scene.backgroundColor = Cesium.Color.fromCssColorString(
      appearance.background,
    );
    if (scene.skyAtmosphere)
      scene.skyAtmosphere.atmosphereLightIntensity =
        appearance.atmosphereLightIntensity;
    if (imagery) Object.assign(imagery, appearance.imagery);
    if (root?.dataset) root.dataset.eyeScene = regime;
    scene.requestRender?.();
  };
  apply(true);
  const removeMoveEnd = viewer.camera?.moveEnd?.addEventListener?.(() =>
    apply(),
  );

  return () => {
    if (destroyed) return;
    destroyed = true;
    removeMoveEnd?.();
    if (scene.skyBox && previous.skyBox !== undefined)
      scene.skyBox.show = previous.skyBox;
    scene.backgroundColor = previous.background;
    if (scene.skyAtmosphere && previous.atmosphereLightIntensity !== undefined)
      scene.skyAtmosphere.atmosphereLightIntensity =
        previous.atmosphereLightIntensity;
    if (imagery && previous.imagery) Object.assign(imagery, previous.imagery);
    if (root?.dataset) delete root.dataset.eyeScene;
  };
}
