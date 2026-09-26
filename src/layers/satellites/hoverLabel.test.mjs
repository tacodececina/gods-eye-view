/**
 * Rótulo por intención (T4 paso 3): al pasar el ratón sobre un satélite se
 * publica como mucho un rótulo, limitado a 80 ms; en táctil no hay hover.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHoverLabel, HOVER_THROTTLE_MS } from './hoverLabel.js';

function harness(pickResult = 25544) {
  const published = [];
  let cleared = 0;
  let clock = 0;
  let picks = 0;
  let target = pickResult;
  const hover = createHoverLabel({
    pick: () => {
      picks += 1;
      return target;
    },
    entryFor: (id) =>
      id === null ? null : { id: String(id), title: `SAT ${id}` },
    publish: (entries) => published.push(entries),
    clear: () => {
      cleared += 1;
    },
    now: () => clock,
  });
  return {
    hover,
    published,
    cleared: () => cleared,
    picks: () => picks,
    tick: (ms) => {
      clock += ms;
    },
    setTarget: (id) => {
      target = id;
    },
  };
}

test('ratón sobre un satélite: publica un solo rótulo', () => {
  const h = harness();
  h.hover.onPointerMove({ pointerType: 'mouse', x: 10, y: 10 });
  assert.equal(h.published.length, 1);
  assert.equal(h.published[0].length, 1);
  assert.equal(h.published[0][0].title, 'SAT 25544');
  assert.equal(HOVER_THROTTLE_MS, 80);
});

test('limitado a 80 ms: no vuelve a elegir dentro de la ventana', () => {
  const h = harness();
  h.hover.onPointerMove({ pointerType: 'mouse', x: 10, y: 10 });
  h.tick(40);
  h.hover.onPointerMove({ pointerType: 'mouse', x: 12, y: 10 });
  assert.equal(h.picks(), 1);
  h.tick(41);
  h.hover.onPointerMove({ pointerType: 'mouse', x: 14, y: 10 });
  assert.equal(h.picks(), 2);
});

test('mismo objetivo no republica; salir del satélite limpia el rótulo', () => {
  const h = harness();
  h.hover.onPointerMove({ pointerType: 'mouse', x: 10, y: 10 });
  h.tick(100);
  h.hover.onPointerMove({ pointerType: 'mouse', x: 11, y: 10 });
  assert.equal(h.published.length, 1);
  h.setTarget(null);
  h.tick(100);
  h.hover.onPointerMove({ pointerType: 'mouse', x: 300, y: 10 });
  assert.equal(h.cleared(), 1);
});

test('en táctil y con lápiz no hay hover', () => {
  const h = harness();
  h.hover.onPointerMove({ pointerType: 'touch', x: 10, y: 10 });
  h.hover.onPointerMove({ pointerType: 'pen', x: 10, y: 10 });
  assert.equal(h.picks(), 0);
  assert.equal(h.published.length, 0);
});

test('destroy limpia el rótulo publicado', () => {
  const h = harness();
  h.hover.onPointerMove({ pointerType: 'mouse', x: 10, y: 10 });
  h.hover.destroy();
  assert.equal(h.cleared(), 1);
});
