/**
 * P5 §7 — atajos de la escena Tierra–Luna. L apunta a la Luna, Shift+L
 * encuadra el sistema Tierra–Luna, P pausa/reanuda la tira TIEMPO (Espacio ya
 * es «mantener para hablar» de la voz), N vuelve a AHORA y Esc cierra el
 * campo FECHA abierto. Ninguno pisa un atajo existente ni la escritura.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SCENE_SHORTCUT_KEYS,
  bindApplicationShortcuts,
  bindSceneShortcuts,
  resolveSceneShortcut,
} from './applicationShortcuts.js';

class Target {
  constructor(tag = 'DIV', { editable = false } = {}) {
    this.tagName = tag;
    this.isContentEditable = editable;
  }
  matches(selector) {
    return (
      selector.includes('input') &&
      ['INPUT', 'SELECT', 'TEXTAREA'].includes(this.tagName)
    );
  }
  closest(selector) {
    return this.matches(selector) || this.isContentEditable ? this : null;
  }
}

function fakeDocument() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn, capture) {
      assert.notEqual(
        capture,
        true,
        'burbujeo: las superficies de captura mandan',
      );
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    press(key, patch = {}) {
      const event = {
        key,
        target: new Target(),
        defaultPrevented: false,
        prevented: 0,
        stopped: 0,
        preventDefault() {
          this.prevented += 1;
          this.defaultPrevented = true;
        },
        stopImmediatePropagation() {
          this.stopped += 1;
        },
        ...patch,
      };
      for (const fn of [...(listeners.get('keydown') ?? [])]) fn(event);
      return event;
    },
  };
}

const press = (key, patch = {}) => ({
  key,
  target: new Target(),
  defaultPrevented: false,
  ...patch,
});

test('mapa §7: L, Shift+L, P, N y Esc', () => {
  assert.deepEqual(
    { ...SCENE_SHORTCUT_KEYS },
    {
      l: 'aim-moon',
      L: 'earth-moon-system',
      p: 'toggle-pause',
      n: 'now',
      Escape: 'close-date-field',
    },
  );
  assert.equal(resolveSceneShortcut(press('l')), 'aim-moon');
  assert.equal(
    resolveSceneShortcut(press('L', { shiftKey: true })),
    'earth-moon-system',
  );
  assert.equal(resolveSceneShortcut(press('p')), 'toggle-pause');
  assert.equal(resolveSceneShortcut(press('P', { shiftKey: true })), null);
  assert.equal(resolveSceneShortcut(press('n')), 'now');
  assert.equal(resolveSceneShortcut(press('Escape')), 'close-date-field');
});

test('Espacio NO es atajo de escena: es «mantener para hablar» de la voz', () => {
  assert.equal(resolveSceneShortcut(press(' ')), null);
  assert.equal(resolveSceneShortcut(press(' ', { code: 'Space' })), null);
});

test('nunca con modificadores (Ctrl+L, Ctrl+N del navegador), repetición o composición', () => {
  for (const patch of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { repeat: true },
    { isComposing: true },
    { defaultPrevented: true },
  ]) {
    assert.equal(
      resolveSceneShortcut(press('l', patch)),
      null,
      JSON.stringify(patch),
    );
    assert.equal(
      resolveSceneShortcut(press('n', patch)),
      null,
      JSON.stringify(patch),
    );
  }
});

test('escribir en un campo de texto no dispara atajos; Esc sí llega', () => {
  for (const target of [
    new Target('INPUT'),
    new Target('TEXTAREA'),
    new Target('SELECT'),
    new Target('DIV', { editable: true }),
  ]) {
    for (const key of ['l', 'L', 'p', 'n'])
      assert.equal(
        resolveSceneShortcut(press(key, { target })),
        null,
        `${target.tagName} ${key}`,
      );
    assert.equal(
      resolveSceneShortcut(press('Escape', { target })),
      'close-date-field',
    );
  }
});

test('sin choque: los atajos existentes no usan L, N ni P', () => {
  const doc = fakeDocument();
  const calls = [];
  const names = [
    'setStyle',
    'dismissSearch',
    'toggleHud',
    'toggleOrbit',
    'toggleCleanView',
    'toggleLayers',
    'cycleDetection',
    'toggleCctv',
  ];
  const actions = Object.fromEntries(
    names.map((name) => [name, () => calls.push(name)]),
  );
  const binding = bindApplicationShortcuts({
    documentRef: doc,
    searchInput: null,
    actions,
  });
  for (const key of ['l', 'L', 'n', 'N', 'p', 'P']) doc.press(key);
  assert.deepEqual(calls, []);
  binding.destroy();
});

test('bindSceneShortcuts: ejecuta, consume solo lo atendido y se suelta', () => {
  const doc = fakeDocument();
  const ran = [];
  const binding = bindSceneShortcuts({
    documentRef: doc,
    run: (id) => {
      ran.push(id);
      return id !== 'close-date-field';
    },
  });
  const aim = doc.press('l');
  assert.equal(aim.prevented, 1, 'atendido → preventDefault');
  const esc = doc.press('Escape');
  assert.equal(esc.prevented, 0, 'Esc sin campo abierto sigue su camino');
  assert.equal(esc.stopped, 0);
  doc.press('x');
  assert.deepEqual(ran, ['aim-moon', 'close-date-field']);
  binding.destroy();
  binding.destroy();
  doc.press('l');
  assert.equal(ran.length, 2);
  assert.equal(doc.listeners.get('keydown').size, 0);
});

test('Esc que cierra FECHA no cierra además el panel (se detiene ahí)', () => {
  const doc = fakeDocument();
  const binding = bindSceneShortcuts({ documentRef: doc, run: () => true });
  const esc = doc.press('Escape');
  assert.equal(esc.prevented, 1);
  assert.equal(esc.stopped, 1);
  binding.destroy();
});
