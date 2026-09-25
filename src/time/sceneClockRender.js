/**
 * Render del reloj de escena bajo el gobernador (P5 T4). `requestRenderMode`
 * congela la escena si nadie pide fotogramas, así que:
 *
 * - `simulated`: hold continuo ('scene-clock') mientras el tiempo corre
 *   deprisa (Sol, luz y Luna se mueven de forma visible).
 * - `live`: sin hold; un `requestRender` cada LIVE_RENDER_INTERVAL_MS (el Sol
 *   se mueve 0,25°/min: 5 s son 0,02°). La Luna visible pide su propio hold
 *   (layers/moon/lifecycle.js).
 * - `paused`: nada continuo.
 *
 * Además, CADA notificación del reloj (setTime/seek, pausa, setNow, cambio de
 * ritmo) pide un fotograma ('scene-clock-change'): sin eso, un seek en pausa
 * actualiza rótulos y estado pero no repinta Luna, Sol ni anillo (P5-04).
 */

export const SCENE_CLOCK_RENDER_OWNER = 'scene-clock';
export const LIVE_RENDER_INTERVAL_MS = 5_000;
export const SCENE_CLOCK_CHANGE_REASON = 'scene-clock-change';

const DEFAULT_TIMERS = Object.freeze({
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id),
});

/**
 * @param {{sceneClock: object, governor: {hold: Function, release: Function,
 *   request: Function}, clockTimers?: object}} options
 * @returns {() => void} Suelta hold y temporizador y se desuscribe.
 */
export function bindSceneClockRender({
  sceneClock,
  governor,
  clockTimers = DEFAULT_TIMERS,
}) {
  let timer = null;
  let bound = true;
  const stopTimer = () => {
    if (timer === null) return;
    clockTimers.clearInterval(timer);
    timer = null;
  };
  const apply = ({ mode }) => {
    if (mode === 'simulated') governor.hold(SCENE_CLOCK_RENDER_OWNER);
    else governor.release(SCENE_CLOCK_RENDER_OWNER);
    if (mode !== 'live') stopTimer();
    else if (timer === null)
      timer = clockTimers.setInterval(
        () => governor.request('scene-clock-live'),
        LIVE_RENDER_INTERVAL_MS,
      );
  };
  const unsubscribe = sceneClock.subscribe((state) => {
    apply(state);
    governor.request(SCENE_CLOCK_CHANGE_REASON);
  });
  apply(sceneClock.getState());
  return () => {
    if (!bound) return;
    bound = false;
    unsubscribe();
    stopTimer();
    governor.release(SCENE_CLOCK_RENDER_OWNER);
  };
}
