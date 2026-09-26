/**
 * Arnés visual Editorial (fase visual, T0): convierte los principios de diseño
 * en comprobaciones medibles sobre la app viva.
 *
 *   node scripts/eyeinsky-visual.mjs <url> <directorio-de-salida>
 *
 * Nunca arranca servidor y rechaza un directorio con result.json. Mide en
 * reposo (sin interacción) a 1600×900 y 390×844, y aparte con movimiento
 * reducido. El día/noche del disco sale del lienzo de Cesium; el cielo y el
 * halo, de la captura COMPUESTA (lo que ve la persona: lienzo más cualquier
 * capa encima, como #scope-mask), sin los rectángulos de UI; y el contraste
 * del texto, de una captura SIN texto (fondo real bajo cada rótulo), nunca de
 * un fondo supuesto.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  createRecorder,
  finishRun,
  launchBrowser,
  prepareRun,
  sleep,
} from './lib/eyeinsky-p4-run.mjs';
import { openApp, trackById } from './lib/eyeinsky-p4-page.mjs';
import { readGlobeFlags } from '../src/ui/eyeinskyGlobeFlags.js';
import { measureMarkers, measurePhone } from './lib/eyeinsky-visual-t4t5.mjs';
import {
  checkCloseReleases,
  checkMoonValues,
  checkSimulationFoot,
  exploreRevealed,
  readRevealRegions,
  REST_ALLOWED,
  restRegionViolations,
} from './lib/eyeinsky-visual-reveal.mjs';
import {
  readRestState,
  readSatelliteState,
  readSkinState,
  readStory,
  readTargetPanel,
} from './lib/eyeinsky-visual-probes.mjs';
import {
  compositeOver,
  creditOverflow,
  diskDayNight,
  fontFaceLoaded,
  haloRing,
  luminanceContrast,
  overlaps,
  parseCssColor,
  regionLuminances,
  relativeLuminance,
  restSurfaceCount,
  skyStats,
  skyTint,
  telemetryAltitudeKm,
  terminatorAngleFromSun,
  textFloorViolations,
  worstCaseBackground,
} from './lib/eyeinsky-visual-checks.mjs';

const VIEWPORTS = [
  { width: 1600, height: 900 },
  { width: 390, height: 844 },
];
/** Familias del sistema Editorial (DESIGN-SYSTEM-EDITORIAL §3). */
const FONT_FAMILIES = ['Instrument Serif', 'Space Grotesk', 'IBM Plex Mono'];
const FONT_PROBES = [
  '16px "Instrument Serif"',
  'italic 16px "Instrument Serif"',
  '16px "Space Grotesk"',
  '400 16px "IBM Plex Mono"',
  '500 16px "IBM Plex Mono"',
];
/** Umbrales del cielo sobrio (V-14): p99 y densidad de píxeles brillantes. */
const SKY_P99_MAX = 0.45;
const SKY_BRIGHT_LUM = 0.2;
const SKY_BRIGHT_FRACTION_MAX = 0.001;
/** Terminador en pantalla para la pose solar (plan §2.3). */
const TERMINATOR_RANGE = [25, 35];
const DAY_NIGHT_RATIO_MAX = 0.3;
/** Cielo compuesto sin velo: G−R mediano < 3 y sin escalón de ojo de cerradura. */
const SKY_GREEN_CAST_MAX = 3;
const SKY_KEYHOLE_STEP_MAX = 0.003;
/** Telemetría con objetivo fijado: altura dentro de 2 km o 0,5 %. */
const TELEMETRY_ALT_TOLERANCE_KM = 2;
const TELEMETRY_ALT_TOLERANCE_REL = 0.005;
const TRACK_SETTLE_MS = 6000;
const HEADLINE_WINDOW_MS = 3000;

const { baseUrl, out, resultPath } = await prepareRun('eyeinsky-visual');
const { result, check } = createRecorder({
  url: baseUrl,
  harness: 'eyeinsky-visual',
  viewports: VIEWPORTS,
});

