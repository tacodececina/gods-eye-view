import * as Cesium from 'cesium';
import { createFrameKeeper, ensureIcrfFixed } from '../time/frames.js';
import { getViewerSceneClock } from '../time/sceneClock.js';
import { bindSceneClockRender } from '../time/sceneClockRender.js';
import {
  governorRequestRender,
  holdContinuousRender,
  releaseContinuousRender,
} from '../renderGovernor.js';

/** Vista de depuración del marco para el arnés (`__godsEyeView.frames`). */
function framesDebug(frames) {
  return Object.freeze({
    status: () => frames.status(),
    icrfToFixed: (julianDate) =>
      frames.icrfToFixed(julianDate, new Cesium.Matrix3()),
    ensure: (julianDate) => ensureIcrfFixed(julianDate),
  });
}

/**
 * Tiempo de escena de la app (P5 T4): el reloj único ya ligado al viewer
 * (viewer.js), su política de render bajo el gobernador y el marco ICRF→ITRF
 * precargado alrededor de la época del reloj (comprobado en cada tick).
 * @param {{viewer: object, governor: {hold: Function, release: Function,
 *   request: Function}, createKeeper?: Function, clockTimers?: object}} options
 * @returns {{sceneClock: object, frames: object, framesDebug: object,
 *   destroy: () => void}}
 */
export function mountSceneTime({
  viewer,
  governor,
  createKeeper = createFrameKeeper,
  clockTimers,
}) {
  const sceneClock = getViewerSceneClock(viewer);
  if (!sceneClock) throw new Error('El viewer no tiene reloj de escena');
  const frames = createKeeper({
    onChange: () => governor.request('icrf-frame'),
  });
  const removeTick = viewer.clock.onTick.addEventListener((clock) =>
    frames.check(clock.currentTime),
  );
  const unbindRender = bindSceneClockRender({
    sceneClock,
    governor,
    clockTimers,
  });
  let mounted = true;
  return Object.freeze({
    sceneClock,
    frames,
    framesDebug: framesDebug(frames),
    destroy() {
      if (!mounted) return;
      mounted = false;
      removeTick();
      unbindRender();
      frames.destroy();
    },
  });
}

/** mountSceneTime con el gobernador de render de la aplicación. */
export function mountApplicationSceneTime(viewer) {
  return mountSceneTime({
    viewer,
    governor: {
      hold: holdContinuousRender,
      release: releaseContinuousRender,
      request: governorRequestRender,
    },
  });
}
