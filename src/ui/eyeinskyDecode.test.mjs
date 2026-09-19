import assert from 'node:assert/strict';
import test from 'node:test';
import { createDecorativeDecoder } from './eyeinskyDecode.js';

function rig(reduced = false) {
  const queue = [];
  const element = {
    textContent: 'OLD',
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };
  const decoder = createDecorativeDecoder(element, {
    reducedMotion: () => reduced,
    schedule(fn) {
      queue.push(fn);
      return fn;
    },
    cancel(id) {
      const index = queue.indexOf(id);
      if (index >= 0) queue.splice(index, 1);
    },
  });
  return {
    element,
    decoder,
    flush: () => {
      while (queue.length) queue.shift()();
    },
  };
}

test('decorative binary is hidden from accessibility and always settles to exact text', () => {
  const h = rig();
  h.decoder.reveal('CAMPO GLOBAL');
  assert.equal(h.element.attributes.get('aria-hidden'), 'true');
  assert.notEqual(h.element.textContent, 'CAMPO GLOBAL');
  h.flush();
  assert.equal(h.element.textContent, 'CAMPO GLOBAL');
});

test('reentry and destroy cannot leave partial binary while reduced motion is immediate', () => {
  const h = rig();
  h.decoder.reveal('FIRST');
  h.decoder.reveal('SECOND');
  h.decoder.destroy();
  h.flush();
  assert.equal(h.element.textContent, 'SECOND');
  const reduced = rig(true);
  reduced.decoder.reveal('FINAL');
  assert.equal(reduced.element.textContent, 'FINAL');
});
