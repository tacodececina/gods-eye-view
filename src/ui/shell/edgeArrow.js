/**
 * Flecha de borde del objetivo fijado (fase visual T4, DESIGN-SYSTEM §6.12).
 *
 * Si el objetivo fijado sale del cuadro, un triángulo anclado al borde señala
 * hacia él con su distancia en mono; tras la Tierra se dice «tras la Tierra».
 * La flecha es `aria-hidden` (atajo de ratón: el clic ejecuta Centrar); su
 * equivalente textual vive en el panel (`.eye-dock-offscreen`). Reutiliza la
 * geometría de la flecha de la Luna (`resolveMoonReticle`). La Luna conserva
 * su propia retícula; aquí no se pinta.
 */
import * as Cesium from 'cesium';
import { resolveMoonReticle } from '../eyeinskyMoonDockModel.js';

const INSET_PX = 28;
const TICK_MS = 250;
const KM = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

/** «1 235 km» (espacio como separador de miles); sin dato, vacío. */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  return `${KM.format(meters / 1000).replace(/,/g, ' ')} km`;
}

/**
 * @param {{screenPos: {x:number,y:number}|null, viewport: {width:number,
 *   height:number}, inset?: number, dx: number, dy: number,
 *   distanceM: number, occluded?: boolean}} input
 * @returns {null|Readonly<{mode: 'edge'|'behind', x: number, y: number,
 *   angleDeg: number, distance: string, label: string}>}
 */
export function edgeArrow({
  screenPos,
  viewport,
  inset = INSET_PX,
  dx,
  dy,
  distanceM,
  occluded = false,
}) {
  const distance = formatDistance(distanceM);
  if (occluded && screenPos)
    return Object.freeze({
      mode: 'behind',
      x: Math.round(screenPos.x),
      y: Math.round(screenPos.y),
      angleDeg: 0,
      distance,
      label: 'Tras la Tierra',
    });
  const reticle = resolveMoonReticle({
    width: viewport.width,
    height: viewport.height,
    margin: inset,
    point: screenPos,
    dx,
    dy,
  });
  if (reticle.mode !== 'edge') return null;
  return Object.freeze({
    mode: 'edge',
    x: reticle.x,
    y: reticle.y,
    angleDeg: reticle.angleDeg,
    distance,
    label: `Fuera de vista · ${distance}`,
  });
}

/** Posición del objetivo vigente (subpunto con su altura si se conoce). */
function targetWorld(context) {
  const position = context?.position;
  if (!position) return null;
  const alt = (context.fields ?? []).find((f) => /^ALT/.test(f.label));
  const km = Number.parseFloat(String(alt?.value ?? '').replace(/[^\d.]/g, ''));
  const height =
    Number.isFinite(km) && /km/.test(String(alt?.value)) ? km * 1000 : 0;
  return Cesium.Cartesian3.fromDegrees(position.lon, position.lat, height);
}

/** Flecha de un fotograma para el objetivo del panel, o null. */
function arrowFor(viewer, context) {
  const world = targetWorld(context);
  if (!world) return null;
  const { scene, camera } = viewer;
  const to = Cesium.Cartesian3.subtract(
    world,
    camera.positionWC,
    new Cesium.Cartesian3(),
  );
  const ahead = Cesium.Cartesian3.dot(to, camera.directionWC) > 0;
  const point = ahead
    ? Cesium.SceneTransforms.worldToWindowCoordinates(scene, world)
    : null;
  const occluder = new Cesium.EllipsoidalOccluder(
    Cesium.Ellipsoid.WGS84,
    camera.positionWC,
  );
  return edgeArrow({
    screenPos: point ?? null,
    viewport: {
      width: scene.canvas.clientWidth,
      height: scene.canvas.clientHeight,
    },
    dx: Cesium.Cartesian3.dot(to, camera.rightWC),
    dy: -Cesium.Cartesian3.dot(to, camera.upWC),
    distanceM: Cesium.Cartesian3.magnitude(to),
    occluded: !occluder.isPointVisible(world),
  });
}

function arrowNode(doc) {
  const root = doc.createElement('div');
  root.className = 'eye-edge-arrow';
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  const glyph = doc.createElement('span');
  glyph.className = 'eye-edge-arrow-glyph';
  glyph.textContent = '▲';
  const text = doc.createElement('span');
  text.className = 'eye-edge-arrow-text';
  root.append(glyph, text);
  doc.body.append(root);
  return { root, glyph, text };
}

function paint(nodes, arrow) {
  nodes.root.hidden = !arrow;
  if (!arrow) return;
  nodes.root.dataset.mode = arrow.mode;
  nodes.root.style.transform = `translate(${arrow.x}px, ${arrow.y}px)`;
  nodes.glyph.style.transform = `translate(-50%, -50%) rotate(${arrow.angleDeg}deg)`;
  nodes.text.textContent =
    arrow.mode === 'behind' ? arrow.label : arrow.distance;
}

/**
 * Monta la flecha para el objetivo del panel contextual (no la Luna, que
 * tiene la suya) y publica su equivalente textual en el dock.
 * @param {object} shell Contexto del shell.
 * @returns {void}
 */
export function mountTargetEdgeArrow(shell) {
  const { viewer, state, lifetime, defer } = shell;
  const nodes = arrowNode(document);
  let lastAt = -Infinity;
  let signature = '';
  const update = () => {
    const now = performance.now();
    if (now - lastAt < TICK_MS) return;
    lastAt = now;
    const context = state.dossierState?.context;
    const eligible =
      state.dockView?.visible === true &&
      context &&
      context.kind !== 'view' &&
      context.kind !== 'moon';
    const arrow = eligible ? arrowFor(viewer, context) : null;
    const next = arrow
      ? `${arrow.mode}:${arrow.x}:${arrow.y}:${arrow.angleDeg}:${arrow.distance}`
      : 'off';
    if (next === signature) return;
    signature = next;
    paint(nodes, arrow);
    shell.missionDock?.setOffscreen(arrow ? arrow.label : null);
  };
  defer(viewer.scene.postRender.addEventListener(update));
  lifetime.listen(nodes.root, 'click', () => shell.centerOnTarget());
  defer(() => nodes.root.remove());
}
