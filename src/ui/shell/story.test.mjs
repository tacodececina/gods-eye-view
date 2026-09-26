/**
 * Titular de entrada `.eye-story` (fase visual T3, §6.3): «El planeta,
 * ahora.» solo con el reloj en vivo; en simulación o pausa nombra la fecha y
 * NO dice «ahora» (honestidad). La línea de apoyo dice de dónde salen el día,
 * la noche y las luces (VIIRS 2012, compuesto, no en vivo). Con objetivo, el
 * titular es el objetivo. Un solo anuncio por cambio (aria-live="polite").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountEyeStory, resolveStory } from './story.js';

const LIVE = {
  mode: 'live',
  driftMs: 120,
  currentIso: '2026-09-25T18:04:11.000Z',
};
const SIM = {
  mode: 'simulated',
  multiplier: 3600,
  driftMs: 9e7,
  currentIso: '2027-03-14T06:00:00.000Z',
};
const PAUSED = {
  mode: 'paused',
  driftMs: 3e5,
  currentIso: '2026-10-07T03:12:00.000Z',
};
const EDITORIAL = { lighting: '1', nightLights: '1' };

test('reloj en vivo: kicker de luz solar y «El planeta, / ahora.»', () => {
  const story = resolveStory({ clock: LIVE, flags: EDITORIAL });
  assert.equal(story.mode, 'headline');
  assert.equal(story.kicker, 'Tierra · luz solar de este instante');
  assert.deepEqual([...story.lines], ['El planeta,', 'ahora.']);
  assert.match(story.lede, /posición real del Sol/);
  assert.match(story.lede, /VIIRS 2012/);
  assert.match(story.lede, /no en vivo/);
  assert.ok(Object.isFrozen(story));
});

test('simulación o pausa: nombra la fecha simulada y nunca dice «ahora»', () => {
  for (const clock of [SIM, PAUSED]) {
    const story = resolveStory({ clock, flags: EDITORIAL });
    const text = [story.kicker, ...story.lines].join(' ');
    assert.doesNotMatch(text, /ahora|este instante/i, clock.mode);
    assert.match(story.kicker, new RegExp(clock.currentIso.slice(0, 10)));
  }
  assert.match(
    resolveStory({ clock: SIM, flags: EDITORIAL }).kicker,
    /simulación/,
  );
  assert.match(
    resolveStory({ clock: PAUSED, flags: EDITORIAL }).kicker,
    /en pausa/,
  );
});

test('en vivo pero resincronizando (deriva ≥ 5 s) tampoco es «ahora»', () => {
  const story = resolveStory({
    clock: { ...LIVE, driftMs: 6000 },
    flags: EDITORIAL,
  });
  assert.doesNotMatch(story.lines.join(' '), /ahora/);
});

test('sin luz solar (globo legacy) no promete día y noche ni VIIRS', () => {
  const story = resolveStory({
    clock: LIVE,
    flags: { lighting: '0', nightLights: '0' },
  });
  assert.doesNotMatch(story.kicker, /luz solar/);
  assert.doesNotMatch(story.lede, /VIIRS|posición real del Sol/);
  assert.match(story.lede, /sin día ni noche/);
});

test('con objetivo el titular es el objetivo, con su kicker', () => {
  const story = resolveStory({
    clock: LIVE,
    flags: EDITORIAL,
    target: { title: 'ISS (ZARYA)', kicker: 'SEGUIMIENTO / CONTACTO' },
  });
  assert.equal(story.mode, 'target');
  assert.deepEqual([...story.lines], ['ISS (ZARYA)']);
  assert.equal(story.kicker, 'SEGUIMIENTO / CONTACTO');
  assert.equal(story.announcement, 'Objetivo: ISS (ZARYA)');
});

function fakeHost() {
  const make = (tag) => ({
    tag,
    textContent: '',
    children: [],
    dataset: {},
    attrs: {},
    className: '',
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
  });
  const host = make('section');
  host.ownerDocument = { createElement: make };
  return host;
}

test('mountEyeStory pinta una vez por cambio y no anuncia cada segundo', () => {
  const host = fakeHost();
  let clock = LIVE;
  const story = mountEyeStory({
    host,
    getClock: () => clock,
    flags: EDITORIAL,
  });
  assert.equal(host.attrs['aria-live'], 'polite');
  assert.equal(host.dataset.mode, 'headline');
  const first = host.children;
  clock = { ...LIVE, currentIso: '2026-09-25T18:04:12.000Z' };
  story.render();
  assert.equal(host.children, first, 'un segundo más no repinta');
  story.setTarget({ title: 'Luna', kicker: 'OBJETIVO / LUNA' });
  assert.equal(host.dataset.mode, 'target');
  assert.notEqual(host.children, first);
  story.destroy();
});
