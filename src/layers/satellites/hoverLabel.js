/**
 * Rótulo por intención (fase visual T4 paso 3): al pasar el ratón sobre un
 * satélite se publica como mucho un rótulo, con la elección limitada a 80 ms.
 * En táctil o con lápiz no hay hover (el rótulo llega al fijar el objetivo).
 * Núcleo sin Cesium ni DOM: el anfitrión inyecta `pick`, `entryFor`,
 * `publish` y `clear`.
 */
export const HOVER_THROTTLE_MS = 80;

/**
 * @param {{pick: (x:number, y:number) => (number|null),
 *   entryFor: (id:number) => (object|null),
 *   publish: (entries: object[]) => void, clear: () => void,
 *   now?: () => number, throttleMs?: number}} options
 * @returns {{onPointerMove: (event: {pointerType?: string, x: number, y: number}) => void,
 *   reset: () => void, destroy: () => void}}
 */
export function createHoverLabel({
  pick,
  entryFor,
  publish,
  clear,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  throttleMs = HOVER_THROTTLE_MS,
}) {
  let lastAt = -Infinity;
  let current = null;

  const reset = () => {
    if (current === null) return;
    current = null;
    clear();
  };

  const onPointerMove = ({ pointerType = 'mouse', x, y }) => {
    if (pointerType !== 'mouse') return;
    const at = now();
    if (at - lastAt < throttleMs) return;
    lastAt = at;
    const id = pick(x, y);
    if (id === null || id === undefined) {
      reset();
      return;
    }
    if (id === current) return;
    const entry = entryFor(id);
    if (!entry) {
      reset();
      return;
    }
    current = id;
    publish([entry]);
  };

  return { onPointerMove, reset, destroy: reset };
}
