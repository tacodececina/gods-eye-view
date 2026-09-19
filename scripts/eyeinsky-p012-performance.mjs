import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://127.0.0.1:4197/';
const beforePath = process.argv[3];
const afterPath = process.argv[4];
const comparisonPath = process.argv[5];
if (!beforePath || !afterPath || !comparisonPath)
  throw new Error('before, after, and comparison paths required');
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-p012-after-'));
const sample = (page, label, durationMs = 3500) =>
  page.evaluate(
    async ({ label, durationMs }) => {
      const {
        viewer,
        dataManager,
        mapStackController,
        getRenderGovernorDiagnostics,
      } = window.__godsEyeView;
      let rafCount = 0;
      let sceneFrames = 0;
      const deltas = [];
      let last = performance.now();
      let running = true;
      const onFrame = (now) => {
        rafCount += 1;
        deltas.push(now - last);
        last = now;
        if (running) requestAnimationFrame(onFrame);
      };
      const remove = viewer.scene.postRender.addEventListener(() => {
        sceneFrames += 1;
      });
      requestAnimationFrame(onFrame);
      const started = performance.now();
      await new Promise((resolve) => setTimeout(resolve, durationMs));
      running = false;
      remove();
      const sorted = deltas.slice(1).sort((a, b) => a - b);
      const percentile = (value) =>
        sorted[
          Math.min(sorted.length - 1, Math.floor(sorted.length * value))
        ] ?? null;
      const gl = viewer.scene.context._gl;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        label,
        durationMs: performance.now() - started,
        rafCount,
        sceneFrames,
        rafMedianMs: percentile(0.5),
        rafP95Ms: percentile(0.95),
        note: 'RAF cadence and Cesium postRender frames are separate; neither is a physical-device FPS guarantee.',
        memory: performance.memory
          ? {
              usedJSHeapSize: performance.memory.usedJSHeapSize,
              totalJSHeapSize: performance.memory.totalJSHeapSize,
            }
          : null,
        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        dpr: devicePixelRatio,
        viewport: { width: innerWidth, height: innerHeight },
        camera: window.__godsEyeView.styleManager.getCameraState(),
        map: mapStackController.getActiveStack()?.label || null,
        enabledLayers: dataManager
          .getAll()
          .filter((entry) => entry.enabled)
          .map((entry) => ({
            id: entry.id,
            lifecycleState: entry.lifecycleState,
            count: Number(entry.stats?.count) || 0,
            status: entry.stats?.status || null,
            error: entry.stats?.error ? String(entry.stats.error) : null,
          })),
        resources: performance.getEntriesByType('resource').length,
        transferBytes: performance
          .getEntriesByType('resource')
          .reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        governor: getRenderGovernorDiagnostics?.() || null,
      };
    },
    { label, durationMs },
  );

const result = {
  capturedAt: new Date().toISOString(),
  browserMode:
    'headless, fresh temporary userDataDir, --enable-webgl, no forced SwiftShader',
  errors: [],
};
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl'],
  userDataDir: profile,
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) =>
    result.errors.push(String(error?.stack || error)),
  );
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.viewer &&
      window.__eyeinsky &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90_000 },
  );
  result.empty = await sample(
    page,
    'EMPTY · fresh profile · no enabled layers',
  );
  result.activation = await page.evaluate(async () => {
    const manager = window.__godsEyeView.dataManager;
    const ids = ['earthquakes', 'satellites', 'local-datacenters'];
    const settled = await Promise.allSettled(
      ids.map((id) => manager.setEnabled(id, true, { origin: 'user' })),
    );
    return ids.map((id, index) => ({
      id,
      settled: settled[index].status,
      enabled: manager.isEnabled(id),
      count:
        Number(
          manager.getAll().find((entry) => entry.id === id)?.stats?.count,
        ) || 0,
    }));
  });
  await new Promise((resolve) => setTimeout(resolve, 4500));
  result.loaded = await sample(
    page,
    'LOADED · earthquakes + satellites + local-datacenters',
  );
} finally {
  await browser.close();
  await fs.rm(profile, { recursive: true, force: true });
}

await fs.writeFile(afterPath, `${JSON.stringify(result, null, 2)}\n`);
const before = JSON.parse(await fs.readFile(beforePath, 'utf8'));
const comparable =
  before.empty.renderer === result.empty.renderer &&
  before.empty.viewport.width === result.empty.viewport.width &&
  before.empty.viewport.height === result.empty.viewport.height &&
  before.loaded.sample.map === result.loaded.map &&
  result.activation.every((entry) => entry.enabled);
const delta = (a, b) =>
  Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
const comparison = {
  capturedAt: new Date().toISOString(),
  comparable,
  sameConditions: {
    renderer: result.empty.renderer,
    viewport: result.empty.viewport,
    map: result.loaded.map,
    layers: result.activation.map((entry) => entry.id),
  },
  empty: {
    rafMedianDeltaMs: delta(before.empty.rafMedianMs, result.empty.rafMedianMs),
    rafP95DeltaMs: delta(before.empty.rafP95Ms, result.empty.rafP95Ms),
    sceneFramesDelta: delta(before.empty.sceneFrames, result.empty.sceneFrames),
    usedHeapDeltaBytes: delta(
      before.empty.memory?.usedJSHeapSize,
      result.empty.memory?.usedJSHeapSize,
    ),
  },
  loaded: {
    rafMedianDeltaMs: delta(
      before.loaded.sample.rafMedianMs,
      result.loaded.rafMedianMs,
    ),
    rafP95DeltaMs: delta(before.loaded.sample.rafP95Ms, result.loaded.rafP95Ms),
    sceneFramesDelta: delta(
      before.loaded.sample.sceneFrames,
      result.loaded.sceneFrames,
    ),
    usedHeapDeltaBytes: delta(
      before.loaded.sample.memory?.usedJSHeapSize,
      result.loaded.memory?.usedJSHeapSize,
    ),
  },
  limitations: [
    'Live source counts and request timing changed between runs.',
    'RAF is not Cesium FPS and this is not a physical mobile measurement.',
    'Heap deltas are descriptive because garbage collection timing is uncontrolled.',
  ],
};
await fs.writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`);
if (!comparable || result.errors.length) process.exitCode = 1;
