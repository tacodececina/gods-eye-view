/**
 * Chequeos de navegador del Mission Dock P5 (T8): tira TIEMPO, suspensión de
 * capas en vivo, acciones de la Luna, retorno a Tierra, motivos de
 * deshabilitado, móvil 390×844, reduced-motion y zoom 200 % (CDP).
 *
 * Las sondas corren en la página (`page.evaluate`) y solo leen la app por
 * `window.__godsEyeView`, `window.__eyeinsky` y el DOM. No afirma FPS.
 */
import { sleep } from './eyeinsky-p4-run.mjs';

export const MIN_TARGET_PX = 44;
export const MIN_TEXT_PX = 13;
const SETTLE_MS = 700;
const FLIGHT_WAIT_MS = 2_200;

/** Lo que pinta la tira TIEMPO y sus controles. */
export function stripProbe() {
  const root = document.querySelector('[data-eye-time-strip]');
  if (!root) return { present: false };
  const announce = root.querySelector('[data-eye-time-announce]');
  return {
    present: true,
    text: root.querySelector('[data-eye-time-text]')?.textContent ?? '',
    tone: root.dataset.tone,
    mode: root.dataset.mode,
    announce: announce?.textContent ?? null,
    ariaLive: announce?.getAttribute('aria-live') ?? null,
    notes: [...root.querySelectorAll('[data-eye-time-notes] li')].map(
      (li) => li.textContent,
    ),
    error: root.querySelector('.eye-time-error')?.textContent ?? '',
  };
}

/** Capas encendidas, suspendidas y filas rotuladas de la lista Activas. */
export function layersProbe() {
  const g = window.__godsEyeView;
  return {
    enabled: g.dataManager
      .getAll()
      .filter((entry) => entry.enabled)
      .map((entry) => entry.id)
      .sort(),
    suspended: window.__eyeinsky.earthMoon.suspended(),
    suspendedRows: [
      ...document.querySelectorAll('[data-eye-active-suspended]'),
    ].map((li) => [li.dataset.eyeActiveId, li.textContent]),
  };
}

/** Estado que VOLVER A TIERRA debe restaurar (P5-12). */
export function earthStateProbe() {
  const g = window.__godsEyeView;
  const camera = g.viewer.camera;
  const v = (c) => ({ x: c.x, y: c.y, z: c.z });
  const dock = document.getElementById('eye-mission-dock');
  return {
    camera: {
      position: v(camera.positionWC),
      direction: v(camera.directionWC),
      up: v(camera.upWC),
      fov: camera.frustum.fov,
    },
    layers: g.dataManager
      .getAll()
      .filter((entry) => entry.enabled)
      .map((entry) => entry.id)
      .sort(),
    contextKey: dock.dataset.contextKey,
    following: Boolean(g.viewer.trackedEntity),
    ring: g.styleManager.celestialRingEnabled === true,
    pane:
      dock.querySelector('[role="tab"][aria-selected="true"]')?.dataset
        .eyeDockPane ?? null,
    expanded: dock.dataset.expanded,
    clockMode: g.sceneClock.getState().mode,
  };
}

