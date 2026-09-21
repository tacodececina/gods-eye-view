/**
 * Medios del expediente (EYEINSKY P3).
 *
 * Una imagen sólo se pinta si su permiso es verificable AQUÍ y ahora: ruta
 * local del propio sitio, entrada presente en el manifiesto curado y ficha de
 * procedencia completa (autor, crédito, licencia, página de origen y hash
 * medido). Sin eso no hay foto: el expediente se queda en texto, que sigue
 * siendo información real.
 *
 * El carrusel es MANUAL por defecto. La reproducción automática es opt-in y se
 * desactiva sola con `prefers-reduced-motion`, al perder el foco o al quedar la
 * superficie oculta. Nunca bloquea los datos: una imagen rota o una red caída
 * dejan la ficha intacta.
 */
import {
  EYE_MEDIA_MANIFEST,
  mediaById,
  mediaForContext,
} from './eyeinskyMediaManifest.js';

/** Cadencia de la reproducción opt-in. */
const AUTOPLAY_INTERVAL_MS = 7000;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** Campos que deben coincidir carácter a carácter con el manifiesto medido. */
const VERIFIED_FIELDS = Object.freeze([
  'src',
  'sha256',
  'title',
  'author',
  'credit',
  'license',
  'licenseUrl',
  'sourceUrl',
  'alt',
  'contextKey',
  'fidelity',
  'archive',
  'permissionScope',
]);

/**
 * @param {unknown} value URL candidata.
 * @returns {boolean} True si es HTTPS absoluta.
 */
function isHttpsUrl(value) {
  return typeof value === 'string' && /^https:\/\/[^\s/]+\//i.test(value);
}

/**
 * ¿La ruta es un archivo local de este sitio?
 *
 * Se exige una ruta absoluta simple: nada de esquemas (`javascript:`, `data:`),
 * nada de `//host` y nada de subir de directorio.
 * @param {unknown} src Ruta candidata.
 * @returns {boolean} True si es local y segura.
 */
function isLocalAssetPath(src) {
  if (typeof src !== 'string' || src.length === 0) return false;
  if (!src.startsWith('/')) return false;
  if (src.startsWith('//')) return false;
  if (src.includes('..')) return false;
  if (/[a-z][a-z0-9+.-]*:/i.test(src)) return false;
  return src.startsWith('/eyeinsky/media/');
}

/**
 * ¿Puede mostrarse este activo?
 *
 * Comprueba forma Y pertenencia: un objeto que imita los campos pero no está en
 * el manifiesto medido no se admite, porque su hash no lo verificó nadie.
 * @param {object} asset Activo candidato.
 * @returns {boolean} True si el permiso es verificable.
 */
export function isMediaAllowed(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (!isLocalAssetPath(asset.src)) return false;
  const required = [
    'id',
    'credit',
    'author',
    'license',
    'licenseUrl',
    'sourceUrl',
    'alt',
    'contextKey',
  ];
  for (const field of required) {
    const value = asset[field];
    if (typeof value !== 'string' || value.trim().length === 0) return false;
  }
  if (typeof asset.sha256 !== 'string' || !SHA256_PATTERN.test(asset.sha256))
    return false;
  // Los enlaces que se muestran junto a la foto tienen que ser HTTPS: un
  // crédito o una licencia son afirmaciones públicas, y se van a pulsar.
  if (!isHttpsUrl(asset.sourceUrl) || !isHttpsUrl(asset.licenseUrl))
    return false;
  // Pertenencia al manifiesto. No basta con ruta y hash: crédito, autoría,
  // licencia, origen, descripción y contexto son exactamente las afirmaciones
  // que el permiso respalda, así que cualquiera alterada invalida el activo.
  const known = mediaById(asset.id);
  if (!known) return false;
  return VERIFIED_FIELDS.every((field) => known[field] === asset[field]);
}

/**
 * Activos admitidos para una identidad de contexto.
 * @param {string} contextKey Identidad del expediente.
 * @returns {Array<Readonly<object>>} Activos admitidos.
 */
export function resolveContextMedia(contextKey) {
  if (!contextKey) return [];
  return mediaForContext(contextKey).filter((asset) => isMediaAllowed(asset));
}

/**
 * Línea de crédito visible. Nombra autor y permiso reales y declara que la
 * fotografía es de archivo, para que nadie la lea como observación en vivo.
 * @param {object} asset Activo admitido.
 * @returns {string} Texto del crédito.
 */
export function creditLine(asset) {
  if (!asset) return '';
  const archive = asset.archive ? 'Fotografía de archivo' : 'Fotografía';
  return `${archive} · ${asset.credit} · ${asset.license}`;
}

/**
 * Monta el carrusel de medios dentro de un contenedor del expediente.
 *
 * @param {object} options Montaje.
 * @param {HTMLElement} options.host Contenedor propio del carrusel.
 * @param {(contextKey:string) => Array<object>} [options.resolveAsset] Resolutor.
 * @param {() => boolean} [options.reducedMotion] Preferencia de movimiento.
 * @param {AbortSignal} [options.signal] Señal de desmontaje.
 * @returns {{setContext:(event:object) => void, pause:() => void, destroy:() => void}} Control.
 */
