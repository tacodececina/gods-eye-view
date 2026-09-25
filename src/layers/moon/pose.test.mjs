import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  MOON_ORIENTATION_LABEL,
  MOON_TEXTURE_FIX,
  computeMoonModelMatrix,
  moonIcrfToBody,
  subEarthPoint,
} from './pose.js';
import { loadRepoMoonTable } from '../../testSupport/xysForTests.mjs';
import { utcIsoToTdbSeconds } from '../../time/timeScales.js';

const PHASE = JSON.parse(
  readFileSync(
    new URL('../../data/fixtures/moon-horizons-phase.json', import.meta.url),
    'utf8',
  ),
);

/** Separación angular (°) entre dos puntos lon/lat en grados. */
function separationDeg(a, b) {
  const r = Cesium.Math.toRadians;
  const cos =
    Math.sin(r(a.latDeg)) * Math.sin(r(b.latDeg)) +
    Math.cos(r(a.latDeg)) *
      Math.cos(r(b.latDeg)) *
      Math.cos(r(a.lonDeg - b.lonDeg));
  return Cesium.Math.toDegrees(Math.acos(Math.min(1, cos)));
}

test('P5-14: orientación IAU (síncrona) ≤ 1° frente al punto sub-Tierra MOON_ME de Horizons', async () => {
  const table = await loadRepoMoonTable();
  let worst = 0;
  for (const row of PHASE.rows) {
    const time = Cesium.JulianDate.fromIso8601(row.utcIso);
    const moon = table.moonPositionIcrf(
      utcIsoToTdbSeconds(row.utcIso),
      new Cesium.Cartesian3(),
    ).position;
    const ours = subEarthPoint(time, moon);
    const sep = separationDeg(ours, {
      lonDeg: row.subEarthLonDeg,
      latDeg: row.subEarthLatDeg,
    });
    worst = Math.max(worst, sep);
    assert.ok(sep <= 1, `${row.utcIso}: ${sep.toFixed(3)}°`);
    assert.ok(ours.lonDeg >= 0 && ours.lonDeg < 360, 'longitud Este 0..360');
  }
  assert.match(MOON_ORIENTATION_LABEL, /aproximada/);
  assert.ok(worst < 0.05, `regresión: peor ${worst}° (medido 0,009°)`);
});

test('moonIcrfToBody es una rotación (ortonormal, det 1)', () => {
  const m = moonIcrfToBody(
    Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z'),
    new Cesium.Matrix3(),
  );
  const identity = Cesium.Matrix3.multiply(
    m,
    Cesium.Matrix3.transpose(m, new Cesium.Matrix3()),
    new Cesium.Matrix3(),
  );
  assert.ok(
    Cesium.Matrix3.equalsEpsilon(identity, Cesium.Matrix3.IDENTITY, 1e-12),
  );
  assert.ok(Math.abs(Cesium.Matrix3.determinant(m) - 1) < 1e-12);
});

/** s de EllipsoidGeometry para una normal local (EllipsoidGeometry.js:526). */
const geometryS = (n) => Math.atan2(-n.y, -n.x) / (2 * Math.PI) + 0.5;

test('corrección de textura: longitud 0 al centro (s=0,5) y 90°E en s=0,75', () => {
  const fix = MOON_TEXTURE_FIX;
  const local = (lonDeg) => {
    const l = Cesium.Math.toRadians(lonDeg);
    const body = new Cesium.Cartesian3(Math.cos(l), Math.sin(l), 0);
    // modelo = cuerpo→fijo · FIX: la geometría local es FIXᵀ·cuerpo.
    return Cesium.Matrix3.multiplyByVector(
      Cesium.Matrix3.transpose(fix, new Cesium.Matrix3()),
      body,
      new Cesium.Cartesian3(),
    );
  };
  assert.ok(Math.abs(geometryS(local(0)) - 0.5) < 1e-12);
  assert.ok(Math.abs(geometryS(local(90)) - 0.75) < 1e-12);
  assert.ok(Math.abs(geometryS(local(-90)) - 0.25) < 1e-12);
  assert.ok(Object.isFrozen(fix));
});

test('modelMatrix: traslación = Luna fija (m), rotación cuerpo→fijo·FIX y escala didáctica', () => {
  const time = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');
  const icrfToFixed = Cesium.Matrix3.fromRotationZ(0.3);
  const moonFixedM = new Cesium.Cartesian3(3.8e8, 1e7, -2e7);
  const matrix = computeMoonModelMatrix(
    { julianDate: time, icrfToFixed, moonFixedM },
    new Cesium.Matrix4(),
  );
  assert.ok(
    Cesium.Cartesian3.equals(
      Cesium.Matrix4.getTranslation(matrix, new Cesium.Cartesian3()),
      moonFixedM,
    ),
  );
  const expected = Cesium.Matrix3.multiply(
    Cesium.Matrix3.multiply(
      icrfToFixed,
      Cesium.Matrix3.transpose(
        moonIcrfToBody(time, new Cesium.Matrix3()),
        new Cesium.Matrix3(),
      ),
      new Cesium.Matrix3(),
    ),
    MOON_TEXTURE_FIX,
    new Cesium.Matrix3(),
  );
  const rotation = Cesium.Matrix4.getMatrix3(matrix, new Cesium.Matrix3());
  assert.ok(Cesium.Matrix3.equalsEpsilon(rotation, expected, 1e-12));
  const scaled = computeMoonModelMatrix(
    { julianDate: time, icrfToFixed, moonFixedM, scale: 10 },
    new Cesium.Matrix4(),
  );
  const s = Cesium.Matrix4.getScale(scaled, new Cesium.Cartesian3());
  assert.ok(Math.abs(s.x - 10) < 1e-9 && Math.abs(s.z - 10) < 1e-9);
  assert.throws(
    () =>
      computeMoonModelMatrix(
        { julianDate: time, icrfToFixed, moonFixedM, scale: 0 },
        new Cesium.Matrix4(),
      ),
    RangeError,
  );
});

test('P5-07: la escala didáctica NO mueve la Luna: misma traslación y misma dirección de ejes', () => {
  const time = Cesium.JulianDate.fromIso8601('2031-02-01T00:00:00Z');
  const icrfToFixed = Cesium.Matrix3.fromRotationZ(-1.1);
  const moonFixedM = new Cesium.Cartesian3(-2.1e8, 3.05e8, 1.4e8);
  const pose = (scale) =>
    computeMoonModelMatrix(
      { julianDate: time, icrfToFixed, moonFixedM, scale },
      new Cesium.Matrix4(),
    );
  const physical = pose(1);
  const didactic = pose(10);
  const translation = (m) =>
    Cesium.Matrix4.getTranslation(m, new Cesium.Cartesian3());
  assert.ok(
    Cesium.Cartesian3.equals(translation(didactic), moonFixedM),
    'la traslación es la Luna fija, sin ×10',
  );
  assert.ok(Cesium.Cartesian3.equals(translation(physical), moonFixedM));
  const unit = (m) =>
    Cesium.Matrix3.multiplyByScalar(
      Cesium.Matrix4.getMatrix3(m, new Cesium.Matrix3()),
      1 / Cesium.Matrix4.getScale(m, new Cesium.Cartesian3()).x,
      new Cesium.Matrix3(),
    );
  assert.ok(
    Cesium.Matrix3.equalsEpsilon(unit(didactic), unit(physical), 1e-12),
    'misma orientación: solo cambia el radio',
  );
});
