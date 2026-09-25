import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoonDebug, p5DebugFields } from './moonDebug.js';

function fakeDataManager() {
  const calls = [];
  const module = {
    getState: () => ({ status: 'disabled' }),
    setScaleMode: (id) => calls.push(['scale', id]),
    debugAt: (iso) => ({ iso }),
  };
  return {
    calls,
    layers: new Map([['moon', { module }]]),
    setEnabled: async (id, enabled, options) => {
      calls.push(['setEnabled', id, enabled, options.origin]);
      return true;
    },
  };
}

test('__godsEyeView.moon enciende y apaga por el DataManager (estado de capa coherente)', async () => {
  const dataManager = fakeDataManager();
  const moon = createMoonDebug(dataManager);
  await moon.enable();
  await moon.disable();
  moon.setScaleMode('didactic');
  assert.deepEqual(dataManager.calls, [
    ['setEnabled', 'moon', true, 'programmatic'],
    ['setEnabled', 'moon', false, 'programmatic'],
    ['scale', 'didactic'],
  ]);
  assert.deepEqual(moon.getState(), { status: 'disabled' });
  assert.deepEqual(moon.debugAt('x'), { iso: 'x' });
});

test('sin capa Luna registrada, getState dice «absent» en vez de romper', () => {
  const moon = createMoonDebug({
    layers: new Map(),
    setEnabled: async () => false,
  });
  assert.deepEqual(moon.getState(), { status: 'absent' });
});

test('los campos P5 de __godsEyeView exponen reloj, marcos, Luna y anillo', () => {
  const sceneTime = {
    sceneClock: { id: 'clock' },
    framesDebug: { id: 'frames' },
  };
  const ring = { id: 'ring' };
  const fields = p5DebugFields({
    sceneTime,
    dataManager: fakeDataManager(),
    styleManager: { celestialRing: ring },
  });
  assert.equal(fields.sceneClock, sceneTime.sceneClock);
  assert.equal(fields.frames, sceneTime.framesDebug);
  assert.equal(fields.celestialRing, ring);
  assert.deepEqual(fields.moon.getState(), { status: 'disabled' });
});
