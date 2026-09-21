/**
 * Superficie del expediente contextual (EYEINSKY P3).
 *
 * Pinta el estado que produce `eyeinskyDossierModel.js`. No decide selección,
 * no mueve la cámara y no pide datos: las acciones se delegan al shell, que ya
 * es el dueño de cámara, operaciones y capas.
 *
 * Todo el texto entra por `textContent`; en esta ruta no hay `innerHTML`, así
 * que un nombre de lugar con `<` es un nombre, nunca markup.
 */
import { activityAgeLabel } from './eyeinskyActivity.js';

/** Etiqueta del tipo de contexto, en la cabecera de la superficie. */
const KIND_KICKERS = Object.freeze({
  view: 'VISTA / TIERRA',
  earthquake: 'INSPECCIONAR / USGS',
  tracked: 'SEGUIMIENTO / CONTACTO',
  camera: 'CÁMARA / CCTV',
  entity: 'INSPECCIONAR / CAPA',
});

/** Cómo se dice cada estado de frescura, sin eufemismos. */
const STATUS_LABELS = Object.freeze({
  ready: 'Observación reciente',
  stale: 'Observación antigua',
  missing: 'Ya no se observa',
  unreported: 'La fuente no informa la hora',
});

/**
 * @param {Document} doc Documento.
 * @param {string} tag Etiqueta.
 * @param {string} [text] Texto.
 * @param {string} [className] Clase.
 * @returns {HTMLElement} Nodo.
 */
function node(doc, tag, text = '', className = '') {
  const element = doc.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

/**
 * Monta el expediente sobre el contenedor del inspector.
 *
 * @param {object} options Montaje.
 * @param {HTMLElement} options.host Contenedor del contenido.
 * @param {HTMLElement} [options.kicker] Rótulo de la cabecera.
 * @param {(action:{type:string, contextKey:string}) => void} [options.onAction] Acciones.
 * @param {AbortSignal} [options.signal] Señal de desmontaje.
 * @returns {{update:(state:object) => void, setHeading:(deg:number|null) => void, destroy:() => void}} Control.
 */
export function mountEyeDossier({
  host,
  kicker = null,
  onAction,
  signal,
} = {}) {
  if (!host) throw new TypeError('mountEyeDossier requiere un host');
  const doc = host.ownerDocument;
  let destroyed = false;
  let lastSignature = null;

  const root = node(doc, 'div', '', 'eye-dossier');
  const title = node(doc, 'h2', '', 'eye-dossier-title');
  title.id = 'eye-dossier-title';
  const statusLine = node(doc, 'p', '', 'eye-dossier-status');
  const sourceLine = node(doc, 'p', '', 'eye-dossier-source');
  const positionRow = node(doc, 'div', '', 'eye-dossier-position');
  // P3.1: la brújula y `Centrar` viven ahora en el riel del Mission Dock, que
  // está siempre a la vista. Repetirlos aquí daría dos controles con el mismo
  // nombre accesible para la misma acción; el panel conserva sólo la lectura.
  const positionText = node(doc, 'span', '', 'eye-dossier-coords');
  positionRow.append(positionText);
  const fields = node(doc, 'dl', '', 'eye-dossier-fields');
  // P3.1: los medios tienen su propio panel en el dock. El expediente ya no los
  // aloja, así que tampoco deja aquí un contenedor vacío.
  const actions = node(doc, 'div', '', 'eye-dossier-actions');
  root.append(title, statusLine, sourceLine, positionRow, fields, actions);
  host.replaceChildren(root);

  const emit = (type, contextKey) => onAction?.({ type, contextKey });

  root.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-eye-dossier-action]');
    if (!button || !root.contains(button)) return;
    emit(button.dataset.eyeDossierAction, root.dataset.contextKey || '');
  });

  /**
   * Firma barata del estado visible: evita repintar (y por tanto mover el foco)
   * cuando un refresh no cambió nada de lo que se ve.
   * @param {object} state Estado del expediente.
   * @returns {string} Firma.
   */
  const signatureOf = (state) => {
    const context = state.context;
    return JSON.stringify([
      context.key,
      state.generation,
      state.visibility,
      state.suspended,
      context.title,
      context.status,
      context.source,
      context.sourceUrl,
      context.observedAt,
      context.localUpdatedAt,
      context.position,
      context.fields,
      context.assetIds,
    ]);
  };

  const control = {
    /**
     * @param {object} state Estado reducido del expediente.
     * @returns {void}
     */
    update(state) {
      if (destroyed || !state) return;
      const signature = signatureOf(state);
      if (signature === lastSignature) return;
      lastSignature = signature;
      const context = state.context;
      root.dataset.contextKey = context.key;
      root.dataset.contextKind = context.kind;
      if (kicker)
        kicker.textContent = KIND_KICKERS[context.kind] || KIND_KICKERS.entity;
      title.textContent = context.title;

      const age =
        context.observedAt !== null
          ? activityAgeLabel(context.observedAt)
          : context.localUpdatedAt !== null
            ? `registrado ${activityAgeLabel(context.localUpdatedAt)}`
            : null;
      statusLine.textContent = age
        ? `${STATUS_LABELS[context.status] || STATUS_LABELS.unreported} · ${age}`
        : STATUS_LABELS[context.status] || STATUS_LABELS.unreported;
      statusLine.dataset.status = context.status;

      // La fuente es pulsable sólo si hay a dónde ir; si no, queda como texto.
      sourceLine.replaceChildren();
      if (context.source) {
        sourceLine.append(node(doc, 'span', 'Fuente: '));
        if (context.sourceUrl) {
          const link = node(
            doc,
            'a',
            `${context.source} ↗`,
            'eye-dossier-link',
          );
          link.href = context.sourceUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          sourceLine.append(link);
        } else sourceLine.append(node(doc, 'b', context.source));
      } else {
        sourceLine.append(
          node(doc, 'span', 'Fuente no declarada por el proveedor'),
        );
      }

      if (context.position) {
        positionRow.hidden = false;
        positionText.textContent = `${context.position.lat.toFixed(3)}° / ${context.position.lon.toFixed(3)}°`;
      } else {
        positionRow.hidden = true;
        positionText.textContent = '';
      }

      fields.replaceChildren();
      for (const field of context.fields) {
        const item = node(doc, 'div');
        item.append(node(doc, 'dt', field.label));
        item.append(
          node(
            doc,
            'dd',
            field.unit ? `${field.value} ${field.unit}` : field.value,
          ),
        );
        fields.append(item);
      }
      fields.hidden = context.fields.length === 0;

      actions.replaceChildren();
      if (context.kind !== 'view') {
        const save = node(
          doc,
          'button',
          'Añadir contexto a una operación',
          'eye-dossier-action',
        );
        save.type = 'button';
        save.dataset.eyeDossierAction = 'save-operation';
        actions.append(save);
      }
    },
    /**
     * Sin brújula propia desde P3.1: el rumbo lo publica el riel del dock. Se
     * conserva el método para no romper a quien lo llame, y no dibuja nada.
     * @param {number|null} headingDeg Rumbo en grados.
     * @returns {void}
     */
    setHeading(headingDeg) {
      void headingDeg;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.remove();
    },
  };

  signal?.addEventListener('abort', () => control.destroy(), { once: true });
  return control;
}
