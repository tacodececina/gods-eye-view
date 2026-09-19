import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EYE_SCENE_FAR_ENTER_M,
  EYE_SCENE_NEAR_ENTER_M,
  createSceneRegime,
  nextSceneRegime,
  sceneAppearance,
} from './eyeinskyScenePolicy.js';

test('far to near to far uses separate thresholds instead of flickering', () => {
  let regime = createSceneRegime(18_000_000);
  assert.equal(regime, 'far');
  regime = nextSceneRegime(regime, EYE_SCENE_NEAR_ENTER_M + 1);
  assert.equal(regime, 'far', 'approaching the threshold from space stays far');
  regime = nextSceneRegime(regime, EYE_SCENE_NEAR_ENTER_M - 1);
  assert.equal(regime, 'near');
  regime = nextSceneRegime(regime, EYE_SCENE_FAR_ENTER_M - 1);
  assert.equal(regime, 'near', 'the hysteresis band keeps the near regime');
  regime = nextSceneRegime(regime, EYE_SCENE_FAR_ENTER_M + 1);
  assert.equal(regime, 'far');
});

test('space remains black and starred while near treatment tints only imagery', () => {
  const far = sceneAppearance('far');
  const near = sceneAppearance('near');
  assert.equal(far.skyBox, true);
  assert.equal(near.skyBox, true);
  assert.equal(far.background, '#000000');
  assert.equal(near.background, '#000000');
  assert.ok(near.imagery.saturation > far.imagery.saturation);
  assert.ok(
    near.imagery.brightness > 0,
    'near imagery never becomes absolute black',
  );
});
