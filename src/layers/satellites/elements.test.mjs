import test from 'node:test';
import assert from 'node:assert/strict';
import { propagate } from 'satellite.js';
import {
  classifyElementAge,
  dedupeElementsByNorad,
  elementEpochMs,
  normalizeNoradId,
  parseSatelliteElements,
} from './elements.js';
import {
  SAT_ELEMENT_HIGH_EXPIRED_MS,
  SAT_ELEMENT_HIGH_FRESH_MS,
  SAT_ELEMENT_LEO_EXPIRED_MS,
  SAT_ELEMENT_LEO_FRESH_MS,
  SAT_ELEMENT_LEO_MIN_REV_PER_DAY,
} from './policy.js';

const DAY_MS = 86_400_000;

// Real CelesTrak GP elements fetched on 2026-09-24 (CATNR=25544 and 20580),
// once as FORMAT=tle and once as FORMAT=json, for the same element set.
const ISS_TLE = [
  'ISS (ZARYA)             ',
  '1 25544U 98067A   26267.14191496  .00009634  00000+0  18116-3 0  9999',
  '2 25544  51.6318 170.3464 0004691 174.6338 185.4701 15.49258637587098',
];
const HST_TLE = [
  'HST                     ',
  '1 20580U 90037B   26266.94713825  .00005513  00000+0  16734-3 0  9992',
  '2 20580  28.4727 125.0661 0001663 151.6515 208.4172 15.31734421803723',
];
const ISS_OMM = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-09-24T03:24:21.452544',
  MEAN_MOTION: 15.49258637,
  ECCENTRICITY: 0.00046914,
  INCLINATION: 51.6318,
  RA_OF_ASC_NODE: 170.3464,
  ARG_OF_PERICENTER: 174.6338,
  MEAN_ANOMALY: 185.4701,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 58709,
  BSTAR: 0.00018115501,
  MEAN_MOTION_DOT: 9.634e-5,
  MEAN_MOTION_DDOT: 0,
};
const HST_OMM = {
  OBJECT_NAME: 'HST',
  OBJECT_ID: '1990-037B',
  EPOCH: '2026-09-23T22:43:52.744800',
  MEAN_MOTION: 15.31734421,
  ECCENTRICITY: 0.0001663,
  INCLINATION: 28.4727,
  RA_OF_ASC_NODE: 125.0661,
  ARG_OF_PERICENTER: 151.6515,
  MEAN_ANOMALY: 208.4172,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: 20580,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 80372,
  BSTAR: 0.00016734,
  MEAN_MOTION_DOT: 5.513e-5,
  MEAN_MOTION_DDOT: 0,
};
// Synthetic OMM fixture: a six-digit catalogue number, which TLE cannot carry.
const SIX_DIGIT_OMM = {
  OBJECT_NAME: 'P4 FIXTURE',
  NORAD_CAT_ID: '123456',
  EPOCH: '2026-09-20T12:00:00.000000',
  MEAN_MOTION: '15.5',
  ECCENTRICITY: '0.0001',
  INCLINATION: '51.6',
  RA_OF_ASC_NODE: '10',
  ARG_OF_PERICENTER: '20',
  MEAN_ANOMALY: '30',
  BSTAR: '0',
  EPHEMERIS_TYPE: '0',
  CLASSIFICATION_TYPE: 'U',
  ELEMENT_SET_NO: '1',
  REV_AT_EPOCH: '1',
};

/** The ISS element lines re-labelled with an Alpha-5 catalogue number. */
function alpha5Tle(satnum, name) {
  return [
    name,
    ISS_TLE[1].replace('25544U', `${satnum}U`),
    ISS_TLE[2].replace('2 25544', `2 ${satnum}`),
  ];
}

const tleText = (...records) => records.flat().join('\n');
const ISS_EPOCH_MS = Date.UTC(2026, 8, 24, 3, 24, 21, 452.544);

test('preserves a six-digit OMM identity and its ISO epoch exactly', () => {
  const now = Date.parse('2026-09-20T12:05:00Z');
  const [entry] = parseSatelliteElements({
    format: 'omm',
    body: JSON.stringify([SIX_DIGIT_OMM]),
    group: 'stations',
    fetchedAt: now,
    cacheStatus: 'MISS',
    now,
  });
  assert.equal(entry.noradId, 123456);
  assert.equal(entry.name, 'P4 FIXTURE');
  assert.equal(entry.group, 'stations');
  assert.equal(entry.elementFormat, 'omm');
  assert.equal(entry.elementEpochMs, Date.parse('2026-09-20T12:00:00Z'));
  assert.equal(entry.fetchedAt, now);
  assert.equal(entry.cacheStatus, 'MISS');
  assert.equal(entry.stale, false);
  assert.equal(entry.elementAge, 'vigente');
  assert.equal(entry.satrec.error, 0);
});

