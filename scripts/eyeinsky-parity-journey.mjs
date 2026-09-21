import fs from 'node:fs/promises';
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://127.0.0.1:4197/';
const out = process.argv[3] || 'output/eyeinsky-parity';
await fs.mkdir(out, { recursive: true });
const result = {
  url,
  startedAt: new Date().toISOString(),
  checks: [],
  errors: [],
  failedRequests: [],
  live: {},
};
const check = (id, ok, detail) =>
  result.checks.push({ id, ok: Boolean(ok), detail });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

let page;
try {
  page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.__eyeMediaPlayEvents = 0;
    document.addEventListener(
      'play',
      () => {
        window.__eyeMediaPlayEvents += 1;
      },
      true,
    );
  });
  await page.setViewport({ width: 1440, height: 960 });
  page.on('pageerror', (error) =>
    result.errors.push(String(error?.stack || error)),
  );
  page.on('requestfailed', (request) =>
    result.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText,
    }),
  );
  const ready = () =>
    page.waitForFunction(
      () =>
        window.__eyeinsky &&
        window.__godsEyeView &&
        document.querySelector('#loading-screen')?.classList.contains('hidden'),
      { timeout: 90000 },
    );
  const openView = async (view) => {
    const commandLabels = {
      signals: 'Ver señales USGS',
      operations: 'Guardar una operación',
      catalog: 'Catálogo de fuentes',
      display: 'Apariencia y destinos',
      director: 'Director de escenas',
      sensors: 'Cámaras y radio',
      preferences: 'Voz y preferencias',
    };
    if (commandLabels[view]) {
      await page.click('#eye-command-open');
      await page.type('#eye-command-search', commandLabels[view]);
      await page.waitForSelector('#eye-command-list [data-eye-action]');
      await page.click('#eye-command-list [data-eye-action]');
    } else {
      await page.click(`[data-eye-view="${view}"]`);
    }
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-eye-panel="${id}"]`)?.hidden,
      { timeout: 10000 },
      view,
    );
  };
  const enableLayer = async (id, { requireData = true } = {}) => {
    await openView('catalog');
    await page.evaluate((layerId) => {
      document
        .querySelector(`#data-toggles [data-layer-id="${layerId}"]`)
        ?.scrollIntoView({ block: 'center' });
    }, id);
    const rowSelector = `#data-toggles [data-layer-id="${id}"]`;
    await page.waitForSelector(`${rowSelector} .data-toggle-btn`);
    const alreadyEnabled = await page.evaluate(
      (layerId) => window.__godsEyeView.dataManager.isEnabled(layerId),
      id,
    );
    if (!alreadyEnabled) await page.click(`${rowSelector} .data-toggle-btn`);
    await page.waitForFunction(
      (layerId) => window.__godsEyeView.dataManager.isEnabled(layerId),
      { timeout: 90000 },
      id,
    );
    if (requireData) {
      await page.waitForFunction(
        (layerId) => {
          const layer = window.__godsEyeView.dataManager
            .getAll()
            .find((entry) => entry.id === layerId);
          return layer?.stats?.count > 0 || Boolean(layer?.stats?.error);
        },
        { timeout: 90000 },
        id,
      );
    }
    const snapshot = await page.evaluate((layerId) => {
      const manager = window.__godsEyeView.dataManager;
      const layer = manager.getAll().find((entry) => entry.id === layerId);
      return {
        enabled: manager.isEnabled(layerId),
        stats: layer?.stats || null,
      };
    }, id);
    result.live[id] = snapshot;
    check(
      `layer-${id}-live`,
      snapshot.enabled && (!requireData || snapshot.stats?.count > 0),
      snapshot,
    );
    return snapshot;
  };

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await ready();

  await openView('display');
  for (const id of ['osm', 'esri-imagery']) {
    await page.evaluate((stackId) => {
      document
        .querySelector(`[data-stack-id="${stackId}"]`)
        ?.scrollIntoView({ block: 'center' });
    }, id);
    await page.click(`[data-stack-id="${id}"]`);
    await page.waitForFunction(
      (stackId) =>
        window.__godsEyeView.mapStackController.getActiveId() === stackId,
      { timeout: 30000 },
      id,
    );
    check(
      `map-${id}-ui`,
      await page.evaluate(
        (stackId) =>
          window.__godsEyeView.mapStackController.getActiveId() === stackId,
        id,
      ),
    );
  }

  const beforeSearch = await page.evaluate(() =>
    window.__godsEyeView.styleManager.getCameraState(),
  );
  await page.click('#location-search');
  await page.type('#location-search', '19.4326, -99.1332');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => {
      const camera = window.__godsEyeView.styleManager.getCameraState();
      return (
        !document
          .querySelector('#location-search')
          ?.classList.contains('searching') &&
        Math.abs(camera.lat - 19.4326) < 0.2 &&
        Math.abs(camera.lon + 99.1332) < 0.2
      );
    },
    { timeout: 60000 },
  );
  const afterSearch = await page.evaluate(() =>
    window.__godsEyeView.styleManager.getCameraState(),
  );
  check(
    'location-search-ui',
    Math.abs(afterSearch.lat - 19.4326) < 1 &&
      Math.abs(afterSearch.lon + 99.1332) < 1 &&
      (Math.abs(afterSearch.lat - beforeSearch.lat) > 0.1 ||
        Math.abs(afterSearch.lon - beforeSearch.lon) > 0.1),
    { before: beforeSearch, after: afterSearch },
  );

  for (const id of ['flights', 'satellites', 'radio']) await enableLayer(id);

  await openView('signals');
  await page.waitForFunction(() => window.__eyeinsky.rows.length > 0, {
    timeout: 90000,
  });
  result.live.earthquakes = await page.evaluate(() => ({
    rows: window.__eyeinsky.rows.length,
    stats: window.__godsEyeView.dataManager.layers
      .get('earthquakes')
      .module.getStats(),
  }));
  check(
    'layer-earthquakes-live',
    result.live.earthquakes.rows > 0,
    result.live.earthquakes,
  );

  const tracked = await page.evaluate(() => {
    const module =
      window.__godsEyeView.dataManager.layers.get('flights').module;
    const target = module.getAllPositions(100)[0];
    if (!target) return null;
    const accepted = module.trackById(target.id, { origin: 'user' });
    return {
      id: target.id,
      accepted,
      tracked: module.getTrackedInfo()?.icao24 || null,
      viewerTracked:
        window.__godsEyeView.viewer.trackedEntity?.gevTrackedId || null,
    };
  });
  check(
    'aviation-selection-and-tracking',
    tracked?.accepted &&
      tracked.tracked === tracked.id &&
      tracked.viewerTracked?.endsWith(tracked.id),
    tracked,
  );

  await openView('preferences');
  await page.click('#global-context-flights-btn');
  await page.waitForFunction(
    () => !document.querySelector('#cockpit-entry')?.hidden,
    { timeout: 30000 },
  );
  await page.click('#cockpit-entry');
  await page.waitForFunction(
    () => document.body.classList.contains('cockpit-mode'),
    {
      timeout: 30000,
    },
  );
  check(
    'cockpit-entry-ui',
    await page.evaluate(() => document.body.classList.contains('cockpit-mode')),
  );
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.body.classList.contains('cockpit-mode'),
  );
  check(
    'cockpit-exit-escape',
    await page.evaluate(
      () => !document.body.classList.contains('cockpit-mode'),
    ),
  );
  await page.click('#global-context-flights-btn');
  await page.waitForFunction(
    () =>
      document
        .querySelector('#global-context-flights-btn')
        ?.getAttribute('aria-selected') === 'false',
    { timeout: 90000 },
  );

  check(
    'media-does-not-autoplay',
    await page.evaluate(() => {
      const radio = window.__godsEyeView.dataManager.layers.get('radio').module;
      return window.__eyeMediaPlayEvents === 0 && !radio.getStats().playing;
    }),
  );

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await ready();
  const requestedLayers = ['flights', 'satellites', 'radio'];
  for (const id of requestedLayers) await enableLayer(id);
  await openView('operations');
  await page.type('#eye-operation-name', 'Paridad multicapas');
  const savedView = await page.evaluate(() => window.__eyeinsky.readView());
  await page.click('#eye-operation-save');
  await page.waitForFunction(() =>
    document
      .querySelector('#eye-operation-status')
      ?.textContent.includes('Guardado'),
  );
  check(
    'operation-saves-non-usgs-layers',
    requestedLayers.every((id) => savedView.layers.includes(id)),
    savedView.layers,
  );

  await page.evaluate(() => {
    const operation = localStorage.getItem('eyeinsky.operations.v1');
    localStorage.clear();
    if (operation) localStorage.setItem('eyeinsky.operations.v1', operation);
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
  await ready();
  await openView('operations');
  await page.click('[data-operation-action="open"]');
  await page.waitForFunction(
    () =>
      document
        .querySelector('#eye-operation-status')
        ?.textContent.includes('Operación abierta'),
    { timeout: 150000 },
  );
  const restored = await page.evaluate(() => ({
    layers: window.__eyeinsky.readView().layers,
    states: Object.fromEntries(
      ['flights', 'satellites', 'cctv', 'radio'].map((id) => [
        id,
        window.__godsEyeView.dataManager.getLayerLifecycleState(id),
      ]),
    ),
  }));
  result.restored = restored;
  check(
    'operation-restores-non-usgs-layers',
    requestedLayers.every(
      (id) => restored.layers.includes(id) && restored.states[id]?.enabled,
    ),
    restored,
  );

  await page.screenshot({ path: `${out}/parity-desktop.png` });
  await page.setViewport({ width: 390, height: 844 });
  await openView('operations');
  await page.evaluate(() => {
    document.querySelector('.eye-workspace-content').scrollTop = 118;
  });
  await openView('catalog');
  const mobile = await page.evaluate(() => {
    const content = document.querySelector('.eye-workspace-content');
    const panel = document.querySelector('[data-eye-panel="catalog"]');
    return {
      scrollTop: content.scrollTop,
      panelTop: panel.getBoundingClientRect().top,
      contentTop: content.getBoundingClientRect().top,
      disabledFieldsets: document.querySelectorAll(
        '#eye-sensor-host fieldset:disabled,#eye-context-host fieldset:disabled',
      ).length,
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  check(
    'mobile-panel-scroll-and-enabled-controls',
    mobile.scrollTop === 0 &&
      mobile.disabledFieldsets === 0 &&
      mobile.documentOverflow <= 1 &&
      mobile.panelTop >= mobile.contentTop,
    mobile,
  );
  await page.click('#eye-help');
  await page.keyboard.press('Escape');
  check(
    'dialog-escape-restores-focus',
    await page.evaluate(() => document.activeElement?.id === 'eye-help'),
  );
  await page.screenshot({ path: `${out}/parity-mobile.png` });

  check('no-page-errors', result.errors.length === 0, result.errors);
  result.status = result.checks.every((entry) => entry.ok) ? 'pass' : 'fail';
} catch (error) {
  result.status = 'error';
  result.error = String(error?.stack || error);
  await page
    ?.screenshot({ path: `${out}/parity-journey-failure.png` })
    .catch(() => {});
} finally {
  result.endedAt = new Date().toISOString();
  await browser.close();
  await fs.writeFile(
    `${out}/parity-journey.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
}
if (result.status !== 'pass') process.exitCode = 1;
