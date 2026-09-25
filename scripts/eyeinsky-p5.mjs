/**
 * Arnés de navegador de EYEINSKY P5 (Tierra–Luna) — contrato de escena.
 *
 * - `moon-native-off`: una sola Luna; la `scene.moon` nativa está apagada.
 * - `clock-advances`: `viewer.clock` corre (shouldAnimate) ≥ 4,9 s en 5 s.
 * - `icrf-fixed-ready`: la app precargó IAU2006 XYS con su módulo de marcos.
 * - `frame-gate-p503`: con el marco y la fuente lunar DE LA APP, dirección
 *   ECEF ≤ 0,5′ frente a los 10 puntos sublunares ITRF93 del fixture.
 * - `paused-seek-repaints`: con el reloj en pausa y la escena en reposo (sin
 *   holds, frameNumber quieto), un setTime(+1 h) —dentro del XYS precargado—
 *   repinta por sí solo: frameNumber sube SIN llamar a viewer.render() ni a
 *   requestRender desde el arnés (P5-04).
 * - `ring-moon-matches-3d`: con el reloj en pausa, el marcador del anillo y la
 *   Luna 3D apuntan igual (≤ 1e-9 rad) en el mismo instante.
 * - `moon-real-scale-diameter`: a escala física el disco mide en px lo que
 *   subtiende ≈ 0,52° con el FOV de la cámara (±20 %).
 * - `moon-didactic-x10-band`: el didáctico multiplica el diámetro ×10 (±20 %),
 *   muestra la banda y declara measurable=false.
 * - `moon-terminator-illu`: fracción iluminada por el terminador en píxeles
 *   frente a Illu% de Horizons (±3 %) en dos fases intermedias; si no es
 *   medible queda en `notMeasured`, nunca como aprobado.
 * - `moon-20-cycles-no-orphans`: 20 ciclos enable/disable sin primitivas,
 *   listeners, holds ni texturas/búferes WebGL de más.
 * - `sublunar-vs-horizons`: el punto sublunar publicado (con tiempo de luz)
 *   ≤ 0,5′ frente a los 10 puntos ITRF93 de Horizons.
 * - `texture-lroc-1k` / `texture-lroc-2k-over-300px` (T9): textura LROC de
 *   NASA SVS con su crédito; 2k solo con la Luna > 300 px en escritorio.
 * - T8 (scripts/lib/eyeinsky-p5-dock-checks.mjs): `time-strip-present`,
 *   `sim-suspends-live-layers`, `ahora-restores-layers`, `aim-moon`,
 *   `moon-panel-fields`, `earth-moon-system-frames-both`,
 *   `didactic-toggle`, `return-to-earth-restores-state`, `date-field-seek`,
 *   `disabled-reasons-frame`, `p509-out-of-range-pauses` (respaldo
 *   bloqueado, pestaña aparte), `mobile-390x844-targets`,
 *   `mobile-system-frames-or-warns`, `reduced-motion-cuts` y
 *   `zoom-200-time-strip`.
 * - Reparación T8 (scripts/lib/eyeinsky-p5-repair-checks.mjs):
 *   `resume-after-live-pause`, `sim-aim-now-return-keeps-live`,
 *   `keyboard-focus-stays-in-dock` y, en 390×844,
 *   `mobile-390x844-active-layer-off`.
 * - Pulido de aceptación (scripts/lib/eyeinsky-p5-polish-checks.mjs):
 *   `shortcuts`, `pause-suspension-notice`, `system-earth-label`,
 *   `mobile-sim-readout-fits` (360 y 390 px) y
 *   `catalog-space-missions-moon-reason`.
 *
 * Uso: node scripts/eyeinsky-p5.mjs <url> <directorio-de-salida>
 * La salida es OBLIGATORIA y no puede contener ya un result.json.
 * Nunca arranca servidor: apúntalo a uno vivo. No afirma FPS.
 */
