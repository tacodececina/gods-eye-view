import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://127.0.0.1:4197/';
const outputPath = process.argv[3];
if (!outputPath) throw new Error('output path required');

const result = {
  url,
  startedAt: new Date().toISOString(),
  checks: [],
  capabilities: {},
  requests: [],
  errors: [],
  console: [],
};
const check = (id, ok, detail) =>
  result.checks.push({ id, ok: Boolean(ok), detail });

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
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    window.__eyeMediaPlayEvents = 0;
    document.addEventListener(
      'play',
      () => {
        window.__eyeMediaPlayEvents += 1;
      },
      true,
    );
  });
  page.on('pageerror', (error) =>
    result.errors.push(String(error?.stack || error)),
  );
  page.on('console', (message) => {
    const text = message.text();
    if (/\[(?:Data|Transit|Bikeshare|Traffic|CCTV)/i.test(text))
      result.console.push({ type: message.type(), text: text.slice(0, 500) });
  });
  page.on('response', (response) => {
    const responseUrl = response.url();
    if (/\/api\/(launches|transit|gbfs|overpass|cctv)/.test(responseUrl)) {
      result.requests.push({ url: responseUrl, status: response.status() });
    }
  });

  const ready = () =>
    page.waitForFunction(
      () =>
        window.__eyeinsky &&
        window.__godsEyeView &&
        document.querySelector('#loading-screen')?.classList.contains('hidden'),
      { timeout: 90_000 },
    );
  const openView = async (view) => {
    const commandLabels = {
      catalog: 'Catálogo de fuentes',
      display: 'Apariencia y destinos',
      sensors: 'Cámaras y radio',
      preferences: 'Voz y preferencias',
    };
    await page.click('#eye-command-open');
    await page.type('#eye-command-search', commandLabels[view]);
    await page.waitForSelector('#eye-command-list [data-eye-action]');
    await page.click('#eye-command-list [data-eye-action]');
    await page.waitForFunction(
      (id) => !document.querySelector(`[data-eye-panel="${id}"]`)?.hidden,
      { timeout: 10_000 },
      view,
    );
  };
  const enableLayer = async (id) => {
    await openView('catalog');
    const selector = `#data-toggles [data-layer-id="${id}"]`;
    await page.evaluate((layerId) => {
      document
        .querySelector(`#data-toggles [data-layer-id="${layerId}"]`)
        ?.scrollIntoView({ block: 'center' });
    }, id);
    await page.waitForSelector(`${selector} .data-toggle-btn`);
    await page.waitForFunction(
      (rowSelector) =>
        document
          .querySelector(`${rowSelector} .data-toggle-btn`)
          ?.getAttribute('aria-disabled') !== 'true',
      { timeout: 30_000 },
      selector,
    );
    const access = await page.evaluate((rowSelector) => {
      const row = document.querySelector(rowSelector);
      const button = row?.querySelector('.data-toggle-btn');
      return {
        visible: Boolean(
          row?.getClientRects().length && button?.getClientRects().length,
        ),
        disabled: Boolean(button?.disabled),
        ariaDisabled: button?.getAttribute('aria-disabled'),
        ariaBusy: button?.getAttribute('aria-busy'),
        label: row?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    }, selector);
    if (!access.visible || access.disabled)
      throw new Error(`Layer ${id} has no usable catalog control`);
    const enabled = await page.evaluate(
      (layerId) => window.__godsEyeView.dataManager.isEnabled(layerId),
      id,
    );
    if (!enabled) {
      await page.locator(`${selector} .data-toggle-btn`).click();
    }
    await page.waitForFunction(
      (layerId) => window.__godsEyeView.dataManager.isEnabled(layerId),
      { timeout: 30_000 },
      id,
    );
    return access;
  };
  const disableLayer = async (id) => {
    await openView('catalog');
    const selector = `#data-toggles [data-layer-id="${id}"]`;
    await page.evaluate((layerId) => {
      document
        .querySelector(`#data-toggles [data-layer-id="${layerId}"]`)
        ?.scrollIntoView({ block: 'center' });
    }, id);
    if (
      await page.evaluate(
        (layerId) => window.__godsEyeView.dataManager.isEnabled(layerId),
        id,
      )
    ) {
      await page.locator(`${selector} .data-toggle-btn`).click();
    }
    await page.waitForFunction(
      (layerId) => !window.__godsEyeView.dataManager.isEnabled(layerId),
      { timeout: 30_000 },
      id,
    );
  };
  const closeView = async () => {
    await page.click('#eye-panel-close');
    await page.waitForFunction(
      () => document.querySelector('#eye-workspace')?.hidden === true,
      { timeout: 10_000 },
    );
  };
  const layerSnapshot = (id) =>
    page.evaluate((layerId) => {
      const manager = window.__godsEyeView.dataManager;
      const entry = manager.getAll().find((item) => item.id === layerId);
      return {
        enabled: manager.isEnabled(layerId),
        stats: entry?.stats || null,
      };
    }, id);
  const waitForData = async (id, timeout = 90_000) => {
    await page.waitForFunction(
      (layerId) => {
        const entry = window.__godsEyeView.dataManager
          .getAll()
          .find((item) => item.id === layerId);
        return entry?.stats?.count > 0 || Boolean(entry?.stats?.error);
      },
      { timeout },
      id,
    );
    return layerSnapshot(id);
  };
  const searchCoordinate = async (latitude, longitude) => {
    await openView('display');
    await page.click('#location-search');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.type('#location-search', `${latitude}, ${longitude}`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (lat, lon) => {
        const camera = window.__godsEyeView.styleManager.getCameraState();
        return (
          !document
            .querySelector('#location-search')
            ?.classList.contains('searching') &&
          Math.abs(camera.lat - lat) < 0.03 &&
          Math.abs(camera.lon - lon) < 0.03
        );
      },
      { timeout: 90_000 },
      latitude,
      longitude,
    );
    return page.evaluate(() =>
      window.__godsEyeView.styleManager.getCameraState(),
    );
  };
  const pickContact = (layerId, excludedSourceId = null) =>
    page.evaluate(
      (id, excluded) => {
        const app = window.__godsEyeView;
        const module = app.dataManager.layers.get(id)?.module;
        const scene = app.viewer.scene;
        const canvasRect = scene.canvas.getBoundingClientRect();
        const contacts =
          module?.getDetectableObjects?.({ maxCount: 1200 }) || [];
        for (const contact of contacts) {
          if (!contact?.position || contact.sourceId === excluded) continue;
          const point = scene.cartesianToCanvasCoordinates(contact.position);
          if (
            !point ||
            point.x < 8 ||
            point.y < 8 ||
            point.x > canvasRect.width - 8 ||
            point.y > canvasRect.height - 8
          )
            continue;
          const pageX = canvasRect.left + point.x;
          const pageY = canvasRect.top + point.y;
          if (document.elementFromPoint(pageX, pageY) !== scene.canvas)
            continue;
          const picked = scene.pick(point);
          const pickedId =
            typeof picked?.primitive?.id === 'string'
              ? picked.primitive.id
              : typeof picked?.id === 'string'
                ? picked.id
                : typeof picked?.id?.id === 'string'
                  ? picked.id.id
                  : null;
          if (pickedId !== contact.sourceId) continue;
          const cartographic = scene.globe.ellipsoid.cartesianToCartographic(
            contact.position,
          );
          return {
            sourceId: contact.sourceId,
            x: pageX,
            y: pageY,
            pickedId,
            latitude: (cartographic.latitude * 180) / Math.PI,
            longitude: (cartographic.longitude * 180) / Math.PI,
            height: cartographic.height,
          };
        }
        return null;
      },
      layerId,
      excludedSourceId,
    );

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await ready();

  const launchAccess = await enableLayer('rocket-launches');
  const launchLayer = await waitForData('rocket-launches', 120_000);
  await openView('preferences');
  await page.waitForSelector('[data-mission-roster-index]');
  const launchBefore = await page.evaluate(() => {
    const button = document.querySelector('[data-mission-roster-index]');
    return {
      rosterCount: document.querySelectorAll('[data-mission-roster-index]')
        .length,
      id: button?.dataset.missionRosterId || null,
    };
  });
  await page.evaluate(() =>
    document.querySelector('[data-mission-roster-index]')?.click(),
  );
  await page.waitForFunction(
    () => {
      const panel = document.querySelector('#space-mission-panel');
      const title = panel?.querySelector('[data-mission-title]')?.textContent;
      return panel && !panel.hidden && title && title !== 'MISSION';
    },
    { timeout: 30_000 },
  );
  const launchRender = await page.evaluate((id) => {
    const viewer = window.__godsEyeView.viewer;
    let entity = null;
    for (let i = 0; i < viewer.dataSources.length; i += 1) {
      entity = viewer.dataSources
        .get(i)
        .entities?.getById?.(`rocket-launch:${id}`);
      if (entity) break;
    }
    const position = entity?.position?.getValue(viewer.clock.currentTime);
    const cartographic = position
      ? viewer.scene.globe.ellipsoid.cartesianToCartographic(position)
      : null;
    return {
      selectedEntityId: entity?.id || null,
      expectedId: `rocket-launch:${id}`,
      panelTitle:
        document.querySelector('#space-mission-panel [data-mission-title]')
          ?.textContent || null,
      latitude: cartographic ? (cartographic.latitude * 180) / Math.PI : null,
      longitude: cartographic ? (cartographic.longitude * 180) / Math.PI : null,
      shown: entity?.show !== false,
    };
  }, launchBefore.id);
  result.capabilities.launchLibrary = {
    access:
      'Catálogo de fuentes → Space Missions (30d); roster in Voz y preferencias',
    action: 'toggle layer, then click the first real mission roster item',
    endpoint: '/api/launches',
    control: launchAccess,
    stats: launchLayer.stats,
    roster: launchBefore,
    render: launchRender,
  };
  check(
    'launch-library-ui-data-selection-render',
    launchLayer.stats?.count > 0 &&
      launchBefore.rosterCount > 0 &&
      launchRender.selectedEntityId === launchRender.expectedId &&
      launchRender.shown &&
      Number.isFinite(launchRender.latitude),
    result.capabilities.launchLibrary,
  );

  // Launch selection temporarily owns the camera and enables its satellite
  // dependency. Start the proximity-source leg from a clean application
  // lifetime so its catalog gestures and camera gates are measured alone.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
  await ready();

  const bostonCamera = await searchCoordinate(42.3601, -71.0589);
  const transitAccess = await enableLayer('transit');
  const transitLayer = await waitForData('transit', 120_000);
  let transitRender = { detectableCount: 0, sample: null };
  let transitPick = null;
  let transitSelected = false;
  if (transitLayer.stats?.count > 0) {
    await closeView();
    await page.waitForFunction(
      () =>
        window.__godsEyeView.dataManager.layers
          .get('transit')
          .module.getDetectableObjects({ maxCount: 1200 }).length > 0,
      { timeout: 30_000 },
    );
    transitRender = await page.evaluate(() => {
      const app = window.__godsEyeView;
      const contacts = app.dataManager.layers
        .get('transit')
        .module.getDetectableObjects({ maxCount: 1200 });
      const first = contacts[0];
      const cartographic = first?.position
        ? app.viewer.scene.globe.ellipsoid.cartesianToCartographic(
            first.position,
          )
        : null;
      return {
        detectableCount: contacts.length,
        sample: cartographic
          ? {
              sourceId: first.sourceId,
              latitude: (cartographic.latitude * 180) / Math.PI,
              longitude: (cartographic.longitude * 180) / Math.PI,
              height: cartographic.height,
            }
          : null,
      };
    });
    for (let attempt = 0; attempt < 5 && !transitSelected; attempt += 1) {
      transitPick = await pickContact('transit');
      if (!transitPick) break;
      await page.mouse.click(transitPick.x, transitPick.y);
      await new Promise((resolve) => setTimeout(resolve, 400));
      transitSelected = await page.evaluate(
        (id) =>
          window.__godsEyeView.dataManager.layers
            .get('transit')
            .module._transitStateForTest()._selectedKey === id,
        transitPick.sourceId,
      );
    }
  }
  result.capabilities.transit = {
    access:
      'Apariencia y destinos → búsqueda de coordenadas; Catálogo → Transit',
    action:
      'fly to Boston, enable GTFS-RT, confirm rendered contacts; record marker click attempt',
    endpoint: '/api/transit/vehicles/mbta',
    control: transitAccess,
    camera: bostonCamera,
    stats: transitLayer.stats,
    render: transitRender,
    picked: transitPick,
    selected: transitSelected,
  };
  check(
    'transit-live-render-and-pick',
    transitLayer.stats?.count > 0 &&
      transitLayer.stats?.feeds?.includes('mbta') &&
      transitRender.detectableCount > 0 &&
      Math.abs(transitRender.sample?.latitude - 42.3601) < 1 &&
      Math.abs(transitRender.sample?.longitude + 71.0589) < 1,
    result.capabilities.transit,
  );

  const bikeshareAccess = await enableLayer('bikeshare');
  const bikeshareLayer = await waitForData('bikeshare', 120_000);
  let bikesharePick = null;
  let bikeshareSelected = false;
  if (bikeshareLayer.stats?.count > 0) {
    await closeView();
    await page.waitForFunction(
      () =>
        window.__godsEyeView.dataManager.layers
          .get('bikeshare')
          .module.getDetectableObjects({ maxCount: 5000 }).length > 0,
      { timeout: 30_000 },
    );
    for (let attempt = 0; attempt < 5 && !bikeshareSelected; attempt += 1) {
      bikesharePick = await pickContact('bikeshare');
      if (!bikesharePick) break;
      await page.mouse.click(bikesharePick.x, bikesharePick.y);
      await new Promise((resolve) => setTimeout(resolve, 400));
      bikeshareSelected = await page.evaluate(
        (id) =>
          window.__godsEyeView.dataManager.layers
            .get('bikeshare')
            .module.getDetectableObjects({ maxCount: 5000 })
            .some((entry) => entry.sourceId === id && entry.skipLabel === true),
        bikesharePick.sourceId,
      );
    }
  }
  result.capabilities.bikeshare = {
    access: 'Apariencia y destinos → Boston; Catálogo → Bikeshare',
    action: 'enable GBFS proximity load and click a rendered station point',
    endpoint:
      '/api/gbfs/https%3A%2F%2Fgbfs.bluebikes.com%2Fgbfs%2Fen%2Fstation_information.json',
    control: bikeshareAccess,
    stats: bikeshareLayer.stats,
    picked: bikesharePick,
    selected: bikeshareSelected,
  };
  check(
    'bikeshare-live-render-and-pick',
    bikeshareLayer.stats?.count > 0 &&
      Boolean(bikesharePick) &&
      bikesharePick?.pickedId === bikesharePick?.sourceId &&
      bikeshareSelected,
    result.capabilities.bikeshare,
  );

  const mexicoCamera = await searchCoordinate(19.4326, -99.1332);
  const overpassAccess = await enableLayer('traffic');
  const trafficLayer = await waitForData('traffic', 120_000);
  const trafficRender = await page.evaluate(() => {
    const module =
      window.__godsEyeView.dataManager.layers.get('traffic').module;
    const objects = module.getDetectableObjects({ maxCount: 20 });
    const first = objects[0];
    const cartographic = first?.position
      ? window.__godsEyeView.viewer.scene.globe.ellipsoid.cartesianToCartographic(
          first.position,
        )
      : null;
    return {
      detectableCount: objects.length,
      sample: first
        ? {
            id: first.id,
            latitude: (cartographic.latitude * 180) / Math.PI,
            longitude: (cartographic.longitude * 180) / Math.PI,
            height: cartographic.height,
          }
        : null,
    };
  });
  result.capabilities.overpass = {
    access: 'Apariencia y destinos → CDMX; Catálogo → Street Traffic',
    action:
      'enable camera-gated traffic layer; render bounded OSM roads as moving dots',
    endpoint: 'POST /api/overpass (bounded bbox, traffic caller query)',
    control: overpassAccess,
    camera: mexicoCamera,
    stats: trafficLayer.stats,
    render: trafficRender,
  };
  check(
    'overpass-useful-payload-and-render',
    trafficLayer.stats?.count > 0 &&
      trafficRender.detectableCount > 0 &&
      Math.abs(trafficRender.sample?.latitude - 19.4326) < 1 &&
      Math.abs(trafficRender.sample?.longitude + 99.1332) < 1 &&
      trafficRender.sample?.height > -1000,
    result.capabilities.overpass,
  );

  await disableLayer('traffic');
  const austinCamera = await searchCoordinate(30.2672, -97.7431);
  const cctvAccess = await enableLayer('cctv');
  await page.waitForFunction(
    () => {
      const stats = window.__godsEyeView.dataManager.layers
        .get('cctv')
        .module.getStats();
      return (
        stats.count > 0 && (stats.loadingLoaded > 0 || stats.loading === false)
      );
    },
    { timeout: 120_000 },
  );
  await openView('sensors');
  await page.waitForSelector('#cctv-nearest-btn');
  await page.click('#cctv-nearest-btn');
  await page.waitForFunction(
    () =>
      Boolean(
        window.__godsEyeView.dataManager.layers.get('cctv').module.getUIState()
          .activeCameraId,
      ),
    { timeout: 30_000 },
  );
  await closeView();
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const cctvBefore = await page.evaluate(() => {
    const module = window.__godsEyeView.dataManager.layers.get('cctv').module;
    return { stats: module.getStats(), state: module.getUIState() };
  });
  let cctvPick = null;
  let cctvAfter = cctvBefore;
  let cctvSelected = false;
  let cctvSelectControl = null;
  cctvPick = await pickContact('cctv', cctvBefore.state.activeCameraId);
  if (!cctvPick) cctvPick = await pickContact('cctv');
  if (cctvPick) {
    await openView('sensors');
    cctvSelectControl = await page.evaluate((cameraId) => {
      const select = document.querySelector('#cctv-camera-select');
      return {
        visible: Boolean(select?.getClientRects().length),
        disabled: Boolean(select?.disabled),
        hasOption: Boolean(
          [...(select?.options || [])].some(
            (option) => option.value === cameraId,
          ),
        ),
      };
    }, cctvPick.sourceId);
    if (cctvSelectControl.hasOption) {
      await page.select('#cctv-camera-select', cctvPick.sourceId);
      await page.waitForFunction(
        (id) =>
          window.__godsEyeView.dataManager.layers
            .get('cctv')
            .module.getUIState().activeCameraId === id,
        { timeout: 30_000 },
        cctvPick.sourceId,
      );
      cctvSelected = true;
    }
    await closeView();
  }
  cctvAfter = await page.evaluate(() => {
    const module = window.__godsEyeView.dataManager.layers.get('cctv').module;
    return { stats: module.getStats(), state: module.getUIState() };
  });
  const activeCamera = cctvAfter.state.activeCamera;
  const coordinateDelta =
    activeCamera && cctvPick
      ? Math.hypot(
          activeCamera.lat - cctvPick.latitude,
          activeCamera.lon - cctvPick.longitude,
        )
      : null;
  result.capabilities.cctv = {
    access: 'Catálogo → CCTV; Cámaras y radio → Cámara más cercana',
    action:
      'enable, wait for geometry queue, focus nearest, scene-pick a globe billboard, then select that exact camera through the visible selector',
    endpoint: '/api/cctv/sources',
    control: cctvAccess,
    camera: austinCamera,
    before: {
      stats: cctvBefore.stats,
      activeCameraId: cctvBefore.state.activeCameraId,
    },
    picked: cctvPick,
    selectControl: cctvSelectControl,
    selected: cctvSelected,
    after: {
      stats: cctvAfter.stats,
      activeCameraId: cctvAfter.state.activeCameraId,
      activeCamera: activeCamera
        ? {
            id: activeCamera.id,
            latitude: activeCamera.lat,
            longitude: activeCamera.lon,
            sourceStatus: activeCamera.sourceStatus,
            sourceKind: activeCamera.sourceKind,
          }
        : null,
    },
    coordinateDeltaDegrees: coordinateDelta,
  };
  check(
    'cctv-geometry-visible-selectable',
    cctvAfter.stats?.count > 0 &&
      cctvAfter.stats?.loadingLoaded > 0 &&
      Boolean(cctvPick) &&
      cctvPick?.pickedId === cctvPick?.sourceId &&
      cctvSelectControl?.visible &&
      !cctvSelectControl?.disabled &&
      cctvSelectControl?.hasOption &&
      cctvSelected &&
      cctvAfter.state.activeCameraId === cctvPick?.sourceId &&
      coordinateDelta < 0.0001,
    result.capabilities.cctv,
  );

  const flightsAccess = await enableLayer('flights');
  const flights = await waitForData('flights', 120_000);
  const tracked = await page.evaluate(() => {
    const module =
      window.__godsEyeView.dataManager.layers.get('flights').module;
    const target = module.getAllPositions(100)[0];
    if (!target) return null;
    return {
      id: target.id,
      accepted: module.trackById(target.id, { origin: 'user' }),
      tracked: module.getTrackedInfo()?.icao24 || null,
    };
  });
  await page.waitForFunction(
    () => Boolean(window.__godsEyeView.viewer.trackedEntity),
    { timeout: 20_000 },
  );
  await page.click('#eye-home');
  await page.waitForFunction(
    () => {
      const state = window.__godsEyeView.styleManager.getCameraState();
      return (
        !window.__godsEyeView.viewer.trackedEntity && state.alt > 10_000_000
      );
    },
    { timeout: 30_000 },
  );
  await openView('display');
  await page.evaluate(() => {
    document
      .querySelector('[data-stack-id="osm"]')
      ?.scrollIntoView({ block: 'center' });
  });
  await page.click('[data-stack-id="osm"]');
  await page.waitForFunction(
    () => window.__godsEyeView.mapStackController.getActiveId() === 'osm',
    { timeout: 30_000 },
  );
  const regression = await page.evaluate(() => ({
    trackedEntity: window.__godsEyeView.viewer.trackedEntity?.id || null,
    camera: window.__godsEyeView.styleManager.getCameraState(),
    map: window.__godsEyeView.mapStackController.getActiveId(),
    mediaPlayEvents: window.__eyeMediaPlayEvents,
  }));
  result.regression = {
    flightsAccess,
    flights: flights.stats,
    tracked,
    ...regression,
  };
  check(
    'selection-tracking-home-and-map-change',
    flights.stats?.count > 0 &&
      tracked?.accepted &&
      tracked.tracked === tracked.id &&
      regression.trackedEntity === null &&
      regression.camera.alt > 10_000_000 &&
      regression.map === 'osm',
    result.regression,
  );
  check('media-no-autoplay', regression.mediaPlayEvents === 0, regression);
  check('no-page-errors', result.errors.length === 0, result.errors);

  await page.screenshot({
    path: path.join(path.dirname(outputPath), 'functional-final.png'),
  });
  result.status = result.checks.every((entry) => entry.ok) ? 'pass' : 'fail';
} catch (error) {
  result.status = 'error';
  result.error = String(error?.stack || error);
  await page
    ?.screenshot({
      path: path.join(path.dirname(outputPath), 'functional-failure.png'),
    })
    .catch(() => {});
} finally {
  result.endedAt = new Date().toISOString();
  await browser.close();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

if (result.status !== 'pass') process.exitCode = 1;
