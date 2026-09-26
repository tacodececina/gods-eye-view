/**
 * Viewport visual → propiedades CSS en <html>. El shell publica el área
 * visible para que el CSS centre y separe superficies con teclado o zoom.
 */
const VISUAL_VIEWPORT_PROPERTIES = [
  '--eye-viewport-height',
  '--eye-viewport-width',
  '--eye-visual-left',
  '--eye-visual-right',
  '--eye-visual-top',
  '--eye-visual-bottom',
  '--eye-visual-center-x',
  '--eye-visual-center-y',
];

/** Por debajo de este ancho VISIBLE (zoom 200 % en un teléfono) el carril se
 * compacta y la barra solo rotula la pestaña activa (fase visual T5). */
const VISUAL_NARROW_PX = 360;

/**
 * @param {number} width Ancho del viewport visual en px CSS.
 * @returns {boolean}
 */
export function isVisualNarrow(width) {
  return Number.isFinite(width) && width < VISUAL_NARROW_PX;
}

function syncVisualViewport() {
  const viewport = window.visualViewport;
  const width = viewport?.width || window.innerWidth;
  const height = viewport?.height || window.innerHeight;
  const left = viewport?.offsetLeft || 0;
  const top = viewport?.offsetTop || 0;
  const right = Math.max(0, window.innerWidth - left - width);
  const bottom = Math.max(0, window.innerHeight - top - height);
  const properties = {
    '--eye-viewport-height': height,
    '--eye-viewport-width': width,
    '--eye-visual-left': left,
    '--eye-visual-right': right,
    '--eye-visual-top': top,
    '--eye-visual-bottom': bottom,
    '--eye-visual-center-x': left + width / 2,
    '--eye-visual-center-y': top + height / 2,
  };
  for (const [name, value] of Object.entries(properties)) {
    document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
  }
  document.body.dataset.eyeVisualNarrow = String(isVisualNarrow(width));
}

/**
 * Sincroniza ahora y en cada resize/scroll del viewport visual.
 * @param {object} deps
 * @param {import('../uiLifetime.js').UiLifetime} deps.lifetime Dueño de listeners.
 * @param {(dispose: () => void) => void} deps.defer Registro de limpieza.
 * @returns {void}
 */
export function mountVisualViewport({ lifetime, defer }) {
  syncVisualViewport();
  lifetime.listen(window, 'resize', syncVisualViewport);
  lifetime.listen(window.visualViewport, 'resize', syncVisualViewport);
  lifetime.listen(window.visualViewport, 'scroll', syncVisualViewport);
  defer(() => {
    for (const property of VISUAL_VIEWPORT_PROPERTIES) {
      document.documentElement.style.removeProperty(property);
    }
    delete document.body.dataset.eyeVisualNarrow;
  });
}
