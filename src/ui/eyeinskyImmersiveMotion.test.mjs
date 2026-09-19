import assert from 'node:assert/strict';
import test from 'node:test';
import { mountImmersiveMotion } from './eyeinskyImmersiveMotion.ts';

class FakeAnimation {
  constructor(element, keyframes, options) {
    this.element = element;
    this.keyframes = keyframes;
    this.options = options;
    this.cancelled = false;
    this.committed = false;
    this.finished = new Promise((resolve) => {
      this.finish = resolve;
    });
  }
  cancel() {
    this.cancelled = true;
    this.finish();
  }
  commitStyles() {
    this.committed = true;
    for (const [property, value] of Object.entries(this.computedStyle || {}))
      this.element.style.setProperty(property, value);
  }
  setComputedStyle(style) {
    this.computedStyle = style;
  }
}

class FakeStyle {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  getPropertyValue(name) {
    return this.values.get(name) || '';
  }
  getPropertyPriority() {
    return '';
  }
  setProperty(name, value) {
    this.values.set(name, String(value));
  }
  removeProperty(name) {
    this.values.delete(name);
  }
}

class FakeElement {
  constructor({ hidden = true, style = {} } = {}) {
    this.hidden = hidden;
    this.inert = false;
    this.attributes = new Map();
    this.animations = [];
    this.style = new FakeStyle(style);
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  animate(keyframes, options) {
    const animation = new FakeAnimation(this, keyframes, options);
    this.animations.push(animation);
    return animation;
  }
}

test('closing becomes inert immediately and reopening retargets the transition', async () => {
  const controller = new AbortController();
  const root = new FakeElement({ hidden: false });
  const panel = new FakeElement();
  const motion = mountImmersiveMotion({
    root,
    signal: controller.signal,
    reducedMotion: () => false,
  });

  motion.setOpen(panel, true);
  assert.equal(panel.hidden, false);
  assert.equal(panel.inert, false);
  assert.equal(panel.getAttribute('aria-hidden'), null);

  motion.setOpen(panel, false);
  const closing = panel.animations.at(-1);
  assert.equal(panel.inert, true);
  assert.equal(panel.getAttribute('aria-hidden'), 'true');

  motion.setOpen(panel, true);
  assert.equal(closing.cancelled, true);
  assert.equal(panel.hidden, false);
  assert.equal(panel.inert, false);
  closing.finish();
  await Promise.resolve();
  assert.equal(
    panel.hidden,
    false,
    'stale close must not hide a reopened panel',
  );

  controller.abort();
  assert.equal(panel.animations.at(-1).cancelled, true);
});

test('an interrupted close reopens fully and releases only motion-owned inline styles', async () => {
  const controller = new AbortController();
  const root = new FakeElement({ hidden: false });
  const panel = new FakeElement({ hidden: false, style: { color: 'tomato' } });
  const motion = mountImmersiveMotion({
    root,
    signal: controller.signal,
    reducedMotion: () => false,
  });

  motion.setOpen(panel, false);
  const closing = panel.animations.at(-1);
  closing.setComputedStyle({
    opacity: '0.0340174',
    transform: 'matrix(0.97585, 0, 0, 0.97585, 0, 11.5918)',
  });

  motion.setOpen(panel, true);
  const reopening = panel.animations.at(-1);
  assert.equal(panel.style.getPropertyValue('opacity'), '0.0340174');
  reopening.finish();
  await Promise.resolve();

  assert.equal(panel.hidden, false);
  assert.equal(panel.style.getPropertyValue('opacity'), '');
  assert.equal(panel.style.getPropertyValue('transform'), '');
  assert.equal(panel.style.getPropertyValue('color'), 'tomato');

  controller.abort();
  assert.equal(panel.style.getPropertyValue('color'), 'tomato');
});

test('destroy restores pre-existing inline transform and opacity', () => {
  const root = new FakeElement({ hidden: false });
  const panel = new FakeElement({
    hidden: false,
    style: { opacity: '0.8', transform: 'translateX(2px)' },
  });
  const motion = mountImmersiveMotion({
    root,
    signal: new AbortController().signal,
    reducedMotion: () => false,
  });

  const animation = motion.setOpen(panel, false);
  animation.setComputedStyle({ opacity: '0.3', transform: 'translateY(8px)' });
  motion.destroy();

  assert.equal(panel.style.getPropertyValue('opacity'), '0.8');
  assert.equal(panel.style.getPropertyValue('transform'), 'translateX(2px)');
});

test('reduced motion keeps state changes useful without positional movement', () => {
  const root = new FakeElement({ hidden: false });
  const panel = new FakeElement();
  const motion = mountImmersiveMotion({
    root,
    signal: new AbortController().signal,
    reducedMotion: () => true,
  });

  motion.setOpen(panel, true);
  const animation = panel.animations.at(-1);
  assert.equal(animation.options.duration, 1);
  assert.equal(
    animation.keyframes.some((frame) => 'transform' in frame),
    false,
  );

  motion.destroy();
  assert.equal(animation.cancelled, true);
});
