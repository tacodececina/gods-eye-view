/**
 * Arnés de navegador de EYEINSKY P4 · T5/T6 — inspección, pick y expediente.
 *
 * Sobre la aplicación viva: INSPECCIONAR sobre la ISS (modelo ≥ 24 px y
 * retícula), ÓRBITA vuelve; un clic REAL sobre el casco a 52 px del punto no
 * deselecciona; la rueda suelta la cámara y SEGUIR recupera 'inspect';
 * reduced-motion aterriza al instante; chips del panel OBJETIVO; CubeSat de
 * familia; un GNSS sin modelo con la acción deshabilitada; crédito NASA sólo
 * con modelo activo; zoom del navegador al 200 % (CDP, como p31); y un
 * teléfono 390×844 con perfil 'low' (riel ALT · ÉPOCA · MODELO, botón ≥ 44 px).
 *
 * Uso: node scripts/eyeinsky-p4-ux.mjs <url> <directorio-de-salida>
 * El directorio de salida es OBLIGATORIO y no puede contener ya un result.json.
 * Nunca arranca servidor: apúntalo a uno vivo.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import {
  cardOffset,
  modelScreen,
  trackedOnCanvas,
} from './eyeinsky-p4-ux-probes.mjs';

const ISS = 25544;
const MODEL_READY_TIMEOUT_MS = 20_000;
const ISS_INSPECT_RANGE_M = 8 * 72.068;
/** |TRACK_VIEW_FROM_LEO| = |(-450, -450, 350) km|. */
const ORBIT_RANGE_M = Math.hypot(450_000, 450_000, 350_000);
const HULL_OFFSET_PX = 52;

const baseUrl = process.argv[2];
const out = process.argv[3];
if (!baseUrl || !out)
  throw new Error('uso: eyeinsky-p4-ux.mjs <url> <directorio-de-salida>');
const resultPath = path.join(out, 'result.json');
try {
  await fs.access(resultPath);
  throw new Error(
    `${resultPath} ya existe: usa un directorio nuevo por corrida para no sobrescribir evidencia`,
  );
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
await fs.mkdir(out, { recursive: true });

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-p4-ux-'));
const result = {
  startedAt: new Date().toISOString(),
  url: baseUrl,
  browserMode: 'perfil temporal nuevo, Chrome headless, GPU nativa',
  checks: [],
  snapshots: {},
  pageErrors: [],
  consoleErrors: [],
  screenshots: [],
};
const check = (id, ok, detail) => {
  result.checks.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${id}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const near = (value, target, tolerance) =>
  Number.isFinite(value) && Math.abs(value / target - 1) <= tolerance;

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  userDataDir: profileDir,
});

async function screenshot(page, name) {
  const file = path.join(out, name);
  await page.screenshot({ path: file });
  result.screenshots.push(file);
}

/** Página nueva con registro de errores y eventos de modelo. */
async function openApp(url, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (error) => result.pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  await page.evaluateOnNewDocument(() => {
    window.__p4ModelEvents = [];
    window.__p4Cleared = 0;
    window.addEventListener('gev:awareness-subject-cleared', () => {
      window.__p4Cleared += 1;
    });
    for (const type of ['model-ready', 'model-evicted', 'model-failed']) {
      window.addEventListener(`gev:satellite-${type}`, (event) =>
        window.__p4ModelEvents.push({ type, ...event.detail }),
      );
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.viewer &&
      window.__godsEyeView?.dataManager &&
      window.__CESIUM__ &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 120_000 },
  );
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('satellites', true, {
      origin: 'user',
    }),
  );
  await page.waitForFunction(
    (iss) => {
      const module =
        window.__godsEyeView.dataManager.layers.get('satellites')?.module;
      const stats = module?._satelliteModelStatsForTest?.();
      const ids = new Set(
        (module?.getAllPositions?.(5000) ?? []).map((row) => row.id),
      );
      return stats?.manifest === 'ready' && ids.has(iss);
    },
    { timeout: 60_000, polling: 250 },
    ISS,
  );
  return page;
}

