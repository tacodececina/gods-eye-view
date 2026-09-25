/**
 * P5 §6 · SISTEMA TIERRA–LUNA: la Tierra se queda en pocos píxeles. Un rótulo
 * «TIERRA» (mismo estilo que la retícula de la Luna) la señala cuando mide
 * < 40 px, y mientras la pose está activa se apartan las etiquetas que la
 * tapan (callouts de detección —GEO— y sismos); al salir, se restauran.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EARTH_LABEL_MAX_PX,
  createSystemDeclutter,
  resolveEarthLabel,
} from './eyeinskySystemView.js';

const frame = { width: 1280, height: 800 };

test('rótulo TIERRA solo con la Tierra < 40 px, delante y dentro del lienzo', () => {
  assert.equal(EARTH_LABEL_MAX_PX, 40);
  assert.deepEqual(
    resolveEarthLabel({
      ...frame,
      point: { x: 900.4, y: 300.6 },
      diameterPx: 12,
    }),
    { visible: true, x: 900, y: 301, text: 'TIERRA' },
  );
  for (const input of [
    { point: { x: 900, y: 300 }, diameterPx: 40 },
    { point: { x: 900, y: 300 }, diameterPx: 400 },
    { point: null, diameterPx: 10 },
    { point: { x: -5, y: 300 }, diameterPx: 10 },
    { point: { x: 900, y: 801 }, diameterPx: 10 },
    { point: { x: 900, y: 300 }, diameterPx: Number.NaN },
  ])
    assert.equal(
      resolveEarthLabel({ ...frame, ...input }).visible,
      false,
      JSON.stringify(input),
    );
});

function fakes({ alreadySuspended = false } = {}) {
  const log = [];
  let suspended = alreadySuspended;
  const detection = {
    suspend: (reason) => {
      suspended = true;
      log.push(['suspend', reason]);
    },
    resume: () => {
      suspended = false;
      log.push(['resume']);
    },
    isSuspended: () => suspended,
  };
  const overlays = {
    setSuppressed: (sourceId, owner, on) =>
      log.push(['overlay', sourceId, owner, on]),
  };
  return { log, detection, overlays };
}

test('despeje: aparta callouts y sismos al entrar y los devuelve al salir', () => {
  const { log, detection, overlays } = fakes();
  const declutter = createSystemDeclutter({ detection, overlays });
  declutter.set(true);
  declutter.set(true);
  assert.equal(declutter.isActive(), true);
  declutter.set(false);
  declutter.set(false);
  assert.deepEqual(log, [
    ['suspend', 'earth-moon-system'],
    ['overlay', 'earthquakes', 'earth-moon-system', true],
    ['resume'],
    ['overlay', 'earthquakes', 'earth-moon-system', false],
  ]);
});

test('despeje: no reanuda una detección que ya estaba suspendida por otro', () => {
  const { log, detection, overlays } = fakes({ alreadySuspended: true });
  const declutter = createSystemDeclutter({ detection, overlays });
  declutter.set(true);
  declutter.destroy();
  assert.deepEqual(log, [
    ['overlay', 'earthquakes', 'earth-moon-system', true],
    ['overlay', 'earthquakes', 'earth-moon-system', false],
  ]);
  assert.equal(detection.isSuspended(), true);
});
