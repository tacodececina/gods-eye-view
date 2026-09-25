/**
 * Chequeos de la reparación T8 del arnés P5 (auditoría 2026-09-25), sobre la
 * pestaña principal:
 *
 * - `resume-after-live-pause` (P5-11): AVANCE ×3600 → AHORA → PAUSA →
 *   REANUDAR vuelve a EN VIVO, sin ×3600 y sin capas en vivo suspendidas.
 * - `sim-aim-now-return-keeps-live` (P5-11, P5-12): simular → APUNTAR →
 *   AHORA → VOLVER deja las capas como antes de simular (sismos incluidos).
 * - `keyboard-focus-stays-in-dock` (P5-17, WCAG 2.4.3): tras Enter en
 *   APUNTAR, ESCALA, VOLVER, AVANCE y AHORA el foco sigue en el dock y se
 *   ve; en 390×844 (dock compacto) APUNTAR repliega el dock y el foco va a
 *   MÁS (`mobile-keyboard-focus`).
 */
import { sleep } from './eyeinsky-p4-run.mjs';
import {
  FLIGHT_MS,
  keyboardActivate,
  layersProbe,
  moonAction,
  settle,
  stripProbe,
  timeCmd,
} from './eyeinsky-p5-dock.mjs';

const LIVE_TOLERANCE_MS = 60_000;

const clockState = (page) =>
  page.evaluate(() => window.__godsEyeView.sceneClock.getState());

const setLayer = (page, id, on) =>
  page.evaluate(
    (layer, value) =>
      window.__godsEyeView.dataManager.setEnabled(layer, value, {
        origin: 'user',
      }),
    id,
    on,
  );

/** P5-11: una PAUSA hecha en vivo reanuda en vivo, nunca a un ritmo viejo. */
export async function checkResumeAfterLivePause({ page, result, check }) {
  await setLayer(page, 'earthquakes', true);
  await settle(page);
  for (let i = 0; i < 3; i += 1) await timeCmd(page, 'advance');
  const fast = await clockState(page);
  await timeCmd(page, 'now');
  await settle(page, 1_000);
  await timeCmd(page, 'pause');
  await settle(page, 300);
  await timeCmd(page, 'pause');
  await settle(page, 1_000);
  const clock = await clockState(page);
  const layers = await page.evaluate(layersProbe);
  const strip = await page.evaluate(stripProbe);
  result.snapshots.resumeAfterLivePause = { fast, clock, layers, strip };
  check(
    'resume-after-live-pause',
    fast.multiplier === 3600 &&
      clock.mode === 'live' &&
      clock.multiplier !== 3600 &&
      Math.abs(clock.driftMs) <= LIVE_TOLERANCE_MS &&
      layers.enabled.includes('earthquakes') &&
      layers.suspended.length === 0 &&
      strip.tone === 'live',
    `×${fast.multiplier} → AHORA → PAUSA → REANUDAR: ${clock.mode} ×${clock.multiplier}, deriva ${Math.round(clock.driftMs)} ms; «${strip.text}»; encendidas [${layers.enabled}]; suspendidas [${layers.suspended}]`,
    ['P5-11'],
  );
  await setLayer(page, 'earthquakes', false);
}

/** P5-11/P5-12: la foto de retorno tomada simulando cuenta las suspendidas. */
export async function checkSimAimNowReturn({ page, result, check }) {
  await setLayer(page, 'earthquakes', true);
  await settle(page);
  const before = await page.evaluate(layersProbe);
  await timeCmd(page, 'advance');
  await settle(page);
  await moonAction(page, 'aim-moon');
  await sleep(FLIGHT_MS);
  await timeCmd(page, 'now');
  await settle(page, 1_200);
  await moonAction(page, 'return-to-earth');
  await sleep(FLIGHT_MS + 600);
  await settle(page);
  const after = await page.evaluate(layersProbe);
  const pending = await page.evaluate(() =>
    window.__eyeinsky.earthMoon.returnPending(),
  );
  result.snapshots.simAimNowReturn = { before, after, pending };
  check(
    'sim-aim-now-return-keeps-live',
    JSON.stringify(after.enabled) === JSON.stringify(before.enabled) &&
      after.enabled.includes('earthquakes') &&
      after.suspended.length === 0 &&
      !pending,
    `antes [${before.enabled}] → después [${after.enabled}]; retorno pendiente ${pending}`,
    ['P5-11', 'P5-12'],
  );
  await setLayer(page, 'earthquakes', false);
}

const moonButton = (id) => `[data-eye-moon-action="${id}"]`;

/** P5-17: Enter en cada acción deja el foco dentro del dock, visible. */
export async function checkKeyboardFocus({ page, result, check }) {
  await page.evaluate(() => window.__godsEyeView.sceneClock.setNow());
  await settle(page);
  const steps = [
    ['aim-moon', moonButton('aim-moon'), FLIGHT_MS],
    ['moon-scale', moonButton('moon-scale'), 400],
    ['moon-scale-back', moonButton('moon-scale'), 400],
    ['return-to-earth', moonButton('return-to-earth'), FLIGHT_MS + 600],
    ['advance', '[data-eye-time-cmd="advance"]', 400],
    ['now', '[data-eye-time-cmd="now"]', 600],
  ];
  const focus = [];
  for (const [id, selector, wait] of steps)
    focus.push({ id, ...(await keyboardActivate(page, selector, wait)) });
  result.snapshots.keyboardFocus = focus;
  check(
    'keyboard-focus-stays-in-dock',
    focus.every((step) => step.inside),
    focus
      .map((step) => `${step.id} → ${step.tag} «${step.label ?? ''}»`)
      .join('; '),
    ['P5-17'],
  );
}

/** 390×844: con el dock desplegado, APUNTAR y VOLVER por teclado (P5-17). */
export async function mobileKeyboardProbe(page) {
  await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    if (dock.dataset.expanded !== 'true')
      dock.querySelector('[data-eye-dock-action="more"]')?.click();
  });
  await settle(page, 600);
  const aim = await keyboardActivate(page, moonButton('aim-moon'), FLIGHT_MS);
  await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    if (dock.dataset.expanded !== 'true')
      dock.querySelector('[data-eye-dock-action="more"]')?.click();
  });
  await settle(page, 600);
  const back = await keyboardActivate(
    page,
    moonButton('return-to-earth'),
    FLIGHT_MS + 600,
  );
  return [
    { id: 'aim-moon', ...aim },
    { id: 'return-to-earth', ...back },
  ];
}
