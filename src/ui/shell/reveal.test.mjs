/**
 * Revelación (fase visual T3, V-01/V-02): un único estado de presentación
 * decide qué se ve en reposo y con objetivo. `nextRevealState` es puro;
 * `mountEyeReveal` lo publica en `body[data-eye-reveal|-target|-intro|-story]`
 * y retira el titular en la PRIMERA interacción (rueda, arrastre, tecla,
 * clic o foco), también con movimiento reducido (sin animación, mismo retiro).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIRST_INTERACTION_EVENTS,
  mountEyeReveal,
  nextRevealState,
} from './reveal.js';

test('reposo sin objetivo: rest, titular visible mientras no haya interacción', () => {
  const state = nextRevealState({
    target: false,
    intro: 'running',
    interaction: false,
    reducedMotion: false,
  });
  assert.deepEqual(
    { ...state },
    {
      reveal: 'rest',
      target: '0',
      intro: 'running',
      story: 'headline',
      motion: 'fade',
    },
  );
  assert.ok(Object.isFrozen(state));
});

test('la primera interacción retira el titular y pasa a explorar (sin vuelta atrás)', () => {
  // Plan §2.2: intro → rest → explore. En `explore` aparecen los controles de
  // cámara, la telemetría y las capas (V-02); en `rest` solo barra, titular y
  // tira (V-01).
  const state = nextRevealState({ interaction: true, intro: 'done' });
  assert.equal(state.reveal, 'explore');
  assert.equal(state.story, 'hidden');
  assert.equal(state.intro, 'done');
});

test('con objetivo fijado: target, el titular pasa a ser el objetivo', () => {
  const before = nextRevealState({ target: true, interaction: false });
  const after = nextRevealState({ target: true, interaction: true });
  for (const state of [before, after]) {
    assert.equal(state.reveal, 'target');
    assert.equal(state.target, '1');
    assert.equal(state.story, 'target');
  }
});

test('movimiento reducido: mismo estado, sin animación', () => {
  const reduced = nextRevealState({ reducedMotion: true });
  const normal = nextRevealState({ reducedMotion: false });
  assert.equal(reduced.motion, 'none');
  assert.equal(normal.motion, 'fade');
  assert.equal(reduced.story, normal.story);
  assert.equal(reduced.reveal, normal.reveal);
});

test('valores ajenos caen al estado por defecto (nunca lanza)', () => {
  const state = nextRevealState({ target: 'sí', intro: 'otro' });
  assert.equal(state.target, '0');
  assert.equal(state.intro, 'done');
  assert.equal(nextRevealState().reveal, 'rest');
});

test('la primera interacción cubre rueda, arrastre, tecla, clic y foco', () => {
  // `click` cubre la activación sin puntero (Enter/Espacio o el clic
  // programático de un control): también es intención.
  assert.deepEqual(
    [...FIRST_INTERACTION_EVENTS].sort(),
    ['click', 'focusin', 'keydown', 'pointerdown', 'wheel'].sort(),
  );
});

function fakeDoc() {
  const listeners = new Map();
  return {
    body: { dataset: {} },
    listeners,
    addEventListener(type, fn, options) {
      listeners.set(type, { fn, options });
    },
    removeEventListener(type, fn) {
      if (listeners.get(type)?.fn === fn) listeners.delete(type);
    },
    fire(type, event = {}) {
      listeners.get(type)?.fn({ type, ...event });
    },
  };
}

test('mountEyeReveal publica el estado y lo actualiza con objetivo e intro', () => {
  const doc = fakeDoc();
  const reveal = mountEyeReveal({ doc, reducedMotion: () => false });
  assert.equal(doc.body.dataset.eyeReveal, 'rest');
  assert.equal(doc.body.dataset.eyeTarget, '0');
  assert.equal(doc.body.dataset.eyeStory, 'headline');
  reveal.setIntro('running');
  assert.equal(doc.body.dataset.eyeIntro, 'running');
  reveal.setIntro('done');
  assert.equal(doc.body.dataset.eyeIntro, 'done');
  reveal.setTarget(true);
  assert.equal(doc.body.dataset.eyeReveal, 'target');
  assert.equal(doc.body.dataset.eyeStory, 'target');
  reveal.setTarget(false);
  // Fijar un objetivo ya fue una intención: al soltarlo se explora, no se
  // vuelve al reposo inicial ni reaparece el titular.
  assert.equal(doc.body.dataset.eyeReveal, 'explore');
  assert.equal(doc.body.dataset.eyeStory, 'hidden');
  reveal.destroy();
  assert.equal(doc.body.dataset.eyeReveal, undefined);
  assert.equal(doc.body.dataset.eyeIntro, undefined);
});

test('una sola interacción basta: retira el titular y suelta los oyentes', () => {
  const doc = fakeDoc();
  const reveal = mountEyeReveal({ doc, reducedMotion: () => true });
  assert.equal(doc.body.dataset.eyeMotion, 'none');
  for (const type of FIRST_INTERACTION_EVENTS) {
    assert.equal(doc.listeners.get(type)?.options?.capture, true, type);
    assert.equal(doc.listeners.get(type)?.options?.passive, true, type);
  }
  doc.fire('wheel');
  assert.equal(doc.body.dataset.eyeStory, 'hidden');
  assert.equal(doc.body.dataset.eyeReveal, 'explore');
  assert.equal(doc.listeners.size, 0);
  assert.equal(reveal.getState().story, 'hidden');
  reveal.destroy();
});

test('una tecla modificadora sola no cuenta como interacción', () => {
  const doc = fakeDoc();
  const reveal = mountEyeReveal({ doc, reducedMotion: () => false });
  doc.fire('keydown', { key: 'Shift' });
  assert.equal(doc.body.dataset.eyeStory, 'headline');
  doc.fire('keydown', { key: 'Tab' });
  assert.equal(doc.body.dataset.eyeStory, 'hidden');
  reveal.destroy();
});
