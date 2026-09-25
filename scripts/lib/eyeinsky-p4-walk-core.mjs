/**
 * Recorrido canónico P4 · página principal (1280×800, perfil std, fixtures
 * OMM inyectados por la costura de red): fixture 123456, pick real con
 * puntero, INSPECCIONAR ISS y CubeSat, clic en el casco, rueda y SEGUIR,
 * tarjeta frente al casco, GNSS sin modelo, órbita caduca, acoplados.
 * Cada comprobación lleva el id de la matriz P4 que cubre.
 */
import { near, screenshot, sleep } from './eyeinsky-p4-run.mjs';
import {
  clickAction,
  layerProbe,
  modelEvents,
  modelStats,
  nasaCreditShown,
  pickFromGroup,
  probe,
  recordFramingRanges,
  trackById,
  waitForDock,
  waitModelReady,
} from './eyeinsky-p4-page.mjs';
import {
  cardVersusHull,
  projectedStability,
  visiblePointTarget,
} from './eyeinsky-p4-measure.mjs';
import { FIXTURE_NORAD, STALE_FIXTURE_NORAD } from './eyeinsky-p4-network.mjs';
import { modelScreen } from '../eyeinsky-p4-ux-probes.mjs';

export const ISS = 25544;
export const HST = 20580;
const ISS_INSPECT_RANGE_M = 8 * 72.068;
/** |TRACK_VIEW_FROM_LEO| = |(-450, -450, 350) km|. */
export const ORBIT_RANGE_M = Math.hypot(450_000, 450_000, 350_000);
const HULL_OFFSET_PX = 52;
/** clamp(8·0.149, 6 m, 5 km): el suelo del encuadre INSPECCIONAR. */
const CUBESAT_INSPECT_RANGE_M = 6;

const shot = (ctx, page, name) => screenshot(ctx.result, ctx.out, page, name);

/** P4-02/P4-19/P4-01/P4-03/P4-06/P4-18: el fixture OMM de 6 dígitos. */
export async function sixDigitFixture(ctx, page) {
  const { catalog, state } = await selectFixture(ctx, page);
  const p = state.properties ?? {};
  ctx.check(
    'formato-epoca-descarga-cache-edad-son-campos-distintos',
    p.elementFormat === 'omm' &&
      p.elementEpoch &&
      p.fetchedAt &&
      p.elementEpoch !== p.fetchedAt &&
      ['HIT', 'MISS', 'STALE-ERROR', 'NONE'].includes(p.cacheStatus) &&
      p.elementAge === 'vigente',
    p,
    'P4-03',
  );
  ctx.check(
    'nombre-de-iss-no-da-modelo-especifico',
    p.geometryFidelity === 'none' &&
      p.modelAsset === '' &&
      state.chips.includes('SIN MODELO — punto SGP4') &&
      state.inspect?.disabled === true,
    { name: p.name, fidelity: p.geometryFidelity, chips: state.chips },
    ['P4-06', 'P4-18'],
  );
  ctx.result.snapshots.fixture = { catalog, state };
  await sixDigitFollowAndShare(ctx, page);
}

/** El 123456 está en el catálogo sin NaN y se selecciona exacto. */
async function selectFixture(ctx, page) {
  const catalog = await page.evaluate((id) => {
    const module =
      window.__godsEyeView.dataManager.layers.get('satellites').module;
    const ids = module.getAllPositions(20000).map((row) => row.id);
    return {
      has: ids.includes(id),
      nanIds: ids.filter((value) => !Number.isFinite(value)).length,
      group: module._catalogGroupForTest(id),
    };
  }, FIXTURE_NORAD);
  const tracked = await trackById(page, FIXTURE_NORAD);
  await waitForDock(page, FIXTURE_NORAD);
  const state = await probe(page);
  const p = state.properties ?? {};
  ctx.check(
    'omm-6-digitos-en-catalogo-sin-nan',
    catalog.has && catalog.nanIds === 0 && catalog.group === 'stations',
    catalog,
    ['P4-19', 'P4-01'],
  );
  ctx.check(
    'omm-6-digitos-seleccion-exacta',
    tracked === true &&
      state.selected === FIXTURE_NORAD &&
      state.contextId === String(FIXTURE_NORAD) &&
      p.noradId === String(FIXTURE_NORAD) &&
      state.dockKey === `satellites:${FIXTURE_NORAD}` &&
      state.cameraOwner === `satellites:${FIXTURE_NORAD}`,
    { selected: state.selected, noradId: p.noradId, dock: state.dockKey },
    'P4-02',
  );
  return { catalog, state };
}