import fs from 'node:fs/promises';
import {
  createRecorder,
  finishRun,
  launchBrowser,
  near,
  prepareRun,
  screenshot,
  sleep,
} from './lib/eyeinsky-p4-run.mjs';
import { openApp, webglRenderer } from './lib/eyeinsky-p4-page.mjs';
import {
  aimAtMoon,
  frameGateProbe,
  installGlCounter,
  moonState,
  readLuminance,
  repaintProbe,
  ringMoonProbe,
  scaleBandProbe,
  sceneLedger,
  subLunarProbe,
  sunLimbOnScreen,
} from './lib/eyeinsky-p5-probes.mjs';
import {
  checkDateField,
  checkMobile,
  checkOutOfRangePause,
} from './lib/eyeinsky-p5-dock-tabs.mjs';
import {
  checkFrameReason,
  checkMoonActions,
  checkReducedMotion,
  checkSuspension,
  checkTimeStripLive,
  checkZoom200,
} from './lib/eyeinsky-p5-dock-checks.mjs';
import {
  checkKeyboardFocus,
  checkResumeAfterLivePause,
  checkSimAimNowReturn,
} from './lib/eyeinsky-p5-repair-checks.mjs';
import { runPolishChecks } from './lib/eyeinsky-p5-polish-checks.mjs';
import {
  chordDiameterPx,
  litFractionAlongAxis,
  lonLatArcmin,
  subPointArcmin,
} from './lib/eyeinsky-p5-measure.mjs';

/** Tolerancias del contrato P5 (propuesta §3, §9; orden T5–T7). */
export const CLOCK_WINDOW_MS = 5_000;
export const CLOCK_MIN_ADVANCE_S = 4.9;
export const RING_MOON_MAX_RAD = 1e-9;
export const FRAME_GATE_MAX_ARCMIN = 0.5;
export const DIAMETER_TOLERANCE = 0.2;
export const MOON_NOMINAL_DEG = 0.52;
export const DIDACTIC_FACTOR = 10;
export const TERMINATOR_MAX_DELTA = 0.03;
export const CYCLES = 20;
export const SEEK_OFFSET_MS = 3_600_000;
export const IDLE_WINDOW_MS = 1_000;
export const REPAINT_WAIT_MS = 1_500;

const VIEWPORT = { width: 1280, height: 800 };
const FULL_EPOCH = '2026-09-25T18:45:00Z';
const LUM_THRESHOLD = 12;
const CAMERA_ALTITUDE_M = 2_000_000;
const readFixture = async (name) =>
  JSON.parse(
    await fs.readFile(new URL(`../src/data/fixtures/${name}`, import.meta.url)),
  );

const sceneProbe = (page) =>
  page.evaluate(() => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const time = viewer.clock.currentTime;
    return {
      clockIso: C.JulianDate.toIso8601(time, 3),
      shouldAnimate: viewer.clock.shouldAnimate,
      multiplier: viewer.clock.multiplier,
      nativeMoon: viewer.scene.moon ? { show: viewer.scene.moon.show } : null,
      icrfToFixedDefined:
        C.Transforms.computeIcrfToFixedMatrix(time) !== undefined,
      appFrameStatus:
        window.__godsEyeView.frames?.icrfToFixed?.(time)?.status ?? null,
    };
  });

const clockAdvanceS = (a, b) =>
  (Date.parse(b.clockIso) - Date.parse(a.clockIso)) / 1000;

async function checkClockAndMoon(page, result, check) {
  const before = await sceneProbe(page);
  await sleep(CLOCK_WINDOW_MS);
  const after = await sceneProbe(page);
  result.snapshots.clock = { before, after };
  check(
    'moon-native-off',
    after.nativeMoon?.show === false,
    `scene.moon.show=${after.nativeMoon?.show ?? 'sin scene.moon'}`,
    ['P5-06'],
  );
  const advance = clockAdvanceS(before, after);
  check(
    'clock-advances',
    after.shouldAnimate === true && advance >= CLOCK_MIN_ADVANCE_S,
    `shouldAnimate=${after.shouldAnimate}; avance ${advance.toFixed(3)} s en ${CLOCK_WINDOW_MS / 1000} s de pared`,
    ['P5-05'],
  );
  check(
    'icrf-fixed-ready',
    after.icrfToFixedDefined && after.appFrameStatus === 'ok',
    `matriz ${after.icrfToFixedDefined ? 'definida' : 'undefined'}; marcos de la app: ${after.appFrameStatus}`,
    ['P5-03', 'P5-10'],
  );
}

