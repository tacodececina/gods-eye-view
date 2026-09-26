/**
 * Arnés de navegador de EYEINSKY P3.
 *
 * Mide sobre la aplicación viva el expediente contextual, los medios con
 * permiso, la terminal OPS, el foco y las dos rutas de Vista limpia. Desde
 * P3.1 las tres superficies viven dentro del Mission Dock inferior.
 *
 * Uso: node scripts/eyeinsky-p3.mjs <url> <directorio-de-salida>
 * El directorio de salida es OBLIGATORIO y no puede contener ya un result.json:
 * la evidencia de una corrida no se pisa con la de otra.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://127.0.0.1:4198/';
const out = process.argv[3];
if (!out) throw new Error('directorio de salida requerido (argv[3])');
const resultPath = path.join(out, 'result.json');
try {
  await fs.access(resultPath);
  throw new Error(
    `${resultPath} ya existe: usa un directorio nuevo por corrida para no sobrescribir evidencia`,
  );
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
await fs.mkdir(out, { recursive: true });

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-p3-'));
const result = {
  startedAt: new Date().toISOString(),
  url,
  browserMode: 'perfil temporal nuevo, Chrome headless, GPU nativa',
  checks: [],
  pageErrors: [],
  requestFailures: [],
  screenshots: [],
};
const check = (id, ok, detail, kind = 'LIVE') => {
  result.checks.push({ id, ok: Boolean(ok), kind, detail });
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${id}`);
};

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--enable-webgl'],
  userDataDir: profile,
});

/**
 * @param {import('puppeteer').Page} page Página.
 * @returns {Promise<void>} Espera a que la aplicación esté lista.
 */
