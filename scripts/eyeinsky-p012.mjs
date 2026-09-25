import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://127.0.0.1:4197/';
const out =
  process.argv[3] ||
  'C:/Users/Alex/orca/gods-eye-view/output/eyeinsky-immersive/p012/build';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-p012-journey-'));
const result = {
  startedAt: new Date().toISOString(),
  url,
  browserMode: 'fresh temporary profile, headless Chrome, native GPU default',
  checks: [],
  pageErrors: [],
  requestFailures: [],
  screenshots: [],
};
const check = (id, ok, detail, kind = 'LIVE') => {
  result.checks.push({ id, ok: Boolean(ok), kind, detail });
};

await fs.mkdir(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--enable-webgl'],
  userDataDir: profile,
});

async function readyPage(context, viewport, reducedMotion = false) {
  const page = await context.newPage();
  page.on('pageerror', (error) =>
    result.pageErrors.push(String(error?.stack || error)),
  );
  page.on('requestfailed', (request) => {
    const target = new URL(request.url());
    result.requestFailures.push({
      target: `${target.origin}${target.pathname}`,
      error: request.failure()?.errorText || 'request failed',
    });
  });
  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    isMobile: viewport.width <= 430,
    hasTouch: viewport.width <= 430,
  });
  if (reducedMotion)
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
    ]);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.viewer &&
      window.__eyeinsky &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 90_000 },
  );
  await new Promise((resolve) => setTimeout(resolve, 700));
  return page;
}

