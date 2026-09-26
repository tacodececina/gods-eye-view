/**
 * Arnés visual Editorial · revelación y reparaciones de T5.
 *
 * vis-01 (V-01) en reposo solo barra, titular y tira; vis-02b/02c (V-02) la
 * primera interacción revela cámara, telemetría y capas con --ei-t-reveal
 * (0 ms con movimiento reducido); vis-07b el pie no se solapa en Simulación
 * ×3600 con la nota de satélites a la vista; vis-27 cerrar el panel suelta el
 * objetivo; vis-28 los valores del panel Luna se leen enteros; vis-29 el foco
 * en Compartir se ve (dentro del viewport y sin máscara) tras 2 s.
 * Cada sonda se pasa a `page.evaluate` y es autocontenida.
 */
import path from 'node:path';
import { sleep } from './eyeinsky-p4-run.mjs';

/** Regiones que V-01 permite en reposo (barra, titular y tira). */
export const REST_ALLOWED = Object.freeze([
  'brand',
  'nav',
  'utility',
  'search',
  'story',
  'time',
  // Obligación de licencia (Cesium ion, Esri, VIIRS): no es interfaz y no se
  // puede retirar; vis-07 comprueba aparte que quepa en pantalla.
  'credits',
]);
/** Lo que la primera interacción debe revelar (V-02). */
export const EXPLORE_REVEALED = Object.freeze([
  'instruments',
  'telemetry',
  'layers',
]);
const REVEAL_MAX_S = 0.6;
const REDUCED_MAX_S = 0.01;
const SHARE_FOCUS_TABS = 80;
const SHARE_SETTLE_MS = 2000;

/** Regiones de la interfaz que mide la revelación, por selector. */
const REGIONS = Object.freeze({
  brand: '.eye-orbit-brand',
  nav: '.eye-function-dock',
  utility: '.eye-utility-cluster',
  search: '.eye-search',
  story: '.eye-story',
  time: '[data-eye-time-host]',
  credits: '#cesium-credits',
  keySetup: '#key-setup-chip',
  layers: '#eye-active-layers',
  instruments: '.eye-instruments',
  telemetry: '.eye-telemetry',
  dock: '#eye-mission-dock',
  workspace: '#eye-workspace',
  hud: '.eye-hud-details',
  notice: '#eye-notice',
  cleanExit: '#eye-clean-exit',
});

/** Visibilidad efectiva (display, visibility, opacidad acumulada, en pantalla). */
function regionStates(regions) {
  const opacityChain = (element) => {
    let value = 1;
    for (let n = element; n && n.nodeType === 1; n = n.parentElement)
      value *= Number(getComputedStyle(n).opacity || 1);
    return value;
  };
  const stateOf = (element) => {
    if (!element?.isConnected) return { present: false, visible: false };
    const s = getComputedStyle(element);
    const r = element.getBoundingClientRect();
    const onScreen =
      r.width >= 2 &&
      r.height >= 2 &&
      r.right > 0 &&
      r.bottom > 0 &&
      r.left < innerWidth &&
      r.top < innerHeight;
    const opacity = opacityChain(element);
    return {
      present: true,
      visible:
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        onScreen &&
        opacity > 0.05,
      opacity: Number(opacity.toFixed(3)),
      visibility: s.visibility,
      hiddenAttr: element.hidden,
      transitionProperty: s.transitionProperty,
      transitionDuration: s.transitionDuration,
      rect: [r.left, r.top, r.width, r.height].map(Math.round),
    };
  };
  return Object.fromEntries(
    Object.entries(regions).map(([name, selector]) => [
      name,
      stateOf(document.querySelector(selector)),
    ]),
  );
}

