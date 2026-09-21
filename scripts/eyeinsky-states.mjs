import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2';
const source =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
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
  kind: 'DETERMINISTIC FIXTURES, NOT LIVE EVIDENCE',
  checks: [],
  console: [],
  failedRequests: [],
};
const check = (name, ok, detail) => {
  result.checks.push({ name, ok, detail });
  assert.ok(ok, name);
};
let page;
try {
  page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  page.on('console', (m) => {
    if (m.type() === 'error') result.console.push(m.text());
  });
  page.on('pageerror', (e) => result.console.push(String(e)));
  page.on('requestfailed', (r) =>
    result.failedRequests.push({ url: r.url(), error: r.failure() }),
  );
  let mode = 'ready',
    pending = [];
  const fixture = () => ({
    type: 'FeatureCollection',
    features: [
      ['fixture-a', 4, 23, -102],
      ['fixture-b', 5, 34, -118],
    ].map(([id, mag, lat, lon]) => ({
      type: 'Feature',
      id,
      properties: {
        mag,
        place: `PRUEBA ${id} <img src=x onerror=alert(1)>`,
        time: Date.now() - 60000,
        updated: Date.now(),
        url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
      },
      geometry: { type: 'Point', coordinates: [lon, lat, 12] },
    })),
  });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.url() !== source) {
      void r.continue();
      return;
    }
    const send = () =>
      r.respond({
        status: mode === 'error' ? 503 : 200,
        contentType: 'application/json',
        body: JSON.stringify(
          mode === 'empty'
            ? { type: 'FeatureCollection', features: [] }
            : fixture(),
        ),
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    if (mode === 'hold') pending.push(() => send().catch(() => {}));
    else void send();
  });
  await page.goto(process.env.EYE_URL || 'http://127.0.0.1:4194/');
  await page.waitForFunction(
    () =>
      window.__eyeinsky &&
      document.querySelector('#loading-screen').classList.contains('hidden'),
  );
  mode = 'hold';
  // Ruta real a Señales desde el rediseño P0-P2: el dock de funciones
  // lleva a Instrumentos y desde ahí se abre el registro sísmico.
  await page.click('.eye-function-dock [data-eye-view="instruments"]');
  await page.click('#eye-connect');
  await page.waitForFunction(() =>
    document
      .querySelector('#eye-feed-status')
      .textContent.includes('Consultando'),
  );
  check('loading is visible while source is pending', true);
  mode = 'ready';
  for (const send of pending.splice(0)) await send();
  await page.waitForFunction(() => window.__eyeinsky.rows.length === 2);
  await page.waitForFunction(
    () => !document.querySelector('#eye-refresh').disabled,
  );
  check(
    'provider text cannot create markup',
    (await page.$('#eye-signal-list img')) === null,
  );
  mode = 'error';
  await page.click('#eye-refresh');
  await page.waitForFunction(() =>
    document
      .querySelector('#eye-source-state')
      .textContent.includes('datos anteriores'),
  );
  check(
    'failure preserves two stale records',
    await page.evaluate(() => window.__eyeinsky.rows.length === 2),
  );
  await page.screenshot({ path: `out/state-stale.png` }).catch(() => {});
  await page.screenshot({ path: `${out}/state-stale.png` });
  mode = 'empty';
  await page.click('#eye-refresh');
  await page.waitForFunction(() =>
    document
      .querySelector('#eye-source-state')
      .textContent.includes('Sin eventos'),
  );
  check(
    'successful empty response is distinct from error',
    await page.evaluate(() => window.__eyeinsky.rows.length === 0),
  );
  mode = 'ready';
  await page.click('#eye-refresh');
  await page.waitForFunction(() => window.__eyeinsky.rows.length === 2);
  await page.select('#eye-filter-mag', '6');
  check(
    'empty filter explains how to recover',
    await page.$eval('#eye-signal-list', (e) =>
      e.textContent.includes('Ningún evento coincide'),
    ),
  );
  await page.select('#eye-filter-mag', '2.5');
  await page.evaluate(() => {
    const e = window.__godsEyeView.dataManager.layers.get('earthquakes').module;
    e._testOriginalStats = e.getStats.bind(e);
    e.getStats = () => ({
      ...e._testOriginalStats(),
      lastUpdate: Date.now() - 360000,
    });
  });
  await page.select('#eye-filter-hours', '6');
  check(
    'old successful query is labelled delayed',
    await page.$eval('#eye-source-state', (e) =>
      e.textContent.includes('retrasada'),
    ),
  );
  await page.evaluate(() => {
    const e = window.__godsEyeView.dataManager.layers.get('earthquakes').module;
    e.getStats = e._testOriginalStats;
    delete e._testOriginalStats;
  });
  const latest = await page.evaluate(async () => {
    const view = window.__eyeinsky.readView();
    const first = window.__eyeinsky.restoreView({
      ...view,
      camera: { ...view.camera, lon: 12, lat: 40 },
      selection: 'fixture-a',
    });
    const second = window.__eyeinsky.restoreView({
      ...view,
      camera: { ...view.camera, lon: -102, lat: 23 },
      selection: 'fixture-b',
      filters: { ...view.filters, hours: 1 },
    });
    const results = await Promise.all([first, second]);
    return { results, view: window.__eyeinsky.readView() };
  });
  await new Promise((r) => setTimeout(r, 1000));
  check(
    'rapid restore preserves latest selection and filter',
    latest.results[0].superseded &&
      latest.view.selection === 'fixture-b' &&
      latest.view.filters.hours === 1,
    latest,
  );
  await page.evaluate(async () => {
    const view = window.__eyeinsky.readView();
    await window.__eyeinsky.restoreView({
      ...view,
      selection: 'missing-fixture',
    });
  });
  check(
    'missing saved contact has a labelled explanation',
    await page.$eval(
      '#eye-mission-dock-title',
      (e) => e.textContent === 'Evento no disponible',
    ),
  );
  await page.evaluate(() =>
    localStorage.setItem('eyeinsky.operations.v1', '{damaged'),
  );
  await page.evaluate(() => window.__eyeinsky.openView('operations'));
  check(
    'corrupt storage remains untouched',
    await page.evaluate(
      () =>
        localStorage.getItem('eyeinsky.operations.v1') === '{damaged' &&
        document
          .querySelector('#eye-operation-status')
          .textContent.includes('dañado'),
    ),
  );
  await page.click('#eye-operation-recover');
  await page.click('#eye-dialog-cancel');
  await page.waitForFunction(() => !document.querySelector('#eye-dialog').open);
  check(
    'recovery cancellation preserves bytes',
    await page.evaluate(
      () => localStorage.getItem('eyeinsky.operations.v1') === '{damaged',
    ),
  );
  await page.click('#eye-operation-recover');
  await page.click('#eye-dialog-confirm');
  await page.waitForFunction(
    () => localStorage.getItem('eyeinsky.operations.v1') === null,
  );
  check('confirmed recovery resets only owned store', true);
  await page.evaluate(() => {
    localStorage.setItem(
      'eyeinsky.operations.v1',
      JSON.stringify({ version: 999, records: [] }),
    );
    window.__eyeinsky.openView('operations');
  });
  check(
    'incompatible schema is actionable',
    await page.$eval('#eye-operation-status', (e) =>
      e.textContent.includes('incompatible'),
    ),
  );
  await page.evaluate(() => {
    localStorage.removeItem('eyeinsky.operations.v1');
    window.__originalStorageGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'eyeinsky.operations.v1')
        throw new DOMException('blocked', 'SecurityError');
      return window.__originalStorageGet.call(this, key);
    };
    window.__eyeinsky.openView('operations');
  });
  check(
    'denied storage is explained without a saved claim',
    await page.$eval('#eye-operation-status', (e) =>
      e.textContent.includes('denegó'),
    ),
  );
  await page.evaluate(() => {
    Storage.prototype.getItem = window.__originalStorageGet;
    window.__originalStorageSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'eyeinsky.operations.v1')
        throw new DOMException('quota', 'QuotaExceededError');
      return window.__originalStorageSet.call(this, key, value);
    };
  });
  await page.type('#eye-operation-name', 'Prueba de cuota');
  await page.click('#eye-operation-save');
  check(
    'quota failure retains draft and does not claim saved',
    await page.$eval('#eye-operation-status', (e) =>
      e.textContent.includes('No se guardó'),
    ),
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__originalStorageSet;
    window.__eyeinsky.openView('display');
  });
  await page.click('[data-stack-id="ellipsoid"]');
  await page.waitForFunction(
    () => window.__godsEyeView.mapStackController.getActiveId() === 'ellipsoid',
  );
  check(
    'explicit basemap fallback is labelled',
    await page.$eval('#eye-map-label', (e) =>
      e.textContent.includes('sin cartografía'),
    ),
  );
  await page.click('[data-stack-id="natural-earth"]');
  await page.waitForFunction(
    () =>
      window.__godsEyeView.mapStackController.getActiveId() === 'natural-earth',
  );
  check('local map can be restored without credentials', true);
  await page.evaluate(() => window.__eyeinsky.openView('director'));
  await page.click('#scene-capture-btn');
  check(
    'director captures actual current camera',
    (await page.$$eval('#scene-shot-list .scene-shot-row', (e) => e.length)) >
      0,
  );
  await page.screenshot({ path: `${out}/state-director-capture.png` });
  await page.click('[data-director-authoring] button:last-child');
  await page.waitForSelector('[data-director-dialog]');
  check(
    'scene sharing is a themed native dialog',
    await page.$eval('[data-director-dialog]', (e) => e.open),
  );
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__eyeinsky.openView('display'));
  await page.click('#clean-view-toggle');
  await page.click('#clean-view-exit');
  check(
    'retained clean-view control has an exit',
    await page.evaluate(
      () => !document.body.classList.contains('ui-clean-view'),
    ),
  );
  await page.screenshot({ path: `${out}/state-display-final.png` });
} catch (e) {
  result.failure = String(e.stack || e);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: `${out}/states-failure.png` });
} finally {
  await fs.writeFile(
    `${out}/deterministic-states.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await browser.close();
}
