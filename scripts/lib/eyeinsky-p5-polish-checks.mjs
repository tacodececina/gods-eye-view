/**
 * Chequeos del pulido de aceptación P5 (mediums de la revisión UX):
 *
 * - `shortcuts` (§7): L apunta, Shift+L encuadra el sistema, P pausa y
 *   reanuda, N vuelve a AHORA, Esc cierra FECHA con el foco en FECHA;
 *   escribiendo en el campo, N no toca el reloj; Espacio no pausa (es la voz).
 * - `pause-suspension-notice` (P5-11): una PAUSA hecha en vivo que supera la
 *   tolerancia (bajada a 2 s solo en el arnés) se anuncia (aria-live polite y
 *   línea visible) y AHORA, desde esa línea, devuelve las capas en vivo.
 * - `system-earth-label` (§6): en SISTEMA TIERRA–LUNA la Tierra (< 40 px)
 *   lleva el rótulo «TIERRA» sobre su centro; callouts de detección y sismos
 *   se apartan y vuelven al VOLVER A TIERRA.
 * - `mobile-sim-readout-fits` (P5-17): en 360 y 390 px, simulando ×3600, la
 *   lectura cabe (scrollWidth ≤ clientWidth), el ritmo se ve entero y AVANCE
 *   dice el ritmo ACTUAL. También con la cabecera forzada a no compacta (el
 *   estado que midió la revisión).
 * - `catalog-space-missions-moon-reason`: con Misiones espaciales activo,
 *   «Agregar» Luna sale deshabilitado con «No disponible en Misiones
 *   espaciales» en la fila y en el nombre accesible.
 */
import { sleep } from './eyeinsky-p4-run.mjs';
import { openApp } from './eyeinsky-p4-page.mjs';
import {
  FLIGHT_MS,
  aimProbe,
  layersProbe,
  moonAction,
  settle,
} from './eyeinsky-p5-dock.mjs';

const TEST_TOLERANCE_MS = 2_000;
const EARTH_LABEL_TOLERANCE_PX = 3;
const APP_ONLY = Object.freeze({ enableSatellites: false, requireNorad: null });

const clockMode = (page) =>
  page.evaluate(() => window.__godsEyeView.sceneClock.getState().mode);

const blurAll = (page) =>
  page.evaluate(() => {
    document.activeElement?.blur?.();
    document.body.focus?.();
  });

/** Cámara de vuelta al globo completo (la Luna lejos del centro). */
const earthView = (page) =>
  page.evaluate(() => {
    const g = window.__godsEyeView;
    g.viewer.camera.frustum.fov = Math.PI / 3;
    g.viewer.camera.setView({
      destination: window.__CESIUM__.Cartesian3.fromDegrees(-100, 20, 2.2e7),
    });
    g.requestRender('p5-polish');
  });

/** Espera un encuadre NUEVO de `kind` tras una tecla. */
async function framedAfter(page, kind) {
  await page
    .waitForFunction(
      (k) => window.__eyeinsky.earthMoon.lastFraming()?.kind === k,
      { timeout: 10_000, polling: 200 },
      kind,
    )
    .catch(() => {});
  await sleep(FLIGHT_MS / 2);
  return page.evaluate(aimProbe);
}

