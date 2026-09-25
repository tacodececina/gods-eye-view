/**
 * Reloj de escena y escala de la Luna en el enlace compartido (P5 T9).
 *
 * Tokens NUEVOS, que ningún otro parámetro del hash usaba:
 *   - `t`  = `live` | época UTC ISO (segundos, con `Z`),
 *   - `tr` = ritmo: 0 (pausa) o 1/60/600/3600 (simulación),
 *   - `lm` = escala de la Luna: `f` (física) | `d` (didáctica).
 * La capa Luna ya viaja en `l` (token de capa «l»): no se duplica.
 *
 * Reglas: una fecha o ritmo inválidos se rechazan (el reloj no se toca y se
 * informa); una época fuera del rango de la tabla DE441 abre en PAUSA con el
 * motivo «fuera de efemérides» (la ausencia se ve); sin `lm`, escala física.
 */

export const SCENE_SHARE_KEYS = Object.freeze(['t', 'tr', 'lm']);
const SHARE_RATES = Object.freeze([0, 1, 60, 600, 3600]);
const ISO_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;
/** Rango de la tabla DE441 (TDB 2021-01-01 → 2041-01-01), con margen. */
const TABLE_FROM_MS = Date.UTC(2021, 0, 1, 0, 2);
const TABLE_TO_MS = Date.UTC(2040, 11, 31, 23, 58);
export const OUT_OF_RANGE_REASON = 'fuera de efemérides';

const isoSeconds = (iso) => `${String(iso).slice(0, 19)}Z`;

/**
 * Escribe (o borra) `t`, `tr` y `lm` en `params`.
 * @param {URLSearchParams} params
 * @param {{clock: object, moonScale: string}|null} scene
 */
export function encodeSceneParams(params, scene) {
  for (const key of SCENE_SHARE_KEYS) params.delete(key);
  if (!scene?.clock) return;
  const { clock } = scene;
  if (clock.mode === 'live') params.set('t', 'live');
  else {
    params.set('t', isoSeconds(clock.currentIso));
    params.set(
      'tr',
      clock.mode === 'simulated' ? String(clock.multiplier) : '0',
    );
  }
  params.set('lm', scene.moonScale === 'didactic' ? 'd' : 'f');
}

/** Época ISO válida (formato estricto, fecha real, 1900–2100) o null. */
function validIso(raw) {
  if (typeof raw !== 'string' || !ISO_SECONDS.test(raw)) return null;
  const ms = Date.parse(raw);
  if (
    !Number.isFinite(ms) ||
    new Date(ms).toISOString().slice(0, 19) !== raw.slice(0, 19)
  )
    return null;
  const year = new Date(ms).getUTCFullYear();
  return year >= MIN_YEAR && year <= MAX_YEAR ? raw : null;
}

function decodeTime(params) {
  if (!params.has('t')) return { time: null, timeInvalid: false };
  const raw = params.get('t');
  if (raw === 'live') return { time: { mode: 'live' }, timeInvalid: false };
  const iso = validIso(raw);
  const rate = Number(params.get('tr') ?? '0');
  if (!iso || !SHARE_RATES.includes(rate))
    return { time: null, timeInvalid: true };
  return {
    time:
      rate === 0
        ? { mode: 'paused', iso }
        : { mode: 'simulated', iso, multiplier: rate },
    timeInvalid: false,
  };
}

/**
 * @param {URLSearchParams} params
 * @returns {{time: object|null, timeInvalid: boolean, moonScale: string}}
 */
export function decodeSceneParams(params) {
  return {
    ...decodeTime(params),
    moonScale: params.get('lm') === 'd' ? 'didactic' : 'physical',
  };
}

const inTable = (iso) => {
  const ms = Date.parse(iso);
  return ms >= TABLE_FROM_MS && ms <= TABLE_TO_MS;
};

/**
 * Aplica lo decodificado al reloj único y a la escala de la Luna.
 * @returns {{time: 'none'|'applied'|'out-of-range'|'invalid'}}
 */
export function applySharedScene(decoded, { sceneClock, setMoonScale }) {
  if (!decoded) return { time: 'none' };
  setMoonScale?.(decoded.moonScale);
  if (decoded.timeInvalid) return { time: 'invalid' };
  const time = decoded.time;
  if (!time || !sceneClock) return { time: 'none' };
  if (time.mode === 'live') {
    sceneClock.setNow();
    return { time: 'applied' };
  }
  sceneClock.setTime(time.iso);
  if (!inTable(time.iso)) {
    sceneClock.pause(OUT_OF_RANGE_REASON);
    return { time: 'out-of-range' };
  }
  if (time.mode === 'simulated') sceneClock.simulate(time.multiplier);
  else sceneClock.pause();
  return { time: 'applied' };
}

/**
 * Enlaza el reloj único y la capa Luna con el ShareLinkManager: proveedor
 * para generar el enlace, aplicador para restaurarlo y aviso en cada cambio
 * de modo del reloj (el hash se reescribe con el mismo debounce).
 * @param {object} manager ShareLinkManager.
 * @param {{sceneClock: object|null, moonModule: () => object|null}} deps
 * @returns {() => void} Desenlaza.
 */
export function bindSceneShare(manager, { sceneClock, moonModule }) {
  if (!manager || !sceneClock) return () => {};
  manager.setSceneStateProvider(() => ({
    clock: sceneClock.getState(),
    moonScale: moonModule()?.getState?.().scaleMode ?? 'physical',
  }));
  manager.setSceneApplier((decoded) =>
    applySharedScene(decoded, {
      sceneClock,
      setMoonScale: (id) => moonModule()?.setScaleMode?.(id),
    }),
  );
  const unsubscribe = sceneClock.subscribe(() => manager.onSceneStateChange());
  return () => {
    unsubscribe();
    manager.setSceneStateProvider(null);
    manager.setSceneApplier(null);
  };
}