const suffixOf = ({ width, height }) => `${width}x${height}`;
const pageViewport = (viewport) => ({
  ...viewport,
  deviceScaleFactor: 1,
  isMobile: viewport.width <= 430,
  hasTouch: viewport.width <= 430,
});

async function decodePng(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: 4, data };
}

/** Espera la entrada (si existe), el vuelo y las teselas; luego asienta. */
async function waitForRest(page) {
  await page
    .waitForFunction(
      () =>
        document.body.dataset.eyeIntro !== 'running' &&
        !window.__godsEyeView.viewer.camera._currentFlight,
      { timeout: 12_000, polling: 100 },
    )
    .catch(() => {});
  await page
    .waitForFunction(
      () => window.__godsEyeView.viewer.scene.globe.tilesLoaded,
      { timeout: 25_000, polling: 250 },
    )
    .catch(() => {});
  await sleep(1500);
}

/** Lienzo de Cesium recién pintado, como PNG. */
const canvasPng = async (page) =>
  Buffer.from(
    await page.evaluate(() => {
      const viewer = window.__godsEyeView.viewer;
      viewer.render();
      return viewer.scene.canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );

/** Captura sin texto: el fondo real bajo cada rótulo. */
async function textlessShot(page) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = '__vis-notext';
    style.textContent =
      '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;transition:none!important;caret-color:transparent!important}::placeholder{color:transparent!important}';
    document.head.append(style);
  });
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const shot = await page.screenshot();
  await page.evaluate(() => document.getElementById('__vis-notext')?.remove());
  return shot;
}

/** Contraste AA de cada texto visible contra su fondo real (peor caso). */
function contrastFailures(texts, background) {
  const failures = [];
  for (const item of texts) {
    if (item.disabled) continue;
    const lums = regionLuminances(background, item.rect, 1);
    if (!lums.length) continue;
    const [r, g, b, a] = parseCssColor(item.color);
    const bgLum = lums.reduce((s, v) => s + v, 0) / lums.length;
    const grey = Math.round(255 * bgLum ** (1 / 2.2));
    const rgb = compositeOver([r, g, b, a * item.opacity], [grey, grey, grey]);
    const textLum = relativeLuminance(rgb);
    const worst = worstCaseBackground(lums, textLum);
    const ratio = luminanceContrast(textLum, worst);
    const large = item.size >= 24 || (item.size >= 18.66 && item.weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need)
      failures.push({
        text: item.text,
        key: item.key,
        size: item.size,
        ratio: Number(ratio.toFixed(2)),
        need,
      });
  }
  return failures;
}