/** Lecturas de cámara VISIBLES (V-04): altura, rumbo y mapa. */
function visibleReadings() {
  const shown = (el) => {
    if (!el.getClientRects().length) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.visibility === 'hidden' || Number(s.opacity) <= 0.05) return false;
    }
    return true;
  };
  const count = (re) =>
    [...document.querySelectorAll('dt, span, strong, b')].filter(
      (el) => shown(el) && re.test(el.textContent.trim()),
    ).length;
  return {
    reveal: document.body.dataset.eyeReveal ?? null,
    readings: {
      altitude: count(/^altura\b/i),
      heading: count(/^rumbo\b/i),
      map: count(/^mapa( activo)?$/i),
    },
  };
}

/** Estado de revelación, regiones y lecturas visibles en la página. */
export async function readRevealRegions(page) {
  const regions = await page.evaluate(regionStates, REGIONS);
  const { reveal, readings } = await page.evaluate(visibleReadings);
  return { reveal, regions, readings };
}

/** Regiones visibles en reposo que V-01 no permite. */
export function restRegionViolations(regions) {
  return Object.entries(regions)
    .filter(([name, state]) => state.visible && !REST_ALLOWED.includes(name))
    .map(([name]) => name);
}

/** Duración (s) de la transición de opacidad de una región. */
function opacitySeconds(state) {
  const props = (state.transitionProperty ?? '')
    .split(',')
    .map((p) => p.trim());
  const durations = (state.transitionDuration ?? '')
    .split(',')
    .map((d) => Number.parseFloat(d));
  const index = props.findIndex((p) => p === 'opacity' || p === 'all');
  if (index < 0) return 0;
  return durations[index % durations.length] ?? 0;
}

/**
 * V-02: tras la primera interacción cámara, telemetría y capas (vacías: su
 * cabecera «+ Agregar») a la vista; su fundido dura --ei-t-reveal (≤ 600 ms,
 * > 0) o 0 con movimiento reducido.
 */
export function exploreRevealed(
  state,
  { reduced = false, mobile = false } = {},
) {
  const regions = EXPLORE_REVEALED.map((name) => ({
    name,
    visible: state.regions[name]?.visible === true,
    opacity: state.regions[name]?.opacity ?? 0,
    seconds: opacitySeconds(state.regions[name] ?? {}),
  }));
  const timed = regions.every(({ seconds }) =>
    reduced ? seconds <= REDUCED_MAX_S : seconds > 0 && seconds <= REVEAL_MAX_S,
  );
  const readingsOk =
    Object.values(state.readings).every((n) => n <= 1) &&
    (mobile || state.readings.altitude === 1);
  return {
    ok:
      state.reveal === 'explore' &&
      regions.every((r) => r.visible && r.opacity >= 0.99) &&
      timed &&
      readingsOk,
    regions,
    timed,
    readingsOk,
  };
}