/** Pasos de teclado de §7 sobre la pestaña principal (Luna encendida). */
async function shortcutSteps(page) {
  const steps = {};
  await page.evaluate(() => window.__godsEyeView.sceneClock.setNow());
  await blurAll(page);
  await page.keyboard.press('p');
  steps.pause = await clockMode(page);
  await page.keyboard.press('p');
  steps.resume = await clockMode(page);
  await page.evaluate(() => window.__godsEyeView.sceneClock.simulate(600));
  await page.keyboard.press('n');
  steps.now = await clockMode(page);
  await page.keyboard.press(' ');
  await sleep(100);
  steps.space = await clockMode(page);
  await earthView(page);
  steps.aimBefore = (await page.evaluate(aimProbe)).angleDeg;
  await page.keyboard.press('l');
  const aim = await framedAfter(page, 'aim');
  steps.aimAfter = aim.angleDeg;
  steps.aimFraming = aim.lastFraming;
  steps.aimReticle = aim.reticle;
  await page.keyboard.down('Shift');
  await page.keyboard.press('L');
  await page.keyboard.up('Shift');
  steps.system = (await framedAfter(page, 'system')).lastFraming;
  await moonAction(page, 'return-to-earth');
  await sleep(FLIGHT_MS);
  steps.field = await page.evaluate(async () => {
    const strip = document.querySelector('[data-eye-time-strip]');
    const toggle = strip.querySelector('[data-eye-time-toggle]');
    if (strip.dataset.dateOpen !== 'true') toggle.click();
    const input = strip.querySelector('[data-eye-time-field]');
    input.focus();
    return {
      open: strip.dataset.dateOpen,
      focus: document.activeElement === input,
    };
  });
  await page.keyboard.press('n');
  steps.typingN = await clockMode(page);
  await page.keyboard.press('Escape');
  steps.escape = await page.evaluate(() => {
    const strip = document.querySelector('[data-eye-time-strip]');
    const toggle = strip.querySelector('[data-eye-time-toggle]');
    return {
      open: strip.dataset.dateOpen,
      focusOnToggle: document.activeElement === toggle,
      expanded: toggle.getAttribute('aria-expanded'),
    };
  });
  return steps;
}

/** §7: L, Shift+L, P, N y Esc con teclado real (Puppeteer). */
export async function checkShortcuts({ page, result, check }) {
  const steps = await shortcutSteps(page);
  result.snapshots.shortcuts = steps;
  check(
    'shortcuts',
    steps.pause === 'paused' &&
      steps.resume === 'live' &&
      steps.now === 'live' &&
      steps.space === 'live' &&
      // APUNTAR gira hacia el área libre SOBRE el dock: la Luna no queda en
      // el eje, pero sí en cuadro y con la retícula encima.
      steps.aimBefore > 20 &&
      steps.aimAfter < steps.aimBefore / 2 &&
      steps.aimFraming?.kind === 'aim' &&
      steps.aimFraming?.inFrame === true &&
      steps.aimReticle === 'on' &&
      steps.system?.kind === 'system' &&
      steps.field.focus === true &&
      steps.typingN === 'live' &&
      steps.escape.open === 'false' &&
      steps.escape.focusOnToggle === true &&
      steps.escape.expanded === 'false',
    `P→${steps.pause}, P→${steps.resume}; N (×600)→${steps.now}; Espacio→${steps.space}; L: ${steps.aimBefore?.toFixed(1)}°→${steps.aimAfter?.toFixed(3)}° (en cuadro ${steps.aimFraming?.inFrame}, retícula ${steps.aimReticle}); Shift+L→${steps.system?.kind}; N en el campo→${steps.typingN}; Esc: abierto=${steps.escape.open}, foco en FECHA=${steps.escape.focusOnToggle}`,
    ['P5-17'],
  );
}

/** Lo que dice la tira de la pausa larga (anuncio, línea y botones). */
function noticeProbe() {
  const notice = document.querySelector('[data-eye-time-notice]');
  const announce = document.querySelector('[data-eye-time-announce]');
  return {
    visible: Boolean(
      notice && !notice.hidden && notice.getClientRects().length,
    ),
    text: notice?.textContent ?? '',
    buttons: [...(notice?.querySelectorAll('button') ?? [])].map((b) => [
      b.dataset.eyeTimeCmd,
      b.textContent,
      Math.round(b.getBoundingClientRect().height),
    ]),
    announce: announce?.textContent ?? '',
    ariaLive: announce?.getAttribute('aria-live') ?? null,
  };
}

