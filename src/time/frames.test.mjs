import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after } from 'node:test';
import * as Cesium from 'cesium';
import { ensureIcrfFixed, icrfToFixed } from './frames.js';

const EPOCH = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');

/** Transforms falso: sin datos XYS y con TEME envenenado. */
function transformsWithoutData() {
  const calls = { teme: 0, icrf: 0, preload: [] };
  return {
    calls,
    computeIcrfToFixedMatrix() {
      calls.icrf += 1;
      return undefined;
    },
    computeTemeToPseudoFixedMatrix() {
      calls.teme += 1;
      throw new Error('TEME prohibido');
    },
    preloadIcrfFixed(interval) {
      calls.preload.push(interval);
      return Promise.reject(new Error('XYS 404'));
    },
  };
}

/*
 * Precarga real con los datos IAU2006 XYS que trae Cesium: el cargador de
 * Resource se sustituye por uno que lee los JSON de node_modules (Node no
 * tiene XMLHttpRequest). Es solo transporte; el cálculo es el de Cesium.
 */
const require = createRequire(import.meta.url);
const XYS_DIR = path.join(
  path.dirname(require.resolve('@cesium/engine/package.json')),
  'Source/Assets/IAU2006_XYS',
);
const originalLoad = Cesium.Resource._Implementations.loadWithXhr;
const originalXys = Cesium.Transforms.iau2006XysData;
let xysRequests = 0;
Cesium.Resource._Implementations.loadWithXhr = (url, ...rest) => {
  const deferred = rest[4];
  const chunk = /IAU2006_XYS_(\d+)\.json/.exec(url);
  if (!chunk) return deferred.reject(new Error(`URL inesperada ${url}`));
  xysRequests += 1;
  deferred.resolve(
    readFileSync(path.join(XYS_DIR, `IAU2006_XYS_${chunk[1]}.json`), 'utf8'),
  );
};
Cesium.Transforms.iau2006XysData = new Cesium.Iau2006XysData({
  xysFileUrlTemplate: 'https://xys.invalid/IAU2006_XYS_{0}.json',
});
after(() => {
  Cesium.Resource._Implementations.loadWithXhr = originalLoad;
  Cesium.Transforms.iau2006XysData = originalXys;
});

test('P5-10: sin precarga icrfToFixed devuelve «unavailable» y nunca toca TEME', () => {
  const transforms = transformsWithoutData();
  const out = icrfToFixed(EPOCH, new Cesium.Matrix3(), { transforms });
  assert.equal(out.status, 'unavailable');
  assert.equal(out.matrix, undefined);
  assert.equal(transforms.calls.icrf, 1);
  assert.equal(transforms.calls.teme, 0);
});

test('P5-10: si la precarga falla, ensureIcrfFixed resuelve «unavailable» con el motivo', async () => {
  const transforms = transformsWithoutData();
  const out = await ensureIcrfFixed(EPOCH, { transforms });
  assert.equal(out.status, 'unavailable');
  assert.match(out.reason, /XYS 404/);
  assert.equal(transforms.calls.teme, 0);
  const [interval] = transforms.calls.preload;
  assert.ok(
    interval instanceof Cesium.TimeInterval,
    'precarga con TimeInterval',
  );
  const spanDays = Cesium.JulianDate.daysDifference(
    interval.stop,
    interval.start,
  );
  assert.ok(Math.abs(spanDays - 2) < 1e-9, `±1 d de la época (${spanDays} d)`);
});

test('P5-03: tras ensureIcrfFixed (XYS reales) la matriz ICRF→ITRF es la de Cesium y es ortonormal', async () => {
  const before = icrfToFixed(EPOCH, new Cesium.Matrix3());
  assert.equal(before.status, 'unavailable', 'sin precarga no hay matriz');
  const ready = await ensureIcrfFixed(EPOCH);
  assert.equal(ready.status, 'ok');
  assert.ok(xysRequests > 0, 'la precarga pidió trozos XYS');
  const result = new Cesium.Matrix3();
  const out = icrfToFixed(EPOCH, result);
  assert.equal(out.status, 'ok');
  assert.equal(out.matrix, result, 'reutiliza el Matrix3 del llamador');
  const reference = Cesium.Transforms.computeIcrfToFixedMatrix(EPOCH);
  assert.ok(Cesium.Matrix3.equalsEpsilon(out.matrix, reference, 0, 0));
  const identity = Cesium.Matrix3.multiply(
    out.matrix,
    Cesium.Matrix3.transpose(out.matrix, new Cesium.Matrix3()),
    new Cesium.Matrix3(),
  );
  assert.ok(
    Cesium.Matrix3.equalsEpsilon(identity, Cesium.Matrix3.IDENTITY, 1e-12),
  );
  assert.ok(Math.abs(Cesium.Matrix3.determinant(out.matrix) - 1) < 1e-12);
});

