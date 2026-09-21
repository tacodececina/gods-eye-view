/**
 * Modelo puro de la actividad real (EYEINSKY P3).
 *
 * Narra trabajo que ya está ocurriendo en otros dueños (manager de capas,
 * controlador de mapas, geometría de CCTV). No lo inicia, no lo acelera y no lo
 * inventa:
 *   - sin denominador fiable no hay porcentaje, se dice «en curso»,
 *   - una guía de uso («acércate») no es un fallo,
 *   - una cancelación no es un error y conserva lo ya descargado,
 *   - la respuesta de un intento sustituido no vuelve a la superficie.
 */

/** Cuántos resultados terminales se conservan para el historial visible. */
export const ACTIVITY_HISTORY_LIMIT = 40;

/** Longitud máxima del texto de error que se muestra. */
const SAFE_ERROR_MAX = 160;

/**
 * Formas habituales en las que una credencial acaba dentro de un mensaje de
 * error. Se redacta el VALOR y se conserva el nombre del campo.
 */
const SECRET_KEYS =
  'authorization|proxy-authorization|x-api-key|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|passwd|pwd|secret|token';

const REDACTIONS = Object.freeze([
  // Clave entrecomillada con valor entrecomillado (JSON y objetos literales):
  // el valor puede llevar espacios, así que se consume hasta la comilla de
  // cierre, no hasta el primer espacio.
  [
    new RegExp(
      `(["'])(${SECRET_KEYS})\\1\\s*:\\s*(["'])(?:\\\\.|(?!\\3).)*\\3`,
      'gi',
    ),
    '"$2": "…"',
  ],
  // Clave sin comillas con valor entrecomillado: password="SENTINELA UNO".
  [
    new RegExp(
      `\\b(${SECRET_KEYS})\\b\\s*[:=]\\s*(["'])(?:\\\\.|(?!\\2).)*\\2`,
      'gi',
    ),
    '$1 "…"',
  ],
  [/\b(bearer|basic)\s+[\w.\-~+/=]+/gi, '$1 …'],
  // Valor sin comillas: se corta en el primer separador estructural.
  [
    new RegExp(
      `\\b(${SECRET_KEYS})\\b(?:\\s*[:=]\\s*|\\s+)["']?[^\\s"',;)\\]}]+["']?`,
      'gi',
    ),
    '$1 …',
  ],
]);

const TERMINAL_STATUSES = new Set([
  'ready',
  'partial',
  'error',
  'cancelled',
  'blocked',
]);
const STATUSES = new Set(['idle', 'loading', ...TERMINAL_STATUSES]);

/**
 * @param {unknown} value Valor crudo.
 * @returns {number|null} Número finito o null; un 0 legítimo se conserva.
 */
function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Texto de error apto para mostrar: sin pila, sin URL y sin query string.
 *
 * Un mensaje crudo de red puede llevar credenciales en la consulta; se recorta
 * antes de que llegue a ninguna superficie.
 * @param {unknown} error Error o texto.
 * @returns {string|null} Mensaje seguro, o null si no hay error.
 */
export function safeErrorText(error) {
  if (!error) return null;
  const raw =
    typeof error === 'string' ? error : error?.message || String(error);
  const firstLine = raw.split('\n')[0].trim();
  const withoutUrls = firstLine
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, '…')
    .replace(/\?\S*/g, '');
  // Un mensaje de proveedor puede traer la credencial dentro del texto, no sólo
  // en la URL. Se conserva el nombre del campo (ayuda a diagnosticar) y se
  // borra el valor, que es lo único que no puede salir de aquí.
  const redacted = REDACTIONS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    withoutUrls,
  );
  const collapsed = redacted.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;
  return collapsed.length > SAFE_ERROR_MAX
    ? `${collapsed.slice(0, SAFE_ERROR_MAX - 1)}…`
    : collapsed;
}

/**
 * Progreso dibujable de una tarea.
 *
 * Determinado SÓLO con total positivo finito, cargado finito dentro de
 * `[0, total]` y unidad declarada. Cualquier otra cosa es «en curso»: un
 * recuento de pendientes no es un porcentaje.
 * @param {object} task Tarea o parcial.
 * @returns {{mode:'determinate', value:number, max:number, unit:string}|{mode:'indeterminate'}} Progreso.
 */