/** P5-11: pausa en vivo > tolerancia → aviso con REANUDAR/AHORA; AHORA restaura. */
export async function checkPauseSuspensionNotice({ page, result, check }) {
  await page.evaluate(async (ms) => {
    const g = window.__godsEyeView;
    g.sceneClock.setNow();
    await g.dataManager.setEnabled('earthquakes', true, { origin: 'user' });
    window.__eyeinsky.earthMoon.setLiveToleranceMs(ms);
  }, TEST_TOLERANCE_MS);
  await settle(page);
  await page.evaluate(() =>
    document.querySelector('[data-eye-time-cmd="pause"]').click(),
  );
  await sleep(TEST_TOLERANCE_MS + 1_600);
  await settle(page);
  const during = await page.evaluate(noticeProbe);
  const layersDuring = await page.evaluate(layersProbe);
  await page.evaluate(() =>
    document
      .querySelector('[data-eye-time-notice] [data-eye-time-cmd="now"]')
      .click(),
  );
  await settle(page, 1_000);
  const after = await page.evaluate(noticeProbe);
  const layersAfter = await page.evaluate(layersProbe);
  const mode = await clockMode(page);
  await page.evaluate(() => window.__eyeinsky.earthMoon.setLiveToleranceMs(0));
  result.snapshots.pauseSuspension = {
    during,
    layersDuring,
    after,
    layersAfter,
    mode,
  };
  const text = `Capas en vivo suspendidas: la pausa supera ${TEST_TOLERANCE_MS / 1000} s`;
  check(
    'pause-suspension-notice',
    during.visible &&
      during.text.includes(text) &&
      during.announce.includes(text) &&
      during.ariaLive === 'polite' &&
      JSON.stringify(during.buttons.map((b) => b.slice(0, 2))) ===
        JSON.stringify([
          ['pause', 'REANUDAR'],
          ['now', 'AHORA'],
        ]) &&
      during.buttons.every((b) => b[2] >= 44) &&
      layersDuring.suspended.includes('earthquakes') &&
      mode === 'live' &&
      !after.visible &&
      layersAfter.enabled.includes('earthquakes') &&
      layersAfter.suspended.length === 0,
    `umbral de arnés ${TEST_TOLERANCE_MS} ms; línea «${during.text}» (${during.visible ? 'visible' : 'oculta'}); aria-live=${during.ariaLive} «${during.announce}»; suspendidas [${layersDuring.suspended}]; AHORA → ${mode}, encendidas [${layersAfter.enabled}], suspendidas [${layersAfter.suspended}]`,
    ['P5-11'],
  );
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('earthquakes', false, {
      origin: 'user',
    }),
  );
}

/** Rótulo TIERRA, diámetro de la Tierra y estado del despeje. */
function earthLabelProbe() {
  const C = window.__CESIUM__;
  const g = window.__godsEyeView;
  const camera = g.viewer.camera;
  const canvas = g.viewer.scene.canvas;
  const d = C.Cartesian3.magnitude(camera.positionWC);
  const diameterPx =
    ((2 * Math.asin(6_371_000 / d)) / camera.frustum.fovy) *
    canvas.clientHeight;
  const label = document.querySelector('[data-eye-earth-label]');
  const box = label?.getBoundingClientRect();
  const moonReticle = document.querySelector(
    '[data-eye-moon-reticle] .eye-moon-reticle-legend',
  );
  const style = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return `${s.color}|${s.fontFamily}|${s.fontSize}`;
  };
  return {
    diameterPx,
    visible: Boolean(label && !label.hidden),
    text: label?.textContent ?? '',
    x: box ? box.left : null,
    y: box ? box.top : null,
    sameStyle:
      style(label?.querySelector('.eye-moon-reticle-legend')) ===
      style(moonReticle),
    declutter: window.__eyeinsky.systemDeclutter(),
  };
}

