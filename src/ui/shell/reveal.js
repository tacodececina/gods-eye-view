/**
 * Revelación de la fase visual (T3): un único estado de presentación decide
 * qué se ve. «Un momento, un mensaje»: al entrar, el globo y un titular
 * (`rest`: barra, titular y tira; V-01); la primera interacción retira el
 * titular y REVELA cámara, telemetría y capas (`explore`; V-02); fijar un
 * objetivo despliega el panel contextual y el titular pasa a ser el objetivo
 * (`target`). Soltarlo vuelve a `explore`, nunca al reposo inicial.
 *
 * Publica en `body`:
 *   - `data-eye-reveal`  rest | explore | target
 *   - `data-eye-target`  0 | 1
 *   - `data-eye-intro`   running | done (lo marca la entrada de cámara)
 *   - `data-eye-story`   headline | hidden | target
 *   - `data-eye-motion`  fade | none (movimiento reducido: sin animación)
 * El CSS lee esos atributos; nadie más escribe en ellos.
 */

/**
 * Eventos que cuentan como primera interacción: rueda, arrastre, tecla, foco
 * y clic (también la activación sin puntero de un control).
 */
export const FIRST_INTERACTION_EVENTS = Object.freeze([
  'wheel',
  'pointerdown',
  'keydown',
  'focusin',
  'click',
]);

/** Una tecla modificadora sola no es una intención. */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph']);

/**
 * Estado de presentación. Puro, congelado y sin lanzar con valores ajenos.
 * @param {{target?: boolean, intro?: string, interaction?: boolean,
 *   reducedMotion?: boolean}} [input]
 * @returns {Readonly<{reveal: string, target: string, intro: string,
 *   story: string, motion: string}>}
 */
export function nextRevealState({
  target = false,
  intro = 'done',
  interaction = false,
  reducedMotion = false,
} = {}) {
  const hasTarget = target === true;
  const explored = interaction === true;
  let story = 'headline';
  if (hasTarget) story = 'target';
  else if (explored) story = 'hidden';
  let reveal = 'rest';
  if (hasTarget) reveal = 'target';
  else if (explored) reveal = 'explore';
  return Object.freeze({
    reveal,
    target: hasTarget ? '1' : '0',
    intro: intro === 'running' ? 'running' : 'done',
    story,
    motion: reducedMotion === true ? 'none' : 'fade',
  });
}

const DATASET_KEYS = Object.freeze({
  reveal: 'eyeReveal',
  target: 'eyeTarget',
  intro: 'eyeIntro',
  story: 'eyeStory',
  motion: 'eyeMotion',
});

/** Publicador del estado en `body` (solo escribe si algo cambió). */
function createPublisher({ doc, input, reducedMotion, onChange }) {
  let state = null;
  const publish = () => {
    const next = nextRevealState({ ...input, reducedMotion: reducedMotion() });
    if (state && Object.keys(next).every((key) => next[key] === state[key]))
      return;
    state = next;
    for (const [key, name] of Object.entries(DATASET_KEYS))
      doc.body.dataset[name] = state[key];
    onChange?.(state);
  };
  return { publish, getState: () => state };
}

/**
 * @param {{doc?: Document, reducedMotion?: () => boolean,
 *   onChange?: (state: object) => void}} options
 * @returns {{setTarget: (on: boolean) => void, setIntro: (s: string) => void,
 *   interact: () => void, getState: () => object, destroy: () => void}}
 */
export function mountEyeReveal({
  doc = globalThis.document,
  reducedMotion = () => false,
  onChange,
} = {}) {
  const input = {
    target: false,
    intro: doc.body.dataset.eyeIntro === 'running' ? 'running' : 'done',
    interaction: false,
  };
  const { publish, getState } = createPublisher({
    doc,
    input,
    reducedMotion,
    onChange,
  });
  const options = { capture: true, passive: true };
  const stopListening = () => {
    for (const type of FIRST_INTERACTION_EVENTS)
      doc.removeEventListener(type, onInteraction, options);
  };
  function onInteraction(event) {
    if (event?.type === 'keydown' && MODIFIER_KEYS.has(event.key)) return;
    stopListening();
    input.interaction = true;
    publish();
  }
  for (const type of FIRST_INTERACTION_EVENTS)
    doc.addEventListener(type, onInteraction, options);
  publish();
  return {
    setTarget(on) {
      input.target = on === true;
      // Fijar un objetivo ya es una intención: al soltarlo se explora.
      if (input.target) onInteraction({ type: 'target' });
      else publish();
    },
    setIntro(value) {
      input.intro = value === 'running' ? 'running' : 'done';
      publish();
    },
    interact: () => onInteraction({ type: 'api' }),
    getState,
    destroy() {
      stopListening();
      for (const name of Object.values(DATASET_KEYS))
        delete doc.body.dataset[name];
    },
  };
}
