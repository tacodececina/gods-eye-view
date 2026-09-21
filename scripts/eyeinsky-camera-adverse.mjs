import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const outputDirectory = path.resolve(
  process.argv[2] || 'output/camera-adverse',
);
// La URL llega como argv[3]. El valor por defecto sigue siendo 4197 para no
// cambiar el significado de las corridas anteriores; el candidato P3 la pasa
// explícita, porque si no esta prueba mediría el producto anterior.
const targetUrl = process.argv[3] || 'http://127.0.0.1:4197/';
const delays = (process.env.EYE_CAMERA_DELAYS || '0,1,4,8,12,16,24,32,48')
  .split(',')
  .map(Number)
  .filter(Number.isFinite);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-camera-adverse-'));
const report = {
  startedAt: new Date().toISOString(),
  url: targetUrl,
  delays,
  attempts: [],
};
await fs.mkdir(outputDirectory, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  userDataDir: profile,
  args: ['--enable-webgl'],
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAttempt(delayMs, index) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) =>
    pageErrors.push(String(error?.stack || error)),
  );
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(targetUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 90_000,
  });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.viewer &&
      window.__eyeinsky &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90_000 },
  );
  await wait(250);
  await page.evaluate(() => {
    const { viewer } = window.__godsEyeView;
    const finite = (value) =>
      value && ['x', 'y', 'z'].every((key) => Number.isFinite(value[key]));
    window.__cameraProbe = {
      calls: [],
      renderErrors: [],
      sample(label) {
        const camera = viewer.camera;
        this.calls.push({
          label,
          time: performance.now(),
          currentFlight: Boolean(camera._currentFlight),
          positionFinite: finite(camera.positionWC),
          directionFinite: finite(camera.directionWC),
          upFinite: finite(camera.upWC),
          rightFinite: finite(camera.rightWC),
          transformFinite: Array.from(camera.transform || []).every(
            Number.isFinite,
          ),
          heading: camera.heading,
          pitch: camera.pitch,
          roll: camera.roll,
        });
      },
    };
    const probe = window.__cameraProbe;
    const widget = viewer.cesiumWidget;
    const showErrorPanel = widget.showErrorPanel.bind(widget);
    widget.showErrorPanel = (title, message, error) => {
      probe.renderErrors.push(
        [title, message, String(error?.stack || error || '')]
          .filter(Boolean)
          .join('\n'),
      );
      probe.sample('show-error-panel');
      return showErrorPanel(title, message, error);
    };
    viewer.scene.renderError.addEventListener((error) => {
      probe.renderErrors.push(String(error?.stack || error));
      probe.sample('render-error');
    });
    for (const method of ['cancelFlight', 'lookAtTransform']) {
      const original = viewer.camera[method].bind(viewer.camera);
      viewer.camera[method] = (...args) => {
        probe.sample(`${method}:before`);
        const result = original(...args);
        probe.sample(`${method}:after`);
        return result;
      };
    }
    probe.sample('ready');
  });

  await page.evaluate(async () => {
    const navigation = window.__godsEyeView.styleManager._navigation;
    const a = navigation.runCameraPlan('vista', [
      {
        lat: 19,
        lon: -99,
        alt: 1_000_000,
        duration: 0.18,
        targetId: 'fixture:A',
      },
    ]);
    const b = navigation.runCameraPlan('vista', [
      {
        lat: 48,
        lon: 15,
        alt: 1_400_000,
        duration: 0.18,
        targetId: 'fixture:B',
      },
    ]);
    await Promise.all([a, b]);
    window.__cameraProbe.sample('after-a-b');
    window.__probeFlight = navigation.runCameraPlan('vista', [
      {
        lat: 0,
        lon: 120,
        alt: 2_000_000,
        duration: 1,
        targetId: 'fixture:manual',
      },
    ]);
    window.__cameraProbe.sample('third-flight-started');
  });
  await wait(delayMs);
  const canvas = await page.$('.cesium-viewer canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel({ deltaY: 120 });
  await page.evaluate(() => window.__probeFlight);
  await wait(120);
  const state = await page.evaluate(() => {
    const { viewer, styleManager } = window.__godsEyeView;
    window.__cameraProbe.sample('settled');
    const panel = document.querySelector('.cesium-widget-errorPanel');
    const panelStyle = panel ? getComputedStyle(panel) : null;
    panel?.querySelector('.cesium-widget-errorPanel-more-details')?.click();
    return {
      calls: window.__cameraProbe.calls,
      renderErrors: window.__cameraProbe.renderErrors,
      panelVisible: Boolean(
        panel &&
        panelStyle.display !== 'none' &&
        panelStyle.visibility !== 'hidden' &&
        panel.getClientRects().length,
      ),
      panelText: panel?.innerText?.replace(/\s+/g, ' ').trim() || '',
      panelHtml: panel?.innerHTML || '',
      panelDetails:
        panel
          ?.querySelector('.cesium-widget-errorPanel-message-details')
          ?.innerText?.trim() || '',
      camera: styleManager.getCameraState(),
      currentFlight: Boolean(viewer.camera._currentFlight),
    };
  });
  const failed =
    state.panelVisible ||
    state.renderErrors.length > 0 ||
    pageErrors.some((error) => error.includes('normalized result')) ||
    state.calls.some(
      (sample) =>
        !sample.positionFinite ||
        !sample.directionFinite ||
        !sample.upFinite ||
        !sample.rightFinite ||
        !sample.transformFinite,
    );
  report.attempts.push({
    index,
    delayMs,
    failed,
    pageErrors,
    consoleErrors,
    ...state,
  });
  if (failed) {
    await page.screenshot({
      path: path.join(outputDirectory, `failure-${index}-${delayMs}ms.png`),
    });
  }
  await context.close();
}

try {
  let index = 0;
  for (const delay of delays) await runAttempt(delay, ++index);
  report.status = report.attempts.some((attempt) => attempt.failed)
    ? 'failed'
    : 'passed';
} catch (error) {
  report.status = 'harness-error';
  report.error = String(error?.stack || error);
  process.exitCode = 2;
} finally {
  report.completedAt = new Date().toISOString();
  await browser.close();
  await fs.rm(profile, { recursive: true, force: true });
  await fs.writeFile(
    path.join(outputDirectory, 'camera-adverse.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  const summary = report.attempts.map(
    ({ index, delayMs, failed, renderErrors }) => ({
      index,
      delayMs,
      failed,
      renderErrors: renderErrors.length,
    }),
  );
  console.log(
    JSON.stringify({ status: report.status, attempts: summary }, null, 2),
  );
  if (report.status === 'failed') process.exitCode = 1;
}
