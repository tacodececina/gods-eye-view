import test from 'node:test';
import assert from 'node:assert/strict';
import { StyleManager } from './applicationShell.js';
test('restoring a level camera retains an explicit zero pitch', () => {
  let restored;
  StyleManager.prototype.applyCameraState.call(
    {
      viewer: {
        camera: {
          flyTo: (value) => {
            restored = value;
          },
        },
      },
    },
    { lat: 0, lon: 0, alt: 1e7, heading: 0, pitch: 0, roll: 0 },
    0.8,
  );
  assert.equal(restored.orientation.pitch, 0);
});
