/**
 * Arnés de navegador de EYEINSKY P4 · T4 — modelos satelitales cercanos.
 *
 * Verifica sobre la aplicación viva lo que las pruebas de nodo no pueden: que
 * la ISS seguida recibe su GLB real (Draco) en Cesium, que el tope de modelos
 * se respeta, que el punto sigue existiendo y es lo que devuelve scene.pick
 * (el modelo carga con allowPicking:false), que cambiar a Hubble evicta la
 * ISS y carga Hubble, y que desactivar la capa no deja primitivas huérfanas.
 *
 * Uso: node scripts/eyeinsky-p4-smoke.mjs <url> <directorio-de-salida>
 * El directorio de salida es OBLIGATORIO y no puede contener ya un result.json.
 * Nunca arranca servidor: apúntalo a uno vivo.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ISS = 25544;
const HST = 20580;
const MODEL_READY_TIMEOUT_MS = 20_000;
/** scaleMeters y radiusM medidos en T0 (public/models/satellites/manifest.json). */
const SCALE = { [ISS]: 4.2554456, [HST]: 0.0251195 };
const RADIUS_M = { [ISS]: 72.068, [HST]: 10.786 };
/**
 * Escala real: el modelo de Cesium lleva exactamente la escala del manifiesto,
 * y su esfera envolvente cae a ±25 % del radiusM de T0. No es igualdad: T0
 * transforma las 8 esquinas de cada accessor (caja conservadora) y Cesium solo
 * min/max por primitiva; un error de escala real sería de órdenes de magnitud.
 */
const realScale = (pick, id) =>
  pick.ok &&
  pick.modelScale === SCALE[id] &&
  Number.isFinite(pick.boundingRadiusM) &&
  Math.abs(pick.boundingRadiusM / RADIUS_M[id] - 1) < 0.25;

const baseUrl = process.argv[2];
const out = process.argv[3];
if (!baseUrl || !out)
  throw new Error('uso: eyeinsky-p4-smoke.mjs <url> <directorio-de-salida>');
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

const url = new URL(baseUrl);
url.searchParams.set('satModels', 'std');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'eye-p4-'));
const result = {
  startedAt: new Date().toISOString(),
  url: url.href,
  browserMode: 'perfil temporal nuevo, Chrome headless, GPU nativa',
  viewport: '1280x800',
  checks: [],
  snapshots: {},
  events: [],
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  screenshots: [],
};
const check = (id, ok, detail) => {
  result.checks.push({ id, ok: Boolean(ok), detail });
  console.log(`${ok ? 'ok  ' : 'FALLA'} ${id}`);
};

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
  userDataDir: profile,
});

/** Estadísticas del módulo de modelos (API de testing de la capa). */
const statsIn = (page) =>
  page.evaluate(() =>
    window.__godsEyeView.dataManager.layers
      .get('satellites')
      .module._satelliteModelStatsForTest(),
  );

/** Primitivas de modelo satelital en todo el árbol de la escena. */
const orphanScan = (page) =>
  page.evaluate(() => {
    const C = window.__CESIUM__;
    const found = [];
    const walk = (primitive) => {
      if (!primitive || primitive.isDestroyed?.()) return;
      if (primitive instanceof C.PrimitiveCollection) {
        for (let i = 0; i < primitive.length; i += 1) walk(primitive.get(i));
        return;
      }
      if (primitive.gevSatelliteNorad !== undefined)
        found.push(primitive.gevSatelliteNorad);
    };
    walk(window.__godsEyeView.viewer.scene.primitives);
    return found;
  });

async function screenshot(page, name) {
  const file = path.join(out, name);
  await page.screenshot({ path: file });
  result.screenshots.push(file);
}

async function waitFor(page, predicate, arg, timeout) {
  const started = Date.now();
  await page.waitForFunction(predicate, { timeout, polling: 250 }, arg);
  return Date.now() - started;
}