/** SEGUIR tras soltar la cámara y el enlace compartible del 123456. */
async function sixDigitFollowAndShare(ctx, page) {
  await releaseWithWheel(page);
  const released = await layerProbe(page);
  await clickAction(page, 'follow');
  await sleep(900);
  const refollowed = await layerProbe(page);
  ctx.check(
    'omm-6-digitos-seguir-exacto',
    !released.following &&
      released.selected === FIXTURE_NORAD &&
      refollowed.following &&
      refollowed.selected === FIXTURE_NORAD,
    { released: released.following, refollowed: refollowed.cameraOwner },
    'P4-02',
  );
  await sleep(700); // el ShareLinkManager escribe el hash con 500 ms de rebote
  const share = await page.evaluate(() => {
    const url = new URL(location.href);
    const params = new URLSearchParams(url.hash.slice(1));
    // Como copyLink(): el enlace vivo más la marca de copia `at`.
    params.set('at', String(Math.floor(Date.now() / 1000)));
    url.hash = params.toString();
    return { href: url.href, lo: params.get('lo') };
  });
  ctx.shareUrl = share.href;
  ctx.check(
    'omm-6-digitos-compartir-exacto',
    /(^|_)s\.t\.123456(_|$)/.test(share.lo ?? ''),
    share.lo,
    'P4-02',
  );
}

/** Rueda sobre el tercio superior del canvas: suelta la cámara (P3.1). */
export async function releaseWithWheel(page) {
  const box = await page.evaluate(() => {
    const rect =
      window.__godsEyeView.viewer.scene.canvas.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel({ deltaY: -240 });
  await sleep(700);
}

/** P4-11/P4-07: clic REAL con puntero sobre un punto visible. */
export async function pointerPick(ctx, page) {
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.layers
      .get('satellites')
      .module.stopTracking({ origin: 'user' }),
  );
  await page.evaluate(() => {
    const C = window.__CESIUM__;
    window.__godsEyeView.viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(-30, 20, 20_000_000),
    });
  });
  await sleep(1500);
  const target = await visiblePointTarget(page, [FIXTURE_NORAD]);
  if (!target) {
    ctx.check('pick-real-con-puntero', false, 'ningún punto visible', 'P4-11');
    return;
  }
  await page.mouse.click(target.x, target.y);
  await sleep(1200);
  const after = await probe(page);
  ctx.result.snapshots.pointerPick = { target, after };
  ctx.check(
    'pick-real-con-puntero',
    after.selected === target.id &&
      after.cameraOwner === `satellites:${target.id}` &&
      after.dockKey === `satellites:${target.id}`,
    {
      coords: { x: target.x, y: target.y },
      norad: target.id,
      owner: after.cameraOwner,
      selected: after.selected,
    },
    ['P4-11', 'P4-07'],
  );
}

/** P4-16/P4-04/P4-21/P4-22: INSPECCIONAR sobre la ISS con el tween. */
export async function inspectIss(ctx, page) {
  await trackById(page, ISS);
  await waitForDock(page, ISS);
  const orbit = await probe(page);
  const p = orbit.properties ?? {};
  ctx.check(
    'iss-contexto-honesto-sgp4-actitud-rotulada',
    orbit.contextStatus === 'predicted' &&
      /Posición calculada \(SGP4\)/.test(orbit.statusLine ?? '') &&
      p.attitude === 'lvlh-nominal-aprox' &&
      !/\d/.test(p.attitude) &&
      orbit.chips.includes('ACT. APROX.') &&
      orbit.chips.some((chip) =>
        /^CACHÉ · (ACIERTO|FALLO|OBSOLETA|SIN INFORME)$/.test(chip),
      ),
    { status: orbit.statusLine, attitude: p.attitude, chips: orbit.chips },
    ['P4-04', 'P4-21', 'P4-22'],
  );
  const ranges = await recordFramingRanges(page, () =>
    clickAction(page, 'inspect'),
  );
  const between = ranges.filter(
    (m) => m < 0.95 * ORBIT_RANGE_M && m > 1.05 * ISS_INSPECT_RANGE_M,
  );
  const ready = await waitModelReady(page, ISS);
  await sleep(1200);
  const landed = await probe(page);
  const screen = await modelScreen(page, ISS);
  ctx.result.snapshots.issInspect = {
    tweenFrames: between.length,
    landed,
    screen,
  };
  ctx.check(
    'iss-inspeccionar-escala-real-visible',
    ready &&
      between.length >= 3 &&
      near(landed.cameraRangeM, ISS_INSPECT_RANGE_M, 0.05) &&
      landed.selected === ISS &&
      landed.framing === 'inspect' &&
      screen.ok &&
      screen.diameterPx >= 24 &&
      landed.pointSize === 4 &&
      landed.pointShown === true,
    {
      ready,
      tweenFrames: between.length,
      landedM: landed.cameraRangeM,
      screen,
    },
    'P4-16',
  );
  ctx.check(
    'credito-nasa-con-modelo-activo',
    await nasaCreditShown(page),
    null,
    'P4-13',
  );
  await shot(ctx, page, 'p4-01-iss-inspect.png');
}

