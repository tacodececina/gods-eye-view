/**
 * P5-11: en simulación no hay capas en vivo visibles; AHORA restaura
 * exactamente el conjunto suspendido (ni una más, ni una menos).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_LAYER_IDS,
  SUSPENDED_LABEL,
  createLiveSuspension,
  planSuspension,
} from './eyeinskyLiveSuspension.js';

/** DataManager mínimo: enabled por id y registro de llamadas. */
function fakeDataManager(enabled) {
  const state = new Map(enabled.map((id) => [id, true]));
  const calls = [];
  const listeners = new Set();
  return {
    calls,
    state,
    getAll: () => [...state].map(([id, on]) => ({ id, enabled: on })),
    isEnabled: (id) => state.get(id) === true,
    async setEnabled(id, on, options) {
      calls.push([id, on, options.origin]);
      state.set(id, on);
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    enabledIds: () =>
      [...state]
        .filter(([, on]) => on)
        .map(([id]) => id)
        .sort(),
  };
}

test('capas en vivo: feeds de hora real; satélites, Luna y referencias estáticas no', () => {
  for (const id of [
    'flights',
    'military',
    'ais-live-vessels',
    'earthquakes',
    'local-firms',
    'cctv',
  ])
    assert.ok(LIVE_LAYER_IDS.includes(id), id);
  for (const id of [
    'satellites',
    'moon',
    'local-dams',
    'military-installations',
  ])
    assert.equal(LIVE_LAYER_IDS.includes(id), false, id);
  assert.equal(SUSPENDED_LABEL, 'Sin histórico: solo hora real');
  assert.deepEqual(planSuspension(['moon', 'flights', 'satellites', 'cctv']), [
    'cctv',
    'flights',
  ]);
});

test('P5-11: simular suspende las capas en vivo y AHORA restaura EXACTAMENTE el mismo conjunto', async () => {
  const before = ['flights', 'earthquakes', 'satellites', 'moon', 'local-dams'];
  const dm = fakeDataManager(before);
  const suspension = createLiveSuspension({ dataManager: dm });
  await suspension.sync(true);
  assert.deepEqual(dm.enabledIds(), ['local-dams', 'moon', 'satellites']);
  assert.deepEqual(suspension.getSuspended(), ['earthquakes', 'flights']);
  await suspension.sync(true);
  assert.equal(dm.calls.length, 2, 'idempotente mientras sigue fuera de vivo');
  await suspension.sync(false);
  assert.deepEqual(dm.enabledIds(), [...before].sort());
  assert.deepEqual(suspension.getSuspended(), []);
  assert.ok(dm.calls.every(([, , origin]) => origin === 'programmatic'));
  suspension.destroy();
});

test('una capa en vivo encendida durante la simulación se suspende también (y vuelve con AHORA)', async () => {
  const dm = fakeDataManager(['flights']);
  const suspension = createLiveSuspension({ dataManager: dm });
  await suspension.sync(true);
  await dm.setEnabled('cctv', true, { origin: 'user' });
  await suspension.settled();
  assert.equal(dm.isEnabled('cctv'), false, 'nunca se presenta como histórica');
  assert.deepEqual(suspension.getSuspended(), ['cctv', 'flights']);
  await suspension.sync(false);
  assert.deepEqual(dm.enabledIds(), ['cctv', 'flights']);
  suspension.destroy();
});

test('apagar a mano una capa suspendida la saca del conjunto a restaurar', async () => {
  const dm = fakeDataManager(['flights', 'cctv']);
  const suspension = createLiveSuspension({ dataManager: dm });
  await suspension.sync(true);
  suspension.forget('cctv');
  await suspension.sync(false);
  assert.deepEqual(dm.enabledIds(), ['flights']);
  suspension.destroy();
  await suspension.sync(true);
  assert.deepEqual(dm.enabledIds(), ['flights'], 'destruida no toca nada');
});
