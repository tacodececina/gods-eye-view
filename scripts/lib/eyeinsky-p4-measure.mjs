/**
 * Medidas de página del recorrido P4: tope de modelos durante todo el
 * recorrido, estabilidad del modelo proyectado frame a frame, tarjeta del
 * seguido frente al casco, pick real con puntero y comandos de Cesium.
 * Cada medida corre en la página; lo que se compara es del mismo frame.
 */

/** Sondeo continuo de active+pending frente al tope del perfil. */
export const startCapPoll = (page, intervalMs = 100) =>
  page.evaluate((ms) => {
    const module =
      window.__godsEyeView.dataManager.layers.get('satellites').module;
    const poll = { samples: 0, maxLoad: 0, violations: [], profiles: [] };
    const caps = { std: 2, low: 1, off: 0 };
    window.__p4CapPoll = poll;
    window.__p4CapTimer = setInterval(() => {
      const stats = module._satelliteModelStatsForTest();
      const load = stats.active + stats.pending;
      poll.samples += 1;
      poll.maxLoad = Math.max(poll.maxLoad, load);
      if (!poll.profiles.includes(stats.profile))
        poll.profiles.push(stats.profile);
      const cap = caps[stats.profile];
      if (cap === undefined || load > cap)
        poll.violations.push({ at: performance.now(), load, stats });
    }, ms);
  }, intervalMs);

export const readCapPoll = (page) =>
  page.evaluate(() => ({ ...window.__p4CapPoll }));

export const stopCapPoll = (page) =>
  page.evaluate(() => {
    clearInterval(window.__p4CapTimer);
    return { ...window.__p4CapPoll };
  });

/**
 * Ayudantes de página (window.__p4m), instalados antes de cargar la app:
 * localizar el modelo de un NORAD y proyectar su esfera envolvente. Cesium
 * se resuelve al llamarlos (window.__CESIUM__ aparece más tarde).
 */
export function installMeasureHelpers() {
  const findModel = (norad) => {
    const C = window.__CESIUM__;
    let found = null;
    const walk = (p) => {
      if (!p || found || p.isDestroyed?.()) return;
      if (p.gevSatelliteNorad === norad) found = p;
      else if (p instanceof C.PrimitiveCollection)
        for (let i = 0; i < p.length; i += 1) walk(p.get(i));
    };
    walk(window.__godsEyeView.viewer.scene.primitives);
    return found;
  };
  /** Centro, radio y diámetro proyectados de la esfera del modelo. */
  const sphereOnScreen = (model) => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const { center, radius } = model.boundingSphere;
    const screen = C.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      center,
    );
    const distanceM = C.Cartesian3.distance(viewer.camera.positionWC, center);
    const tan = Math.tan(viewer.camera.frustum.fovy / 2);
    const diameterPx =
      (2 * radius * viewer.scene.canvas.clientHeight) / (2 * distanceM * tan);
    return {
      x: screen?.x ?? null,
      y: screen?.y ?? null,
      distanceM,
      diameterPx,
    };
  };
  /** Llama a `sample()` en cada postRender hasta que devuelva true. */
  const everyFrame = (sample, timeoutMs) =>
    new Promise((resolve) => {
      const viewer = window.__godsEyeView.viewer;
      const remove = viewer.scene.postRender.addEventListener(() => {
        if (sample()) finish(true);
      });
      const timer = setTimeout(() => finish(false), timeoutMs);
      function finish(done) {
        clearTimeout(timer);
        remove();
        resolve(done);
      }
    });
  window.__p4m = { findModel, sphereOnScreen, everyFrame };
}

/** Resumen de las muestras de estabilidad (en la página). */
function summarizeStability(samples) {
  const spread = (values) =>
    values.some((n) => !Number.isFinite(n))
      ? null
      : Math.max(...values) - Math.min(...values);
  return {
    frames: samples.length,
    spreadXPx: spread(samples.map((s) => s.x)),
    spreadYPx: spread(samples.map((s) => s.y)),
    minDistanceM: Math.min(...samples.map((s) => s.distanceM)),
    maxNearM: Math.max(...samples.map((s) => s.near)),
    minDiameterPx: Math.min(...samples.map((s) => s.diameterPx)),
    first: samples[0] ?? null,
    last: samples.at(-1) ?? null,
  };
}

/**
 * Centro proyectado del modelo `id` durante `frames` postRender seguidos,
 * con distancia de cámara y plano cercano. La cámara sigue al objetivo, así
 * que un modelo estable se queda en el mismo píxel (±1 px).
 */
export async function projectedStability(page, id, frames = 30) {
  const samples = await page.evaluate(
    async (norad, count) => {
      const { findModel, sphereOnScreen, everyFrame } = window.__p4m;
      const camera = window.__godsEyeView.viewer.camera;
      const out = [];
      await everyFrame(() => {
        const model = findModel(norad);
        if (model?.ready)
          out.push({ ...sphereOnScreen(model), near: camera.frustum.near });
        return out.length >= count;
      }, 15_000);
      return out;
    },
    id,
    frames,
  );
  const logDepth = await page.evaluate(
    () => window.__godsEyeView.viewer.scene.logarithmicDepthBuffer === true,
  );
  return { ...summarizeStability(samples), logDepth };
}

