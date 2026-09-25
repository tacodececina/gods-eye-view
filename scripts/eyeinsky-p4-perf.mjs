/**
 * Arnés de rendimiento de EYEINSKY P4 · T7 — satélites 3D en off frente a std.
 *
 * Repite el método de la línea base T0 (output/eyeinsky-p4/baseline/measure.mjs):
 * mismo Chrome y flags (ANGLE/D3D11, GPU real), viewport 1366x768 a DPR 1,
 * 60 s por escena, deltas de rAF, CPU del frame de Cesium (preUpdate →
 * postRender), long tasks, heap de JS y commandList (API privada, detectada
 * antes de usarse). Añade las escenas de P4:
 *   A  satélites core sin selección, vista de globo fija
 *   B  ISS seguida en ÓRBITA (TRACK_VIEW_FROM_LEO)
 *   B2 ISS en INSPECCIONAR con el modelo listo (≥ 24 px); en off se rechaza
 *   E  tras disable de la capa con el modelo activo y re-enable: vuelta a A
 *   C  ISS seguida en ÓRBITA con zoom 200 % (683x384 CSS @ DPR 2)
 *   D  catálogo dense (Starlink) sin selección
 *
 * Uso: node scripts/eyeinsky-p4-perf.mjs <url> <salida> <off|std|low> [durMs]
 * Se niega a escribir si la salida ya tiene raw-results.json o summary.json.
 * Nunca arranca servidor: apúntalo a uno vivo. No afirma FPS.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { CHROME, sleep } from './lib/eyeinsky-p4-run.mjs';
import { clickAction, waitModelReady } from './lib/eyeinsky-p4-page.mjs';
import { modelScreen } from './eyeinsky-p4-ux-probes.mjs';

const VIEWPORT = { width: 1366, height: 768, deviceScaleFactor: 1 };
const ZOOM_200 = { width: 683, height: 384, deviceScaleFactor: 2 };
const ISS = 25544;
// low: perfil móvil forzado (1 modelo, sólo el seguido) para medirlo en escritorio.
const MODES = new Set(['off', 'std', 'low']);
const SETTLE_MS = 8000;
const ZOOM_SETTLE_MS = 5000;
const MODEL_MIN_PX = 24;
const GPU_ARGS = [
  '--enable-webgl',
  '--use-gl=angle',
  '--use-angle=d3d11',
  '--ignore-gpu-blocklist',
  '--enable-precise-memory-info',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  `--window-size=${VIEWPORT.width},${VIEWPORT.height + 140}`,
];

/* ── Funciones de página: se serializan y se instalan como window.__p4perf ── */

function pct(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
    : null;
}

function round(value) {
  return value == null ? null : Math.round(value * 100) / 100;
}

function countPoints() {
  let total = 0;
  const walk = (collection) => {
    for (let i = 0; i < collection.length; i++) {
      const item = collection.get(i);
      if (item?.constructor?.name === 'PointPrimitiveCollection') {
        if (item.show) total += item.length;
      } else if (item && typeof item.get === 'function' && 'length' in item)
        walk(item);
    }
  };
  walk(window.__godsEyeView.viewer.scene.primitives);
  return total;
}

function perfStart() {
  const scene = window.__godsEyeView.viewer.scene;
  const state = { deltas: [], cpu: [], cmd: [], sceneFrames: 0 };
  state.last = performance.now();
  state.running = true;
  state.frameStart = null;
  state.commandListAccessible = Boolean(
    scene.frameState && Array.isArray(scene.frameState.commandList),
  );
  const onFrame = (now) => {
    state.deltas.push(now - state.last);
    state.last = now;
    if (state.running) requestAnimationFrame(onFrame);
  };
  state.removePre = scene.preUpdate.addEventListener(() => {
    state.frameStart = performance.now();
  });
  state.removePost = scene.postRender.addEventListener(() => {
    state.sceneFrames += 1;
    if (state.frameStart !== null)
      state.cpu.push(performance.now() - state.frameStart);
    state.frameStart = null;
    if (state.commandListAccessible)
      state.cmd.push(scene.frameState.commandList.length);
  });
  state.heap0 = performance.memory?.usedJSHeapSize ?? null;
  state.started = performance.now();
  requestAnimationFrame(onFrame);
  window.__p4perfState = state;
}