test('icrfToFixed y ensureIcrfFixed rechazan lo que no es JulianDate', async () => {
  assert.throws(() => icrfToFixed({}, new Cesium.Matrix3()), TypeError);
  await assert.rejects(() => ensureIcrfFixed('2026-09-25'), TypeError);
});

/*
 * Gate de marco P5-03 (≤ 0,5′) frente a Horizons ITRF93: punto sublunar del
 * fixture (tiempo de luz sin aberración, ver `lightTimeModel`). La Luna sale
 * de la tabla DE441; la matriz, de frames.js con XYS reales.
 */
const FIXTURE = JSON.parse(
  readFileSync(
    new URL('../data/fixtures/moon-horizons-icrf.json', import.meta.url),
    'utf8',
  ),
);
const BIN = readFileSync(
  new URL('../../public/data/moon-de441-2021-2040.bin', import.meta.url),
);
const AU_KM = 149_597_870.7;
const C_KM_S = 299_792.458;

async function loadTable() {
  const { loadMoonEphemeris } = await import('../layers/moon/ephemeris.js');
  const bytes = BIN.buffer.slice(
    BIN.byteOffset,
    BIN.byteOffset + BIN.byteLength,
  );
  return loadMoonEphemeris('fixture', {
    fetch: async () => ({ ok: true, arrayBuffer: async () => bytes }),
  });
}

/** Separación (′) entre el punto sublunar calculado y el de Horizons. */
function subPointArcmin(fixedDirection, row) {
  const ray = new Cesium.Ray(
    Cesium.Cartesian3.ZERO,
    Cesium.Cartesian3.normalize(fixedDirection, new Cesium.Cartesian3()),
  );
  const hit = Cesium.IntersectionTests.rayEllipsoid(
    ray,
    Cesium.Ellipsoid.WGS84,
  );
  const carto = Cesium.Ellipsoid.WGS84.cartesianToCartographic(
    Cesium.Ray.getPoint(ray, hit.stop, new Cesium.Cartesian3()),
  );
  const dLon =
    ((Cesium.Math.toDegrees(carto.longitude) - row.apparentLonDeg + 540) %
      360) -
    180;
  const dLat = Cesium.Math.toDegrees(carto.latitude) - row.apparentLatDeg;
  return (
    Math.hypot(
      dLon * Math.cos(Cesium.Math.toRadians(row.apparentLatDeg)),
      dLat,
    ) * 60
  );
}

/** Vector Tierra(t−τ)→Luna(t) en ICRF (km) y la época t−τ. */
async function lightTimeGeometry(table, row) {
  const { utcIsoToTdbSeconds } = await import('./timeScales.js');
  const tau = (row.deltaAu * AU_KM) / C_KM_S;
  const p = table.moonPositionIcrf(utcIsoToTdbSeconds(row.utcIso), {
    x: 0,
    y: 0,
    z: 0,
  }).position;
  const v = row.earthBarycentricVelocityKmS;
  const vector = new Cesium.Cartesian3(
    p.x + v[0] * tau,
    p.y + v[1] * tau,
    p.z + v[2] * tau,
  );
  const epoch = Cesium.JulianDate.addSeconds(
    Cesium.JulianDate.fromIso8601(row.utcIso),
    -tau,
    new Cesium.JulianDate(),
  );
  return { vector, epoch };
}

test('P5-03: ICRF→ITRF (XYS, sin TEME) ≤ 0,5′ frente a los 10 puntos sublunares ITRF93 de Horizons', async () => {
  const table = await loadTable();
  assert.equal(FIXTURE.subMoonItrf.rows.length, 10);
  for (const row of FIXTURE.subMoonItrf.rows) {
    const { vector, epoch } = await lightTimeGeometry(table, row);
    assert.equal((await ensureIcrfFixed(epoch)).status, 'ok');
    const { matrix } = icrfToFixed(epoch, new Cesium.Matrix3());
    const fixed = Cesium.Matrix3.multiplyByVector(
      matrix,
      vector,
      new Cesium.Cartesian3(),
    );
    const arcmin = subPointArcmin(fixed, row);
    assert.ok(arcmin <= 0.5, `${row.utcIso}: ${arcmin.toFixed(4)}′`);
  }
});

test('control negativo: la matriz TEME (sin precesión-nutación) no pasa el gate de 0,5′', async () => {
  const table = await loadTable();
  const worst = Math.max(
    ...(await Promise.all(
      FIXTURE.subMoonItrf.rows.map(async (row) => {
        const { vector, epoch } = await lightTimeGeometry(table, row);
        const teme = Cesium.Transforms.computeTemeToPseudoFixedMatrix(
          epoch,
          new Cesium.Matrix3(),
        );
        return subPointArcmin(
          Cesium.Matrix3.multiplyByVector(
            teme,
            vector,
            new Cesium.Cartesian3(),
          ),
          row,
        );
      }),
    )),
  );
  assert.ok(worst > 10, `TEME ${worst.toFixed(1)}′`);
});