/** Lo que el dock pinta del objetivo: clave, cámara, estado, acción, chips. */
const dockProbe = (page) =>
  page.evaluate(() => {
    const inspect = document.querySelector('[data-eye-dock-action="inspect"]');
    const dock = document.getElementById('eye-mission-dock');
    return {
      dockKey: dock?.dataset.contextKey ?? null,
      cameraStatus: dock?.dataset.cameraStatus ?? null,
      statusLine: document.querySelector('.eye-dock-status')?.textContent,
      inspect: inspect
        ? {
            label: inspect.textContent,
            disabled: inspect.disabled,
            title: inspect.title,
          }
        : null,
      chips: [...document.querySelectorAll('.eye-sat-chip')].map(
        (chip) => chip.textContent,
      ),
    };
  });

/** Estado legible del objetivo: capa, cámara, contexto y retícula + dock. */
const probe = async (page) => ({
  ...(await layerProbe(page)),
  ...(await dockProbe(page)),
});

const layerProbe = (page) =>
  page.evaluate(() => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const module =
      window.__godsEyeView.dataManager.layers.get('satellites').module;
    const params = module.getParams();
    const id = params.selectedSatTrackingId;
    const record = window.__gevContextStore?.entities?.get(String(id));
    const tracked = viewer.trackedEntity;
    const now = viewer.clock.currentTime;
    const following = tracked?.gevTrackedId === `satellites:${id}`;
    const info = module.getTrackedInfo();
    const world = info
      ? C.Cartesian3.fromDegrees(info.longitude, info.latitude, info.altitudeM)
      : null;
    return {
      selected: id,
      framing: module.getTrackedFraming(),
      contextFraming: record?.properties?.framing ?? null,
      contextStatus: record?.status ?? null,
      following,
      // Following: the EntityView offset IS the framing range. A world
      // distance would mix in the sample the preRender already advanced
      // (~100 m per frame at LEO speed).
      cameraRangeM: following
        ? C.Cartesian3.magnitude(viewer.camera.position)
        : null,
      worldRangeM: world
        ? C.Cartesian3.distance(viewer.camera.positionWC, world)
        : null,
      cleared: window.__p4Cleared,
      pointSize: tracked?.point?.pixelSize?.getValue(now) ?? null,
      pointAlpha: tracked?.point?.color?.getValue(now)?.alpha ?? null,
      hasPoint: Boolean(tracked?.point),
      stats: module._satelliteModelStatsForTest(),
    };
  });

const trackById = (page, id) =>
  page.evaluate(
    (norad) =>
      window.__godsEyeView.dataManager.layers
        .get('satellites')
        .module.trackById(norad, { origin: 'user' }),
    id,
  );

async function waitForDock(page, id) {
  await page.waitForFunction(
    (key) =>
      document.getElementById('eye-mission-dock')?.dataset.contextKey === key,
    { timeout: 10_000 },
    `satellites:${id}`,
  );
  await sleep(400);
}

const waitModelReady = (page, id) =>
  page
    .waitForFunction(
      (norad) =>
        window.__p4ModelEvents.some(
          (event) => event.type === 'model-ready' && event.noradId === norad,
        ) &&
        window.__godsEyeView.dataManager.layers
          .get('satellites')
          .module._satelliteModelStatsForTest()
          .ids.includes(norad),
      { timeout: MODEL_READY_TIMEOUT_MS, polling: 250 },
      id,
    )
    .then(() => true)
    .catch(() => false);

const nasaCreditShown = (page) =>
  page.evaluate(() =>
    (window.__godsEyeView.viewer.creditDisplay?._staticCredits ?? []).some(
      (credit) => String(credit?.html ?? '').includes('NASA 3D Resources'),
    ),
  );

