/**
 * Vista pública: leer la vista actual y restaurar una guardada o compartida.
 * `publicView` sigue siendo la única frontera de lo que se puede restaurar.
 */
import { publicView } from '../operations.js';

const MOBILE_WIDTH = 650;

function restoreMessage(shell, view, restricted) {
  const { state } = shell;
  const missing =
    state.selection && !state.rows.some((r) => r.id === state.selection);
  return [
    restricted.length
      ? `Fuentes sin configurar: ${restricted.join(', ')}.`
      : '',
    missing ? 'El contacto guardado no está en el conjunto actual.' : '',
    view.layers.includes('earthquakes')
      ? shell.layer()?.stats.error
        ? 'USGS no respondió; consulta pendiente.'
        : 'Datos consultados de nuevo.'
      : 'Vista restaurada. USGS permanece sin consultar.',
  ]
    .filter(Boolean)
    .join(' ');
}

function reinspectRestored(shell) {
  const { state } = shell;
  shell.inspect(state.selection, { fly: false });
  if (state.activeView === 'operations' && innerWidth <= MOBILE_WIDTH)
    shell.closeInspector(false);
  shell.setSurface('eye-workspace', state.activeView !== 'explore');
}

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} readView y restoreView.
 */
export function createViewState(shell) {
  const { state, styleManager, dataManager, signal } = shell;
  const readView = () => ({
    camera: styleManager.getCameraState(),
    layers: dataManager
      .getAll()
      .filter((l) => l.enabled)
      .map((l) => l.id),
    filters: { ...state.filters },
    selection: state.selection,
  });
  async function restoreView(input) {
    const view = publicView(input),
      own = ++state.generation;
    state.restoreController?.abort();
    state.restoreController = new AbortController();
    const requestSignal = AbortSignal.any([
      signal,
      state.restoreController.signal,
    ]);
    state.filters = { ...view.filters };
    state.selection = view.selection;
    shell.syncFilters();
    const restricted = view.layers.filter((id) => !dataManager.layers.has(id));
    for (const entry of dataManager.getAll()) {
      if (own !== state.generation || requestSignal.aborted)
        return { superseded: true };
      const enabled = view.layers.includes(entry.id);
      await dataManager.setEnabled(entry.id, enabled, { origin: 'user' });
    }
    // DESPUÉS de las capas: encender o apagar una pasa por el director
    // (stopScene), que cancela cualquier vuelo en curso. Pedida antes, la
    // cámara restaurada se cancelaba a los pocos milisegundos.
    shell.camera(view.camera);
    if (view.layers.includes('earthquakes'))
      await dataManager.refreshLayer('earthquakes', { signal: requestSignal });
    if (own !== state.generation || requestSignal.aborted)
      return { superseded: true };
    shell.paintFeed();
    if (state.selection) reinspectRestored(shell);
    return { message: restoreMessage(shell, view, restricted) };
  }
  return { readView, restoreView };
}