function frameStats(state) {
  const { pct: p, round: r } = window.__p4perf;
  const d = state.deltas.slice(1);
  const cpu = state.cpu;
  return {
    rafCount: d.length,
    rafP50Ms: r(p(d, 0.5)),
    rafP95Ms: r(p(d, 0.95)),
    rafP99Ms: r(p(d, 0.99)),
    rafMaxMs: r(Math.max(...d)),
    framesOver33ms: d.filter((x) => x > 33.4).length,
    sceneFrames: state.sceneFrames,
    cesiumFrameCpuMs: {
      source: 'scene.preUpdate → scene.postRender (hilo principal)',
      p50: r(p(cpu, 0.5)),
      p95: r(p(cpu, 0.95)),
      max: cpu.length ? r(Math.max(...cpu)) : null,
    },
    commandList: state.commandListAccessible
      ? {
          source: 'scene.frameState.commandList (API privada)',
          samples: state.cmd.length,
          p50: p(state.cmd, 0.5),
          max: state.cmd.length ? Math.max(...state.cmd) : null,
        }
      : 'no medido',
  };
}

function loadStats(state, elapsed) {
  const tasks = window.__eyeLongTasks.filter(
    (t) =>
      t.startTime >= state.started && t.startTime <= state.started + elapsed,
  );
  return {
    longTasks: {
      count: tasks.length,
      totalMs: Math.round(tasks.reduce((s, t) => s + t.duration, 0)),
      maxMs: Math.round(Math.max(0, ...tasks.map((t) => t.duration))),
    },
    heap: {
      usedStartBytes: state.heap0,
      usedEndBytes: performance.memory?.usedJSHeapSize ?? null,
      totalEndBytes: performance.memory?.totalJSHeapSize ?? null,
    },
  };
}

function viewContext() {
  const { viewer, getRenderGovernorDiagnostics } = window.__godsEyeView;
  const gl = viewer.scene.context._gl;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const carto = viewer.camera.positionCartographic;
  const r = window.__p4perf.round;
  return {
    renderer: dbg
      ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER),
    dpr: devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight },
    drawingBuffer: {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
    },
    visibility: document.visibilityState,
    hasFocus: document.hasFocus(),
    camera: {
      heightM: Math.round(carto.height),
      lonDeg: r((carto.longitude * 180) / Math.PI),
      latDeg: r((carto.latitude * 180) / Math.PI),
    },
    visiblePointPrimitives: window.__p4perf.countPoints(),
    trackedEntity: Boolean(viewer.trackedEntity),
    governor: getRenderGovernorDiagnostics?.() || null,
  };
}

function modelSnapshot() {
  const module =
    window.__godsEyeView.dataManager.layers.get('satellites')?.module;
  if (!module) return null;
  const found = [];
  const walk = (primitive) => {
    if (!primitive) return;
    if (typeof primitive.isDestroyed === 'function' && primitive.isDestroyed())
      return;
    if (primitive.gevSatelliteNorad !== undefined) {
      const st = primitive.statistics;
      found.push({
        norad: primitive.gevSatelliteNorad,
        ready: Boolean(primitive.ready),
        show: Boolean(primitive.show),
        statistics: st
          ? {
              source: 'model.statistics (API privada)',
              trianglesLength: st.trianglesLength ?? null,
              geometryByteLength: st.geometryByteLength ?? null,
              texturesByteLength: st.texturesByteLength ?? null,
            }
          : 'no medido',
      });
    }
    if (typeof primitive.get === 'function' && 'length' in primitive)
      for (let i = 0; i < primitive.length; i += 1) walk(primitive.get(i));
  };
  walk(window.__godsEyeView.viewer.scene.primitives);
  return {
    stats: module._satelliteModelStatsForTest?.() ?? 'no medido',
    framing: module.getTrackedFraming?.() ?? null,
    params: module.getParams(),
    layerStats: module.getStats(),
    modelPrimitives: found,
  };
}

