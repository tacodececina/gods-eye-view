/**
 * Sondas de página del arnés P4 UX (eyeinsky-p4-ux.mjs): proyección del
 * modelo del seguido, anclaje de la tarjeta y visibilidad del objetivo sobre
 * el canvas (no tapado por el Mission Dock). Cada una corre en un solo turno
 * de JS de la página, así que sus medidas son del mismo frame.
 */

/** Proyección y tamaño del modelo del seguido, en píxeles CSS. */
export const modelScreen = (page, noradId) =>
  page.evaluate((id) => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    let model = null;
    const walk = (primitive) => {
      if (!primitive || model || primitive.isDestroyed?.()) return;
      if (primitive.gevSatelliteNorad === id) {
        model = primitive;
        return;
      }
      if (primitive instanceof C.PrimitiveCollection)
        for (let i = 0; i < primitive.length; i += 1) walk(primitive.get(i));
    };
    walk(viewer.scene.primitives);
    if (!model?.ready) return { ok: false, reason: 'sin modelo listo' };
    const sphere = model.boundingSphere;
    const screen = C.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      sphere.center,
    );
    const distance = C.Cartesian3.distance(
      viewer.camera.positionWC,
      sphere.center,
    );
    const heightPx = viewer.scene.canvas.clientHeight;
    const px =
      (sphere.radius * heightPx) /
      (distance * Math.tan(viewer.camera.frustum.fovy / 2));
    return {
      ok: Boolean(screen),
      x: screen?.x,
      y: screen?.y,
      diameterPx: px,
      radiusM: sphere.radius,
      distanceM: distance,
      show: model.show,
    };
  }, noradId);

/**
 * Distancia en pantalla entre el ancla de la tarjeta del seguido
 * (gevVisualPosition, con respaldo gevDisplayPosition) y el centro del modelo,
 * medidas en el mismo turno de JS (mismo frame).
 */
export const cardOffset = (page, noradId) =>
  page.evaluate((id) => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const entity = viewer.trackedEntity;
    const anchor =
      entity?.gevVisualPosition?.() ?? entity?.gevDisplayPosition?.();
    let model = null;
    const walk = (primitive) => {
      if (!primitive || model || primitive.isDestroyed?.()) return;
      if (primitive.gevSatelliteNorad === id) model = primitive;
      else if (primitive instanceof C.PrimitiveCollection)
        for (let i = 0; i < primitive.length; i += 1) walk(primitive.get(i));
    };
    walk(viewer.scene.primitives);
    if (!anchor || !model?.ready) return { ok: false };
    const origin = C.Matrix4.getTranslation(
      model.modelMatrix,
      new C.Cartesian3(),
    );
    const a = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, anchor);
    const b = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, origin);
    const bracket = window.__godsEyeView.dataManager.layers
      .get('satellites')
      .module.getDetectableObjects()
      .find((object) => object.sourceId === id)?.position;
    const c = bracket
      ? C.SceneTransforms.worldToWindowCoordinates(viewer.scene, bracket)
      : null;
    return {
      ok: Boolean(a && b && c),
      offsetPx: a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null,
      bracketOffsetPx: c && b ? Math.hypot(c.x - b.x, c.y - b.y) : null,
    };
  }, noradId);

/**
 * Dónde cae en pantalla el objetivo seguido (centro del modelo si está listo,
 * si no el punto) y qué elemento hay ahí: debe ser el canvas, no el dock.
 */
export const trackedOnCanvas = (page, noradId) =>
  page.evaluate((id) => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    let model = null;
    const walk = (primitive) => {
      if (!primitive || model || primitive.isDestroyed?.()) return;
      if (primitive.gevSatelliteNorad === id) model = primitive;
      else if (primitive instanceof C.PrimitiveCollection)
        for (let i = 0; i < primitive.length; i += 1) walk(primitive.get(i));
    };
    walk(viewer.scene.primitives);
    const entity = viewer.trackedEntity;
    const world = model?.ready
      ? model.boundingSphere.center
      : entity?.position?.getValue(viewer.clock.currentTime);
    const screen = world
      ? C.SceneTransforms.worldToWindowCoordinates(viewer.scene, world)
      : null;
    if (!screen) return { ok: false, reason: 'sin proyección' };
    const band = Number.parseFloat(
      document.documentElement.style.getPropertyValue('--eye-dock-band'),
    );
    const hit = document.elementFromPoint(screen.x, screen.y);
    return {
      ok: true,
      source: model?.ready ? 'modelo' : 'punto',
      x: screen.x,
      y: screen.y,
      dockBandPx: Number.isFinite(band) ? band : 0,
      freeBottomPx: window.innerHeight - (Number.isFinite(band) ? band : 0),
      hitTag: hit?.tagName ?? null,
      hitClass: hit?.className ? String(hit.className) : null,
    };
  }, noradId);