export function activityProgress(task) {
  const total = finiteOrNull(task?.total);
  const loaded = finiteOrNull(task?.loaded);
  const unit = typeof task?.unit === 'string' ? task.unit.trim() : '';
  if (!unit) return { mode: 'indeterminate' };
  if (total === null || total <= 0) return { mode: 'indeterminate' };
  if (loaded === null || loaded < 0 || loaded > total)
    return { mode: 'indeterminate' };
  return { mode: 'determinate', value: loaded, max: total, unit };
}

/**
 * Normaliza una tarea de actividad. Sin `taskId` y `ownerKey` no hay tarea:
 * el modelo prefiere descartarla a guardar un trabajo sin dueño.
 * @param {object} task Tarea cruda.
 * @returns {Readonly<object>|null} Tarea normalizada.
 */
export function normalizeTask(task) {
  const taskId = task?.taskId ? String(task.taskId) : null;
  const ownerKey = task?.ownerKey ? String(task.ownerKey) : null;
  if (!taskId || !ownerKey) return null;
  const status = STATUSES.has(task?.status) ? task.status : 'idle';
  return Object.freeze({
    taskId,
    ownerKey,
    attempt: finiteOrNull(task?.attempt) ?? 1,
    status,
    label: task?.label ? String(task.label) : ownerKey,
    unit: task?.unit ? String(task.unit) : null,
    loaded: finiteOrNull(task?.loaded),
    total: finiteOrNull(task?.total),
    // Un estado que no es de fallo no arrastra texto de error.
    safeError:
      status === 'error' ? safeErrorText(task?.safeError ?? task?.error) : null,
    canRetry: task?.canRetry === true,
    canCancel: task?.canCancel === true,
    updatedAt: finiteOrNull(task?.updatedAt),
  });
}

/**
 * Traduce un registro de `normalizeLayerLoading` a tarea de actividad.
 *
 * Respeta la separación que ya hace `src/loadingFeedback.js`: guía de uso y
 * clave ausente son situaciones bloqueadas que la persona resuelve, no fallos
 * del feed que convenga reintentar.
 * @param {object} record Registro de carga de capa.
 * @param {object} [options] Reloj e intento.
 * @param {number} [options.now] Ahora en ms.
 * @param {number} [options.attempt] Número de intento.
 * @returns {Readonly<object>|null} Tarea normalizada.
 */
export function taskFromLayerLoading(
  record,
  { now = Date.now(), attempt = 1 } = {},
) {
  const id = record?.id ? String(record.id) : null;
  if (!id) return null;
  const ownerKey = `layer:${id}`;
  const blocked = record?.keyRequired === true || Boolean(record?.guidance);
  const error = record?.error ?? null;
  let status = 'idle';
  if (record?.loading === true) status = 'loading';
  else if (blocked) status = 'blocked';
  else if (error || record?.unavailable === true) status = 'error';
  else if (record?.degraded === true) status = 'partial';
  else if (record?.accepted === true || finiteOrNull(record?.count) > 0)
    status = 'ready';
  return normalizeTask({
    taskId: `${ownerKey}#${attempt}`,
    ownerKey,
    attempt,
    status,
    label: record?.label || id,
    unit: record?.unit ?? null,
    loaded: record?.loaded ?? null,
    total: record?.total ?? null,
    error,
    // Reintentar sólo tiene sentido cuando el feed falló o quedó a medias.
    canRetry: status === 'error' || status === 'partial',
    canCancel: false,
    updatedAt: now,
  });
}

/**
 * @returns {{tasks:Array, history:Array}} Estado inicial vacío.
 */
export function createActivityState() {
  return { tasks: [], history: [] };
}

/**
 * @param {object} a Tarea.
 * @param {object} b Tarea.
 * @returns {boolean} True si describen exactamente lo mismo.
 */
