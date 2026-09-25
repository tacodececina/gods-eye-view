/**
 * Capas desde el shell: encender/apagar con aviso y deshacer, contador de
 * capas activas, catálogo (#eye-catalog) y capas activas (#eye-active-layers).
 */
import { contextLayerUnavailableLabel } from '../../contextModePolicy.js';
import { mountEyeCatalog } from '../eyeinskyCatalog.js';
import { mountEyeActiveLayers } from '../eyeinskyActiveLayers.js';
import { $ } from './shellDom.js';

const LAYER_FIT_POSITIONS = 400;
const VANISH_MS = 240;
const DISABLE_FOCUS_MS = 170;

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} toggleLayer, currentContextMode y syncLayers.
 */
export function createLayers(shell) {
  const { dataManager, styleManager, lifetime, reduced } = shell;
  /** Modo de contexto vigente (o entrando): el catálogo dice qué no admite. */
  function currentContextMode() {
    return (
      styleManager._contextControls?._contextModeEntering ||
      styleManager._contextMode ||
      null
    );
  }
  function syncLayers() {
    const count = dataManager.getAll().filter((entry) => entry.enabled).length;
    if ($('eye-active-layer-count'))
      $('eye-active-layer-count').textContent = String(count);
    shell.activeLayers?.sync();
    shell.catalog?.sync();
  }
  function refusalFor(id, nextEnabled, accepted) {
    return nextEnabled && accepted === false && !dataManager.isEnabled(id)
      ? contextLayerUnavailableLabel({
          contextMode: currentContextMode(),
          layerId: id,
        })
      : null;
  }
  function afterDisable(id, button, { returnToCatalog, returnToActive }) {
    if (!reduced()) {
      button.classList.add('eye-layer-vanish');
      lifetime.timeout(
        () => button.classList.remove('eye-layer-vanish'),
        VANISH_MS,
      );
    }
    if (returnToCatalog) shell.openView('catalog', button);
    shell.catalog?.sync();
    lifetime.timeout(
      () => {
        // Undo or another enable makes this delayed disable focus stale.
        if (dataManager.isEnabled(id)) return;
        if (returnToActive) shell.activeLayers?.focusAdd();
        else shell.catalog?.focus(id);
      },
      reduced() ? 0 : DISABLE_FOCUS_MS,
    );
    shell.notice(`Se apagó ${id}.`, {
      actionLabel: 'Deshacer',
      action: async () => {
        await dataManager.setEnabled(id, true, { origin: 'user' });
        syncLayers();
        shell.catalog?.sync();
        if (returnToActive) shell.activeLayers?.focus(id);
        else shell.catalog?.focus(id);
      },
    });
  }
  async function toggleLayer(
    id,
    button,
    { returnToCatalog = false, returnToActive = false } = {},
  ) {
    const wasEnabled = dataManager.isEnabled(id);
    const nextEnabled = !wasEnabled;
    button.setAttribute('aria-busy', 'true');
    try {
      const accepted = await dataManager.setEnabled(id, nextEnabled, {
        origin: 'user',
      });
      // Un modo de contexto aislado (Misiones espaciales) rechaza la capa: se
      // dice el motivo en vez de fallar en silencio.
      const refusal = refusalFor(id, nextEnabled, accepted);
      if (refusal) {
        const name = dataManager.layers.get(id)?.module?.name || id;
        shell.notice(`${name}: ${refusal}`);
      } else if (nextEnabled) {
        const module = dataManager.layers.get(id)?.module;
        styleManager._navigation.requestLayerFit(
          id,
          module?.getAllPositions?.(LAYER_FIT_POSITIONS) || [],
        );
      } else afterDisable(id, button, { returnToCatalog, returnToActive });
    } catch (error) {
      shell.notice(`No se pudo cambiar ${id}: ${error?.message || error}`);
    } finally {
      button.removeAttribute('aria-busy');
      syncLayers();
    }
  }
  return { toggleLayer, currentContextMode, syncLayers };
}

/**
 * Catálogo, capas activas y los accesos del panel Instrumentos.
 * @param {object} shell Contexto compartido del shell.
 * @param {HTMLDetailsElement|null} advancedTelemetry HUD avanzado.
 * @returns {void}
 */
export function mountLayerSurfaces(shell, advancedTelemetry) {
  const { lifetime, dataManager, defer } = shell;
  shell.catalog = mountEyeCatalog({
    host: $('eye-catalog'),
    dataManager,
    getContextMode: shell.currentContextMode,
    onToggle: (entry, button) =>
      shell.toggleLayer(entry.id, button, { returnToCatalog: false }),
    onConfigure: (entry, button) => {
      shell.openView('preferences', button);
      shell.notice(`${entry.name} requiere configuración del proveedor.`);
    },
  });
  defer(() => shell.catalog?.destroy());
  shell.activeLayers = mountEyeActiveLayers({
    host: $('eye-active-layers'),
    dataManager,
    onAdd: (button) => shell.openView('catalog', button),
    onDisable: (id, button) =>
      shell.toggleLayer(id, button, { returnToActive: true }),
    getSuspended: () => shell.earthMoon.debug?.suspended() ?? [],
  });
  defer(() => shell.activeLayers?.destroy());
  lifetime.listen($('eye-catalog-back'), 'click', shell.closePanel);
  lifetime.listen($('eye-instrument-layers'), 'click', () => {
    shell.closePanel();
    shell.activeLayers?.focusAdd();
  });
  lifetime.listen($('eye-instrument-data'), 'click', () => {
    advancedTelemetry.open = true;
    shell.closePanel();
    advancedTelemetry.focus?.({ preventScroll: true });
  });
}