function perfStop(label) {
  const helpers = window.__p4perf;
  const state = window.__p4perfState;
  state.running = false;
  state.removePost();
  state.removePre();
  const elapsed = performance.now() - state.started;
  return {
    label,
    durationMs: Math.round(elapsed),
    ...helpers.frameStats(state),
    ...helpers.loadStats(state, elapsed),
    ...helpers.viewContext(),
    models: helpers.modelSnapshot(),
  };
}

const PAGE_FUNCTIONS = {
  pct,
  round,
  countPoints,
  perfStart,
  frameStats,
  loadStats,
  viewContext,
  modelSnapshot,
  perfStop,
};

const PAGE_INSTALL = `window.__p4perf = {${Object.entries(PAGE_FUNCTIONS)
  .map(([name, fn]) => `${name}: ${fn.toString()}`)
  .join(',\n')}};`;

/** Long tasks y eventos de modelo, registrados antes de cargar la app. */
function installObservers() {
  window.__eyeLongTasks = [];
  window.__p4ModelEvents = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__eyeLongTasks.push({
          startTime: e.startTime,
          duration: e.duration,
        });
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* longtask no soportado */
  }
  for (const type of ['model-ready', 'model-evicted', 'model-failed'])
    window.addEventListener(`gev:satellite-${type}`, (event) =>
      window.__p4ModelEvents.push({
        type,
        at: performance.now(),
        ...event.detail,
      }),
    );
}

/* ── Lado Node ── */

function parseArgs() {
  const [url, outDir, mode, dur] = process.argv.slice(2);
  if (!url || !outDir || !MODES.has(mode))
    throw new Error(
      'uso: eyeinsky-p4-perf.mjs <url> <salida> <off|std|low> [durMs]',
    );
  const target = new URL(url);
  target.searchParams.set('satModels', mode);
  return { url: target.href, outDir, mode, durationMs: Number(dur) || 60_000 };
}

async function refuseExisting(outDir) {
  for (const name of ['raw-results.json', 'summary.json']) {
    const file = path.join(outDir, name);
    const exists = await fs.access(file).then(
      () => true,
      () => false,
    );
    if (exists)
      throw new Error(`REFUSE: ${file} ya existe; no se sobrescribe.`);
  }
  await fs.mkdir(outDir, { recursive: true });
}

async function probeRenderer() {
  const profile = await fs.mkdtemp(
    path.join(os.tmpdir(), 'eye-p4-perf-probe-'),
  );
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: GPU_ARGS,
    userDataDir: profile,
  });
  try {
    const page = await browser.newPage();
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return 'no-webgl2';
      const d = gl.getExtension('WEBGL_debug_renderer_info');
      return d
        ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
    });
  } finally {
    await browser.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}

const sample = (page, label, durationMs) =>
  page.evaluate(
    async (name, ms) => {
      window.__p4perf.perfStart();
      await new Promise((resolve) => setTimeout(resolve, ms));
      return window.__p4perf.perfStop(name);
    },
    label,
    durationMs,
  );

const models = (page) => page.evaluate(() => window.__p4perf.modelSnapshot());

const satModule = (page, fn, arg) =>
  page.evaluate(
    (source, value) => {
      const module =
        window.__godsEyeView.dataManager.layers.get('satellites').module;
      return (0, eval)(`(${source})`)(module, value);
    },
    fn.toString(),
    arg,
  );

/** Heap tras un GC forzado por CDP, leído DESPUÉS de la ventana de 60 s. */
async function heapAfterGc(page) {
  const cdp = await page.createCDPSession();
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.detach();
  return page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
}

/** Vista de globo fija (lon -30, lat 20, 20 000 km), como en la línea base. */
const globeView = (page) =>
  page.evaluate(() => {
    const { viewer } = window.__godsEyeView;
    const cam = viewer.camera;
    const Cartographic = cam.positionCartographic.constructor;
    const dest = viewer.scene.globe.ellipsoid.cartographicToCartesian(
      new Cartographic((-30 * Math.PI) / 180, (20 * Math.PI) / 180, 2e7),
    );
    cam.setView({ destination: dest });
    viewer.scene.requestRender();
    return true;
  });