/** Rectángulo pintado de la tarjeta del seguido, por la instancia de la app. */
function installCardReader() {
  const moduleUrl = (suffix) =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => new URL(name).pathname.endsWith(suffix));
  window.__p4m.cardRect = async () => {
    // La URL exacta con la que la app cargó el módulo (Vite puede añadir
    // ?t= tras un HMR): así se lee la MISMA instancia, no una copia.
    const overlayUrl = moduleUrl('/src/overlays/worldOverlay.js');
    const readoutUrl = moduleUrl('/src/data/trackedReadout.js');
    if (!overlayUrl || !readoutUrl) return null;
    const overlay = await import(overlayUrl);
    const readout = await import(readoutUrl);
    return () => {
      const entryId = readout.getActiveTrackedReadoutId();
      return entryId ? overlay.getOverlayPaintRect('tracked', entryId) : null;
    };
  };
}

/** Separación vertical tarjeta/casco: > 0 es hueco, < 0 es solape. */
function cardClearance(rect, hull) {
  const radiusPx = hull.diameterPx / 2;
  const rectBottom = rect.y + rect.h;
  const above = rectBottom <= hull.y;
  return {
    ok: true,
    rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
    hull: { x: hull.x, y: hull.y, radiusPx },
    clearancePx: above
      ? hull.y - radiusPx - rectBottom
      : rect.y - (hull.y + radiusPx),
    placement: above ? 'encima' : 'debajo',
  };
}

/**
 * Tarjeta del seguido frente a la esfera proyectada del modelo, leídas en
 * el mismo frame.
 */
export async function cardVersusHull(page, id) {
  await page.evaluate(installCardReader);
  const pair = await page.evaluate(async (norad) => {
    const { findModel, sphereOnScreen, everyFrame, cardRect } = window.__p4m;
    const readRect = await cardRect();
    if (!readRect) return { reason: 'sin módulos' };
    let found = null;
    await everyFrame(() => {
      const rect = readRect();
      const model = findModel(norad);
      if (rect && model?.ready)
        found = { rect: { ...rect }, hull: sphereOnScreen(model) };
      return found !== null;
    }, 10_000);
    return found ?? { reason: 'sin tarjeta o sin modelo listo' };
  }, id);
  return pair.rect
    ? cardClearance(pair.rect, pair.hull)
    : { ok: false, ...pair };
}

/**
 * Busca en pantalla un punto de satélite visible (no el seguido) lejos de la
 * interfaz: devuelve su NORAD y coordenadas CSS para un clic real.
 */
export const visiblePointTarget = (page, avoid = []) =>
  page.evaluate((skip) => {
    const C = window.__CESIUM__;
    const viewer = window.__godsEyeView.viewer;
    const module =
      window.__godsEyeView.dataManager.layers.get('satellites').module;
    const rows = module.getAllPositions(20000);
    const width = window.innerWidth;
    const height = window.innerHeight;
    let picks = 0;
    for (const row of rows) {
      if (skip.includes(row.id) || picks > 60) continue;
      const screen = C.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        row.position,
      );
      if (!screen) continue;
      const inside =
        screen.x > width * 0.3 &&
        screen.x < width * 0.7 &&
        screen.y > height * 0.2 &&
        screen.y < height * 0.55;
      if (!inside) continue;
      const hit = document.elementFromPoint(screen.x, screen.y);
      if (hit?.tagName !== 'CANVAS') continue;
      picks += 1;
      const picked = viewer.scene.pick(new C.Cartesian2(screen.x, screen.y));
      if (picked?.id !== row.id) continue;
      return { id: row.id, x: screen.x, y: screen.y };
    }
    return null;
  }, avoid);

/**
 * p50 y máximo de commandList durante `ms` (API privada, detectada antes) y
 * heap de JS tras un GC forzado por CDP, para comparar escenas sin el ruido
 * de la basura pendiente.
 */
export async function sampleCommands(page, ms = 3000) {
  const client = await page.createCDPSession();
  try {
    await client.send('HeapProfiler.collectGarbage');
  } finally {
    await client.detach();
  }
  return sampleCommandList(page, ms);
}

const sampleCommandList = (page, ms) =>
  page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const viewer = window.__godsEyeView.viewer;
        if (!Array.isArray(viewer.scene.frameState?.commandList)) {
          resolve({ measured: false, reason: 'commandList no disponible' });
          return;
        }
        const counts = [];
        let owners = {};
        const remove = viewer.scene.postRender.addEventListener(() => {
          const list = viewer.scene.frameState.commandList;
          counts.push(list.length);
          owners = {};
          for (const command of list) {
            const owner = command.owner;
            const key =
              owner?.gevSatelliteNorad !== undefined
                ? 'satelliteModel'
                : (owner?.constructor?.name ?? 'sin-dueño');
            owners[key] = (owners[key] ?? 0) + 1;
          }
        });
        setTimeout(() => {
          remove();
          const sorted = [...counts].sort((a, b) => a - b);
          resolve({
            measured: true,
            frames: counts.length,
            p50: sorted[Math.floor(sorted.length / 2)] ?? null,
            max: sorted.at(-1) ?? null,
            lastFrameOwners: owners,
            heapMiB: performance.memory
              ? performance.memory.usedJSHeapSize / 1048576
              : null,
          });
        }, duration);
      }),
    ms,
  );