async function measureViewport(browser, viewport) {
  const suffix = suffixOf(viewport);
  const mobile = viewport.width <= 430;
  const page = await openApp(browser, result, baseUrl, pageViewport(viewport), {
    enableSatellites: false,
    requireNorad: null,
  });
  const readyAt = Date.now();
  let storySeenAt = null;
  let storySeen = null;
  while (Date.now() - readyAt < HEADLINE_WINDOW_MS && storySeenAt === null) {
    const seen = await page.evaluate(readStory);
    if (seen?.shown) {
      storySeenAt = Date.now() - readyAt;
      storySeen = seen;
    } else await sleep(150);
  }
  await waitForRest(page);
  const state = await page.evaluate(readRestState);
  const regionsRest = await readRevealRegions(page);
  const shot = await page.screenshot({
    path: path.join(out, `rest-${suffix}.png`),
  });
  result.screenshots.push(`rest-${suffix}.png`);
  const bare = await textlessShot(page);
  await fs.writeFile(path.join(out, `rest-${suffix}-notext.png`), bare);
  const canvasBuffer = await canvasPng(page);
  await fs.writeFile(path.join(out, `canvas-${suffix}.png`), canvasBuffer);
  const background = await decodePng(bare);
  const globe = await decodePng(canvasBuffer);
  const composite = await decodePng(shot);
  // Lo que no es escena en la captura compuesta: cajas, textos y superficies.
  const uiRects = [
    ...state.boxes.map(({ rect }) => rect),
    ...state.texts.map(({ rect }) => rect),
    ...state.named,
  ].map(({ left, top, right, bottom }) => ({
    left: left - 2,
    top: top - 2,
    right: right + 2,
    bottom: bottom + 2,
  }));

  // 1 · V-01: en reposo solo la barra superior, el titular y la tira del
  // pie (más los créditos, obligación de licencia); ninguna caja fuera de
  // esas zonas. Antes (T3) se permitían telemetría, carril de cámara y una
  // superficie suelta: era más laxo que V-01 (reparación T5, RED guardado).
  const rest = restSurfaceCount(state.boxes);
  const extraRegions = restRegionViolations(regionsRest.regions);
  check(
    `vis-01-rest-surfaces-${suffix}`,
    regionsRest.reveal === 'rest' &&
      extraRegions.length === 0 &&
      rest.count === 0,
    {
      allowed: REST_ALLOWED,
      extraRegions,
      reveal: regionsRest.reveal,
      regions: regionsRest.regions,
      ...rest,
      boxes: state.boxes,
    },
  );
  // 2 · Sin objetivo no hay Mission Dock (D1-A, T3): el nodo existe pero nace
  // oculto, el estado de revelación dice «reposo» y ninguna lectura de
  // cámara se repite (una sola ALTURA, un solo RUMBO, un MAPA).
  check(
    `vis-02-no-dock-at-rest-${suffix}`,
    state.dock.present &&
      state.dock.hidden &&
      state.dock.dataVisible === 'false' &&
      !state.dock.visible &&
      state.reveal === 'rest' &&
      // Nunca repetidas. «A la vista en escritorio» se exige al explorar
      // (vis-02b): en reposo la telemetría espera a la primera interacción.
      [
        state.readings.altitude,
        state.readings.heading,
        state.readings.map,
      ].every((n) => n <= 1) &&
      !state.readings.sectorStatic,
    { dock: state.dock, reveal: state.reveal, readings: state.readings },
  );
  // 3 · USGS bajo demanda (D3).
  check(`vis-03-usgs-hidden-${suffix}`, !state.glanceVisible, {
    glanceVisible: state.glanceVisible,
  });
  // 4 · «Datos avanzados de vista» oculto en reposo (D2).
  check(`vis-04-advanced-hidden-${suffix}`, !state.advancedVisible, {
    advancedVisible: state.advancedVisible,
  });
  // 5 · Suelo de texto (14 px móvil / 12 px escritorio), atribuciones aparte.
  const small = textFloorViolations(state.texts, { mobile });
  const credits = state.texts.filter((t) => t.attribution);
  check(`vis-05-text-floor-${suffix}`, small.length === 0, {
    floor: mobile ? 14 : 12,
    violations: small
      .slice(0, 25)
      .map(({ text, key, size }) => ({ text, key, size })),
    total: small.length,
    attributionSizes: [...new Set(credits.map((t) => t.size))],
  });
  // 6 · Contraste AA contra el fondo real (captura sin texto).
  const lowContrast = contrastFailures(state.texts, background);
  check(`vis-06-contrast-aa-${suffix}`, lowContrast.length === 0, {
    measured: state.texts.length,
    exemptDisabled: state.texts.filter((t) => t.disabled).map((t) => t.text),
    failures: lowContrast.slice(0, 25),
    total: lowContrast.length,
    method: 'p90/p10 de luminancia bajo el rectángulo en captura sin texto',
  });
  // 7 · Sin scroll horizontal ni solapes entre superficies.
  const pairs = overlaps(state.named);
  // §6.10 / V-06: ningún crédito queda fuera de pantalla (ni el «no en vivo»).
  const creditsOut = creditOverflow(state.credits, state.viewport.width);
  check(
    `vis-07-no-hscroll-no-overlap-${suffix}`,
    state.overflowX <= 0 && pairs.length === 0 && creditsOut.length === 0,
    {
      overflowX: state.overflowX,
      overlaps: pairs,
      creditsOutside: creditsOut,
      credits: state.credits,
      surfaces: state.named,
    },
  );
  // 8 · Pose inicial: pitch esperado y terminador visible (día y noche).
  const dayNight = state.disk ? diskDayNight(globe, state.disk) : null;
  const terminatorDeg = terminatorAngleFromSun(state.sun.sx, state.sun.sy);
  // auto (decisión 2026-09-26): inclinada en escritorio, cenital en teléfono.
  // La pose inclinada se expresa en órbita alrededor del punto y llega a la
  // cámara como pitch ≈ −85 que deriva despacio hacia −90 (movimiento sutil),
  // así que se exige un rango, no un valor.
  const tilted =
    state.homePose === 'tilt' ||
    (state.homePose === 'auto' && viewport.width >= 650);
  const expectedPitch = tilted ? '[-90, -60]' : -90;
  const pitchOk = tilted
    ? state.camera.pitch <= -60 && state.camera.pitch >= -90.5
    : Math.abs(state.camera.pitch + 90) <= 2;
  const angleOk =
    tilted ||
    (terminatorDeg >= TERMINATOR_RANGE[0] &&
      terminatorDeg <= TERMINATOR_RANGE[1]);
  check(
    `vis-08-camera-terminator-${suffix}`,
    pitchOk && dayNight && dayNight.ratio < DAY_NIGHT_RATIO_MAX && angleOk,
    {
      camera: state.camera,
      homePose: state.homePose,
      expectedPitch,
      terminatorDeg,
      dayNight,
      disk: state.disk,
    },
  );
  // 9 · Cielo: skyBox visible y sobrio.
  const sky = state.diskCss
    ? skyStats(composite, state.diskCss, {
        bright: SKY_BRIGHT_LUM,
        exclude: uiRects,
      })
    : null;
  check(
    `vis-09-sky-sober-${suffix}`,
    state.scene.skyBoxShow === true &&
      state.scene.background === 'rgb(0,0,0)' &&
      // D4: cielo propio generado desde catálogo real (public/sky/).
      Boolean(
        state.scene.skyBoxSources?.some((src) => src.includes('/sky/')),
      ) &&
      sky &&
      sky.p99 < SKY_P99_MAX &&
      sky.brightFraction < SKY_BRIGHT_FRACTION_MAX,
    {
      skyBoxShow: state.scene.skyBoxShow,
      skyBoxSources: state.scene.skyBoxSources,
      background: state.scene.background,
      sky,
      source: 'captura compuesta (page.screenshot) sin rectángulos de UI',
      thresholds: {
        p99: SKY_P99_MAX,
        brightLum: SKY_BRIGHT_LUM,
        brightFraction: SKY_BRIGHT_FRACTION_MAX,
      },
    },
  );
  // 9b · La Tierra es lo único que brilla: sin velo ni ojo de cerradura.
  const tint = state.diskCss
    ? skyTint(composite, state.diskCss, { exclude: uiRects })
    : null;
  check(
    `vis-09b-sky-no-veil-${suffix}`,
    tint &&
      tint.greenCast < SKY_GREEN_CAST_MAX &&
      (tint.keyholeStep === null || tint.keyholeStep < SKY_KEYHOLE_STEP_MAX),
    {
      tint,
      source: 'captura compuesta (page.screenshot) sin rectángulos de UI',
      thresholds: {
        greenCast: SKY_GREEN_CAST_MAX,
        keyholeStep: SKY_KEYHOLE_STEP_MAX,
      },
    },
  );
  // 10 · Iluminación solar y capa nocturna.
  const night = state.scene.layers.find(
    (l) => l.show && l.nightAlpha >= 0.99 && l.dayAlpha <= 0.01,
  );
  check(
    `vis-10-lighting-night-${suffix}`,
    state.scene.globeShow &&
      state.scene.enableLighting === true &&
      state.scene.layers.length >= 2 &&
      Boolean(night),
    { scene: state.scene },
  );
  // 11 · Halo atmosférico: anillo de luminancia intermedia fuera del limbo.
  // El casquete de la atmósfera de Cesium es 1,025 R: el anillo se mide
  // entre el borde antialias (+2 px) y ese casquete (≈ 9 px en escritorio,
  // ≈ 4,5 px en teléfono). Fuera de él solo hay cielo.
  const halo = state.diskCss
    ? haloRing(composite, state.diskCss, {
        inner: 2,
        outer: 2 + state.diskCss.r * 0.025,
        exclude: uiRects,
      })
    : null;
  const skyFloor = Math.max(halo?.skyMedian ?? 0, 0.002);
  check(
    `vis-11-halo-${suffix}`,
    halo &&
      halo.ringMax > 2 * skyFloor &&
      halo.ringMax >= 0.02 &&
      halo.ringMax <= 0.8,
    {
      halo,
      source: 'captura compuesta (page.screenshot) sin rectángulos de UI',
      skyAtmosphere: state.scene.skyAtmosphere,
    },
  );
  // 12 · Retícula lat/lon apagada al arrancar.
  check(
    `vis-12-grid-off-${suffix}`,
    state.grid.pressed === 'false' &&
      (!state.grid.graticule ||
        !state.grid.graticule.show ||
        state.grid.graticule.entities === 0),
    state.grid,
  );
  // 16 · Piel Editorial: tokens, tipografía por rol, sin neón, mono = números.
  const skin = await page.evaluate(readSkinState);
  check(
    `vis-16-editorial-skin-${suffix}`,
    skin.skin === 'editorial' &&
      skin.paper === '#eef1e9' &&
      skin.functionDock &&
      skin.functionDock.backgroundImage === 'none' &&
      // §7: en teléfono la navegación es la barra inferior con fondo propio;
      // «sin caja» es la barra superior de escritorio (§6.1).
      (mobile || skin.functionDock.backgroundAlpha <= 0.08) &&
      skin.functionDock.borderAlpha <= 0.2 &&
      skin.labels.length === 0 &&
      skin.titles.length === 0 &&
      skin.neonTotal === 0 &&
      skin.monoTotal === 0,
    skin,
  );
  // 14 · Fuentes del sistema declaradas y cargadas.
  const fonts = await page.evaluate(async (probes) => {
    await Promise.allSettled(probes.map((probe) => document.fonts.load(probe)));
    await document.fonts.ready;
    return [...document.fonts].map((face) => ({
      family: face.family,
      style: face.style,
      weight: face.weight,
      status: face.status,
    }));
  }, FONT_PROBES);
  const missing = FONT_FAMILIES.filter(
    (family) => !fontFaceLoaded(fonts, family),
  );
  check(`vis-14-fonts-loaded-${suffix}`, missing.length === 0, {
    missing,
    faces: fonts,
  });
  // 13 · Titular (T3, §6.3): visible ≤ 3 s tras la entrada, con su texto
  // honesto (kicker de luz solar solo si hay luz solar; «ahora» solo con el
  // reloj en vivo; la línea de día/noche y VIIRS con su año y «no en vivo»
  // cuando la capa nocturna está) y retirado en la PRIMERA interacción.
  const flagsHere = readGlobeFlags(new URL(baseUrl).search);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel({ deltaY: 40 });
  await sleep(900);
  const storyAfter = await page.evaluate(readStory);
  // 2b · V-02: la primera interacción revela cámara, telemetría y capas.
  const explore = await readRevealRegions(page);
  await page.screenshot({ path: path.join(out, `explore-${suffix}.png`) });
  result.screenshots.push(`explore-${suffix}.png`);
  const revealed = exploreRevealed(explore, { mobile });
  check(`vis-02b-explore-reveals-${suffix}`, revealed.ok, {
    ...revealed,
    reveal: explore.reveal,
    readings: explore.readings,
  });
  const text = storySeen?.text ?? '';
  const honest =
    storySeen?.clockLive === true
      ? /el planeta,\s*ahora\./i.test(text)
      : !/ahora|este instante/i.test(text);
  const lighting = flagsHere.lighting === '1';
  const lede =
    (!lighting || /luz solar de este instante|luz solar del/i.test(text)) &&
    (flagsHere.nightLights !== '1' ||
      /VIIRS 2012.*no en vivo/i.test(storySeen?.lede ?? '')) &&
    (lighting || !/VIIRS|luz solar/i.test(text));
  check(
    `vis-13-headline-${suffix}`,
    storySeenAt !== null &&
      storySeen.ariaLive === 'polite' &&
      storySeen.serif &&
      honest &&
      lede &&
      storyAfter?.faded === true &&
      storyAfter.state === 'hidden',
    {
      storySeenAtMs: storySeenAt,
      windowMs: HEADLINE_WINDOW_MS,
      storySeen,
      storyAfter,
      honest,
      lede,
    },
  );
  result.snapshots[suffix] = {
    skin: state.skin,
    intro: state.intro,
    camera: state.camera,
    homePose: state.homePose,
    terminatorDeg,
  };
  await page.close();
}

