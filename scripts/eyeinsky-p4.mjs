/**
 * Arnés canónico de EYEINSKY P4 (T7) — recorrido completo de la matriz
 * P4-01..P4-25 sobre la aplicación viva.
 *
 * Recorre: fixture OMM 123456 (inyectado en la respuesta real del proxy por
 * setRequestInterception) con selección, compartir, restaurar y seguir
 * exactos; pick real con puntero; INSPECCIONAR ISS y CubeSat (≥ 24 px,
 * estabilidad ±1 px y plano cercano durante 30 frames); clic real en el
 * casco; tarjeta del seguido fuera del casco; active+pending ≤ tope durante
 * todo el recorrido (sondeo cada 100 ms); A→B con evicción; 404 y GLB
 * corrupto; órbita caduca inyectada; SGP4 que falla («propagación falló»);
 * caída de la fuente; reduced-motion;
 * 5 viewports y zoom 200 % (CDP); GNSS sin modelo; dense y acoplados sin
 * modelo; disable/enable (escena E frente a A); activos con hash.
 *
 * result.json lleva `matrix`: por cada id P4, sus comprobaciones y estado.
 * Los ids que este arnés no puede probar se declaran «fuera del arnés» con
 * la evidencia que los cubre; nunca se marcan como aprobados aquí.
 *
 * Uso: node scripts/eyeinsky-p4.mjs <url> <directorio-de-salida>
 * La salida es OBLIGATORIA y no puede contener ya un result.json.
 * Nunca arranca servidor: apúntalo a uno vivo.
 */
import {
  createRecorder,
  finishRun,
  launchBrowser,
  prepareRun,
  sleep,
} from './lib/eyeinsky-p4-run.mjs';
import { openApp, webglRenderer } from './lib/eyeinsky-p4-page.mjs';
import {
  sampleCommands,
  startCapPoll,
  stopCapPoll,
} from './lib/eyeinsky-p4-measure.mjs';
import {
  FIXTURE_NORAD,
  createNetworkRules,
  installInterception,
} from './lib/eyeinsky-p4-network.mjs';
import {
  ISS,
  cardClearsHull,
  cubesatInspect,
  dockedCompanions,
  gnssPointOnly,
  hullClick,
  backToOrbit,
  inspectIss,
  pointerPick,
  reducedMotion,
  sixDigitFixture,
  staleOrbit,
  wheelInterrupt,
} from './lib/eyeinsky-p4-walk-core.mjs';
import {
  assetLedgers,
  denseNeverModel,
  glbFaults,
  phone,
  restoreShared,
  sceneE,
  sourceDown,
  targetSwitch,
  viewports,
} from './lib/eyeinsky-p4-walk-extra.mjs';
import { propagationFailure } from './lib/eyeinsky-p4-walk-sgp4.mjs';

const MATRIX = Object.freeze({
  'P4-01': 'TLE y OMM convergen sin truncar NORAD',
  'P4-02': 'NORAD OMM de 6 dígitos: seleccionar, compartir, restaurar, seguir',
  'P4-03': 'formato, época, consulta, caché y caducidad son campos distintos',
  'P4-04': 'posición SGP4; actitud sólo aproximada',
  'P4-05': 'activos con fuente, términos, escala, bytes y SHA-256',
  'P4-06': 'precedencia specific > family > null, nunca por nombre',
  'P4-07': 'puntos visibles y pickables con modelos activos',
  'P4-08': 'active + pending ≤ tope del perfil en todo momento',
  'P4-09': '404 / corrupto no cambian NORAD, punto, órbita, cámara, expediente',
  'P4-10': 'cambio de objetivo, disable y destroy liberan modelos',
  'P4-11': 'pick real, owner, coordenadas, GPU y fallos registrados',
  'P4-12': 'P0–P3, cámara adversa y cabina siguen verdes',
  'P4-13': 'responsive, reduced-motion, interrupción, atribución, zoom 200 %',
  'P4-14': 'rendimiento comparable (escena, capas, renderer)',
  'P4-15': 'tests, build, boundaries y formato',
  'P4-16': 'INSPECCIONAR a escala real; ÓRBITA vuelve sin cambiar NORAD',
  'P4-17': 'clic real sobre el casco no deselecciona',
  'P4-18': 'familia CubeSat sólo para el grupo cubesat',
  'P4-19': 'Alpha-5 / 6 dígitos sin NaN',
  'P4-20':
    'órbita caduca: sin modelo, punto y rótulo; SGP4 falla: «propagación falló»',
  'P4-21': 'actitud rotulada, sin números',
  'P4-22': 'campos del contexto, estado predicted, etiquetas en español',
  'P4-23': 'dense y acoplados nunca reciben modelo',
  'P4-24': 'escena E vuelve a comandos y memoria de A-off; A std = A off',
  'P4-25': 'activos con hash en el nombre y en los ledgers',
});