const waitSatellites = (page) =>
  page.waitForFunction(
    () =>
      (window.__godsEyeView.dataManager.layers
        .get('satellites')
        ?.module.getStats().count || 0) > 0,
    { timeout: 90_000 },
  );

async function openApp(browser, run) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(installObservers);
  await page.evaluateOnNewDocument(PAGE_INSTALL);
  page.on('pageerror', (e) => run.errors.push(String(e?.message || e)));
  await page.setViewport(VIEWPORT);
  const t0 = Date.now();
  await page.goto(run.url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.viewer &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 120_000 },
  );
  run.appReadyMs = Date.now() - t0;
  await page.bringToFront();
  await sleep(3000);
  return page;
}

async function enableSatellites(page) {
  const activation = await page.evaluate(async () => {
    const m = window.__godsEyeView.dataManager;
    const s = performance.now();
    await m.setEnabled('satellites', true, { origin: 'user' });
    return {
      enabled: m.isEnabled('satellites'),
      ms: Math.round(performance.now() - s),
    };
  });
  await waitSatellites(page);
  return activation;
}

async function sceneA(page, run) {
  run.activation = await enableSatellites(page);
  await globeView(page);
  await sleep(SETTLE_MS);
  console.log('A…');
  run.scenes.A = await sample(
    page,
    'A · satélites core, sin selección, globo',
    run.durationMs,
  );
  run.scenes.A.heapAfterGcBytes = await heapAfterGc(page);
}

async function sceneB(page, run) {
  run.trackIss = await satModule(
    page,
    (m, id) => m.trackById(id, { origin: 'user' }),
    ISS,
  );
  await sleep(SETTLE_MS);
  console.log('B…');
  run.scenes.B = run.trackIss
    ? await sample(
        page,
        'B · ISS seguida en ÓRBITA (trackById 25544)',
        run.durationMs,
      )
    : 'no medido: trackById(25544) devolvió false';
}

/** Entra en INSPECCIONAR con un clic real en el dock; en off la acción se rechaza. */
async function enterInspect(page) {
  const button = await page.evaluate(() => {
    const el = document.querySelector('[data-eye-dock-action="inspect"]');
    return el
      ? { label: el.textContent, disabled: el.disabled, title: el.title }
      : null;
  });
  if (button && !button.disabled) await clickAction(page, 'inspect');
  const framing = await satModule(page, (m) => m.getTrackedFraming());
  return { button, framing };
}

async function sceneB2(page, run) {
  if (!run.trackIss) return void (run.scenes.B2 = 'no medido: sin ISS seguida');
  run.inspect = await enterInspect(page);
  if (run.inspect.framing !== 'inspect') {
    run.scenes.B2 = `no aplicable: INSPECCIONAR rechazado (${run.inspect.button?.title || 'sin botón'})`;
    return;
  }
  run.inspect.modelReady = await waitModelReady(page, ISS);
  await sleep(SETTLE_MS);
  run.inspect.screen = await modelScreen(page, ISS);
  const bigEnough =
    run.inspect.modelReady && run.inspect.screen.diameterPx >= MODEL_MIN_PX;
  console.log('B2…');
  run.scenes.B2 = bigEnough
    ? await sample(
        page,
        'B2 · ISS en INSPECCIONAR, modelo listo',
        run.durationMs,
      )
    : `no medido: modelo no listo o < ${MODEL_MIN_PX} px`;
  if (bigEnough) run.scenes.B2.screenAfter = await modelScreen(page, ISS);
}

/** Disable con el modelo aún activo; comprueba el desmontaje antes de re-enable. */
async function teardown(page) {
  const before = await models(page);
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('satellites', false, {
      origin: 'user',
    }),
  );
  await sleep(1500);
  const disabled = await models(page);
  const commandListWhileDisabled = await page.evaluate(
    () =>
      window.__godsEyeView.viewer.scene.frameState.commandList?.length ??
      'no medido',
  );
  return { before, disabled, commandListWhileDisabled };
}

