import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { twoline2satrec } from 'satellite.js';
import { createOrbits, propagateStateEcef } from './orbits.js';

// Real ISS elements (CelesTrak, 2026-09-24), propagated two hours past epoch.
const ISS = twoline2satrec(
  '1 25544U 98067A   26267.14191496  .00009634  00000+0  18116-3 0  9999',
  '2 25544  51.6318 170.3464 0004691 174.6338 185.4701 15.49258637587098',
);
const AT = new Date(Date.UTC(2026, 8, 24, 5, 24, 21));

test('propagateStateEcef returns ECEF metres and an orbital-speed velocity', () => {
  const state = propagateStateEcef(ISS, AT);
  assert.ok(state.position instanceof Cesium.Cartesian3);
  assert.ok(state.velocity instanceof Cesium.Cartesian3);
  const radiusKm = Cesium.Cartesian3.magnitude(state.position) / 1000;
  assert.ok(radiusKm > 6700 && radiusKm < 6850, `|r| ${radiusKm} km`);
  const speedKmS = Cesium.Cartesian3.magnitude(state.velocity) / 1000;
  assert.ok(Math.abs(speedKmS - 7.66) < 0.1, `|v| ${speedKmS} km/s`);
});

test('propagateStateEcef shares its sample with propagatePosition', () => {
  const orbits = createOrbits({
    state: {},
    services: {},
    parts: {},
    source: {},
  });
  const geo = orbits.propagatePosition(ISS, AT);
  const state = orbits.propagateStateEcef(ISS, AT);
  const fromGeo = Cesium.Cartesian3.fromDegrees(
    geo.longitude,
    geo.latitude,
    geo.altitude,
  );
  // satellite.js geodetic (WGS72-ish ellipsoid in eciToGeodetic) vs Cesium
  // WGS84: the same sample agrees to within tens of metres.
  const gap = Cesium.Cartesian3.distance(fromGeo, state.position);
  assert.ok(gap < 100, `gap ${gap} m`);
  assert.ok(
    Math.abs(Cesium.Cartesian3.magnitude(state.velocity) - geo.speedMps) < 1e-6,
  );
});

test('propagateStateEcef returns null when SGP4 fails', () => {
  const decayed = { ...ISS, error: 0 };
  assert.equal(
    propagateStateEcef(decayed, new Date(Date.UTC(2090, 0, 1))),
    null,
  );
  assert.equal(propagateStateEcef(null, AT), null);
});

test('propagateStateEcef writes into a caller result without allocating it', () => {
  const result = {
    position: new Cesium.Cartesian3(),
    velocity: new Cesium.Cartesian3(),
  };
  const state = propagateStateEcef(ISS, AT, result);
  assert.equal(state, result, 'returns the result holder');
  assert.equal(state.position, result.position, 'reuses the position');
  assert.equal(state.velocity, result.velocity, 'reuses the velocity');
  const fresh = propagateStateEcef(ISS, AT);
  assert.ok(Cesium.Cartesian3.equals(fresh.position, result.position));
  assert.ok(Cesium.Cartesian3.equals(fresh.velocity, result.velocity));
});
