/**
 * Vista de depuración de la Luna para los arneses (`__godsEyeView.moon`).
 * Encender/apagar pasa por el DataManager, así el estado de la capa y el de
 * la escena no divergen.
 */
export function createMoonDebug(dataManager) {
  const module = () => dataManager.layers?.get?.('moon')?.module ?? null;
  return Object.freeze({
    getState: () => module()?.getState() ?? { status: 'absent' },
    enable: () =>
      dataManager.setEnabled('moon', true, { origin: 'programmatic' }),
    disable: () =>
      dataManager.setEnabled('moon', false, { origin: 'programmatic' }),
    setScaleMode: (id) => module()?.setScaleMode(id),
    debugAt: (iso) => module()?.debugAt(iso) ?? null,
    debugTexture: (mode) => module()?.debugTexture?.(mode),
  });
}

/**
 * Campos P5 de `__godsEyeView`: reloj de escena, marcos, Luna y anillo
 * celeste (para los arneses).
 */
export function p5DebugFields({ sceneTime, dataManager, styleManager }) {
  return {
    sceneClock: sceneTime.sceneClock,
    frames: sceneTime.framesDebug,
    moon: createMoonDebug(dataManager),
    celestialRing: styleManager?.celestialRing ?? null,
  };
}
