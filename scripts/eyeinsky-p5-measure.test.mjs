import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chordDiameterPx,
  litFractionAlongAxis,
  litExtentPx,
  subPointArcmin,
} from './lib/eyeinsky-p5-measure.mjs';
import * as Cesium from 'cesium';

/**
 * Luna sintética: disco de radio r con Lambert + ambiente 0,04 sobre un
 * albedo con retícula (líneas finas más oscuras), Sol en ángulo de fase i
 * hacia +x en pantalla. k = (1 + cos i)/2.
 */
function syntheticMoon({ size, r, phaseDeg, gridEvery = 0 }) {
  const lum = new Array(size * size).fill(0);
  const c = (size - 1) / 2;
  const i = (phaseDeg * Math.PI) / 180;
  const s = [Math.sin(i), 0, Math.cos(i)];
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const nx = (x - c) / r;
      const ny = (y - c) / r;
      const q = 1 - nx * nx - ny * ny;
      if (q < 0) continue;
      const nz = Math.sqrt(q);
      const albedo = gridEvery && x % gridEvery === 0 ? 0.4 : 0.54;
      const lambert = Math.max(0, nx * s[0] + ny * s[1] + nz * s[2]);
      lum[y * size + x] = Math.min(255, 255 * albedo * (0.04 + lambert));
    }
  return { lum, center: { x: c, y: c }, k: (1 + Math.cos(i)) / 2 };
}

for (const phaseDeg of [60, 75.6, 101, 120]) {
  test(`fracción iluminada por el terminador (fase ${phaseDeg}°) ±1 %`, () => {
    const moon = syntheticMoon({ size: 241, r: 100, phaseDeg, gridEvery: 23 });
    const out = litFractionAlongAxis(moon.lum, 241, {
      center: moon.center,
      axis: { dx: 1, dy: 0 },
      radiusPx: 100,
    });
    assert.equal(out.status, 'ok');
    assert.ok(
      Math.abs(out.fraction - moon.k) <= 0.01,
      `${out.fraction} vs ${moon.k}`,
    );
  });
}

test('sin contraste (disco apagado) → no medible, nunca un número inventado', () => {
  const out = litFractionAlongAxis(new Array(101 * 101).fill(3), 101, {
    center: { x: 50, y: 50 },
    axis: { dx: 1, dy: 0 },
    radiusPx: 40,
  });
  assert.equal(out.status, 'not-measurable');
  assert.equal(out.fraction, null);
});

test('extensión iluminada: casi llena → diámetro del disco (±1 px)', () => {
  const moon = syntheticMoon({ size: 241, r: 100, phaseDeg: 10 });
  const out = litExtentPx(moon.lum, 241, 12);
  assert.ok(Math.abs(out.diameterPx - 200) <= 2, JSON.stringify(out));
});

test('diámetro por cuerdas desde el centro: las estrellas del fondo no lo inflan', () => {
  const moon = syntheticMoon({ size: 241, r: 60, phaseDeg: 10 });
  for (const [x, y] of [
    [3, 3],
    [230, 12],
    [15, 220],
    [238, 238],
  ])
    moon.lum[y * 241 + x] = 200;
  assert.ok(
    litExtentPx(moon.lum, 241, 12).diameterPx > 200,
    'la caja sí se infla',
  );
  const out = chordDiameterPx(moon.lum, 241, 12);
  assert.ok(Math.abs(out.diameterPx - 120) <= 2, JSON.stringify(out));
});

test('punto sublunar: la dirección de un punto del elipsoide da 0′; 1′ de latitud da 1′', () => {
  const row = { apparentLonDeg: 78.52, apparentLatDeg: 23.39 };
  const on = Cesium.Cartesian3.fromDegrees(78.52, 23.39, 0);
  assert.ok(subPointArcmin(on, row) < 1e-6);
  const off = Cesium.Cartesian3.fromDegrees(78.52, 23.39 + 1 / 60, 0);
  assert.ok(Math.abs(subPointArcmin(off, row) - 1) < 1e-6);
  const far = Cesium.Cartesian3.multiplyByScalar(
    on,
    60,
    new Cesium.Cartesian3(),
  );
  assert.ok(
    subPointArcmin(far, row) < 0.01,
    'a distancia lunar, misma dirección geocéntrica',
  );
});
