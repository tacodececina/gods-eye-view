/** Lista #eye-signal-list del panel Señales y rótulos compartidos de USGS. */
import { $, node } from './shellDom.js';

export const SIGNAL_STATE_LABELS = {
  off: 'Sin consultar',
  loading: 'Consultando',
  ready: 'Actualizado',
  empty: 'Sin eventos',
  stale: 'Sin conexión · datos anteriores',
  error: 'Fuente no disponible',
  delayed: 'Consulta retrasada',
};

/**
 * Fecha UTC legible o «No informado».
 * @param {number|string|null|undefined} value Marca de tiempo.
 * @returns {string} Texto.
 */
export const eyeDate = (value) =>
  value
    ? new Date(value).toLocaleString('es-MX', {
        timeZone: 'UTC',
        hour12: false,
      }) + ' UTC'
    : 'No informado';

function signalRow(row, selection) {
  const li = node('li'),
    button = node('button');
  button.dataset.signalId = row.id;
  button.setAttribute('aria-pressed', String(selection === row.id));
  button.append(node('span', row.magnitude.toFixed(1), 'eye-mag'));
  const body = node('span');
  body.append(
    node('strong', row.place || 'Ubicación no informada'),
    node('small', `${row.id} · ${eyeDate(row.timeMs)}`),
  );
  button.append(body);
  li.append(button);
  return li;
}

function emptyMessage(rows, sourceState) {
  return rows.length
    ? 'Ningún evento coincide con estos filtros. Amplía el sector, la antigüedad o la magnitud mínima.'
    : sourceState === 'loading'
      ? 'Esperando respuesta de USGS…'
      : 'No hay eventos disponibles. Consulta la fuente o vuelve a intentar.';
}

/**
 * Repinta la lista sólo si cambió su firma, conservando el foco de la fila.
 * @param {object} state Estado del shell (rows, selection, lastListSignature).
 * @param {object[]} visible Filas que pasan los filtros.
 * @param {string} sourceState Estado de la fuente.
 * @returns {void}
 */
export function paintSignalList(state, visible, sourceState) {
  const signature = JSON.stringify([
    visible.map((r) => [r.id, r.timeMs, r.magnitude]),
    state.selection,
  ]);
  if (signature === state.lastListSignature) return;
  state.lastListSignature = signature;
  const focusId = document.activeElement?.dataset.signalId;
  const list = $('eye-signal-list');
  list.replaceChildren();
  for (const row of visible) list.append(signalRow(row, state.selection));
  if (!visible.length)
    list.append(node('li', emptyMessage(state.rows, sourceState), 'eye-empty'));
  if (focusId)
    [...list.querySelectorAll('button')]
      .find((b) => b.dataset.signalId === focusId)
      ?.focus({ preventScroll: true });
}
