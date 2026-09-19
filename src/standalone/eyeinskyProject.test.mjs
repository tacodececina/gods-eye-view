import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneDirector } from '../scenes/director.js';
test('a distribution can supply a blank local scene instead of provider-dependent recipes', () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null };
  try {
    const expected = {
      version: 2,
      scenes: [{ id: 'local', title: 'Mi escena', shots: [] }],
    };
    assert.equal(
      SceneDirector.prototype._loadProject.call({
        _createProject: () => expected,
      }),
      expected,
    );
  } finally {
    globalThis.localStorage = previous;
  }
});
