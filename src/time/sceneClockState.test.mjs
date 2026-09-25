import assert from 'node:assert/strict';
import test from 'node:test';
import {
  captureSceneClockState,
  restoreSceneClockState,
} from './sceneClockState.js';

function fakeClock(state) {
  const calls = [];
  return {
    calls,
    getState: () => state,
    setNow: () => calls.push(['setNow']),
    setTime: (iso) => calls.push(['setTime', iso]),
    simulate: (m) => calls.push(['simulate', m]),
    pause: (why) => calls.push(['pause', why ?? null]),
  };
}

test('capturar y restaurar el reloj de escena (Director: stop/abort)', () => {
  const cases = [
    [
      { mode: 'live', multiplier: 1, currentIso: '2026-09-25T18:45:00.000Z' },
      [['setNow']],
    ],
    [
      {
        mode: 'simulated',
        multiplier: 600,
        currentIso: '2027-03-14T06:00:00.500Z',
      },
      [
        ['setTime', '2027-03-14T06:00:00.500Z'],
        ['simulate', 600],
      ],
    ],
    [
      {
        mode: 'paused',
        multiplier: 1,
        currentIso: '2030-06-21T12:00:00.000Z',
        reason: 'fuera de efemérides',
      },
      [
        ['setTime', '2030-06-21T12:00:00.000Z'],
        ['pause', 'fuera de efemérides'],
      ],
    ],
  ];
  for (const [state, expected] of cases) {
    const snapshot = captureSceneClockState(fakeClock(state));
    assert.ok(Object.isFrozen(snapshot));
    const target = fakeClock({ mode: 'simulated', multiplier: 3600 });
    restoreSceneClockState(target, snapshot);
    assert.deepEqual(target.calls, expected, state.mode);
  }
  assert.equal(captureSceneClockState(null), null);
  assert.doesNotThrow(() => restoreSceneClockState(null, null));
});
