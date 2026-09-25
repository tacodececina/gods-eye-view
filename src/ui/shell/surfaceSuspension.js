/**
 * Suspensión de las superficies P3 (expediente y actividad) por razones
 * independientes: panel móvil, Vista limpia... Suspender no es cerrar.
 */

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {(reason: string, active: boolean) => void} Aplicador de razones.
 */
export function createSurfaceSuspension(shell) {
  const { state } = shell;
  /**
   * Aplica una razón de suspensión. Las razones son independientes y pueden
   * solaparse: salir de Vista limpia mientras el panel móvil sigue abierto NO
   * restaura. Suspender no es cerrar: el cierre explícito, la selección y el
   * foco se conservan intactos al volver.
   * @param {string} reason Identidad de la razón.
   * @param {boolean} active Si esa razón está vigente.
   * @returns {void}
   */
  return function setEyeSurfaceSuspension(reason, active) {
    if (active) state.suspensionReasons.add(reason);
    else state.suspensionReasons.delete(reason);
    if (!state.eyeSurfacesReady) return;
    const suspended = state.suspensionReasons.size > 0;
    if (
      suspended === state.dossierState.suspended &&
      suspended === shell.activity.isSuspended()
    )
      return;
    shell.publishDossier({ type: 'suspend', value: suspended });
    shell.activity.suspend(suspended);
  };
}

/**
 * Observa la otra ruta de Vista limpia y marca las superficies como listas.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountSurfaceSuspension(shell) {
  const { state, defer } = shell;
  // La otra ruta de Vista limpia es la del producto base (`ui-clean-view`), que
  // sólo cambia una clase del body: se observa en vez de duplicar su control.
  const cleanObserver = new MutationObserver(() => {
    shell.setEyeSurfaceSuspension(
      'clean-view',
      document.body.classList.contains('ui-clean-view') ||
        document.body.classList.contains('eye-clean'),
    );
  });
  cleanObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
  });
  defer(() => cleanObserver.disconnect());
  state.eyeSurfacesReady = true;
  // Aplica lo que se haya acumulado mientras las superficies se montaban.
  shell.setEyeSurfaceSuspension('init', false);
  shell.applyDossier();
}
