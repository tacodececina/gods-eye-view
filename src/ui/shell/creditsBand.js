/**
 * Publica en <html> `--eye-credits-band`: el alto REAL de los créditos de
 * Cesium (fase visual T5). En el teléfono el pie (reloj y telemetría) y la
 * hoja se apoyan encima; los créditos envuelven en 1–4 líneas según el ancho
 * y el zoom, y nunca se ocultan ni se tapan (DESIGN-SYSTEM §6.10).
 */
const PROPERTY = '--eye-credits-band';

/**
 * @param {{height: number, visible: boolean}} input
 * @returns {number} Alto en px (0 si no se ven).
 */
export function creditsBandPx({ height, visible }) {
  if (!visible || !Number.isFinite(height)) return 0;
  return Math.ceil(height);
}

/**
 * @param {{lifetime: object, defer: (dispose: () => void) => void,
 *   doc?: Document}} deps
 * @returns {void}
 */
export function mountCreditsBand({ lifetime, defer, doc = document }) {
  const root = doc.documentElement;
  const publish = () => {
    const credits = doc.querySelector('#cesium-credits .cesium-widget-credits');
    const rect = credits?.getBoundingClientRect();
    const band = creditsBandPx({
      height: rect?.height,
      visible: Boolean(credits?.getClientRects().length),
    });
    root.style.setProperty(PROPERTY, `${band}px`);
  };
  const credits = doc.querySelector('#cesium-credits');
  const observer =
    typeof ResizeObserver === 'function' && credits
      ? new ResizeObserver(publish)
      : null;
  if (credits) observer?.observe(credits, { box: 'border-box' });
  const inner = doc.querySelector('#cesium-credits .cesium-widget-credits');
  if (inner) observer?.observe(inner);
  lifetime.listen(window, 'resize', publish);
  lifetime.listen(window.visualViewport, 'resize', publish);
  publish();
  defer(() => {
    observer?.disconnect();
    root.style.removeProperty(PROPERTY);
  });
}
