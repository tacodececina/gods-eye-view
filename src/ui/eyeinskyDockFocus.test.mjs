/**
 * P5-17 · WCAG 2.4.3: activar una acción de la Luna o de la tira TIEMPO con
 * teclado no tira el foco a <body>. Los botones se actualizan en su sitio; si
 * AHORA se deshabilita (ya en vivo), el foco pasa a PAUSA.
 *
 * DOM mínimo en memoria: quitar del árbol o deshabilitar el elemento con foco
 * devuelve el foco a <body>, como hace Chrome.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTimeStrip } from './eyeinskyMissionDockModel.js';
import {
  resolveMoonActions,
  resolveMoonReticle,
} from './eyeinskyMoonDockModel.js';
import {
  mountEyeMoonActions,
  mountEyeMoonReticle,
} from './eyeinskyMoonDock.js';
import { mountEyeTimeStrip } from './eyeinskyTimeStrip.js';

const camel = (name) =>
  name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class FakeElement {
  constructor(doc, tag) {
    Object.assign(this, { doc, tagName: tag.toUpperCase(), children: [] });
    Object.assign(this, { parentNode: null, dataset: {}, style: {} });
    Object.assign(this, { hidden: false, className: '', title: '' });
    this.attributes = new Map();
    this.listeners = new Map();
    this.isDisabled = false;
    this.text = '';
  }
  get disabled() {
    return this.isDisabled;
  }
  set disabled(value) {
    this.isDisabled = Boolean(value);
    if (this.isDisabled && this.doc.activeElement === this) this.doc.blur();
  }
  get textContent() {
    return this.text + this.children.map((c) => c.textContent ?? c).join('');
  }
  set textContent(value) {
    this.replaceChildren();
    this.text = String(value);
  }
  get ownerDocument() {
    return this.doc;
  }
  append(...nodes) {
    for (const child of nodes) {
      if (typeof child !== 'string') {
        child.parentNode?.detach(child);
        child.parentNode = this;
      }
      this.children.push(child);
    }
  }
  detach(child) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    if (child.contains?.(this.doc.activeElement)) this.doc.blur();
  }
  replaceChildren(...nodes) {
    for (const child of [...this.children])
      if (typeof child === 'string') this.children.shift();
      else this.detach(child);
    this.append(...nodes);
  }
  remove() {
    this.parentNode?.detach(this);
  }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  closest(selector) {
    const key = camel(selector.slice(1, -1));
    for (let n = this; n; n = n.parentNode) if (key in n.dataset) return n;
    return null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  addEventListener(type, fn) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type, fn) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  }
  focus() {
    if (!this.isDisabled && this.doc.body.contains(this))
      this.doc.activeElement = this;
  }
  find(key, value) {
    if (this.dataset[key] === value) return this;
    for (const child of this.children) {
      const hit = typeof child === 'string' ? null : child.find(key, value);
      if (hit) return hit;
    }
    return null;
  }
}

function fakeDocument() {
  const doc = {
    createElement: (tag) => new FakeElement(doc, tag),
    blur: () => (doc.activeElement = doc.body),
  };
  doc.body = new FakeElement(doc, 'body');
  doc.activeElement = doc.body;
  return doc;
}

const moon = (patch = {}) => ({
  enabled: true,
  status: 'ok',
  scaleMode: 'physical',
  ...patch,
});

test('APUNTAR con teclado: tras el cambio de firma el foco sigue en el botón', () => {
  const doc = fakeDocument();
  const host = doc.createElement('div');
  doc.body.append(host);
  const dock = mountEyeMoonActions({ host, onAction() {} });
  dock.update(resolveMoonActions({ moon: moon() }), true);
  const aim = host.find('eyeMoonAction', 'aim-moon');
  aim.focus();
  // Tras APUNTAR hay retorno pendiente: cambia la firma de las acciones.
  dock.update(resolveMoonActions({ moon: moon(), returnPending: true }), true);
  assert.equal(doc.activeElement, aim, 'el foco no cae en <body>');
  assert.equal(host.find('eyeMoonAction', 'return-to-earth').disabled, false);
});

test('ESCALA con teclado: cambia rótulo y aria-pressed en el mismo botón', () => {
  const doc = fakeDocument();
  const host = doc.createElement('div');
  doc.body.append(host);
  const dock = mountEyeMoonActions({ host, onAction() {} });
  dock.update(resolveMoonActions({ moon: moon() }), true);
  const scale = host.find('eyeMoonAction', 'moon-scale');
  scale.focus();
  dock.update(
    resolveMoonActions({ moon: moon({ scaleMode: 'didactic' }) }),
    true,
  );
  assert.equal(doc.activeElement, scale);
  assert.equal(scale.getAttribute('aria-pressed'), 'true');
  assert.match(scale.textContent, /ESCALA FÍSICA/);
});

test('VOLVER A TIERRA con teclado: al deshabilitarse, el foco pasa a una acción viva del grupo', () => {
  const doc = fakeDocument();
  const host = doc.createElement('div');
  doc.body.append(host);
  const dock = mountEyeMoonActions({ host, onAction() {} });
  dock.update(resolveMoonActions({ moon: moon(), returnPending: true }), true);
  host.find('eyeMoonAction', 'return-to-earth').focus();
  dock.update(resolveMoonActions({ moon: moon() }), true);
  assert.ok(host.contains(doc.activeElement), 'el foco sigue en el grupo');
  assert.equal(doc.activeElement.disabled, false);
});

const liveClock = {
  mode: 'live',
  multiplier: 1,
  currentIso: '2026-09-25T14:32:05.250Z',
  driftMs: 0,
  reason: null,
};

test('AHORA con teclado: al deshabilitarse, el foco pasa a PAUSA', () => {
  const doc = fakeDocument();
  const host = doc.createElement('div');
  doc.body.append(host);
  const strip = mountEyeTimeStrip({ host, onCommand() {} });
  const sim = { ...liveClock, mode: 'simulated', multiplier: 60, driftMs: 9e6 };
  strip.update(resolveTimeStrip(sim), sim.currentIso);
  host.find('eyeTimeCmd', 'now').focus();
  strip.update(resolveTimeStrip(liveClock), liveClock.currentIso);
  assert.equal(doc.activeElement, host.find('eyeTimeCmd', 'pause'));
});

test('P5-17 §6: el chip abre y cierra la hoja de controles (aria-expanded) y Esc la cierra', () => {
  const doc = fakeDocument();
  const host = doc.createElement('div');
  doc.body.append(host);
  const strip = mountEyeTimeStrip({ host, onCommand() {} });
  strip.update(resolveTimeStrip(liveClock), liveClock.currentIso);
  const chip = host.find('eyeTimeChip', '');
  const root = host.find('eyeTimeStrip', '');
  assert.ok(chip, 'hay chip');
  assert.equal(chip.textContent, '● VIVO 14:32 UTC');
  assert.equal(chip.getAttribute('aria-expanded'), 'false');
  chip.focus();
  const click = (target) =>
    root.listeners.get('click').forEach((fn) => fn({ target }));
  click(chip);
  assert.equal(root.dataset.sheetOpen, 'true');
  assert.equal(chip.getAttribute('aria-expanded'), 'true');
  root.listeners
    .get('keydown')
    .forEach((fn) => fn({ key: 'Escape', target: chip, preventDefault() {} }));
  assert.equal(root.dataset.sheetOpen, 'false');
  assert.equal(doc.activeElement, chip);
});

/** Tira montada en un DOM mínimo, con el clic y la tecla de su raíz. */
function mountedStrip() {
  const doc = fakeDocument();
  const host = doc.createElement('div');
  doc.body.append(host);
  const commands = [];
  const strip = mountEyeTimeStrip({
    host,
    onCommand: (command) => commands.push(command),
  });
  const root = host.find('eyeTimeStrip', '');
  const click = (target) =>
    root.listeners.get('click').forEach((fn) => fn({ target }));
  const key = (name, target) => {
    const event = {
      key: name,
      target,
      prevented: 0,
      stopped: 0,
      preventDefault() {
        this.prevented += 1;
      },
      stopPropagation() {
        this.stopped += 1;
      },
    };
    root.listeners.get('keydown').forEach((fn) => fn(event));
    return event;
  };
  return { doc, host, strip, root, click, key, commands };
}

