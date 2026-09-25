import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { utcIsoToTdbSeconds } from '../../time/timeScales.js';
import {
  MoonEphemerisFormatError,
  MoonEphemerisLoadError,
  loadMoonEphemeris,
} from './ephemeris.js';

const BIN_URL = new URL(
  '../../../public/data/moon-de441-2021-2040.bin',
  import.meta.url,
);
const FIXTURE = JSON.parse(
  readFileSync(
    new URL('../../data/fixtures/moon-horizons-icrf.json', import.meta.url),
    'utf8',
  ),
);
const BIN = readFileSync(fileURLToPath(BIN_URL));
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const naiveUtcSeconds = (iso) => (Date.parse(iso) - J2000_MS) / 1000;

/** fetch falso que sirve bytes (o un estado HTTP) sin red. */
const fakeFetch =
  (bytes, status = 200) =>
  async () => ({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
const load = (bytes = BIN, status) =>
  loadMoonEphemeris('/data/moon-de441-2021-2040.bin', {
    fetch: fakeFetch(bytes, status),
  });

const errKm = (p, r) => Math.hypot(p.x - r[0], p.y - r[1], p.z - r[2]);
const errArcmin = (p, r) => {
  const cos =
    (p.x * r[0] + p.y * r[1] + p.z * r[2]) /
    (Math.hypot(p.x, p.y, p.z) * Math.hypot(...r));
  return ((Math.acos(Math.min(1, cos)) * 180) / Math.PI) * 60;
};

test('P5-01: la tabla cabe ≤1 km y ≤0,01′ en las 40 épocas TDB del fixture (no ajustadas)', async () => {
  const ephemeris = await load();
  assert.ok(FIXTURE.icrfTdb.rows.length >= 10);
  const out = { x: 0, y: 0, z: 0 };
  for (const row of FIXTURE.icrfTdb.rows) {
    const sample = ephemeris.moonPositionIcrf(row.tdbSecondsJ2000, out);
    assert.equal(sample.status, 'ok');
    assert.equal(sample.source, 'DE441');
    assert.ok(
      errKm(sample.position, row.rKm) <= 1,
      `${row.calendarTdb}: ${errKm(sample.position, row.rKm)} km`,
    );
    assert.ok(
      errArcmin(sample.position, row.rKm) <= 0.01,
      `${row.calendarTdb}`,
    );
  }
});

test('P5-02: con épocas UTC de Horizons, la vía UTC→TDB pasa y «UTC como TDB» falla (~70 km)', async () => {
  const ephemeris = await load();
  for (const row of FIXTURE.icrfUt.rows) {
    const good = ephemeris.moonPositionIcrf(utcIsoToTdbSeconds(row.utcIso), {
      x: 0,
      y: 0,
      z: 0,
    });
    assert.ok(
      errKm(good.position, row.rKm) <= 1,
      `${row.utcIso} TDB ${errKm(good.position, row.rKm)} km`,
    );
    const bad = ephemeris.moonPositionIcrf(naiveUtcSeconds(row.utcIso), {
      x: 0,
      y: 0,
      z: 0,
    });
    const km = errKm(bad.position, row.rKm);
    assert.ok(km > 50 && km < 90, `${row.utcIso} UTC-como-TDB ${km} km`);
  }
});

test('fuera de [validFrom, validTo] devuelve out-of-range tipado, sin posición', async () => {
  const ephemeris = await load();
  const { validFrom, validTo } = ephemeris;
  // Calendario TDB 2021-01-01T00:00 .. 2041-01-01T00:00 (fin de 2040-12-31).
  assert.equal(validFrom, naiveUtcSeconds('2021-01-01T00:00:00Z'));
  assert.equal(validTo, naiveUtcSeconds('2041-01-01T00:00:00Z'));
  for (const t of [validFrom - 1, validTo + 1]) {
    const out = ephemeris.moonPositionIcrf(t, { x: 0, y: 0, z: 0 });
    assert.deepEqual(out, {
      status: 'out-of-range',
      validFrom,
      validTo,
      source: 'DE441',
    });
  }
  assert.equal(
    ephemeris.moonPositionIcrf(validTo, { x: 0, y: 0, z: 0 }).status,
    'ok',
  );
  assert.throws(
    () => ephemeris.moonPositionIcrf(Number.NaN, { x: 0, y: 0, z: 0 }),
    TypeError,
  );
});

test('cabecera corrupta o carga alterada → MoonEphemerisFormatError con código', async () => {
  const badMagic = Uint8Array.from(BIN);
  badMagic[0] = 0x58;
  await assert.rejects(
    load(badMagic),
    (e) => e instanceof MoonEphemerisFormatError && e.code === 'bad-magic',
  );
  const badVersion = Uint8Array.from(BIN);
  badVersion[8] = 9;
  await assert.rejects(load(badVersion), (e) => e.code === 'bad-version');
  await assert.rejects(
    load(BIN.subarray(0, 100)),
    (e) => e.code === 'truncated',
  );
  await assert.rejects(
    load(BIN.subarray(0, BIN.length - 4)),
    (e) => e.code === 'truncated',
  );
  const tampered = Uint8Array.from(BIN);
  tampered[tampered.length - 1] ^= 0xff;
  await assert.rejects(
    load(tampered),
    (e) => e instanceof MoonEphemerisFormatError && e.code === 'bad-hash',
  );
});

test('HTTP fallido → MoonEphemerisLoadError', async () => {
  await assert.rejects(
    load(BIN, 404),
    (e) => e instanceof MoonEphemerisLoadError && /404/.test(e.message),
  );
});

test('la cabecera expone DE441, marco ICRF geocéntrico, km, 8 d, orden 10', async () => {
  const ephemeris = await load();
  assert.deepEqual(
    {
      source: ephemeris.source,
      frame: ephemeris.frame,
      units: ephemeris.units,
      segmentDays: ephemeris.segmentSeconds / 86400,
      order: ephemeris.order,
    },
    {
      source: 'DE441',
      frame: 'ICRF geocéntrico',
      units: 'km',
      segmentDays: 8,
      order: 10,
    },
  );
});

test('coste: 10 000 evaluaciones de tabla < 20 ms', async () => {
  const ephemeris = await load();
  const out = { x: 0, y: 0, z: 0 };
  const span = ephemeris.validTo - ephemeris.validFrom;
  const run = () => {
    const start = performance.now();
    for (let i = 0; i < 10_000; i += 1)
      ephemeris.moonPositionIcrf(
        ephemeris.validFrom + (i / 10_000) * span,
        out,
      );
    return performance.now() - start;
  };
  run();
  const best = Math.min(run(), run(), run());
  assert.ok(best < 20, `${best.toFixed(2)} ms`);
});