const clickAction = (page, id) => page.click(`[data-eye-dock-action="${id}"]`);

/** Primer NORAD del grupo con elementos no caducados, o null. */
async function pickFromGroup(page, group) {
  const ids = await page.evaluate((wanted) => {
    const module =
      window.__godsEyeView.dataManager.layers.get('satellites').module;
    return module
      .getAllPositions(5000)
      .map((row) => row.id)
      .filter((id) => module._catalogGroupForTest(id) === wanted);
  }, group);
  for (const id of ids.slice(0, 25)) {
    await trackById(page, id);
    await sleep(300);
    const age = await page.evaluate(
      (norad) =>
        window.__gevContextStore?.entities?.get(String(norad))?.properties
          ?.elementAge,
      id,
    );
    if (age === 'vigente' || age === 'envejecida') return { id, age };
  }
  return null;
}

async function issOrbitReadout(page) {
  await trackById(page, ISS);
  await waitForDock(page, ISS);
  const before = await probe(page);
  result.snapshots.issOrbit = before;
  check(
    'iss-dock-orbita-inspeccionar-habilitado',
    before.inspect?.label === 'Inspeccionar' &&
      !before.inspect.disabled &&
      before.framing === 'orbit',
    before.inspect,
  );
  check(
    'estado-posicion-calculada-sgp4',
    /Posición calculada \(SGP4\)/.test(before.statusLine ?? '') &&
      before.contextStatus === 'predicted',
    before.statusLine,
  );
  const chipsOk =
    ['MODELO · ESPECÍFICO · NASA', 'ESCALA REAL', 'ACT. APROX.'].every((text) =>
      before.chips.includes(text),
    ) &&
    before.chips.some((text) => /^ÉPOCA · /.test(text)) &&
    before.chips.some((text) => /^CACHÉ · /.test(text));
  check('chips-iss-texto-correcto', chipsOk, before.chips);
}

async function inspectIss(page) {
  await issOrbitReadout(page);
  await clickAction(page, 'inspect');
  await sleep(150);
  const midway = await probe(page);
  await sleep(1400);
  const landed = await probe(page);
  check(
    'inspeccionar-anima-sin-reduced-motion',
    midway.cameraRangeM > 3 * ISS_INSPECT_RANGE_M &&
      near(landed.cameraRangeM, ISS_INSPECT_RANGE_M, 0.05),
    { midwayM: midway.cameraRangeM, landedM: landed.cameraRangeM },
  );
  check(
    'inspeccionar-conserva-norad-y-contexto',
    landed.selected === ISS &&
      landed.following &&
      landed.framing === 'inspect' &&
      landed.contextFraming === 'inspect' &&
      landed.inspect?.label === 'Órbita',
    landed,
  );
  await issNearField(page);
}

async function issNearField(page) {
  const ready = await waitModelReady(page, ISS);
  await sleep(800);
  const screen = await modelScreen(page, ISS);
  const reticle = await probe(page);
  result.snapshots.issInspect = { screen, reticle };
  check(
    'iss-modelo-mayor-24px-y-reticula',
    ready &&
      screen.ok &&
      screen.diameterPx >= 24 &&
      reticle.pointSize === 4 &&
      reticle.pointAlpha === 0.5 &&
      reticle.hasPoint,
    {
      ready,
      screen,
      pointSize: reticle.pointSize,
      pointAlpha: reticle.pointAlpha,
    },
  );
  const card = await cardOffset(page, ISS);
  check(
    'tarjeta-y-corchete-anclados-al-casco',
    card.ok && card.offsetPx < 4 && card.bracketOffsetPx < 4,
    card,
  );
  check('credito-nasa-con-modelo-activo', await nasaCreditShown(page), null);
  await screenshot(page, 'ux-01-iss-inspect.png');
}

