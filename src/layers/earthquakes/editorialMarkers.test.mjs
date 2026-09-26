/**
 * Sismos en la piel Editorial (fase visual T4, DESIGN-SYSTEM §6.13): ámbar
 * (magnitud), tamaño `4 + (M − 2.5)·3` px con halo de 6 px a .25, nunca rojo;
 * rótulo de magnitud solo por intención (al fijar, en el panel). Legacy no
 * cambia: disco por profundidad y rótulos ambientales.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { quakeLabelsAmbient, quakeMarkerLook } from './model.js';

const EDITORIAL = { style: 'editorial' };

test('editorial: punto ámbar con tamaño por magnitud y halo, sin rojo', () => {
  for (const [mag, px] of [
    [2.5, 4],
    [5, 11.5],
    [7, 17.5],
  ]) {
    for (const depth of [5, 120, 450]) {
      const look = quakeMarkerLook({ mag, depthKm: depth }, EDITORIAL);
      assert.equal(look.kind, 'point');
      assert.equal(look.pixelSize, px, `M${mag}`);
      assert.equal(look.color, '#e6b46d');
      assert.equal(look.haloPx, 6);
      assert.equal(look.haloAlpha, 0.25);
    }
  }
  assert.equal(
    quakeMarkerLook({ mag: 1.2 }, EDITORIAL).pixelSize,
    4,
    'suelo 4 px',
  );
});

test('legacy: disco por profundidad (rojo somero) sin cambios', () => {
  const look = quakeMarkerLook({ mag: 5, depthKm: 10 }, { style: 'legacy' });
  assert.equal(look.kind, 'ellipse');
  assert.equal(look.color, '#FF0000');
});

test('rótulos de magnitud: ambientales en legacy, por intención en editorial', () => {
  assert.equal(quakeLabelsAmbient({ style: 'legacy' }), true);
  assert.equal(quakeLabelsAmbient(EDITORIAL), false);
  assert.equal(quakeLabelsAmbient(undefined), true);
});
