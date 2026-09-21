import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://127.0.0.1:4197/';
const outputPath = process.argv[3];
if (!outputPath) throw new Error('output path required');
const result = {
  url,
  mode: 'fresh temporary profile, native GPU default',
  startedAt: new Date().toISOString(),
  checks: [],
  pageErrors: [],
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--enable-webgl', '--no-first-run'],
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (error) =>
    result.pageErrors.push(String(error?.stack || error)),
  );
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(
    () =>
      window.__eyeinsky &&
      window.__godsEyeView &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90_000 },
  );
  if (
    !(await page.evaluate(() =>
      window.__godsEyeView.dataManager.isEnabled('flights'),
    ))
  ) {
    await page.click('[data-eye-active-add]');
    await page.waitForSelector('[data-eye-catalog-toggle="flights"]');
    await page.click('[data-eye-catalog-toggle="flights"]');
    await page.click('#eye-catalog-back');
  }
  await page.waitForFunction(() =>
    window.__godsEyeView.dataManager.isEnabled('flights'),
  );
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.refreshLayer('flights'),
  );
  let source = 'LIVE';
  let picked = null;
  try {
    await page.waitForFunction(
      () =>
        window.__godsEyeView.dataManager.layers
          .get('flights')
          ?.module?.getAllPositions?.(100)?.length > 0,
      { timeout: 30_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    picked = await page.evaluate(() => {
      const app = window.__godsEyeView;
      const scene = app.viewer.scene;
      const canvas = app.viewer.canvas;
      const rows = app.dataManager.layers
        .get('flights')
        .module.getAllPositions(20_000);
      for (const row of rows) {
        const screen = scene.cartesianToCanvasCoordinates(row.position);
        if (
          !screen ||
          screen.x < 92 ||
          screen.x > canvas.clientWidth - 68 ||
          screen.y < 72 ||
          screen.y > canvas.clientHeight - 92
        )
          continue;
        for (let y = -8; y <= 8; y += 2)
          for (let x = -8; x <= 8; x += 2) {
            const point = { x: screen.x + x, y: screen.y + y };
            if (document.elementFromPoint(point.x, point.y) !== canvas)
              continue;
            const hit = scene.pick(point);
            const id = hit?.primitive?.id ?? hit?.id;
            if (id === row.id) return { ...point, id: row.id };
          }
      }
      return null;
    });
    if (!picked) throw new Error('No rendered LIVE flight was pickable');
  } catch (error) {
    source = 'FIXTURE';
    result.live = {
      status: 'unavailable',
      reason: String(error?.message || error),
    };
    picked = await page.evaluate(() => {
      const app = window.__godsEyeView;
      const C = window.__CESIUM__;
      const id = 'p012fixture';
      const position = C.Cartesian3.fromDegrees(-99, 19, 10_000);
      const collection = new C.BillboardCollection({ scene: app.viewer.scene });
      app.viewer.scene.primitives.add(collection);
      const billboard = collection.add({ id, position, show: false });
      const entity = app.viewer.entities.add({
        id: `p012-track-${id}`,
        position,
        point: { pixelSize: 8, color: C.Color.CYAN },
      });
      entity.gevTrackedId = `flights:${id}`;
      entity.viewFrom = new C.Cartesian3(-1500, -1500, 800);
      const module = app.dataManager.layers.get('flights').module;
      module.testing._setTrackedFlightRefreshStateForTest({
        icao24: id,
        entity,
        meta: {
          callsign: 'P012FIX',
          registration: 'P012-FX',
          altitude: 10_000,
          velocity: 210,
          true_track: 90,
          onGround: false,
        },
        billboard,
        billboardCollection: collection,
        viewer: app.viewer,
      });
      app.viewer.trackedEntity = entity;
      return { x: null, y: null, id };
    });
  }
  if (source === 'LIVE') await page.mouse.click(picked.x, picked.y);
  await page.waitForFunction(
    (id) =>
      window.__godsEyeView.dataManager.layers
        .get('flights')
        .module.getTrackedInfo?.()?.icao24 === id,
    { timeout: 15_000 },
    picked.id,
  );
  const selected = await page.evaluate((id) => {
    const app = window.__godsEyeView;
    const tracked = app.dataManager.layers
      .get('flights')
      .module.getTrackedInfo?.();
    return {
      expected: id,
      tracked: tracked?.icao24 || null,
      viewer: app.viewer.trackedEntity?.gevTrackedId || null,
    };
  }, picked.id);
  if (selected.tracked !== selected.expected)
    throw new Error(`Selection identity mismatch: ${JSON.stringify(selected)}`);

  await page.click('[data-eye-view="more"]');
  await page.click('[data-eye-view="preferences"]');
  await page.click('#global-context-flights-btn');
  await page.waitForFunction(
    () => !document.querySelector('#cockpit-entry')?.hidden,
    { timeout: 15_000 },
  );
  await page.click('#cockpit-entry');
  await page.waitForFunction(() =>
    document.body.classList.contains('cockpit-mode'),
  );
  const cockpitIdentity = await page.evaluate(
    () =>
      window.__godsEyeView.dataManager.layers
        .get('flights')
        .module.getTrackedInfo?.()?.icao24 || null,
  );
  if (cockpitIdentity !== picked.id)
    throw new Error(`Cockpit identity mismatch: ${cockpitIdentity}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.body.classList.contains('cockpit-mode'),
  );
  await page.click('#eye-panel-close');
  await page.click('#eye-home');
  await page.waitForFunction(
    () =>
      !window.__godsEyeView.dataManager.layers
        .get('flights')
        .module.getTrackedInfo?.() &&
      !window.__godsEyeView.viewer.trackedEntity &&
      window.__godsEyeView.styleManager.getCameraState().alt >= 17_000_000,
    { timeout: 12_000 },
  );
  const home = await page.evaluate(() => ({
    active: document.body.dataset.eyeActive,
    cockpit: document.body.classList.contains('cockpit-mode'),
    tracked: Boolean(window.__godsEyeView.viewer.trackedEntity),
    altitude: window.__godsEyeView.styleManager.getCameraState().alt,
  }));
  result.checks.push(
    {
      id: `${source.toLowerCase()}-flight-render-and-pick`,
      ok: true,
      kind: source,
      detail: picked,
    },
    {
      id: `${source.toLowerCase()}-flight-same-identity`,
      ok: true,
      kind: source,
      detail: selected,
    },
    {
      id: 'cockpit-same-identity',
      ok: true,
      kind: source,
      detail: { id: cockpitIdentity },
    },
    {
      id: 'cockpit-home-release',
      ok:
        home.active === 'false' &&
        !home.cockpit &&
        !home.tracked &&
        home.altitude >= 17_000_000,
      detail: home,
      kind: source,
    },
  );
  result.status = result.checks.every((entry) => entry.ok) ? 'pass' : 'fail';
} catch (error) {
  result.status = 'error';
  result.error = String(error?.stack || error);
} finally {
  result.completedAt = new Date().toISOString();
  await browser.close();
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}

if (result.status !== 'pass' || result.pageErrors.length) process.exitCode = 1;
