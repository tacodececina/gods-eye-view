import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const url = process.env.EYEINSKY_URL || 'http://127.0.0.1:4197/';
const outputDir =
  process.env.EYEINSKY_IMMERSIVE_OUT ||
  'C:/Users/Alex/orca/gods-eye-view/output/eyeinsky-immersive/v3/build';
const mode = process.argv[2] || 'framing';
const result = {
  mode,
  url,
  startedAt: new Date().toISOString(),
  checks: [],
  pageErrors: [],
};

await fs.mkdir(outputDir, { recursive: true });
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
  page.on('pageerror', (error) =>
    result.pageErrors.push(String(error?.stack || error)),
  );
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(
    () =>
      window.__eyeinsky &&
      window.__godsEyeView &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90000 },
  );

  if (mode === 'inventory') {
    const parity = JSON.parse(
      await fs.readFile(
        'C:/Users/Alex/orca/gods-eye-view/output/eyeinsky-parity/parity-matrix.json',
        'utf8',
      ),
    );
    const live = await page.evaluate(() => ({
      controls: [...document.querySelectorAll('button,a[href],input,select')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return (
            !element.hidden &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            box.width > 0 &&
            box.height > 0
          );
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          text: (element.innerText || element.getAttribute('aria-label') || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 160),
          view: element.dataset.eyeView || null,
        })),
      layerControls: [
        ...document.querySelectorAll('#data-toggles [data-layer-id]'),
      ].map((row) => ({
        id: row.dataset.layerId,
        label: row.innerText.replace(/\s+/g, ' ').trim().slice(0, 160),
      })),
      owners: {
        viewerCount: document.querySelectorAll('.cesium-viewer').length,
        workspace: document.querySelector('#eye-workspace')?.id || null,
        nativeLayersParent:
          document.querySelector('#left-panel-stack')?.parentElement?.id ||
          null,
        contextParent:
          document.querySelector('#right-context-rail')?.parentElement?.id ||
          null,
      },
    }));
    const capabilityMap = {
      capturedAt: new Date().toISOString(),
      url,
      source: 'parity-matrix + controles visibles del preview integrado',
      parityRows: parity.rows,
      live,
    };
    await fs.writeFile(
      path.join(outputDir, 'capability-map-before.json'),
      JSON.stringify(capabilityMap, null, 2),
    );
    result.checks.push({ id: 'inventory-captured', ok: true, detail: live });
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
    process.exitCode = 0;
  } else if (mode === 'framing') {
    const oldFraming = await page
      .$$('.eye-header,.eye-instrument-bar,.eye-overview')
      .then((elements) => elements.length);
    result.checks.push({
      id: 'old-page-framing-removed',
      ok: oldFraming === 0,
      detail: { oldFraming },
    });
    assert.equal(oldFraming, 0, 'Old page framing must be removed');

    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else if (mode === 'surfaces') {
    const viewChecks = [];
    for (const view of [
      'signals',
      'operations',
      'catalog',
      'display',
      'preferences',
    ]) {
      const trigger = `[data-eye-view="${view}"]`;
      await page.click(trigger);
      await page.waitForFunction(
        (value) =>
          !document.querySelector('#eye-workspace')?.hidden &&
          !document.querySelector(`[data-eye-panel="${value}"]`)?.hidden,
        {},
        view,
      );
      await page.click('#eye-panel-close');
      await page.waitForFunction(
        () => document.querySelector('#eye-workspace')?.hidden,
      );
      viewChecks.push({ view, returned: true });
    }
    for (const [view, label] of [
      ['director', 'Director de escenas'],
      ['sensors', 'Cámaras y radio'],
    ]) {
      await page.click('#eye-command-open');
      await page.type('#eye-command-search', label);
      await page.click('#eye-command-list [data-eye-action]');
      await page.waitForFunction(
        (value) =>
          !document.querySelector('#eye-workspace')?.hidden &&
          !document.querySelector(`[data-eye-panel="${value}"]`)?.hidden,
        {},
        view,
      );
      await page.click('#eye-panel-close');
      viewChecks.push({ view, returned: true });
    }
    const ownership = await page.evaluate(() => ({
      viewerCount: document.querySelectorAll('.cesium-viewer').length,
      searchOwner:
        document.querySelector('#location-search')?.parentElement?.parentElement
          ?.id,
      layerOwner:
        document.querySelector('#left-panel-stack')?.parentElement?.id,
      contextOwner: document.querySelector('#right-context-rail')?.parentElement
        ?.id,
      directLayers: [...document.querySelectorAll('[data-eye-layer]')].map(
        (button) => button.dataset.eyeLayer,
      ),
    }));
    assert.equal(
      ownership.viewerCount,
      1,
      'A single Cesium viewer must own the page',
    );
    assert.equal(ownership.searchOwner, 'eye-search-host');
    assert.equal(ownership.layerOwner, 'eye-native-layers');
    assert.equal(ownership.contextOwner, 'eye-context-host');
    assert.deepEqual(ownership.directLayers, [
      'flights',
      'satellites',
      'traffic',
      'transit',
    ]);
    const satelliteButton = '[data-eye-layer="satellites"]';
    await page.click(satelliteButton);
    await page.waitForFunction(() =>
      window.__godsEyeView.dataManager.isEnabled('satellites'),
    );
    assert.equal(
      await page.$eval(satelliteButton, (button) =>
        button.getAttribute('aria-pressed'),
      ),
      'true',
    );
    await page.click(satelliteButton);
    await page.waitForFunction(
      () => !window.__godsEyeView.dataManager.isEnabled('satellites'),
    );
    result.checks.push(
      { id: 'all-views-return-to-globe', ok: true, detail: viewChecks },
      { id: 'native-owners-unique', ok: true, detail: ownership },
      { id: 'direct-layer-control', ok: true, detail: 'satellites on/off' },
      {
        id: 'page-errors',
        ok: result.pageErrors.length === 0,
        detail: result.pageErrors,
      },
    );
    assert.deepEqual(result.pageErrors, [], 'No page errors are allowed');
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else if (mode === 'motion') {
    assert.equal(
      await page.$eval('body', (body) => body.dataset.eyeMotion),
      'mounted',
      'TypeScript motion adapter must be mounted on the live root',
    );
    const trigger = '[data-eye-view="operations"]';
    await page.focus(trigger);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => !document.querySelector('#eye-workspace')?.hidden,
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'eye-panel-close',
      'opening from keyboard moves focus into the panel',
    );
    await page.click('#eye-panel-close');
    const closingState = await page.$eval('#eye-workspace', (panel) => ({
      inert: panel.inert,
      ariaHidden: panel.getAttribute('aria-hidden'),
    }));
    assert.deepEqual(closingState, { inert: true, ariaHidden: 'true' });
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.eyeView),
      'operations',
      'closing returns focus to the visible trigger',
    );
    await page.keyboard.press('Enter');
    await new Promise((resolve) => setTimeout(resolve, 220));
    const reopened = await page.$eval('#eye-workspace', (panel) => ({
      hidden: panel.hidden,
      inert: panel.inert,
      ariaHidden: panel.getAttribute('aria-hidden'),
    }));
    assert.deepEqual(reopened, {
      hidden: false,
      inert: false,
      ariaHidden: null,
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => document.querySelector('#eye-workspace')?.inert,
    );
    assert.equal(
      await page.evaluate(() => document.activeElement?.dataset.eyeView),
      'operations',
    );

    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
    await page.keyboard.press('Enter');
    const reducedDuration = await page.$eval(
      '#eye-workspace',
      (panel) => panel.getAnimations().at(-1)?.effect?.getTiming().duration,
    );
    assert.equal(reducedDuration, 1);
    result.checks.push(
      { id: 'motion-adapter-mounted', ok: true },
      { id: 'motion-reentry', ok: true, detail: reopened },
      { id: 'focus-return-and-inert-close', ok: true, detail: closingState },
      { id: 'reduced-motion-runtime', ok: true, detail: { reducedDuration } },
    );
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else if (mode === 'camera') {
    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
      () =>
        window.__eyeinsky &&
        window.__godsEyeView &&
        document.querySelector('#loading-screen')?.classList.contains('hidden'),
      { timeout: 90000 },
    );
    await page.click('[data-eye-layer="flights"]');
    await page.waitForFunction(
      () => {
        const layer = window.__godsEyeView.dataManager.layers.get('flights');
        return layer?.module?.getAllPositions?.(10)?.length > 0;
      },
      { timeout: 90000 },
    );
    const followed = await page.evaluate(() => {
      const module =
        window.__godsEyeView.dataManager.layers.get('flights').module;
      const target = module.getAllPositions(50)[0];
      const accepted = module.trackById(target.id, { origin: 'user' });
      return {
        id: target.id,
        accepted,
        tracked: module.getTrackedInfo()?.icao24 || null,
      };
    });
    assert.equal(followed.accepted, true, 'A real flight must accept follow');
    assert.equal(followed.tracked, followed.id);
    await page.click('#eye-home');
    await page.waitForFunction(
      () => {
        const app = window.__godsEyeView;
        const module = app.dataManager.layers.get('flights').module;
        return !module.getTrackedInfo?.() && !app.viewer.trackedEntity;
      },
      { timeout: 7000 },
    );
    await page.waitForFunction(
      () =>
        window.__godsEyeView.viewer.camera.positionCartographic.height >
        22000000,
      { timeout: 7000 },
    );
    const home = await page.evaluate(() => {
      const viewer = window.__godsEyeView.viewer;
      const centerStack = document.elementsFromPoint(
        innerWidth / 2,
        innerHeight / 2,
      );
      return {
        height: viewer.camera.positionCartographic.height,
        trackedEntity: viewer.trackedEntity?.id || null,
        centerBlocked: centerStack.some(
          (element) =>
            element !== viewer.canvas &&
            element.matches?.('.eye-glass-surface,button,input,aside,section'),
        ),
      };
    });
    assert.equal(
      home.centerBlocked,
      false,
      'Home target must remain in the unobstructed field',
    );

    await page.click('#eye-home');
    await new Promise((resolve) => setTimeout(resolve, 80));
    const canvas = await page.$('#cesiumContainer canvas');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2);
    await page.mouse.up();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const interrupted = await page.evaluate(
      () => !window.__godsEyeView.viewer.camera._currentFlight,
    );
    assert.equal(interrupted, true, 'Manual drag must cancel the Home flight');
    result.checks.push(
      { id: 'real-flight-followed', ok: true, detail: followed },
      { id: 'home-releases-tracking', ok: true, detail: home },
      { id: 'home-mobile-unobstructed', ok: true, detail: home },
      { id: 'manual-drag-cancels-flight', ok: true, detail: { interrupted } },
    );
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else if (mode === 'camera-duration') {
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'no-preference' },
    ]);
    await page.click('[data-eye-view="signals"]');
    await page.waitForFunction(() => window.__eyeinsky.rows.length > 0, {
      timeout: 90000,
    });
    await page.evaluate(() => {
      const manager = window.__godsEyeView.styleManager;
      const original = manager.applyCameraState.bind(manager);
      window.__eyeDurations = [];
      manager.applyCameraState = (state, duration) => {
        window.__eyeDurations.push(duration);
        return original(state, duration);
      };
    });
    const signal = '#eye-signal-list [data-signal-id]';
    await page.click(signal);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.click('#eye-mission-dock-close');
    await page.waitForFunction(
      () => document.querySelector('#eye-mission-dock')?.hidden,
    );
    await page.click(signal);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const durations = await page.evaluate(() => window.__eyeDurations);
    result.observed = { durations };
    assert.equal(durations.length >= 2, true);
    assert.equal(
      durations[1] < durations[0] - 0.05,
      true,
      `Repeated focus should shorten the camera transition: ${durations.join(', ')}`,
    );
    result.checks.push({
      id: 'camera-duration-proportional-to-distance',
      ok: true,
      detail: { durations },
    });
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else if (mode === 'picking') {
    const flightsEnabled = await page.evaluate(() =>
      window.__godsEyeView.dataManager.isEnabled('flights'),
    );
    if (!flightsEnabled) await page.click('[data-eye-layer="flights"]');
    await page.waitForFunction(() =>
      window.__godsEyeView.dataManager.isEnabled('flights'),
    );
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.refreshLayer('flights'),
    );
    await page.waitForFunction(
      () => {
        const layer = window.__godsEyeView.dataManager.layers.get('flights');
        return layer?.module?.getAllPositions?.(100)?.length > 0;
      },
      { timeout: 90000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const picked = await page.evaluate(() => {
      const app = window.__godsEyeView;
      const scene = app.viewer.scene;
      const canvas = app.viewer.canvas;
      const module = app.dataManager.layers.get('flights').module;
      for (const row of module.getAllPositions(20000)) {
        const screen = scene.cartesianToCanvasCoordinates(row.position);
        if (
          !screen ||
          screen.x < 92 ||
          screen.x > canvas.clientWidth - 68 ||
          screen.y < 72 ||
          screen.y > canvas.clientHeight - 92
        )
          continue;
        for (let offsetY = -8; offsetY <= 8; offsetY += 2) {
          for (let offsetX = -8; offsetX <= 8; offsetX += 2) {
            const point = { x: screen.x + offsetX, y: screen.y + offsetY };
            if (document.elementFromPoint(point.x, point.y) !== canvas)
              continue;
            const hit = scene.pick(point);
            const id = hit?.primitive?.id ?? hit?.id;
            if (id === row.id) return { ...point, id: row.id };
          }
        }
      }
      return null;
    });
    assert.notEqual(picked, null, 'A rendered flight must be pickable');
    result.observed = { picked };
    const canvas = await page.$('#cesiumContainer canvas');
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + picked.x, box.y + picked.y);
    await page.waitForFunction(
      (id) => {
        const module =
          window.__godsEyeView.dataManager.layers.get('flights').module;
        return module.getTrackedInfo?.()?.icao24 === id;
      },
      { timeout: 15000 },
      picked.id,
    );
    const selected = await page.evaluate((id) => {
      const app = window.__godsEyeView;
      const tracked = app.dataManager.layers
        .get('flights')
        .module.getTrackedInfo?.();
      return {
        id,
        selected: tracked?.icao24 === id,
        pickedViewerEntity: app.viewer.trackedEntity?.gevTrackedId || null,
      };
    }, picked.id);
    assert.equal(
      selected.selected,
      true,
      'Canvas pick must select the same live identity',
    );

    await page.click('[data-eye-view="preferences"]');
    await page.click('#global-context-flights-btn');
    await page.waitForFunction(
      () => !document.querySelector('#cockpit-entry')?.hidden,
      { timeout: 15000 },
    );
    await page.click('#cockpit-entry');
    await page.waitForFunction(() =>
      document.body.classList.contains('cockpit-mode'),
    );
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
          .module.getTrackedInfo?.(),
      { timeout: 7000 },
    );
    result.checks.push(
      { id: 'flight-render-and-pick', ok: true, detail: picked },
      { id: 'flight-selection-same-identity', ok: true, detail: selected },
      {
        id: 'cockpit-enter-exit-real-selection',
        ok: true,
        detail: { id: picked.id },
      },
      { id: 'home-after-pick', ok: true },
    );
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else if (mode === 'adaptation') {
    const snapshots = [];
    const waitForViewportSettled = async () => {
      await page.waitForFunction(() => {
        const expected = Math.round(visualViewport?.height || innerHeight);
        const cssHeight = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--eye-viewport-height',
          ),
        );
        return (
          Math.abs(cssHeight - expected) <= 1 &&
          document.documentElement.scrollHeight <= innerHeight + 1
        );
      });
    };
    const measure = async (name) => {
      const state = await page.evaluate(() => {
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            !element.hidden &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const viewport = {
          width: visualViewport?.width || innerWidth,
          height: visualViewport?.height || innerHeight,
          scale: visualViewport?.scale || 1,
        };
        const controls = [
          ...document.querySelectorAll(
            '.eye-orbit-brand,.eye-search,.eye-function-dock,.eye-utility-cluster,.eye-instruments,#key-setup-chip',
          ),
        ]
          .filter(visible)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              name: element.id || element.className,
              withinViewport:
                rect.left >= -1 &&
                rect.top >= -1 &&
                rect.right <= viewport.width + 1 &&
                rect.bottom <= viewport.height + 1,
            };
          });
        const active = document.activeElement;
        const activeRect = active?.getBoundingClientRect?.();
        return {
          viewport,
          inner: { width: innerWidth, height: innerHeight },
          viewportCssHeight: getComputedStyle(
            document.documentElement,
          ).getPropertyValue('--eye-viewport-height'),
          overflow: {
            horizontal: document.documentElement.scrollWidth > innerWidth,
            vertical: document.documentElement.scrollHeight > innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            scrollHeight: document.documentElement.scrollHeight,
          },
          controls,
          activeElement: active?.id || active?.tagName || null,
          activeVisible: activeRect
            ? activeRect.top >= 0 && activeRect.bottom <= viewport.height + 1
            : null,
        };
      });
      snapshots.push({ name, ...state });
      result.adaptation = snapshots;
      assert.equal(state.overflow.horizontal, false);
      assert.equal(state.overflow.vertical, false);
      assert.equal(
        state.controls.every((control) => control.withinViewport),
        true,
        `${name}: a floating control left the dynamic viewport`,
      );
    };

    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
      () =>
        window.__eyeinsky &&
        document.querySelector('#loading-screen')?.classList.contains('hidden'),
      { timeout: 90000 },
    );
    await waitForViewportSettled();
    const signalsBox = await page
      .$('[data-eye-view="signals"]')
      .then((element) => element.boundingBox());
    await page.touchscreen.tap(
      signalsBox.x + signalsBox.width / 2,
      signalsBox.y + signalsBox.height / 2,
    );
    await page.waitForFunction(
      () => !document.querySelector('#eye-workspace')?.hidden,
    );
    await new Promise((resolve) => setTimeout(resolve, 240));
    await page.click('#eye-panel-close');
    await page.waitForFunction(
      () => document.querySelector('#eye-workspace')?.hidden,
    );
    await measure('touch-390x844');

    await page.keyboard.down('Control');
    await page.keyboard.press('KeyK');
    await page.keyboard.up('Control');
    await page.waitForFunction(
      () => document.querySelector('#eye-commands')?.open,
    );
    assert.equal(
      await page.$eval('#eye-command-search', (element) =>
        element.matches(':focus'),
      ),
      true,
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(
      () => !document.querySelector('#eye-commands')?.open,
    );

    await page.setViewport({
      width: 390,
      height: 540,
      isMobile: true,
      hasTouch: true,
    });
    await waitForViewportSettled();
    await page.focus('#location-search');
    await page.waitForFunction(
      () => document.activeElement?.id === 'location-search',
    );
    await measure('virtual-keyboard-proxy-390x540');
    assert.equal(snapshots.at(-1).activeElement, 'location-search');
    assert.equal(snapshots.at(-1).activeVisible, true);

    await page.setViewport({ width: 1111, height: 777, deviceScaleFactor: 1 });
    await waitForViewportSettled();
    await measure('live-resize-1111x777');

    await page.setViewport({
      width: 1152,
      height: 720,
      deviceScaleFactor: 1.25,
    });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await waitForViewportSettled();
    await measure('zoom-layout-proxy-125-percent');
    await page.screenshot({
      path: path.join(outputDir, 'adaptation-zoom-125.png'),
    });

    await fs.writeFile(
      path.join(outputDir, 'adaptation-matrix.json'),
      JSON.stringify(
        { capturedAt: new Date().toISOString(), snapshots },
        null,
        2,
      ),
    );
    assert.deepEqual(
      result.pageErrors,
      [],
      'Adaptation run must not emit page errors',
    );
    result.adaptation = snapshots;
    result.checks.push(
      { id: 'touch-emulated-open', ok: true },
      { id: 'keyboard-command-focus', ok: true },
      { id: 'virtual-keyboard-proxy', ok: true },
      { id: 'live-intermediate-resize', ok: true },
      { id: 'zoom-layout-proxy', ok: true },
    );
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else if (mode === 'responsive') {
    const viewports = [
      [320, 568],
      [360, 800],
      [390, 844],
      [844, 390],
      [768, 1024],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
      [2560, 1440],
    ];
    const matrix = [];
    for (const [width, height] of viewports) {
      const mobile = width <= 650;
      await page.setViewport({
        width,
        height,
        isMobile: mobile,
        hasTouch: mobile,
      });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(
        () =>
          window.__eyeinsky &&
          window.__godsEyeView &&
          document
            .querySelector('#loading-screen')
            ?.classList.contains('hidden'),
        { timeout: 90000 },
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      const metrics = await page.evaluate(() => {
        const withinViewport = (rect) =>
          rect.left >= -1 &&
          rect.top >= -1 &&
          rect.right <= innerWidth + 1 &&
          rect.bottom <= innerHeight + 1;
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            !element.hidden &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) > 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const controls = [
          ...document.querySelectorAll(
            '.eye-orbit-brand,.eye-search,.eye-function-dock,.eye-utility-cluster,.eye-signal-glance,.eye-instruments,.eye-telemetry,#key-setup-chip',
          ),
        ]
          .filter(visible)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              name: element.className,
              rect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              },
              withinViewport: withinViewport(rect),
            };
          });
        const touchTargets = [
          ...document.querySelectorAll(
            '.eye-function-dock button,.eye-utility-cluster button,.eye-instruments button,#key-setup-chip',
          ),
        ]
          .filter(visible)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              id:
                element.id ||
                element.dataset.eyeView ||
                element.dataset.eyeLayer,
              width: rect.width,
              height: rect.height,
            };
          });
        const viewer = window.__godsEyeView.viewer;
        const scene = viewer.scene;
        const ellipsoid = scene.globe.ellipsoid;
        const samples = [];
        for (let x = 0; x <= innerWidth; x += 2) {
          if (
            viewer.camera.pickEllipsoid({ x, y: innerHeight / 2 }, ellipsoid)
          ) {
            samples.push([x, innerHeight / 2]);
          }
        }
        for (let y = 0; y <= innerHeight; y += 2) {
          if (
            viewer.camera.pickEllipsoid({ x: innerWidth / 2, y }, ellipsoid)
          ) {
            samples.push([innerWidth / 2, y]);
          }
        }
        const xs = samples.map(([x]) => x);
        const ys = samples.map(([, y]) => y);
        const globe = samples.length
          ? {
              left: Math.min(...xs),
              top: Math.min(...ys),
              right: Math.max(...xs),
              bottom: Math.max(...ys),
            }
          : null;
        const centerElements = document.elementsFromPoint(
          innerWidth / 2,
          innerHeight / 2,
        );
        const centerBlockedBy = centerElements
          .filter(
            (element) =>
              element.closest?.('.eye-glass-surface') &&
              getComputedStyle(element).pointerEvents !== 'none',
          )
          .map((element) => element.id || element.className)
          .slice(0, 5);
        let occludedArea = 0;
        if (globe) {
          const globeWidth = Math.max(1, globe.right - globe.left);
          const globeHeight = Math.max(1, globe.bottom - globe.top);
          for (const panel of document.querySelectorAll('.eye-glass-surface')) {
            if (!visible(panel)) continue;
            const rect = panel.getBoundingClientRect();
            const overlapWidth = Math.max(
              0,
              Math.min(rect.right, globe.right) -
                Math.max(rect.left, globe.left),
            );
            const overlapHeight = Math.max(
              0,
              Math.min(rect.bottom, globe.bottom) -
                Math.max(rect.top, globe.top),
            );
            occludedArea += overlapWidth * overlapHeight;
          }
          occludedArea /= globeWidth * globeHeight;
        }
        const canvas = document
          .querySelector('#cesiumContainer canvas')
          ?.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          overflow: {
            horizontal: document.documentElement.scrollWidth > innerWidth,
            vertical: document.documentElement.scrollHeight > innerHeight,
          },
          canvas: canvas
            ? {
                left: canvas.left,
                top: canvas.top,
                right: canvas.right,
                bottom: canvas.bottom,
              }
            : null,
          controls,
          touchTargets,
          globe,
          globeAtCenter: Boolean(
            viewer.camera.pickEllipsoid(
              { x: innerWidth / 2, y: innerHeight / 2 },
              ellipsoid,
            ),
          ),
          centerBlockedBy,
          occlusionRatio: Number(occludedArea.toFixed(4)),
        };
      });
      assert.deepEqual(metrics.overflow, {
        horizontal: false,
        vertical: false,
      });
      assert.equal(metrics.canvas?.left, 0);
      assert.equal(metrics.canvas?.top, 0);
      assert.equal(Math.round(metrics.canvas?.right), width);
      assert.equal(Math.round(metrics.canvas?.bottom), height);
      assert.equal(
        metrics.controls.every((control) => control.withinViewport),
        true,
        `${width}x${height}: floating control outside viewport`,
      );
      if (mobile) {
        assert.equal(
          metrics.touchTargets.every(
            (target) => target.width >= 44 && target.height >= 44,
          ),
          true,
          `${width}x${height}: touch target smaller than 44px`,
        );
      }
      assert.notEqual(
        metrics.globe,
        null,
        `${width}x${height}: globe not measurable`,
      );
      assert.equal(
        metrics.globeAtCenter,
        true,
        `${width}x${height}: no globe at center`,
      );
      assert.deepEqual(
        metrics.centerBlockedBy,
        [],
        `${width}x${height}: center blocked by glass UI`,
      );
      assert.equal(
        metrics.occlusionRatio < 0.5,
        true,
        `${width}x${height}: excessive globe occlusion ${metrics.occlusionRatio}`,
      );
      const suffix = `${width}x${height}`;
      await page.screenshot({
        path: path.join(outputDir, `responsive-${suffix}-home.png`),
      });
      const row = { ...metrics, screenshot: `responsive-${suffix}-home.png` };
      if (
        (width === 390 && height === 844) ||
        (width === 1440 && height === 900)
      ) {
        await page.click('[data-eye-view="signals"]');
        await page.waitForFunction(() => window.__eyeinsky.rows.length > 0, {
          timeout: 90000,
        });
        await page.evaluate(() =>
          document.querySelector('#eye-signal-list [data-signal-id]')?.click(),
        );
        await page.waitForFunction(
          () => !document.querySelector('#eye-mission-dock')?.hidden,
        );
        await new Promise((resolve) => setTimeout(resolve, 250));
        row.inspector = await page.evaluate(() => {
          const rect = document
            .querySelector('#eye-mission-dock')
            .getBoundingClientRect();
          const target = { x: innerWidth / 2, y: innerHeight / 2 };
          return {
            rect: {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            },
            target,
            targetBehindPanel:
              target.x >= rect.left &&
              target.x <= rect.right &&
              target.y >= rect.top &&
              target.y <= rect.bottom,
          };
        });
        assert.equal(row.inspector.targetBehindPanel, false);
        const label = mobile ? 'mobile' : 'desktop';
        await page.screenshot({
          path: path.join(outputDir, `${label}-inspector.png`),
        });
        row.inspector.screenshot = `${label}-inspector.png`;
        await page.click('#eye-mission-dock-close');
        await page.waitForFunction(
          () => document.querySelector('#eye-mission-dock')?.hidden,
        );
        await page.click('#eye-home');
        await new Promise((resolve) => setTimeout(resolve, 350));
        await page.screenshot({
          path: path.join(outputDir, `${label}-home.png`),
        });
        row.homeScreenshot = `${label}-home.png`;
      }
      matrix.push(row);
    }
    assert.deepEqual(
      result.pageErrors,
      [],
      'Responsive run must not emit page errors',
    );
    await fs.writeFile(
      path.join(outputDir, 'responsive-matrix.json'),
      JSON.stringify(
        { capturedAt: new Date().toISOString(), rows: matrix },
        null,
        2,
      ),
    );
    result.matrix = matrix;
    result.checks.push({
      id: 'responsive-matrix',
      ok: true,
      detail: { viewports: matrix.length },
    });
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else if (mode === 'occlusion') {
    await page.setViewport({
      width: 390,
      height: 844,
      isMobile: true,
      hasTouch: true,
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
      () =>
        window.__eyeinsky &&
        document.querySelector('#loading-screen')?.classList.contains('hidden'),
      { timeout: 90000 },
    );
    await page.click('[data-eye-view="signals"]');
    await page.waitForFunction(() => window.__eyeinsky.rows.length > 0, {
      timeout: 90000,
    });
    await page.evaluate(() =>
      document.querySelector('#eye-signal-list [data-signal-id]')?.click(),
    );
    await page.waitForFunction(
      () => !document.querySelector('#eye-mission-dock')?.hidden,
    );
    const measurement = await page.evaluate(() => {
      const panel = document
        .querySelector('#eye-mission-dock')
        .getBoundingClientRect();
      const target = { x: innerWidth / 2, y: innerHeight / 2 };
      return {
        panel: {
          left: panel.left,
          top: panel.top,
          right: panel.right,
          bottom: panel.bottom,
          width: panel.width,
          height: panel.height,
        },
        target,
        targetBehindPanel:
          target.x >= panel.left &&
          target.x <= panel.right &&
          target.y >= panel.top &&
          target.y <= panel.bottom,
      };
    });
    result.observed = measurement;
    assert.equal(
      measurement.targetBehindPanel,
      false,
      'Selected target at the camera center must stay above the mobile sheet',
    );
    await page.click('#eye-mission-dock-close');
    await page.waitForFunction(
      () => document.querySelector('#eye-mission-dock')?.hidden,
    );
    await page.click('#eye-home');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const homeState = await page.evaluate(() => ({
      active: document.body.dataset.eyeActive,
      inspecting: document.body.dataset.eyeInspecting,
      workspaceHidden: document.querySelector('#eye-workspace')?.hidden,
      intelHudDisplay: getComputedStyle(document.querySelector('#intel-hud'))
        .display,
    }));
    assert.deepEqual(
      {
        active: homeState.active,
        inspecting: homeState.inspecting,
        workspaceHidden: homeState.workspaceHidden,
      },
      { active: 'false', inspecting: 'false', workspaceHidden: true },
      'Home must return the complete shell to Explore',
    );
    assert.equal(
      homeState.intelHudDisplay,
      'none',
      'The inherited tactical HUD must not overlap mobile controls',
    );
    result.checks.push({
      id: 'mobile-selected-target-unoccluded',
      ok: true,
      detail: measurement,
    });
    result.checks.push({
      id: 'mobile-home-returns-explore',
      ok: true,
      detail: homeState,
    });
    result.completedAt = new Date().toISOString();
    result.status = 'pass';
  } else {
    throw new Error(`Unknown harness mode: ${mode}`);
  }
} catch (error) {
  result.completedAt = new Date().toISOString();
  result.status = 'fail';
  result.error = String(error?.stack || error);
  throw error;
} finally {
  await fs.writeFile(
    path.join(outputDir, `immersive-${mode}.json`),
    JSON.stringify(result, null, 2),
  );
  await browser.close();
}