/** Rectángulos del pie y de la nota del reloj en un solo frame. */
function readFoot() {
  const rect = (el) => {
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const host = document.querySelector('[data-eye-time-host]');
  // Texto que se ve recortado; el de lectores de pantalla (1×1 px recortado a
  // propósito, .eye-visually-hidden) no cuenta.
  const seen = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const clipped = [...(host?.querySelectorAll('*') ?? [])]
    .filter(
      (el) =>
        seen(el) &&
        el.children.length === 0 &&
        el.textContent.trim() &&
        el.scrollWidth > el.clientWidth + 1 &&
        getComputedStyle(el).overflowX !== 'visible',
    )
    .map((el) => el.textContent.trim().slice(0, 60));
  return {
    time: rect(host),
    telemetry: rect(document.querySelector('.eye-telemetry')),
    dock: rect(document.getElementById('eye-mission-dock')),
    notes: [...(host?.querySelectorAll('.eye-time-notes li') ?? [])]
      .filter((li) => li.getClientRects().length)
      .map((li) => li.textContent.trim()),
    strip: host?.innerText.replace(/\s+/g, ' ').trim() ?? '',
    clipped,
    viewport: { width: innerWidth, height: innerHeight },
  };
}

/** Ancho solapado (px) de dos rectángulos que también se cruzan en alto. */
function overlapPx(a, b) {
  if (!a || !b) return 0;
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 1 && height > 1 ? Math.round(width) : 0;
}

/**
 * 07b · Simulación ×3600 con satélites (la nota SGP4 a la vista): la tira
 * TIEMPO no se solapa con la telemetría ni se sale del viewport, y ningún
 * texto suyo queda recortado.
 */
export async function checkSimulationFoot({ page, check, out, result }) {
  // Tras una interacción real, lejos del centro: la telemetría se ve como la
  // ve la persona (V-02).
  const { width, height } = page.viewport();
  await page.mouse.move(width * 0.3, height * 0.4);
  await page.mouse.wheel({ deltaY: 1 });
  await page.evaluate(() => window.__godsEyeView.sceneClock.simulate(3600));
  await sleep(1500);
  const foot = await page.evaluate(readFoot);
  await page.screenshot({ path: path.join(out, 'sim-x3600-1600x900.png') });
  result.screenshots.push('sim-x3600-1600x900.png');
  await page.evaluate(() => window.__godsEyeView.sceneClock.setNow());
  await sleep(800);
  const overlap = overlapPx(foot.time, foot.telemetry);
  check(
    'vis-07b-sim-foot-no-overlap-1600x900',
    /×3600/.test(foot.strip) &&
      foot.notes.some((note) => /SGP4/.test(note)) &&
      overlap === 0 &&
      foot.time.right <= foot.viewport.width &&
      foot.time.left >= 0 &&
      foot.clipped.length === 0,
    { overlapPx: overlap, ...foot },
  );
}

/** Valores del panel que no caben (recortados o desbordados). */
export function readDockValues() {
  const dock = document.getElementById('eye-mission-dock');
  const cells = [...(dock?.querySelectorAll('.eye-dock-keyvalue') ?? [])]
    .filter((cell) => cell.getClientRects().length)
    .map((cell) => {
      const dt = cell.querySelector('dt');
      const dd = cell.querySelector('dd');
      const box = cell.getBoundingClientRect();
      const fits = (el) =>
        !el ||
        (el.scrollWidth <= el.clientWidth + 1 &&
          el.getBoundingClientRect().right <= box.right + 1);
      return {
        label: dt?.textContent.trim() ?? '',
        value: dd?.textContent.trim() ?? '',
        dtFits: fits(dt),
        ddFits: fits(dd),
      };
    });
  return {
    visible: Boolean(dock && !dock.hidden && dock.dataset.visible === 'true'),
    target: document.body.dataset.eyeTarget ?? null,
    kicker: dock?.querySelector('.eye-dock-kicker')?.textContent ?? '',
    cells,
  };
}

/** 28 · Luna fijada: todos los valores del panel se leen enteros. */
export async function checkMoonValues({ page, check, out, result, suffix }) {
  // Capa Luna encendida y efeméride publicada (como runMoonChecks de p5).
  // Por la ruta de la persona (catálogo → dataManager), que re-pinta las
  // acciones de la Luna; `moon.enable()` las dejaba deshabilitadas.
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('moon', true, {
      origin: 'user',
    }),
  );
  await page
    .waitForFunction(
      () => {
        window.__godsEyeView.requestRender?.('visual-harness');
        return window.__godsEyeView.moon?.getState?.().status === 'ok';
      },
      { timeout: 30_000, polling: 250 },
    )
    .catch(() => {});
  await sleep(1500);
  await page.evaluate(() =>
    document.querySelector('[data-eye-moon-action="aim-moon"]')?.click(),
  );
  await page
    .waitForFunction(
      () =>
        document.getElementById('eye-mission-dock')?.dataset.visible === 'true',
      { timeout: 8000 },
    )
    .catch(() => {});
  await sleep(3500);
  const panel = await page.evaluate(readDockValues);
  await page.screenshot({ path: path.join(out, `moon-panel-${suffix}.png`) });
  result.screenshots.push(`moon-panel-${suffix}.png`);
  check(
    `vis-28-moon-values-readable-${suffix}`,
    panel.visible &&
      panel.target === '1' &&
      /LUNA/i.test(panel.kicker) &&
      panel.cells.length >= 3 &&
      panel.cells.every((c) => c.ddFits && c.dtFits),
    panel,
  );
}