/**
 * 17 · Telemetría con objetivo fijado (V-04/V-05): el pie sigue a la cámara
 * real mientras la gobierna el EntityView. 18 · Satélites Editorial (solo con
 * satStyle=editorial): 0 rótulos y 0 objetos de detección en Global, punto y
 * ficha fijados en ámbar y Grotesk, sin jerga en mayúsculas.
 */
async function measureTrackedTelemetry(browser) {
  const flags = readGlobeFlags(new URL(baseUrl).search);
  const page = await openApp(
    browser,
    result,
    baseUrl,
    pageViewport(VIEWPORTS[0]),
    {
      enableSatellites: true,
      requireNorad: 25544,
    },
  );
  await waitForRest(page);
  await sleep(2000);
  const global = await page.evaluate(readSatelliteState);
  // 07b · Pie en Simulación ×3600 con la nota SGP4, ya revelado.
  await checkSimulationFoot({ page, check, out, result });
  await trackById(page, 25544);
  await sleep(TRACK_SETTLE_MS);
  const iss = await page.evaluate(readSatelliteState);
  await page.screenshot({ path: path.join(out, 'tracked-iss-1600x900.png') });
  result.screenshots.push('tracked-iss-1600x900.png');
  await checkTargetPanel(page);
  const shownKm = telemetryAltitudeKm(iss.footer.altitude);
  const realKm = iss.camera.heightM / 1000;
  const headingShown = Number.parseFloat(iss.footer.heading);
  const headingDelta = Math.abs(
    ((headingShown - iss.camera.headingDeg + 540) % 360) - 180,
  );
  check(
    'vis-17-telemetry-follows-tracked-camera',
    iss.tracked &&
      shownKm !== null &&
      Math.abs(shownKm - realKm) <=
        Math.max(
          TELEMETRY_ALT_TOLERANCE_KM,
          realKm * TELEMETRY_ALT_TOLERANCE_REL,
        ) &&
      headingDelta <= 1,
    { shownKm, realKm, headingShown, headingDelta, global: global.footer, iss },
  );
  if (flags.satStyle === 'editorial')
    checkEditorialSatellites({ flags, global, iss });
  const where = { page, check, out, result, suffix: '1600x900' };
  await checkCloseReleases(where);
  await checkMoonValues(where);
  await page.close();
}

