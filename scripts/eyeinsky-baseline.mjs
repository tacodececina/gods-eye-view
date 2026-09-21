import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import os from 'node:os';
const out = process.env.EYE_OUT || 'output/eyeinsky-phase2';
await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    '--enable-webgl',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
  userDataDir: undefined,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) =>
    requests.push({ url: r.url(), error: r.failure() }),
  );
  const start = Date.now();
  await page.goto('http://127.0.0.1:4192/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.viewer &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 120000 },
  );
  const readyMs = Date.now() - start;
  await new Promise((r) => setTimeout(r, 4000));
  await page.screenshot({ path: `${out}/baseline-1440.png` });
  const measurement = await page.evaluate(() => ({
    resources: performance.getEntriesByType('resource').length,
    transfer: performance
      .getEntriesByType('resource')
      .reduce((n, r) => n + r.transferSize, 0),
    memory: performance.memory?.usedJSHeapSize,
    camera: window.__godsEyeView.styleManager.getCameraState(),
    renderer: window.__godsEyeView.viewer.scene.context._gl.getParameter(
      window.__godsEyeView.viewer.scene.context._gl.RENDERER,
    ),
  }));
  await fs.writeFile(
    `${out}/baseline-browser.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        readyMs,
        measurement,
        errors,
        requests,
        node: process.version,
        cpu: os.cpus()[0].model,
        chrome: await browser.version(),
        conditions:
          '1440x960 DPR1 fresh profile, headless Chrome SwiftShader, dev server cold browser, network uncontrolled',
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      readyMs,
      measurement,
      errors,
      failedRequests: requests.length,
    }),
  );
} finally {
  await browser.close();
}
