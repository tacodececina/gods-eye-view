/**
 * Retícula lat/lon (fase visual T2, V-17): arranca apagada, sin entidades
 * (se construye al primer clic) y el interruptor sigue funcionando. La
 * retícula fija central `.eye-field-reticle` («N / 000°», lectura estática que
 * parecía instrumento) deja de existir.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountGraticule } from './graticule.js';

const template = readFileSync(
  new URL('../templates/eyeinsky.html', import.meta.url),
  'utf8',
);

test('la plantilla arranca con #eye-grid apagado y sin retícula fija', () => {
  assert.match(
    template,
    /<button id="eye-grid" aria-label="Retícula geográfica" aria-pressed="false">/,
  );
  assert.doesNotMatch(template, /eye-field-reticle/);
  assert.doesNotMatch(template, /N \/ 000°/);
});

function harness() {
  const button = {
    attrs: { 'aria-pressed': 'false' },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    getAttribute(name) {
      return this.attrs[name];
    },
  };
  globalThis.document = {
    getElementById: (id) => (id === 'eye-grid' ? button : null),
  };
  const sources = [];
  const viewer = {
    dataSources: {
      add: (source) => sources.push(source),
      remove: (source) => {
        const i = sources.indexOf(source);
        if (i >= 0) sources.splice(i, 1);
        return i >= 0;
      },
    },
    scene: { requestRender() {} },
  };
  const handlers = [];
  const lifetime = {
    listen: (target, type, handler) => handlers.push(handler),
  };
  const disposers = [];
  mountGraticule({ viewer, lifetime, defer: (fn) => disposers.push(fn) });
  return { button, sources, click: () => handlers[0](), disposers };
}

test('0 entidades al montar; el primer clic la construye y la enciende', (t) => {
  t.after(() => delete globalThis.document);
  const h = harness();
  assert.equal(h.sources.length, 0, 'nada se añade al arrancar');
  h.click();
  assert.equal(h.sources.length, 1);
  assert.equal(h.sources[0].name, 'eyeinsky-graticule');
  assert.ok(h.sources[0].entities.values.length > 0);
  assert.equal(h.sources[0].show, true);
  assert.equal(h.button.getAttribute('aria-pressed'), 'true');
  h.click();
  assert.equal(h.sources[0].show, false);
  assert.equal(h.button.getAttribute('aria-pressed'), 'false');
  for (const dispose of h.disposers) dispose();
  assert.equal(h.sources.length, 0, 'se retira al desmontar');
});
