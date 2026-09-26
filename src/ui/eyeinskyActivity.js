/**
 * Terminal OPS (EYEINSKY P3.1, sobre el modelo de actividad de P3).
 *
 * Tercer panel del Mission Dock. Narra lo que otros dueños ya están haciendo:
 *   - sin denominador fiable dice «en curso», nunca un porcentaje inventado,
 *   - abrir el panel no arranca ni detiene trabajo del manager,
 *   - sin eventos dice «Sin actividad registrada», sin barras decorativas,
 *   - LIVE describe el estado medido del registro, no una promesa de conexión.
 *
 * Accesibilidad: el registro es UNA sola región viva (`role="log"`, que ya
 * implica `aria-live="polite"`). No se añade un segundo `aria-live` para la
 * misma transición: los avisos críticos siguen siendo de ShellFeedback, y dos
 * regiones vivas contando lo mismo se leen dos veces.
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
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
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
 * Monta la terminal OPS.
 *
 * @param {object} options Montaje.
 * @param {HTMLElement} options.host Contenedor (el panel OPS del dock).
 * @param {(taskId:string) => void} [options.onRetry] Reintento.
 * @param {(taskId:string) => void} [options.onCancel] Cancelación.
 * @param {AbortSignal} [options.signal] Señal de desmontaje.
 * @returns {{update:(state:object) => void, suspend:(value:boolean) => void, isSuspended:() => boolean, destroy:() => void}} Control.
 */
export function mountEyeActivity({ host, onRetry, onCancel, signal } = {}) {
  if (!host) throw new TypeError('mountEyeActivity requiere un host');
  const doc = host.ownerDocument;
  let destroyed = false;
  let suspended = false;
  let lastState = { tasks: [], history: [] };

  const root = node(doc, 'div', '', 'eye-activity eye-ops');

  const head = node(doc, 'header', '', 'eye-ops-head');
  const mark = node(doc, 'b', 'EYEINSKY OPS', 'eye-ops-mark');
  // `LIVE` describe el registro que se está pintando, no una promesa de
  // conexión: su estado sale de las tareas reales, igual que las filas.
  const live = node(doc, 'span', '// LIVE', 'eye-ops-live');
  live.dataset.activityState = 'idle';
  const summary = node(doc, 'span', '', 'eye-ops-summary');
  head.append(mark, live, summary);

  // Una sola región viva para todo el registro. `role="log"` ya implica
  // `aria-live="polite"`; añadir otro lo contaría dos veces.
  const list = node(doc, 'ol', '', 'eye-activity-list eye-ops-log');
  list.id = 'eye-ops-log';
  list.setAttribute('role', 'log');
  list.setAttribute('aria-label', 'Trabajo en curso');

  const historyTitle = node(
    doc,
    'h3',
    'Historial',
    'eye-activity-history-title eye-ops-history-title',
  );
  historyTitle.id = 'eye-ops-history-title';
  const history = node(doc, 'ul', '', 'eye-activity-history eye-ops-history');
  history.setAttribute('aria-labelledby', 'eye-ops-history-title');
  root.append(head, list, historyTitle, history);
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

  const render = () => {
    const { tasks, history: entries } = lastState;
    const active = tasks.length;
    const failed = entries.filter((task) => task.status === 'error').length;
    summary.textContent = active
      ? `${active} en curso`
      : failed
        ? `${failed} con fallo`
        : 'En reposo';
    const state = active ? 'loading' : failed ? 'error' : 'idle';
    live.dataset.activityState = state;
    root.dataset.activityState = state;

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
    /**
     * Suspende la superficie sin perder su estado: al restaurar vuelve tal cual.
     * El dock ya se retira entero en Vista limpia; esto apaga además la región
     * viva, para que un trabajo que termina detrás no se lea en voz alta sobre
     * una pantalla que la persona pidió despejar.
     * @param {boolean} value Suspender.
     * @returns {void}
     */
    suspend(value) {
      if (destroyed) return;
      suspended = value === true;
      root.hidden = suspended;
    },
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
