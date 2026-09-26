/**
 * Viewport visual estrecho (fase visual T5, zoom 200 % en el teléfono): con
 * menos de 360 px visibles el carril de cámara se queda en Acercar, Alejar y
 * Global, y Norte, Retícula y Limpia pasan a «Más» (no se esconden: tienen
 * su botón allí, que ejecuta el mismo control).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isVisualNarrow } from './visualViewport.js';

test('estrecho por debajo de 360 px visibles', () => {
  assert.equal(isVisualNarrow(195), true);
  assert.equal(isVisualNarrow(359), true);
  assert.equal(isVisualNarrow(360), false);
  assert.equal(isVisualNarrow(1440), false);
  assert.equal(isVisualNarrow(Number.NaN), false);
});

test('Más ofrece Norte, Retícula y Vista limpia como el mismo control', () => {
  const html = readFileSync(
    new URL('../templates/eyeinsky.html', import.meta.url),
    'utf8',
  );
  const more =
    html.match(/<section data-eye-panel="more"[\s\S]*?<\/section>/)?.[0] ?? '';
  for (const id of ['eye-north', 'eye-grid', 'eye-clean'])
    assert.match(more, new RegExp(`data-eye-instrument-proxy="${id}"`));
});
