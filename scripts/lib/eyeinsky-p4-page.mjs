/**
 * Ayudantes de página compartidos por los arneses P4: abrir la app viva con
 * la capa de satélites, seguir un NORAD, leer lo que pintan la capa y el
 * Mission Dock, y medir los objetivos táctiles del dock.
 */
import { sleep } from './eyeinsky-p4-run.mjs';
import { installMeasureHelpers } from './eyeinsky-p4-measure.mjs';

/**
 * Espera de model-ready en el arnés: la app ya falla una carga a los 20 s
 * (SAT_MODEL_LOAD_TIMEOUT_MS); el arnés espera un poco más para leer ese
 * desenlace en lugar de cortar justo en la frontera.
 */
export const MODEL_READY_TIMEOUT_MS = 25_000;

/** Eventos de modelo y de sujeto, registrados antes de cargar la app. */
function installEventLog() {
  window.__p4ModelEvents = [];
  window.__p4Cleared = 0;
  window.__p4Selected = 0;
  window.addEventListener('gev:awareness-subject-cleared', () => {
    window.__p4Cleared += 1;
  });
  window.addEventListener('gev:awareness-subject-selected', () => {
    window.__p4Selected += 1;
  });
  for (const type of ['model-ready', 'model-evicted', 'model-failed']) {
    window.addEventListener(`gev:satellite-${type}`, (event) =>
      window.__p4ModelEvents.push({
        type,
        at: performance.now(),
        ...event.detail,
      }),
    );
  }
}

/**
 * Página nueva con la app lista y la capa de satélites encendida.
 * @param {object} browser Puppeteer.
 * @param {object} result Registro de la corrida (errores de página).
 * @param {string} url URL de la app.
 * @param {object} viewport Viewport de Puppeteer.
 * @param {object} [options]
 * @param {(page: object) => Promise<void>} [options.beforeGoto] Intercepción,
 *   medios emulados...: corre antes de navegar.
 * @param {boolean} [options.enableSatellites=true]
 * @param {number} [options.requireNorad=25544] NORAD que debe estar cargado.
 */
export async function openApp(browser, result, url, viewport, options = {}) {
  const { beforeGoto, enableSatellites = true, requireNorad = 25544 } = options;
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (error) => result.pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  await page.evaluateOnNewDocument(installEventLog);
  await page.evaluateOnNewDocument(installMeasureHelpers);
  if (beforeGoto) await beforeGoto(page);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(
    () =>
      window.__godsEyeView?.viewer &&
      window.__godsEyeView?.dataManager &&
      window.__CESIUM__ &&
      document.querySelector('#loading-screen')?.classList.contains('hidden'),
    { timeout: 120_000 },
  );
  if (enableSatellites)
    await page.evaluate(() =>
      window.__godsEyeView.dataManager.setEnabled('satellites', true, {
        origin: 'user',
      }),
    );
  if (requireNorad !== null) await waitForCatalog(page, requireNorad);
  return page;
}

/** Espera a que el manifiesto esté listo y el NORAD tenga posición. */
export const waitForCatalog = (page, norad, timeout = 60_000) =>
  page.waitForFunction(
    (id) => {
      const module =
        window.__godsEyeView.dataManager.layers.get('satellites')?.module;
      const stats = module?._satelliteModelStatsForTest?.();
      const ids = new Set(
        (module?.getAllPositions?.(20000) ?? []).map((row) => row.id),
      );
      return stats?.manifest === 'ready' && ids.has(id);
    },
    { timeout, polling: 250 },
    norad,
  );

/** Estadísticas del módulo de modelos. */
export const modelStats = (page) =>
  page.evaluate(() =>
    window.__godsEyeView.dataManager.layers
      .get('satellites')
      .module._satelliteModelStatsForTest(),
  );

