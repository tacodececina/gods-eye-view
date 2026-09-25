/**
 * Instantánea del reloj de escena (P5 T9, propuesta §3): el Director la toma
 * al empezar una corrida y la devuelve en stop/abort, así una escena nunca
 * deja el reloj único en otro modo, ritmo o época. Sin `worldEpoch` en los
 * packs: solo se restaura lo que había.
 */

/** Estado mínimo para volver: modo, ritmo, época y motivo de pausa. */
export function captureSceneClockState(sceneClock) {
  const state = sceneClock?.getState?.();
  if (!state) return null;
  return Object.freeze({
    mode: state.mode,
    multiplier: state.multiplier,
    iso: state.currentIso,
    reason: state.reason ?? null,
  });
}

/** Devuelve el reloj a `snapshot` (idempotente; nada si falta algo). */
export function restoreSceneClockState(sceneClock, snapshot) {
  if (!sceneClock || !snapshot) return;
  if (snapshot.mode === 'live') {
    sceneClock.setNow();
    return;
  }
  sceneClock.setTime(snapshot.iso);
  if (snapshot.mode === 'simulated') sceneClock.simulate(snapshot.multiplier);
  else sceneClock.pause(snapshot.reason ?? undefined);
}
