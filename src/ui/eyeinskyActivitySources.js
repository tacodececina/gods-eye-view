/**
 * Adaptadores de actividad real (EYEINSKY P3).
 *
 * Traducen a tareas el trabajo que YA hacen el manager de capas, el controlador
 * de mapas y la geometría de CCTV. Reglas que se respetan aquí:
 *   - observar no arranca trabajo: al montar se LEE la instantánea (las
 *     suscripciones del manager no la entregan) y después sólo se escucha,
 *   - no se parchea `fetch` global ni se tocan propiedades privadas ajenas,
 *   - el reintento es `refreshLayer` acotado a identidad e intento; lo que no
 *     admite reintento responde `false` en vez de simular uno,
 *   - no se ofrece cancelar sin una señal propia real.
 */
import { normalizeLayerLoading } from '../loadingFeedback.js';
import {
  createRetryGate,
  taskFromLayerLoading,
  normalizeTask,
} from './eyeinskyActivityModel.js';

const MAP_STACK_CHANGED = 'gev:map-stack-changed';

/**
 * @param {object} options Colaboradores existentes; todos opcionales.
 * @param {object} [options.dataManager] Manager de capas.
 * @param {object} [options.mapStackController] Controlador de mapas.
 * @param {object} [options.cctv] Controlador CCTV con `subscribe`.
 * @param {(event:{type:'upsert', task:object}) => void} options.onEvent Receptor.
 * @returns {{retry:(taskId:string) => (Promise<any>|false), cancel:(taskId:string) => boolean, destroy:() => void}} Conector.
 */
