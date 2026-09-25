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
import {
  HEADER_FIELDS,
  MOON_TABLE_HEADER_BYTES,
  MOON_TABLE_MAX_ORDER,
  decodeMoonTable,
} from './ephemerisFormat.js';

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

test('coste de 10 000 evaluaciones de tabla (informativo, no afirma tiempo)', async (t) => {
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
  assert.ok(Number.isFinite(best));
  t.diagnostic(
    `10 000 evaluaciones: ${best.toFixed(2)} ms (mejor de 3; informativo, depende del equipo)`,
  );
});

test('fronteras exactas: validFrom y validTo son ok; ±1 ms fuera es out-of-range', async () => {
  const ephemeris = await load();
  const { validFrom, validTo } = ephemeris;
  const at = (t) => ephemeris.moonPositionIcrf(t, { x: 0, y: 0, z: 0 });
  assert.equal(at(validFrom).status, 'ok');
  assert.equal(at(validTo).status, 'ok');
  assert.equal(at(validTo + 0.001).status, 'out-of-range');
  assert.equal(at(validFrom - 0.001).status, 'out-of-range');
  const r = Math.hypot(...Object.values(at(validFrom).position));
  assert.ok(r > 356_000 && r < 407_000, `|r| en validFrom = ${r} km`);
});

/** Copia de la tabla con la cabecera editada por `edit(view)`. */
function withHeader(edit) {
  const bytes = Uint8Array.from(BIN);
  edit(new DataView(bytes.buffer), bytes);
  return bytes;
}
const rejectsWith = (bytes, code, pattern) =>
  assert.rejects(
    load(bytes),
    (e) =>
      e instanceof MoonEphemerisFormatError &&
      e.code === code &&
      pattern.test(e.message),
  );

test('un coeficiente alterado en mitad de la carga lo detecta el hash (el decodificador solo no)', async () => {
  const bytes = Uint8Array.from(BIN);
  const view = new DataView(bytes.buffer);
  // Segmento 457 (≈2031), coeficiente X[0]: +1 km, un cambio plausible.
  const offset = MOON_TABLE_HEADER_BYTES + 457 * 3 * 11 * 4;
  view.setFloat32(offset, view.getFloat32(offset, true) + 1, true);
  assert.doesNotThrow(
    () => decodeMoonTable(bytes),
    'la cabecera sigue siendo coherente: solo el hash puede verlo',
  );
  await rejectsWith(bytes, 'bad-hash', /sha256/);
});

const F = HEADER_FIELDS;

test('ramas bad-header: unidades, nº de segmentos, payloadBytes y orden', async () => {
  await rejectsWith(
    withHeader((_v, b) => b.set([0x6d, 0, 0], F.units[0])),
    'bad-header',
    /Unidades m/,
  );
  await rejectsWith(
    withHeader((v) =>
      v.setUint32(F.segmentCount, v.getUint32(F.segmentCount, true) + 1, true),
    ),
    'bad-header',
    /segmentos/,
  );
  await rejectsWith(
    withHeader((v) =>
      v.setUint32(F.payloadBytes, v.getUint32(F.payloadBytes, true) - 4, true),
    ),
    'bad-header',
    /Carga declarada/,
  );
  for (const order of [0, MOON_TABLE_MAX_ORDER + 1])
    await rejectsWith(
      withHeader((v) => v.setUint32(F.order, order, true)),
      'bad-header',
      /Orden inválido/,
    );
  await rejectsWith(
    withHeader((v) => v.setUint32(F.order, 9, true)),
    'bad-header',
    /Carga declarada/,
  );
});

test('ramas bad-header: t0/t1, segmento y tamaño de cabecera', async () => {
  for (const t1 of [Number.NaN, 662_731_200, 0])
    await rejectsWith(
      withHeader((v) => v.setFloat64(F.t1, t1, true)),
      'bad-header',
      /t0\/t1/,
    );
  await rejectsWith(
    withHeader((v) => v.setFloat64(F.t0, Number.POSITIVE_INFINITY, true)),
    'bad-header',
    /t0\/t1/,
  );
  for (const seg of [0, -691_200, Number.NaN])
    await rejectsWith(
      withHeader((v) => v.setFloat64(F.segmentSeconds, seg, true)),
      'bad-header',
      /Segmento/,
    );
  await rejectsWith(
    withHeader((v) => v.setUint32(F.headerBytes, 128, true)),
    'bad-header',
    /Cabecera de 128/,
  );
});

test('sin crypto.subtle (o sin digest) → error tipado no-crypto; nunca acepta sin verificar', async () => {
  for (const subtle of [null, {}])
    await assert.rejects(
      loadMoonEphemeris('/t.bin', { fetch: fakeFetch(BIN), subtle }),
      (e) => e instanceof MoonEphemerisFormatError && e.code === 'no-crypto',
    );
  let digests = 0;
  const spy = {
    digest: async (...args) => {
      digests += 1;
      return globalThis.crypto.subtle.digest(...args);
    },
  };
  await loadMoonEphemeris('/t.bin', { fetch: fakeFetch(BIN), subtle: spy });
  assert.equal(digests, 1, 'la vía normal verifica el hash una vez');
});
