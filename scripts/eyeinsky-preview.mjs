import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2';
const url = 'http://127.0.0.1:4193/';
const result = {
  at: new Date().toISOString(),
  url,
  checks: [],
  errors: [],
  failed: [],
  endpoints: [],
};
const check = (name, ok, detail) => {
  result.checks.push({ name, ok, detail });
  assert.ok(ok, name);
};
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
  await page.setViewport({ width: 1440, height: 960 });
  page.on('pageerror', (e) => result.errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') result.errors.push(m.text());
  });
  page.on('requestfailed', (r) =>
    result.failed.push({ url: r.url(), error: r.failure() }),
  );
  await page.goto(url);
  await page.waitForFunction(
    () =>
      window.__eyeinsky &&
      document.querySelector('#loading-screen').classList.contains('hidden'),
  );
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 2000));
  check(
    'production bundle starts one viewer with local fonts and no provider settings',
    await page.evaluate(
      () =>
        document.querySelectorAll('.cesium-widget canvas').length === 1 &&
        document.fonts.check('14px "Space Grotesk"') &&
        document.fonts.check('12px "IBM Plex Mono"') &&
        !document.querySelector('#key-setup-panel'),
    ),
  );
  await page.screenshot({ path: `${out}/preview-home-1440.png` });
  // Ruta real a Señales desde el rediseño P0-P2: el dock de funciones
  // lleva a Instrumentos y desde ahí se abre el registro sísmico.
  await page.click('.eye-function-dock [data-eye-view="instruments"]');
  await page.click('#eye-connect');
  await page.waitForFunction(() => window.__eyeinsky.rows.length >= 2, {
    timeout: 60000,
  });
  result.live = await page.evaluate(() => ({
    ids: window.__eyeinsky.rows.map((r) => r.id),
    stats: window.__godsEyeView.dataManager.layers
      .get('earthquakes')
      .module.getStats(),
  }));
  check('static build queries real USGS directly', result.live.ids.length >= 2);
  await page.click('#eye-signal-list button');
  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: `${out}/preview-inspector-1440.png` });
  await page.evaluate(() => window.__eyeinsky.openView('catalog'));
  for (const id of ['local-dams', 'local-datacenters']) {
    await page.click(`[data-layer-id="${id}"] button`);
    await page.waitForFunction(
      (id) => {
        const entry = window.__godsEyeView.dataManager
          .getAll()
          .find((e) => e.id === id);
        return entry.enabled && entry.stats.count > 0;
      },
      { timeout: 60000 },
      id,
    );
    const stats = await page.evaluate(
      (id) =>
        window.__godsEyeView.dataManager.getAll().find((e) => e.id === id)
          .stats,
      id,
    );
    check(
      `bundled licensed reference ${id}`,
      stats.count > 0 && !stats.error,
      stats,
    );
    await page.evaluate(
      (id) =>
        window.__godsEyeView.dataManager.setEnabled(id, false, {
          origin: 'user',
        }),
      id,
    );
    check(
      `catalog button follows external layer state ${id}`,
      await page.$eval(
        `[data-layer-id="${id}"] button`,
        (b) =>
          b.getAttribute('aria-pressed') === 'false' &&
          b.textContent === 'Mostrar referencia',
      ),
    );
  }
  check(
    'no browser errors in static build journey',
    result.errors.length === 0,
    result.errors,
  );
  // Fetch outside page so expected absence of a backend does not pollute the app console.
  for (const path of [
    '/api/key-setup',
    '/api/openai/realtime/session',
    '/api/opensky',
    '/identity/licenses/UPSTREAM-MIT.txt',
  ]) {
    const r = await fetch(new URL(path, url));
    const body = await r.text();
    result.endpoints.push({
      path,
      status: r.status,
      contentType: r.headers.get('content-type'),
      isHtml: body.startsWith('<!DOCTYPE') || body.startsWith('<!doctype'),
      bytes: body.length,
    });
  }
  check(
    'preview does not implement a provider or credential backend',
    result.endpoints
      .filter((e) => e.path.startsWith('/api/'))
      .every((e) => e.status === 404 || e.isHtml),
  );
} catch (e) {
  result.failure = String(e.stack || e);
  process.exitCode = 1;
  if (page) await page.screenshot({ path: `${out}/preview-failure.png` });
} finally {
  await fs.writeFile(
    `${out}/preview-verification.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await browser.close();
}
