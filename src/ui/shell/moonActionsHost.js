/**
 * Casa de las acciones de la Luna (fase visual T3, D1-A). Sin dock en reposo
 * no hay cabecera de dock que las aloje: con la Luna FIJADA viven en su panel
 * contextual (cabecera del dock); si no, en el menú de la fila de capa Luna
 * (`[data-eye-moon-menu]`, dentro de «Capas en escena»). El nodo es uno solo y
 * se MUEVE (no se clona): mismos ids, mismos oyentes. Si tenía el foco, lo
 * conserva tras moverse (WCAG 2.4.3).
 */
import { MOON_CONTEXT_KEY } from '../eyeinskyMoonDockModel.js';

/**
 * @param {Document} doc
 * @returns {HTMLElement} Contenedor estable de las acciones de la Luna.
 */
export function createMoonActionsHost(doc = globalThis.document) {
  const wrapper = doc.createElement('div');
  wrapper.className = 'eye-moon-host';
  return wrapper;
}

/**
 * ¿Dónde van ahora? En el dock solo si la Luna es el objetivo visible.
 * @param {{dockVisible: boolean, contextKey: string|null}} input
 * @returns {'dock'|'menu'}
 */
export function moonActionsPlace({ dockVisible, contextKey }) {
  return dockVisible === true && contextKey === MOON_CONTEXT_KEY
    ? 'dock'
    : 'menu';
}

/**
 * Coloca el contenedor según el objetivo vigente.
 * @param {object} shell Contexto del shell.
 * @returns {void}
 */
export function placeMoonActions(shell) {
  const wrapper = shell.moonActionsHost;
  if (!wrapper) return;
  const doc = wrapper.ownerDocument;
  const menu = doc.querySelector('[data-eye-moon-menu]');
  const place = moonActionsPlace({
    dockVisible: shell.state.dockView?.visible === true,
    contextKey: shell.state.dossierState?.context?.key ?? null,
  });
  const target = place === 'dock' ? shell.missionDock?.getMoonHost() : menu;
  if (target && wrapper.parentElement !== target) {
    const active = doc.activeElement;
    const hadFocus = wrapper.contains(active);
    target.append(wrapper);
    if (hadFocus && active.isConnected) active.focus({ preventScroll: true });
  }
  if (menu) menu.hidden = wrapper.parentElement !== menu;
}