/** La tarjeta del seguido queda fuera de la esfera proyectada del modelo. */
export async function cardClearsHull(ctx, page, id, checkId) {
  const card = await cardVersusHull(page, id);
  ctx.result.snapshots[checkId] = card;
  return ctx.check(checkId, card.ok && card.clearancePx >= 0, card, 'P4-16');
}

/**
 * Hasta dónde puede estar la ISS de una cámara soltada (P3.1: el pointerdown
 * suelta la cámara) sin que nadie la haya reiniciado: el rango de inspección
 * más lo que la ISS recorre a 7,66 km/s mientras el arnés vuelve a mirar, con
 * 500 m de margen. Una cámara reiniciada a la órbita estaría a ~726 km.
 */
const releasedCameraBoundM = (elapsedMs) =>
  8 * 72.068 * 1.1 + 7.7 * elapsedMs + 500;

/** P4-17: clic REAL sobre el casco a 52 px del punto; SEGUIR lo recupera. */
export async function hullClick(ctx, page) {
  const screen = await modelScreen(page, ISS);
  if (!screen.ok) {
    ctx.check('clic-real-en-casco-no-deselecciona', false, screen, 'P4-17');
    return;
  }
  const x = screen.x + HULL_OFFSET_PX;
  const y = screen.y;
  const before = await layerProbe(page);
  const clickedAt = Date.now();
  await page.mouse.click(x, y);
  await sleep(150);
  const after = await layerProbe(page);
  const driftBoundM = releasedCameraBoundM(Date.now() - clickedAt);
  await shot(ctx, page, 'p4-02-hull-click.png');
  ctx.check(
    'clic-real-en-casco-no-deselecciona',
    screen.diameterPx / 2 > HULL_OFFSET_PX &&
      after.selected === ISS &&
      after.framing === 'inspect' &&
      after.cleared === before.cleared &&
      after.worldRangeM < driftBoundM,
    {
      click: { x, y },
      diameterPx: screen.diameterPx,
      cameraToIssM: after.worldRangeM,
      driftBoundM,
    },
    'P4-17',
  );
  await clickAction(page, 'follow');
  await sleep(900);
  const back = await layerProbe(page);
  ctx.check(
    'seguir-tras-clic-recupera-inspect',
    back.following && back.framing === 'inspect',
    { rangeM: back.cameraRangeM },
    'P4-13',
  );
}

/** Interrupción manual: la rueda suelta la cámara sin deseleccionar. */
export async function wheelInterrupt(ctx, page) {
  await releaseWithWheel(page);
  const released = await probe(page);
  await clickAction(page, 'follow');
  await sleep(900);
  const back = await layerProbe(page);
  ctx.check(
    'rueda-suelta-y-seguir-recupera',
    !released.following &&
      released.selected === ISS &&
      released.cameraStatus === 'selected-free' &&
      back.following &&
      near(back.cameraRangeM, ISS_INSPECT_RANGE_M, 0.05),
    { released: released.cameraStatus, backM: back.cameraRangeM },
    'P4-13',
  );
}

/** P4-23: con la ISS seguida, sus acoplados nunca reciben modelo. */
export async function dockedCompanions(ctx, page) {
  const state = await page.evaluate(() => {
    const entity = window.__godsEyeView.viewer.trackedEntity;
    return { details: entity?.gevLabelModel?.details ?? [] };
  });
  const stats = await modelStats(page);
  const docked = state.details.find((line) => /^DOCKED/.test(line)) ?? null;
  ctx.check(
    'acoplados-sin-modelo',
    stats.ids.every((id) => id === ISS),
    { docked, ids: stats.ids },
    'P4-23',
  );
}

/** ÓRBITA vuelve a TRACK_VIEW_FROM_LEO con el mismo NORAD. */
export async function backToOrbit(ctx, page) {
  await clickAction(page, 'inspect');
  await sleep(1500);
  const orbit = await probe(page);
  ctx.check(
    'orbita-vuelve-a-track-view-from-leo',
    orbit.framing === 'orbit' &&
      orbit.selected === ISS &&
      orbit.following &&
      near(orbit.cameraRangeM, ORBIT_RANGE_M, 0.05) &&
      orbit.inspect?.label === 'Inspeccionar',
    { rangeM: orbit.cameraRangeM },
    'P4-16',
  );
}

