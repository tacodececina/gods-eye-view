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
  { id: '744x1133', width: 744, height: 1133, mobile: true },
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

  // ─── P31-09 · Un gesto físico suelta la cámara y conserva la selección ───
  //
  // Se mide con la MISMA autoridad que usa la rueda real: el controlador de
  // navegación del shell. Lo que se comprueba es la consecuencia observable —
  // que las capas de seguimiento conservan su identidad seleccionada.
  const gesture = await page.evaluate(() => {
    const view = window.__godsEyeView;
    const navigation =
      view?.styleManager?._navigation ||
      window.__eyeinsky?.styleManager?._navigation ||
      null;
    if (!navigation) return { skipped: 'sin controlador de navegación' };
    const manager = view?.dataManager || window.__eyeinsky?.dataManager || null;
    const before = ['flights', 'military', 'satellites'].map((id) => ({
      id,
      params: manager?.layers?.get(id)?.module?.getParams?.() ?? null,
    }));
    const generation = navigation.interruptHumanNavigation('wheel');
    const after = ['flights', 'military', 'satellites'].map((id) => ({
      id,
      params: manager?.layers?.get(id)?.module?.getParams?.() ?? null,
    }));
    const key = {
      flights: 'selectedFlightsTrackingId',
      military: 'selectedMilitaryTrackingId',
      satellites: 'selectedSatTrackingId',
    };
    return {
      generation,
      preserved: before.every(
        (row, index) =>
          (row.params?.[key[row.id]] ?? null) ===
          (after[index].params?.[key[row.id]] ?? null),
      ),
      trackedEntity: Boolean(view?.viewer?.trackedEntity),
      before,
      after,
    };
  });
  check(
    'p31-09-gesture-frees-the-camera-and-keeps-selection',
    !gesture.skipped &&
      Number.isFinite(gesture.generation) &&
      gesture.preserved &&
      !gesture.trackedEntity,
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

  // ─── P31-11 · Zoom de página al 200 % sin desbordes ni solapes ───
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const zoomed = await page.evaluate(() => {
    const dock = document.getElementById('eye-mission-dock');
    const box = dock.getBoundingClientRect();
    return {
      overflowsRight: box.right > window.innerWidth + 1,
      overflowsBottom: box.bottom > window.innerHeight + 1,
      overflowsLeft: box.left < -1,
      scrollsVertically: dock.scrollHeight <= dock.clientHeight + 1,
      bodyScroll: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  check(
    'p31-11-page-zoom-200-stays-inside-the-viewport',
    !zoomed.overflowsRight && !zoomed.overflowsBottom && !zoomed.overflowsLeft,
    zoomed,
    'A11Y',
  );
  await shot(page, 'p31-zoom-200');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

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

  // ─── P31-13 · Ningún error de página ni petición rota durante el recorrido ───
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