export function mountEyeMedia({
  host,
  resolveAsset = resolveContextMedia,
  reducedMotion = () =>
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches,
  signal,
} = {}) {
  if (!host) throw new TypeError('mountEyeMedia requiere un host');
  const doc = host.ownerDocument;
  let assets = [];
  let index = 0;
  let currentKey = null;
  let currentGeneration = -1;
  let autoplay = false;
  /** La persona pidió reproducir. Distinto de que el temporizador corra. */
  let playRequested = false;
  /** Razones vivas que pausan el temporizador sin desarmar la solicitud. */
  const blockers = new Set();
  let timer = null;
  let destroyed = false;
  let renderToken = 0;
  /** Todo lo que hay que soltar al destruir: nada queda escuchando. */
  const releases = [];

  const figure = doc.createElement('figure');
  figure.className = 'eye-media';
  figure.hidden = true;
  const frame = doc.createElement('div');
  frame.className = 'eye-media-frame';
  // Se reemplaza en cada render: cada solicitud estrena su propio elemento.
  let image = doc.createElement('img');
  image.className = 'eye-media-image';
  image.decoding = 'async';
  image.loading = 'lazy';
  frame.append(image);
  const caption = doc.createElement('figcaption');
  caption.className = 'eye-media-caption';
  const credit = doc.createElement('a');
  credit.className = 'eye-media-credit';
  credit.target = '_blank';
  credit.rel = 'noopener noreferrer';
  const controls = doc.createElement('div');
  controls.className = 'eye-media-controls';
  const previous = doc.createElement('button');
  previous.type = 'button';
  previous.className = 'eye-media-step';
  previous.textContent = '‹';
  previous.dataset.eyeMediaStep = 'previous';
  previous.setAttribute('aria-label', 'Imagen anterior');
  const position = doc.createElement('span');
  position.className = 'eye-media-position';
  const following = doc.createElement('button');
  following.type = 'button';
  following.className = 'eye-media-step';
  following.textContent = '›';
  following.dataset.eyeMediaStep = 'next';
  following.setAttribute('aria-label', 'Imagen siguiente');
  const play = doc.createElement('button');
  play.type = 'button';
  play.className = 'eye-media-play';
  controls.append(previous, position, following, play);
  figure.append(frame, caption, credit, controls);
  host.append(figure);

  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  /**
   * Razones por las que la reproducción NO debe correr aunque se haya pedido:
   * puntero encima, foco dentro, pestaña oculta o movimiento reducido. Separar
   * «solicitada» de «corriendo» es lo que evita que un clic arranque el
   * temporizador mientras el dedo sigue sobre la foto.
   * @returns {boolean} True si algo impide reproducir ahora.
   */
  const isBlocked = () =>
    blockers.size > 0 || doc.hidden === true || reducedMotion();

  /** Arranca o detiene el temporizador según solicitud y bloqueos. */
  const syncTimer = () => {
    const shouldRun = playRequested && !isBlocked() && assets.length > 1;
    if (shouldRun && timer === null)
      timer = setInterval(() => step(1), AUTOPLAY_INTERVAL_MS);
    else if (!shouldRun) stopTimer();
    autoplay = timer !== null;
  };

  const setBlocker = (reason, active) => {
    if (active) blockers.add(reason);
    else blockers.delete(reason);
    syncTimer();
    syncPlayButton();
  };

  const syncPlayButton = () => {
    // El botón refleja la SOLICITUD, que es lo que la persona controla; el
    // temporizador puede estar pausado por interacción sin desarmarla.
    play.textContent = playRequested ? 'Pausar' : 'Reproducir';
    play.setAttribute('aria-pressed', String(playRequested));
    // Con una sola imagen no hay nada que reproducir: el control desaparece en
    // vez de quedarse como un botón que no hace nada.
    play.hidden = assets.length < 2;
    previous.hidden = assets.length < 2;
    following.hidden = assets.length < 2;
    position.hidden = assets.length < 2;
  };

  const render = () => {
    const asset = assets[index];
    // Cada pintura estrena su propio <img> con listeners cerrados sobre ESA
    // solicitud. Con un único elemento compartido, el `error` tardío de la
    // imagen anterior llegaba con el token ya actualizado y marcaba como no
    // disponible una foto distinta.
    renderToken += 1;
    const token = renderToken;
    const previousImage = image;
    image = doc.createElement('img');
    image.className = 'eye-media-image';
    image.decoding = 'async';
    image.loading = 'lazy';
    image.dataset.renderToken = String(token);
    image.addEventListener('error', () => {
      if (token !== renderToken) return; // solicitud ya sustituida
      stopTimer();
      playRequested = false;
      autoplay = false;
      frame.hidden = true;
      caption.textContent = 'Fotografía no disponible';
      credit.hidden = true;
      controls.hidden = true;
      figure.hidden = false;
      figure.dataset.mediaState = 'unavailable';
    });
    image.addEventListener('load', () => {
      if (token !== renderToken) return;
      figure.dataset.mediaState = 'ready';
    });
    // El anterior se neutraliza: sin src no vuelve a disparar nada.
    previousImage.removeAttribute('src');
    previousImage.replaceWith(image);
    if (!asset) {
      figure.hidden = true;
      image.removeAttribute('src');
      return;
    }
    frame.hidden = false;
    credit.hidden = false;
    controls.hidden = false;
    figure.dataset.mediaState = 'loading';
    figure.hidden = false;
    // Reserva de proporción: la ficha no salta cuando la imagen llega.
    if (asset.width && asset.height)
      frame.style.aspectRatio = `${asset.width} / ${asset.height}`;
    image.src = asset.src;
    image.alt = asset.alt;
    image.width = asset.width || 0;
    image.height = asset.height || 0;
    caption.textContent = asset.title;
    credit.textContent = creditLine(asset);
    credit.href = asset.sourceUrl;
    position.textContent = `${index + 1}/${assets.length}`;
    syncPlayButton();
    // Precarga SÓLO la siguiente: ni toda la colección ni ninguna.
    const upcoming = assets[(index + 1) % assets.length];
    if (upcoming && upcoming !== asset) {
      const preload = new Image();
      preload.decoding = 'async';
      preload.src = upcoming.src;
    }
  };

  function step(delta) {
    if (assets.length === 0) return;
    index = (index + delta + assets.length) % assets.length;
    render();
  }

  // Avanzar a mano desarma la reproducción: la persona tomó el control.
  previous.addEventListener('click', () => {
    playRequested = false;
    syncTimer();
    step(-1);
    syncPlayButton();
  });
  following.addEventListener('click', () => {
    playRequested = false;
    syncTimer();
    step(1);
    syncPlayButton();
  });
  play.addEventListener('click', () => {
    // El botón sólo arma o desarma la SOLICITUD; correr o no lo decide
    // `syncTimer` según los bloqueos vigentes.
    playRequested = !playRequested;
    syncTimer();
    syncPlayButton();
  });

  const control = {
    /**
     * Declara el contexto vigente. Una respuesta de otra identidad o de una
     * generación anterior se descarta sin tocar nada.
     * @param {{key:string, generation:number}} event Contexto.
     * @returns {void}
     */
    setContext(event) {
      if (destroyed) return;
      const key = event?.key ?? null;
      const generation = Number(event?.generation);
      if (!Number.isFinite(generation)) return;
      if (key === currentKey && generation === currentGeneration) return;
      if (generation < currentGeneration) return;
      currentKey = key;
      currentGeneration = generation;
      playRequested = false;
      stopTimer();
      autoplay = false;
      assets = key ? resolveAsset(key) : [];
      index = 0;
      render();
      syncPlayButton();
    },
    pause() {
      playRequested = false;
      stopTimer();
      autoplay = false;
      syncPlayButton();
    },
    /** Describe el TEMPORIZADOR real, no la intención. */
    isPlaying: () => timer !== null,
    /** Lectura de la solicitud; la usa el arnés para distinguir ambas cosas. */
    isPlayRequested: () => playRequested,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // Destruido no puede seguir declarándose «en reproducción»: el
      // temporizador se detiene y la solicitud se desarma.
      autoplay = false;
      playRequested = false;
      stopTimer();
      for (const release of releases.splice(0)) {
        try {
          release();
        } catch {
          /* un desmontaje parcial no debe impedir el resto */
        }
      }
      figure.remove();
    },
  };

  // ─── Pausas reales: mientras haya interacción el temporizador no corre ───
  const listen = (target, type, handler) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler);
    releases.push(() => target.removeEventListener(type, handler));
  };
  listen(doc, 'visibilitychange', () =>
    setBlocker('hidden', doc.hidden === true),
  );
  listen(doc.defaultView, 'blur', () => setBlocker('window-blur', true));
  listen(doc.defaultView, 'focus', () => setBlocker('window-blur', false));
  listen(figure, 'pointerenter', () => setBlocker('pointer', true));
  listen(figure, 'pointerleave', () => setBlocker('pointer', false));
  listen(figure, 'focusin', () => setBlocker('focus', true));
  listen(figure, 'focusout', () => setBlocker('focus', false));
  // Activar «reducir movimiento» en caliente también detiene lo que ya rodaba.
  if (typeof doc.defaultView?.matchMedia === 'function') {
    const query = doc.defaultView.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    const onChange = () => setBlocker('reduced-motion', reducedMotion());
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      releases.push(() => query.removeEventListener('change', onChange));
    }
  }

  signal?.addEventListener('abort', () => control.destroy(), { once: true });
  syncPlayButton();
  return control;
}

/** Activos del manifiesto, para superficies que sólo quieren enumerarlos. */
export { EYE_MEDIA_MANIFEST };
