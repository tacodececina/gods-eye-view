/**
 * Tira TIEMPO del Mission Dock (P5 T8): pinta `resolveTimeStrip` y delega
 * cada orden en `onCommand`. No toca el reloj: eso es de eyeinskyEarthMoon.
 *
 * Accesibilidad: el cambio de MODO (vivo / simulación ×N / pausa y motivo) se
 * anuncia en una región `aria-live="polite"` que no cambia con cada segundo;
 * los botones llevan su motivo en el nombre accesible; el error del campo de
 * fecha es un `alert` visible. Todo el texto entra por `textContent`.
 */
import { utcDateFieldValue } from './eyeinskyMissionDockModel.js';

const FIELD_MIN = '1900-01-01T00:00';
const FIELD_MAX = '2100-12-31T23:59';

function node(doc, tag, className = '', text = '') {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function commandButton(doc, command) {
  const button = node(doc, 'button', 'eye-time-button');
  button.type = 'button';
  button.dataset.eyeTimeCmd = command;
  return button;
}

/** Lectura visible (icono, modo, detalle) y región viva del anuncio. */
function buildReadout(doc) {
  const readout = node(doc, 'p', 'eye-time-readout');
  readout.dataset.eyeTimeText = '';
  const icon = node(doc, 'span', 'eye-time-icon');
  icon.setAttribute('aria-hidden', 'true');
  const label = node(doc, 'b', 'eye-time-label');
  const detail = node(doc, 'span', 'eye-time-detail');
  readout.append(icon, ' ', label, ' ', detail);
  const live = node(doc, 'span', 'eye-visually-hidden');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  live.dataset.eyeTimeAnnounce = '';
  return { readout, icon, label, detail, live };
}

/** Campo de fecha UTC con su botón IR (y el conmutador FECHA compacto). */
function buildSeek(doc) {
  const toggle = node(doc, 'button', 'eye-time-button', 'FECHA');
  toggle.type = 'button';
  toggle.dataset.eyeTimeToggle = 'date';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'eye-time-seek');
  const form = node(doc, 'form', 'eye-time-seek');
  form.id = 'eye-time-seek';
  const fieldLabel = node(doc, 'label', 'eye-time-field', 'FECHA UTC');
  const input = node(doc, 'input');
  Object.assign(input, {
    type: 'datetime-local',
    step: '1',
    min: FIELD_MIN,
    max: FIELD_MAX,
  });
  input.dataset.eyeTimeField = '';
  fieldLabel.append(input);
  const go = node(doc, 'button', 'eye-time-button', 'IR');
  go.type = 'submit';
  go.dataset.eyeTimeCmd = 'seek';
  go.setAttribute('aria-label', 'Ir a la fecha UTC');
  form.append(fieldLabel, go);
  return { toggle, form, input };
}

/**
 * Chip de la cabecera compacta (§6 móvil): dice el modo y abre la hoja de
 * controles (PAUSA, AVANCE, AHORA, FECHA), que solo se ve abierta.
 */
function buildChip(doc) {
  const chip = node(doc, 'button', 'eye-time-chip');
  chip.type = 'button';
  chip.dataset.eyeTimeChip = '';
  chip.setAttribute('aria-expanded', 'false');
  chip.setAttribute('aria-controls', 'eye-time-controls');
  return chip;
}