/** 18 · Satélites Editorial: sin rótulos en Global, ámbar y Grotesk al fijar. */
function checkEditorialSatellites({ flags, global, iss }) {
  const shouting = (iss.card?.details ?? []).filter((line) =>
    /^(STATION|NAV|GEO|CUBESAT|VISUAL|COMMS|DOCKED)/.test(line),
  );
  check(
    'vis-18-satellites-editorial',
    global.detectable === 0 &&
      (global.paintedBySource?.['satellites-iss'] ?? 0) === 0 &&
      iss.trackedPointCss === '#e6b46d' &&
      iss.card?.accent === '#e6b46d' &&
      iss.card?.typeface === 'editorial' &&
      shouting.length === 0,
    { flags, global, iss, shouting },
  );
}

/**
 * 20 · Panel contextual único al fijar (T3, §6.4): a la derecha sobre el
 * pie, título serif con kicker, pestañas, campos en 2 columnas, acciones e
 * Inspeccionar como primaria; el titular pasa a ser el objetivo.
 */
async function checkTargetPanel(page) {
  const panel = await page.evaluate(readTargetPanel);
  check(
    'vis-20-target-panel-anatomy',
    panel.visible &&
      panel.reveal === 'target' &&
      panel.story === 'target' &&
      panel.storyText.includes(panel.title) &&
      panel.gapRight >= 0 &&
      panel.gapRight <= 32 + 64 + 8 &&
      panel.gapBottom >= 0 &&
      panel.gapBottom <= 136 &&
      /Instrument Serif/.test(panel.titleFont) &&
      Boolean(panel.kicker) &&
      panel.tabs.length >= 2 &&
      panel.factColumns === 2 &&
      panel.actions.every((a) => a.width >= 44 && a.height >= 44) &&
      (!panel.inspect || (panel.inspect.primary && panel.inspect.fullRow)),
    panel,
  );
}

