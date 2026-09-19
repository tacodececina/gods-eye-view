import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EYE_CAMERA_TUNING,
  configureEyeCameraInteraction,
} from './eyeinskyCameraInteraction.js';

function rig() {
  const listeners = new Map();
  const canvas = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  let cancellations = 0;
  const controller = {
    inertiaSpin: 0.9,
    inertiaTranslate: 0.9,
    inertiaZoom: 0.8,
    maximumMovementRatio: 0.1,
    _zoomMouseStart: { x: -1, y: -1 },
    _useZoomWorldPosition: true,
    _zoomingOnVector: false,
    _rotatingZoom: true,
  };
  let postRender;
  const camera = {
    _currentFlight: null,
    cancelFlight() {
      cancellations += 1;
      this._currentFlight = null;
    },
  };
  return {
    viewer: {
      scene: {
        canvas,
        screenSpaceCameraController: controller,
        postRender: {
          addEventListener(listener) {
            postRender = listener;
            return () => {
              postRender = null;
            };
          },
        },
      },
      camera,
    },
    controller,
    camera,
    emit(type) {
      listeners.get(type)?.({ type, offsetX: 120, offsetY: 80 });
    },
    postRender() {
      postRender?.();
    },
    listenerCount() {
      return listeners.size;
    },
    cancellations() {
      return cancellations;
    },
  };
}

test('Iris tunes Cesium native inertia without changing resolution or render mode', () => {
  const h = rig();
  const release = configureEyeCameraInteraction(h.viewer);
  assert.deepEqual(
    {
      inertiaSpin: h.controller.inertiaSpin,
      inertiaTranslate: h.controller.inertiaTranslate,
      inertiaZoom: h.controller.inertiaZoom,
      maximumMovementRatio: h.controller.maximumMovementRatio,
    },
    EYE_CAMERA_TUNING,
  );
  assert.equal('resolutionScale' in h.viewer, false);
  assert.equal('requestRenderMode' in h.viewer.scene, false);
  release();
  assert.deepEqual(
    {
      inertiaSpin: h.controller.inertiaSpin,
      inertiaTranslate: h.controller.inertiaTranslate,
      inertiaZoom: h.controller.inertiaZoom,
      maximumMovementRatio: h.controller.maximumMovementRatio,
    },
    {
      inertiaSpin: 0.9,
      inertiaTranslate: 0.9,
      inertiaZoom: 0.8,
      maximumMovementRatio: 0.1,
    },
  );
});

test('manual input delegates cancellation to the navigation owner exactly once', () => {
  const h = rig();
  const intents = [];
  const release = configureEyeCameraInteraction(h.viewer, (kind) => {
    intents.push(kind);
    if (h.camera._currentFlight) h.camera.cancelFlight();
    return true;
  });
  h.emit('pointerdown');
  assert.equal(h.cancellations(), 0, 'idle input has no camera side effect');
  h.camera._currentFlight = {};
  h.emit('pointerdown');
  assert.equal(h.cancellations(), 1);
  h.camera._currentFlight = {};
  h.emit('wheel');
  assert.equal(h.cancellations(), 2);
  assert.equal(h.controller._useZoomWorldPosition, false);
  assert.deepEqual(h.controller._zoomMouseStart, { x: 120, y: 80 });
  h.postRender();
  assert.deepEqual(h.controller._zoomMouseStart, { x: -1, y: -1 });
  assert.deepEqual(intents, ['pointerdown', 'pointerdown', 'wheel']);
  release();
  assert.equal(h.listenerCount(), 0, 'lifetime cleanup removes both listeners');
});

test('an isolated consumer still gets the immediate Cesium cancellation fallback', () => {
  const h = rig();
  configureEyeCameraInteraction(h.viewer);
  h.camera._currentFlight = {};
  h.emit('wheel');
  assert.equal(h.cancellations(), 1);
});
