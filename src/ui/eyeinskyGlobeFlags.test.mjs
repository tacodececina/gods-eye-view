/**
 * Flags de escena y piel (fase visual §2.1): un único parser puro para
 * `?skin`, `?globe` y sus piezas. Valores desconocidos caen al defecto.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GLOBE_FLAG_DEFAULTS,
  readGlobeFlags,
  scopeAppearanceForSkin,
} from './eyeinskyGlobeFlags.js';

test('sin parámetros: piel y globo editorial (T6), todo resuelto y congelado', () => {
  const flags = readGlobeFlags('');
  assert.equal(flags.skin, 'editorial');
  assert.equal(flags.globe, 'editorial');
  assert.equal(flags.lighting, '1');
  assert.equal(flags.nightLights, '1');
  assert.equal(flags.stars, 'sober');
  assert.equal(flags.homePose, 'solar');
  assert.equal(flags.intro, '1');
  assert.equal(flags.satStyle, 'editorial');
  assert.equal(flags.satLabels, 'intent');
  assert.ok(Object.isFrozen(flags));
  assert.ok(Object.isFrozen(GLOBE_FLAG_DEFAULTS));
  assert.ok(
    Object.values(flags).every((value) => value !== null),
    'sin null',
  );
});

test('?globe=editorial resuelve todas las piezas y una pieza explícita manda', () => {
  const editorial = readGlobeFlags('?globe=editorial');
  assert.deepEqual(
    {
      lighting: editorial.lighting,
      nightLights: editorial.nightLights,
      stars: editorial.stars,
      homePose: editorial.homePose,
      intro: editorial.intro,
      satStyle: editorial.satStyle,
      satLabels: editorial.satLabels,
    },
    {
      lighting: '1',
      nightLights: '1',
      stars: 'sober',
      homePose: 'solar',
      intro: '1',
      satStyle: 'editorial',
      satLabels: 'intent',
    },
  );
  const tycho = readGlobeFlags('?globe=editorial&stars=tycho&homePose=tilt');
  assert.equal(tycho.stars, 'tycho');
  assert.equal(tycho.homePose, 'tilt');
  assert.equal(tycho.lighting, '1');
  const piece = readGlobeFlags('nightLights=0&skin=legacy&globe=legacy');
  assert.equal(piece.globe, 'legacy');
  assert.equal(piece.lighting, '0');
  assert.equal(piece.nightLights, '0');
  assert.equal(piece.skin, 'legacy');
});

test('valores basura o claves ajenas caen al defecto y nunca lanzan', () => {
  const flags = readGlobeFlags('?skin=neon&globe=%00&homePose=../x&foo=bar');
  assert.equal(flags.skin, 'editorial');
  assert.equal(flags.globe, 'editorial');
  assert.equal(flags.homePose, 'solar');
  assert.equal('foo' in flags, false);
  assert.doesNotThrow(() => readGlobeFlags(undefined));
  assert.doesNotThrow(() => readGlobeFlags('%E0%A4%A'));
});

test('los defectos inyectados permiten promover piezas sin tocar el parser', () => {
  const promoted = readGlobeFlags('', {
    ...GLOBE_FLAG_DEFAULTS,
    globe: 'editorial',
  });
  assert.equal(promoted.lighting, '1');
  assert.equal(promoted.homePose, 'solar');
  const rollback = readGlobeFlags('?globe=legacy', {
    ...GLOBE_FLAG_DEFAULTS,
    globe: 'editorial',
  });
  assert.equal(rollback.lighting, '0');
});

test('scopeAppearanceForSkin: la piel Editorial no pinta velo ni ojo de cerradura', () => {
  assert.equal(scopeAppearanceForSkin('editorial'), 'editorial');
  assert.equal(scopeAppearanceForSkin('legacy'), 'iris');
  assert.equal(scopeAppearanceForSkin(undefined), 'editorial');
  assert.equal(
    scopeAppearanceForSkin(readGlobeFlags('?skin=legacy').skin),
    'iris',
  );
  assert.equal(scopeAppearanceForSkin(readGlobeFlags('').skin), 'editorial');
});
