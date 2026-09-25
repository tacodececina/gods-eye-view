import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  EARTH_ROTATION_RAD_S,
  apparentSubLunarFixed,
  earthVelocityIcrfKmS,
} from './subLunar.js';

const TIME = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');

test('velocidad orbital de la Tierra: ~29,3–30,3 km/s y perpendicular al Sol', () => {
  const v = earthVelocityIcrfKmS(TIME, new Cesium.Cartesian3());
  const speed = Cesium.Cartesian3.magnitude(v);
  assert.ok(speed > 29.2 && speed < 30.4, `${speed} km/s`);
  const sun =
    Cesium.Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
      TIME,
      new Cesium.Cartesian3(),
    );
  const cos =
    Cesium.Cartesian3.dot(v, sun) / (speed * Cesium.Cartesian3.magnitude(sun));
  assert.ok(Math.abs(cos) < 0.03, `cos ${cos}`);
});

test('tiempo de luz: la dirección gira +ω·τ en longitud y se desplaza v·τ', () => {
  const moonIcrfKm = new Cesium.Cartesian3(384_400, 0, 0);
  const out = apparentSubLunarFixed(
    {
      julianDate: TIME,
      moonIcrfKm,
      icrfToFixed: Cesium.Matrix3.IDENTITY,
    },
    new Cesium.Cartesian3(),
  );
  const tau = 384_400 / 299_792.458;
  const v = earthVelocityIcrfKmS(TIME, new Cesium.Cartesian3());
  const shifted = { x: 384_400 + v.x * tau, y: v.y * tau };
  const lon = Math.atan2(out.y, out.x);
  const expected =
    Math.atan2(shifted.y, shifted.x) + EARTH_ROTATION_RAD_S * tau;
  assert.ok(Math.abs(lon - expected) < 1e-12);
  assert.ok(Math.abs(out.z - v.z * tau) < 1e-9);
  const arcmin = (Math.abs(lon) * 180 * 60) / Math.PI;
  assert.ok(arcmin > 0.1 && arcmin < 1, `corrección ${arcmin}′`);
});
