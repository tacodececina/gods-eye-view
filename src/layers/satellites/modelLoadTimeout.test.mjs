import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ISS,
  CUBE,
  flush,
  manualTimers,
  modelsHarness,
} from '../../testSupport/satelliteModelHarness.mjs';
import { SAT_MODEL_LOAD_TIMEOUT_MS } from './policy.js';
import { SAT_MODEL_DEFAULT_TIMERS } from './models.js';

const rows = [
  { noradId: ISS, group: 'stations', distanceM: 1000 },
  { noradId: CUBE, group: 'cubesat', distanceM: 5 },
];

test('a load that never settles frees its slot after 20 s and counts as a failure', () => {
  assert.equal(SAT_MODEL_LOAD_TIMEOUT_MS, 20000);
  const timers = manualTimers();
  const h = modelsHarness({ rows, profile: 'low', extra: { timers } });
  h.tick({ trackedNorad: ISS });
  assert.equal(h.loader.calls.length, 1, 'low profile: one slot');
  assert.deepEqual(timers.delays(), [SAT_MODEL_LOAD_TIMEOUT_MS]);
  assert.equal(h.models.getStats().pending, 1);

  timers.fireAll();
  const stats = h.models.getStats();
  assert.equal(stats.pending, 0, 'the slot is free again');
  assert.equal(stats.failed, 1, 'a timeout counts as a failed load');
  assert.equal(h.events.at(-1).type, 'model-failed');
  assert.equal(h.events.at(-1).noradId, ISS);
  assert.match(h.events.at(-1).message, /timeout/i);
  assert.equal(h.models.statusOf(ISS), 'fallido');
});

test('the late result of a timed-out load is destroyed, never admitted', async () => {
  const timers = manualTimers();
  const h = modelsHarness({ rows, profile: 'low', extra: { timers } });
  h.tick({ trackedNorad: ISS });
  const late = h.loader.calls[0];
  timers.fireAll();
  // The retry backoff passes; a fresh load takes the slot.
  h.clock.t += 5000;
  h.tick({ trackedNorad: ISS });
  assert.equal(h.loader.calls.length, 2);
  await late.resolve();
  assert.equal(late.model.destroyed, true, 'late model destroyed on arrival');
  const stats = h.models.getStats();
  assert.equal(stats.active, 0, 'the late model never entered the scene');
  assert.equal(stats.pending, 1, 'the fresh load keeps its slot');
  await h.loader.calls[1].resolve();
  assert.equal(h.models.getStats().active, 1);
  assert.equal(h.loader.calls[1].model.destroyed, false);
});

test('a late rejection of a timed-out load does not touch the fresh one', async () => {
  const timers = manualTimers();
  const h = modelsHarness({ rows, profile: 'low', extra: { timers } });
  h.tick({ trackedNorad: ISS });
  const late = h.loader.calls[0];
  timers.fireAll();
  h.clock.t += 5000;
  h.tick({ trackedNorad: ISS });
  await late.reject();
  const stats = h.models.getStats();
  assert.equal(stats.pending, 1, 'fresh load still pending');
  assert.equal(stats.failed, 1, 'the timeout was the only failure counted');
});

test('a load that settles in time clears its timer', async () => {
  const timers = manualTimers();
  const h = modelsHarness({ rows, profile: 'low', extra: { timers } });
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[0].resolve();
  await flush();
  assert.equal(timers.size, 0, 'no timer left behind');
  assert.equal(h.models.getStats().failed, 0);
});

test('destroy clears pending timers', () => {
  const timers = manualTimers();
  const h = modelsHarness({ rows, profile: 'low', extra: { timers } });
  h.tick({ trackedNorad: ISS });
  assert.equal(timers.size, 1);
  h.models.destroy();
  assert.equal(timers.size, 0);
});

// The production timers (not the manual ones above): a short REAL timeout
// must call its function, `clear` must cancel it, and the handle must not
// keep a Node process alive (the 20 s watchdog is unref'd).
test('default load timers really fire, clear cancels, and never hold the process', async () => {
  const fired = [];
  const handle = SAT_MODEL_DEFAULT_TIMERS.set(() => fired.push('a'), 5);
  const cancelled = SAT_MODEL_DEFAULT_TIMERS.set(() => fired.push('b'), 5);
  SAT_MODEL_DEFAULT_TIMERS.clear(cancelled);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(fired, ['a'], 'the live timer fired, the cleared one not');
  assert.equal(handle.hasRef?.(), false, 'unref: never holds the process');
});

test('without injected timers a pending load is failed by the real watchdog', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = modelsHarness({ rows, profile: 'low' });
  h.tick({ trackedNorad: ISS });
  assert.equal(h.models.getStats().pending, 1);
  t.mock.timers.tick(SAT_MODEL_LOAD_TIMEOUT_MS - 1);
  assert.equal(h.models.getStats().pending, 1, 'not before 20 s');
  t.mock.timers.tick(1);
  assert.equal(h.models.getStats().pending, 0, 'the slot is free at 20 s');
  assert.equal(h.models.statusOf(ISS), 'fallido');
});
