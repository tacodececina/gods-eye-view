/**
 * P5 T9 — textura LROC (NASA SVS 4720, dominio público con crédito): 1k por
 * defecto; 2k solo en escritorio, con la Luna > 300 px y sin save-data; el
 * placeholder si la textura no carga. Los ficheros publicados son los del
 * ledger (bytes y sha256).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MOON_2K_MIN_PX,
  MOON_TEXTURES,
  chooseMoonTexture,
  moonDiameterPx,
} from './textureBudget.js';

const LEDGER = Object.freeze({
  '1k': [
    'b246064f217f8d479df78c49c7c8595a8f5fbda008a72fd539978d2e121e0109',
    139_068,
  ],
  '2k': [
    'f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170',
    457_942,
  ],
});

test('los ficheros publicados son los del ledger (sha256 y bytes) y llevan su hash corto en el nombre', () => {
  for (const [tier, [sha, bytes]] of Object.entries(LEDGER)) {
    const uri = MOON_TEXTURES[tier];
    assert.ok(uri.startsWith('models/moon/lroc-color-'), uri);
    assert.ok(uri.includes(sha.slice(0, 8)), uri);
    const data = readFileSync(
      new URL(`../../../public/${uri}`, import.meta.url),
    );
    assert.equal(data.length, bytes, uri);
    assert.equal(createHash('sha256').update(data).digest('hex'), sha, uri);
  }
});

test('1k por defecto; 2k solo escritorio, Luna > 300 px y sin save-data; nunca más de 2k', () => {
  const desktop = { mobile: false, saveData: false };
  assert.equal(MOON_2K_MIN_PX, 300);
  assert.equal(chooseMoonTexture({ ...desktop, moonPx: 16 }), '1k');
  assert.equal(chooseMoonTexture({ ...desktop, moonPx: 301 }), '2k');
  assert.equal(chooseMoonTexture({ ...desktop, moonPx: 300 }), '1k');
  assert.equal(
    chooseMoonTexture({ mobile: true, saveData: false, moonPx: 900 }),
    '1k',
  );
  assert.equal(
    chooseMoonTexture({ mobile: false, saveData: true, moonPx: 900 }),
    '1k',
  );
  assert.equal(chooseMoonTexture({ ...desktop, moonPx: Number.NaN }), '1k');
  assert.deepEqual(Object.keys(MOON_TEXTURES).sort(), ['1k', '2k']);
});

test('diámetro en px de la Luna vista desde la cámara', () => {
  const heightPx = 800;
  const fovyRad = Math.PI / 3;
  const d = moonDiameterPx({
    distanceM: 384_400_000,
    radiusM: 1_737_400,
    fovyRad,
    heightPx,
  });
  const focal = heightPx / 2 / Math.tan(fovyRad / 2);
  assert.ok(
    Math.abs(d - 2 * focal * Math.tan(Math.asin(1_737_400 / 384_400_000))) <
      1e-9,
  );
  assert.ok(d > 6 && d < 7, `${d} px a 60° en 800 px`);
  assert.equal(
    moonDiameterPx({ distanceM: 1_000, radiusM: 1_737_400, fovyRad, heightPx }),
    Infinity,
  );
});
