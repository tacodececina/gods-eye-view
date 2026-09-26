/**
 * Medida del pie (reparación T5): publica el ancho REAL de la telemetría en
 * `body` como `--eye-telemetry-width`, para que la tira TIEMPO lo reserve y no
 * pase por debajo en Simulación ×3600 (antes se suponían 420 px y la
 * telemetría medía 607). Solo lee geometría; no decide nada más.
 */

export const TELEMETRY_WIDTH_VAR = '--eye-telemetry-width';

/**
 * @param {{doc?: Document, ResizeObserverImpl?: typeof ResizeObserver}} [options]
 * @returns {{destroy: () => void}}
 */
export function mountFootMetrics({
  doc = globalThis.document,
  ResizeObserverImpl = globalThis.ResizeObserver,
} = {}) {
  const telemetry = doc?.querySelector?.('.eye-telemetry');
  if (!telemetry) return { destroy() {} };
  const style = doc.body.style;
  const publish = () => {
    const width = Math.ceil(telemetry.getBoundingClientRect().width);
    style.setProperty(TELEMETRY_WIDTH_VAR, `${width}px`);
  };
  publish();
  const observer =
    typeof ResizeObserverImpl === 'function'
      ? new ResizeObserverImpl(publish)
      : null;
  observer?.observe(telemetry);
  return {
    destroy() {
      observer?.disconnect();
      style.removeProperty(TELEMETRY_WIDTH_VAR);
    },
  };
}