/** §6: SISTEMA rotula la Tierra diminuta y aparta callouts y sismos; VOLVER los devuelve. */
export async function checkSystemEarthLabel({ page, result, check, shot }) {
  await page.evaluate(async () => {
    const g = window.__godsEyeView;
    g.sceneClock.setNow();
    await g.dataManager.setEnabled('earthquakes', true, { origin: 'user' });
  });
  await settle(page, 1_500);
  const before = await page.evaluate(earthLabelProbe);
  await moonAction(page, 'earth-moon-system');
  const system = await framedAfter(page, 'system');
  await sleep(600);
  const during = await page.evaluate(earthLabelProbe);
  await shot('p5-polish-system-earth-label.png');
  await moonAction(page, 'return-to-earth');
  await sleep(FLIGHT_MS);
  await settle(page, 1_000);
  const after = await page.evaluate(earthLabelProbe);
  result.snapshots.systemEarthLabel = { before, system, during, after };
  const dx = Math.abs(during.x - system.earthPx?.x);
  const dy = Math.abs(during.y - system.earthPx?.y);
  check(
    'system-earth-label',
    during.diameterPx < 40 &&
      during.visible &&
      during.text === 'TIERRA' &&
      dx <= EARTH_LABEL_TOLERANCE_PX &&
      dy <= EARTH_LABEL_TOLERANCE_PX &&
      during.sameStyle &&
      during.declutter.active === true &&
      during.declutter.detectionSuspended === true &&
      during.declutter.suppressedSources.includes('earthquakes') &&
      during.declutter.paintedEarthquakes === 0 &&
      after.declutter.active === false &&
      after.declutter.detectionSuspended ===
        before.declutter.detectionSuspended &&
      after.declutter.suppressedSources.length === 0 &&
      !after.visible,
    `Tierra ${during.diameterPx.toFixed(1)} px; rótulo «${during.text}» ${during.visible ? 'visible' : 'oculto'} a (${dx.toFixed(1)}, ${dy.toFixed(1)}) px de su centro; estilo de la retícula ${during.sameStyle}; despeje ${JSON.stringify(during.declutter)} → al volver ${JSON.stringify(after.declutter)}; rótulo al volver ${after.visible ? 'visible' : 'oculto'}`,
    ['P5-17'],
  );
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('earthquakes', false, {
      origin: 'user',
    }),
  );
}

/** Mide cada pieza visible de la tira: ¿cabe? */
function readoutFitProbe() {
  const strip = document.querySelector('[data-eye-time-strip]');
  const visible = (el) =>
    el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
  const parts = [
    ...strip.querySelectorAll(
      '.eye-time-readout, .eye-time-detail, .eye-time-piece, .eye-time-chip, .eye-time-button',
    ),
  ]
    .filter(visible)
    .map((el) => ({
      cls: el.className,
      text: el.textContent,
      sw: el.scrollWidth,
      cw: el.clientWidth,
    }));
  const readout = strip.querySelector('.eye-time-readout');
  const rate = [...strip.querySelectorAll('.eye-time-piece')].find((p) =>
    p.textContent.startsWith('×'),
  );
  const box = (el) => el?.getBoundingClientRect();
  const rateInside =
    rate && visible(readout)
      ? box(rate).right <= box(readout).right + 0.5 &&
        box(rate).right <= window.innerWidth
      : null;
  const advance = strip.querySelector(
    '.eye-time-controls [data-eye-time-cmd="advance"]',
  );
  return {
    parts,
    fits: parts.every((p) => p.sw <= p.cw),
    rateInside,
    chip: strip.querySelector('.eye-time-chip')?.textContent ?? '',
    advance: advance?.innerText?.trim() ?? '',
    advanceAria: advance?.getAttribute('aria-label') ?? '',
  };
}

