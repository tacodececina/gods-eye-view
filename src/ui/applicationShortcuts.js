const STYLE_KEYS = Object.freeze({
  1: 'normal',
  2: 'retro',
  3: 'surveillance',
  4: 'thermal',
  5: 'anime',
  6: 'noir',
  7: 'snow',
});

/**
 * Bind the application's existing bubbling keyboard shortcuts.
 * Capture-phase surfaces keep first refusal. The caller owns each action and
 * persistence; form controls keep native typing except for Escape.
 * @param {object} options
 * @param {Document} options.documentRef Keyboard event target.
 * @param {HTMLElement} options.searchInput Additional editing target.
 * @param {object} options.actions Existing application operations.
 * @returns {{destroy: Function}} Synchronous, idempotent listener cleanup.
 */
export function bindApplicationShortcuts({
  documentRef,
  searchInput,
  actions,
}) {
  const onKeyDown = (event) => {
    const isFormControl =
      event.target?.matches?.('select, input, textarea') ||
      event.target === searchInput;
    if (isFormControl && event.key !== 'Escape') return;

    if (STYLE_KEYS[event.key]) actions.setStyle(STYLE_KEYS[event.key]);
    if (event.key === 'Escape') actions.dismissSearch();
    const key = event.key.toLowerCase();
    if (key === 'h') actions.toggleHud();
    if (key === 'o') actions.toggleOrbit();
    if (key === 'v') actions.toggleCleanView();
    if (key === 'f') actions.toggleLayers();
    if (key === 'd') actions.cycleDetection();
    if (key === 'c') actions.toggleCctv();
  };
  documentRef.addEventListener('keydown', onKeyDown);
  return {
    destroy() {
      documentRef.removeEventListener('keydown', onKeyDown);
    },
  };
}

/**
 * Atajos de la escena Tierra–Luna (P5 §7). Espacio NO está: ya es «mantener
 * para hablar» de la voz (captura, 500 ms) y un toque en el fondo llega aquí
 * con defaultPrevented; PAUSA/REANUDAR va en P. L, N y P no los usa ningún
 * atajo existente (1–7, H, O, V, F, D, C, `, Ctrl+K, Esc).
 */
export const SCENE_SHORTCUT_KEYS = Object.freeze({
  l: 'aim-moon',
  L: 'earth-moon-system',
  p: 'toggle-pause',
  n: 'now',
  Escape: 'close-date-field',
});

const EDITING_SELECTOR =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

const isEditing = (target) =>
  Boolean(target?.isContentEditable || target?.closest?.(EDITING_SELECTOR));

/**
 * Atajo de escena de `event`, o null. Sin modificadores (Ctrl+L, Ctrl+N son
 * del navegador), sin repetición ni composición; escribiendo en un campo solo
 * llega Esc. Shift solo cuenta en L (SISTEMA).
 * @param {KeyboardEvent|object} event
 * @returns {string|null}
 */
export function resolveSceneShortcut(event) {
  if (!event || event.defaultPrevented || event.repeat || event.isComposing)
    return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key;
  if (key === 'Escape') return SCENE_SHORTCUT_KEYS.Escape;
  if (isEditing(event.target)) return null;
  if (key === 'L' || key === 'l')
    return event.shiftKey ? SCENE_SHORTCUT_KEYS.L : SCENE_SHORTCUT_KEYS.l;
  if (event.shiftKey) return null;
  return key === 'p' || key === 'n' ? SCENE_SHORTCUT_KEYS[key] : null;
}

/**
 * Enlaza los atajos de escena en burbujeo. `run(id)` devuelve true si lo
 * atendió: solo entonces se consume la tecla (y un Esc que cerró FECHA no
 * cierra además el panel).
 * @param {{documentRef: Document, run: (id: string) => boolean}} options
 * @returns {{destroy: Function}} Limpieza síncrona e idempotente.
 */
export function bindSceneShortcuts({ documentRef, run }) {
  const onKeyDown = (event) => {
    const id = resolveSceneShortcut(event);
    if (!id || run(id) !== true) return;
    event.preventDefault();
    if (id === SCENE_SHORTCUT_KEYS.Escape) event.stopImmediatePropagation?.();
  };
  documentRef.addEventListener('keydown', onKeyDown);
  return {
    destroy() {
      documentRef.removeEventListener('keydown', onKeyDown);
    },
  };
}
