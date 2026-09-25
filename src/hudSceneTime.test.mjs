import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { formatSceneUtc, sunElevationDeg } from './hudSceneTime.js';

test('elevación solar desde el Sol fijo común: cenit, horizonte y bajo el horizonte', () => {
  const sunOver = (lonDeg, latDeg) =>
    Cesium.Cartesian3.multiplyByScalar(
      Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, 0),
      1.5e11 / 6.4e6,
      new Cesium.Cartesian3(),
    );
  assert.ok(Math.abs(sunElevationDeg(sunOver(0, 0), 0, 0) - 90) < 1e-6);
  assert.ok(Math.abs(sunElevationDeg(sunOver(90, 0), 0, 0)) < 0.01);
  assert.ok(sunElevationDeg(sunOver(180, 0), 0, 0) < -89.9);
  assert.ok(Number.isNaN(sunElevationDeg(null, 0, 0)));
});

test('el sello UTC del HUD es la hora de ESCENA; fuera de vivo lo dice', () => {
  const at = '2027-03-14T06:00:00.000Z';
  assert.equal(
    formatSceneUtc({ mode: 'live', currentIso: at, multiplier: 1 }),
    '2027-03-14 06:00:00Z',
  );
  assert.equal(
    formatSceneUtc({ mode: 'paused', currentIso: at, multiplier: 1 }),
    '2027-03-14 06:00:00Z · PAUSA',
  );
  assert.equal(
    formatSceneUtc({ mode: 'simulated', currentIso: at, multiplier: 600 }),
    '2027-03-14 06:00:00Z · SIM ×600',
  );
  assert.equal(
    formatSceneUtc(null, () => new Date(at)),
    '2027-03-14 06:00:00Z',
    'sin reloj de escena, la pared',
  );
});

test('hud.js usa el reloj de escena para el sello y el Sol común para SUN EL', async () => {
  const { readFileSync } = await import('node:fs');
  const hud = readFileSync(new URL('./hud.js', import.meta.url), 'utf8');
  assert.match(hud, /formatSceneUtc\(getViewerSceneClock\(this\.viewer\)/);
  assert.match(hud, /celestialFor\(this\.viewer\)\.sunFixedAt\(time/);
  assert.doesNotMatch(hud, /solar declination is approximated/i);
});