/** Espera a que la Luna publique «ok» con DE441 (y, si se da, esa época). */
async function waitMoonOk(page, epochPrefix = null, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await page.evaluate(moonState);
    const epochOk = !epochPrefix || state.epochIso?.startsWith(epochPrefix);
    if (state.status === 'ok' && state.source === 'DE441' && epochOk)
      return state;
    await page.evaluate(() => window.__godsEyeView.requestRender('p5-harness'));
    await sleep(250);
  }
  throw new Error(`la Luna no quedó lista: ${JSON.stringify(state)}`);
}

async function setSceneTime(page, iso) {
  await page.evaluate((at) => window.__godsEyeView.sceneClock.setTime(at), iso);
  return waitMoonOk(page, iso.slice(0, 19));
}

async function checkFrameGate(page, result, check) {
  const fixture = await readFixture('moon-horizons-icrf.json');
  const byIso = new Map(fixture.subMoonItrf.rows.map((r) => [r.utcIso, r]));
  const probed = await page.evaluate(frameGateProbe, fixture.subMoonItrf.rows);
  const rows = probed.map((r) =>
    r.status === 'ok'
      ? { ...r, arcmin: subPointArcmin(r.fixed, byIso.get(r.utcIso)) }
      : r,
  );
  result.snapshots.frameGate = rows;
  const ok = rows.filter((r) => r.status === 'ok' && r.source === 'DE441');
  const worst = Math.max(...ok.map((r) => r.arcmin));
  check(
    'frame-gate-p503',
    ok.length === rows.length &&
      rows.length === 10 &&
      worst <= FRAME_GATE_MAX_ARCMIN,
    `${ok.length}/${rows.length} épocas DE441; peor ${worst.toFixed(4)}′ (máx. ${FRAME_GATE_MAX_ARCMIN}′)`,
    ['P5-03'],
  );
}

/**
 * El punto sublunar del panel lleva tiempo de luz (el geométrico daba 0,64′
 * en 2026-09-25): frente a Horizons aparente debe quedar ≤ 0,5′.
 */
async function checkSubLunar(page, result, check) {
  const fixture = await readFixture('moon-horizons-icrf.json');
  const rows = fixture.subMoonItrf.rows;
  const byIso = new Map(rows.map((r) => [r.utcIso, r]));
  const probed = await page.evaluate(subLunarProbe, rows);
  const measured = probed.map((r) =>
    r.status === 'ok'
      ? { ...r, arcmin: lonLatArcmin(r.lonLat, byIso.get(r.utcIso)) }
      : r,
  );
  result.snapshots.subLunar = measured;
  const ok = measured.filter((r) => r.status === 'ok');
  const worst = Math.max(...ok.map((r) => r.arcmin));
  check(
    'sublunar-vs-horizons',
    ok.length === rows.length && worst <= FRAME_GATE_MAX_ARCMIN,
    `${ok.length}/${rows.length} épocas; peor ${worst.toFixed(4)}′ (con tiempo de luz) frente a Horizons aparente (máx. ${FRAME_GATE_MAX_ARCMIN}′)`,
    ['P5-03'],
  );
}

async function checkRingMatches(page, result, check) {
  await page.evaluate(() => {
    const g = window.__godsEyeView;
    g.sceneClock.pause();
    g.viewer.camera.setView({
      destination: window.__CESIUM__.Cartesian3.fromDegrees(-100, 20, 2.2e7),
    });
    g.celestialRing?.setEnabled(true);
  });
  for (let i = 0; i < 6; i += 1) {
    await page.evaluate(() => window.__godsEyeView.viewer.render());
    await sleep(60);
  }
  const ring = await page.evaluate(ringMoonProbe);
  result.snapshots.ringMoon = ring;
  check(
    'ring-moon-matches-3d',
    ring.ok &&
      ring.angleRad <= RING_MOON_MAX_RAD &&
      ring.moonEpoch === ring.ringEpoch,
    ring.ok
      ? `ángulo ${ring.angleRad.toExponential(3)} rad (máx. ${RING_MOON_MAX_RAD}); épocas ${ring.moonEpoch} / ${ring.ringEpoch}`
      : ring.reason,
    ['P5-06'],
  );
  await page.evaluate(() =>
    window.__godsEyeView.celestialRing?.setEnabled(false),
  );
}