/** Sigue un NORAD por la API pública de la capa y acerca la cámara. */
async function followAndApproach(page, noradId, rangeM) {
  const tracked = await page.evaluate(
    (id) =>
      window.__godsEyeView.dataManager.layers
        .get('satellites')
        .module.trackById(id, { origin: 'user' }),
    noradId,
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const approach = await page.evaluate((range) => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const entity = viewer.trackedEntity;
    const target = entity?.position?.getValue(viewer.clock.currentTime);
    if (!target) return { ok: false, reason: 'sin entidad seguida' };
    const before = C.Cartesian3.distance(viewer.camera.positionWC, target);
    viewer.camera.zoomIn(before - range);
    return { ok: true, before, gevTrackedId: entity.gevTrackedId };
  }, rangeM);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const after = await page.evaluate(() => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const target = viewer.trackedEntity?.position?.getValue(
      viewer.clock.currentTime,
    );
    return target
      ? C.Cartesian3.distance(viewer.camera.positionWC, target)
      : null;
  });
  return { tracked, ...approach, afterM: after };
}

/**
 * Ayudantes de página (window.__p4), instalados antes de cargar la app; cada
 * instalador se serializa aparte. Cesium se resuelve al llamarlos
 * (window.__CESIUM__ aparece más tarde).
 */
function installPrimitiveFinders() {
  const cesium = () => window.__CESIUM__;
  /** Primer primitivo del árbol que cumple `test` (entra en colecciones). */
  function find(test) {
    const C = cesium();
    let found = null;
    const walk = (primitive) => {
      if (!primitive || found || primitive.isDestroyed?.()) return;
      if (test(primitive)) {
        found = primitive;
        return;
      }
      const nested =
        primitive instanceof C.PrimitiveCollection ||
        primitive instanceof C.PointPrimitiveCollection;
      if (!nested) return;
      for (let i = 0; i < primitive.length; i += 1) walk(primitive.get(i));
    };
    walk(window.__godsEyeView.viewer.scene.primitives);
    return found;
  }
  const describe = (picked) => ({
    primitiveType: picked?.primitive?.constructor?.name ?? null,
    id:
      typeof picked?.id === 'object' && picked?.id !== null
        ? (picked.id.gevTrackedId ?? 'entity')
        : (picked?.id ?? null),
    satelliteModel: picked?.primitive?.gevSatelliteNorad !== undefined,
  });
  window.__p4 = {
    ...window.__p4,
    describe,
    modelOf: (id) => find((p) => p.gevSatelliteNorad === id),
    pointOf: (id) =>
      find((p) => p instanceof cesium().PointPrimitive && p.id === id),
  };
}

/** pick + drillPick en la proyección del origen del modelo `id`. */
function installPickMeasure() {
  window.__p4 = { ...window.__p4 };
  window.__p4.measurePick = (id) => {
    const C = window.__CESIUM__;
    const { modelOf, pointOf, describe } = window.__p4;
    const viewer = window.__godsEyeView.viewer;
    const model = modelOf(id);
    const point = pointOf(id);
    if (!model)
      return { ok: false, reason: 'sin modelo', pointExists: !!point };
    const origin = C.Matrix4.getTranslation(
      model.modelMatrix,
      new C.Cartesian3(),
    );
    const screen = C.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      origin,
    );
    if (!screen)
      return { ok: false, reason: 'fuera de pantalla', pointExists: !!point };
    return {
      ok: true,
      screen: { x: screen.x, y: screen.y },
      pointExists: !!point,
      pointShow: point?.show ?? null,
      modelShow: model.show,
      modelScale: model.scale,
      boundingRadiusM: model.boundingSphere?.radius ?? null,
      cameraDistanceM: C.Cartesian3.distance(viewer.camera.positionWC, origin),
      picked: describe(viewer.scene.pick(screen, 11, 11)),
      drill: viewer.scene.drillPick(screen, 10, 11, 11).map(describe),
    };
  };
}

/** Ejes locales del modelo `id` expresados en ENU de su origen. */
function installAxesProbe() {
  window.__p4 = { ...window.__p4 };
  window.__p4.modelAxesEnu = (id) => {
    const C = window.__CESIUM__;
    const model = window.__p4.modelOf(id);
    if (!model) return null;
    const matrix = model.modelMatrix;
    const origin = C.Matrix4.getTranslation(matrix, new C.Cartesian3());
    const enu = C.Transforms.eastNorthUpToFixedFrame(origin);
    const toEnu = C.Matrix4.inverseTransformation(enu, new C.Matrix4());
    const axis = (column) => {
      const ecef = C.Cartesian3.normalize(
        new C.Cartesian3(...[0, 1, 2].map((row) => matrix[column * 4 + row])),
        new C.Cartesian3(),
      );
      const local = C.Matrix4.multiplyByPointAsVector(toEnu, ecef, ecef);
      return [local.x, local.y, local.z];
    };
    return { enu, xEnu: axis(0), yEnu: axis(1), zEnu: axis(2) };
  };
}

