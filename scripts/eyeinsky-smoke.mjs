import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  const errors = [],
    failed = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('requestfailed', (r) =>
    failed.push({ url: r.url(), error: r.failure() }),
  );
  await page.goto(process.env.EYE_URL || 'http://127.0.0.1:4194/', {
    waitUntil: 'networkidle2',
    timeout: 90000,
  });
  await page
    .waitForFunction(() => window.__eyeinsky, { timeout: 45000 })
    .catch((e) => errors.push(String(e)));
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: `${out}/construction-home.png` });
  const state = await page.evaluate(() => ({
    title: document.title,
    loader: document.querySelector('.loader-status')?.textContent,
    eye: !!window.__eyeinsky,
    camera: window.__godsEyeView?.styleManager?.getCameraState(),
    canvases: document.querySelectorAll('.cesium-widget canvas').length,
    bodyText: document.body.innerText.slice(-2200),
  }));
  console.log(JSON.stringify({ state, errors, failed }, null, 2));
  if (state.eye) {
    await page.click('[data-eye-view="signals"]');
    await page
      .waitForFunction(() => window.__eyeinsky.rows.length > 1, {
        timeout: 35000,
      })
      .catch((e) => errors.push(String(e)));
    await page.screenshot({ path: `${out}/construction-signals.png` });
    console.log(
      'signals',
      await page.evaluate(() => ({
        rows: window.__eyeinsky.rows.length,
        status: document.querySelector('#eye-feed-status').textContent,
      })),
    );
  }
  await fs.writeFile(
    `${out}/construction-smoke.json`,
    JSON.stringify({ state, errors, failed }, null, 2),
  );
} finally {
  await browser.close();
}
