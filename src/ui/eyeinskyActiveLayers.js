import { EYE_LAYER_GUIDE } from './eyeinskyCatalog.js';

function node(tag, text, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
}

export function deriveActiveLayers(layers = []) {
  return layers
    .filter((layer) => layer.enabled)
    .map((layer) => ({
      id: String(layer.id),
      name: String(layer.name || layer.id),
      icon: String(layer.icon || EYE_LAYER_GUIDE[layer.id]?.icon || '·'),
    }));
}

/** Compact left-side list backed only by DataManager state. */
export function mountEyeActiveLayers({ host, dataManager, onAdd, onDisable }) {
  if (!host || !dataManager) return { sync() {}, focus() {}, destroy() {} };
  let destroyed = false;
  const paint = () => {
    if (destroyed) return;
    const focusId = document.activeElement?.dataset?.eyeActiveDisable;
    const rows = deriveActiveLayers(dataManager.getAll());
    const count = host.querySelector('[data-eye-active-count]');
    const list = host.querySelector('[data-eye-active-list]');
    const empty = host.querySelector('[data-eye-active-empty]');
    if (count) count.textContent = String(rows.length);
    list?.replaceChildren();
    if (empty) empty.hidden = rows.length > 0;
    for (const row of rows) {
      const item = node('li');
      item.dataset.eyeActiveId = row.id;
      const identity = node('span', undefined, 'eye-active-identity');
      identity.append(node('i', row.icon), node('strong', row.name));
      const button = node('button', 'Apagar');
      button.dataset.eyeActiveDisable = row.id;
      button.setAttribute('aria-label', `Apagar ${row.name}`);
      item.append(identity, button);
      list?.append(item);
    }
    if (focusId)
      host
        .querySelector(`[data-eye-active-disable="${CSS.escape(focusId)}"]`)
        ?.focus({ preventScroll: true });
  };
  const click = (event) => {
    const add = event.target.closest('[data-eye-active-add]');
    if (add) return onAdd?.(add);
    const button = event.target.closest('[data-eye-active-disable]');
    if (button) void onDisable?.(button.dataset.eyeActiveDisable, button);
  };
  host.addEventListener('click', click);
  const unsubscribe = dataManager.subscribe?.(paint) || (() => {});
  paint();
  return {
    sync: paint,
    focus(id) {
      host
        .querySelector(`[data-eye-active-disable="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true });
    },
    focusAdd() {
      host
        .querySelector('[data-eye-active-add]')
        ?.focus({ preventScroll: true });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      host.removeEventListener('click', click);
    },
  };
}
