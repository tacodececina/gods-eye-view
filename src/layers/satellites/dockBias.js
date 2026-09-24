import * as Cesium from 'cesium';
import {
  SAT_DOCK_BIAS_EPSILON_RAD,
  SAT_DOCK_BIAS_MAX_BAND_RATIO,
  SAT_DOCK_BIAS_MAX_VIEWPORT_PX,
} from './policy.js';

/**
 * Mission Dock bias of the follow camera (P4 T5 repair). On a phone the dock
 * covers the lower half of the viewport; the followed satellite must project
 * at the centre of the free area ABOVE it, not at the screen centre under it.
 * The camera keeps its position (the framing range is untouched) and only
 * pitches in its own direction/up plane. Pure except readDockViewport, which
 * reads the band the dock itself publishes.
 */

/**
 * @param {object} [win] Browser window (injectable).
 * @returns {{bandPx: number, widthPx: number, heightPx: number}|null}
 */
export function readDockViewport(win = globalThis.window) {
  const style = win?.document?.documentElement?.style;
  if (typeof style?.getPropertyValue !== 'function') return null;
  const band = Number.parseFloat(style.getPropertyValue('--eye-dock-band'));
  return {
    bandPx: Number.isFinite(band) && band > 0 ? band : 0,
    widthPx: Number(win.innerWidth),
    heightPx: Number(win.innerHeight),
  };
}

/**
 * Elevation (rad, positive = above the view axis) at which the target must
 * sit so it projects at (heightPx − bandPx)/2 from the top.
 * @param {{bandPx: number, widthPx: number, heightPx: number, fovy: number}} v
 * @returns {number} 0 on a wide viewport, without a band or on bad input.
 */
export function dockBiasElevation(v) {
  if (!v) return 0;
  const { bandPx, widthPx, heightPx, fovy } = v;
  if (![bandPx, widthPx, heightPx, fovy].every(Number.isFinite)) return 0;
  if (widthPx > SAT_DOCK_BIAS_MAX_VIEWPORT_PX || bandPx <= 0) return 0;
  if (heightPx <= 0 || fovy <= 0) return 0;
  const ratio = Math.min(bandPx / heightPx, SAT_DOCK_BIAS_MAX_BAND_RATIO);
  return Math.atan(ratio * Math.tan(fovy / 2));
}

/**
 * Elevation of the target (the local-frame origin) seen from the camera.
 * @param {{position: Cesium.Cartesian3, direction: Cesium.Cartesian3,
 *   up: Cesium.Cartesian3}} camera Camera in the tracked (local) frame.
 * @returns {number} rad, positive when the target is above the view axis.
 */
export function targetElevation({ position, direction, up }) {
  const toTarget = Cesium.Cartesian3.negate(position, new Cesium.Cartesian3());
  return Math.atan2(
    Cesium.Cartesian3.dot(toTarget, up),
    Cesium.Cartesian3.dot(toTarget, direction),
  );
}

/**
 * Pitch the camera in its direction/up plane so the target sits at `wanted`.
 * @param {{position: Cesium.Cartesian3, direction: Cesium.Cartesian3,
 *   up: Cesium.Cartesian3}} camera Not modified.
 * @param {number} wanted Target elevation (rad).
 * @returns {{direction: Cesium.Cartesian3, up: Cesium.Cartesian3}|null} New
 *   basis, or null when the camera is already within the epsilon.
 */
export function tiltTowardElevation(camera, wanted) {
  const pitch = targetElevation(camera) - wanted;
  if (!Number.isFinite(pitch) || Math.abs(pitch) < SAT_DOCK_BIAS_EPSILON_RAD)
    return null;
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);
  const { direction, up } = camera;
  const scaled = (a, ka, b, kb) =>
    Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(a, ka, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(b, kb, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
  return {
    direction: scaled(direction, cos, up, sin),
    up: scaled(up, cos, direction, -sin),
  };
}