/** Estado del objetivo: capa, cámara, contexto, punto seguido y modelos. */
export const layerProbe = (page) =>
  page.evaluate(() => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const module =
      window.__godsEyeView.dataManager.layers.get('satellites').module;
    const id = module.getParams().selectedSatTrackingId;
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
      contextId: record?.id ?? null,
      contextFraming: record?.properties?.framing ?? null,
      contextStatus: record?.status ?? null,
      properties: record?.properties ?? null,
      following,
      cameraOwner: tracked?.gevTrackedId ?? null,
      // Siguiendo, el offset del EntityView ES el rango del encuadre.
      cameraRangeM: following
        ? C.Cartesian3.magnitude(viewer.camera.position)
        : null,
      worldRangeM: world
        ? C.Cartesian3.distance(viewer.camera.positionWC, world)
        : null,
      cleared: window.__p4Cleared,
      selectedEvents: window.__p4Selected,
      pointSize: tracked?.point?.pixelSize?.getValue(now) ?? null,
      pointAlpha: tracked?.point?.color?.getValue(now)?.alpha ?? null,
      pointShown: tracked?.point?.show?.getValue(now) ?? true,
      hasPoint: Boolean(tracked?.point),
      stats: module._satelliteModelStatsForTest(),
    };
  });

/** Lo que el dock pinta del objetivo: clave, cámara, estado, acción, chips. */
export const dockProbe = (page) =>
  page.evaluate(() => {
    const inspect = document.querySelector('[data-eye-dock-action="inspect"]');
    const dock = document.getElementById('eye-mission-dock');
    const reason = document.getElementById('eye-dock-action-reason');
    return {
      dockKey: dock?.dataset.contextKey ?? null,
      cameraStatus: dock?.dataset.cameraStatus ?? null,
      statusLine: document.querySelector('.eye-dock-status')?.textContent,
      inspect: inspect
        ? {
            label: inspect.textContent,
            disabled: inspect.disabled,
            title: inspect.title,
            describedBy: inspect.getAttribute('aria-describedby'),
          }
        : null,
      reason: reason && !reason.hidden ? reason.textContent : null,
      chips: [...document.querySelectorAll('.eye-sat-chip')].map(
        (chip) => chip.textContent,
      ),
      rail: [...(dock?.querySelectorAll('.eye-dock-keyvalue') ?? [])].map(
        (item) => item.textContent,
      ),
    };
  });

export const probe = async (page) => ({
  ...(await layerProbe(page)),
  ...(await dockProbe(page)),
});

export const trackById = (page, id) =>
  page.evaluate(
    (norad) =>
      window.__godsEyeView.dataManager.layers
        .get('satellites')
        .module.trackById(norad, { origin: 'user' }),
    id,
  );

/** El dock muestra ya al objetivo `id`. */
export async function waitForDock(page, id) {
  await page.waitForFunction(
    (key) =>
      document.getElementById('eye-mission-dock')?.dataset.contextKey === key,
    { timeout: 10_000 },
    `satellites:${id}`,
  );
  await sleep(400);
}

/** Espera model-ready de `id` con el modelo admitido; false si no llega. */
export const waitModelReady = (page, id, timeout = MODEL_READY_TIMEOUT_MS) =>
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
      { timeout, polling: 250 },
      id,
    )
    .then(() => true)
    .catch(() => false);

export const modelEvents = (page) =>
  page.evaluate(() => window.__p4ModelEvents);

export const nasaCreditShown = (page) =>
  page.evaluate(() =>
    (window.__godsEyeView.viewer.creditDisplay?._staticCredits ?? []).some(
      (credit) => String(credit?.html ?? '').includes('NASA 3D Resources'),
    ),
  );

/**
 * Clic real en una acción del dock. El dock repinta sus botones cuando cambia
 * lo visible (edad del registro, estado de cámara), así que un botón puede
 * soltarse del documento entre localizarlo y pulsarlo: se reintenta.
 */
export async function clickAction(page, id, attempts = 4) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.click(`[data-eye-dock-action="${id}"]`);
      return;
    } catch (error) {
      const detached = /detached|not clickable|Node is/i.test(String(error));
      if (!detached || attempt >= attempts) throw error;
      await sleep(120);
    }
  }
}

/**
 * Rango de la cámara seguidora en cada frame durante `ms` tras `act()`:
 * prueba que un encuadre anima (varios frames intermedios) sin depender de
 * cuánto tarda el propio arnés en volver a mirar.
 */
