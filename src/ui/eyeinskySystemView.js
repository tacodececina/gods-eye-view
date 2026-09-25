/**
 * SISTEMA TIERRA–LUNA (P5 §6): a distancia lunar la Tierra mide pocos
 * píxeles y sus etiquetas (callouts de detección, sobre todo el cinturón
 * GEO, y magnitudes de sismos) la tapan. Aquí viven:
 *   - el rótulo «TIERRA» (mismo estilo que la retícula de la Luna) cuando la
 *     Tierra mide < 40 px en pantalla;
 *   - el despeje de esas etiquetas mientras la pose SISTEMA está activa, que
 *     se deshace EXACTAMENTE al salir (sin reanudar lo que otro suspendió).
 */

/** Por debajo de este diámetro (px CSS) la Tierra lleva rótulo. */
export const EARTH_LABEL_MAX_PX = 40;
const OWNER = 'earth-moon-system';
/** Fuentes de la capa de rótulos que se apartan (sismos: «M5.3»). */
const DECLUTTERED_SOURCES = Object.freeze(['earthquakes']);
const HIDDEN = Object.freeze({ visible: false, x: 0, y: 0, text: 'TIERRA' });

/**
 * @param {{width:number, height:number, point:{x:number,y:number}|null,
 *   diameterPx:number}} input Proyección del centro de la Tierra (null si
 *   queda detrás de la cámara) y su diámetro aparente en px CSS.
 */
export function resolveEarthLabel({ width, height, point, diameterPx }) {
  if (!point || !(diameterPx < EARTH_LABEL_MAX_PX)) return HIDDEN;
  const inside =
    point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
  if (!inside) return HIDDEN;
  return Object.freeze({
    visible: true,
    x: Math.round(point.x),
    y: Math.round(point.y),
    text: 'TIERRA',
  });
}

/**
 * @param {{detection: {suspend: Function, resume: Function,
 *   isSuspended: () => boolean}, overlays: {setSuppressed: (sourceId: string,
 *   owner: string, on: boolean) => void}}} deps
 */
export function createSystemDeclutter({ detection, overlays }) {
  let active = false;
  let ownsDetection = false;
  const set = (on) => {
    const next = on === true;
    if (next === active) return;
    active = next;
    if (next) {
      ownsDetection = !detection.isSuspended();
      if (ownsDetection) detection.suspend(OWNER);
    } else {
      if (ownsDetection && detection.isSuspended()) detection.resume();
      ownsDetection = false;
    }
    for (const sourceId of DECLUTTERED_SOURCES)
      overlays.setSuppressed(sourceId, OWNER, next);
  };
  return Object.freeze({
    set,
    isActive: () => active,
    destroy: () => set(false),
  });
}

/**
 * Rótulo DOM «TIERRA»: comparte aspecto con la retícula de la Luna; es
 * decorativo para lectores (el panel y el aviso de encuadre lo dicen).
 * @param {Document} [doc]
 */
export function mountEyeEarthLabel(doc = globalThis.document) {
  if (!doc?.createElement) return { update() {}, destroy() {} };
  const root = doc.createElement('div');
  root.className = 'eye-moon-reticle eye-earth-label';
  root.dataset.eyeEarthLabel = '';
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  const ring = doc.createElement('span');
  ring.className = 'eye-moon-reticle-ring';
  const legend = doc.createElement('span');
  legend.className = 'eye-moon-reticle-legend';
  legend.textContent = 'TIERRA';
  root.append(ring, legend);
  doc.body.append(root);
  let last = '';
  return {
    update(label) {
      const key = label?.visible ? `${label.x}:${label.y}` : 'off';
      if (key === last) return;
      last = key;
      root.hidden = !label?.visible;
      if (!root.hidden)
        root.style.transform = `translate(${label.x}px, ${label.y}px)`;
    },
    destroy() {
      root.remove();
    },
  };
}
