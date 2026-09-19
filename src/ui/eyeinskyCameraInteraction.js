export const EYE_CAMERA_TUNING = Object.freeze({
  inertiaSpin: 0.82,
  inertiaTranslate: 0.82,
  inertiaZoom: 0.72,
  maximumMovementRatio: 0.08,
});

/**
 * Tune Cesium's existing input controller for Iris and let direct input reclaim
 * an in-progress flyTo immediately. This adds no render loop or camera owner.
 */
export function configureEyeCameraInteraction(
  viewer,
  onHumanIntent = () => {},
) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  const canvas = viewer?.scene?.canvas;
  const previous = {};
  if (controller) {
    for (const [key, value] of Object.entries(EYE_CAMERA_TUNING)) {
      previous[key] = controller[key];
      controller[key] = value;
    }
  }

  const reclaim = (event) => {
    const hadFlight = Boolean(viewer?.camera?._currentFlight);
    const handled = onHumanIntent(event?.type || 'gesture');
    // The NavigationController owns cancellation when it accepts the gesture.
    // Keep a fallback for isolated consumers that did not provide that owner.
    if (!handled && viewer?.camera?._currentFlight)
      viewer.camera.cancelFlight();
    if (handled && hadFlight && event?.type === 'wheel' && controller) {
      // The wheel's pick was recorded before this listener cancelled the
      // tween. Cesium can otherwise compare that pre-cancel pick with the new
      // camera centre, produce a near-zero rotation axis, and throw while
      // normalizing it. Consume this first wheel as a radial zoom, then make
      // the next gesture pick afresh after the frame has rendered.
      controller._zoomMouseStart.x = Number(event.offsetX) || 0;
      controller._zoomMouseStart.y = Number(event.offsetY) || 0;
      controller._useZoomWorldPosition = false;
      controller._zoomingOnVector = true;
      controller._rotatingZoom = false;
      let removePostRender;
      removePostRender = viewer.scene.postRender?.addEventListener?.(() => {
        removePostRender?.();
        controller._zoomMouseStart.x = -1;
        controller._zoomMouseStart.y = -1;
        controller._zoomingOnVector = false;
        controller._rotatingZoom = false;
      });
    }
  };
  for (const type of ['pointerdown', 'wheel'])
    canvas?.addEventListener?.(type, reclaim, { passive: true });

  return () => {
    for (const type of ['pointerdown', 'wheel'])
      canvas?.removeEventListener?.(type, reclaim);
    if (!controller) return;
    for (const [key, value] of Object.entries(EYE_CAMERA_TUNING)) {
      if (controller[key] === value) controller[key] = previous[key];
    }
  };
}