/** Espera a que la escena en pausa quede en reposo (frameNumber quieto). */
async function waitIdle(page, tries = 10) {
  let a = await page.evaluate(repaintProbe);
  for (let i = 0; i < tries; i += 1) {
    await sleep(IDLE_WINDOW_MS);
    const b = await page.evaluate(repaintProbe);
    if (b.frameNumber === a.frameNumber) return b;
    a = b;
  }
  return null;
}

async function checkPausedSeekRepaints(page, result, check) {
  await page.evaluate(() => window.__godsEyeView.sceneClock.pause());
  const idle = await waitIdle(page);
  if (!idle || idle.holds.length || idle.shouldAnimate) {
    result.notMeasured.push({
      id: 'paused-seek-repaints',
      reason: 'la escena no quedó en reposo (holds o render continuo)',
      idle,
    });
    return;
  }
  const target = new Date(Date.parse(idle.clockIso) + SEEK_OFFSET_MS)
    .toISOString()
    .replace('.000Z', 'Z');
  await page.evaluate(
    (at) => window.__godsEyeView.sceneClock.setTime(at),
    target,
  );
  await sleep(REPAINT_WAIT_MS);
  const after = await page.evaluate(repaintProbe);
  result.snapshots.pausedSeek = { idle, target, after };
  check(
    'paused-seek-repaints',
    after.frameNumber > idle.frameNumber &&
      after.clockIso === target &&
      after.moonEpochIso?.startsWith(target.slice(0, 19)) === true,
    `frameNumber ${idle.frameNumber}→${after.frameNumber}; reloj ${after.clockIso}; Luna ${after.moonEpochIso}; holds [${after.holds}]`,
    ['P5-04'],
  );
}

/** Apunta, lee un recuadro alrededor del centro de la Luna y mide su extensión. */
async function measureDisc(page, fovDeg) {
  const aim = await page.evaluate(aimAtMoon, {
    fovDeg,
    altitudeM: CAMERA_ALTITUDE_M,
  });
  const size = Math.min(
    aim.canvas.height - 2,
    Math.ceil(aim.expectedPx * 1.6) + 20,
  );
  const x0 = Math.round(aim.center.x - size / 2);
  const y0 = Math.round(aim.center.y - size / 2);
  const lum = await page.evaluate(readLuminance, { x0, y0, size });
  return { aim, size, lum, extent: chordDiameterPx(lum, size, LUM_THRESHOLD) };
}

async function checkRealScale(page, result, check) {
  await setSceneTime(page, FULL_EPOCH);
  const fovDeg = 2;
  const { aim, extent } = await measureDisc(page, fovDeg);
  const measuredDeg = (extent.diameterPx / aim.focalPx) * (180 / Math.PI);
  result.snapshots.realScale = { aim, extent, measuredDeg };
  check(
    'moon-real-scale-diameter',
    near(extent.diameterPx, aim.expectedPx, DIAMETER_TOLERANCE) &&
      near(measuredDeg, MOON_NOMINAL_DEG, DIAMETER_TOLERANCE),
    `${extent.diameterPx} px medidos, ${aim.expectedPx.toFixed(1)} px esperados (${aim.angularDeg.toFixed(4)}° a ${aim.distanceKm.toFixed(0)} km, FOV ${fovDeg}°); ${measuredDeg.toFixed(4)}° frente a ${MOON_NOMINAL_DEG}° (±${DIAMETER_TOLERANCE * 100} %)`,
    ['P5-07'],
  );
}

async function checkDidactic(page, result, check) {
  const fovDeg = 20;
  const physical = await measureDisc(page, fovDeg);
  await page.evaluate(() => window.__godsEyeView.moon.setScaleMode('didactic'));
  const didactic = await measureDisc(page, fovDeg);
  const band = await page.evaluate(scaleBandProbe);
  const state = await page.evaluate(moonState);
  await page.evaluate(() => window.__godsEyeView.moon.setScaleMode('physical'));
  const bandAfter = await page.evaluate(scaleBandProbe);
  const ratio = didactic.extent.diameterPx / physical.extent.diameterPx;
  result.snapshots.didactic = {
    physical: physical.extent,
    didactic: didactic.extent,
    ratio,
    band,
    bandAfter,
    measurable: state.measurable,
    validatedAgainst: state.validatedAgainst,
  };
  check(
    'moon-didactic-x10-band',
    near(ratio, DIDACTIC_FACTOR, DIAMETER_TOLERANCE) &&
      band.present &&
      band.hidden === false &&
      /×10/.test(band.text) &&
      state.measurable === false &&
      state.validatedAgainst === null &&
      bandAfter.hidden === true,
    `×${ratio.toFixed(2)} (${physical.extent.diameterPx} → ${didactic.extent.diameterPx} px, FOV ${fovDeg}°); banda «${band.text}»; measurable=${state.measurable}; banda al volver a físico: ${bandAfter.hidden ? 'oculta' : 'visible'}`,
    ['P5-07'],
  );
}