/** Nodos de la tira (sin comportamiento). */
function buildStrip(doc) {
  const root = node(doc, 'div', 'eye-time-strip');
  root.dataset.eyeTimeStrip = '';
  root.dataset.sheetOpen = 'false';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Tiempo de escena');
  const readout = buildReadout(doc);
  const seek = buildSeek(doc);
  const chip = buildChip(doc);
  const buttons = Object.fromEntries(
    ['pause', 'advance', 'now'].map((cmd) => [cmd, commandButton(doc, cmd)]),
  );
  const controls = node(doc, 'div', 'eye-time-controls');
  controls.id = 'eye-time-controls';
  controls.append(
    buttons.pause,
    buttons.advance,
    buttons.now,
    seek.toggle,
    seek.form,
  );
  const error = node(doc, 'p', 'eye-time-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const notes = node(doc, 'ul', 'eye-time-notes');
  notes.dataset.eyeTimeNotes = '';
  root.append(readout.readout, chip, readout.live, controls, error, notes);
  return { root, ...readout, ...seek, chip, buttons, error, notes };
}

function paintButton(button, { label, short, hint, enabled = true, pressed }) {
  const doc = button.ownerDocument;
  button.replaceChildren(
    node(doc, 'span', 'eye-label-long', label),
    node(doc, 'span', 'eye-label-short', short ?? label),
  );
  button.title = hint;
  button.setAttribute('aria-label', `${label}. ${hint}`);
  button.disabled = !enabled;
  if (pressed !== undefined)
    button.setAttribute('aria-pressed', String(pressed));
}

/** Abre o cierra el campo de fecha (cabecera compacta). */
function toggleSeek(parts) {
  const open = parts.root.dataset.dateOpen !== 'true';
  parts.root.dataset.dateOpen = String(open);
  parts.toggle.setAttribute('aria-expanded', String(open));
  if (open) parts.input.focus?.({ preventScroll: true });
}

/** Abre o cierra la hoja de controles del chip; al cerrar, foco al chip. */
function setSheet(parts, open, { refocus = false } = {}) {
  parts.root.dataset.sheetOpen = String(open);
  parts.chip.setAttribute('aria-expanded', String(open));
  if (refocus) parts.chip.focus?.({ preventScroll: true });
}

/** Escucha clics, envío del campo y foco; devuelve cómo soltarlo todo. */
function bindStrip(parts, onCommand, focusState) {
  const keydown = (event) => {
    if (event.key !== 'Escape' || parts.root.dataset.sheetOpen !== 'true')
      return;
    event.preventDefault?.();
    setSheet(parts, false, { refocus: true });
  };
  const click = (event) => {
    if (event.target.closest?.('[data-eye-time-chip]')) {
      setSheet(parts, parts.root.dataset.sheetOpen !== 'true');
      return;
    }
    if (event.target.closest?.('[data-eye-time-toggle]')) {
      toggleSeek(parts);
      return;
    }
    const button = event.target.closest?.('[data-eye-time-cmd]');
    if (!button || button.disabled || button.type === 'submit') return;
    onCommand?.({ type: button.dataset.eyeTimeCmd });
  };
  const submit = (event) => {
    event.preventDefault();
    onCommand?.({ type: 'seek', value: parts.input.value });
  };
  const focusIn = () => (focusState.editing = true);
  const focusOut = () => (focusState.editing = false);
  const pairs = [
    [parts.root, 'click', click],
    [parts.root, 'keydown', keydown],
    [parts.form, 'submit', submit],
    [parts.input, 'focus', focusIn],
    [parts.input, 'blur', focusOut],
  ];
  for (const [target, type, fn] of pairs) target.addEventListener(type, fn);
  return () => {
    for (const [target, type, fn] of pairs)
      target.removeEventListener(type, fn);
  };
}

function paintStrip(parts, view, currentIso, memory) {
  const doc = parts.root.ownerDocument;
  parts.root.dataset.tone = view.tone;
  parts.root.dataset.mode = view.mode;
  parts.icon.textContent = view.icon;
  parts.chip.textContent = view.chip.text;
  parts.chip.dataset.tone = view.chip.tone;
  parts.chip.setAttribute('aria-label', view.chip.label);
  parts.label.textContent = view.label;
  parts.detail.textContent = view.detail;
  if (view.announcement !== memory.announcement) {
    memory.announcement = view.announcement;
    parts.live.textContent = view.announcement;
  }
  const nowHadFocus = doc.activeElement === parts.buttons.now;
  paintButton(parts.buttons.pause, view.pause);
  paintButton(parts.buttons.advance, view.advance);
  paintButton(parts.buttons.now, view.now);
  // AHORA se deshabilita al volver a vivo: el foco no puede caer en <body>.
  if (nowHadFocus && parts.buttons.now.disabled)
    parts.buttons.pause.focus?.({ preventScroll: true });
  if (!memory.editing) parts.input.value = utcDateFieldValue(currentIso);
  parts.notes.replaceChildren(
    ...view.notes.map((text) => node(doc, 'li', '', text)),
  );
  parts.notes.hidden = view.notes.length === 0;
}

/**
 * @param {{host: HTMLElement, onCommand: (command: {type: string,
 *   value?: string}) => void}} options
 */
export function mountEyeTimeStrip({ host, onCommand }) {
  if (!host) throw new TypeError('mountEyeTimeStrip requiere un host');
  const parts = buildStrip(host.ownerDocument);
  host.replaceChildren(parts.root);
  const memory = { announcement: null, editing: false };
  const unbind = bindStrip(parts, onCommand, memory);
  return {
    update: (view, currentIso) => paintStrip(parts, view, currentIso, memory),
    /** Tras un IR válido el campo se recoge (no roba alto al globo). */
    closeSeek() {
      if (parts.root.dataset.dateOpen === 'true') toggleSeek(parts);
    },
    setError(message) {
      parts.error.textContent = message || '';
      parts.error.hidden = !message;
      parts.input.setAttribute('aria-invalid', String(Boolean(message)));
    },
    destroy() {
      unbind();
      parts.root.remove();
    },
  };
}
