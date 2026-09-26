/**
 * Generador del SkyBox sobrio (fase visual T2, D4): cielo verdadero desde el
 * Yale Bright Star Catalogue (V/50), determinista, con estrellas de ≤ 2 px y
 * luminancia ≤ .45, 6 caras de 1024 px que suman < 1,5 MB.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import {
  CATALOG_SHA256,
  FACE_NAMES,
  encodeGrayPng,
  faceCoords,
  parseBsc5,
  renderFaces,
  starDirection,
} from './eyeinsky-skybox.mjs';

// Tres filas reales del catálogo V/50 (HR 2491 Sirio, HR 1713 Rigel, HR 1).
const SIRIUS =
  '2491  9Alp CMaBD-16 1591  48915151881 257I   5423           064044.6-163444064508.9-164258227.22-08.88-1.46   0.00 -0.05 -0.03   A1Vm               -0.553-1.205 +.375-008SBO    13 10.3  11.2AB   4*';
const RIGEL =
  '1713 19Bet OriBD-08 1063  34085131907 194I   3823   1882    050943.9-081901051432.3-081206209.24-25.25 0.12  -0.03 -0.66 -0.02   B8Ia:             e 0.000-0.001 +.013+021SB     33  6.5   9.5AB   4*';
const FAINT =
  '   1          BD+44 4550      3 36042          46           000001.1+444022000509.9+451345114.44-16.88 6.70  +0.07 +0.08         A1Vn               -0.012-0.018      -018      195  4.2  21.6AC   3';

test('parseBsc5 lee HR, posición J2000 y Vmag de las columnas CDS', () => {
  const stars = parseBsc5([SIRIUS, RIGEL, FAINT, ''].join('\n'));
  assert.equal(stars.length, 3);
  const sirius = stars.find((s) => s.hr === 2491);
  assert.ok(Math.abs(sirius.raDeg - 101.287) < 0.01, `${sirius.raDeg}`);
  assert.ok(Math.abs(sirius.decDeg - -16.716) < 0.01, `${sirius.decDeg}`);
  assert.equal(sirius.vmag, -1.46);
  assert.equal(stars.find((s) => s.hr === 1).vmag, 6.7);
});

test('starDirection: RA 0 / Dec 0 → +X; Dec +90 → +Z; RA 90 → +Y', () => {
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-12);
  assert.ok(near(starDirection(0, 0), [1, 0, 0]));
  assert.ok(near(starDirection(90, 0), [0, 1, 0]));
  assert.ok(near(starDirection(0, 90), [0, 0, 1]));
});

test('faceCoords sigue la convención GL del cubo con flipY (fila 0 arriba)', () => {
  const size = 1024;
  const c = (dir) => faceCoords(dir, size);
  assert.deepEqual(c([1, 0, 0]), { face: 'px', x: 511.5, y: 511.5 });
  assert.equal(c([-1, 0, 0]).face, 'nx');
  assert.equal(c([0, 1, 0]).face, 'py');
  assert.equal(c([0, -1, 0]).face, 'ny');
  assert.equal(c([0, 0, 1]).face, 'pz');
  assert.equal(c([0, 0, -1]).face, 'nz');
  // +X: s = -z, t = -y → con flipY la fila crece con +y.
  const up = c([1, 0.5, 0]);
  assert.equal(up.face, 'px');
  assert.ok(up.y > 511.5, 'y positiva baja en la imagen de +X');
  const left = c([1, 0, 0.5]);
  assert.ok(left.x < 511.5, 'z positiva va a la izquierda en +X');
});

test('renderFaces: determinista, ≤ 2 px por estrella y pico ≤ .45 de luminancia', () => {
  const stars = [
    { hr: 1, raDeg: 10, decDeg: 5, vmag: -1.46 },
    { hr: 2, raDeg: 200, decDeg: -40, vmag: 3 },
    { hr: 3, raDeg: 80, decDeg: 70, vmag: 5 },
    { hr: 4, raDeg: 81, decDeg: 70, vmag: 5.4 },
  ];
  const a = renderFaces(stars, { size: 64 });
  const b = renderFaces(stars, { size: 64 });
  const hash = (faces) =>
    createHash('sha256')
      .update(Buffer.concat(FACE_NAMES.map((n) => Buffer.from(faces[n]))))
      .digest('hex');
  assert.equal(hash(a.faces), hash(b.faces));
  assert.equal(a.stats.drawn, 3, 'Vmag > 5 queda fuera');
  // Luminancia relativa del gris más claro ≤ .45.
  const max = Math.max(...FACE_NAMES.flatMap((n) => [...a.faces[n]]));
  const lum = ((max / 255 + 0.055) / 1.055) ** 2.4;
  assert.ok(lum <= 0.4501, `pico ${max} → L ${lum}`);
  assert.ok(a.stats.maxFootprint <= 2, `huella ${a.stats.maxFootprint} px`);
});

test('encodeGrayPng produce un PNG gris válido que conserva los píxeles', () => {
  const size = 8;
  const gray = new Uint8Array(size * size).map((_, i) => (i * 7) % 256);
  const png = encodeGrayPng(gray, size);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = png.indexOf(Buffer.from('IDAT'));
  const length = png.readUInt32BE(idat - 4);
  const raw = inflateSync(png.subarray(idat + 4, idat + 4 + length));
  const rows = [];
  for (let y = 0; y < size; y += 1)
    rows.push(...raw.subarray(y * (size + 1) + 1, (y + 1) * (size + 1)));
  assert.deepEqual(rows, [...gray]);
});

test('presupuesto: 6 caras de 1024 px con ~1600 estrellas < 1,5 MB', () => {
  let seed = 7;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const stars = Array.from({ length: 1600 }, (_, hr) => ({
    hr,
    raDeg: rand() * 360,
    decDeg: Math.asin(rand() * 2 - 1) * (180 / Math.PI),
    vmag: -1 + rand() * 6,
  }));
  const { faces } = renderFaces(stars, { size: 1024 });
  const bytes = FACE_NAMES.reduce(
    (sum, name) => sum + encodeGrayPng(faces[name], 1024).length,
    0,
  );
  assert.ok(bytes < 1.5 * 1024 * 1024, `${bytes} bytes`);
});

test('el catálogo esperado está fijado por SHA-256', () => {
  assert.match(CATALOG_SHA256, /^[0-9a-f]{64}$/);
});

test('precessJ2000 lleva J2000 a la época de generación (TEME de la fecha)', async () => {
  const { precessJ2000, EPOCH_YEAR } = await import('./eyeinsky-skybox.mjs');
  assert.equal(EPOCH_YEAR, 2026);
  const [x, y, z] = precessJ2000([1, 0, 0], 2026);
  const ra = (Math.atan2(y, x) * 180) / Math.PI;
  const dec = (Math.asin(z) * 180) / Math.PI;
  // 26 años: ΔRA ≈ 3.075 s/año · 26 ≈ 0.333°, ΔDec ≈ 20.04″/año · 26 ≈ 0.145°.
  assert.ok(Math.abs(ra - 0.333) < 0.01, `ΔRA ${ra}`);
  assert.ok(Math.abs(dec - 0.145) < 0.01, `ΔDec ${dec}`);
  const same = precessJ2000([0.3, 0.4, Math.sqrt(0.75)], 2000);
  assert.ok(Math.abs(same[2] - Math.sqrt(0.75)) < 1e-12);
});
