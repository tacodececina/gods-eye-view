/**
 * Suspensión de capas en vivo fuera de la hora real (P5 T8, P5-11).
 *
 * El reloj de escena puede simular otra época, pero los feeds en vivo solo
 * saben de «ahora»: presentarlos junto a una Luna de 2031 los haría pasar por
 * históricos. Fuera de «vivo» se apagan (origen `programmatic`: no tocan las
 * preferencias duraderas ni el enlace) y se recuerdan; al volver a vivo
 * (AHORA) se encienden EXACTAMENTE esas. Satélites, Luna y referencias
 * estáticas no se suspenden: SGP4 sigue en hora real y el dock lo dice.
 */

/** Capas cuyos datos solo existen en «ahora». */
export const LIVE_LAYER_IDS = Object.freeze([
  'ais-live-vessels',
  'bikeshare',
  'cctv',
  'earthquakes',
  'flights',
  'local-firms',
  'military',
  'military-awareness',
  'rocket-launches',
  'traffic',
  'transit',
]);

export const SUSPENDED_LABEL = 'Sin histórico: solo hora real';
const ORIGIN = Object.freeze({ origin: 'programmatic' });
const LIVE = new Set(LIVE_LAYER_IDS);

/** Capas en vivo de `enabledIds`, ordenadas. */
export function planSuspension(enabledIds = []) {
  return Object.freeze(
    [...new Set(enabledIds)].filter((id) => LIVE.has(id)).sort(),
  );
}

const enabledIdsOf = (dataManager) =>
  dataManager
    .getAll()
    .filter((entry) => entry.enabled)
    .map((entry) => String(entry.id));

/** Apagar las en vivo encendidas y volver a encender EXACTAMENTE esas. */
function suspensionWork(state, dataManager, onChange) {
  const suspendEnabled = async () => {
    const ids = planSuspension(enabledIdsOf(dataManager));
    for (const id of ids) {
      state.suspended.add(id);
      await dataManager.setEnabled(id, false, ORIGIN);
    }
    if (ids.length) onChange();
  };
  const restore = async () => {
    const ids = [...state.suspended].sort();
    state.suspended.clear();
    for (const id of ids)
      if (!dataManager.isEnabled(id))
        await dataManager.setEnabled(id, true, ORIGIN);
    if (ids.length) onChange();
  };
  return { suspendEnabled, restore };
}

/**
 * @param {{dataManager: object, onChange?: () => void,
 *   onError?: (error: unknown) => void}} options
 */
export function createLiveSuspension({
  dataManager,
  onChange = () => {},
  onError = (error) =>
    globalThis.console?.warn?.('[eyeinsky] suspensión de capas', error),
}) {
  const state = { offLive: false, destroyed: false, suspended: new Set() };
  let pending = Promise.resolve();
  const queue = (work) => {
    pending = pending.then(work).catch(onError);
    return pending;
  };
  const { suspendEnabled, restore } = suspensionWork(
    state,
    dataManager,
    onChange,
  );
  // Una capa en vivo encendida mientras se simula se suspende también.
  const unsubscribe = dataManager.subscribe?.(() => {
    if (state.offLive && !state.destroyed) queue(suspendEnabled);
  });
  return Object.freeze({
    /** Aplica el estado del reloj: fuera de vivo suspende; en vivo restaura. */
    sync(offLive) {
      const next = offLive === true;
      if (state.destroyed || next === state.offLive) return pending;
      state.offLive = next;
      return queue(next ? suspendEnabled : restore);
    },
    /** La persona apagó a mano una suspendida: ya no se restaura. */
    forget(id) {
      if (state.suspended.delete(id)) onChange();
    },
    getSuspended: () => Object.freeze([...state.suspended].sort()),
    isOffLive: () => state.offLive,
    settled: () => pending,
    destroy() {
      state.destroyed = true;
      unsubscribe?.();
    },
  });
}