/** Qué devuelve scene.pick en (x, y): null si nada es pickable ahí. */
const pickAt = (page, x, y) =>
  page.evaluate(
    ([px, py]) => {
      const C = window.__CESIUM__;
      const picked = window.__godsEyeView.viewer.scene.pick(
        new C.Cartesian2(px, py),
      );
      return picked
        ? String(picked.id?.gevTrackedId ?? picked.id ?? 'algo')
        : null;
    },
    [x, y],
  );

async function followBackToInspect(page, id) {
  await clickAction(page, 'follow');
  await sleep(900);
  const refollowed = await probe(page);
  check(
    id,
    refollowed.following &&
      refollowed.framing === 'inspect' &&
      near(refollowed.cameraRangeM, ISS_INSPECT_RANGE_M, 0.05),
    { rangeM: refollowed.cameraRangeM, framing: refollowed.framing },
  );
}

async function hullClick(page) {
  const screen = await modelScreen(page, ISS);
  const x = screen.x + HULL_OFFSET_PX;
  const y = screen.y;
  const pickedThere = await pickAt(page, x, y);
  const before = await probe(page);
  await page.mouse.click(x, y);
  await sleep(150);
  const after = await probe(page);
  await screenshot(page, 'ux-02-hull-click.png');
  // P3.1: any pointerdown on the globe hands the camera back (a click cannot
  // be told from the start of a drag). What P4-17 forbids is losing the
  // selection or resetting the camera: no subject-cleared, same NORAD and
  // framing, and the camera still beside the hull (not flown elsewhere).
  check(
    'clic-real-en-casco-52px-no-deselecciona',
    pickedThere === null &&
      screen.diameterPx / 2 > HULL_OFFSET_PX &&
      after.selected === ISS &&
      after.framing === 'inspect' &&
      after.cleared === before.cleared &&
      after.worldRangeM < 3000,
    {
      click: {
        x,
        y,
        offsetPx: HULL_OFFSET_PX,
        diameterPx: screen.diameterPx,
        pickedThere,
      },
      after: {
        selected: after.selected,
        framing: after.framing,
        following: after.following,
        cameraStatus: after.cameraStatus,
        subjectClearedEvents: after.cleared - before.cleared,
        cameraToIssM: after.worldRangeM,
      },
    },
  );
  await followBackToInspect(page, 'seguir-tras-clic-en-casco-recupera-inspect');
}

async function wheelAndFollow(page) {
  const box = await page.evaluate(() => {
    const rect =
      window.__godsEyeView.viewer.scene.canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(700);
  const released = await probe(page);
  check(
    'rueda-suelta-camara-sin-deseleccionar',
    !released.following &&
      released.selected === ISS &&
      released.cameraStatus === 'selected-free' &&
      released.framing === 'inspect',
    released,
  );
  await followBackToInspect(page, 'seguir-recupera-inspect');
}

async function backToOrbit(page) {
  await clickAction(page, 'inspect');
  await sleep(1500);
  const orbit = await probe(page);
  check(
    'orbita-vuelve-a-track-view-from-leo',
    orbit.framing === 'orbit' &&
      orbit.selected === ISS &&
      orbit.following &&
      near(orbit.cameraRangeM, ORBIT_RANGE_M, 0.05) &&
      orbit.inspect?.label === 'Inspeccionar',
    { rangeM: orbit.cameraRangeM, expectedM: ORBIT_RANGE_M },
  );
}

async function reducedMotion(page) {
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await clickAction(page, 'inspect');
  await sleep(150);
  const instant = await probe(page);
  check(
    'reduced-motion-inspeccionar-instantaneo',
    instant.framing === 'inspect' &&
      near(instant.cameraRangeM, ISS_INSPECT_RANGE_M, 0.05),
    { after150msM: instant.cameraRangeM },
  );
  await clickAction(page, 'inspect');
  await sleep(150);
  const back = await probe(page);
  check(
    'reduced-motion-orbita-instantanea',
    back.framing === 'orbit' && near(back.cameraRangeM, ORBIT_RANGE_M, 0.05),
    { after150msM: back.cameraRangeM },
  );
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'no-preference' },
  ]);
}