test('accepts a numeric six-digit NORAD and an already-decoded OMM array', () => {
  const [entry] = parseSatelliteElements({
    format: 'omm',
    body: [{ ...SIX_DIGIT_OMM, NORAD_CAT_ID: 123456 }],
    group: 'cubesat',
    now: Date.parse('2026-09-21T00:00:00Z'),
  });
  assert.equal(entry.noradId, 123456);
  assert.equal(entry.fetchedAt, null);
  assert.equal(entry.cacheStatus, 'NONE');
});

test('normalizeNoradId keeps safe positive integers and never truncates', () => {
  assert.equal(normalizeNoradId(25544), 25544);
  assert.equal(normalizeNoradId('25544'), 25544);
  assert.equal(normalizeNoradId(' 00005 '), 5);
  assert.equal(normalizeNoradId('123456'), 123456);
  for (const rejected of [
    '25544.9',
    25544.9,
    '25544.0',
    Number.MAX_SAFE_INTEGER + 1,
    String(Number.MAX_SAFE_INTEGER + 2),
    0,
    '0',
    -1,
    '-25544',
    '1e5',
    '0x10',
    '',
    '   ',
    NaN,
    Infinity,
    null,
    undefined,
    true,
    {},
    [25544],
  ]) {
    assert.equal(normalizeNoradId(rejected), null, `${String(rejected)}`);
  }
});

test('Alpha-5 identities are rejected, never turned into an invented number or NaN', () => {
  for (const alpha5 of ['A1234', 'T0002', 'Z9999', 'a1234']) {
    assert.equal(normalizeNoradId(alpha5), null, alpha5);
  }
  const entries = parseSatelliteElements({
    format: 'tle',
    body: tleText(
      ISS_TLE,
      alpha5Tle('T0001', 'ALPHA ONE'),
      alpha5Tle('T0002', 'ALPHA TWO'),
      HST_TLE,
    ),
    group: 'visual',
    now: ISS_EPOCH_MS,
  });
  const ids = entries.map((entry) => entry.noradId);
  assert.deepEqual(ids, [25544, 20580]);
  assert.equal(
    ids.some((id) => Number.isNaN(id)),
    false,
  );
  assert.equal(new Set(ids).size, ids.length);
});

test('parses real legacy TLE with trimmed names and TLE provenance', () => {
  const fetchedAt = ISS_EPOCH_MS + 60_000;
  const entries = parseSatelliteElements({
    format: 'tle',
    body: tleText(ISS_TLE, HST_TLE),
    group: 'visual',
    fetchedAt,
    cacheStatus: 'HIT',
    now: fetchedAt,
  });
  assert.deepEqual(
    entries.map(({ noradId, name, elementFormat, group }) => ({
      noradId,
      name,
      elementFormat,
      group,
    })),
    [
      {
        noradId: 25544,
        name: 'ISS (ZARYA)',
        elementFormat: 'tle',
        group: 'visual',
      },
      { noradId: 20580, name: 'HST', elementFormat: 'tle', group: 'visual' },
    ],
  );
  assert.equal(entries[0].cacheStatus, 'HIT');
  assert.equal(entries[0].fetchedAt, fetchedAt);
});

test('TLE and OMM epochs agree for the same element set', () => {
  const now = ISS_EPOCH_MS + DAY_MS;
  const tle = parseSatelliteElements({
    format: 'tle',
    body: tleText(ISS_TLE, HST_TLE),
    group: 'visual',
    now,
  });
  const omm = parseSatelliteElements({
    format: 'omm',
    body: JSON.stringify([ISS_OMM, HST_OMM]),
    group: 'visual',
    now,
  });
  assert.equal(tle.length, 2);
  assert.equal(omm.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(tle[i].noradId, omm[i].noradId);
    assert.ok(
      Math.abs(tle[i].elementEpochMs - omm[i].elementEpochMs) < 1,
      `${tle[i].name}: ${tle[i].elementEpochMs} vs ${omm[i].elementEpochMs}`,
    );
  }
  assert.ok(Math.abs(tle[0].elementEpochMs - ISS_EPOCH_MS) < 1);
});

test('elementEpochMs reads epochyr/epochdays as UTC and rejects invalid input', () => {
  assert.equal(
    elementEpochMs({ epochyr: 26, epochdays: 1 }),
    Date.UTC(2026, 0, 1),
  );
  assert.equal(
    elementEpochMs({ epochyr: 98, epochdays: 32.5 }),
    Date.UTC(1998, 1, 1, 12),
  );
  assert.equal(
    elementEpochMs({ epochyr: 57, epochdays: 1 }),
    Date.UTC(1957, 0, 1),
  );
  for (const invalid of [
    null,
    {},
    { epochyr: 26 },
    { epochyr: 26, epochdays: 0.5 },
    { epochyr: 26, epochdays: 367 },
    { epochyr: 100, epochdays: 1 },
    { epochyr: -1, epochdays: 1 },
    { epochyr: 26.5, epochdays: 1 },
    { epochyr: 26, epochdays: NaN },
  ]) {
    assert.equal(elementEpochMs(invalid), null, JSON.stringify(invalid));
  }
});

