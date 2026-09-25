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
import {
  createRecorder,
  finishRun,
  launchBrowser,
  near,
  prepareRun,
  screenshot as saveShot,
  sleep,
} from './lib/eyeinsky-p4-run.mjs';
import {
  clickAction,
  dockTargets,
  recordFramingRanges,
  nasaCreditShown,
  openApp as openLiveApp,
  pickFromGroup,
  probe,
  targetsOk,
  trackById,
  waitForDock,
  waitModelReady,
} from './lib/eyeinsky-p4-page.mjs';
import {
  cardOffset,
  modelScreen,
  trackedOnCanvas,
} from './eyeinsky-p4-ux-probes.mjs';

const ISS = 25544;
const ISS_INSPECT_RANGE_M = 8 * 72.068;
/** |TRACK_VIEW_FROM_LEO| = |(-450, -450, 350) km|. */
const ORBIT_RANGE_M = Math.hypot(450_000, 450_000, 350_000);
const HULL_OFFSET_PX = 52;

const { baseUrl, out, resultPath } = await prepareRun('eyeinsky-p4-ux.mjs');
const { result, check } = createRecorder({ url: baseUrl });
const { browser, close } = await launchBrowser('eye-p4-ux-');
const screenshot = (page, name) => saveShot(result, out, page, name);
const openApp = (url, viewport) => openLiveApp(browser, result, url, viewport);

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
  const ranges = await recordFramingRanges(page, () =>
    clickAction(page, 'inspect'),
  );
  const landed = await probe(page);
  const between = ranges.filter(
    (m) => m < 0.95 * ORBIT_RANGE_M && m > 1.05 * ISS_INSPECT_RANGE_M,
  );
  check(
    'inspeccionar-anima-sin-reduced-motion',
    between.length >= 3 &&
      near(ranges.at(-1), ISS_INSPECT_RANGE_M, 0.05) &&
      near(landed.cameraRangeM, ISS_INSPECT_RANGE_M, 0.05),
    {
      frames: ranges.length,
      intermediateFrames: between.length,
      firstM: ranges[0],
      landedM: landed.cameraRangeM,
    },
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

/**
 * Hasta dónde puede estar la ISS de una cámara soltada (P3.1: el pointerdown
 * suelta la cámara) sin que nadie la haya reiniciado: el rango de inspección
 * más lo que la ISS recorre a 7,66 km/s mientras el arnés vuelve a mirar, con
 * 500 m de margen. Una cámara reiniciada a la órbita estaría a ~726 km.
 */
const releasedCameraBoundM = (elapsedMs) =>
  8 * 72.068 * 1.1 + 7.7 * elapsedMs + 500;

async function hullClick(page) {
  const screen = await modelScreen(page, ISS);
  const x = screen.x + HULL_OFFSET_PX;
  const y = screen.y;
  const pickedThere = await pickAt(page, x, y);
  const before = await probe(page);
  const clickedAt = Date.now();
  await page.mouse.click(x, y);
  await sleep(150);
  const after = await probe(page);
  const driftBoundM = releasedCameraBoundM(Date.now() - clickedAt);
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
      after.worldRangeM < driftBoundM,
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
        driftBoundM,
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
  await close();
}
await finishRun(result, resultPath);