/** Reduced-motion: INSPECCIONAR y ÓRBITA aterrizan al instante. */
export async function reducedMotion(ctx, page) {
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  await clickAction(page, 'inspect');
  await sleep(150);
  const instant = await layerProbe(page);
  await clickAction(page, 'inspect');
  await sleep(150);
  const back = await layerProbe(page);
  ctx.check(
    'reduced-motion-instantaneo',
    instant.framing === 'inspect' &&
      near(instant.cameraRangeM, ISS_INSPECT_RANGE_M, 0.05) &&
      back.framing === 'orbit' &&
      near(back.cameraRangeM, ORBIT_RANGE_M, 0.05),
    { inspectM: instant.cameraRangeM, orbitM: back.cameraRangeM },
    'P4-13',
  );
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'no-preference' },
  ]);
}

/** P4-18/P4-16: CubeSat de familia en INSPECCIONAR, ≥ 24 px y estable. */
export async function cubesatInspect(ctx, page) {
  const cube = await pickFromGroup(page, 'cubesat');
  if (!cube) {
    ctx.check(
      'cubesat-familia-inspeccionar',
      false,
      'sin cubesat vigente',
      'P4-18',
    );
    return;
  }
  await waitForDock(page, cube.id);
  const before = await probe(page);
  await clickAction(page, 'inspect');
  const ready = await waitModelReady(page, cube.id);
  await sleep(1500);
  const after = await probe(page);
  const stability = await projectedStability(page, cube.id, 30);
  ctx.result.snapshots.cubesat = { cube, before, after, stability };
  ctx.check(
    'cubesat-familia-inspeccionar',
    before.chips.includes('MODELO · FAMILIA CUBESAT 1U') &&
      ready &&
      after.framing === 'inspect' &&
      near(after.cameraRangeM, CUBESAT_INSPECT_RANGE_M, 0.05),
    { cube, rangeM: after.cameraRangeM, chips: before.chips },
    'P4-18',
  );
  ctx.check(
    'cubesat-inspeccionar-24px-sin-jitter-ni-near-plane',
    stability.frames === 30 &&
      stability.minDiameterPx >= 24 &&
      stability.spreadXPx <= 2 &&
      stability.spreadYPx <= 2 &&
      stability.maxNearM < stability.minDistanceM,
    stability,
    'P4-16',
  );
  await cardClearsHull(ctx, page, cube.id, 'cubesat-tarjeta-no-cubre-modelo');
  await shot(ctx, page, 'p4-03-cubesat-inspect.png');
}

/** P4-06: un GNSS se queda en punto, acción deshabilitada con motivo visible. */
export async function gnssPointOnly(ctx, page) {
  const gnss = await pickFromGroup(page, 'gps-ops');
  if (!gnss) {
    ctx.check('gnss-sin-modelo', false, 'sin GPS vigente', 'P4-06');
    return;
  }
  await waitForDock(page, gnss.id);
  await sleep(600);
  const state = await probe(page);
  ctx.result.snapshots.gnss = { gnss, state };
  ctx.check(
    'gnss-sin-modelo-motivo-visible',
    state.chips.includes('SIN MODELO — punto SGP4') &&
      state.inspect?.disabled === true &&
      state.inspect.describedBy === 'eye-dock-action-reason' &&
      state.reason === 'Sin modelo curado: solo punto' &&
      state.stats.active === 0,
    { chips: state.chips, inspect: state.inspect, reason: state.reason },
    'P4-06',
  );
  ctx.check(
    'credito-nasa-retirado-sin-modelo',
    !(await nasaCreditShown(page)),
    state.stats,
    'P4-13',
  );
  await shot(ctx, page, 'p4-04-gnss-point.png');
}

/** P4-20: órbita caduca inyectada → sin modelo, punto y rótulo. */
export async function staleOrbit(ctx, page) {
  await trackById(page, STALE_FIXTURE_NORAD);
  await waitForDock(page, STALE_FIXTURE_NORAD);
  await sleep(1500);
  const state = await probe(page);
  const events = await modelEvents(page);
  ctx.result.snapshots.stale = state;
  ctx.check(
    'orbita-caduca-sin-modelo-con-rotulo',
    state.selected === STALE_FIXTURE_NORAD &&
      state.properties?.elementAge === 'caducada' &&
      state.chips.includes('SIN MODELO — órbita caducada') &&
      state.inspect?.disabled === true &&
      /caducada/i.test(state.reason ?? '') &&
      state.hasPoint &&
      !state.stats.ids.includes(STALE_FIXTURE_NORAD) &&
      !events.some((e) => e.noradId === STALE_FIXTURE_NORAD),
    { chips: state.chips, reason: state.reason, stats: state.stats },
    'P4-20',
  );
}