test('STALE-ERROR provenance survives while the orbit stays propagable', () => {
  const now = ISS_EPOCH_MS + 2 * 3_600_000;
  const [entry] = parseSatelliteElements({
    format: 'tle',
    body: tleText(ISS_TLE),
    group: 'stations',
    fetchedAt: ISS_EPOCH_MS - DAY_MS,
    cacheStatus: 'STALE-ERROR',
    now,
  });
  assert.equal(entry.cacheStatus, 'STALE-ERROR');
  assert.equal(entry.stale, true);
  assert.equal(
    entry.elementAge,
    'vigente',
    'age comes from the epoch, not fetchedAt',
  );
  const state = propagate(entry.satrec, new Date(now));
  assert.equal(typeof state.position, 'object');
  assert.ok(Number.isFinite(state.position.x));
});

test('unknown cache status and fetchedAt collapse to explicit absences', () => {
  const [entry] = parseSatelliteElements({
    format: 'tle',
    body: tleText(ISS_TLE),
    group: 'stations',
    fetchedAt: 'yesterday',
    cacheStatus: 'SOMETIMES',
    now: ISS_EPOCH_MS,
  });
  assert.equal(entry.cacheStatus, 'NONE');
  assert.equal(entry.fetchedAt, null);
  assert.equal(entry.stale, false);
});

test('an epoch later than now is labelled futura', () => {
  const [entry] = parseSatelliteElements({
    format: 'omm',
    body: [ISS_OMM],
    group: 'stations',
    now: ISS_EPOCH_MS - 1,
  });
  assert.equal(entry.elementAge, 'futura');
});

test('classifyElementAge applies the LEO and MEO/GEO thresholds from policy', () => {
  assert.equal(SAT_ELEMENT_LEO_MIN_REV_PER_DAY, 11.25);
  assert.equal(SAT_ELEMENT_LEO_FRESH_MS, 3 * DAY_MS);
  assert.equal(SAT_ELEMENT_LEO_EXPIRED_MS, 14 * DAY_MS);
  assert.equal(SAT_ELEMENT_HIGH_FRESH_MS, 14 * DAY_MS);
  assert.equal(SAT_ELEMENT_HIGH_EXPIRED_MS, 60 * DAY_MS);
  const epoch = Date.UTC(2026, 8, 1);
  const age = (days, meanMotionRevPerDay) =>
    classifyElementAge({
      elementEpochMs: epoch,
      now: epoch + days * DAY_MS,
      meanMotionRevPerDay,
    });
  assert.equal(age(0, 15.5), 'vigente');
  assert.equal(age(2.9, 15.5), 'vigente');
  assert.equal(age(3, 15.5), 'envejecida');
  assert.equal(age(14, 15.5), 'envejecida');
  assert.equal(age(14.1, 15.5), 'caducada');
  assert.equal(age(10, 2.0056), 'vigente');
  assert.equal(age(14, 2.0056), 'envejecida');
  assert.equal(age(60, 1.0027), 'envejecida');
  assert.equal(age(61, 1.0027), 'caducada');
  assert.equal(age(10, 11.25), 'vigente', '11.25 rev/day is not LEO');
  assert.equal(age(-0.001, 15.5), 'futura');
  assert.equal(
    classifyElementAge({
      elementEpochMs: null,
      now: epoch,
      meanMotionRevPerDay: 15,
    }),
    null,
  );
  assert.equal(
    classifyElementAge({
      elementEpochMs: epoch,
      now: epoch,
      meanMotionRevPerDay: NaN,
    }),
    null,
  );
});

test('malformed OMM bodies and records yield no entries instead of throwing', () => {
  const parse = (body) =>
    parseSatelliteElements({ format: 'omm', body, group: 'visual', now: 0 });
  assert.deepEqual(parse('No GP data found'), []);
  assert.deepEqual(parse('{"NORAD_CAT_ID":25544}'), []);
  assert.deepEqual(parse(''), []);
  const kept = parse([
    { ...ISS_OMM, NORAD_CAT_ID: 'T0002' },
    { ...ISS_OMM, NORAD_CAT_ID: 25544.5 },
    { ...ISS_OMM, EPOCH: 'not a date' },
    null,
    'ISS',
    HST_OMM,
  ]);
  assert.deepEqual(
    kept.map((entry) => entry.noradId),
    [20580],
  );
});

test('an unknown element format fails fast', () => {
  assert.throws(
    () => parseSatelliteElements({ format: 'xml', body: '', group: 'visual' }),
    TypeError,
  );
});

test('dedupe keeps the first group per NORAD so the ISS stays in stations', () => {
  const now = ISS_EPOCH_MS;
  const stations = parseSatelliteElements({
    format: 'omm',
    body: [ISS_OMM],
    group: 'stations',
    now,
  });
  const visual = parseSatelliteElements({
    format: 'tle',
    body: tleText(ISS_TLE, HST_TLE),
    group: 'visual',
    now,
  });
  const merged = dedupeElementsByNorad([...stations, ...visual]);
  assert.deepEqual(
    merged.map(({ noradId, group, elementFormat }) => [
      noradId,
      group,
      elementFormat,
    ]),
    [
      [25544, 'stations', 'omm'],
      [20580, 'visual', 'tle'],
    ],
  );
});