try {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
    { width: 844, height: 390 },
  ];
  for (const viewport of viewports) {
    const context = await browser.createBrowserContext();
    const page = await readyPage(context, viewport);
    const suffix = `${viewport.width}x${viewport.height}`;
    const homeShot = `p012-${suffix}-home.png`;
    await page.screenshot({ path: path.join(out, homeShot) });
    result.screenshots.push(homeShot);
    await page.click('[data-eye-active-add]');
    await page.waitForFunction(
      () =>
        !document.getElementById('eye-workspace').hidden &&
        // 21 capas de runtime (P5 añade «moon») + 3 «próximamente».
        document.querySelectorAll('#eye-catalog .eye-catalog-row').length ===
          24,
    );
    // El Mission Dock se SUSPENDE cuando el panel ocupa la pantalla en móvil, y
    // su cierre es animado (`scale(0.975)`). Medir a mitad de esa transición
    // devolvía controles de 42.9 px para un mínimo real de 44. Se espera a que
    // el dock esté escondido del todo o quieto a escala 1 antes de medir.
    await page
      .waitForFunction(
        () => {
          const dock = document.getElementById('eye-mission-dock');
          if (!dock) return true;
          // En móvil el panel abierto SUSPENDE el dock: su estado final es
          // `hidden`, y esperar eso es determinista. Esperar sólo a «escala 1»
          // pasaba antes de que la animación de cierre arrancara y luego medía
          // a mitad de `scale(0.975)`: controles de 43.5 px para un mínimo de
          // 44 que el producto sí cumple en reposo.
          if (window.matchMedia('(max-width:650px)').matches)
            return dock.hidden === true;
          if (dock.hidden) return true;
          const transform = getComputedStyle(dock).transform;
          return transform === 'none' || /^matrix\(1, 0, 0, 1/.test(transform);
        },
        { timeout: 8_000 },
      )
      .catch(() => {});
    const layout = await page.evaluate(() => {
      const visible = (element) => {
        if (!element || element.hidden || element.inert) return false;
        const style = getComputedStyle(element);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          element.getClientRects().length > 0
        );
      };
      const rect = (element) => {
        const value = element.getBoundingClientRect();
        return {
          left: value.left,
          top: value.top,
          right: value.right,
          bottom: value.bottom,
          width: value.width,
          height: value.height,
        };
      };
      const selectors = [
        '.eye-orbit-brand',
        '.eye-search',
        '.eye-function-dock',
        '.eye-utility-cluster',
        '.eye-signal-glance',
        '.eye-instruments',
        '.eye-telemetry',
        '#eye-workspace',
      ];
      const surfaces = selectors
        .map((selector) => ({
          selector,
          element: document.querySelector(selector),
        }))
        .filter(({ element }) => visible(element))
        .map(({ selector, element }) => ({ selector, rect: rect(element) }));
      const outside = surfaces.filter(
        ({ rect: value }) =>
          value.left < -1 ||
          value.top < -1 ||
          value.right > innerWidth + 1 ||
          value.bottom > innerHeight + 1,
      );
      const controls = [
        ...document.querySelectorAll('button,a[href],input,select'),
      ]
        .filter(
          (element) => visible(element) && !element.closest('#cesium-credits'),
        )
        .map((element) => ({
          id:
            element.id ||
            element.dataset.eyeCatalogToggle ||
            element.getAttribute('aria-label'),
          rect: rect(element),
          textFits:
            element.scrollWidth <= element.clientWidth + 2 &&
            element.scrollHeight <= element.clientHeight + 2,
        }));
      const tooSmall = controls.filter(
        ({ rect: value }) => value.width < 44 || value.height < 44,
      );
      const textOverflow = controls.filter(({ textFits }) => !textFits);
      const minimumFont = innerWidth <= 430 || innerHeight <= 430 ? 14 : 13;
      const smallText = [
        ...document.querySelectorAll(
          '.eye-function-dock strong,.eye-catalog-row strong,.eye-catalog-row small,.eye-catalog-row p,.eye-catalog-disclosure summary,.eye-catalog-disclosure dt,.eye-catalog-disclosure dd,.eye-source-plot span,.eye-active-layers p,.eye-active-layers strong,.eye-active-layers button',
        ),
      ]
        .filter(visible)
        .map((element) => ({
          text: element.textContent.trim().slice(0, 80),
          size: Number.parseFloat(getComputedStyle(element).fontSize),
        }))
        .filter(({ size }) => size < minimumFont);
      const ids = [...document.querySelectorAll('[id]')].map(
        (element) => element.id,
      );
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      const credit = [
        ...document.querySelectorAll('#cesium-credits a, #cesium-credits img'),
      ].find(visible);
      const creditRect = credit?.getBoundingClientRect();
      const creditHit = creditRect
        ? document
            .elementsFromPoint(
              creditRect.left + Math.min(creditRect.width / 2, 80),
              creditRect.top + creditRect.height / 2,
            )
            .some((element) => element === credit || credit.contains(element))
        : false;
      const canvas = window.__godsEyeView.viewer.scene.canvas;
      const gl = window.__godsEyeView.viewer.scene.context._gl;
      const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        outside,
        tooSmall,
        textOverflow,
        smallText,
        duplicates: [...new Set(duplicates)],
        overflow: {
          x: document.documentElement.scrollWidth - innerWidth,
          y: document.documentElement.scrollHeight - innerHeight,
        },
        catalogRows: document.querySelectorAll('#eye-catalog .eye-catalog-row')
          .length,
        runtimeLayers: window.__godsEyeView.dataManager.getAll().length,
        canvasOperational:
          canvas.isConnected && getComputedStyle(canvas).display !== 'none',
        creditHit,
        scene: {
          regime: document.body.dataset.eyeScene,
          skyBox: window.__godsEyeView.viewer.scene.skyBox.show,
          background:
            window.__godsEyeView.viewer.scene.backgroundColor.toCssColorString(),
          renderer: rendererInfo
            ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
        },
        routes: [
          ...new Set(
            [...document.querySelectorAll('[data-eye-view]')].map(
              (element) => element.dataset.eyeView,
            ),
          ),
        ].sort(),
      };
    });
    check(
      `layout-${suffix}`,
      layout.outside.length === 0 &&
        layout.tooSmall.length === 0 &&
        layout.textOverflow.length === 0 &&
        layout.smallText.length === 0 &&
        layout.duplicates.length === 0 &&
        layout.overflow.x <= 0 &&
        layout.overflow.y <= 0 &&
        layout.catalogRows === 24 &&
        layout.runtimeLayers === 21 &&
        layout.canvasOperational &&
        layout.creditHit &&
        layout.scene.skyBox &&
        layout.scene.background === 'rgb(0,0,0)',
      layout,
    );
    const catalogShot = `p012-${suffix}-catalog.png`;
    await page.screenshot({ path: path.join(out, catalogShot) });
    result.screenshots.push(catalogShot);
    if (viewport.width === 390 && viewport.height === 844) {
      await page.click('#eye-panel-close');
      await new Promise((resolve) => setTimeout(resolve, 260));
      const beforeTouch = await page.evaluate(() =>
        window.__godsEyeView.styleManager.getCameraState(),
      );
      const client = await page.createCDPSession();
      const touchX = Math.round(viewport.width * 0.52);
      const touchY = Math.round(viewport.height * 0.54);
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: touchX, y: touchY, radiusX: 8, radiusY: 8 }],
      });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: touchX + 82, y: touchY - 18, radiusX: 8, radiusY: 8 },
        ],
      });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
      await new Promise((resolve) => setTimeout(resolve, 450));
      const afterTouch = await page.evaluate(() =>
        window.__godsEyeView.styleManager.getCameraState(),
      );
      check(
        'touch-cdp-globe-390x844',
        Number.isFinite(afterTouch.lon) &&
          Number.isFinite(afterTouch.lat) &&
          (Math.abs(afterTouch.lon - beforeTouch.lon) > 0.01 ||
            Math.abs(afterTouch.lat - beforeTouch.lat) > 0.01),
        { beforeTouch, afterTouch, protocol: 'CDP Input.dispatchTouchEvent' },
      );
      await client.detach();
    }
    await context.close();
  }

  const interactionContext = await browser.createBrowserContext();
  const page = await readyPage(interactionContext, {
    width: 1440,
    height: 900,
  });

  const search = await page.$('#location-search');
  await search.click();
  await search.type('Ciudad de México');
  check(
    'search-right-focus',
    await page.evaluate(
      () =>
        document.activeElement?.id === 'location-search' &&
        document.getElementById('location-search').value ===
          'Ciudad de México' &&
        document.querySelector('.eye-search').getBoundingClientRect().left >
          innerWidth / 2,
    ),
    await page.evaluate(() => ({
      active: document.activeElement?.id,
      value: document.getElementById('location-search').value,
      searchLeft: document.querySelector('.eye-search').getBoundingClientRect()
        .left,
    })),
  );

  await page.focus('[data-eye-view="instruments"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () =>
      !document.getElementById('eye-workspace').hidden &&
      !document.querySelector('[data-eye-panel="instruments"]').hidden,
  );
  const keyboardNavigation = await page.evaluate(() => ({
    panel: document.querySelector('[data-eye-panel="instruments"]').hidden,
    closeFocused: document.activeElement?.id === 'eye-panel-close',
  }));
  check(
    'keyboard-top-navigation',
    !keyboardNavigation.panel && keyboardNavigation.closeFocused,
    keyboardNavigation,
  );
  await page.keyboard.press('Escape');
  await new Promise((resolve) => setTimeout(resolve, 260));

  await page.click('[data-eye-active-add]');
  const layerButton = '[data-eye-catalog-toggle="local-datacenters"]';
  await page.click(layerButton);
  await page.waitForFunction(() =>
    window.__godsEyeView.dataManager.isEnabled('local-datacenters'),
  );
  await page.click('#eye-catalog-back');
  await page.waitForFunction(
    () =>
      document.getElementById('eye-workspace').hidden &&
      document.querySelector('[data-eye-active-disable="local-datacenters"]'),
  );
  await page.click('[data-eye-active-disable="local-datacenters"]');
  await page.waitForFunction(
    () =>
      !window.__godsEyeView.dataManager.isEnabled('local-datacenters') &&
      document.getElementById('eye-notice').textContent.includes('Deshacer'),
  );
  await new Promise((resolve) => setTimeout(resolve, 220));
  const aladdin = await page.evaluate(() => ({
    panelOpen: !document.getElementById('eye-workspace').hidden,
    activeView: document.body.dataset.eyeActive,
    focus: document.activeElement?.dataset?.eyeActiveAdd !== undefined,
    row: Boolean(
      document.querySelector('[data-eye-active-id="local-datacenters"]'),
    ),
    enabled: window.__godsEyeView.dataManager.isEnabled('local-datacenters'),
  }));
  check(
    'aladdin-off-focus-undo',
    !aladdin.panelOpen &&
      aladdin.activeView === 'false' &&
      aladdin.focus &&
      !aladdin.row &&
      !aladdin.enabled,
    aladdin,
  );
  await page.click('#eye-notice button');
  await page.waitForFunction(() =>
    window.__godsEyeView.dataManager.isEnabled('local-datacenters'),
  );
  await page.waitForFunction(
    () =>
      document.activeElement?.dataset?.eyeActiveDisable === 'local-datacenters',
  );
  check(
    'aladdin-undo-restores-manager',
    await page.evaluate(
      () =>
        window.__godsEyeView.dataManager.isEnabled('local-datacenters') &&
        document.activeElement?.dataset?.eyeActiveDisable ===
          'local-datacenters',
    ),
    { layer: 'local-datacenters' },
  );
  await page.click('[data-eye-active-disable="local-datacenters"]');
  await page.waitForFunction(
    () =>
      !window.__godsEyeView.dataManager.isEnabled('local-datacenters') &&
      document.querySelector('#eye-notice button'),
  );
  // Undo while the old disappearance/focus timeout is still pending.
  await page.click('#eye-notice button');
  await page.waitForFunction(() =>
    window.__godsEyeView.dataManager.isEnabled('local-datacenters'),
  );
  await new Promise((resolve) => setTimeout(resolve, 350));
  const rapidUndo = await page.evaluate(() => ({
    enabled: window.__godsEyeView.dataManager.isEnabled('local-datacenters'),
    focusId: document.activeElement?.dataset?.eyeActiveDisable || null,
    staleAddFocus: document.activeElement?.dataset?.eyeActiveAdd !== undefined,
  }));
  check(
    'rapid-undo-preserves-restored-layer-focus',
    rapidUndo.enabled && rapidUndo.focusId === 'local-datacenters',
    rapidUndo,
  );
  await page.click('[data-eye-active-disable="local-datacenters"]');

  const sharedLayerSetup = await page.evaluate(async () => {
    const manager = window.__godsEyeView.dataManager;
    const paramsAccepted = manager.setLayerParams(
      'satellites',
      { catalog: 'dense', showPoints: false },
      { origin: 'share' },
    );
    await manager.setEnabled('satellites', true, { origin: 'share' });
    return { paramsAccepted, params: manager.getLayerParams('satellites') };
  });
  await page.waitForSelector('[data-eye-active-disable="satellites"]');
  check(
    'external-state-active-list',
    sharedLayerSetup.paramsAccepted &&
      sharedLayerSetup.params?.catalog === 'dense' &&
      sharedLayerSetup.params?.showPoints === false,
    sharedLayerSetup,
    'FIXTURE share origin on live DataManager',
  );
  await page.click('[data-eye-active-disable="satellites"]');
  await page.waitForFunction(
    () =>
      !window.__godsEyeView.dataManager.isEnabled('satellites') &&
      document.getElementById('eye-notice').textContent.includes('Deshacer'),
  );
  await page.click('#eye-notice button');
  await page.waitForFunction(() =>
    window.__godsEyeView.dataManager.isEnabled('satellites'),
  );
  const configRestore = await page.evaluate(() => ({
    enabled: window.__godsEyeView.dataManager.isEnabled('satellites'),
    params: window.__godsEyeView.dataManager.getLayerParams('satellites'),
    row: Boolean(document.querySelector('[data-eye-active-id="satellites"]')),
  }));
  check(
    'undo-restores-layer-configuration',
    configRestore.enabled &&
      configRestore.row &&
      configRestore.params?.catalog === 'dense' &&
      configRestore.params?.showPoints === false,
    configRestore,
    'FIXTURE share origin on live DataManager',
  );

  await page.click('#eye-clean');
  const cleanOn = await page.evaluate(() => ({
    active: document.body.classList.contains('eye-clean'),
    exitHidden: document.getElementById('eye-clean-exit').hidden,
    focus: document.activeElement?.id,
  }));
  await page.click('#eye-clean-exit');
  const cleanOff = await page.evaluate(() => ({
    active: document.body.classList.contains('eye-clean'),
    focus: document.activeElement?.id,
  }));
  check(
    'clean-view-roundtrip',
    cleanOn.active &&
      !cleanOn.exitHidden &&
      cleanOn.focus === 'eye-clean-exit' &&
      !cleanOff.active &&
      cleanOff.focus === 'eye-clean',
    { cleanOn, cleanOff },
  );

  const overlap = await page.evaluate(async () => {
    const nav = window.__godsEyeView.styleManager._navigation;
    const a = nav.runCameraPlan('vista', [
      {
        lat: 19,
        lon: -99,
        alt: 1_000_000,
        duration: 0.18,
        targetId: 'fixture:A',
      },
    ]);
    const b = nav.runCameraPlan('vista', [
      {
        lat: 48,
        lon: 15,
        alt: 1_400_000,
        duration: 0.18,
        targetId: 'fixture:B',
      },
    ]);
    return { a: await a, b: await b };
  });
  check(
    'camera-overlap-a-b',
    overlap.a?.stale === true &&
      overlap.b?.completed === true &&
      overlap.b?.targetId === 'fixture:B',
    overlap,
    'FIXTURE on live NavigationController',
  );

  await page.evaluate(() => {
    window.__p012HumanFlight =
      window.__godsEyeView.styleManager._navigation.runCameraPlan('vista', [
        {
          lat: 0,
          lon: 120,
          alt: 2_000_000,
          duration: 1,
          targetId: 'fixture:manual-override',
        },
      ]);
  });
  const canvas = await page.$('.cesium-viewer canvas');
  const canvasBox = await canvas.boundingBox();
  await page.mouse.move(
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );
  await page.mouse.wheel({ deltaY: 120 });
  const human = await page.evaluate(async () => ({
    flight: await window.__p012HumanFlight,
    owner: window.__godsEyeView.styleManager._navigation._lastLayerFitResult,
  }));
  check(
    'manual-override',
    human.flight?.stale === true &&
      human.owner?.status === 'cancelled-by-human' &&
      human.owner?.kind === 'wheel',
    human,
  );

  const layerFit = await page.evaluate(async () => {
    const C = window.__CESIUM__;
    const nav = window.__godsEyeView.styleManager._navigation;
    const camera = window.__godsEyeView.viewer.camera;
    const center = camera.pickEllipsoid(
      new C.Cartesian2(innerWidth / 2, innerHeight / 2),
      C.Ellipsoid.WGS84,
    );
    const before = nav._navigationGeneration;
    const scheduled = nav.requestLayerFit(
      'satellites',
      center ? [{ position: center }] : [],
      1,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const afterFit = nav._navigationGeneration;
    const outcome = nav._lastLayerFitResult;
    window.__godsEyeView.dataManager.emit?.({
      type: 'refresh',
      layerId: 'satellites',
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      scheduled,
      before,
      afterFit,
      afterRefresh: nav._navigationGeneration,
      outcome,
    };
  });
  check(
    'layer-fit-and-refresh-inert',
    layerFit.scheduled &&
      layerFit.outcome?.status === 'already-fits' &&
      layerFit.before === layerFit.afterFit &&
      layerFit.afterFit === layerFit.afterRefresh,
    layerFit,
    'FIXTURE on live NavigationController',
  );

  const homeHit = await page.evaluate(() => {
    const homeButton = document.getElementById('eye-home');
    const rect = homeButton.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      owned: hit === homeButton || homeButton.contains(hit),
      hit: hit?.id || hit?.tagName || null,
    };
  });
  await page.mouse.click(homeHit.x, homeHit.y);
  await new Promise((resolve) => setTimeout(resolve, 1900));
  const homeState = await page.evaluate(() => ({
    activeView: document.body.dataset.eyeActive,
    inspecting: document.body.dataset.eyeInspecting,
    camera: window.__godsEyeView.styleManager.getCameraState(),
    target: window.__godsEyeView.styleManager._navigation._lastLayerFitResult,
  }));
  const home = { ...homeState, homeHit };
  check(
    'home-stable',
    home.homeHit.owned &&
      home.activeView === 'false' &&
      home.inspecting !== 'true' &&
      home.camera.alt >= 17_000_000,
    home,
  );

  await page.click('[data-eye-view="instruments"]');
  await page.click('#eye-connect');
  await page.click('#eye-refresh');
  let liveSelection = null;
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('#eye-signal-list button').length >= 2,
      { timeout: 30_000 },
    );
    const signalIds = await page.$$eval('#eye-signal-list button', (rows) =>
      rows.slice(0, 2).map((row) => row.dataset.signalId),
    );
    await page.evaluate(() => {
      window.__p012PointerOwners = [];
      document.addEventListener(
        'pointerdown',
        (event) => {
          const row = event.target.closest('[data-signal-id]');
          if (row) window.__p012PointerOwners.push(row.dataset.signalId);
        },
        true,
      );
    });
    await page.click(
      `#eye-signal-list button[data-signal-id="${signalIds[0]}"]`,
    );
    await page.click(
      `#eye-signal-list button[data-signal-id="${signalIds[1]}"]`,
    );
    await new Promise((resolve) => setTimeout(resolve, 2100));
    const liveState = await page.evaluate(() => ({
      selected: window.__eyeinsky.selectedId,
      viewerSelected:
        window.__godsEyeView.viewer.selectedEntity?.properties?.usgsId?.getValue?.() ||
        null,
      pointerOwners: window.__p012PointerOwners,
    }));
    liveSelection = { expected: signalIds[1], ...liveState };
    check(
      'live-selection-a-b',
      liveSelection.expected === liveSelection.selected &&
        liveSelection.selected === liveSelection.viewerSelected &&
        liveSelection.pointerOwners?.at(-1) === liveSelection.expected,
      liveSelection,
      'LIVE USGS',
    );
  } catch (error) {
    check(
      'live-selection-a-b',
      false,
      { unavailable: String(error?.message || error) },
      'LIVE USGS',
    );
  }

  if (
    await page.evaluate(() => document.body.dataset.eyeInspecting === 'true')
  ) {
    await page.click('#eye-mission-dock-close');
    await new Promise((resolve) => setTimeout(resolve, 260));
  }
  await page.click('#eye-panel-close');
  await new Promise((resolve) => setTimeout(resolve, 260));
  await page.click('[data-eye-active-add]');
  await new Promise((resolve) => setTimeout(resolve, 260));
  await page.click('#eye-panel-close');
  await new Promise((resolve) => setTimeout(resolve, 260));
  await page.click('[data-eye-active-add]');
  await new Promise((resolve) => setTimeout(resolve, 260));
  await page.click('#eye-panel-close');
  await new Promise((resolve) => setTimeout(resolve, 260));
  await page.click('[data-eye-active-add]');
  await new Promise((resolve) => setTimeout(resolve, 260));
  const reentry = await page.evaluate(() => ({
    hidden: document.getElementById('eye-workspace').hidden,
    inert: document.getElementById('eye-workspace').inert,
    title: document.getElementById('eye-panel-title').textContent,
    kickerHidden: document
      .getElementById('eye-panel-kicker')
      .getAttribute('aria-hidden'),
  }));
  check(
    'motion-reentry-and-stable-text',
    !reentry.hidden &&
      !reentry.inert &&
      reentry.title === 'Capas y disponibilidad' &&
      reentry.kickerHidden === 'true',
    reentry,
  );
  await interactionContext.close();

  const reducedContext = await browser.createBrowserContext();
  const reduced = await readyPage(
    reducedContext,
    { width: 1440, height: 900 },
    true,
  );
  await reduced.evaluate(() =>
    window.__godsEyeView.viewer.camera.setView({
      destination: window.__CESIUM__.Cartesian3.fromDegrees(-99, 19, 900_000),
    }),
  );
  await reduced.click('#eye-home');
  await new Promise((resolve) => setTimeout(resolve, 40));
  const reducedState = await reduced.evaluate(() => ({
    activeFlight: Boolean(window.__godsEyeView.viewer.camera._currentFlight),
    altitude: window.__godsEyeView.styleManager.getCameraState().alt,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  check(
    'reduced-motion-final-state',
    reducedState.reduced &&
      !reducedState.activeFlight &&
      reducedState.altitude >= 17_000_000,
    reducedState,
  );
  const reducedFit = await reduced.evaluate(async () => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const nav = window.__godsEyeView.styleManager._navigation;
    viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(-99, 19, 650_000),
    });
    const positions = [
      { position: C.Cartesian3.fromDegrees(0, 0, 400_000) },
      { position: C.Cartesian3.fromDegrees(180, 0, 400_000) },
    ];
    const scheduled = nav.requestLayerFit('satellites', positions, 1);
    await new Promise((resolve) => setTimeout(resolve, 40));
    return {
      scheduled,
      outcome: nav._lastLayerFitResult,
      activeFlight: Boolean(viewer.camera._currentFlight),
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      camera: window.__godsEyeView.styleManager.getCameraState(),
    };
  });
  check(
    'reduced-motion-layer-fit-no-flight',
    reducedFit.reduced &&
      reducedFit.scheduled &&
      reducedFit.outcome?.status === 'fitted' &&
      !reducedFit.activeFlight,
    reducedFit,
    'FIXTURE on live NavigationController',
  );
  await reduced.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'no-preference' },
  ]);
  const motionPreferenceChange = await reduced.evaluate(async () => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const nav = window.__godsEyeView.styleManager._navigation;
    viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(-99, 19, 650_000),
    });
    const scheduled = nav.requestLayerFit(
      'satellites',
      [
        { position: C.Cartesian3.fromDegrees(0, 0, 400_000) },
        { position: C.Cartesian3.fromDegrees(180, 0, 400_000) },
      ],
      2,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    const state = {
      scheduled,
      outcome: nav._lastLayerFitResult,
      activeFlight: Boolean(viewer.camera._currentFlight),
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    nav.interruptHumanNavigation('qa-preference-change');
    return state;
  });
  check(
    'reduced-motion-preference-change-session',
    !motionPreferenceChange.reduced &&
      motionPreferenceChange.scheduled &&
      motionPreferenceChange.outcome?.status === 'fitting' &&
      motionPreferenceChange.activeFlight,
    motionPreferenceChange,
    'FIXTURE on live NavigationController',
  );
  await reducedContext.close();

  result.completedAt = new Date().toISOString();
  result.summary = {
    total: result.checks.length,
    passed: result.checks.filter((entry) => entry.ok).length,
    failed: result.checks.filter((entry) => !entry.ok).length,
    live: result.checks.filter((entry) => entry.kind.startsWith('LIVE')).length,
    fixture: result.checks.filter((entry) => entry.kind.includes('FIXTURE'))
      .length,
  };
  result.status =
    result.summary.failed === 0 && result.pageErrors.length === 0
      ? 'pass'
      : 'fail';
} catch (error) {
  result.completedAt = new Date().toISOString();
  result.status = 'error';
  result.fatal = String(error?.stack || error);
} finally {
  await browser.close();
  await fs.rm(profile, { recursive: true, force: true });
  await fs.writeFile(
    path.join(out, 'p012-journey.json'),
    JSON.stringify(result, null, 2),
  );
}

if (result.status !== 'pass') process.exitCode = 1;