function sameTask(a, b) {
  if (!a || !b) return false;
  return (
    a.taskId === b.taskId &&
    a.status === b.status &&
    a.label === b.label &&
    a.unit === b.unit &&
    a.loaded === b.loaded &&
    a.total === b.total &&
    a.safeError === b.safeError &&
    a.canRetry === b.canRetry &&
    a.canCancel === b.canCancel &&
    a.updatedAt === b.updatedAt
  );
}

/**
 * Reduce un evento de actividad. Devuelve el MISMO estado cuando nada cambia,
 * para que la interfaz pueda descartar repintados por identidad.
 * @param {object} state Estado previo.
 * @param {object} event Evento: upsert | dismiss | reset.
 * @returns {object} Estado resultante.
 */
export function reduceActivity(state, event) {
  switch (event?.type) {
    case 'upsert': {
      const task = normalizeTask(event.task);
      if (!task) return state;
      const previous = state.tasks.find(
        (item) => item.ownerKey === task.ownerKey,
      );
      // Un intento sustituido ya no manda: su respuesta tardía se descarta.
      if (previous && task.attempt < previous.attempt) return state;
      if (sameTask(previous, task)) return state;
      const tasks = state.tasks.filter(
        (item) => item.ownerKey !== task.ownerKey,
      );
      // `idle` describe algo que NO está pasando: ni es trabajo en curso ni es
      // un resultado. Sale de la lista y no deja rastro en el historial.
      if (task.status === 'idle') return { tasks, history: state.history };
      if (!TERMINAL_STATUSES.has(task.status))
        return { tasks: [...tasks, task], history: state.history };
      // El mismo intento sólo ocupa una entrada: si su final vuelve a
      // publicarse se actualiza en su sitio en vez de duplicar la historia.
      const history = [
        task,
        ...state.history.filter((item) => item.taskId !== task.taskId),
      ].slice(0, ACTIVITY_HISTORY_LIMIT);
      return { tasks, history };
    }
    case 'dismiss': {
      const taskId = event.taskId ? String(event.taskId) : null;
      if (!taskId) return state;
      const tasks = state.tasks.filter((item) => item.taskId !== taskId);
      if (tasks.length === state.tasks.length) return state;
      // Descartar es dejar de mirar, no declarar un resultado que no ocurrió.
      return { tasks, history: state.history };
    }
    case 'reset':
      if (state.tasks.length === 0 && state.history.length === 0) return state;
      return createActivityState();
    default:
      return state;
  }
}

/**
 * Compuerta de reintento con un solo vuelo por identidad.
 *
 * `run` NO es async a propósito: devuelve exactamente la misma promesa mientras
 * ese key está en vuelo, de modo que un doble clic comparta un único intento.
 * @returns {{run:(key:string, fn:(context:{signal:AbortSignal}) => Promise<any>) => Promise<any>, destroy:() => void}} Compuerta.
 */
export function createRetryGate() {
  const inFlight = new Map();
  const controllers = new Set();
  let destroyed = false;

  return {
    run(key, fn) {
      if (destroyed || typeof fn !== 'function')
        return Promise.resolve(undefined);
      const identity = String(key);
      const existing = inFlight.get(identity);
      if (existing) return existing;

      const controller = new AbortController();
      controllers.add(controller);
      let promise;
      try {
        promise = fn({ signal: controller.signal });
      } catch (error) {
        controllers.delete(controller);
        return Promise.reject(error);
      }
      if (!promise || typeof promise.then !== 'function') {
        controllers.delete(controller);
        return Promise.resolve(promise);
      }
      // Un resultado que llega tras destroy pertenece a una sesión que ya no
      // existe: se descarta en vez de reaparecer en una superficie desmontada.
      const guarded = promise.then(
        (value) => (controller.signal.aborted ? undefined : value),
        (error) => {
          if (controller.signal.aborted) return undefined;
          throw error;
        },
      );
      const settle = () => {
        controllers.delete(controller);
        if (inFlight.get(identity) === guarded) inFlight.delete(identity);
      };
      guarded.then(settle, settle);
      inFlight.set(identity, guarded);
      return guarded;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      inFlight.clear();
    },
  };
}
