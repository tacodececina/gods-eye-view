import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSignals, signalState } from './eyeinskySignals.js';
const now = 1700000000000;
const rows = [
  { id: 'fixture-a', magnitude: 4, timeMs: now - 1000, lon: -100, lat: 20 },
  { id: 'fixture-b', magnitude: 5, timeMs: now - 7200000, lon: 130, lat: 30 },
];
test('filtering preserves stable identities and combines region, magnitude and time', () => {
  assert.deepEqual(
    filterSignals(rows, { magnitude: 2.5, hours: 24, sector: 'all' }, now).map(
      (r) => r.id,
    ),
    ['fixture-a', 'fixture-b'],
  );
  assert.deepEqual(
    filterSignals(
      rows,
      { magnitude: 2.5, hours: 24, sector: 'americas' },
      now,
    ).map((r) => r.id),
    ['fixture-a'],
  );
  assert.deepEqual(
    filterSignals(rows, { magnitude: 5, hours: 1, sector: 'all' }, now),
    [],
  );
});
test('failed refresh with cached data is stale, never empty or live', () => {
  assert.equal(
    signalState(
      { enabled: true, stats: { count: 2, error: 'offline', lastUpdate: now } },
      now,
    ),
    'stale',
  );
  assert.equal(
    signalState({ enabled: true, stats: { count: 0, error: 'offline' } }, now),
    'error',
  );
  assert.equal(
    signalState(
      { enabled: true, stats: { count: 2, lastUpdate: now - 301000 } },
      now,
    ),
    'delayed',
  );
  assert.equal(
    signalState({ enabled: true, stats: { count: 0, lastUpdate: now } }, now),
    'empty',
  );
});
