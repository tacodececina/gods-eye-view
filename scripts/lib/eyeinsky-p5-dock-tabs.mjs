/**
 * Chequeos T8 del arnés P5 que abren su propia pestaña (móvil 390×844 y
 * P5-09 con el respaldo bloqueado) y el campo de fecha UTC. Los errores de
 * cada pestaña van a su propio registro en `snapshots`.
 */
import { sleep } from './eyeinsky-p4-run.mjs';
import { openApp } from './eyeinsky-p4-page.mjs';
import {
  ACTIVE_DISABLE_TARGETS,
  FLIGHT_MS,
  MIN_TARGET_PX,
  MIN_TEXT_PX,
  MIN_TEXT_PX_PHONE,
  aimProbe,
  moonAction,
  readHeaderTargets,
  settle,
  stripProbe,
} from './eyeinsky-p5-dock.mjs';
import { mobileKeyboardProbe } from './eyeinsky-p5-repair-checks.mjs';

const MOBILE = Object.freeze({
  width: 390,
  height: 844,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const APP_ONLY = Object.freeze({ enableSatellites: false, requireNorad: null });

/**
 * Todo alcanzable, ≥ 44 px, texto ≥ `minText` (13 px escritorio, 14 px
 * teléfono: el mismo umbral que P3-11) y sin scroll horizontal.
 */
export const targetsOk = (m, minText = MIN_TEXT_PX) =>
  !m.horizontalScroll &&
  m.targets.length > 0 &&
  m.minText >= minText &&
  m.targets.every(
    (t) =>
      t.inside &&
      t.hit &&
      t.width >= MIN_TARGET_PX &&
      t.height >= MIN_TARGET_PX,
  );

/** Pestaña nueva de la app (sin satélites), con su propio registro. */
async function openTab(browser, baseUrl, viewport, options = {}) {
  const tab = { pageErrors: [], consoleErrors: [] };
  const page = await openApp(browser, tab, baseUrl, viewport, {
    ...APP_ONLY,
    ...options,
  });
  return { page, tab };
}

/** Lo que dice el teléfono tras desplegar el dock y encuadrar el sistema. */
async function mobileProbe(page) {
  await page.evaluate(async () => {
    const g = window.__godsEyeView;
    await g.moon.enable();
    await g.dataManager.setEnabled('earthquakes', true, { origin: 'user' });
  });
  await page.waitForFunction(
    () => window.__godsEyeView.moon.getState().status === 'ok',
    { timeout: 60_000 },
  );
  await settle(page, 800);
  // Lista Activas con la Luna encendida: cada «Apagar» se toca en su centro.
  const active = await readHeaderTargets(page, ACTIVE_DISABLE_TARGETS);
  await page.evaluate(() =>
    document
      .getElementById('eye-mission-dock')
      .querySelector('[data-eye-dock-action="more"]')
      ?.click(),
  );
  await settle(page, 800);
  const targets = await readHeaderTargets(page);
  await moonAction(page, 'earth-moon-system');
  // El vuelo termina en un fotograma: en un teléfono emulado puede tardar más.
  await page
    .waitForFunction(
      () => window.__eyeinsky.earthMoon.lastFraming()?.kind === 'system',
      { timeout: 10_000, polling: 200 },
    )
    .catch(() => {});
  await sleep(FLIGHT_MS / 4);
  const sys = await page.evaluate(aimProbe);
  const notice = await page.evaluate(
    () => document.querySelector('[data-eye-moon-notice]')?.textContent ?? '',
  );
  return { targets, active, system: sys.lastFraming, notice };
}

/** Móvil 390×844 (táctil): cabecera ≥ 44 px, texto ≥ 14 px; SISTEMA encuadra o avisa. */
export async function checkMobile({ browser, baseUrl, result, check, shot }) {
  const { page, tab } = await openTab(browser, baseUrl, MOBILE);
  try {
    const { targets, active, system, notice } = await mobileProbe(page);
    result.snapshots.mobile = { targets, active, system, notice, tab };
    const smallest = Math.min(
      ...targets.targets.map((t) => Math.min(t.width, t.height)),
    );
    check(
      'mobile-390x844-targets',
      targetsOk(targets, MIN_TEXT_PX_PHONE) &&
        targets.targets.some((t) => t.label === 'SISTEMA'),
      `${targets.targets.length} objetivos [${targets.targets.map((t) => t.label)}]; mín. ${smallest.toFixed(1)} px; texto mín. ${targets.minText} px; scroll horizontal ${targets.horizontalScroll}`,
      ['P5-17'],
    );
    check(
      'mobile-390x844-active-layer-off',
      targetsOk(active, MIN_TEXT_PX_PHONE) &&
        active.targets.some((t) => /^Apagar Luna/.test(t.label)),
      active.targets
        .map(
          (t) =>
            `${t.label}: ${t.width.toFixed(0)}×${t.height.toFixed(0)} px, dentro ${t.inside}, impacto ${t.hit ? 'sí' : t.hitTag}`,
        )
        .join('; '),
      ['P5-17'],
    );
    check(
      'mobile-system-frames-or-warns',
      system?.inFrame === true || /fuera de cuadro/i.test(notice),
      `${JSON.stringify(system)}; aviso «${notice}»`,
      ['P5-17'],
    );
    await shot('p5-t8-mobile-390x844.png', page);
    const keyboard = await mobileKeyboardProbe(page);
    result.snapshots.mobile.keyboard = keyboard;
    check(
      'mobile-keyboard-focus',
      keyboard.every((step) => step.inside),
      keyboard
        .map(
          (step) =>
            `${step.id} → ${step.tag} «${step.label ?? ''}» (antes: ${JSON.stringify(step.pre)})`,
        )
        .join('; '),
      ['P5-17'],
    );
  } finally {
    await page.close();
  }
}

/** Intercepta y aborta el chunk de astronomy-engine (respaldo). */
function blockFallback(blocked) {
  return async (page) => {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (/astronomy-engine/.test(request.url())) {
        blocked.push(request.url());
        void request.abort();
      } else void request.continue();
    });
  };
}