async function terminatorAt(page, row) {
  await setSceneTime(page, row.utcIso);
  const { aim, size, lum } = await measureDisc(page, 2);
  const axis = await page.evaluate(sunLimbOnScreen);
  const out = litFractionAlongAxis(lum, size, {
    center: { x: size / 2, y: size / 2 },
    axis,
    radiusPx: aim.expectedPx / 2,
  });
  return {
    utcIso: row.utcIso,
    horizonsIllu: row.illuPct / 100,
    appPhase: axis.phaseFraction,
    ...out,
    delta: out.fraction === null ? null : out.fraction - row.illuPct / 100,
  };
}

async function checkTerminator(page, result, check) {
  // El terminador se mide con albedo uniforme (placeholder): la textura LROC
  // (mares oscuros) desplaza el umbral de luminancia y no mide la luz.
  await page.evaluate(() =>
    window.__godsEyeView.moon.debugTexture('placeholder'),
  );
  const fixture = await readFixture('moon-horizons-phase.json');
  const rows = ['2030-06-21T12:00:00Z', '2021-03-20T12:00:00Z'].map((iso) =>
    fixture.rows.find((r) => r.utcIso === iso),
  );
  const samples = [];
  for (const row of rows) samples.push(await terminatorAt(page, row));
  result.snapshots.terminator = samples;
  await page.evaluate(() => window.__godsEyeView.moon.debugTexture('auto'));
  const measured = samples.filter((s) => s.status === 'ok');
  if (measured.length < samples.length)
    result.notMeasured.push({
      id: 'moon-terminator-illu',
      reason: 'perfil sin contraste suficiente en alguna época',
      samples,
    });
  if (!measured.length) return;
  const worst = Math.max(...measured.map((s) => Math.abs(s.delta)));
  check(
    'moon-terminator-illu',
    worst <= TERMINATOR_MAX_DELTA,
    measured
      .map(
        (s) =>
          `${s.utcIso}: ${(s.fraction * 100).toFixed(1)} % en píxeles frente a Illu ${(s.horizonsIllu * 100).toFixed(1)} %`,
      )
      .join('; '),
    ['P5-14'],
  );
}

/** T9: textura LROC publicada (ledger) y presupuesto 1k → 2k (> 300 px). */
async function checkTexture(page, result, check, expected, id) {
  let state = null;
  for (let i = 0; i < 40; i += 1) {
    state = await page.evaluate(() => ({
      texture: window.__godsEyeView.moon.getState().texture,
      // Crédito de pantalla completa (lightbox «Data attribution»), no en línea.
      credits: (window.__godsEyeView.viewer.creditDisplay._staticCredits ?? [])
        .map((credit) => credit.html)
        .join(' | '),
    }));
    if (state.texture === expected) break;
    await page.evaluate(() => window.__godsEyeView.viewer.render());
    await sleep(250);
  }
  result.snapshots[id] = state;
  check(
    id,
    state.texture === expected &&
      /NASA's Scientific Visualization Studio/.test(state.credits),
    `textura ${state.texture} (esperada ${expected}); crédito SVS ${/Scientific Visualization Studio/.test(state.credits) ? 'visible' : 'ausente'}`,
    ['P5-18'],
  );
}

async function cycleMoon(page) {
  await page.evaluate(() => window.__godsEyeView.moon.enable());
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.__godsEyeView.viewer.render());
    await sleep(40);
  }
  await page.evaluate(() => window.__godsEyeView.moon.disable());
  await page.evaluate(() => window.__godsEyeView.viewer.render());
}

