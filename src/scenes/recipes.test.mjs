// P3.1 withdrawal pin.
//
// The Bhote Koshi locator was a permanent registered layer that the Nepal
// recipes drove shot by shot. P3.1 withdraws it from runtime behaviour until a
// separate contextual-experience design exists. These pins hold the executable
// recipe surface clean: nothing a SceneDirector can serialize, install or
// release may name the withdrawn layer.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SCENE_RECIPES,
  SCENE_APPEND_RECIPES,
  getSceneAppendRecipeById,
  getSceneRecipeById,
} from './recipes.js';

const WITHDRAWN_LAYER_ID = 'bhote-koshi-locator';

test('no executable scene recipe serializes the withdrawn locator layer', () => {
  const serialized = JSON.stringify([...SCENE_RECIPES, ...SCENE_APPEND_RECIPES]);
  assert.equal(
    serialized.includes(WITHDRAWN_LAYER_ID),
    false,
    'recipes must not reference the withdrawn locator layer',
  );
});

test('the Nepal pack releases and drives only the event layer', () => {
  const pack = getSceneAppendRecipeById('bhote-koshi-nepal-evidence-pack');
  assert.ok(pack, 'the Nepal evidence pack remains installable');
  assert.deepEqual(pack.releaseLayerIds, ['bhote-koshi-2026']);
  assert.deepEqual(Object.keys(pack.layers || {}), []);
  for (const shot of pack.cameraPath) {
    assert.deepEqual(
      Object.keys(shot.layers),
      ['bhote-koshi-2026'],
      `${shot.title} drives only the event layer`,
    );
  }
  for (const patch of pack.shotPatches || []) {
    assert.equal(
      Object.keys(patch.layers || {}).includes(WITHDRAWN_LAYER_ID),
      false,
      `${patch.title} patches only the event layer`,
    );
  }
  for (const keyframe of pack.legacySceneBootstrap.cameraPath) {
    assert.deepEqual(
      Object.keys(keyframe.layers || {}),
      [],
      `${keyframe.title} bootstraps no layer state`,
    );
  }
});

test('the bootstrap recipe keeps Bhote Koshi 2026 working on its own', () => {
  const bootstrap = getSceneRecipeById('bhote-koshi-nepal-scene');
  assert.ok(bootstrap, 'the legacy bootstrap recipe survives the withdrawal');
  assert.deepEqual(bootstrap.releaseLayerIds, ['bhote-koshi-2026']);
  assert.equal(bootstrap.cameraPath.length, 3);
  assert.deepEqual(
    bootstrap.cameraPath.map(({ title }) => title),
    ['Shot 1', 'Shot 2', 'Shot 3'],
  );
});