export async function recordFramingRanges(page, act, ms = 1200) {
  await page.evaluate(() => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    window.__p4Ranges = [];
    window.__p4RangesStop?.();
    window.__p4RangesStop = viewer.scene.postRender.addEventListener(() =>
      window.__p4Ranges.push(C.Cartesian3.magnitude(viewer.camera.position)),
    );
  });
  await act();
  await sleep(ms);
  return page.evaluate(() => {
    window.__p4RangesStop?.();
    return window.__p4Ranges;
  });
}

/** Primer NORAD del grupo con elementos no caducados, o null. */
export async function pickFromGroup(page, group, limit = 25) {
  const ids = await page.evaluate((wanted) => {
    const module =
      window.__godsEyeView.dataManager.layers.get('satellites').module;
    return module
      .getAllPositions(20000)
      .map((row) => row.id)
      .filter((id) => module._catalogGroupForTest(id) === wanted);
  }, group);
  for (const id of ids.slice(0, limit)) {
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

/** Visible y medible: el mismo filtro para botones, texto y riel. */
function installDockReaders() {
  const visible = (element) =>
    Boolean(element?.getClientRects().length) &&
    getComputedStyle(element).visibility !== 'hidden' &&
    getComputedStyle(element).display !== 'none';
  const dock = () => document.getElementById('eye-mission-dock');
  /** Botón: dentro de la ventana visual, alcanzable en su centro, tamaño. */
  const measureButton = (element) => {
    const viewport = window.visualViewport;
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return {
      label: element.textContent?.trim() || element.getAttribute('aria-label'),
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
  window.__p4dock = { visible, dock, measureButton };
}

const TEXT_SELECTOR =
  '.eye-dock-title, .eye-dock-action, .eye-dock-keyvalue dt, .eye-dock-keyvalue dd, .eye-dock-status, .eye-dock-action-reason';

/** Botones del dock y desbordamiento horizontal de la página. */
const dockButtons = (page) =>
  page.evaluate(() => {
    const { visible, dock, measureButton } = window.__p4dock;
    return {
      scale: window.visualViewport.scale,
      width: window.innerWidth,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      buttons: [...dock().querySelectorAll('button')]
        .filter(visible)
        .map(measureButton),
    };
  });

/** Texto esencial del dock y valores del riel (recortados o no). */
const dockText = (page) =>
  page.evaluate((selector) => {
    const { visible, dock } = window.__p4dock;
    const railValues = [...dock().querySelectorAll('.eye-dock-keyvalue dd')]
      .filter(visible)
      .map((element) => ({
        text: element.textContent,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }));
    return {
      rail: [...dock().querySelectorAll('.eye-dock-keyvalue')]
        .filter(visible)
        .map((item) => item.textContent),
      railValues,
      railTruncated: railValues.filter((v) => v.scrollWidth > v.clientWidth),
      text: [...dock().querySelectorAll(selector)]
        .filter(visible)
        .map((element) => ({
          text: element.textContent?.trim(),
          size: Number.parseFloat(getComputedStyle(element).fontSize),
        })),
    };
  }, TEXT_SELECTOR);

/**
 * Objetivos del dock: dentro, alcanzables y ≥ 44 px; texto esencial ≥ 13 px;
 * y ningún valor del riel recortado (scrollWidth ≤ clientWidth).
 */
export async function dockTargets(page) {
  await page.evaluate(installDockReaders);
  return { ...(await dockButtons(page)), ...(await dockText(page)) };
}

/** Todo alcanzable, ≥ 44 px, texto ≥ 13 px, sin desbordes ni recortes. */
export const targetsOk = (m) =>
  m.overflowX <= 0 &&
  m.buttons.length > 0 &&
  m.buttons.every(
    (b) => b.inside && b.hit && b.width >= 44 && b.height >= 44,
  ) &&
  m.text.length > 0 &&
  m.text.every((t) => t.size >= 13) &&
  m.railTruncated.length === 0;

/** Primitivas de modelo satelital que quedan en todo el árbol de la escena. */
export const orphanScan = (page) =>
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

/** Renderer WebGL real (para no confundir SwiftShader con GPU física). */
export const webglRenderer = (page) =>
  page.evaluate(() => {
    const gl = window.__godsEyeView.viewer.scene.context._gl;
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
  });