test('PAUSA/REANUDAR cambia de rótulo y nunca lleva aria-pressed', () => {
  const { host, strip } = mountedStrip();
  strip.update(resolveTimeStrip(liveClock), liveClock.currentIso);
  const pause = host.find('eyeTimeCmd', 'pause');
  assert.equal(pause.getAttribute('aria-pressed'), null);
  const paused = { ...liveClock, mode: 'paused' };
  strip.update(resolveTimeStrip(paused), paused.currentIso);
  assert.match(pause.textContent, /REANUDAR/);
  assert.equal(pause.getAttribute('aria-pressed'), null);
});

test('AVANCE dice el ritmo ACTUAL en el rótulo y en el nombre accesible', () => {
  const { host, strip } = mountedStrip();
  const sim = {
    ...liveClock,
    mode: 'simulated',
    multiplier: 3600,
    driftMs: 9e6,
  };
  strip.update(resolveTimeStrip(sim), sim.currentIso);
  const advance = host.find('eyeTimeCmd', 'advance');
  assert.match(advance.textContent, /AVANCE ×3600/);
  assert.equal(
    advance.getAttribute('aria-label'),
    'AVANCE, ritmo actual ×3600. Pulsa para simular a ×1',
  );
});

test('Esc en el campo FECHA abierto lo cierra y devuelve el foco a FECHA', () => {
  const { doc, host, strip, root, click, key } = mountedStrip();
  strip.update(resolveTimeStrip(liveClock), liveClock.currentIso);
  const toggle = host.find('eyeTimeToggle', 'date');
  const input = host.find('eyeTimeField', '');
  click(toggle);
  assert.equal(root.dataset.dateOpen, 'true');
  assert.equal(doc.activeElement, input);
  const event = key('Escape', input);
  assert.equal(root.dataset.dateOpen, 'false');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.activeElement, toggle, 'el foco vuelve a FECHA');
  assert.equal(event.prevented, 1);
  assert.equal(event.stopped, 1, 'no cierra además el panel');
  assert.equal(strip.closeSeek({ refocus: true }), false, 'ya cerrado');
  click(toggle);
  assert.equal(strip.closeSeek({ refocus: true }), true);
  assert.equal(doc.activeElement, toggle);
});

