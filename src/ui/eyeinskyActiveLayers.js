import { EYE_LAYER_GUIDE } from './eyeinskyCatalog.js';
import { SUSPENDED_LABEL } from './eyeinskyLiveSuspension.js';

function node(tag, text, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
}

/**
 * Color semántico del swatch (fase visual T3, §2): ámbar = magnitud (sismos),
 * paper = objetos que se leen (satélites, Luna), verde mineral = capa activa.
 */
const SWATCH_BY_LAYER = Object.freeze({
  earthquakes: 'amber',
  satellites: 'paper',
  moon: 'paper',
});

/** Filas que abren su panel (D3: Señales bajo demanda desde la fila USGS). */
const OPENS_BY_LAYER = Object.freeze({ earthquakes: 'signals' });

/** «Capas en escena · N» (§6.5). */
export const activeLayersHeading = (count) =>
  `Capas en escena · ${Number(count) || 0}`;

const activeRow = (layer, suspended, source = null) => {
  const id = String(layer.id);
  const count = Number.isFinite(source?.count) ? source.count : null;
  return {
    id,
    name: String(layer.name || layer.id),
    icon: String(layer.icon || EYE_LAYER_GUIDE[layer.id]?.icon || '·'),
    swatch: SWATCH_BY_LAYER[id] ?? 'live',
    suspended,
    // Sin conteo publicado por la fuente no se inventa uno.
    count: suspended ? null : count,
    note: suspended ? SUSPENDED_LABEL : (source?.state ?? null),
    opens: suspended ? null : (OPENS_BY_LAYER[id] ?? null),
  };
};

/**
 * Filas de la lista: las encendidas y, detrás, las capas en vivo que la
 * simulación suspendió (P5-11), rotuladas: no están apagadas por la persona.
 * `sources` trae el estado publicado por una fuente (hoy USGS: conteo y
 * estado de la consulta), que la fila lleva en vez de un panel aparte.
 */
export function deriveActiveLayers(
  layers = [],
  suspendedIds = [],
  sources = {},
) {
  const suspended = new Set(suspendedIds);
  const enabled = layers
    .filter((layer) => layer.enabled)
    .map((layer) => activeRow(layer, false, sources[String(layer.id)]));
  const paused = layers
    .filter((layer) => !layer.enabled && suspended.has(String(layer.id)))
    .map((layer) => activeRow(layer, true));
  return [...enabled, ...paused];
}

/** Swatch (decorativo: el nombre ya dice la capa) + nombre + conteo mono. */
function identityOf(row) {
  const identity = node(
    row.opens ? 'button' : 'span',
    undefined,
    'eye-active-identity',
  );
  const swatch = node('i', undefined, 'eye-active-swatch');
  swatch.dataset.swatch = row.swatch;
  swatch.setAttribute('aria-hidden', 'true');
  identity.append(swatch, node('strong', row.name));
  if (row.count !== null)
    identity.append(node('small', String(row.count), 'eye-active-count'));
  if (row.opens) {
    identity.type = 'button';
    identity.dataset.eyeActiveOpen = row.opens;
    identity.setAttribute(
      'aria-label',
      `${row.name}${row.count !== null ? ` · ${row.count}` : ''}. Abrir Señales`,
    );
  }
  return identity;
}

function suspendedItem(row) {
  const item = node('li');
  item.dataset.eyeActiveId = row.id;
  item.dataset.eyeActiveSuspended = '';
  item.append(identityOf(row), node('small', row.note, 'eye-active-note'));
  return item;
}

function activeItem(row) {
  if (row.suspended) return suspendedItem(row);
  const item = node('li');
  item.dataset.eyeActiveId = row.id;
  const identity = identityOf(row);
  if (row.note) {
    const note = node('small', row.note, 'eye-active-source');
    note.dataset.eyeActiveSource = row.id;
    item.append(identity, note);
  } else item.append(identity);
  const button = node('button', 'Apagar');
  button.dataset.eyeActiveDisable = row.id;
  button.setAttribute('aria-label', `Apagar ${row.name}`);
  item.append(button);
  return item;
}

/** Cuenta (solo encendidas), lista y aviso de vacío. */
function paintRows(host, rows) {
  const count = host.querySelector('[data-eye-active-count]');
  const list = host.querySelector('[data-eye-active-list]');
  const empty = host.querySelector('[data-eye-active-empty]');
  const active = rows.filter((row) => !row.suspended).length;
  if (count) count.textContent = String(active);
  const title = host.querySelector('#eye-active-title');
  if (title) title.dataset.heading = activeLayersHeading(active);
  list?.replaceChildren(...rows.map(activeItem));
  if (empty) empty.hidden = rows.length > 0;
  // Sin capas la lista no se pinta en reposo (el CSS la retira salvo con foco).
  host.dataset.empty = String(rows.length === 0);
}

/** Clic de la lista: «+ Agregar», abrir el panel de una fila o apagar. */
function activeLayersClick({ onAdd, onOpen, onDisable }) {
  return (event) => {
    const add = event.target.closest('[data-eye-active-add]');
    if (add) return onAdd?.(add);
    const open = event.target.closest('[data-eye-active-open]');
    if (open) return onOpen?.(open.dataset.eyeActiveOpen, open);
    const button = event.target.closest('[data-eye-active-disable]');
    if (button) void onDisable?.(button.dataset.eyeActiveDisable, button);
  };
}

/** Compact left-side list backed only by DataManager state. */
export function mountEyeActiveLayers({
  host,
  dataManager,
  onAdd,
  onDisable,
  onOpen,
  getSuspended = () => [],
  getSources = () => ({}),
}) {
  if (!host || !dataManager) return { sync() {}, focus() {}, destroy() {} };
  let destroyed = false;
  const paint = () => {
    if (destroyed) return;
    const focusId = document.activeElement?.dataset?.eyeActiveDisable;
    paintRows(
      host,
      deriveActiveLayers(dataManager.getAll(), getSuspended(), getSources()),
    );
    if (focusId)
      host
        .querySelector(`[data-eye-active-disable="${CSS.escape(focusId)}"]`)
        ?.focus({ preventScroll: true });
  };
  const click = activeLayersClick({ onAdd, onOpen, onDisable });
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
