import { loadMoonEphemeris } from './ephemeris.js';
import { loadMoonFallback } from './ephemerisFallback.js';
import { createMoonPosition } from './position.js';

/**
 * Fuente lunar perezosa de la app (P5). Pide la tabla DE441 en el primer uso;
 * el respaldo astronomy-engine (import dinámico, fuera del bundle principal)
 * solo se pide si la tabla falla o si se consulta una época fuera de su rango.
 * Mientras no hay nada que responder, la respuesta es una ausencia tipada.
 */

export const MOON_TABLE_PATH = 'data/moon-de441-2021-2040.bin';

const LOADING = Object.freeze({ status: 'unavailable', reason: 'loading' });
const NO_SOURCE = Object.freeze({ status: 'unavailable', reason: 'no-source' });

/** URL de la tabla bajo la base pública de la app. */
export function moonTableUrl(base = import.meta.env?.BASE_URL || '/') {
  return `${base}${MOON_TABLE_PATH}`;
}

const warn = (error) =>
  globalThis.console?.warn?.('[moon] fuente lunar no disponible', error);

/** Estado mutable de una fuente: status de cada carga y composición vigente. */
function createSourceState() {
  return {
    destroyed: false,
    table: null,
    fallback: null,
    status: { table: 'idle', fallback: 'idle' },
    current: createMoonPosition(),
  };
}

function startLoad(state, key, load, hooks) {
  if (state.status[key] !== 'idle' || state.destroyed) return;
  state.status[key] = 'loading';
  let pending;
  try {
    pending = Promise.resolve(load());
  } catch (error) {
    pending = Promise.reject(error);
  }
  pending.then(
    (value) => {
      if (state.destroyed) return;
      state[key] = value;
      state.status[key] = 'ready';
      state.current = createMoonPosition({
        table: state.table,
        fallback: state.fallback,
      });
      hooks.onChange();
    },
    (error) => {
      if (state.destroyed) return;
      state.status[key] = 'failed';
      hooks.onError(error);
      hooks.onChange();
    },
  );
}

function absence(state) {
  const { table, fallback } = state.status;
  return table === 'failed' && fallback === 'failed' ? NO_SOURCE : LOADING;
}

/**
 * @param {object} [options]
 * @param {Function} [options.loadTable] () → Promise<tabla de loadMoonEphemeris>.
 * @param {Function} [options.loadFallback] () → Promise<respaldo>.
 * @param {Function} [options.onChange] Aviso al cargar o fallar una fuente.
 * @param {Function} [options.onError] Error de carga (por defecto, console.warn).
 */
export function createLazyMoonSource({
  loadTable = () => loadMoonEphemeris(moonTableUrl()),
  loadFallback = () => loadMoonFallback(),
  onChange = () => {},
  onError = warn,
} = {}) {
  const state = createSourceState();
  const hooks = { onChange: () => onChange(), onError };
  const moonPosition = (tdbSeconds, result) => {
    startLoad(state, 'table', loadTable, hooks);
    const sample = state.current(tdbSeconds, result);
    const tableCannot =
      sample.status === 'out-of-range' || state.status.table === 'failed';
    if (tableCannot) startLoad(state, 'fallback', loadFallback, hooks);
    if (sample.status === 'unavailable') return absence(state);
    return sample;
  };
  return Object.freeze({
    moonPosition,
    getSources: () => ({ ...state.status }),
    destroy: () => {
      state.destroyed = true;
    },
  });
}