/** Simula ×60 desde 2045 (fuera de la tabla) y lee reloj, Luna y motivo. */
async function outOfRangeProbe(page) {
  await page.evaluate(async () => {
    const g = window.__godsEyeView;
    await g.moon.enable();
    g.sceneClock.setTime('2045-01-01T00:00:00Z');
  });
  await settle(page, 3_000);
  await page.evaluate(() => window.__godsEyeView.sceneClock.simulate(60));
  await settle(page, 2_000);
  const probe = await page.evaluate(() => ({
    clock: window.__godsEyeView.sceneClock.getState(),
    moon: window.__godsEyeView.moon.getState(),
    reason: document.querySelector('.eye-moon-reason')?.textContent ?? '',
  }));
  return { ...probe, strip: await page.evaluate(stripProbe) };
}

/**
 * P5-09 con el respaldo astronomy-engine BLOQUEADO: simulando fuera de
 * 2021–2040 el reloj pasa a PAUSA «fuera de efemérides», no hay Luna física y
 * el motivo «Fecha fuera de rango» se ve. El ERR_FAILED del bloqueo es
 * esperado y queda en el registro de esa pestaña.
 */
export async function checkOutOfRangePause(context) {
  const { browser, baseUrl, result, check, shot } = context;
  const blocked = [];
  const { page, tab } = await openTab(
    browser,
    baseUrl,
    { width: 1280, height: 800 },
    { beforeGoto: blockFallback(blocked) },
  );
  try {
    const probe = await outOfRangeProbe(page);
    result.snapshots.outOfRange = { ...probe, blocked: blocked.length, tab };
    check(
      'p509-out-of-range-pauses',
      blocked.length > 0 &&
        probe.clock.mode === 'paused' &&
        probe.clock.reason === 'fuera de efemérides' &&
        probe.strip.text === '❚❚ PAUSA · fuera de efemérides' &&
        probe.moon.status === 'out-of-range' &&
        probe.moon.positionFixedM === null &&
        probe.reason === 'No disponible: Fecha fuera de rango',
      `respaldo bloqueado ${blocked.length}×; reloj ${probe.clock.mode} «${probe.clock.reason}»; «${probe.strip.text}»; Luna ${probe.moon.status}; «${probe.reason}»`,
      ['P5-09'],
    );
    await shot('p5-t8-out-of-range.png', page);
  } finally {
    await page.close();
  }
}

/** Envía el formulario de fecha con `value` y lee la tira y el reloj. */
async function submitDate(page, value) {
  const opened = await page.evaluate((v) => {
    const strip = document.querySelector('[data-eye-time-strip]');
    if (strip.dataset.dateOpen !== 'true')
      strip.querySelector('[data-eye-time-toggle]').click();
    const input = document.querySelector('[data-eye-time-field]');
    const visible = input.getClientRects().length > 0;
    input.value = v;
    input.form.requestSubmit();
    return visible;
  }, value);
  await settle(page, 500);
  return {
    opened,
    strip: await page.evaluate(stripProbe),
    clock: await page.evaluate(() =>
      window.__godsEyeView.sceneClock.getState(),
    ),
  };
}

/** Campo de fecha UTC (tras FECHA): vacío/inválido se rechaza con motivo; válido → PAUSA en esa época. */
export async function checkDateField({ page, result, check }) {
  const rejected = await submitDate(page, '');
  const accepted = await submitDate(page, '2027-03-14T06:00');
  result.snapshots.dateField = { rejected, accepted };
  check(
    'date-field-seek',
    rejected.opened &&
      rejected.strip.error === 'Fecha inválida: usa AAAA-MM-DD hh:mm (UTC)' &&
      rejected.clock.mode === 'live' &&
      accepted.strip.error === '' &&
      accepted.clock.mode === 'paused' &&
      accepted.clock.currentIso === '2027-03-14T06:00:00.000Z' &&
      accepted.strip.text === '❚❚ PAUSA · 2027-03-14 06:00:00 UTC',
    `vacío → «${rejected.strip.error}» (${rejected.clock.mode}); 2027-03-14T06:00 → «${accepted.strip.text}» (${accepted.clock.mode} ${accepted.clock.currentIso})`,
    ['P5-04'],
  );
  await page.evaluate(() => window.__godsEyeView.sceneClock.setNow());
}