async function sceneE(page, run) {
  run.teardown = await teardown(page);
  run.reEnable = await enableSatellites(page);
  await globeView(page);
  await sleep(SETTLE_MS);
  console.log('E…');
  run.scenes.E = await sample(
    page,
    'E · tras disable (modelo activo) y re-enable, globo',
    run.durationMs,
  );
  run.scenes.E.heapAfterGcBytes = await heapAfterGc(page);
}

async function sceneC(page, run) {
  run.retrackIss = await satModule(
    page,
    (m, id) => m.trackById(id, { origin: 'user' }),
    ISS,
  );
  await sleep(SETTLE_MS);
  if (!run.retrackIss)
    return void (run.scenes.C = 'no medido: sin ISS seguida');
  await page.setViewport(ZOOM_200);
  await sleep(ZOOM_SETTLE_MS);
  console.log('C…');
  run.scenes.C = await sample(
    page,
    'C · ISS seguida en ÓRBITA, zoom 200 % (683x384 CSS @ DPR 2)',
    run.durationMs,
  );
  await page.setViewport(VIEWPORT);
}

async function waitDense(page, before) {
  const deadline = Date.now() + 120_000;
  let after = before;
  while (Date.now() < deadline) {
    await sleep(1000);
    after = await page.evaluate(() => window.__p4perf.countPoints());
    if (after > before + 1000) break;
  }
  return {
    pointsBefore: before,
    pointsAfter: after,
    ready: after > before + 1000,
  };
}

async function sceneD(page, run) {
  await page.evaluate(() => {
    const { dataManager, viewer } = window.__godsEyeView;
    dataManager.layers
      .get('satellites')
      .module.setParams({ selectedSatTrackingId: null }, { origin: 'user' });
    viewer.trackedEntity = undefined;
  });
  await sleep(1500);
  await globeView(page);
  const before = await page.evaluate(() => window.__p4perf.countPoints());
  run.denseParamsAccepted = await page.evaluate(() =>
    window.__godsEyeView.dataManager.setLayerParams(
      'satellites',
      { catalog: 'dense' },
      { origin: 'user' },
    ),
  );
  run.dense = await waitDense(page, before);
  if (!run.dense.ready)
    return void (run.scenes.D =
      'no medido: el catálogo dense no llegó en 120 s');
  await sleep(SETTLE_MS);
  console.log('D…');
  run.scenes.D = await sample(
    page,
    'D · catálogo dense (Starlink) sin selección, globo',
    run.durationMs,
  );
}

async function measure(run) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-p4-perf-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: GPU_ARGS,
    userDataDir: profile,
    defaultViewport: VIEWPORT,
  });
  try {
    run.chromeVersion = await browser.version();
    const page = await openApp(browser, run);
    for (const scene of [sceneA, sceneB, sceneB2, sceneE, sceneC, sceneD])
      await scene(page, run);
    run.modelEvents = await page.evaluate(() => window.__p4ModelEvents);
  } catch (e) {
    run.errors.push(`harness: ${e?.stack || e}`);
  } finally {
    await browser.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs();
  await refuseExisting(args.outDir);
  const renderer = await probeRenderer();
  if (/swiftshader|no-webgl/i.test(renderer))
    throw new Error(`renderer sin GPU real (${renderer}): no se mide`);
  const run = {
    capturedAt: new Date().toISOString(),
    ...args,
    rendererProbe: renderer,
    headless: true,
    browserFlags: GPU_ARGS,
    scenes: {},
    errors: [],
  };
  await measure(run);
  run.finishedAt = new Date().toISOString();
  const rawPath = path.join(args.outDir, 'raw-results.json');
  await fs.writeFile(rawPath, `${JSON.stringify(run, null, 2)}\n`, {
    flag: 'wx',
  });
  console.log(`wrote ${rawPath}`);
  if (run.errors.length > 0) process.exitCode = 1;
}

await main();
