/**
 * P5 T9 — carga de la textura LROC sobre la Luna viva: 1k al encender, 2k
 * solo si el presupuesto lo permite, placeholder si no carga, crédito SVS
 * solo mientras se ve la textura y nada tras apagar.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MOON_TEXTURE_CREDIT, createMoonTexture } from './texture.js';
import { MOON_TEXTURES } from './textureBudget.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

function fakePrimitive() {
  return {
    appearance: { material: { uniforms: { image: 'placeholder.png' } } },
  };
}

function setup({ env = { mobile: false, saveData: false }, fail = [] } = {}) {
  const loads = [];
  const credits = [];
  const texture = createMoonTexture({
    resolveAsset: (uri) => `/base/${uri}`,
    env: () => env,
    loadImage: (url) => {
      loads.push(url);
      return fail.some((f) => url.includes(f))
        ? Promise.reject(new Error('404'))
        : Promise.resolve({ src: url });
    },
    credits: {
      register: (credit) => credits.push(['+', credit.key]),
      unregister: (credit) => credits.push(['-', credit.key]),
    },
    onChange: () => {},
  });
  return { texture, loads, credits };
}

test('al encender carga la 1k; al llegar sustituye al placeholder y registra el crédito SVS', async () => {
  const { texture, loads, credits } = setup();
  const primitive = fakePrimitive();
  assert.equal(texture.state(), 'placeholder');
  texture.start(primitive);
  assert.deepEqual(loads, [`/base/${MOON_TEXTURES['1k']}`]);
  await flush();
  assert.deepEqual(primitive.appearance.material.uniforms.image, {
    src: `/base/${MOON_TEXTURES['1k']}`,
  });
  assert.equal(texture.state(), 'lroc-1k');
  assert.deepEqual(credits, [['+', MOON_TEXTURE_CREDIT.key]]);
  assert.match(
    MOON_TEXTURE_CREDIT.html,
    /NASA's Scientific Visualization Studio/,
  );
  texture.stop();
  assert.equal(texture.state(), 'placeholder');
  assert.deepEqual(credits.at(-1), ['-', MOON_TEXTURE_CREDIT.key]);
});

test('2k solo con la Luna > 300 px en escritorio; una vez, sin bajar de nuevo', async () => {
  const { texture, loads } = setup();
  const primitive = fakePrimitive();
  texture.start(primitive);
  await flush();
  texture.frame(primitive, 120);
  assert.equal(loads.length, 1);
  texture.frame(primitive, 450);
  texture.frame(primitive, 451);
  assert.deepEqual(loads.at(-1), `/base/${MOON_TEXTURES['2k']}`);
  assert.equal(loads.length, 2, 'una sola petición de 2k');
  await flush();
  assert.equal(texture.state(), 'lroc-2k');
  texture.frame(primitive, 10);
  assert.equal(texture.state(), 'lroc-2k');
});

test('móvil o save-data: nunca 2k', async () => {
  for (const env of [
    { mobile: true, saveData: false },
    { mobile: false, saveData: true },
  ]) {
    const { texture, loads } = setup({ env });
    const primitive = fakePrimitive();
    texture.start(primitive);
    await flush();
    texture.frame(primitive, 2000);
    assert.equal(loads.length, 1, JSON.stringify(env));
  }
});

test('si la textura no carga queda el placeholder, sin crédito de textura', async () => {
  const { texture, credits } = setup({ fail: ['1k'] });
  const primitive = fakePrimitive();
  texture.start(primitive);
  await flush();
  assert.equal(primitive.appearance.material.uniforms.image, 'placeholder.png');
  assert.equal(texture.state(), 'placeholder');
  assert.deepEqual(credits, []);
});

test('una carga que llega tras apagar no toca la primitiva ni el crédito', async () => {
  const { texture, credits } = setup();
  const primitive = fakePrimitive();
  texture.start(primitive);
  texture.stop();
  await flush();
  assert.equal(primitive.appearance.material.uniforms.image, 'placeholder.png');
  assert.deepEqual(credits, []);
  assert.equal(texture.state(), 'placeholder');
});