/** Objetivo, panel y revelación tras cerrar con ×. */
function readAfterClose() {
  const dock = document.getElementById('eye-mission-dock');
  const viewer = window.__godsEyeView.viewer;
  return {
    trackedEntity: Boolean(viewer.trackedEntity),
    dockVisible: Boolean(
      dock && !dock.hidden && dock.dataset.visible === 'true',
    ),
    target: document.body.dataset.eyeTarget ?? null,
    reveal: document.body.dataset.eyeReveal ?? null,
    heightKm: Math.round(viewer.camera.positionCartographic.height / 1000),
  };
}

/**
 * 27 · Cerrar el panel (×) suelta el objetivo: sin entidad enganchada, panel
 * oculto y sin objetivo publicado; la cámara no queda pegada al objetivo.
 */
export async function checkCloseReleases({ page, check, out, result, suffix }) {
  await page.click('#eye-mission-dock-close');
  await sleep(2500);
  const after = await page.evaluate(readAfterClose);
  await page.screenshot({ path: path.join(out, `after-close-${suffix}.png`) });
  result.screenshots.push(`after-close-${suffix}.png`);
  check(
    `vis-27-close-releases-target-${suffix}`,
    !after.trackedEntity &&
      !after.dockVisible &&
      after.target === '0' &&
      after.reveal !== 'target',
    after,
  );
  return after;
}

/** El foco y lo que lo tapa: fuera del viewport, bajo una máscara o sin hit. */
function readFocusVisibility() {
  const el = document.activeElement;
  if (!el || el === document.body) return { id: null };
  const r = el.getBoundingClientRect();
  const viewport = window.visualViewport ?? {
    width: innerWidth,
    height: innerHeight,
  };
  const masked = [];
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = getComputedStyle(n);
    const mask = s.maskImage || s.webkitMaskImage || 'none';
    if (mask !== 'none') masked.push(n.className || n.tagName);
  }
  const top = document.elementFromPoint(
    r.left + r.width / 2,
    r.top + r.height / 2,
  );
  return {
    id: el.id,
    rect: [r.left, r.top, r.right, r.bottom].map(Math.round),
    inside:
      r.left >= 0 &&
      r.top >= 0 &&
      r.right <= viewport.width &&
      r.bottom <= viewport.height,
    masked,
    hit: Boolean(top && (top === el || el.contains(top))),
    outline: getComputedStyle(el).outlineStyle,
  };
}

/**
 * 29 · Tab hasta #eye-share (Más abierto por la ruta real), 2 s de espera:
 * el control enfocado sigue dentro del viewport, sin máscara y a la vista.
 */
export async function checkShareFocus({ page, check, out, result, suffix }) {
  await page.evaluate(() =>
    document
      .querySelector('.eye-function-dock [data-eye-view="more"]')
      ?.click(),
  );
  await sleep(700);
  let reached = false;
  for (let i = 0; i < SHARE_FOCUS_TABS && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(
      () => document.activeElement?.id === 'eye-share',
    );
  }
  await sleep(SHARE_SETTLE_MS);
  const focus = await page.evaluate(readFocusVisibility);
  await page.screenshot({ path: path.join(out, `share-focus-${suffix}.png`) });
  result.screenshots.push(`share-focus-${suffix}.png`);
  const inTelemetry = await page.evaluate(() =>
    Boolean(
      document
        .querySelector('.eye-telemetry')
        ?.contains(document.getElementById('eye-share')),
    ),
  );
  check(
    `vis-29-share-focus-visible-${suffix}`,
    reached &&
      focus.id === 'eye-share' &&
      focus.inside &&
      focus.masked.length === 0 &&
      focus.hit &&
      focus.outline !== 'none' &&
      !inTelemetry,
    { reached, inTelemetry, focus },
  );
}
