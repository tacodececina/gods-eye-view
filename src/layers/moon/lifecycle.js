/**
 * Ciclo de vida de la Luna 3D (P5 T6). Encendido: política de escena (una
 * sola Luna) → primitiva → `scene.preUpdate` (pose con el `time` del evento,
 * patrón de satellites/modelPose) → hold de render mientras el reloj corre.
 *
 * Apagado en el orden medido (scene-perf/result3-leak.json: sin
 * material.destroy() se pierden 20–22 texturas en 20 ciclos; con él, 0):
 * 1. quitar el listener; 2. guardar el material; 3. primitives.remove;
 * 4. material.destroy(); 5. soltar el hold (y el aviso del reloj);
 * 6. restaurar la política de escena.
 */

export const MOON_RENDER_OWNER = 'moon';

function destroyQuietly(target) {
  if (target && !target.isDestroyed?.()) target.destroy?.();
}

/** Pasos 1–6 del apagado; `live` es el estado encendido. */
function teardown(scene, live, render) {
  live.removeListener?.();
  const material = live.primitive?.appearance?.material;
  if (live.primitive && !scene.primitives.remove(live.primitive))
    destroyQuietly(live.primitive);
  destroyQuietly(material);
  live.unsubscribeClock?.();
  render.release(MOON_RENDER_OWNER);
  live.restorePolicy?.();
}

/** Pasos del encendido; si uno falla, deshace lo hecho y relanza. */
function bringUp(options, syncHold) {
  const { scene, createPrimitive, onFrame, render, sceneClock } = options;
  const next = {};
  try {
    next.restorePolicy = options.applyScenePolicy();
    next.primitive = createPrimitive();
    scene.primitives.add(next.primitive);
    next.removeListener = scene.preUpdate.addEventListener((_scene, time) =>
      onFrame(next.primitive, time),
    );
    next.unsubscribeClock = sceneClock.subscribe(syncHold);
  } catch (error) {
    teardown(scene, next, render);
    throw error;
  }
  return next;
}

/**
 * @param {{scene: object, createPrimitive: () => object,
 *   onFrame: (primitive: object, time: object) => void,
 *   render: {hold: Function, release: Function},
 *   sceneClock: {getState: Function, subscribe: Function},
 *   applyScenePolicy?: () => (() => void)}} options
 */
export function createMoonLifecycle(options) {
  const { scene, render, sceneClock } = options;
  const settings = { applyScenePolicy: () => () => {}, ...options };
  let live = null;
  let destroyed = false;
  const syncHold = ({ mode }) => {
    if (!live) return;
    if (mode === 'paused') render.release(MOON_RENDER_OWNER);
    else render.hold(MOON_RENDER_OWNER);
  };
  const disable = () => {
    if (!live) return;
    const current = live;
    live = null;
    teardown(scene, current, render);
  };
  return Object.freeze({
    enable() {
      if (destroyed) throw new Error('Luna destruida');
      if (live) return;
      live = bringUp(settings, syncHold);
      syncHold(sceneClock.getState());
    },
    disable,
    isEnabled: () => live !== null,
    primitive: () => live?.primitive ?? null,
    destroy() {
      disable();
      destroyed = true;
    },
  });
}
