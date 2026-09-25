/**
 * Arnés de navegador de EYEINSKY P5 (Tierra–Luna) — contrato de escena.
 *
 * T0 lo deja en RED a propósito: describe lo que P5 debe cumplir y que hoy
 * no se cumple.
 *
 * - `moon-native-off`: una sola Luna; la `scene.moon` nativa (Simon1994,
 *   reloj congelado, sin profundidad) está apagada.
 * - `clock-advances`: `viewer.clock` corre con `shouldAnimate` y su
 *   `currentTime` avanza ≥ 4,9 s en 5 s de reloj de pared.
 * - `icrf-fixed-ready`: la app precargó IAU2006 XYS con su propio módulo de
 *   marcos: `__godsEyeView.frames.icrfToFixed(currentTime).status === 'ok'` y
 *   `Transforms.computeIcrfToFixedMatrix(currentTime)` definido sin que el
 *   arnés precargue nada. La matriz cruda sola no basta: hoy aparece porque
 *   la `scene.moon` nativa (Moon.js:111) dispara la carga perezosa del trozo
 *   XYS de «ahora», y P5 apaga esa Luna.
 * - `ring-moon-matches-3d`: el marcador lunar del anillo apunta a la misma
 *   dirección que la Luna 3D (≤ 1e-9 rad), leído de
 *   `__godsEyeView.moon.getState()` y
 *   `__godsEyeView.celestialRing.getDebugState().moonFixed`.
 * - `time-strip-present`: la tira TIEMPO existe (`[data-eye-time-strip]`).
 *
 * Uso: node scripts/eyeinsky-p5.mjs <url> <directorio-de-salida>
 * La salida es OBLIGATORIA y no puede contener ya un result.json.
 * Nunca arranca servidor: apúntalo a uno vivo.
 */
import {
  createRecorder,
  finishRun,
  launchBrowser,
  prepareRun,
  screenshot,
  sleep,
} from './lib/eyeinsky-p4-run.mjs';
import { openApp, webglRenderer } from './lib/eyeinsky-p4-page.mjs';

/** Tolerancias del contrato P5 (propuesta §3, §8 T7). */
export const CLOCK_WINDOW_MS = 5_000;
export const CLOCK_MIN_ADVANCE_S = 4.9;
export const RING_MOON_MAX_RAD = 1e-9;

const VIEWPORT = { width: 1280, height: 800 };

/** Lo que la escena expone hoy del reloj, la Luna nativa y el marco. */
const sceneProbe = (page) =>
  page.evaluate(() => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const time = viewer.clock.currentTime;
    const matrix = C.Transforms.computeIcrfToFixedMatrix(time);
    const frames = window.__godsEyeView.frames;
    return {
      wallMs: performance.now(),
      clockIso: C.JulianDate.toIso8601(time, 3),
      shouldAnimate: viewer.clock.shouldAnimate,
      canAnimate: viewer.clock.canAnimate,
      multiplier: viewer.clock.multiplier,
      clockStep: viewer.clock.clockStep,
      nativeMoon: viewer.scene.moon ? { show: viewer.scene.moon.show } : null,
      icrfToFixedDefined: matrix !== undefined,
      appFrameStatus: frames?.icrfToFixed?.(time)?.status ?? null,
    };
  });

/** Segundos de reloj de escena entre dos lecturas ISO. */
const clockAdvanceS = (a, b) =>
  (Date.parse(b.clockIso) - Date.parse(a.clockIso)) / 1000;