/** Ids que exigen evidencia de otro sitio (no se aprueban aquí). */
const EXTERNAL = Object.freeze({
  'P4-12':
    'arneses p3, p31, p012, camera-adverse, p012-cockpit y smoke (output/eyeinsky-p4/t7/)',
  'P4-14':
    'no medido aquí: línea base GPD con output/eyeinsky-p4/baseline/measure.mjs; comparación A–E pendiente de la sesión de calibración (§5)',
  'P4-15': 'gates: format:check, check:boundaries, npm test, build',
  'P4-24':
    'no se aprueba aquí: criterio literal (comandos iguales y heap tras GC de E frente a A-off; A std frente a A off) en scripts/eyeinsky-p4-perf.mjs (output/eyeinsky-p4/t7/perf, output/eyeinsky-p4/t7/repair-*); la exclusión del +2 del EntityCluster exige aprobación de Alex',
});

function matrixOf(checks) {
  const matrix = {};
  for (const [id, title] of Object.entries(MATRIX)) {
    const covering = checks.filter((entry) => entry.matrix.includes(id));
    const status = covering.length
      ? covering.every((entry) => entry.ok)
        ? 'aprobado'
        : 'fallido'
      : EXTERNAL[id]
        ? 'fuera del arnés'
        : 'sin cubrir';
    matrix[id] = {
      title,
      status,
      checks: covering.map(({ id: checkId, ok }) => ({ id: checkId, ok })),
      ...(EXTERNAL[id] ? { evidence: EXTERNAL[id] } : {}),
    };
  }
  return matrix;
}

/** Página principal: todo lo que no exige otro viewport ni otra red. */
async function mainWalk(ctx, url) {
  const page = await openApp(
    ctx.browser,
    ctx.result,
    url,
    {
      width: 1280,
      height: 800,
    },
    {
      beforeGoto: (p) => installInterception(p, ctx.rules),
      requireNorad: FIXTURE_NORAD,
    },
  );
  ctx.result.renderer = await webglRenderer(page);
  await startCapPoll(page);
  await page.evaluate(() => {
    const C = window.__CESIUM__;
    window.__godsEyeView.viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(-30, 20, 20_000_000),
    });
  });
  await sleep(4000);
  const sceneA = await sampleCommands(page, 3000);
  const steps = [
    sixDigitFixture,
    pointerPick,
    inspectIss,
    (c, p) => cardClearsHull(c, p, ISS, 'iss-tarjeta-no-cubre-modelo'),
    dockedCompanions,
    hullClick,
    wheelInterrupt,
    backToOrbit,
    reducedMotion,
    cubesatInspect,
    gnssPointOnly,
    staleOrbit,
    targetSwitch,
    sourceDown,
    denseNeverModel,
    viewports,
  ];
  for (const step of steps) await runStep(ctx, step, page);
  const poll = await stopCapPoll(page);
  ctx.result.snapshots.capPoll = poll;
  ctx.check(
    'tope-activos-mas-pendientes-en-todo-el-recorrido',
    poll.samples > 100 && poll.violations.length === 0 && poll.maxLoad <= 2,
    { ...poll, violations: poll.violations.slice(0, 5) },
    'P4-08',
  );
  await runStep(ctx, (c, p) => sceneE(c, p, sceneA), page);
  await page.close();
}

/** Un paso que lanza no aborta el recorrido: queda como comprobación fallida. */
async function runStep(ctx, step, page = null) {
  try {
    await step(ctx, page);
  } catch (error) {
    ctx.check(
      `paso-${step.name || 'anonimo'}-sin-excepcion`,
      false,
      String(error?.stack ?? error),
    );
  }
}

const { baseUrl, out, resultPath } = await prepareRun('eyeinsky-p4.mjs');
const url = new URL(baseUrl);
url.searchParams.set('satModels', 'std');
const { result, check } = createRecorder({
  url: url.href,
  viewport: '1280x800',
});
const { browser, close } = await launchBrowser('eye-p4-t7-');
const ctx = {
  browser,
  result,
  check,
  out,
  rules: { ...createNetworkRules({ baseUrl }), injectFixtures: true },
  shareUrl: null,
};
try {
  await mainWalk(ctx, url.href);
  await runStep(ctx, (c) => restoreShared(c));
  await runStep(ctx, (c) => glbFaults(c, url.href));
  await runStep(ctx, (c) => propagationFailure(c, url.href));
  await runStep(ctx, (c) => phone(c, baseUrl));
  await runStep(ctx, (c) => assetLedgers(c, baseUrl));
  check(
    'gpu-real-no-swiftshader',
    typeof result.renderer === 'string' &&
      !/swiftshader/i.test(result.renderer),
    result.renderer,
    'P4-11',
  );
  check(
    'sin-errores-de-pagina',
    result.pageErrors.length === 0,
    result.pageErrors,
  );
} catch (error) {
  result.fatal = String(error?.stack ?? error);
  console.error(error);
} finally {
  result.network = ctx.rules.log;
  result.matrix = matrixOf(result.checks);
  await close();
}
await finishRun(result, resultPath);
