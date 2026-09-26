/**
 * Espacio de trabajo del shell: vistas del panel, cierre del inspector y
 * Vista limpia. Recibe el contexto compartido del shell (`shell`).
 */
import { $ } from './shellDom.js';

const MOBILE_QUERY = '(max-width:650px)';

export const VIEW_TITLES = {
  signals: ['SEÑALES', 'Registro sísmico'],
  operations: ['OPERACIÓN', 'Continuidad de trabajo'],
  catalog: ['INSTRUMENTOS / FUENTES', 'Capas y disponibilidad'],
  instruments: ['INSTRUMENTOS', 'Funciones de observación'],
  more: ['MÁS', 'Herramientas de la consola'],
  display: ['EXPLORAR', 'Apariencia y destinos'],
  director: ['OPERACIÓN', 'Director de escenas'],
  sensors: ['FUENTES / MEDIOS', 'Cámaras y radio'],
  preferences: ['CONFIGURACIÓN', 'Preferencias y cabina'],
};

function showPanel(shell, view) {
  for (const panel of document.querySelectorAll('[data-eye-panel]'))
    panel.hidden = panel.dataset.eyePanel !== view;
  $('eye-workspace').querySelector('.eye-workspace-content').scrollTop = 0;
  for (const b of document.querySelectorAll(
    '.eye-view-controls [data-eye-view]',
  ))
    b.setAttribute('aria-pressed', String(b.dataset.eyeView === view));
  if (VIEW_TITLES[view]) {
    shell.panelKickerDecode.reveal(VIEW_TITLES[view][0]);
    $('eye-panel-title').textContent = VIEW_TITLES[view][1];
    $('eye-panel-close').focus({ preventScroll: true });
  }
}

function inspectorReturnTarget(shell, mobileReturn) {
  const { state } = shell;
  const currentRow = [...$('eye-signal-list').querySelectorAll('button')].find(
    (button) => button.dataset.signalId === state.selection,
  );
  return mobileReturn
    ? $('eye-home')
    : state.inspectorTrigger?.isConnected &&
        state.inspectorTrigger.getClientRects().length
      ? state.inspectorTrigger
      : currentRow || $('eye-command-open');
}

/**
 * @param {object} shell Contexto compartido del shell.
 * @returns {object} openView, closePanel, closeInspector y clean.
 */
export function createPanels(shell) {
  const { state } = shell;
  function openView(view, trigger = document.activeElement) {
    if (view !== 'explore' && !VIEW_TITLES[view]) return;
    state.activeView = view;
    state.panelTrigger = trigger;
    shell.setSurface('eye-workspace', view !== 'explore');
    document.body.dataset.eyeActive = String(view !== 'explore');
    showPanel(shell, view);
    if (view === 'signals') void shell.refresh();
    if (view === 'operations') shell.operations.refresh();
    // En móvil el panel ocupa la pantalla: el expediente se SUSPENDE mientras
    // tanto. Antes se cerraba, y abrir Catálogo o Preferencias equivalía a
    // cerrarlo para siempre, perdiendo la ficha vigente sin que nadie lo pidiera.
    shell.setEyeSurfaceSuspension(
      'mobile-workspace',
      matchMedia(MOBILE_QUERY).matches && view !== 'explore',
    );
  }
  function closePanel() {
    openView('explore', state.panelTrigger);
    state.panelTrigger?.focus?.({ preventScroll: true });
  }
  function closeInspector(focus = true) {
    // Cerrar es una decisión de la persona: el expediente la recuerda y ningún
    // refresh posterior lo reabre por su cuenta.
    shell.publishDossier({ type: 'close' });
    if (!focus) return;
    const mobileReturn =
      state.activeView === 'signals' && matchMedia(MOBILE_QUERY).matches;
    if (mobileReturn) openView('explore', $('eye-home'));
    else if (state.activeView === 'signals')
      shell.setSurface('eye-workspace', true);
    inspectorReturnTarget(shell, mobileReturn).focus({ preventScroll: true });
  }
  function clean(value) {
    document.body.classList.toggle('eye-clean', value);
    // Suspender, no destruir: al salir de Vista limpia el expediente y la
    // cápsula vuelven exactamente como estaban, con su carrusel en pausa.
    shell.setEyeSurfaceSuspension('clean-view', value);
    $('eye-clean-exit').hidden = !value;
    $('eye-clean').setAttribute('aria-pressed', String(value));
    if (value) $('eye-clean-exit').focus();
    else $('eye-clean').focus();
  }
  return { openView, closePanel, closeInspector, clean };
}

/**
 * Clic global de vistas y sectores, y cierre del panel.
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountPanelNavigation(shell) {
  const { lifetime } = shell;
  lifetime.listen(document, 'click', (event) => {
    const b = event.target.closest('[data-eye-view]');
    if (b) shell.openView(b.dataset.eyeView, b);
    const s = event.target.closest('[data-eye-sector]');
    if (s) shell.sector(s.dataset.eyeSector);
  });
  lifetime.listen($('eye-panel-close'), 'click', shell.closePanel);
}

/**
 * Las dos rutas propias de Vista limpia (#eye-clean y #eye-clean-exit).
 * @param {object} shell Contexto compartido del shell.
 * @returns {void}
 */
export function mountCleanView(shell) {
  const { lifetime } = shell;
  lifetime.listen($('eye-clean'), 'click', () => shell.clean(true));
  lifetime.listen($('eye-clean-exit'), 'click', () => shell.clean(false));
}