async function cubesatFamily(page) {
  const cube = await pickFromGroup(page, 'cubesat');
  if (!cube) {
    check(
      'cubesat-familia-inspeccionar',
      false,
      'ningún cubesat con elementos vigentes',
    );
    return;
  }
  await waitForDock(page, cube.id);
  const before = await probe(page);
  await clickAction(page, 'inspect');
  const ready = await waitModelReady(page, cube.id);
  await sleep(1200);
  const after = await probe(page);
  result.snapshots.cubesat = { cube, before, after };
  check(
    'cubesat-familia-inspeccionar',
    before.chips.includes('MODELO · FAMILIA CUBESAT 1U') &&
      before.inspect &&
      !before.inspect.disabled &&
      after.framing === 'inspect' &&
      ready,
    { cube, chips: before.chips, ready, rangeM: after.cameraRangeM },
  );
  await screenshot(page, 'ux-03-cubesat-family.png');
}

async function gnssPointOnly(page) {
  const gnss = await pickFromGroup(page, 'gps-ops');
  if (!gnss) {
    check(
      'gnss-sin-modelo-accion-deshabilitada',
      false,
      'ningún GPS con elementos vigentes',
    );
    return;
  }
  await waitForDock(page, gnss.id);
  await sleep(600);
  const state = await probe(page);
  result.snapshots.gnss = { gnss, state };
  check(
    'gnss-sin-modelo-accion-deshabilitada',
    state.chips.includes('SIN MODELO — punto SGP4') &&
      state.inspect?.disabled === true &&
      state.inspect.title === 'Sin modelo curado: solo punto',
    { gnss, chips: state.chips, inspect: state.inspect },
  );
  check(
    'credito-nasa-retirado-sin-modelo',
    !(await nasaCreditShown(page)) && state.stats.active === 0,
    state.stats,
  );
  await screenshot(page, 'ux-04-gnss-point.png');
}

/** Objetivos del dock: dentro, alcanzables y ≥ 44 px; texto esencial ≥ 13 px. */
const dockTargets = (page) =>
  page.evaluate(() => {
    const viewport = window.visualViewport;
    const dock = document.getElementById('eye-mission-dock');
    const visible = (element) =>
      Boolean(element?.getClientRects().length) &&
      getComputedStyle(element).visibility !== 'hidden' &&
      getComputedStyle(element).display !== 'none';
    const measure = (element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return {
        label:
          element.textContent?.trim() || element.getAttribute('aria-label'),
        width: box.width,
        height: box.height,
        inside:
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= viewport.width + 1 &&
          box.bottom <= viewport.height + 1,
        hit: Boolean(hit && (hit === element || element.contains(hit))),
      };
    };
    const text = [
      ...dock.querySelectorAll(
        '.eye-dock-title, .eye-dock-action, .eye-dock-keyvalue dt, .eye-dock-keyvalue dd, .eye-dock-status',
      ),
    ]
      .filter(visible)
      .map((element) => ({
        text: element.textContent?.trim(),
        size: Number.parseFloat(getComputedStyle(element).fontSize),
      }));
    return {
      scale: viewport.scale,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      buttons: [...dock.querySelectorAll('button')]
        .filter(visible)
        .map(measure),
      rail: [...dock.querySelectorAll('.eye-dock-keyvalue')]
        .filter(visible)
        .map((item) => item.textContent),
      text,
    };
  });

const targetsOk = (m) =>
  m.overflowX <= 0 &&
  m.buttons.length > 0 &&
  m.buttons.every(
    (b) => b.inside && b.hit && b.width >= 44 && b.height >= 44,
  ) &&
  m.text.length > 0 &&
  m.text.every((t) => t.size >= 13);

