import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2',
  tag = process.env.EYE_QA_TAG || 'green',
  url = process.env.EYE_URL || 'http://127.0.0.1:4194/';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
const checks = [];
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 960 });
    await page.setRequestInterception(true);
    page.on('request', (r) =>
      r.url().includes('earthquake.usgs.gov/earthquakes/feed')
        ? r.respond({
            status: 200,
            headers: { 'Access-Control-Allow-Origin': '*' },
            contentType: 'application/json',
            body: JSON.stringify({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  id: 'focus-fixture',
                  properties: {
                    mag: 4,
                    time: Date.now(),
                    place: 'FIXTURE de foco',
                  },
                  geometry: { type: 'Point', coordinates: [-100, 23, 12] },
                },
              ],
            }),
          })
        : r.continue(),
    );
    await page.goto(url);
    await page.waitForFunction(
      () =>
        window.__eyeinsky &&
        document.querySelector('#loading-screen').classList.contains('hidden'),
    );
    // Ruta real a Señales desde el rediseño P0-P2: el dock de funciones
    // lleva a Instrumentos y desde ahí se abre el registro sísmico.
    await page.click('.eye-function-dock [data-eye-view="instruments"]');
    await page.click('#eye-connect');
    await page.waitForFunction(
      () => !document.querySelector('#eye-refresh').disabled,
    );
    await page.waitForSelector('[data-signal-id="focus-fixture"]');
    await page.click('[data-signal-id="focus-fixture"]');
    await page.click('#eye-mission-dock-close');
    checks.push({
      name: `${width}: inspector returns focus to current row`,
      ok: await page.evaluate(
        () => document.activeElement.dataset.signalId === 'focus-fixture',
      ),
    });
    await page.click('#eye-command-open');
    await page.type('#eye-command-search', 'Compartir');
    await page.click('#eye-command-list button');
    await page.waitForSelector('#eye-dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('#eye-dialog').open,
    );
    checks.push({
      name: `${width}: palette dialog returns focus to visible launcher`,
      ok: await page.evaluate(
        () => document.activeElement.id === 'eye-command-open',
      ),
    });
    for (const view of ['catalog', 'display', 'sensors', 'preferences']) {
      // Operación vive bajo Más desde el rediseño P0-P2.
      await page.click('.eye-function-dock [data-eye-view="more"]');
      await page.click('[data-eye-panel="more"] [data-eye-view="operations"]');
      await page.$eval('.eye-workspace-content', (element) => {
        element.scrollTop = 500;
      });
      await page.evaluate((nextView) => {
        window.__eyeinsky.openView(nextView);
      }, view);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const measurement = await page.evaluate((currentView) => {
        const content = document.querySelector('.eye-workspace-content');
        const panel = document.querySelector(
          `[data-eye-panel="${currentView}"]`,
        );
        return {
          scrollTop: content.scrollTop,
          contentTop: content.getBoundingClientRect().top,
          panelTop: panel.getBoundingClientRect().top,
        };
      }, view);
      checks.push({
        name: `${width}: ${view} starts at its heading after another surface was scrolled`,
        ok:
          measurement.scrollTop === 0 &&
          measurement.panelTop >= measurement.contentTop,
        detail: measurement,
      });
    }
    await page.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(
    `${out}/focus-${tag}.json`,
    JSON.stringify({ kind: 'FIXTURE', checks }, null, 2),
  );
  console.log(JSON.stringify(checks));
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}