async function checkCycles(page, result, check) {
  await page.evaluate(() => window.__godsEyeView.moon.disable());
  await page.evaluate(() => window.__godsEyeView.viewer.render());
  const before = await page.evaluate(sceneLedger);
  for (let i = 0; i < CYCLES; i += 1) await cycleMoon(page);
  for (let i = 0; i < 5; i += 1)
    await page.evaluate(() => window.__godsEyeView.viewer.render());
  const after = await page.evaluate(sceneLedger);
  const leak = (a, b, make, del) => b[make] - b[del] - (a[make] - a[del]);
  const texLeak = leak(before.gl, after.gl, 'tex', 'texDel');
  const bufLeak = leak(before.gl, after.gl, 'buf', 'bufDel');
  result.snapshots.cycles = { before, after, texLeak, bufLeak };
  check(
    'moon-20-cycles-no-orphans',
    texLeak === 0 &&
      bufLeak === 0 &&
      after.primitives === before.primitives &&
      after.preUpdate === before.preUpdate &&
      JSON.stringify(after.holds) === JSON.stringify(before.holds),
    `${CYCLES} ciclos: texLeak=${texLeak} bufLeak=${bufLeak}; primitivas ${before.primitives}→${after.primitives}; preUpdate ${before.preUpdate}→${after.preUpdate}; holds [${before.holds}]→[${after.holds}]`,
    ['P5-13'],
  );
}

async function runMoonChecks(page, result, check, out) {
  await page.evaluate(() => window.__godsEyeView.moon.enable());
  result.snapshots.moonLive = await waitMoonOk(page);
  await checkTexture(page, result, check, 'lroc-1k', 'texture-lroc-1k');
  await checkFrameGate(page, result, check);
  await checkSubLunar(page, result, check);
  await checkRingMatches(page, result, check);
  await checkPausedSeekRepaints(page, result, check);
  await checkRealScale(page, result, check);
  await checkTexture(
    page,
    result,
    check,
    'lroc-2k',
    'texture-lroc-2k-over-300px',
  );
  await screenshot(result, out, page, 'p5-moon-physical.png');
  await checkDidactic(page, result, check);
  await checkTerminator(page, result, check);
  await screenshot(result, out, page, 'p5-moon-terminator.png');
  await checkCycles(page, result, check);
  // Las medidas de disco estrechan el FOV (2°/20°): se devuelve el de Cesium.
  await page.evaluate(() => {
    const g = window.__godsEyeView;
    g.viewer.camera.frustum.fov = Math.PI / 3;
    g.sceneClock.setNow();
  });
}

/** T8: Mission Dock Tierra–Luna (tira TIEMPO, suspensión, acciones, móvil). */
async function runDockChecks(page, context) {
  await checkTimeStripLive(context);
  await checkDateField(context);
  await checkSuspension(context);
  await checkResumeAfterLivePause(context);
  await page.evaluate(() => window.__godsEyeView.moon.enable());
  await waitMoonOk(page);
  await checkSimAimNowReturn(context);
  await checkKeyboardFocus(context);
  await checkMoonActions(context);
  await checkReducedMotion(context);
  await checkZoom200(context);
  await checkFrameReason(context);
  await checkMobile(context);
  await checkOutOfRangePause(context);
  await page.evaluate(() => window.__godsEyeView.moon.enable());
  await waitMoonOk(page);
  await runPolishChecks(context);
}

const { baseUrl, out, resultPath } = await prepareRun('eyeinsky-p5.mjs');
const { result, check } = createRecorder({
  url: baseUrl,
  viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
  phase: 'P5',
});
result.notMeasured = [];
const { browser, close } = await launchBrowser('eye-p5-');
try {
  const page = await openApp(browser, result, baseUrl, VIEWPORT, {
    enableSatellites: false,
    requireNorad: null,
    beforeGoto: (p) => p.evaluateOnNewDocument(installGlCounter),
  });
  result.webglRenderer = await webglRenderer(page);
  await checkClockAndMoon(page, result, check);
  await runMoonChecks(page, result, check, out);
  const shot = (name, target = page) => screenshot(result, out, target, name);
  await runDockChecks(page, { page, browser, baseUrl, result, check, shot });
  await screenshot(result, out, page, 'p5-scene.png');
} catch (error) {
  result.fatal = String(error?.stack ?? error);
  console.error(error);
} finally {
  await close();
}
await finishRun(result, resultPath);