async function zoom200(page) {
  await trackById(page, ISS);
  await waitForDock(page, ISS);
  const client = await page.createCDPSession();
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await sleep(500);
  const zoomed = await dockTargets(page);
  result.snapshots.zoom200 = zoomed;
  check(
    'zoom-200-dock-alcanzable-y-legible',
    zoomed.scale === 2 &&
      targetsOk(zoomed) &&
      zoomed.buttons.some((b) => /Inspeccionar/.test(b.label)),
    zoomed,
  );
  await screenshot(page, 'ux-05-zoom-200.png');
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await client.detach();
}

/**
 * Con el dock abierto en el teléfono, el objetivo seguido debe proyectarse en
 * el área libre ENCIMA del dock: en su centro hay canvas, no el dock.
 */
async function mobileTargetVisible(page, id) {
  const hit = await trackedOnCanvas(page, ISS);
  result.snapshots[id] = hit;
  check(
    id,
    hit.ok &&
      hit.dockBandPx > 0 &&
      hit.hitTag === 'CANVAS' &&
      hit.y < hit.freeBottomPx,
    hit,
  );
}

async function mobileLow() {
  const page = await openApp(baseUrl, {
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const stats = await page.evaluate(() =>
    window.__godsEyeView.dataManager.layers
      .get('satellites')
      .module._satelliteModelStatsForTest(),
  );
  check('movil-390-perfil-low', stats.profile === 'low', stats);
  await trackById(page, ISS);
  await waitForDock(page, ISS);
  const layout = await dockTargets(page);
  result.snapshots.mobile = layout;
  const inspectButton = layout.buttons.find((b) =>
    /Inspeccionar/.test(b.label),
  );
  check(
    'movil-riel-alt-epoca-modelo',
    layout.rail.length === 3 &&
      /^ALT/.test(layout.rail[0]) &&
      /^ÉPOCA/.test(layout.rail[1]) &&
      /^MODELO/.test(layout.rail[2]),
    layout.rail,
  );
  check(
    'movil-boton-inspeccionar-44px-y-dock-alcanzable',
    Boolean(inspectButton) && targetsOk(layout),
    { inspectButton, overflowX: layout.overflowX },
  );
  await mobileTargetVisible(page, 'movil-orbita-punto-sobre-canvas');
  await page.tap('[data-eye-dock-action="inspect"]');
  const ready = await waitModelReady(page, ISS);
  await sleep(1200);
  const after = await probe(page);
  check(
    'movil-tap-inspeccionar-modelo-low',
    after.framing === 'inspect' && ready && after.stats.active <= 1,
    { framing: after.framing, ready, stats: after.stats },
  );
  await mobileTargetVisible(page, 'movil-inspeccionar-modelo-sobre-canvas');
  await screenshot(page, 'ux-06-mobile-390-low.png');
  await page.close();
}

try {
  const url = new URL(baseUrl);
  url.searchParams.set('satModels', 'std');
  const page = await openApp(url.href, { width: 1280, height: 800 });
  await inspectIss(page);
  await hullClick(page);
  await wheelAndFollow(page);
  await backToOrbit(page);
  await reducedMotion(page);
  await cubesatFamily(page);
  await gnssPointOnly(page);
  await zoom200(page);
  await page.close();
  await mobileLow();
  check(
    'sin-errores-de-pagina',
    result.pageErrors.length === 0,
    result.pageErrors,
  );
} catch (error) {
  result.fatal = String(error?.stack ?? error);
  console.error(error);
} finally {
  result.finishedAt = new Date().toISOString();
  result.passed =
    !result.fatal && result.checks.every((entry) => entry.ok === true);
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  await browser.close();
  await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
}
console.log(
  JSON.stringify(
    {
      passed: result.passed,
      checks: result.checks.map(({ id, ok }) => ({ id, ok })),
      fatal: result.fatal ?? null,
    },
    null,
    2,
  ),
);
process.exitCode = result.passed ? 0 : 1;