async function ready(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () =>
      window.__eyeinsky &&
      window.__godsEyeView?.viewer &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 120_000 },
  );
}

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => result.pageErrors.push(String(error)));
  page.on('requestfailed', (request) => {
    const target = new URL(request.url());
    result.requestFailures.push({
      target: `${target.origin}${target.pathname}`,
      error: request.failure()?.errorText || 'petición fallida',
    });
  });
  await page.setViewport({ width: 1440, height: 900 });
  await ready(page);

  // ─── P3-01 · Sin dock en reposo y sin robar el foco ───
  // Fase visual T3 (§1.1, D1-A de Alex, 2026-09-25): sin objetivo no hay
  // Mission Dock. Antes: «ficha de vista abierta al inicio» (earth:view
  // visible). El nodo existe (contrato de identidad DOM) pero nace oculto; el
  // foco no se mueve (queda en body).
  const initial = await page.evaluate(() => {
    const inspector = document.getElementById('eye-mission-dock');
    const active = document.activeElement;
    return {
      present: Boolean(inspector),
      hidden: Boolean(inspector?.hidden),
      dataVisible: inspector?.dataset.visible ?? null,
      focusInsideDossier: Boolean(inspector && active && inspector.contains(active)),
      activeTag: active?.tagName ?? null,
      inspectingFlag: document.body.dataset.eyeInspecting ?? null,
      reveal: document.body.dataset.eyeReveal ?? null,
    };
  });
  check(
    'p3-01-no-dock-at-rest-without-focus-theft',
    initial.present &&
      initial.hidden &&
      initial.dataVisible === 'false' &&
      initial.reveal === 'rest' &&
      !initial.focusInsideDossier &&
      initial.activeTag === 'BODY' &&
      initial.inspectingFlag !== 'true',
    initial,
  );
  // D1-A: la ficha de la vista sigue existiendo A PETICIÓN, por la ruta real
  // (Instrumentos → Panel de misión, #eye-instrument-dossier). Las
  // comprobaciones P3 que siguen se hacen sobre ella, con los mismos criterios.
  await page.click('.eye-function-dock [data-eye-view="instruments"]');
  await page.click('#eye-instrument-dossier');
  await page.waitForFunction(
    () => document.getElementById('eye-mission-dock')?.dataset.visible === 'true',
    { timeout: 10_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 600));

  // ─── P3-08 · En reposo OPS no inventa trabajo ───
  // Se mide ANTES de encender ninguna capa: con el mapa ya listo y las capas
  // apagadas, no hay trabajo que narrar. Antes decía «22 en curso».
  // P3.1: la cápsula bajo Ayuda es ahora el panel OPS del Mission Dock; lo que
  // se comprueba es lo mismo, sobre la superficie que existe hoy.
  const idleActivity = await page.evaluate(() => {
    const ops = document.getElementById('eye-dock-panel-ops');
    return {
      summary: document.querySelector('.eye-ops-summary')?.textContent ?? null,
      liveState:
        document.querySelector('.eye-ops-live')?.dataset.activityState ?? null,
      items: [...ops.querySelectorAll('.eye-activity-item')].map(
        (item) => item.textContent,
      ),
      empty: Boolean(ops.querySelector('.eye-ops-log .eye-activity-empty')),
    };
  });
  check(
    'p3-08-idle-activity-is-empty',
    idleActivity.items.length === 0 &&
      idleActivity.empty &&
      idleActivity.liveState === 'idle' &&
      !/en curso/.test(idleActivity.summary || ''),
    idleActivity,
  );

  // ─── P3-07 · Dos fotografías con crédito pulsable y sin autoplay ───
  const media = await page.evaluate(() => {
    const figure = document.querySelector('.eye-media');
    const image = document.querySelector('.eye-media-image');
    const credit = document.querySelector('.eye-media-credit');
    const play = document.querySelector('.eye-media-play');
    const position = document.querySelector('.eye-media-position');
    return {
      present: Boolean(figure) && !figure.hidden,
      src: image?.getAttribute('src') ?? null,
      alt: image?.getAttribute('alt') ?? null,
      credit: credit?.textContent ?? null,
      creditHref: credit?.getAttribute('href') ?? null,
      position: position?.textContent ?? null,
      playLabel: play?.textContent ?? null,
      playPressed: play?.getAttribute('aria-pressed') ?? null,
    };
  });
  check(
    'p3-07-curated-media-with-credit',
    media.present &&
      String(media.src).startsWith('/eyeinsky/media/p3/') &&
      Boolean(media.alt) &&
      /NASA/.test(media.credit || '') &&
      /archivo/i.test(media.credit || '') &&
      String(media.creditHref || '').startsWith('https://www.nasa.gov/') &&
      media.position === '1/2' &&
      media.playPressed === 'false',
    media,
  );

  // ─── P3-06 · El carrusel avanza a mano y sólo a mano ───
  const slider = await page.evaluate(() => {
    const before = document.querySelector('.eye-media-image')?.getAttribute('src');
    document.querySelector('[data-eye-media-step="next"]')?.click();
    const after = document.querySelector('.eye-media-image')?.getAttribute('src');
    return {
      before,
      after,
      position: document.querySelector('.eye-media-position')?.textContent ?? null,
      autoplay:
        document.querySelector('.eye-media-play')?.getAttribute('aria-pressed') ?? null,
    };
  });
  check(
    'p3-06-manual-slider-no-autoplay',
    slider.before !== slider.after &&
      slider.position === '2/2' &&
      slider.autoplay === 'false',
    slider,
  );

  // ─── P3-08 · OPS es una pestaña del dock, alcanzable y con objetivo táctil ───
  const opsTab = await page.evaluate(() => {
    const element = document.getElementById('eye-dock-tab-ops');
    const search = document.querySelector('.eye-search');
    if (!element) return { present: false };
    const box = element.getBoundingClientRect();
    const searchBox = search?.getBoundingClientRect() ?? null;
    const overlaps =
      searchBox &&
      box.left < searchBox.right &&
      box.right > searchBox.left &&
      box.top < searchBox.bottom &&
      box.bottom > searchBox.top;
    const top = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return {
      present: true,
      role: element.getAttribute('role'),
      overlapsSearch: Boolean(overlaps),
      height: box.height,
      width: box.width,
      label: element.textContent,
      hit: top === element || element.contains(top),
    };
  });
  check(
    'p3-08-activity-reachable-as-a-dock-tab',
    opsTab.present &&
      opsTab.role === 'tab' &&
      !opsTab.overlapsSearch &&
      opsTab.height >= 44 &&
      opsTab.hit,
    opsTab,
  );

  // ─── P3-08/09 · OPS narra trabajo real y no inventa porcentaje ───
  await page.click('[data-eye-dock-action="more"]');
  await page.click('#eye-dock-tab-ops');
  const detail = await page.evaluate(() => {
    const panel = document.getElementById('eye-dock-panel-ops');
    const bars = [...panel.querySelectorAll('progress')];
    return {
      open: Boolean(panel) && !panel.hidden,
      expanded:
        document
          .querySelector('[data-eye-dock-action="more"]')
          ?.getAttribute('aria-expanded') ?? null,
      selected: document
        .getElementById('eye-dock-tab-ops')
        ?.getAttribute('aria-selected'),
      logRole: document.getElementById('eye-ops-log')?.getAttribute('role'),
      items: [...panel.querySelectorAll('.eye-activity-item')].map((item) => ({
        status: item.dataset.status,
        text: item.textContent,
      })),
      emptyText: panel.querySelector('.eye-activity-empty')?.textContent ?? null,
      // Una barra sin max real sería un porcentaje inventado.
      barsWithoutDenominator: bars.filter((bar) => !(Number(bar.max) > 0))
        .length,
    };
  });
  check(
    'p3-08-activity-detail-no-fake-progress',
    detail.open &&
      detail.expanded === 'true' &&
      detail.selected === 'true' &&
      detail.logRole === 'log' &&
      detail.barsWithoutDenominator === 0,
    detail,
  );

  // ─── P3-10 · Escape repliega y devuelve el foco a quien desplegó ───
  await page.focus('#eye-dock-tab-ops');
  await page.keyboard.press('Escape');
  const afterEscape = await page.evaluate(() => ({
    open: document.getElementById('eye-mission-dock').dataset.expanded === 'true',
    focus: document.activeElement?.id || document.activeElement?.className || '',
    focusInsideDock: document
      .getElementById('eye-mission-dock')
      .contains(document.activeElement),
  }));
  check(
    'p3-10-escape-returns-focus',
    !afterEscape.open && afterEscape.focusInsideDock,
    afterEscape,
  );

  // ─── P3-05 · Lo cerrado sigue cerrado tras un refresh de la misma ficha ───
  await page.click('#eye-mission-dock-close');
  // El cierre es animado: se espera a que termine antes de leer, y sólo después
  // se provoca el refresh que no debe reabrir nada.
  await new Promise((resolve) => setTimeout(resolve, 600));
  const closed = await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('gev:map-stack-changed', { detail: {} }));
    return {
      hidden: document.getElementById('eye-mission-dock').hidden,
      inspecting: document.body.dataset.eyeInspecting ?? null,
    };
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const stillClosed = await page.evaluate(() => ({
    hidden: document.getElementById('eye-mission-dock').hidden,
    focusable: [...document.querySelectorAll('#eye-mission-dock button')].some(
      (button) => button.offsetParent !== null,
    ),
  }));
  check(
    'p3-05-closed-dossier-survives-refresh',
    closed.hidden && stillClosed.hidden && !stillClosed.focusable,
    { closed, stillClosed },
  );

  // ─── P3-13 · El globo sigue recibiendo la rueda fuera de los paneles ───
  const wheel = await page.evaluate(async () => {
    const view = window.__godsEyeView;
    const before = view.viewer.camera.positionCartographic.height;
    const canvas = view.viewer.canvas;
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -240,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        bubbles: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 900));
    return {
      before,
      after: view.viewer.camera.positionCartographic.height,
      elementAtCenter: document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      )?.tagName,
    };
  });
  check(
    'p3-13-globe-keeps-wheel',
    wheel.elementAtCenter === 'CANVAS' && wheel.after !== wheel.before,
    wheel,
  );

  // ─── P3-02 · USGS conserva identidad, datos y selección ───
  await page.click('[data-eye-view="instruments"]');
  await page.click('#eye-connect');
  await page.click('#eye-refresh');
  let usgs = null;
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('#eye-signal-list button').length >= 1,
      { timeout: 45_000 },
    );
    const signalId = await page.$eval(
      '#eye-signal-list button',
      (row) => row.dataset.signalId,
    );
    // La fila existe en cuanto llega el registro analítico; la entidad de la
    // escena puede tardar un poco más. Se espera a que exista antes de clicar,
    // para medir la selección y no la carrera del arnés.
    await page.waitForFunction(
      (id) => {
        const sources = window.__godsEyeView.viewer.dataSources;
        for (let i = 0; i < sources.length; i++) {
          const source = sources.get(i);
          if (source.name !== 'earthquakes') continue;
          if (
            source.entities.values.some(
              (entity) => entity.properties?.usgsId?.getValue() === id,
            )
          )
            return true;
        }
        return false;
      },
      { timeout: 30_000 },
      signalId,
    );
    await page.click(`#eye-signal-list button[data-signal-id="${signalId}"]`);
    await page.waitForFunction(
      (id) =>
        window.__godsEyeView.viewer.selectedEntity?.properties?.usgsId?.getValue?.() ===
        id,
      { timeout: 10_000 },
      signalId,
    );
    await new Promise((resolve) => setTimeout(resolve, 900));
    usgs = await page.evaluate((expected) => {
      const dossier = document.querySelector('.eye-dossier');
      return {
        expected,
        selectedId: window.__eyeinsky.selectedId,
        contextKey: dossier?.dataset.contextKey ?? null,
        kind: dossier?.dataset.contextKind ?? null,
        inspecting: document.body.dataset.eyeInspecting ?? null,
        viewerSelected:
          window.__godsEyeView.viewer.selectedEntity?.properties?.usgsId?.getValue?.() ??
          null,
        hasSaveAction: Boolean(
          document.querySelector('[data-eye-dossier-action="save-operation"]'),
        ),
        mediaShown: Boolean(
          document.querySelector('.eye-media') &&
            !document.querySelector('.eye-media').hidden,
        ),
      };
    }, signalId);
    check(
      'p3-02-usgs-identity-and-selection',
      usgs.selectedId === usgs.expected &&
        usgs.viewerSelected === usgs.expected &&
        usgs.contextKey === `earthquakes:${usgs.expected}` &&
        usgs.inspecting === 'true' &&
        usgs.hasSaveAction &&
        // Las fotos de la Tierra no pueden ofrecerse como imagen de un sismo.
        usgs.mediaShown === false,
      usgs,
      'LIVE USGS',
    );
  } catch (error) {
    check(
      'p3-02-usgs-identity-and-selection',
      false,
      { unavailable: String(error?.message || error) },
      'LIVE USGS',
    );
  }

  // ─── P3-11 · Texto, objetivos táctiles y contraste en los cinco tamaños ───
  const viewports = [
    [1920, 1080],
    [1440, 900],
    [390, 844],
    [360, 800],
    [844, 390],
  ];
  for (const [width, height] of viewports) {
    await page.setViewport({ width, height });
    await new Promise((resolve) => setTimeout(resolve, 420));
    const metrics = await page.evaluate((isMobile) => {
      const luminance = (color) => {
        const [r, g, b] = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
        const channel = (value) => {
          const v = value / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const surfaces = [
        ...document.querySelectorAll(
          '#eye-mission-dock, #eye-dock-panel-ops, .eye-dock-tabs',
        ),
      ].filter((element) => element.offsetParent !== null || element.id === 'eye-mission-dock');
      const smallText = [];
      const smallTargets = [];
      const lowContrast = [];
      const minimum = isMobile ? 14 : 13;
      for (const surface of surfaces) {
        if (surface.hidden) continue;
        for (const element of [surface, ...surface.querySelectorAll('*')]) {
          const style = getComputedStyle(element);
          const text = element.textContent?.trim() ?? '';
          const own = [...element.childNodes].some(
            (child) => child.nodeType === 3 && child.textContent.trim().length > 0,
          );
          if (own && text) {
            const size = Number.parseFloat(style.fontSize);
            if (size < minimum)
              smallText.push({ text: text.slice(0, 40), size });
            const background = (() => {
              let cursor = element;
              while (cursor) {
                const value = getComputedStyle(cursor).backgroundColor;
                if (value && !/rgba\(0, 0, 0, 0\)/.test(value)) return value;
                cursor = cursor.parentElement;
              }
              return 'rgb(0,0,0)';
            })();
            const a = luminance(style.color) + 0.05;
            const b = luminance(background) + 0.05;
            const ratio = a > b ? a / b : b / a;
            if (ratio < 4.5)
              lowContrast.push({ text: text.slice(0, 40), ratio: Number(ratio.toFixed(2)) });
          }
          if (
            (element.tagName === 'BUTTON' || element.tagName === 'A') &&
            element.offsetParent !== null
          ) {
            const box = element.getBoundingClientRect();
            // Ambas dimensiones: un control de 200x20 no es accesible por ser
            // ancho. El umbral anterior aceptaba 24px de ancho y lo escondía.
            if (box.height < 44 || box.width < 44)
              smallTargets.push({
                text: element.textContent.slice(0, 24),
                height: Number(box.height.toFixed(1)),
                width: Number(box.width.toFixed(1)),
              });
          }
        }
      }
      // Hit-test de CADA enlace de atribución visible, no de un punto del
      // contenedor: un crédito tapado sigue siendo un crédito no pulsable.
      const creditLinks = [
        ...document.querySelectorAll(
          '.cesium-widget-credits a, #cesium-credits a, .cesium-credit-expand-link',
        ),
      ].filter((link) => link.offsetParent !== null);
      const creditsBlocked = [];
      for (const link of creditLinks) {
        const box = link.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        if (!hit || !(hit === link || link.contains(hit) || hit.contains(link)))
          creditsBlocked.push({
            text: link.textContent.slice(0, 30),
            blockedBy: hit?.className?.toString?.().slice(0, 40) ?? hit?.tagName,
          });
      }
      return {
        smallText,
        smallTargets,
        lowContrast,
        creditLinks: creditLinks.length,
        creditsBlocked,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
      };
      // 844x390 también es un teléfono: el minimo de 14px aplica por ancho
      // estrecho O por alto de teléfono en horizontal.
    }, width <= 650 || height <= 520);
    check(
      `p3-11-surface-quality-${width}x${height}`,
      metrics.smallText.length === 0 &&
        metrics.smallTargets.length === 0 &&
        metrics.lowContrast.length === 0 &&
        metrics.creditLinks > 0 &&
        metrics.creditsBlocked.length === 0 &&
        metrics.overflowX <= 0,
      metrics,
    );
    await page.screenshot({ path: path.join(out, `p3-${width}x${height}.png`) });
    result.screenshots.push(`p3-${width}x${height}.png`);
  }

  // ─── P3-05 · En móvil, abrir un panel SUSPENDE la ficha; no la cierra ───
  await page.setViewport({ width: 390, height: 844 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const mobileSuspension = await page.evaluate(async () => {
    const surface = () => document.getElementById('eye-mission-dock');
    const dossierKey = () =>
      document.querySelector('.eye-dossier')?.dataset.contextKey ?? null;
    const visible = () => {
      const element = surface();
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== 'none';
    };
    const before = { visible: visible(), key: dossierKey() };
    document.querySelector('[data-eye-view="instruments"]').click();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const during = {
      visible: visible(),
      focusable: [...document.querySelectorAll('#eye-mission-dock button')].filter(
        (button) => button.offsetParent !== null,
      ).length,
    };
    document.getElementById('eye-panel-close').click();
    await new Promise((resolve) => setTimeout(resolve, 600));
    const after = { visible: visible(), key: dossierKey() };
    return { before, during, after };
  });
  // ─── P3-05 · REPAIR-2: el botón Expediente reabre de verdad en móvil ───
  const mobileReopen = await page.evaluate(async () => {
    const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const surface = () => document.getElementById('eye-mission-dock');
    const visible = () => {
      const element = surface();
      const style = getComputedStyle(element);
      return !element.hidden && style.display !== 'none';
    };
    const key = () =>
      document.querySelector('.eye-dossier')?.dataset.contextKey ?? null;
    const identityBefore = key();
    // Cierre EXPLÍCITO de la persona.
    document.getElementById('eye-mission-dock-close').click();
    await settle(600);
    const afterClose = visible();
    // Navegar a Instrumentos (en móvil ocupa la pantalla y suspende).
    document.querySelector('[data-eye-view="instruments"]').click();
    await settle(600);
    const workspaceOpen = !document.getElementById('eye-workspace').hidden;
    // Acción visible: Expediente.
    const opener = document.getElementById('eye-instrument-dossier');
    const openerBox = opener?.getBoundingClientRect() ?? null;
    opener?.click();
    await settle(800);
    return {
      identityBefore,
      afterClose,
      workspaceOpenBefore: workspaceOpen,
      openerVisible: Boolean(openerBox && openerBox.height >= 44),
      workspaceClosedAfter: document.getElementById('eye-workspace').hidden,
      visibleAfter: visible(),
      identityAfter: key(),
      focusVisible: (() => {
        const active = document.activeElement;
        if (!active || active === document.body) return false;
        const box = active.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      })(),
      focusId: document.activeElement?.id ?? null,
    };
  });
  check(
    'p3-05-mobile-dossier-button-reopens',
    mobileReopen.openerVisible &&
      mobileReopen.afterClose === false &&
      mobileReopen.workspaceOpenBefore &&
      mobileReopen.workspaceClosedAfter &&
      mobileReopen.visibleAfter &&
      mobileReopen.identityAfter === mobileReopen.identityBefore &&
      mobileReopen.focusVisible,
    mobileReopen,
  );

  check(
    'p3-05-mobile-panel-suspends-not-closes',
    mobileSuspension.before.visible &&
      !mobileSuspension.during.visible &&
      mobileSuspension.during.focusable === 0 &&
      mobileSuspension.after.visible &&
      mobileSuspension.after.key === mobileSuspension.before.key,
    mobileSuspension,
  );

  // ─── P3-10 · Las dos rutas de Vista limpia ocultan y restauran igual ───
  await page.setViewport({ width: 1440, height: 900 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  // Las dos rutas REALES: el botón de EYEINSKY (#eye-clean) y el control del
  // producto base (#clean-view-toggle). No se simula ningún atajo inventado.
  const cleanRoutes = [];
  const surfaceState = () =>
    page.evaluate(() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        return (
          !element.hidden &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) > 0.01
        );
      };
      return {
        dossier: visible(document.getElementById('eye-mission-dock')),
        activity: visible(document.querySelector('.eye-activity')),
        focusable: [
          ...document.querySelectorAll(
            '#eye-mission-dock button, .eye-activity button',
          ),
        ].filter((button) => button.offsetParent !== null).length,
      };
    });
  for (const [route, open, close] of [
    ['eye-clean', '#eye-clean', '#eye-clean-exit'],
    ['clean-view-toggle', '#clean-view-toggle', '#clean-view-toggle'],
  ]) {
    const exists = await page.evaluate(
      (selector) => Boolean(document.querySelector(selector)),
      open,
    );
    if (!exists) {
      cleanRoutes.push({ route, unavailable: `${open} no existe en el DOM` });
      continue;
    }
    const before = await surfaceState();
    await page.evaluate((selector) => document.querySelector(selector).click(), open);
    await new Promise((resolve) => setTimeout(resolve, 520));
    const during = await surfaceState();
    await page.evaluate((selector) => document.querySelector(selector).click(), close);
    await new Promise((resolve) => setTimeout(resolve, 520));
    const after = await surfaceState();
    cleanRoutes.push({ route, before, during, after });
  }
  check(
    'p3-10-clean-view-both-routes',
    cleanRoutes.length === 2 &&
      cleanRoutes.every(
        (entry) =>
          !entry.unavailable &&
          !entry.during.dossier &&
          !entry.during.activity &&
          entry.during.focusable === 0 &&
          entry.after.dossier === entry.before.dossier &&
          entry.after.activity === entry.before.activity,
      ),
    cleanRoutes,
  );

  // ─── P3-12 · La brújula sigue al rumbo real de la cámara ───
  const compass = await page.evaluate(async () => {
    const view = window.__godsEyeView;
    const before = document.querySelector('.eye-dock-compass')?.dataset.heading ?? null;
    view.viewer.camera.setView({
      destination: view.viewer.camera.position,
      orientation: { heading: Math.PI / 2, pitch: -Math.PI / 4, roll: 0 },
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    const element = document.querySelector('.eye-dock-compass');
    return {
      before,
      after: element?.dataset.heading ?? null,
      label: element?.getAttribute('aria-label') ?? null,
    };
  });
  check(
    'p3-12-compass-follows-camera',
    compass.after !== null &&
      compass.after !== compass.before &&
      /rumbo/i.test(compass.label || ''),
    compass,
  );

  // ─── P3-11 · Zoom al 200 % REAL ───
  // `deviceScaleFactor` sólo cambia el DPR. El zoom de página se aplica por
  // CDP y se comprueba con `visualViewport.scale` y el área visual efectiva.
  const zoomClient = await page.createCDPSession();
  const beforeZoom = await page.evaluate(() => ({
    scale: visualViewport.scale,
    width: Number(visualViewport.width.toFixed(1)),
  }));
  await zoomClient.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await new Promise((resolve) => setTimeout(resolve, 700));
  const zoomed = await page.evaluate(() => {
    const surfaces = [
      document.getElementById('eye-mission-dock'),
      document.querySelector('.eye-dock-tabs'),
    ].filter((element) => element && !element.hidden);
    const outside = surfaces
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          id: element.id || element.className,
          overflowRight: Number((box.right - window.innerWidth).toFixed(1)),
          overflowBottom: Number((box.bottom - window.innerHeight).toFixed(1)),
        };
      })
      .filter((entry) => entry.overflowRight > 2 || entry.overflowBottom > 2);
    return {
      surfaces: surfaces.length,
      outside,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      scale: Number(visualViewport.scale.toFixed(2)),
      visualWidth: Number(visualViewport.width.toFixed(1)),
      visualHeight: Number(visualViewport.height.toFixed(1)),
    };
  });
  check(
    'p3-11-zoom-200',
    zoomed.surfaces > 0 &&
      zoomed.outside.length === 0 &&
      // Zoom de verdad: la escala visual sube y el área visible se reduce.
      Math.abs(zoomed.scale - 2) < 0.05 &&
      zoomed.visualWidth < beforeZoom.width * 0.6,
    { beforeZoom, ...zoomed },
  );
  await zoomClient.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await zoomClient.detach();
  await new Promise((resolve) => setTimeout(resolve, 400));
  await new Promise((resolve) => setTimeout(resolve, 500));

  // ─── P3-12 · La brújula es un control real, no un dibujo ───
  // Se prueba ANTES de Home a propósito: en la pose cenital global la cámara
  // queda fijada al norte y el rumbo no puede salirse de él.
  const compassControl = await page.evaluate(async () => {
    const element = document.querySelector('.eye-dock-compass');
    if (!element) return { present: false };
    const box = element.getBoundingClientRect();
    const view = window.__godsEyeView;
    const camera = view.viewer.camera;
    const isNorth = (value) =>
      Math.abs(value) < 0.05 || Math.abs(value - Math.PI * 2) < 0.05;
    const settle = async (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    /**
     * Cuenta las llamadas a la API PÚBLICA de cámara del visor durante una
     * acción. Es la prueba causal de que la acción llega a la autoridad de
     * cámara, aunque el rumbo final coincida con el de partida.
     */
    const recordCameraCalls = async (run) => {
      const calls = [];
      const originals = {};
      for (const method of ['flyTo', 'setView', 'lookAt', 'flyToBoundingSphere'])
        if (typeof camera[method] === 'function') {
          originals[method] = camera[method];
          camera[method] = function instrumented(...args) {
            calls.push(method);
            return originals[method].apply(this, args);
          };
        }
      try {
        await run();
      } finally {
        for (const [method, original] of Object.entries(originals))
          camera[method] = original;
      }
      return calls;
    };

    // Rumbo fuera del norte para que «orientar al norte» tenga algo que hacer.
    if (isNorth(camera.heading)) {
      camera.setView({
        destination: camera.position.clone(),
        orientation: { heading: Math.PI / 2, pitch: -Math.PI / 4, roll: 0 },
      });
      await settle(800);
    }
    const headingBefore = camera.heading;
    element.focus();
    const focused = document.activeElement === element;

    // 1) Invocación causal: ¿la brújula llega a la autoridad de cámara?
    const compassCalls = await recordCameraCalls(async () => {
      element.click();
      await settle(1500);
    });
    const headingAfterCompass = camera.heading;

    // 2) Control: el botón Norte heredado, con la misma medición.
    const dockCalls = await recordCameraCalls(async () => {
      document.getElementById('eye-north')?.click();
      await settle(1500);
    });

    // 3) Activación por teclado: Enter sobre un <button> enfocado dispara su
    //    activación nativa; se mide igual que el clic.
    element.focus();
    const keyboardCalls = await recordCameraCalls(async () => {
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      element.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }),
      );
      element.click(); // activación nativa que el teclado produce en un botón
      await settle(1200);
    });

    // 4) Activación táctil: secuencia de puntero real sobre el control.
    element.focus();
    const touchCalls = await recordCameraCalls(async () => {
      for (const type of ['pointerdown', 'pointerup', 'click'])
        element.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerType: 'touch',
            clientX: box.left + box.width / 2,
            clientY: box.top + box.height / 2,
          }),
        );
      await settle(1200);
    });

    // 5) ¿Existe una pose donde la autoridad Norte SÍ cambia el rumbo? Se
    //    acerca la cámara con el control de zoom del propio producto.
    let closePose = null;
    for (let i = 0; i < 6; i++) {
      document.getElementById('eye-zoom-in')?.click();
      await settle(700);
    }
    camera.setView({
      destination: camera.position.clone(),
      orientation: { heading: Math.PI / 2, pitch: -Math.PI / 4, roll: 0 },
    });
    await settle(900);
    const closeBefore = camera.heading;
    if (!isNorth(closeBefore)) {
      const closeCalls = await recordCameraCalls(async () => {
        element.click();
        const deadline = performance.now() + 8000;
        while (performance.now() < deadline && !isNorth(camera.heading))
          await settle(200);
      });
      closePose = {
        altitudeKm: Number(
          (camera.positionCartographic.height / 1000).toFixed(1),
        ),
        headingBefore: Number(closeBefore.toFixed(3)),
        headingAfter: Number(camera.heading.toFixed(3)),
        cameraCalls: closeCalls,
        turnedNorth: isNorth(camera.heading),
      };
    }

    return {
      present: true,
      tag: element.tagName,
      type: element.type,
      width: Number(box.width.toFixed(1)),
      height: Number(box.height.toFixed(1)),
      label: element.getAttribute('aria-label'),
      focused,
      headingBefore: Number(headingBefore.toFixed(3)),
      headingAfter: Number(headingAfterCompass.toFixed(3)),
      compassCalls,
      dockCalls,
      keyboardCalls,
      touchCalls,
      closePose,
    };
  });
  const sameAuthority =
    JSON.stringify(compassControl.compassCalls) ===
    JSON.stringify(compassControl.dockCalls);
  check(
    'p3-12-compass-is-an-actionable-control',
    compassControl.present &&
      compassControl.tag === 'BUTTON' &&
      compassControl.type === 'button' &&
      compassControl.width >= 44 &&
      compassControl.height >= 44 &&
      compassControl.focused &&
      /rumbo/i.test(compassControl.label || '') &&
      /norte/i.test(compassControl.label || '') &&
      // La acción llega a la autoridad pública de cámara…
      compassControl.compassCalls.length > 0 &&
      // …exactamente por el mismo camino que el botón Norte heredado…
      sameAuthority &&
      // …y por las tres vías de activación exigidas.
      compassControl.keyboardCalls.length > 0 &&
      compassControl.touchCalls.length > 0 &&
      // Donde la autoridad puede girar de verdad, gira.
      compassControl.closePose?.turnedNorth === true,
    { ...compassControl, sameAuthority },
  );

  // Volver a la vista del globo por la ruta real (Home). Con D1-A no reabre
  // la ficha de vista: la lectura de la cámara vive en la telemetría del pie.
  await page.click('#eye-home');
  await new Promise((resolve) => setTimeout(resolve, 1200));

  // ─── P3-01b · Mapa y cámara reales: en la telemetría, tras #eye-home ───
  // Fase visual T3 (§1.1, D1-A): los mismos datos (mapa activo, altura y
  // coordenadas d.d° / d.d°) se leen en `.eye-telemetry`, su única lectura
  // (V-04). Antes: `.eye-dossier-fields` / `.eye-dossier-coords` de la ficha
  // de vista abierta en reposo.
  const viewFields = await page.evaluate(() => {
    const text = (id) => document.getElementById(id)?.textContent?.trim() ?? '';
    const telemetry = document.querySelector('.eye-telemetry');
    const dock = document.getElementById('eye-mission-dock');
    return {
      map: text('eye-map-label'),
      altitude: text('eye-camera-altitude'),
      coords: text('eye-camera-position'),
      inTelemetry: ['eye-map-label', 'eye-camera-altitude', 'eye-camera-position'].every(
        (id) => telemetry?.contains(document.getElementById(id)),
      ),
      telemetryVisible: Boolean(telemetry?.getClientRects().length),
      dockHidden: Boolean(dock?.hidden),
    };
  });
  check(
    'p3-01b-telemetry-has-real-map-and-camera',
    viewFields.inTelemetry &&
      viewFields.telemetryVisible &&
      viewFields.dockHidden &&
      viewFields.map.length > 0 &&
      viewFields.map !== 'Sin cartografía' &&
      /^\d[\d,.]*\s*km$/.test(viewFields.altitude) &&
      /^-?\d+\.\d+°\s*\/\s*-?\d+\.\d+°$/.test(viewFields.coords),
    viewFields,
  );
  // ─── P3-06 · Una foto que no carga lo dice y no bloquea la ficha ───
  // Reparación T5: tras #eye-home la ficha está OCULTA (D1-A, p3-01b) y leer
  // textContent de nodos ocultos no comprueba nada. Se reabre por la ruta
  // real (Instrumentos → Panel de misión, como openMissionPanel de p31) y se
  // exige que la ficha esté a la vista al romperse la foto.
  await page.click('.eye-function-dock [data-eye-view="instruments"]');
  await page.click('#eye-instrument-dossier');
  await page.waitForFunction(
    () => document.getElementById('eye-mission-dock')?.dataset.visible === 'true',
    { timeout: 10_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  const brokenMedia = await page.evaluate(async () => {
    const dock = document.getElementById('eye-mission-dock');
    const shown = (el) =>
      Boolean(el) &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden';
    const image = document.querySelector('.eye-media-image');
    if (!image) return { present: false };
    image.dispatchEvent(new Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 200));
    const title = document.getElementById('eye-mission-dock-title');
    return {
      present: true,
      dockVisible: dock?.dataset.visible === 'true',
      dockHidden: Boolean(dock?.hidden),
      state: document.querySelector('.eye-media')?.dataset.mediaState ?? null,
      caption:
        document.querySelector('.eye-media-caption')?.textContent ?? null,
      // La ficha sigue a la vista con su identidad…
      dossierStillThere: shown(title) && Boolean(title.textContent.trim()),
      // …y su estado dicho. Antes: `.eye-dossier-fields dt`; la ficha de la
      // vista ya no tiene campos (mapa/altura/rumbo viven en la telemetría,
      // V-04), así que se exige el estado del expediente, que sí la describe.
      fieldsStillThere: Boolean(
        document.querySelector('.eye-dossier-status')?.textContent?.trim(),
      ),
    };
  });
  check(
    'p3-06-broken-media-says-so-without-blocking',
    brokenMedia.present &&
      brokenMedia.dockVisible &&
      !brokenMedia.dockHidden &&
      brokenMedia.state === 'unavailable' &&
      brokenMedia.caption === 'Fotografía no disponible' &&
      brokenMedia.dossierStillThere &&
      brokenMedia.fieldsStillThere,
    brokenMedia,
  );

  // ─── P3-03/08 · CCTV real: el controlador público está conectado ───
  const cctvWiring = await page.evaluate(() => {
    const module = window.__godsEyeView.dataManager.layers.get('cctv')?.module;
    return {
      moduleFound: Boolean(module),
      hasSubscribe: typeof module?.subscribe === 'function',
      uiStateShape: module?.getUIState
        ? Object.keys(module.getUIState()).filter((key) =>
            ['loading', 'activeCameraId', 'ambientCards'].includes(key),
          )
        : [],
    };
  });
  check(
    'p3-03-cctv-public-controller-available',
    cctvWiring.moduleFound &&
      cctvWiring.hasSubscribe &&
      cctvWiring.uiStateShape.length === 3,
    cctvWiring,
  );

  // ─── P3-03/08 · CCTV conectado de verdad: se enciende la capa y su
  //     geometría aparece en la cápsula, separada de los fotogramas ───
  const cctvRuntime = await page.evaluate(async () => {
    const manager = window.__godsEyeView.dataManager;
    if (!manager.isEnabled('cctv')) {
      const toggle = document.querySelector(
        '[data-eye-catalog-toggle="cctv"]',
      );
      if (toggle) toggle.click();
      else await manager.setEnabled?.('cctv', true, { origin: 'p3-harness' });
    }
    const deadline = performance.now() + 45000;
    let geometry = null;
    let frames = null;
    while (performance.now() < deadline && !geometry) {
      const detail = document.getElementById('eye-dock-panel-ops');
      for (const item of detail.querySelectorAll('.eye-activity-item')) {
        const text = item.textContent || '';
        if (text.includes('Cámaras · geometría')) geometry = text;
        if (text.includes('Cámaras · fotogramas')) frames = text;
      }
      if (geometry) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const stats = manager.layers.get('cctv')?.module?.getStats?.() ?? null;
    return {
      enabled: manager.isEnabled('cctv'),
      geometry,
      frames,
      stats: stats
        ? { count: stats.count, error: stats.error, loading: stats.loading }
        : null,
    };
  });
  const cctvUnavailable = Boolean(cctvRuntime.stats?.error);
  check(
    'p3-03-cctv-geometry-reaches-activity',
    cctvUnavailable
      ? false
      : Boolean(cctvRuntime.enabled && cctvRuntime.geometry),
    {
      ...cctvRuntime,
      // La geometría dice «cameras-geometry» con denominador; los fotogramas
      // nunca heredan ese porcentaje.
      geometryHasDenominator: /\d+\/\d+ cameras-geometry/.test(
        cctvRuntime.geometry || '',
      ),
      providerUnavailable: cctvUnavailable,
    },
    cctvUnavailable ? 'PROVEEDOR NO DISPONIBLE' : 'LIVE CCTV',
  );

  // ─── P3-03 · REPAIR-2: la ficha de cámara sale del contrato público real ───
  const cctvDossier = await page.evaluate(async () => {
    const module = window.__godsEyeView.dataManager.layers.get('cctv')?.module;
    if (typeof module?.selectCamera !== 'function')
      return { unavailable: 'el controlador no expone selectCamera' };
    const state = module.getUIState();
    const camera = state.cameras?.find((entry) => entry.name && entry.provider);
    if (!camera) return { unavailable: 'ninguna cámara publicada todavía' };
    // Sin `focus`: seleccionar no puede mover la cámara del globo.
    module.selectCamera(camera.id);
    await new Promise((resolve) => setTimeout(resolve, 900));
    const root = document.querySelector('.eye-dossier');
    const labels = [...document.querySelectorAll('.eye-dossier-fields dt')].map(
      (dt) => dt.textContent,
    );
    return {
      expected: {
        id: camera.id,
        name: camera.name,
        provider: camera.provider,
        lat: camera.lat,
        lon: camera.lon,
      },
      contextKey: root?.dataset.contextKey ?? null,
      kind: root?.dataset.contextKind ?? null,
      title: document.getElementById('eye-mission-dock-title')?.textContent ?? null,
      source: document.querySelector('.eye-dossier-source')?.textContent ?? null,
      coords: document.querySelector('.eye-dossier-coords')?.textContent ?? null,
      labels,
    };
  });
  check(
    'p3-03-cctv-camera-dossier-is-real',
    cctvDossier.unavailable
      ? false
      : cctvDossier.contextKey === `cctv:${cctvDossier.expected.id}` &&
          cctvDossier.kind === 'camera' &&
          cctvDossier.title === cctvDossier.expected.name &&
          cctvDossier.labels.includes('PROVEEDOR') &&
          cctvDossier.labels.includes('ESTADO DE LA FUENTE') &&
          cctvDossier.coords ===
            `${cctvDossier.expected.lat.toFixed(3)}° / ${cctvDossier.expected.lon.toFixed(3)}°`,
    cctvDossier,
    cctvDossier.unavailable ? 'PROVEEDOR NO DISPONIBLE' : 'LIVE CCTV',
  );

  // ─── REPAIR-2 · Pruebas DOM sobre los colaboradores, en un sandbox ───
  const sandboxChecks = await page.evaluate(async () => {
    const [activity, media, dossier] = await Promise.all([
      import('/src/ui/eyeinskyActivity.js'),
      import('/src/ui/eyeinskyMedia.js'),
      import('/src/ui/eyeinskyDossier.js'),
    ]);
    const sandbox = document.createElement('div');
    document.body.append(sandbox);
    const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // (2) Un terminal accionable debe poder reintentarse DESDE el historial.
    //
    // P3.1: OPS ya no es una cápsula con disclosure propio — es el panel OPS
    // del Mission Dock, siempre pintado dentro de su pestaña. No hay `open()`
    // que llamar: montarlo y darle estado ES abrirlo.
    const activityHost = document.createElement('div');
    sandbox.append(activityHost);
    const retries = [];
    const ops = activity.mountEyeActivity({
      host: activityHost,
      onRetry: (taskId) => retries.push(taskId),
    });
    ops.update({
      tasks: [],
      history: [
        {
          taskId: 'layer:flights#2',
          ownerKey: 'layer:flights',
          attempt: 2,
          status: 'error',
          label: 'Vuelos',
          unit: null,
          loaded: null,
          total: null,
          safeError: 'proveedor no disponible',
          canRetry: true,
          canCancel: false,
          updatedAt: Date.now(),
        },
      ],
    });
    const historyRetry = activityHost.querySelector(
      '.eye-activity-history [data-eye-activity-retry]',
    );
    const historyRetryBox = historyRetry?.getBoundingClientRect() ?? null;
    historyRetry?.click();
    const terminalRetry = {
      buttonPresent: Boolean(historyRetry),
      accessibleName: historyRetry?.textContent ?? null,
      width: historyRetryBox ? Number(historyRetryBox.width.toFixed(1)) : 0,
      height: historyRetryBox ? Number(historyRetryBox.height.toFixed(1)) : 0,
      calls: retries.length,
      taskId: retries[0] ?? null,
      // El terminal vive en el historial: no puede aparecer entre los trabajos
      // en curso (la lista de activos debe seguir vacía).
      runningItems: activityHost.querySelectorAll('.eye-activity-list .eye-activity-item')
        .length,
    };

    // (5) La reproducción no corre mientras el puntero o el foco están dentro.
    //
    // P3.1: los medios tienen su propio panel en el dock, así que se montan en
    // su propio host — igual que hace el shell con `getMediaHost()` del dock —
    // en vez de dentro del expediente, que ya no los aloja.
    const dossierHost = document.createElement('div');
    const mediaHost = document.createElement('div');
    sandbox.append(dossierHost, mediaHost);
    const mountedDossier = dossier.mountEyeDossier({ host: dossierHost });
    const player = media.mountEyeMedia({
      host: mediaHost,
      reducedMotion: () => false,
    });
    player.setContext({ key: 'earth:view', generation: 0 });
    const figure = mediaHost.querySelector('.eye-media');
    const playButton = mediaHost.querySelector('.eye-media-play');
    figure.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    figure.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    playButton.click();
    const whileInside = {
      requested: player.isPlayRequested?.() ?? null,
      running: player.isPlaying(),
    };
    figure.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
    figure.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await settle(120);
    const afterLeaving = {
      requested: player.isPlayRequested?.() ?? null,
      running: player.isPlaying(),
    };
    document.dispatchEvent(new Event('visibilitychange'));
    const autoplay = { whileInside, afterLeaving };
    // El botón debe poder desarmar la solicitud.
    playButton.click();
    autoplay.afterToggleOff = {
      requested: player.isPlayRequested?.() ?? null,
      running: player.isPlaying(),
    };

    // (6) Un error tardío de A no puede marcar B como no disponible.
    player.setContext({ key: 'earth:view', generation: 1 });
    const firstImage = mediaHost.querySelector('.eye-media-image');
    player.setContext({ key: 'earth:view', generation: 2 });
    const secondImage = mediaHost.querySelector('.eye-media-image');
    firstImage.dispatchEvent(new Event('error'));
    await settle(120);
    const staleImage = {
      differentElement: firstImage !== secondImage,
      stateAfterStaleError:
        mediaHost.querySelector('.eye-media')?.dataset.mediaState ?? null,
      captionAfterStaleError:
        mediaHost.querySelector('.eye-media-caption')?.textContent ?? null,
    };
    secondImage.dispatchEvent(new Event('error'));
    await settle(120);
    staleImage.stateAfterOwnError =
      mediaHost.querySelector('.eye-media')?.dataset.mediaState ?? null;
    staleImage.captionAfterOwnError =
      mediaHost.querySelector('.eye-media-caption')?.textContent ?? null;

    player.destroy();
    ops.destroy();
    mountedDossier.destroy();
    sandbox.remove();
    return { terminalRetry, autoplay, staleImage };
  });
  check(
    'p3-09-terminal-retry-is-reachable',
    sandboxChecks.terminalRetry.buttonPresent &&
      /reintentar/i.test(sandboxChecks.terminalRetry.accessibleName || '') &&
      sandboxChecks.terminalRetry.height >= 44 &&
      sandboxChecks.terminalRetry.width >= 44 &&
      sandboxChecks.terminalRetry.calls === 1 &&
      sandboxChecks.terminalRetry.taskId === 'layer:flights#2' &&
      sandboxChecks.terminalRetry.runningItems === 0,
    sandboxChecks.terminalRetry,
  );
  check(
    'p3-06-autoplay-pauses-while-interacting',
    sandboxChecks.autoplay.whileInside.requested === true &&
      sandboxChecks.autoplay.whileInside.running === false &&
      sandboxChecks.autoplay.afterLeaving.requested === true &&
      sandboxChecks.autoplay.afterLeaving.running === true &&
      sandboxChecks.autoplay.afterToggleOff.requested === false &&
      sandboxChecks.autoplay.afterToggleOff.running === false,
    sandboxChecks.autoplay,
  );
  check(
    'p3-06-stale-image-error-does-not-touch-current',
    sandboxChecks.staleImage.differentElement &&
      sandboxChecks.staleImage.stateAfterStaleError !== 'unavailable' &&
      sandboxChecks.staleImage.captionAfterStaleError !==
        'Fotografía no disponible' &&
      sandboxChecks.staleImage.stateAfterOwnError === 'unavailable' &&
      sandboxChecks.staleImage.captionAfterOwnError ===
        'Fotografía no disponible',
    sandboxChecks.staleImage,
  );

  // ─── P3-14 · Destrucción real: nada sigue escuchando ni mutando ───
  const teardown = await page.evaluate(async () => {
    const before = {
      dossierNodes: document.querySelectorAll('.eye-dossier').length,
      activityNodes: document.querySelectorAll('.eye-activity').length,
    };
    // La aplicación sólo admite una instancia por página y no expone su
    // `destroy()` en el documento, así que se destruyen los COLABORADORES por
    // su API pública, montados aparte: es el desmontaje real de este código.
    const [media, activity, dossier, sources] = await Promise.all([
      import('/src/ui/eyeinskyMedia.js'),
      import('/src/ui/eyeinskyActivity.js'),
      import('/src/ui/eyeinskyDossier.js'),
      import('/src/ui/eyeinskyDossierSources.js'),
    ]);
    const sandbox = document.createElement('div');
    sandbox.id = 'p3-teardown-sandbox';
    document.body.append(sandbox);

    const dossierHost = document.createElement('div');
    const activityHost = document.createElement('div');
    // P3.1: cada colaborador tiene su propio host, como en el dock real.
    const mediaHost = document.createElement('div');
    sandbox.append(dossierHost, mediaHost, activityHost);
    const mountedDossier = dossier.mountEyeDossier({ host: dossierHost });
    const mountedActivity = activity.mountEyeActivity({ host: activityHost });
    const mountedMedia = media.mountEyeMedia({
      host: mediaHost,
      reducedMotion: () => false,
    });
    let published = 0;
    const mountedSources = sources.connectDossierSources({
      onContext: () => {
        published += 1;
      },
    });
    mountedMedia.setContext({ key: 'earth:view', generation: 0 });
    // Reproducción en marcha: hay un temporizador vivo que destruir.
    sandbox.querySelector('.eye-media-play')?.click();
    const playingBefore = mountedMedia.isPlaying();
    const publishedBefore = published;
    const nodesBefore = sandbox.querySelectorAll(
      '.eye-dossier, .eye-activity, .eye-media',
    ).length;

    mountedMedia.destroy();
    mountedActivity.destroy();
    mountedDossier.destroy();
    mountedSources.destroy();

    // Después de destruir: eventos tardíos por todos los carriles observados.
    window.dispatchEvent(
      new CustomEvent('gev:entity-selected', {
        detail: { id: 'tardio', layerId: 'earthquakes', label: 'Tardío' },
      }),
    );
    window.dispatchEvent(
      new CustomEvent('gev:map-stack-changed', { detail: {} }),
    );
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 400));

    const result = {
      before,
      playingBefore,
      publishedBefore,
      nodesBefore,
      nodesAfter: sandbox.querySelectorAll(
        '.eye-dossier, .eye-activity, .eye-media',
      ).length,
      publishedAfterDestroy: published - publishedBefore,
      mediaStillPlaying: mountedMedia.isPlaying(),
      sandboxEmpty: sandbox.textContent.trim().length === 0,
    };
    sandbox.remove();
    return result;
  });
  check(
    'p3-14-teardown-releases-collaborators',
    teardown.unavailable
      ? false
      : teardown.nodesBefore > 0 &&
          teardown.playingBefore === true &&
          teardown.nodesAfter === 0 &&
          teardown.sandboxEmpty &&
          teardown.mediaStillPlaying === false &&
          teardown.publishedAfterDestroy === 0,
    teardown,
  );

  result.status = result.checks.every((entry) => entry.ok) ? 'pass' : 'fail';
} catch (error) {
  result.status = 'error';
  result.fatal = String(error?.stack || error);
} finally {
  result.completedAt = new Date().toISOString();
  result.summary = {
    total: result.checks.length,
    passed: result.checks.filter((entry) => entry.ok).length,
    failed: result.checks.filter((entry) => !entry.ok).length,
  };
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ status: result.status, ...result.summary }, null, 2));
process.exitCode = result.status === 'pass' ? 0 : 1;