/** Una anchura móvil: natural (chip + hoja) y cabecera forzada a no compacta. */
async function readoutAt(browser, baseUrl, width, height) {
  const tab = { pageErrors: [], consoleErrors: [] };
  const page = await openApp(
    browser,
    tab,
    baseUrl,
    { width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    APP_ONLY,
  );
  try {
    await page.evaluate(() => window.__godsEyeView.sceneClock.simulate(3600));
    await sleep(800);
    await page.evaluate(() =>
      document.querySelector('[data-eye-time-chip]')?.click(),
    );
    await sleep(500);
    const natural = await page.evaluate(readoutFitProbe);
    await page.evaluate(() => {
      const header = document
        .querySelector('[data-eye-time-strip]')
        .closest('.eye-dock-header');
      header.dataset.compact = 'false';
      header.dataset.short = 'false';
    });
    await sleep(300);
    const forced = await page.evaluate(readoutFitProbe);
    return { width, natural, forced, tab };
  } finally {
    await page.close();
  }
}

/** P5-17: en 360 y 390 px la lectura SIMULACIÓN ×3600 cabe y AVANCE dice ×3600. */
export async function checkMobileReadout({ browser, baseUrl, result, check }) {
  const runs = [];
  for (const [w, h] of [
    [360, 740],
    [390, 844],
  ])
    runs.push(await readoutAt(browser, baseUrl, w, h));
  result.snapshots.mobileReadout = runs;
  const ok = runs.every(
    (r) =>
      r.natural.fits &&
      r.forced.fits &&
      r.forced.rateInside === true &&
      /×3600/.test(r.natural.chip) &&
      /×3600/.test(r.natural.advance) &&
      /ritmo actual ×3600/.test(r.natural.advanceAria),
  );
  check(
    'mobile-sim-readout-fits',
    ok,
    runs
      .map(
        (r) =>
          `${r.width}px: natural cabe=${r.natural.fits} (chip «${r.natural.chip}», AVANCE «${r.natural.advance}»); no compacta cabe=${r.forced.fits}, ×3600 dentro=${r.forced.rateInside}; peor ${JSON.stringify(
            [...r.natural.parts, ...r.forced.parts].reduce(
              (worst, p) =>
                p.sw - p.cw > worst.over
                  ? { over: p.sw - p.cw, cls: p.cls }
                  : worst,
              { over: 0, cls: null },
            ),
          )}`,
      )
      .join('; '),
    ['P5-17'],
  );
}

/** Fila Luna del catálogo con el modo de contexto que haya. */
function catalogMoonProbe() {
  const g = window.__godsEyeView;
  const row = document.querySelector('[data-eye-catalog-id="moon"]');
  const button = row?.querySelector('[data-eye-catalog-toggle]');
  return {
    contextMode: g.styleManager._contextMode ?? null,
    button: button?.textContent ?? null,
    disabled: button?.disabled ?? null,
    aria: button?.getAttribute('aria-label') ?? null,
    reason: row?.querySelector('.eye-catalog-reason')?.textContent ?? null,
  };
}

/** Misiones espaciales activo: «Agregar» Luna dice por qué no. */
export async function checkCatalogSpaceMissions({
  browser,
  baseUrl,
  result,
  check,
}) {
  const tab = { pageErrors: [], consoleErrors: [] };
  const page = await openApp(
    browser,
    tab,
    baseUrl,
    { width: 1280, height: 800 },
    APP_ONLY,
  );
  try {
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.setEnabled('rocket-launches', true, {
        origin: 'user',
      }),
    );
    await page
      .waitForFunction(
        () =>
          window.__godsEyeView.styleManager._contextMode === 'space-missions',
        { timeout: 30_000, polling: 250 },
      )
      .catch(() => {});
    await page.evaluate(() => window.__eyeinsky.openView('catalog'));
    await sleep(800);
    const probe = await page.evaluate(catalogMoonProbe);
    result.snapshots.catalogSpaceMissions = { ...probe, tab };
    if (probe.contextMode !== 'space-missions') {
      result.notMeasured.push({
        id: 'catalog-space-missions-moon-reason',
        reason: 'Misiones espaciales no quedó activo en esta pestaña',
        probe,
      });
      return;
    }
    check(
      'catalog-space-missions-moon-reason',
      probe.button === 'No disponible' &&
        probe.disabled === true &&
        probe.reason === 'No disponible en Misiones espaciales' &&
        /No disponible en Misiones espaciales/.test(probe.aria ?? ''),
      `modo ${probe.contextMode}; botón «${probe.button}» (deshabilitado ${probe.disabled}); fila «${probe.reason}»; aria «${probe.aria}»`,
      ['P5-17'],
    );
  } finally {
    await page.close();
  }
}

/** Orden de los chequeos de pulido (tras los T8 y de reparación). */
export async function runPolishChecks(context) {
  await checkShortcuts(context);
  await checkPauseSuspensionNotice(context);
  await checkSystemEarthLabel(context);
  await checkMobileReadout(context);
  await checkCatalogSpaceMissions(context);
}
