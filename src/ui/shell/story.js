/**
 * Titular de entrada `.eye-story` (fase visual T3, DESIGN-SYSTEM §6.3).
 *
 * Honestidad: «ahora» solo describe el reloj de escena y solo cuando está en
 * vivo y sincronizado (deriva < 5 s). En simulación o en pausa el titular
 * nombra la fecha simulada. La línea de apoyo dice de dónde salen el día, la
 * noche y las luces (VIIRS, compuesto con su año, no en vivo); con la luz
 * solar apagada no promete ninguna de las dos cosas.
 *
 * Con objetivo fijado el titular ES el objetivo (el kicker y el título salen
 * del dock). Todo el texto entra por `textContent`.
 */
import { NIGHT_LIGHTS } from '../../maps/nightLights.js';

/** Deriva máxima para llamar «ahora» al reloj (igual que la tira TIEMPO). */
const LIVE_MAX_DRIFT_MS = 5_000;
const MONTHS = Object.freeze(
  'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(
    ' ',
  ),
);

const isLiveClock = (clock) =>
  clock?.mode === 'live' &&
  Math.abs(Number(clock?.driftMs) || 0) < LIVE_MAX_DRIFT_MS;

/** «el 14 de marzo de 2027.» a partir de un ISO UTC. */
function longDate(iso) {
  const [year, month, day] = String(iso || '')
    .slice(0, 10)
    .split('-')
    .map(Number);
  if (!year || !month || !day) return 'en otra fecha.';
  return `el ${day} de ${MONTHS[month - 1]} de ${year}.`;
}

function clockKicker(clock, lighting) {
  if (isLiveClock(clock))
    return lighting
      ? 'Tierra · luz solar de este instante'
      : 'Tierra · vista global';
  const date = String(clock?.currentIso || '').slice(0, 10);
  const mode = clock?.mode === 'paused' ? 'en pausa' : 'simulación';
  return lighting
    ? `Tierra · luz solar del ${date} UTC · ${mode}`
    : `Tierra · ${date} UTC · ${mode}`;
}

function lede(lighting, nightLights) {
  if (!lighting)
    return 'Mapa base sin día ni noche: la luz solar está apagada en esta vista.';
  const sun =
    'Día y noche según la posición real del Sol a la hora del reloj de escena.';
  return nightLights
    ? `${sun} Luces de ciudades: NASA VIIRS ${NIGHT_LIGHTS.year}, compuesto anual, no en vivo.`
    : sun;
}

/**
 * @param {{clock?: object, flags?: {lighting?: string, nightLights?: string},
 *   target?: {title?: string, kicker?: string}|null}} input
 * @returns {Readonly<{mode: string, kicker: string, lines: string[],
 *   lede: string|null, announcement: string}>}
 */
export function resolveStory({ clock = null, flags = {}, target = null } = {}) {
  if (target?.title)
    return Object.freeze({
      mode: 'target',
      kicker: String(target.kicker || 'Objetivo'),
      lines: Object.freeze([String(target.title)]),
      lede: null,
      announcement: `Objetivo: ${target.title}`,
    });
  const lighting = flags?.lighting === '1';
  const lines = Object.freeze([
    'El planeta,',
    isLiveClock(clock) ? 'ahora.' : longDate(clock?.currentIso),
  ]);
  return Object.freeze({
    mode: 'headline',
    kicker: clockKicker(clock, lighting),
    lines,
    lede: lede(lighting, flags?.nightLights === '1'),
    announcement: lines.join(' '),
  });
}

function element(doc, tag, className, text = '') {
  const node = doc.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Nodos del titular: kicker con punto, título serif (2.ª línea en itálica), lede. */
function storyNodes(doc, story) {
  const kicker = element(doc, 'p', 'eye-story-kicker');
  const dot = element(doc, 'span', 'eye-story-dot');
  dot.setAttribute('aria-hidden', 'true');
  kicker.append(
    dot,
    element(doc, 'span', 'eye-story-kicker-text', story.kicker),
  );
  const title = element(doc, 'h1', 'eye-story-title');
  story.lines.forEach((line, index) => {
    if (index > 0) title.append(doc.createElement('br'));
    title.append(
      index > 0
        ? element(doc, 'em', 'eye-story-em', line)
        : element(doc, 'span', 'eye-story-line', line),
    );
  });
  const nodes = [kicker, title];
  if (story.lede) nodes.push(element(doc, 'p', 'eye-story-lede', story.lede));
  return nodes;
}

/**
 * @param {{host: HTMLElement, getClock: () => object, flags?: object}} options
 * @returns {{render: () => void, setTarget: (t: object|null) => void,
 *   getStory: () => object, destroy: () => void}}
 */
export function mountEyeStory({ host, getClock = () => null, flags = {} }) {
  const doc = host.ownerDocument;
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'true');
  let target = null;
  let signature = '';
  let current = null;
  const render = () => {
    const story = resolveStory({ clock: getClock(), flags, target });
    const next = JSON.stringify([story.kicker, story.lines, story.lede]);
    if (next === signature) return;
    signature = next;
    current = story;
    host.dataset.mode = story.mode;
    host.replaceChildren(...storyNodes(doc, story));
  };
  render();
  return {
    render,
    setTarget(value) {
      target = value?.title
        ? { title: value.title, kicker: value.kicker }
        : null;
      render();
    },
    getStory: () => current,
    destroy() {
      host.replaceChildren();
      delete host.dataset.mode;
    },
  };
}