/**
 * scene.pick y scene.drillPick en la proyección del origen del modelo, justo
 * tras un frame y con el bucle de render congelado: ese origen es la muestra
 * SGP4 con la que se colocaron este frame el punto seguido y la cámara, así
 * que el pick debe devolver el punto (id NORAD o entidad `satellites:<id>`) y
 * nunca el modelo (allowPicking:false). A 1–4 km un objeto a 7,66 km/s se
 * desplaza cientos de píxeles entre frames, por eso todo ocurre en uno solo.
 */
const pickAt = (page, noradId) =>
  page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const viewer = window.__godsEyeView.viewer;
        const remove = viewer.scene.postRender.addEventListener(() => {
          remove();
          viewer.useDefaultRenderLoop = false;
          setTimeout(() => {
            let outcome;
            try {
              outcome = window.__p4.measurePick(id);
            } catch (error) {
              outcome = { ok: false, reason: String(error) };
            } finally {
              viewer.useDefaultRenderLoop = true;
            }
            resolve(outcome);
          }, 0);
        });
      }),
    noradId,
  );

/**
 * Vista cenital del modelo seguido con su +X local (adelante, ≈ velocidad en
 * LVLH) hacia arriba en pantalla. Devuelve los ejes locales del modelo en ENU:
 * en 'lvlh-nominal' +Z local debe ser el cénit y +X horizontal.
 */
const topDownPose = (page, noradId, rangeM) =>
  page.evaluate(
    (id, range) => {
      const C = window.__CESIUM__;
      const axes = window.__p4.modelAxesEnu(id);
      if (!axes) return { ok: false, reason: 'sin modelo' };
      const { enu, xEnu, yEnu, zEnu } = axes;
      const heading = Math.atan2(xEnu[0], xEnu[1]);
      window.__godsEyeView.viewer.camera.lookAtTransform(
        enu,
        new C.HeadingPitchRange(heading, -Math.PI / 2 + 1e-3, range),
      );
      const headingDeg = (heading * 180) / Math.PI;
      return { ok: true, xEnu, yEnu, zEnu, headingDeg };
    },
    noradId,
    rangeM,
  );