test('pausa larga desde vivo: línea visible con REANUDAR y AHORA', () => {
  const { host, strip } = mountedStrip();
  const paused = { ...liveClock, mode: 'paused', driftMs: -61_000 };
  strip.update(
    resolveTimeStrip(paused, { suspendedCount: 2, pausedFromLive: true }),
    paused.currentIso,
  );
  const notice = host.find('eyeTimeNotice', '');
  assert.ok(notice, 'hay línea de aviso');
  assert.equal(notice.hidden, false);
  assert.match(
    notice.textContent,
    /Capas en vivo suspendidas: la pausa supera 60 s/,
  );
  const buttons = notice.children.filter((c) => c.tagName === 'BUTTON');
  assert.deepEqual(
    buttons.map((b) => [b.dataset.eyeTimeCmd, b.textContent]),
    [
      ['pause', 'REANUDAR'],
      ['now', 'AHORA'],
    ],
  );
  strip.update(resolveTimeStrip(liveClock), liveClock.currentIso);
  assert.equal(notice.hidden, true);
});

test('flecha de borde: «Luna fuera de cuadro, hacia la izquierda/derecha»', () => {
  const doc = fakeDocument();
  const reticle = mountEyeMoonReticle(doc);
  const frame = { width: 800, height: 600, margin: 28, point: null };
  const left = resolveMoonReticle({ ...frame, dx: -5, dy: 1 });
  assert.equal(left.direction, 'izquierda');
  reticle.update(left);
  const root = doc.body.find('eyeMoonReticle', '');
  const arrow = root.children.find(
    (c) => c.className === 'eye-moon-reticle-arrow',
  );
  assert.equal(root.getAttribute('aria-hidden'), null, 'la flecha se anuncia');
  assert.equal(arrow.getAttribute('role'), 'img');
  assert.equal(
    arrow.getAttribute('aria-label'),
    'Luna fuera de cuadro, hacia la izquierda',
  );
  reticle.update(resolveMoonReticle({ ...frame, dx: 4, dy: -1 }));
  assert.equal(
    arrow.getAttribute('aria-label'),
    'Luna fuera de cuadro, hacia la derecha',
  );
  assert.equal(
    resolveMoonReticle({ ...frame, dx: 0.1, dy: -3 }).direction,
    'arriba',
  );
  const ring = root.children.find(
    (c) => c.className === 'eye-moon-reticle-ring',
  );
  assert.equal(
    ring.getAttribute('aria-hidden'),
    'true',
    'el aro es decorativo',
  );
});
