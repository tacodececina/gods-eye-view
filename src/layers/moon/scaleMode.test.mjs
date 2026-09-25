import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MOON_SCALE_MODE,
  DIDACTIC_BAND_TEXT,
  MOON_SCALE_MODES,
  resolveMoonScaleMode,
} from './scaleMode.js';

test('P5-07: el modo físico es el de por defecto, medible y validado contra DE441', () => {
  assert.equal(DEFAULT_MOON_SCALE_MODE, 'physical');
  const physical = resolveMoonScaleMode();
  assert.deepEqual(physical, {
    id: 'physical',
    radiusFactor: 1,
    measurable: true,
    validatedAgainst: 'NASA/JPL Horizons DE441',
    band: null,
  });
  assert.equal(Object.isFrozen(physical), true);
});

test('P5-07: el didáctico solo multiplica el radio ×10, con banda y sin validación', () => {
  const didactic = resolveMoonScaleMode('didactic');
  assert.equal(didactic.radiusFactor, 10);
  assert.equal(didactic.measurable, false);
  assert.equal(didactic.validatedAgainst, null);
  assert.equal(didactic.band, DIDACTIC_BAND_TEXT);
  assert.match(DIDACTIC_BAND_TEXT, /ESCALA DIDÁCTICA.*×10.*NO ES REAL/);
  assert.deepEqual(Object.keys(MOON_SCALE_MODES).sort(), [
    'didactic',
    'physical',
  ]);
});

test('un modo desconocido es un error, no un físico silencioso', () => {
  for (const bad of ['real', 'x10', 10, null])
    assert.throws(() => resolveMoonScaleMode(bad), TypeError, String(bad));
});
