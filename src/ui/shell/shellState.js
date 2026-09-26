/**
 * Estado mutable de UNA vida del shell EYEINSKY.
 *
 * Antes eran `let` sueltos dentro de `mountEyeinsky`; ahora los módulos del
 * shell los comparten por este objeto. Nadie fuera del shell lo recibe.
 * @returns {object} Estado inicial.
 */
export function createShellState() {
  return {
    selection: null,
    filters: { magnitude: 2.5, hours: 24, sector: 'all' },
    activeView: 'explore',
    panelTrigger: null,
    inspectorTrigger: null,
    rows: [],
    generation: 0,
    lastListSignature: '',
    // Estado USGS publicado en la fila de capa (D3).
    sourceSummary: null,
    // La persona pidió la ficha de la vista (Instrumentos → Panel de misión).
    viewRequested: false,
    lastCameraTargetId: null,
    // Razones de suspensión de las superficies P3. Existen desde el arranque
    // porque `openView` puede correr antes de que las superficies se monten.
    suspensionReasons: new Set(),
    eyeSurfacesReady: false,
    restoreController: null,
    dossierState: null,
    dockState: null,
    dockView: null,
    activityState: null,
  };
}