/** Luna 3D y marcador del anillo, si existen; el motivo si no. */
const ringMoonProbe = (page) =>
  page.evaluate(() => {
    const debug = window.__godsEyeView;
    const moon = debug.moon?.getState?.();
    const ring = debug.celestialRing;
    if (!moon) return { ok: false, reason: 'sin Luna 3D (__godsEyeView.moon)' };
    if (!ring) return { ok: false, reason: 'anillo no expuesto' };
    ring.setEnabled?.(true);
    const marker = ring.getDebugState?.()?.moonFixed;
    if (moon.status !== 'ok' || !moon.positionFixedM)
      return { ok: false, reason: `Luna 3D en estado ${moon.status}` };
    if (!marker) return { ok: false, reason: 'el anillo no da moonFixed' };
    const p = moon.positionFixedM;
    const norm = Math.hypot(p.x, p.y, p.z);
    const cos =
      (p.x * marker.x + p.y * marker.y + p.z * marker.z) /
      (norm * Math.hypot(marker.x, marker.y, marker.z));
    return { ok: true, angleRad: Math.acos(Math.min(1, Math.max(-1, cos))) };
  });

const timeStripProbe = (page) =>
  page.evaluate(() => {
    const strip = document.querySelector('[data-eye-time-strip]');
    return strip
      ? { present: true, text: strip.textContent?.trim() ?? '' }
      : { present: false };
  });

async function checkClockAndMoon(page, result, check) {
  const before = await sceneProbe(page);
  await sleep(CLOCK_WINDOW_MS);
  const after = await sceneProbe(page);
  result.snapshots.clock = { before, after };
  check(
    'moon-native-off',
    after.nativeMoon?.show === false,
    `scene.moon.show=${after.nativeMoon?.show ?? 'sin scene.moon'}`,
    ['P5-06'],
  );
  const advance = clockAdvanceS(before, after);
  check(
    'clock-advances',
    after.shouldAnimate === true && advance >= CLOCK_MIN_ADVANCE_S,
    `shouldAnimate=${after.shouldAnimate}; avance ${advance.toFixed(3)} s en ${CLOCK_WINDOW_MS / 1000} s de pared (mín. ${CLOCK_MIN_ADVANCE_S})`,
    ['P5-05'],
  );
  check(
    'icrf-fixed-ready',
    after.icrfToFixedDefined && after.appFrameStatus === 'ok',
    `computeIcrfToFixedMatrix(${after.clockIso}) ${after.icrfToFixedDefined ? 'definido' : 'undefined'}; módulo de marcos de la app: ${after.appFrameStatus ?? 'ausente (__godsEyeView.frames)'}`,
    ['P5-03', 'P5-10'],
  );
}

async function checkRingAndStrip(page, result, check) {
  const ring = await ringMoonProbe(page);
  result.snapshots.ringMoon = ring;
  check(
    'ring-moon-matches-3d',
    ring.ok && ring.angleRad <= RING_MOON_MAX_RAD,
    ring.ok
      ? `ángulo anillo↔Luna 3D ${ring.angleRad.toExponential(3)} rad (máx. ${RING_MOON_MAX_RAD})`
      : ring.reason,
    ['P5-06'],
  );
  const strip = await timeStripProbe(page);
  result.snapshots.timeStrip = strip;
  check(
    'time-strip-present',
    strip.present,
    strip.present
      ? `tira TIEMPO: «${strip.text}»`
      : 'no hay [data-eye-time-strip]',
    ['P5-04', 'P5-05'],
  );
}

const { baseUrl, out, resultPath } = await prepareRun('eyeinsky-p5.mjs');
const { result, check } = createRecorder({
  url: baseUrl,
  viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
  phase: 'P5',
});
const { browser, close } = await launchBrowser('eye-p5-');
try {
  const page = await openApp(browser, result, baseUrl, VIEWPORT, {
    enableSatellites: false,
    requireNorad: null,
  });
  result.webglRenderer = await webglRenderer(page);
  await checkClockAndMoon(page, result, check);
  await checkRingAndStrip(page, result, check);
  await screenshot(result, out, page, 'p5-scene.png');
} catch (error) {
  result.fatal = String(error?.stack ?? error);
  console.error(error);
} finally {
  await close();
}
await finishRun(result, resultPath);
