import { setTextIfChanged } from './domText.js';

/** Cadencia máxima del pie mientras la cámara se mueve (4 Hz). */
export const CAMERA_TELEMETRY_INTERVAL_MS = 250;

const degrees = (value) => (value * 180) / Math.PI;

/** Un solo formateador: `toLocaleString` con opciones crea uno por llamada. */
const KM_FORMAT = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

/**
 * Lectura de la cámara real para el pie (`.eye-telemetry`). Se refresca en
 * `camera.moveEnd` y, limitada a 4 Hz, en `scene.postRender`: así sigue a la
 * cámara también cuando un EntityView la gobierna (objetivo fijado), caso en
 * que `moveEnd` no se dispara y el pie mostraba la pose de inicio. Con el
 * gobernador de render, una cámara quieta no pinta frames y esto no cuesta.
 * @param {{viewer: object, doc?: Document, now?: () => number,
 *   intervalMs?: number}} options
 * @returns {{update: () => void, destroy: () => void}}
 */
export function mountCameraTelemetry({
  viewer,
  doc = globalThis.document,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  intervalMs = CAMERA_TELEMETRY_INTERVAL_MS,
}) {
  const style = doc.body.style;
  const lastProps = new Map();
  const setProp = (name, value) => {
    if (lastProps.get(name) === value) return;
    lastProps.set(name, value);
    style.setProperty(name, value);
  };
  const set = (id, value) => setTextIfChanged(doc.getElementById(id), value);
  let lastAt = -Infinity;

  const update = () => {
    if (doc.hidden) return;
    const camera = viewer.camera;
    const position = camera.positionCartographic;
    if (!position) return;
    lastAt = now();
    set(
      'eye-camera-position',
      `${degrees(position.latitude).toFixed(2)}° / ${degrees(position.longitude).toFixed(2)}°`,
    );
    set(
      'eye-camera-altitude',
      `${KM_FORMAT.format(position.height / 1000)} km`,
    );
    set(
      'eye-camera-heading',
      `${degrees(camera.heading).toFixed(1)}° / ${degrees(camera.pitch).toFixed(1)}°`,
    );
    setProp('--eye-heading-turn', `${-degrees(camera.heading).toFixed(2)}deg`);
    const level = Math.max(
      0,
      Math.min(1, Math.log10(Math.max(1_000, position.height) / 1_000) / 5),
    );
    setProp('--eye-altitude-level', `${(level * 100).toFixed(1)}%`);
  };
  const onFrame = () => {
    if (now() - lastAt >= intervalMs) update();
  };

  const removeMoveEnd = viewer.camera.moveEnd?.addEventListener(update);
  const removeFrame = viewer.scene?.postRender?.addEventListener(onFrame);
  update();
  return {
    update,
    destroy() {
      removeMoveEnd?.();
      removeFrame?.();
      style.removeProperty('--eye-heading-turn');
      style.removeProperty('--eye-altitude-level');
    },
  };
}
