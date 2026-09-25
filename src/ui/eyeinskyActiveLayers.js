import { EYE_LAYER_GUIDE } from './eyeinskyCatalog.js';
import { SUSPENDED_LABEL } from './eyeinskyLiveSuspension.js';

function node(tag, text, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
}

const activeRow = (layer, suspended) => ({
  id: String(layer.id),
  name: String(layer.name || layer.id),
  icon: String(layer.icon || EYE_LAYER_GUIDE[layer.id]?.icon || '·'),
  suspended,
  note: suspended ? SUSPENDED_LABEL : null,
});

/**
 * Filas de la lista: las encendidas y, detrás, las capas en vivo que la
 * simulación suspendió (P5-11), rotuladas: no están apagadas por la persona.
 */
export function deriveActiveLayers(layers = [], suspendedIds = []) {
  const suspended = new Set(suspendedIds);
  const enabled = layers
    .filter((layer) => layer.enabled)
    .map((layer) => activeRow(layer, false));
  const paused = layers
    .filter((layer) => !layer.enabled && suspended.has(String(layer.id)))
    .map((layer) => activeRow(layer, true));
  return [...enabled, ...paused];
}

function suspendedItem(row) {
  const item = node('li');
  item.dataset.eyeActiveId = row.id;
  item.dataset.eyeActiveSuspended = '';
  const identity = node('span', undefined, 'eye-active-identity');
  identity.append(node('i', row.icon), node('strong', row.name));
  item.append(identity, node('small', row.note, 'eye-active-note'));
  return item;
}

function activeItem(row) {
  if (row.suspended) return suspendedItem(row);
  const item = node('li');
  item.dataset.eyeActiveId = row.id;
  const identity = node('span', undefined, 'eye-active-identity');
  identity.append(node('i', row.icon), node('strong', row.name));
  const button = node('button', 'Apagar');
  button.dataset.eyeActiveDisable = row.id;
  button.setAttribute('aria-label', `Apagar ${row.name}`);
  item.append(identity, button);
  return item;
}

/** Cuenta (solo encendidas), lista y aviso de vacío. */
function paintRows(host, rows) {
  const count = host.querySelector('[data-eye-active-count]');
  const list = host.querySelector('[data-eye-active-list]');
  const empty = host.querySelector('[data-eye-active-empty]');
  if (count)
    count.textContent = String(rows.filter((row) => !row.suspended).length);
  list?.replaceChildren(...rows.map(activeItem));
  if (empty) empty.hidden = rows.length > 0;
}

/** Compact left-side list backed only by DataManager state. */
export function mountEyeActiveLayers({
  host,
  dataManager,
  onAdd,
  onDisable,
  getSuspended = () => [],
}) {
  if (!host || !dataManager) return { sync() {}, focus() {}, destroy() {} };
  let destroyed = false;
  const paint = () => {
    if (destroyed) return;
    const focusId = document.activeElement?.dataset?.eyeActiveDisable;
    paintRows(host, deriveActiveLayers(dataManager.getAll(), getSuspended()));
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