export function connectActivitySources({
  dataManager = null,
  mapStackController = null,
  cctv = null,
  onEvent,
} = {}) {
  const host = typeof window !== 'undefined' ? window : null;
  const disposers = [];
  const gate = createRetryGate();
  /** Intento vigente por dueño: un reintento no reescribe el intento anterior. */
  const attempts = new Map();
  /** Última tarea publicada por dueño, para resolver retry/cancel por taskId. */
  const published = new Map();
  /** Dueños con un reintento realmente en vuelo: un vuelo, un intento. */
  const flying = new Set();
  let destroyed = false;
  let seededLayers = false;
  let seededMapStack = false;

  const publish = (task) => {
    if (destroyed || !task || typeof onEvent !== 'function') return;
    published.set(task.taskId, task);
    onEvent({ type: 'upsert', task });
  };

  const attemptOf = (ownerKey) => attempts.get(ownerKey) ?? 1;

  const publishLayers = () => {
    if (destroyed || typeof dataManager?.getAll !== 'function') return;
    const initial = !seededLayers;
    seededLayers = true;
    for (const layer of dataManager.getAll()) {
      // Una capa apagada no está haciendo nada: contarla como trabajo fue lo
      // que producía «22 en curso» con 21 capas quietas.
      if (layer?.enabled === false) continue;
      const record = normalizeLayerLoading(layer);
      const task = taskFromLayerLoading(
        { ...record, guidance: record.guidance ?? null },
        { attempt: attemptOf(`layer:${record.id}`) },
      );
      if (!task || task.status === 'idle') continue;
      // Montar el observador no es un suceso: la primera lectura sólo declara
      // el trabajo realmente en curso, nunca resultados que ya habían pasado.
      if (initial && task.status !== 'loading') continue;
      publish(task);
    }
  };

  const publishMapStack = (emittedState = null) => {
    if (destroyed || typeof mapStackController?.getState !== 'function') return;
    let state = null;
    try {
      // MapStackController emite la instantánea terminal antes de limpiar su
      // bandera interna `_isSwitching`. Durante ese callback, volver a llamar
      // getState() todavía responde `switching`; el detalle público del evento
      // es la autoridad para esa transición.
      state = ['ready', 'switching', 'error'].includes(emittedState?.status)
        ? emittedState
        : mapStackController.getState();
    } catch {
      return; // un controlador que no puede describirse no se inventa
    }
    if (!state) return;
    const ownerKey = 'map:stack';
    // Contrato real de src/maps/controller.js:getState(): `status` es
    // 'ready' | 'switching' | 'error'. Leer un booleano `ready` inexistente
    // dejaba «Mapa base · En curso» encendido para siempre.
    const status =
      state.status === 'switching'
        ? 'loading'
        : state.status === 'error'
          ? 'error'
          : 'ready';
    // Un mapa ya listo al arrancar no es un suceso: no es trabajo ni historia.
    if (status === 'ready' && !seededMapStack) {
      seededMapStack = true;
      return;
    }
    seededMapStack = true;
    const label = state.activeStack?.label || state.activeId || null;
    publish(
      normalizeTask({
        taskId: `${ownerKey}#${attemptOf(ownerKey)}`,
        ownerKey,
        attempt: attemptOf(ownerKey),
        // `ready` describe la configuración aceptada, NO que las teselas estén
        // en pantalla: por eso nunca se publica denominador.
        status,
        label: label ? `Mapa · ${label}` : 'Mapa base',
        unit: null,
        loaded: null,
        total: null,
        error: state.lastError ?? null,
        canRetry: false,
        canCancel: false,
        updatedAt: Date.now(),
      }),
    );
  };

  // ─── Capas ───
  publishLayers();
  if (typeof dataManager?.subscribeActivity === 'function') {
    const unsubscribe = dataManager.subscribeActivity(() => publishLayers());
    if (typeof unsubscribe === 'function') disposers.push(unsubscribe);
  }
  if (typeof dataManager?.subscribe === 'function') {
    const unsubscribe = dataManager.subscribe((event) => {
      if (event?.type === 'visibility' || event?.type === 'visibility-failed')
        publishLayers();
    });
    if (typeof unsubscribe === 'function') disposers.push(unsubscribe);
  }

  // ─── Mapa base ───
  publishMapStack();
  if (host?.addEventListener) {
    const onStackChanged = (event) => publishMapStack(event?.detail);
    host.addEventListener(MAP_STACK_CHANGED, onStackChanged);
    disposers.push(() =>
      host.removeEventListener(MAP_STACK_CHANGED, onStackChanged),
    );
  }

  // ─── Geometría de CCTV (no el vídeo: ese trabajo no es de esta cápsula) ───
  if (typeof cctv?.subscribe === 'function') {
    const unsubscribe = cctv.subscribe((snapshot) => {
      // Geometría: `loading.{active,loaded,total}` es un progreso real con
      // denominador declarado por el propio controlador.
      const loading = snapshot?.loading;
      const loaded = Number(loading?.loaded);
      const total = Number(loading?.total);
      if (Number.isFinite(total) && total > 0) {
        const ownerKey = 'cctv:geometry';
        publish(
          normalizeTask({
            taskId: `${ownerKey}#${attemptOf(ownerKey)}`,
            ownerKey,
            attempt: attemptOf(ownerKey),
            status:
              loading?.active === true && loaded < total ? 'loading' : 'ready',
            label: 'Cámaras · geometría',
            unit: 'cameras-geometry',
            loaded,
            total,
            canRetry: false,
            canCancel: false,
            updatedAt: Date.now(),
          }),
        );
      }
      // Fotogramas: OTRO trabajo. `fetchesInFlight` dice cuántas descargas hay
      // ahora mismo; no hay denominador publicado, así que no hay porcentaje y
      // la geometría no se usa para afirmar que hay imagen disponible.
      const inFlight = Number(snapshot?.ambientCards?.fetchesInFlight);
      if (Number.isFinite(inFlight)) {
        const ownerKey = 'cctv:frames';
        publish(
          normalizeTask({
            taskId: `${ownerKey}#${attemptOf(ownerKey)}`,
            ownerKey,
            attempt: attemptOf(ownerKey),
            status: inFlight > 0 ? 'loading' : 'idle',
            label: 'Cámaras · fotogramas',
            unit: null,
            loaded: null,
            total: null,
            canRetry: false,
            canCancel: false,
            updatedAt: Date.now(),
          }),
        );
      }
    });
    if (typeof unsubscribe === 'function') disposers.push(unsubscribe);
  }

  return {
    /**
     * Reintenta el trabajo de una tarea, si su dueño admite reintento.
     * @param {string} taskId Identidad del intento mostrado.
     * @returns {Promise<any>|false} Promesa compartida, o false si no aplica.
     */
    retry(taskId) {
      if (destroyed) return false;
      const task = published.get(String(taskId));
      if (!task || !task.canRetry) return false;
      if (!task.ownerKey.startsWith('layer:')) return false;
      if (typeof dataManager?.refreshLayer !== 'function') return false;
      const layerId = task.ownerKey.slice('layer:'.length);
      // Un vuelo ya en curso se comparte tal cual: el segundo y el tercer clic
      // no numeran intentos nuevos ni republican nada. Sin esto, la compuerta
      // devolvía una sola promesa pero la superficie mostraba #2 y #3.
      if (flying.has(task.ownerKey))
        return gate.run(task.ownerKey, ({ signal }) =>
          Promise.resolve(dataManager.refreshLayer(layerId, { signal })),
        );
      // El intento anterior queda sustituido: el modelo descarta su respuesta.
      attempts.set(task.ownerKey, attemptOf(task.ownerKey) + 1);
      flying.add(task.ownerKey);
      const promise = gate.run(task.ownerKey, ({ signal }) =>
        Promise.resolve(dataManager.refreshLayer(layerId, { signal })),
      );
      const release = () => flying.delete(task.ownerKey);
      promise.then(release, release);
      publishLayers();
      return promise;
    },
    /**
     * @param {string} taskId Identidad del intento mostrado.
     * @returns {boolean} False mientras ninguna tarea tenga señal propia.
     */
    cancel(taskId) {
      if (destroyed) return false;
      const task = published.get(String(taskId));
      // Sin una señal propia que abortar, ofrecer «cancelar» sería mentir.
      return task?.canCancel === true ? false : false;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      gate.destroy();
      published.clear();
      for (const dispose of disposers.splice(0)) {
        try {
          dispose();
        } catch {
          /* un desmontaje parcial no debe impedir el resto */
        }
      }
    },
  };
}