/**
 * 13b · Titular con movimiento reducido: se muestra sin animación y se
 * retira igual en la primera interacción (tecla), sin fundido.
 */
async function checkReducedHeadline(page) {
  const storyBefore = await page.evaluate(readStory);
  await page.keyboard.press('Tab');
  await sleep(60);
  const storyAfterKey = await page.evaluate(readStory);
  const explore = await readRevealRegions(page);
  const revealed = exploreRevealed(explore, { reduced: true });
  check('vis-02c-reveal-reduced-motion', revealed.ok, {
    ...revealed,
    reveal: explore.reveal,
  });
  check(
    'vis-13b-headline-reduced-motion',
    storyBefore?.shown === true &&
      // «Sin animación»: ninguna transición ≥ 10 ms (el reset global de
      // movimiento reducido deja 0.001s).
      storyBefore.transition
        .split(',')
        .every((value) => Number.parseFloat(value) <= 0.01) &&
      storyAfterKey?.faded === true &&
      storyAfterKey.state === 'hidden',
    { storyBefore, storyAfterKey },
  );
}

/** 15 · Movimiento reducido: sin vuelo de entrada, pose final directa. */
async function measureReducedMotion(browser) {
  const viewport = VIEWPORTS[0];
  const page = await openApp(browser, result, baseUrl, pageViewport(viewport), {
    enableSatellites: false,
    requireNorad: null,
    beforeGoto: (p) =>
      p.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ]),
  });
  await sleep(40);
  const read = () =>
    page.evaluate(() => ({
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      flying: Boolean(window.__godsEyeView.viewer.camera._currentFlight),
      intro: document.body.dataset.eyeIntro ?? null,
      height: window.__godsEyeView.viewer.camera.positionCartographic.height,
    }));
  const first = await read();
  await sleep(1500);
  const later = await read();
  const drift = Math.abs(later.height - first.height) / first.height;
  check(
    'vis-15-reduced-motion-no-intro-flight',
    first.reduced &&
      !first.flying &&
      first.intro !== 'running' &&
      drift < 0.01 &&
      later.height >= 17_000_000,
    { first, later, drift },
  );
  await checkReducedHeadline(page);
  await page.close();
}

const { browser, close } = await launchBrowser('eye-visual-');
try {
  for (const viewport of VIEWPORTS) await measureViewport(browser, viewport);
  await measureReducedMotion(browser);
  await measureTrackedTelemetry(browser);
  const context = { browser, result, check, baseUrl, out };
  // T4: marcadores Editorial (solo con satStyle=editorial, como vis-18).
  if (readGlobeFlags(new URL(baseUrl).search).satStyle === 'editorial')
    await measureMarkers(context);
  // T5: el móvil se diseña.
  await measurePhone(context);
} catch (error) {
  result.fatal = String(error?.stack || error);
  console.error(result.fatal);
} finally {
  await close();
  await finishRun(result, resultPath);
}
