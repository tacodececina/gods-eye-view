/**
 * Franja de créditos del teléfono (fase visual T5): el pie y la hoja se apoyan
 * SOBRE los créditos, que envuelven en 1–4 líneas según el ancho y el zoom.
 * Un alto supuesto dejaba el reloj tapado por «Powered by Esri» al 200 %.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creditsBandPx } from './creditsBand.js';

test('la franja es el alto real de los créditos, redondeado hacia arriba', () => {
  assert.equal(creditsBandPx({ height: 37.4, visible: true }), 38);
  assert.equal(creditsBandPx({ height: 81, visible: true }), 81);
});

test('sin créditos visibles no hay franja', () => {
  assert.equal(creditsBandPx({ height: 40, visible: false }), 0);
  assert.equal(creditsBandPx({ height: Number.NaN, visible: true }), 0);
});
