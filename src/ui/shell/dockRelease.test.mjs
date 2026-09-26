/**
 * Cerrar el panel contextual (×) suelta el objetivo (reparación T5).
 *
 * Antes, × solo ocultaba el panel: `viewer.trackedEntity` seguía siendo la
 * ISS, la cámara quedaba enganchada a 794 km sobre el lado nocturno, «Apuntar
 * a la Luna» no fijaba nada y «Volver a Tierra» resucitaba el objetivo. Ahora
 * × equivale a soltar: la capa dueña deja de seguir (su verbo público
 * `stopTracking`), el viewer queda sin entidad enganchada y, si la cámara la
 * seguía, vuelve a Global.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseDockTarget } from './dockRelease.js';

function fixture({
  kind = 'tracked',
  layerId = 'satellites',
  tracked = true,
} = {}) {
  const calls = [];
  const viewer = { trackedEntity: tracked ? { id: 'iss' } : undefined };
  const module = {
    stopTracking(options) {
      calls.push(['stopTracking', options]);
      viewer.trackedEntity = undefined;
      return true;
    },
  };
  const layers = new Map([[layerId, { module }]]);
  return {
    calls,
    viewer,
    input: {
      context: { kind, layerId },
      layers,
      viewer,
      goGlobal: () => calls.push(['global']),
    },
  };
}

test('× con un objetivo seguido: la capa suelta y la cámara vuelve a Global', () => {
  const { calls, viewer, input } = fixture();
  const released = releaseDockTarget(input);
  assert.equal(released, true);
  assert.equal(viewer.trackedEntity, undefined);
  assert.deepEqual(calls, [['stopTracking', { origin: 'user' }], ['global']]);
});

test('× con el objetivo ya soltado por un gesto: deselecciona sin volar', () => {
  const { calls, viewer, input } = fixture({ tracked: false });
  assert.equal(releaseDockTarget(input), false);
  assert.equal(viewer.trackedEntity, undefined);
  assert.deepEqual(calls, [['stopTracking', { origin: 'user' }]]);
});

test('una capa sin stopTracking no deja la cámara enganchada', () => {
  const { viewer, input } = fixture();
  input.layers = new Map([['satellites', { module: {} }]]);
  assert.equal(releaseDockTarget(input), true);
  assert.equal(viewer.trackedEntity, undefined);
});

test('sin objetivo seguido (sismo, vista, Luna) × no toca la cámara', () => {
  const { calls, viewer, input } = fixture({ kind: 'event', tracked: false });
  assert.equal(releaseDockTarget(input), false);
  assert.equal(viewer.trackedEntity, undefined);
  assert.deepEqual(calls, []);
});

test('entradas ajenas no lanzan', () => {
  assert.equal(releaseDockTarget({}), false);
  assert.equal(releaseDockTarget(), false);
});
