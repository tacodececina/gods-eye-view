/**
 * Vista de inicio de la fase visual (T2): la pose Global sale del Sol de la
 * escena (celestialFor(viewer).sunFixedAt, reloj P5) y la entrada es un solo
 * vuelo de cámara, cancelable, que se omite con movimiento reducido.
 * Publica `body[data-eye-intro="running|done"]` para los arneses.
 */
import * as Cesium from 'cesium';
import { celestialFor } from '../../layers/moon/celestialService.js';
import { solarHomePose } from '../eyeinskyHomePose.js';

/** La entrada parte de ~95 000 km (DESIGN-SYSTEM-EDITORIAL §5). */
export const INTRO_START_ALT_M = 95_000_000;
/** 2,6 s, termina antes de 3 s (V-16). */
export const INTRO_SECONDS = 2.6;

/**
 * @param {object} viewer Cesium viewer.
 * @param {{homePose: string}} flags Flags resueltos (§2.1).
 * @param {{width: number, height: number}} [viewport]
 * @returns {{lon: number, lat: number, alt: number, heading: number,
 *   pitch: number}}
 */
export function resolveHomePose(
  viewer,
  flags,
  viewport = { width: innerWidth, height: innerHeight },
) {
  const sunEcef =
    flags?.homePose && flags.homePose !== 'legacy'
      ? celestialFor(viewer).sunFixedAt(
          viewer.clock.currentTime,
          new Cesium.Cartesian3(),
        )
      : null;
  const pose = solarHomePose({
    sunEcef,
    viewport,
    fovy: viewer.camera.frustum.fovy,
    mode: flags?.homePose ?? 'legacy',
  });
  return pose.frame === 'orbit' ? orbitToCamera(viewer, pose) : pose;
}

/**
 * Pose `orbit` (inclinada alrededor del punto) → cámara absoluta, para que
 * `setView` y los planes de vuelo la usen igual que las demás.
 */
function orbitToCamera(viewer, pose) {
  const scratch = new Cesium.Camera(viewer.scene);
  scratch.lookAt(
    Cesium.Cartesian3.fromDegrees(pose.lon, pose.lat, 0),
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(pose.heading),
      Cesium.Math.toRadians(pose.pitch),
      pose.alt,
    ),
  );
  scratch.lookAtTransform(Cesium.Matrix4.IDENTITY);
  const at = scratch.positionCartographic;
  return {
    lon: Cesium.Math.toDegrees(at.longitude),
    lat: Cesium.Math.toDegrees(at.latitude),
    alt: at.height,
    heading: Cesium.Math.toDegrees(scratch.heading),
    pitch: Cesium.Math.toDegrees(scratch.pitch),
    roll: Cesium.Math.toDegrees(scratch.roll),
    frame: 'camera',
  };
}

/** Cámara en la pose, sin vuelo. */
export function setHomeView(viewer, pose) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(pose.lon, pose.lat, pose.alt),
    orientation: {
      heading: Cesium.Math.toRadians(pose.heading),
      pitch: Cesium.Math.toRadians(pose.pitch),
      roll: Cesium.Math.toRadians(pose.roll ?? 0),
    },
  });
}

/**
 * Entrada de cámara: desde lejos hasta la pose, por la autoridad de
 * navegación (cancelable con un gesto). Sin intro, con movimiento reducido o
 * restaurando un enlace compartido no hay vuelo.
 * @param {object} shell Contexto del shell (viewer, flags, styleManager,
 *   reduced, defer).
 * @returns {void}
 */
export function mountIntro(shell) {
  const { viewer, flags, styleManager, reduced, reveal } = shell;
  // `data-eye-intro` lo publica el estado de revelación (shell/reveal.js).
  const shared =
    styleManager.hasShareState || location.hash.startsWith('#eye=');
  if (flags.intro !== '1' || reduced() || shared) {
    reveal.setIntro('done');
    return;
  }
  const pose = resolveHomePose(viewer, flags);
  setHomeView(viewer, { ...pose, alt: INTRO_START_ALT_M });
  reveal.setIntro('running');
  const flight = styleManager._navigation.runCameraPlan('vista', [
    {
      ...pose,
      duration: INTRO_SECONDS,
      easing: Cesium.EasingFunction.CUBIC_OUT,
      targetId: 'sector:global',
    },
  ]);
  const finish = () => {
    if (reveal.getState()?.intro === 'running') reveal.setIntro('done');
  };
  if (!flight) {
    setHomeView(viewer, pose);
    finish();
    return;
  }
  Promise.resolve(flight).then(finish, finish);
}
