/**
 * Flecha de borde del objetivo fijado (fase visual T4, DESIGN-SYSTEM §6.12):
 * dentro del cuadro no hay flecha; fuera, un ancla en el borde con ángulo y
 * distancia en mono; tras la Tierra, la variante «tras la Tierra». Reutiliza
 * la geometría de la flecha de la Luna (resolveMoonReticle).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { edgeArrow, formatDistance } from './edgeArrow.js';

const viewport = { width: 1600, height: 900 };

test('objetivo dentro del cuadro: sin flecha', () => {
  assert.equal(
    edgeArrow({
      screenPos: { x: 800, y: 450 },
      viewport,
      inset: 24,
      dx: 1,
      dy: 0,
      distanceM: 1e6,
    }),
    null,
  );
});

test('fuera del cuadro: ancla en el borde, ángulo y distancia', () => {
  const arrow = edgeArrow({
    screenPos: null,
    viewport,
    inset: 24,
    dx: 5000,
    dy: 0,
    distanceM: 1_234_567,
  });
  assert.equal(arrow.mode, 'edge');
  assert.ok(
    arrow.x >= viewport.width - 24 - 1 && arrow.x <= viewport.width,
    `x=${arrow.x}`,
  );
  assert.equal(arrow.angleDeg, 90);
  assert.equal(arrow.distance, '1 235 km');
  assert.match(arrow.label, /Fuera de vista/);
});

test('tras la Tierra: variante propia aunque proyecte dentro del cuadro', () => {
  const arrow = edgeArrow({
    screenPos: { x: 800, y: 450 },
    viewport,
    inset: 24,
    dx: 0,
    dy: 1,
    distanceM: 9e6,
    occluded: true,
  });
  assert.equal(arrow.mode, 'behind');
  assert.equal(arrow.label, 'Tras la Tierra');
});

test('la distancia se escribe en km con separador fino, sin decimales falsos', () => {
  assert.equal(formatDistance(420_400), '420 km');
  assert.equal(formatDistance(35_786_000), '35 786 km');
  assert.equal(formatDistance(Number.NaN), '');
});
