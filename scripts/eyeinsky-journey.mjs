import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2',
  url = process.env.EYE_URL || 'http://127.0.0.1:4194/';
await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const result = {
  at: new Date().toISOString(),
  url,
  conditions: {
    viewport: '1440x960 DPR1',
    renderer: 'Chrome headless SwiftShader',
    network: 'Live USGS; uncontrolled network; fresh browser context',
    node: process.version,
    cpu: os.cpus()[0].model,
  },
  checks: [],
  errors: [],
  requestsFailed: [],
  screenshots: [],
};
const check = (label, ok, detail) => {
  result.checks.push({ label, ok, detail });
  assert.ok(ok, label);
};
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => result.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') result.errors.push(m.text());
  });
  page.on('requestfailed', (r) =>
    result.requestsFailed.push({ url: r.url(), error: r.failure() }),
  );
  const ready = async () =>
    page.waitForFunction(
      () =>
        window.__eyeinsky &&
        document.querySelector('#loading-screen').classList.contains('hidden'),
      { timeout: 60000 },
    );
  const shot = async (name) => {
    await page.screenshot({ path: `${out}/${name}.png` });
    result.screenshots.push(`${name}.png`);
  };
  const started = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await ready();
  result.readyMs = Date.now() - started;
  await new Promise((r) => setTimeout(r, 4000));
  result.resources = await page.evaluate(() => ({
    requests: performance.getEntriesByType('resource').length,
    transfer: performance
      .getEntriesByType('resource')
      .reduce((n, r) => n + r.transferSize, 0),
    heap: performance.memory?.usedJSHeapSize,
    renderer: window.__godsEyeView.viewer.scene.context._gl.getParameter(
      window.__godsEyeView.viewer.scene.context._gl.getExtension(
        'WEBGL_debug_renderer_info',
      )?.UNMASKED_RENDERER_WEBGL || 7937,
    ),
  }));
  await shot('journey-home-1440');
  check(
    'one Cesium canvas',
    (await page.$$eval('.cesium-widget canvas', (n) => n.length)) === 1,
  );
  // Fase visual (V-01/V-02, reparación T5): en reposo el carril de cámara
  // espera a la primera interacción; se revela como lo haría la persona
  // (rueda mínima lejos del centro) antes de medir el zoom. Criterio igual.
  await page.mouse.move(1440 * 0.3, 960 * 0.4);
  await page.mouse.wheel({ deltaY: 1 });
  await page.waitForFunction(() => document.body.dataset.eyeReveal !== 'rest');
  await new Promise((r) => setTimeout(r, 900));
  const before = await page.evaluate(() =>
    window.__godsEyeView.styleManager.getCameraState(),
  );
  await page.click('#eye-zoom-in');
  // Espera acotada (no sleep fijo): con SwiftShader cargado el vuelo tarda más.
  const zoomed = await page
    .waitForFunction(
      (alt) => window.__godsEyeView.styleManager.getCameraState().alt < alt,
      { timeout: 8000 },
      before.alt,
    )
    .then(() => true)
    .catch(() => false);
  check('zoom changes real camera altitude', zoomed);
  await page.click('#eye-home');
  await new Promise((r) => setTimeout(r, 1100));
  // Ruta real a Señales desde el rediseño P0-P2: el dock de funciones
  // lleva a Instrumentos y desde ahí se abre el registro sísmico.
  await page.click('.eye-function-dock [data-eye-view="instruments"]');
  await page.click('#eye-connect');
  await page.waitForFunction(() => window.__eyeinsky.rows.length >= 2, {
    timeout: 60000,
  });
  result.live = await page.evaluate(() => ({
    ids: window.__eyeinsky.rows.map((r) => r.id),
    count: window.__eyeinsky.rows.length,
    stats: window.__godsEyeView.dataManager.layers
      .get('earthquakes')
      .module.getStats(),
    source:
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    semantics: 'all_day filtered at source M2.5+, 24h',
  }));
  const ids = await page.$$eval('#eye-signal-list button', (bs) =>
    bs.slice(0, 2).map((b) => b.dataset.signalId),
  );
  for (const id of ids) {
    await page.click(`[data-signal-id="${id}"]`);
    await new Promise((r) => setTimeout(r, 1000));
    check(
      `list, globe and inspector agree: ${id}`,
      await page.evaluate(
        (id) =>
          window.__eyeinsky.selectedId === id &&
          window.__godsEyeView.viewer.selectedEntity?.properties?.usgsId?.getValue() ===
            id &&
          document
            .querySelector('#eye-dock-panel-objetivo')
            .textContent.includes(id),
        id,
      ),
    );
  }
  await shot('journey-inspector-1440');
  await page.select('#eye-filter-hours', '6');
  await page.select('#eye-filter-mag', '2.5');
  // Operación vive bajo Más desde el rediseño P0-P2.
  await page.click('.eye-function-dock [data-eye-view="more"]');
  await page.click('[data-eye-panel="more"] [data-eye-view="operations"]');
  await page.type('#eye-operation-name', 'Prueba Pacífico real');
  await page.type(
    '#eye-operation-note',
    'NOTA PRIVADA <img src=x onerror=alert(1)> revisión',
  );
  const savedView = await page.evaluate(() => window.__eyeinsky.readView());
  await page.click('#eye-operation-save');
  await page.waitForFunction(() =>
    document
      .querySelector('#eye-operation-status')
      .textContent.includes('Guardado'),
  );
  result.saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records[0],
  );
  check(
    'private note rendered as text',
    (await page.$('#eye-note-history img')) === null,
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  // Operación vive bajo Más desde el rediseño P0-P2.
  await page.click('.eye-function-dock [data-eye-view="more"]');
  await page.click('[data-eye-panel="more"] [data-eye-view="operations"]');
  await page.click('[data-operation-action="open"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('#eye-operation-status')
        .textContent.includes('Operación abierta'),
    { timeout: 60000 },
  );
  await new Promise((r) => setTimeout(r, 1100));
  const restored = await page.evaluate(() => ({
    view: window.__eyeinsky.readView(),
    notes: document.querySelector('#eye-note-history').textContent,
    records: JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records,
  }));
  result.restored = restored;
  check(
    'reload restores filters',
    JSON.stringify(restored.view.filters) === JSON.stringify(savedView.filters),
  );
  check(
    'reload restores camera',
    Math.abs(restored.view.camera.lat - savedView.camera.lat) < 0.001 &&
      Math.abs(restored.view.camera.lon - savedView.camera.lon) < 0.001 &&
      Math.abs(restored.view.camera.alt - savedView.camera.alt) < 5,
  );
  check(
    'note original timestamp survives reload',
    restored.records[0].notes[0].createdAt === result.saved.notes[0].createdAt,
  );
  check(
    'private note survives reload as text',
    restored.notes.includes('NOTA PRIVADA <img'),
  );
  await page.click('[data-operation-action="rename"]');
  await page.focus('#eye-dialog input');
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyA');
  await page.keyboard.up('Control');
  await page.keyboard.type('Pacífico revisado');
  await page.click('#eye-dialog-confirm');
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records[0]
        .name === 'Pacífico revisado',
  );
  check(
    'rename saved',
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records[0]
          .name === 'Pacífico revisado',
    ),
  );
  // Fase visual T3 paso 8 (reparación T5): Compartir vive en Más (y en la
  // paleta de acciones), ya no en la línea de telemetría. Se llega por Más y
  // se vuelve a Operación para seguir con el registro.
  await page.click('.eye-function-dock [data-eye-view="more"]');
  await page.click('#eye-share');
  const share = await page.$eval('#eye-dialog textarea', (e) => e.value);
  result.publicLink = share;
  check(
    'shared link excludes private note and operation name',
    !decodeURIComponent(share).includes('NOTA PRIVADA') &&
      !decodeURIComponent(share).includes('Pacífico revisado'),
  );
  await shot('journey-private-share');
  await page.click('#eye-dialog-cancel');
  await page.click('[data-eye-panel="more"] [data-eye-view="operations"]');
  await page.click('[data-operation-action="delete"]');
  await page.click('#eye-dialog-cancel');
  check(
    'delete cancellation preserves record',
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records
          .length === 1,
    ),
  );
  await page.click('[data-operation-action="delete"]');
  await page.click('#eye-dialog-confirm');
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records
        .length === 0,
  );
  check(
    'confirmed delete removes record',
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('eyeinsky.operations.v1')).records
          .length === 0,
    ),
  );
  await page.click('#eye-mission-dock-close');
  await page.click('#eye-panel-close');
  await page.click('#eye-home');
  await new Promise((r) => setTimeout(r, 1100));
  for (const width of [360, 390, 768, 1440, 1920]) {
    await page.setViewport({
      width,
      height: width < 650 ? 844 : 960,
      deviceScaleFactor: 1,
    });
    await new Promise((r) => setTimeout(r, 250));
    await page.click('#eye-home');
    await new Promise((r) => setTimeout(r, 1100));
    await shot(`responsive-${width}`);
    const geometry = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: innerWidth,
      buttons: [
        ...document.querySelectorAll(
          '.eye-header button,.eye-instruments button',
        ),
      ]
        .filter((b) => b.getClientRects().length)
        .map((b) => ({
          label: b.getAttribute('aria-label') || b.textContent.trim(),
          x: b.getBoundingClientRect().x,
          y: b.getBoundingClientRect().y,
          w: b.getBoundingClientRect().width,
          h: b.getBoundingClientRect().height,
        })),
    }));
    check(
      `geometry ${width}`,
      geometry.scroll <= geometry.inner &&
        geometry.buttons.every(
          (b) => b.x >= 0 && b.x + b.w <= width + 1 && b.w >= 44 && b.h >= 44,
        ),
      geometry,
    );
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  // P3.1: en 390 px el Mission Dock tapa el dock de funciones; se cierra antes.
  if (await page.$eval('#eye-mission-dock', (e) => !e.hidden)) {
    await page.click('#eye-mission-dock-close');
    await new Promise((r) => setTimeout(r, 800));
  }
  // Ruta real a Señales desde el rediseño P0-P2: el dock de funciones
  // lleva a Instrumentos y desde ahí se abre el registro sísmico.
  await page.click('.eye-function-dock [data-eye-view="instruments"]');
  await page.click('#eye-connect');
  await page.waitForSelector('#eye-signal-list button');
  await page.click('#eye-signal-list button');
  await new Promise((r) => setTimeout(r, 1100));
  await shot('mobile-inspector-390');
  check(
    'mobile inspector and sheet close work',
    await page.$eval('#eye-mission-dock', (e) => !e.hidden),
  );
  await page.click('#eye-mission-dock-close');
  // P3.1: en móvil cerrar la ficha vuelve a inicio (closeInspector → explore,
  // foco en #eye-home), no a la lista; antes se esperaba la lista de vuelta.
  check(
    'mobile close returns home',
    await page.evaluate(
      () =>
        document.getElementById('eye-workspace').hidden &&
        document.activeElement?.id === 'eye-home',
    ),
  );
  if (await page.$eval('#eye-workspace', (e) => !e.hidden))
    await page.click('#eye-panel-close');
  await page.click('#eye-help');
  await page.keyboard.press('Escape');
  check(
    'dialog returns focus',
    await page.evaluate(() => document.activeElement.id === 'eye-help'),
  );
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await page.click('#eye-home');
  await page.click('#eye-grid');
  check(
    'reduced motion + grid',
    await page.$eval(
      '#eye-grid',
      // §1.1: la retícula arranca apagada; el clic la enciende.
      (e) => e.getAttribute('aria-pressed') === 'true',
    ),
  );
  await page.click('#eye-clean');
  check(
    'clean view exits by keyboard',
    await page.$eval('#eye-clean-exit', (e) => !e.hidden),
  );
  await page.keyboard.press('Escape');
  // Browser zoom 200% equivalent: 1440x960 physical pixels, 720x480 CSS viewport.
  await page.setViewport({ width: 720, height: 480, deviceScaleFactor: 2 });
  await page.click('#eye-home');
  await shot('zoom-200');
  check(
    '200% equivalent layout keeps navigation and instruments reachable',
    await page.$$eval('.eye-header button,.eye-instruments button', (buttons) =>
      buttons.every((b) => {
        const r = b.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth + 1 &&
          r.top >= 0 &&
          r.bottom <= innerHeight
        );
      }),
    ),
  );
  check('no script errors', result.errors.length === 0, result.errors);
} catch (error) {
  result.failure = String(error.stack || error);
  console.error(result.failure);
  if (page) await page.screenshot({ path: `out-failure.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await fs.writeFile(
    `${out}/golden-journey.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      checks: result.checks.length,
      passed: result.checks.filter((c) => c.ok).length,
      errors: result.errors,
      failure: result.failure,
      readyMs: result.readyMs,
    }),
  );
  await browser.close();
}
