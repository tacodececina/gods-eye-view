/**
 * Cápsula de actividad real (EYEINSKY P3).
 *
 * Resumen bajo Ayuda y detalle voluntario. Narra lo que otros dueños ya están
 * haciendo:
 *   - sin denominador fiable dice «en curso», nunca un porcentaje inventado,
 *   - los avisos críticos siguen siendo de ShellFeedback: aquí no se duplica
 *     `aria-live` para la misma transición,
 *   - abrir o cerrar la cápsula no arranca ni detiene trabajo del manager,
 *   - sin eventos dice «Sin actividad registrada», sin barras decorativas.
 */
import { activityProgress } from './eyeinskyActivityModel.js';

/** Estados en palabras, no en colores. */
const STATUS_LABELS = Object.freeze({
  idle: 'En espera',
  loading: 'En curso',
  ready: 'Completado',
  partial: 'Datos parciales',
  error: 'Fallo',
  cancelled: 'Cancelado',
  blocked: 'Requiere acción',
});

/**
 * Edad legible de una marca de tiempo.
 * @param {number|null} timestampMs Instante en ms UTC.
 * @param {number} [now] Ahora en ms.
 * @returns {string} Texto de edad.
 */
export function activityAgeLabel(timestampMs, now = Date.now()) {
  if (!Number.isFinite(timestampMs)) return 'sin hora informada';
  const seconds = Math.round((now - timestampMs) / 1000);
  if (seconds < 0) return 'hora por delante del reloj local';
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

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
 * Monta la cápsula de actividad.
 *
 * @param {object} options Montaje.
 * @param {HTMLElement} options.host Contenedor (junto a Ayuda).
 * @param {(taskId:string) => void} [options.onRetry] Reintento.
 * @param {(taskId:string) => void} [options.onCancel] Cancelación.
 * @param {AbortSignal} [options.signal] Señal de desmontaje.
 * @returns {{update:(state:object) => void, open:() => void, close:() => void, suspend:(value:boolean) => void, isOpen:() => boolean, destroy:() => void}} Control.
 */
export function mountEyeActivity({ host, onRetry, onCancel, signal } = {}) {
  if (!host) throw new TypeError('mountEyeActivity requiere un host');
  const doc = host.ownerDocument;
  let destroyed = false;
  let open = false;
  let suspended = false;
  let trigger = null;
  let lastState = { tasks: [], history: [] };

  const root = node(doc, 'div', '', 'eye-activity');
  const capsule = node(
    doc,
    'button',
    '',
    'eye-activity-capsule eye-glass-surface',
  );
  capsule.type = 'button';
  capsule.id = 'eye-activity-capsule';
  capsule.setAttribute('aria-expanded', 'false');
  capsule.setAttribute('aria-controls', 'eye-activity-detail');
  const capsuleText = node(doc, 'b', '', 'eye-activity-summary');
  // Dos partes: el nombre fijo y el resumen medido. En pantallas estrechas el
  // nombre se oculta visualmente pero sigue en el nombre accesible del botón.
  const capsuleWord = node(doc, 'span', 'Actividad', 'eye-activity-word');
  const capsuleCount = node(doc, 'span', '', 'eye-activity-count-text');
  capsuleText.append(capsuleWord, capsuleCount);
  capsule.append(capsuleText);

  const detail = node(doc, 'div', '', 'eye-activity-detail eye-glass-surface');
  detail.id = 'eye-activity-detail';
  detail.hidden = true;
  // No modal a propósito: el globo sigue recibiendo rueda y arrastre detrás.
  detail.setAttribute('role', 'group');
  detail.setAttribute('aria-label', 'Actividad de carga');
  // Puede no haber ningún control dentro (sin trabajo en curso): el propio
  // panel debe poder recibir el foco para que Escape lo devuelva a la cápsula.
  detail.tabIndex = -1;
  const list = node(doc, 'ul', '', 'eye-activity-list');
  const historyTitle = node(
    doc,
    'h3',
    'Historial',
    'eye-activity-history-title',
  );
  const history = node(doc, 'ul', '', 'eye-activity-history');
  detail.append(list, historyTitle, history);
  root.append(capsule, detail);
  host.append(root);

  /**
   * Una fila de trabajo, con su progreso honesto y sus acciones reales.
   * @param {object} task Tarea normalizada.
   * @returns {HTMLElement} Elemento de lista.
   */
  const renderTask = (task) => {
    const item = node(doc, 'li', '', 'eye-activity-item');
    item.dataset.taskId = task.taskId;
    item.dataset.status = task.status;
    item.append(node(doc, 'b', task.label, 'eye-activity-label'));
    const progress = activityProgress(task);
    if (progress.mode === 'determinate') {
      const bar = doc.createElement('progress');
      bar.max = progress.max;
      bar.value = progress.value;
      bar.className = 'eye-activity-progress';
      item.append(bar);
      item.append(
        node(
          doc,
          'span',
          `${progress.value}/${progress.max} ${progress.unit}`,
          'eye-activity-count',
        ),
      );
    } else {
      // Sin denominador fiable se dice el estado, no se dibuja una barra.
      item.append(
        node(doc, 'span', STATUS_LABELS[task.status], 'eye-activity-state'),
      );
    }
    item.append(
      node(doc, 'span', activityAgeLabel(task.updatedAt), 'eye-activity-age'),
    );
    if (task.safeError)
      item.append(node(doc, 'span', task.safeError, 'eye-activity-error'));
    if (task.canRetry) {
      const retry = node(doc, 'button', 'Reintentar', 'eye-activity-retry');
      retry.type = 'button';
      retry.dataset.eyeActivityRetry = task.taskId;
      item.append(retry);
    }
    if (task.canCancel) {
      const cancel = node(doc, 'button', 'Cancelar', 'eye-activity-cancel');
      cancel.type = 'button';
      cancel.dataset.eyeActivityCancel = task.taskId;
      item.append(cancel);
    }
    return item;
  };

  root.addEventListener('click', (event) => {
    const retry = event.target.closest?.('[data-eye-activity-retry]');
    if (retry) {
      onRetry?.(retry.dataset.eyeActivityRetry);
      return;
    }
    const cancel = event.target.closest?.('[data-eye-activity-cancel]');
    if (cancel) {
      onCancel?.(cancel.dataset.eyeActivityCancel);
      return;
    }
    const entry = event.target.closest?.('[data-eye-activity-entry]');
    if (entry) {
      const expanded = entry.getAttribute('aria-expanded') === 'true';
      entry.setAttribute('aria-expanded', String(!expanded));
      const body = entry.nextElementSibling;
      if (body) body.hidden = expanded;
    }
  });

  capsule.addEventListener('click', () => {
    trigger = capsule;
    control[open ? 'close' : 'open']();
  });

  detail.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    control.close();
    // El foco vuelve a quien abrió, no al principio del documento.
    (trigger || capsule).focus({ preventScroll: true });
  });

  const render = () => {
    const { tasks, history: entries } = lastState;
    const active = tasks.length;
    const failed = entries.filter((task) => task.status === 'error').length;
    capsuleCount.textContent = active
      ? ` · ${active} en curso`
      : failed
        ? ` · ${failed} con fallo`
        : '';
    capsule.dataset.activityState = active
      ? 'loading'
      : failed
        ? 'error'
        : 'idle';

    list.replaceChildren();
    if (active === 0)
      list.append(
        node(doc, 'li', 'Sin trabajo en curso', 'eye-activity-empty'),
      );
    else for (const task of tasks) list.append(renderTask(task));

    history.replaceChildren();
    if (entries.length === 0) {
      history.append(
        node(doc, 'li', 'Sin actividad registrada', 'eye-activity-empty'),
      );
      return;
    }
    for (const task of entries.slice(0, 12)) {
      const item = node(doc, 'li', '', 'eye-activity-history-item');
      item.dataset.status = task.status;
      // Cada marca del historial es un control real que expande su evento;
      // no hay barras decorativas que no lleven a ningún dato.
      const entry = node(
        doc,
        'button',
        `${task.label} · ${STATUS_LABELS[task.status]}`,
        'eye-activity-entry',
      );
      entry.type = 'button';
      entry.dataset.eyeActivityEntry = task.taskId;
      entry.setAttribute('aria-expanded', 'false');
      const body = node(doc, 'div', '', 'eye-activity-entry-body');
      body.hidden = true;
      body.append(
        node(doc, 'span', `Intento ${task.attempt}`, 'eye-activity-attempt'),
      );
      body.append(
        node(doc, 'span', activityAgeLabel(task.updatedAt), 'eye-activity-age'),
      );
      if (task.safeError)
        body.append(node(doc, 'span', task.safeError, 'eye-activity-error'));
      item.append(entry, body);
      // Un fallo o un resultado parcial sigue siendo accionable aunque ya haya
      // terminado: el botón vive aquí, visible sin desplegar el evento, y no
      // cuenta como trabajo en curso.
      if (task.canRetry) {
        const retry = node(
          doc,
          'button',
          `Reintentar ${task.label}`,
          'eye-activity-retry',
        );
        retry.type = 'button';
        retry.dataset.eyeActivityRetry = task.taskId;
        item.append(retry);
      }
      history.append(item);
    }
  };

  const control = {
    /**
     * @param {{tasks:Array, history:Array}} state Instantánea del modelo.
     * @returns {void}
     */
    update(state) {
      if (destroyed || !state) return;
      lastState = state;
      render();
    },
    open() {
      if (destroyed || suspended) return;
      open = true;
      detail.hidden = false;
      capsule.setAttribute('aria-expanded', 'true');
      const first = detail.querySelector('button');
      (first || detail).focus?.({ preventScroll: true });
    },
    close() {
      if (destroyed) return;
      open = false;
      detail.hidden = true;
      capsule.setAttribute('aria-expanded', 'false');
    },
    /**
     * Suspende la superficie sin perder su estado: al restaurar vuelve tal cual.
     * @param {boolean} value Suspender.
     * @returns {void}
     */
    suspend(value) {
      if (destroyed) return;
      suspended = value === true;
      root.hidden = suspended;
      // Oculto no puede recibir foco: se apaga el control, no sólo la pintura.
      capsule.tabIndex = suspended ? -1 : 0;
      if (suspended) {
        detail.hidden = true;
        capsule.setAttribute('aria-expanded', 'false');
      } else if (open) {
        detail.hidden = false;
        capsule.setAttribute('aria-expanded', 'true');
      }
    },
    isOpen: () => open,
    isSuspended: () => suspended,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.remove();
    },
  };

  signal?.addEventListener('abort', () => control.destroy(), { once: true });
  render();
  return control;
}
