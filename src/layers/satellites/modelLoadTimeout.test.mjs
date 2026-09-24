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