/** Cámara frente a la Luna: ángulo (°) entre dirección y Luna, y proyecciones. */
export function aimProbe() {
  const C = window.__CESIUM__;
  const g = window.__godsEyeView;
  const st = g.moon.getState();
  if (st.status !== 'ok') return { ok: false, status: st.status };
  const moon = new C.Cartesian3(
    st.positionFixedM.x,
    st.positionFixedM.y,
    st.positionFixedM.z,
  );
  const camera = g.viewer.camera;
  const to = C.Cartesian3.normalize(
    C.Cartesian3.subtract(moon, camera.positionWC, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const cos = C.Cartesian3.dot(to, camera.directionWC);
  const project = (p) => {
    const w = C.SceneTransforms.worldToWindowCoordinates(g.viewer.scene, p);
    const ahead =
      C.Cartesian3.dot(
        C.Cartesian3.subtract(p, camera.positionWC, new C.Cartesian3()),
        camera.directionWC,
      ) > 0;
    return w && ahead ? { x: w.x, y: w.y } : null;
  };
  return {
    ok: true,
    angleDeg: C.Math.toDegrees(Math.acos(Math.min(1, cos))),
    position: { ...camera.positionWC },
    moonPx: project(moon),
    earthPx: project(C.Cartesian3.ZERO),
    canvas: {
      width: g.viewer.scene.canvas.clientWidth,
      height: g.viewer.scene.canvas.clientHeight,
    },
    scaleMode: st.scaleMode,
    band: document.querySelector('[data-eye-moon-scale-band]')?.hidden,
    reticle: document.querySelector('[data-eye-moon-reticle]')?.dataset.mode,
    lastFraming: window.__eyeinsky.earthMoon.lastFraming(),
    kicker: document.querySelector('.eye-dock-kicker')?.textContent,
    panel:
      document.getElementById('eye-dock-panel-objetivo')?.textContent ?? '',
  };
}

/** Botones «Apagar» de la lista Activas (P5-17: en 390 px salían del panel). */
export const ACTIVE_DISABLE_TARGETS =
  '#eye-active-layers [data-eye-active-disable]';

/**
 * Objetivos de `selector`: tamaño, texto y si el centro es suyo (un botón
 * recortado por el overflow de su panel devuelve otro elemento, p. ej. CANVAS).
 * El dock (y su cuerpo) se desplaza: lo que vive en él se trae a la vista.
 */
export function headerTargetsProbe(
  selector = '.eye-dock-header button, .eye-dock-header input, .eye-dock-rail button',
) {
  const viewport = window.visualViewport;
  const visible = (el) =>
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden';
  const targets = [...document.querySelectorAll(selector)]
    .filter(visible)
    .map((el) => {
      if (el.closest('#eye-mission-dock'))
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const box = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      const aria = el.getAttribute('aria-label') ?? '';
      return {
        label: aria.startsWith('Apagar')
          ? aria
          : el.innerText?.trim() || el.dataset.eyeTimeField || el.type,
        hitTag: hit?.tagName ?? null,
        width: box.width,
        height: box.height,
        font: Number.parseFloat(getComputedStyle(el).fontSize),
        inside:
          box.left >= -1 &&
          box.top >= -1 &&
          box.right <= viewport.width + 1 &&
          box.bottom <= viewport.height + 1,
        hit: Boolean(hit && (hit === el || el.contains(hit))),
      };
    });
  return {
    targets,
    scale: viewport.scale,
    horizontalScroll:
      document.documentElement.scrollWidth > window.innerWidth + 1,
  };
}

/** Tamaño mínimo del texto visible de la cabecera del dock. */
export function headerTextProbe() {
  const visible = (el) =>
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== 'hidden';
  const texts = [
    ...document.querySelectorAll(
      '.eye-dock-header p, .eye-dock-header li, .eye-dock-header b, .eye-dock-header button, .eye-dock-header span:not(.eye-visually-hidden)',
    ),
  ]
    .filter(visible)
    .filter((el) => el.textContent.trim())
    .map((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  return { minText: Math.min(...texts) };
}

/** Objetivos de `selector` más el texto mínimo de la cabecera (targetsOk). */
export async function readHeaderTargets(page, selector) {
  const targets = await page.evaluate(headerTargetsProbe, selector);
  return { ...targets, ...(await page.evaluate(headerTextProbe)) };
}

const click = (page, selector) =>
  page.evaluate((sel) => document.querySelector(sel)?.click(), selector);
export const timeCmd = (page, cmd) =>
  click(page, `[data-eye-time-cmd="${cmd}"]`);
export const moonAction = (page, id) =>
  click(page, `[data-eye-moon-action="${id}"]`);

/**
 * Activa con TECLADO (foco + Enter) y dice dónde quedó el foco: dentro del
 * dock y visible, o no (WCAG 2.4.3).
 */
export async function keyboardActivate(page, selector, waitMs = 400) {
  await page.focus(selector);
  await page.keyboard.press('Enter');
  await sleep(waitMs);
  return page.evaluate(() => {
    const active = document.activeElement;
    const dock = document.getElementById('eye-mission-dock');
    return {
      tag: active?.tagName ?? null,
      label: active?.getAttribute?.('aria-label') ?? null,
      // Dentro del dock y visible (no un botón oculto al replegarse).
      inside: Boolean(
        active && dock?.contains(active) && active.getClientRects().length,
      ),
    };
  });
}

const vecDist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Diferencias entre dos lecturas de earthStateProbe (vacío = igual). */
export function diffEarthState(before, after) {
  const diffs = [];
  const cam = (k, tol) => {
    const d = vecDist(before.camera[k], after.camera[k]);
    if (d > tol) diffs.push(`camera.${k} Δ${d.toExponential(2)}`);
  };
  cam('position', 1);
  cam('direction', 1e-6);
  cam('up', 1e-6);
  if (Math.abs(before.camera.fov - after.camera.fov) > 1e-9)
    diffs.push('camera.fov');
  for (const key of ['contextKey', 'following', 'ring', 'pane', 'expanded'])
    if (before[key] !== after[key])
      diffs.push(`${key}: ${before[key]} → ${after[key]}`);
  if (JSON.stringify(before.layers) !== JSON.stringify(after.layers))
    diffs.push(`layers: ${before.layers} → ${after.layers}`);
  return diffs;
}

export async function settle(page, ms = SETTLE_MS) {
  await page.evaluate(() => window.__eyeinsky.earthMoon.settled());
  await sleep(ms);
}

export const FLIGHT_MS = FLIGHT_WAIT_MS;
