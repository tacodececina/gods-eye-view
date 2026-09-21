/**
 * Arnés de navegador de EYEINSKY P3.1 — Mission Dock.
 *
 * Mide sobre la aplicación viva lo que ninguna prueba de nodo puede probar: la
 * geometría real del dock en cinco anchos, que sus controles reciben el toque
 * donde se ven, la pestañera y el foco, el zoom al 200 %, Vista limpia, y que
 * un gesto físico suelta la cámara SIN perder el objetivo.
 *
 * Uso: node scripts/eyeinsky-p31.mjs <url> <directorio-de-salida>
 * El directorio de salida es OBLIGATORIO y no puede contener ya un result.json:
 * la evidencia de una corrida no se pisa con la de otra.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://127.0.0.1:4201/';
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
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-p31-'));
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

/** Anchos reales que el dock tiene que resolver, no una media inventada. */
const VIEWPORTS = [
  { id: '390x844', width: 390, height: 844, mobile: true },
  { id: '768x1024', width: 768, height: 1024, mobile: true },
  { id: '844x390', width: 844, height: 390, mobile: true },
  { id: '1280x800', width: 1280, height: 800, mobile: false },
  { id: '1920x1080', width: 1920, height: 1080, mobile: false },
];

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
  await page.waitForSelector('#eye-mission-dock .eye-dock-rail', {
    timeout: 30_000,
  });
}

/**
 * Captura una prueba visual con nombre estable dentro del directorio de salida.
 * @param {import('puppeteer').Page} page Página.
 * @param {string} name Nombre del archivo, sin extensión.
 * @returns {Promise<void>} Escritura completada.
 */