const pickReturnsNorad = (pick, id) =>
  pick.ok &&
  (pick.picked.id === id || pick.picked.id === `satellites:${id}`) &&
  !pick.drill.some((entry) => entry.satelliteModel);

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', (error) => result.pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) =>
    result.requestFailures.push(
      `${request.url()} ${request.failure()?.errorText}`,
    ),
  );
  await page.evaluateOnNewDocument(installPrimitiveFinders);
  await page.evaluateOnNewDocument(installPickMeasure);
  await page.evaluateOnNewDocument(installAxesProbe);
  await page.evaluateOnNewDocument(() => {
    window.__p4ModelEvents = [];
    for (const type of ['model-ready', 'model-evicted', 'model-failed']) {
      window.addEventListener(`gev:satellite-${type}`, (event) =>
        window.__p4ModelEvents.push({
          type,
          at: performance.now(),
          ...event.detail,
        }),
      );
    }
  });
  await page.goto(url.href, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.viewer &&
      window.__godsEyeView?.dataManager &&
      window.__CESIUM__ &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 120_000 },
  );

  // 1. Capa activa, catálogo con la ISS y Hubble, manifiesto cargado.
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('satellites', true, {
      origin: 'user',
    }),
  );
  const catalogMs = await waitFor(
    page,
    ([iss, hst]) => {
      const module =
        window.__godsEyeView.dataManager.layers.get('satellites')?.module;
      const stats = module?._satelliteModelStatsForTest?.();
      const ids = new Set(
        (module?.getAllPositions?.(5000) ?? []).map((row) => row.id),
      );
      return stats?.manifest === 'ready' && ids.has(iss) && ids.has(hst);
    },
    [ISS, HST],
    60_000,
  );
  result.snapshots.enabled = await statsIn(page);
  check('capa-activa-manifiesto-y-catalogo', true, {
    catalogMs,
    stats: result.snapshots.enabled,
  });
  check('perfil-std-por-override', result.snapshots.enabled.profile === 'std', {
    profile: result.snapshots.enabled.profile,
  });

  // 2. Seguir la ISS, acercar la cámara y esperar model-ready (≤ 20 s).
  const issApproach = await followAndApproach(page, ISS, 1500);
  const issReadyMs = await waitFor(
    page,
    (id) =>
      window.__godsEyeView.dataManager.layers
        .get('satellites')
        .module._satelliteModelStatsForTest()
        .ids.includes(id) &&
      window.__p4ModelEvents.some(
        (event) => event.type === 'model-ready' && event.noradId === id,
      ),
    ISS,
    MODEL_READY_TIMEOUT_MS,
  ).catch(() => null);
  result.snapshots.issTracked = await statsIn(page);
  check('iss-model-ready-20s', issReadyMs !== null, {
    issReadyMs,
    issApproach,
    stats: result.snapshots.issTracked,
  });
  check(
    'tope-activos-mas-pendientes',
    result.snapshots.issTracked.active + result.snapshots.issTracked.pending <=
      2,
    result.snapshots.issTracked,
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const issPick = await pickAt(page, ISS);
  check(
    'iss-punto-existe-y-pick-devuelve-norad',
    pickReturnsNorad(issPick, ISS),
    issPick,
  );
  check('iss-escala-real', realScale(issPick, ISS), {
    modelScale: issPick.modelScale,
    manifestScale: SCALE[ISS],
    boundingRadiusM: issPick.boundingRadiusM,
    manifestRadiusM: RADIUS_M[ISS],
    cameraDistanceM: issPick.cameraDistanceM,
  });
  await screenshot(page, 'iss-model.png');
  const issPose = await topDownPose(page, ISS, 450);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await screenshot(page, 'iss-pose-cenital.png');
  check(
    'iss-pose-lvlh-z-cenit-x-horizontal',
    issPose.ok && issPose.zEnu[2] > 0.99 && Math.abs(issPose.xEnu[2]) < 0.02,
    issPose,
  );

  // 3. Cambiar a Hubble: evicción inmediata de la ISS y carga de Hubble.
  const hstApproach = await followAndApproach(page, HST, 250);
  const hstReadyMs = await waitFor(
    page,
    (id) =>
      window.__p4ModelEvents.some(
        (event) => event.type === 'model-ready' && event.noradId === id,
      ),
    HST,
    MODEL_READY_TIMEOUT_MS,
  ).catch(() => null);
  result.snapshots.hstTracked = await statsIn(page);
  const events = await page.evaluate(() => window.__p4ModelEvents);
  const issEvicted = events.find(
    (event) => event.type === 'model-evicted' && event.noradId === ISS,
  );
  check(
    'iss-evictada-al-cambiar-objetivo',
    issEvicted?.reason === 'target-change',
    {
      issEvicted,
      ids: result.snapshots.hstTracked.ids,
    },
  );
  check('hubble-model-ready-20s', hstReadyMs !== null, {
    hstReadyMs,
    hstApproach,
    stats: result.snapshots.hstTracked,
  });
  check(
    'tope-tras-cambio',
    result.snapshots.hstTracked.active + result.snapshots.hstTracked.pending <=
      2,
    result.snapshots.hstTracked,
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const hstPick = await pickAt(page, HST);
  check('hubble-pick-devuelve-norad', pickReturnsNorad(hstPick, HST), hstPick);
  check('hubble-escala-real', realScale(hstPick, HST), {
    modelScale: hstPick.modelScale,
    manifestScale: SCALE[HST],
    boundingRadiusM: hstPick.boundingRadiusM,
    manifestRadiusM: RADIUS_M[HST],
    cameraDistanceM: hstPick.cameraDistanceM,
  });
  await screenshot(page, 'hubble-model.png');

  // 4. Desactivar la capa: 0 activos, 0 pendientes, sin primitivas huérfanas.
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('satellites', false, {
      origin: 'user',
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  result.snapshots.disabled = await statsIn(page);
  const orphans = await orphanScan(page);
  check(
    'desactivar-vacia-modelos',
    result.snapshots.disabled.active === 0 &&
      result.snapshots.disabled.pending === 0 &&
      orphans.length === 0,
    { stats: result.snapshots.disabled, orphans },
  );
  result.events = await page.evaluate(() => window.__p4ModelEvents);
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
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
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