async function shot(page, name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  result.screenshots.push(`${name}.png`);
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

  // ─── P31-01 · El dock nace abajo, con la ficha de vista, sin robar foco ───
  const initial = await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    const box = dock.getBoundingClientRect();
    const active = document.activeElement;
    return {
      visible: !dock.hidden,
      contextKey: dock.dataset.contextKey ?? null,
      title:
        document.getElementById('eye-mission-dock-title')?.textContent ?? null,
      // Ancla inferior real: el borde de abajo del dock queda cerca del borde
      // de abajo de la ventana, no del derecho como el antiguo expediente.
      gapBottom: Math.round(window.innerHeight - box.bottom),
      gapLeft: Math.round(box.left),
      focusInside: Boolean(active && dock.contains(active)),
      inspectingFlag: document.body.dataset.eyeInspecting ?? null,
      expanded: dock.dataset.expanded ?? null,
    };
  });
  check(
    'p31-01-dock-anchored-bottom-without-focus-theft',
    initial.visible &&
      initial.contextKey === 'earth:view' &&
      initial.gapBottom >= 0 &&
      initial.gapBottom <= 48 &&
      initial.gapLeft <= 48 &&
      !initial.focusInside &&
      initial.inspectingFlag !== 'true' &&
      initial.expanded === 'false',
    initial,
  );
  await shot(page, 'p31-dock-1440x900');

  // ─── P31-02 · El dock no tapa el riel de cámara ni la telemetría ───
  const overlap = await page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element || element.hidden) return null;
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const intersects = (a, b) =>
      Boolean(a && b) &&
      a.left < b.right &&
      b.left < a.right &&
      a.top < b.bottom &&
      b.top < a.bottom;
    const dock = rect('#eye-mission-dock');
    const instruments = rect('.eye-instruments');
    const telemetry = rect('.eye-telemetry');
    return {
      dock,
      instruments,
      telemetry,
      hitsInstruments: intersects(dock, instruments),
      hitsTelemetry: intersects(dock, telemetry),
    };
  });
  check(
    'p31-02-dock-clears-camera-rail-and-telemetry',
    !overlap.hitsInstruments && !overlap.hitsTelemetry,
    overlap,
  );

  // ─── P31-03 · Cada control del dock recibe el toque donde se ve ───
  const hitTest = await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    const controls = [...dock.querySelectorAll('button')].filter(
      (button) => !button.hidden && button.getClientRects().length,
    );
    return controls.map((button) => {
      const box = button.getBoundingClientRect();
      const x = Math.round(box.left + box.width / 2);
      const y = Math.round(box.top + box.height / 2);
      const top = document.elementFromPoint(x, y);
      return {
        label: button.getAttribute('aria-label') || button.textContent.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
        // El elemento que realmente recibiría el clic en su centro.
        reachable: Boolean(top && (button === top || button.contains(top))),
        // Objetivo táctil mínimo: 44 px en el lado corto.
        touchOk: Math.min(box.width, box.height) >= 44 - 0.5,
      };
    });
  });
  check(
    'p31-03-dock-controls-are-reachable-and-touch-sized',
    hitTest.length > 0 &&
      hitTest.every((control) => control.reachable && control.touchOk),
    hitTest,
  );

  // ─── P31-04 · MÁS despliega, la pestañera responde a flechas, Esc repliega ───
  await page.click('[data-eye-dock-action="more"]');
  const expandedState = await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    const tabs = [...dock.querySelectorAll('[role="tab"]')];
    const selected = tabs.find(
      (tab) => tab.getAttribute('aria-selected') === 'true',
    );
    return {
      expanded: dock.dataset.expanded,
      more: document
        .querySelector('[data-eye-dock-action="more"]')
        ?.getAttribute('aria-expanded'),
      tabIds: tabs.map((tab) => tab.id),
      rovingTabindex: tabs.map((tab) => tab.tabIndex),
      selected: selected?.id ?? null,
      panelVisible: !document.getElementById('eye-dock-panel-objetivo').hidden,
      dossierPresent: Boolean(dock.querySelector('.eye-dossier')),
    };
  });
  check(
    'p31-04-more-expands-a-real-tabpanel',
    expandedState.expanded === 'true' &&
      expandedState.more === 'true' &&
      expandedState.selected === 'eye-dock-tab-objetivo' &&
      expandedState.panelVisible &&
      expandedState.dossierPresent &&
      expandedState.rovingTabindex.filter((value) => value === 0).length === 1,
    expandedState,
  );

  await page.focus('#eye-dock-tab-objetivo');
  await page.keyboard.press('ArrowRight');
  const mediaPane = await page.evaluate(() => {
    const tab = document.getElementById('eye-dock-tab-medios');
    const panel = document.getElementById('eye-dock-panel-medios');
    const image = panel?.querySelector('.eye-media-image');
    const credit = panel?.querySelector('.eye-media-credit');
    return {
      present: Boolean(tab && panel),
      selected: tab?.getAttribute('aria-selected') ?? null,
      visible: Boolean(panel) && !panel.hidden,
      assetSrc: image?.getAttribute('src') ?? null,
      alt: image?.getAttribute('alt') ?? null,
      credit: credit?.textContent ?? null,
      creditHref: credit?.getAttribute('href') ?? null,
    };
  });
  check(
    'p31-04b-real-media-is-reachable-and-attributed',
    mediaPane.present &&
      mediaPane.selected === 'true' &&
      mediaPane.visible &&
      /^\/eyeinsky\/media\//.test(mediaPane.assetSrc || '') &&
      Boolean(mediaPane.alt) &&
      Boolean(mediaPane.credit) &&
      /^https:\/\//.test(mediaPane.creditHref || ''),
    mediaPane,
  );

  await page.keyboard.press('ArrowRight');
  const afterArrow = await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    const selected = dock.querySelector('[aria-selected="true"]');
    return {
      selected: selected?.id ?? null,
      opsVisible: !document.getElementById('eye-dock-panel-ops').hidden,
      opsMark: document.querySelector('.eye-ops-mark')?.textContent ?? null,
      opsLive: document.querySelector('.eye-ops-live')?.textContent ?? null,
      logRole: document.getElementById('eye-ops-log')?.getAttribute('role'),
    };
  });
  check(
    'p31-05-arrow-keys-reach-the-ops-terminal',
    afterArrow.selected === 'eye-dock-tab-ops' &&
      afterArrow.opsVisible &&
      afterArrow.opsMark === 'EYEINSKY OPS' &&
      afterArrow.opsLive === '// LIVE' &&
      afterArrow.logRole === 'log',
    afterArrow,
  );
  await shot(page, 'p31-dock-ops-expanded');

  await page.keyboard.press('Escape');
  const afterEscape = await page.evaluate(() => ({
    expanded: document.getElementById('eye-mission-dock').dataset.expanded,
    focusId: document.activeElement?.id || document.activeElement?.className,
  }));
  check(
    'p31-06-escape-collapses-and-returns-focus',
    afterEscape.expanded === 'false' &&
      String(afterEscape.focusId).length > 0 &&
      String(afterEscape.focusId) !== 'BODY',
    afterEscape,
  );

  // ─── P31-07 · Sin objetivo seguible, SEGUIR se niega y dice por qué ───
  const idleActions = await page.evaluate(() =>
    [...document.querySelectorAll('[data-eye-dock-action]')].map((button) => ({
      id: button.dataset.eyeDockAction,
      disabled: button.disabled,
      label: button.textContent.trim(),
      name: button.getAttribute('aria-label'),
      title: button.title,
    })),
  );
  const follow = idleActions.find((item) => item.id === 'follow');
  check(
    'p31-07-follow-refuses-with-a-stated-reason',
    Boolean(follow) &&
      follow.disabled &&
      /Sin contacto seleccionado/.test(follow.name || '') &&
      follow.title === 'Sin contacto seleccionado',
    { follow, idleActions },
  );

  // ─── P31-08 · El estado de cámara existe y es una región de estado ───
  const camera = await page.evaluate(() => {
    const line = document.querySelector('.eye-dock-camera');
    return {
      role: line?.getAttribute('role') ?? null,
      badge: document.querySelector('.eye-dock-camera-badge')?.textContent,
      detail: document.querySelector('.eye-dock-camera-detail')?.textContent,
      datasetStatus:
        document.getElementById('eye-mission-dock').dataset.cameraStatus,
    };
  });
  check(
    'p31-08-camera-status-is-announced',
    camera.role === 'status' &&
      camera.datasetStatus === 'free' &&
      /LIBRE/.test(camera.badge || ''),
    camera,
  );

  // ─── P31-09 · Selección real → gesto físico → misma identidad → SEGUIR ───
  const gesture = await page.evaluate(async () => {
    const view = window.__godsEyeView;
    const viewer = view?.viewer;
    const manager = view?.dataManager || window.__eyeinsky?.dataManager || null;
    const layer = manager?.layers?.get('flights')?.module ?? null;
    if (!viewer || !layer) return { skipped: 'sin viewer o capa de vuelos' };

    if (
      typeof layer.testing?._setTrackedFlightRefreshStateForTest !==
      'function'
    )
      return { skipped: 'la capa activa no expone su fixture de tracking' };

    const id = 'p31e2e';
    const position = viewer.camera.positionWC.clone();
    const entity = viewer.entities.add({ position });
    entity.gevTrackedId = `flights:${id}`;
    layer.testing._setTrackedFlightRefreshStateForTest({
      icao24: id,
      entity,
      billboard: { position, show: true, rotation: 0 },
      billboardCollection: { show: true, remove() {} },
      viewer,
      meta: {
        callsign: 'P31TEST',
        registration: 'P31-E2E',
        altitude: 10_668,
        velocity: 250,
        trueTrack: 95,
        klass: 'airliner',
      },
    });
    viewer.trackedEntity = entity;
    const selected = layer.refocusTrackedById(id, { origin: 'user' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const dock = document.getElementById('eye-mission-dock');
    const before = {
      contextKey: dock?.dataset.contextKey ?? null,
      selectedId: layer.getParams?.().selectedFlightsTrackingId ?? null,
      ownerIsFixture: viewer.trackedEntity === entity,
    };

    const canvas = viewer.canvas;
    const box = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -180,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 3,
        bubbles: true,
        cancelable: true,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 180));

    const followButton = document.querySelector(
      '[data-eye-dock-action="follow"]',
    );
    const released = {
      contextKey: dock?.dataset.contextKey ?? null,
      selectedId: layer.getParams?.().selectedFlightsTrackingId ?? null,
      ownerReleased: !viewer.trackedEntity,
      cameraStatus: dock?.dataset.cameraStatus ?? null,
      followPressed: followButton?.getAttribute('aria-pressed') ?? null,
      followDisabled: followButton?.disabled ?? true,
    };

    followButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const refollowed = {
      contextKey: dock?.dataset.contextKey ?? null,
      selectedId: layer.getParams?.().selectedFlightsTrackingId ?? null,
      ownerIsFixture: viewer.trackedEntity === entity,
      cameraStatus: dock?.dataset.cameraStatus ?? null,
    };

    layer.stopTracking?.({ origin: 'test-cleanup' });
    if (viewer.entities.contains(entity)) viewer.entities.remove(entity);

    return { id, selected, before, released, refollowed };
  });
  check(
    'p31-09-real-selection-survives-gesture-and-refollows-the-same-id',
    !gesture.skipped &&
      gesture.selected === true &&
      gesture.before.contextKey === `flights:${gesture.id}` &&
      gesture.before.selectedId === gesture.id &&
      gesture.before.ownerIsFixture &&
      gesture.released.contextKey === `flights:${gesture.id}` &&
      gesture.released.selectedId === gesture.id &&
      gesture.released.ownerReleased &&
      gesture.released.cameraStatus === 'selected-free' &&
      gesture.released.followPressed === 'false' &&
      !gesture.released.followDisabled &&
      gesture.refollowed.contextKey === `flights:${gesture.id}` &&
      gesture.refollowed.selectedId === gesture.id &&
      gesture.refollowed.ownerIsFixture &&
      gesture.refollowed.cameraStatus === 'following',
    gesture,
  );

  // ─── P31-10 · Vista limpia retira el dock y lo devuelve como estaba ───
  //
  // Se fija un estado conocido primero (panel OPS, desplegado) para que
  // «devuelto como estaba» sea una afirmación comprobable y no lo que quedara
  // de la comprobación anterior.
  await page.click('#eye-dock-tab-ops');
  await page.click('[data-eye-dock-action="more"]');
  const beforeClean = await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    return {
      expanded: dock.dataset.expanded,
      pane: dock.querySelector('[aria-selected="true"]')?.id ?? null,
    };
  });
  await page.click('#eye-clean');
  const clean = await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    return {
      display: getComputedStyle(dock).display,
      cleanFlag: document.body.classList.contains('eye-clean'),
      exitVisible: !document.getElementById('eye-clean-exit').hidden,
    };
  });
  await shot(page, 'p31-clean-view');
  await page.click('#eye-clean-exit');
  const restored = await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    return {
      display: getComputedStyle(dock).display,
      expanded: dock.dataset.expanded,
      pane: dock.querySelector('[aria-selected="true"]')?.id ?? null,
    };
  });
  check(
    'p31-10-clean-view-suspends-and-restores-exactly',
    clean.display === 'none' &&
      clean.cleanFlag &&
      clean.exitVisible &&
      restored.display !== 'none' &&
      beforeClean.expanded === 'true' &&
      restored.expanded === beforeClean.expanded &&
      restored.pane === beforeClean.pane,
    { beforeClean, clean, restored },
  );

  // ─── P31-11 · Zoom real del navegador al 200 % ───
  const zoomClient = await page.createCDPSession();
  await zoomClient.send('Emulation.setPageScaleFactor', {
    pageScaleFactor: 2,
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const zoomed = await page.evaluate(() => {
    const viewport = window.visualViewport;
    const dock = document.getElementById('eye-mission-dock');
    const visible = (element) =>
      Boolean(element?.getClientRects().length) &&
      getComputedStyle(element).visibility !== 'hidden';
    const measureTarget = (element) => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        label:
          element.getAttribute('aria-label') ||
          element.textContent?.trim() ||
          element.id,
        width: box.width,
        height: box.height,
        inside:
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= viewport.width + 1 &&
          box.bottom <= viewport.height + 1,
        hit: Boolean(hit && (hit === element || element.contains(hit))),
      };
    };
    const dockTargets = [...dock.querySelectorAll('button')]
      .filter(visible)
      .map(measureTarget);
    const globeTargets = [
      ...document.querySelectorAll('.eye-instruments button'),
    ]
      .filter(visible)
      .map(measureTarget);
    const creditTargets = [
      ...document.querySelectorAll(
        '.cesium-widget-credits a, #cesium-credits a, .cesium-credit-expand-link',
      ),
    ]
      .filter(visible)
      .map(measureTarget);
    const essentialText = [
      ...dock.querySelectorAll(
        '.eye-dock-kicker, .eye-dock-title, .eye-dock-tab, .eye-dock-action, .eye-dock-key dt, .eye-dock-key dd',
      ),
    ]
      .filter(visible)
      .map((element) => ({
        text: element.textContent?.trim() || element.className,
        size: Number.parseFloat(getComputedStyle(element).fontSize),
      }));
    const box = dock.getBoundingClientRect();
    return {
      scale: viewport?.scale ?? null,
      viewport: {
        width: viewport?.width ?? null,
        height: viewport?.height ?? null,
      },
      dockInside:
        box.left >= -1 &&
        box.top >= -1 &&
        box.right <= viewport.width + 1 &&
        box.bottom <= viewport.height + 1,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      dockTargets,
      globeTargets,
      creditTargets,
      essentialText,
    };
  });
  check(
    'p31-11-browser-zoom-200-preserves-layout-hits-and-legibility',
    zoomed.scale === 2 &&
      zoomed.dockInside &&
      zoomed.overflowX <= 0 &&
      zoomed.dockTargets.length > 0 &&
      zoomed.dockTargets.every(
        (target) =>
          target.inside &&
          target.hit &&
          target.width >= 44 &&
          target.height >= 44,
      ) &&
      zoomed.globeTargets.length > 0 &&
      zoomed.globeTargets.every((target) => target.inside && target.hit) &&
      zoomed.creditTargets.length > 0 &&
      zoomed.creditTargets.every((target) => target.inside && target.hit) &&
      zoomed.essentialText.length > 0 &&
      zoomed.essentialText.every((entry) => entry.size >= 13),
    zoomed,
    'A11Y',
  );
  await shot(page, 'p31-zoom-200');
  await zoomClient.send('Emulation.setPageScaleFactor', {
    pageScaleFactor: 1,
  });
  await zoomClient.detach();

  // ─── P31-12 · Geometría y alcance en los cinco anchos reales ───
  const geometry = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewport({
      width: viewport.width,
      height: viewport.height,
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      deviceScaleFactor: 1,
    });
    // Cambiar `isMobile`/`hasTouch` reinicia el renderizador: la aplicación
    // vuelve a arrancar y la portada de carga tapa la pantalla entera. Medir
    // durante ese arranque decía que NINGÚN control era alcanzable, cuando el
    // único que estorbaba era `#loading-screen`. Se espera a que la aplicación
    // esté lista otra vez antes de tomar ninguna medida.
    await page.waitForFunction(
      () =>
        window.__eyeinsky &&
        window.__godsEyeView?.viewer &&
        document.querySelector('#loading-screen')?.classList.contains('hidden'),
      { timeout: 120_000 },
    );
    await page.waitForSelector('#eye-mission-dock .eye-dock-rail', {
      timeout: 30_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 450));
    const measured = await page.evaluate(() => {
      const dock = document.getElementById('eye-mission-dock');
      const box = dock.getBoundingClientRect();
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element || element.hidden || !element.getClientRects().length)
          return null;
        const found = element.getBoundingClientRect();
        return {
          left: found.left,
          top: found.top,
          right: found.right,
          bottom: found.bottom,
        };
      };
      const intersects = (a, b) =>
        Boolean(a && b) &&
        a.left < b.right &&
        b.left < a.right &&
        a.top < b.bottom &&
        b.top < a.bottom;
      const controls = [...dock.querySelectorAll('button')].filter(
        (button) => !button.hidden && button.getClientRects().length,
      );
      const smallest = controls.reduce((min, button) => {
        const found = button.getBoundingClientRect();
        return Math.min(min, Math.min(found.width, found.height));
      }, Infinity);
      const unreachable = controls
        .map((button) => {
          const found = button.getBoundingClientRect();
          const top = document.elementFromPoint(
            Math.round(found.left + found.width / 2),
            Math.round(found.top + found.height / 2),
          );
          if (top && (button === top || button.contains(top))) return null;
          // Nombrar QUIÉN se queda con el toque; «no alcanzable» a secas no
          // permite arreglar nada.
          return {
            control: button.getAttribute('aria-label') || button.className,
            blockedBy: top
              ? `${top.tagName.toLowerCase()}${top.id ? `#${top.id}` : ''}${
                  top.className ? `.${String(top.className).split(' ')[0]}` : ''
                }`
              : 'nada en ese punto',
          };
        })
        .filter(Boolean);
      const dockRect = {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      };
      const loader = document.getElementById('loading-screen');
      const loaderStyle = loader ? getComputedStyle(loader) : null;
      return {
        loader: {
          className: loader?.className ?? null,
          pointerEvents: loaderStyle?.pointerEvents ?? null,
          visibility: loaderStyle?.visibility ?? null,
        },
        width: Math.round(box.width),
        height: Math.round(box.height),
        insideViewport:
          box.right <= window.innerWidth + 1 &&
          box.bottom <= window.innerHeight + 1 &&
          box.left >= -1,
        // Deja libre al menos un tercio de la altura para arrastrar el globo.
        globeHeadroom: Math.round(box.top),
        headroomRatio: Number((box.top / window.innerHeight).toFixed(2)),
        smallestControl: Number.isFinite(smallest) ? Math.round(smallest) : null,
        unreachable,
        hitsInstruments: intersects(dockRect, rect('.eye-instruments')),
        hitsAddLayer: intersects(dockRect, rect('[data-eye-active-add]')),
      };
    });
    geometry.push({ viewport: viewport.id, ...measured });
    await shot(page, `p31-dock-${viewport.id}`);
  }
  check(
    'p31-12-dock-geometry-holds-across-five-viewports',
    geometry.every(
      (row) =>
        row.insideViewport &&
        row.unreachable.length === 0 &&
        row.smallestControl >= 44 &&
        row.headroomRatio >= 0.33 &&
        !row.hitsInstruments &&
        !row.hitsAddLayer,
    ),
    geometry,
  );

  // ─── P31-13 · Desmontar y remontar deja un solo dueño de eventos ───
  const teardown = await page.evaluate(async () => {
    const { mountEyeMissionDock } = await import(
      '/src/ui/eyeinskyMissionDock.js'
    );
    const frame = document.createElement('iframe');
    frame.hidden = true;
    document.body.append(frame);
    await new Promise((resolve) => {
      if (frame.contentDocument?.readyState === 'complete') resolve();
      else frame.addEventListener('load', resolve, { once: true });
    });
    const host = frame.contentDocument.createElement('section');
    frame.contentDocument.body.append(host);
    const view = {
      visible: true,
      expanded: false,
      contextKey: 'earth:view',
      contextKind: 'view',
      generation: 1,
      title: 'Vista · Tierra',
      kicker: 'VISTA / TIERRA',
      status: 'ready',
      observedAt: null,
      localUpdatedAt: null,
      keyValues: [],
      pane: 'objetivo',
      panes: [
        { id: 'objetivo', label: 'Objetivo', badge: null },
        { id: 'ops', label: 'OPS', badge: null },
      ],
      camera: {
        id: 'free',
        label: 'CÁMARA / LIBRE',
        detail: 'Sin objetivo seleccionado.',
      },
      actions: [
        {
          id: 'north',
          label: 'Norte',
          enabled: true,
          pressed: false,
          hint: 'Orientar al norte',
        },
        {
          id: 'more',
          label: 'Más',
          enabled: true,
          pressed: false,
          hint: 'Abrir detalle',
        },
      ],
    };
    let oldCalls = 0;
    let newCalls = 0;
    const old = mountEyeMissionDock({
      host,
      onAction: () => {
        oldCalls += 1;
      },
    });
    old.update(view);
    old.destroy();
    const fresh = mountEyeMissionDock({
      host,
      onAction: () => {
        newCalls += 1;
      },
    });
    fresh.update(view);
    host.querySelector('[data-eye-dock-action="north"]')?.click();
    fresh.destroy();
    frame.remove();
    return { oldCalls, newCalls };
  });
  check(
    'p31-12b-destroyed-dock-releases-every-event-listener',
    teardown.oldCalls === 0 && teardown.newCalls === 1,
    teardown,
  );

  // ─── P31-14 · Ningún error de página ni petición rota durante el recorrido ───
  check(
    'p31-13-no-page-errors',
    result.pageErrors.length === 0,
    result.pageErrors,
  );
} finally {
  await browser.close();
  await fs.rm(profile, { recursive: true, force: true });
  result.finishedAt = new Date().toISOString();
  result.passed = result.checks.filter((entry) => entry.ok).length;
  result.failed = result.checks.length - result.passed;
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\n${result.passed} ok · ${result.failed} fallan → ${resultPath}`);
}
if (result.failed > 0) process.exitCode = 1;
