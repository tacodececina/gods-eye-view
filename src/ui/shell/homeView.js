/**
 * Vista de inicio de la fase visual (T2): la pose Global sale del Sol de la
 * escena (celestialFor(viewer).sunFixedAt, reloj P5) y la entrada es un solo
 * vuelo de cámara, cancelable, que se omite con movimiento reducido.
 * Publica `body[data-eye-intro="running|done"]` para los arneses.
 */
import * as Cesium from 'cesium';
import { celestialFor } from '../../layers/moon/celestialService.js';
import { homePoseModeFor, solarHomePose } from '../eyeinskyHomePose.js';

/** La entrada parte de ~95 000 km (DESIGN-SYSTEM-EDITORIAL §5). */
export const INTRO_START_ALT_M = 95_000_000;
/** 2,6 s, termina antes de 3 s (V-16). */
export const INTRO_SECONDS = 2.6;
/** Movimiento sutil en reposo: de la pose inclinada a la centrada (s). */
export const AMBIENT_SECONDS = 45;

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
    mode: homePoseModeFor(flags?.homePose ?? 'legacy', viewport.width),
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
    startAmbientGlide(shell, viewer, flags);
  };
  if (!flight) {
    setHomeView(viewer, pose);
    finish();
    return;
  }
  Promise.resolve(flight).then(finish, finish);
}

/**
 * Movimiento sutil en reposo (decisión de Alex 2026-09-26): tras la entrada
 * inclinada, la cámara se centra muy despacio (AMBIENT_SECONDS) interpolando
 * la pose directamente en preUpdate, sin pasar por la autoridad de navegación
 * (así no cancela selecciones ni compite con los arneses). Se detiene con
 * cualquier gesto, al fijar un objetivo, al salir del reposo o al terminar.
 * Con movimiento reducido o pose solar (teléfono) no hay deriva.
 */
function startAmbientGlide(shell, viewer, flags) {
  if (homePoseModeFor(flags?.homePose ?? 'legacy', innerWidth) !== 'tilt')
    return;
  if (shell.reduced()) return;
  const to = resolveHomePose(viewer, { ...flags, homePose: 'solar' });
  const c = viewer.camera.positionCartographic;
  const from = {
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
    alt: c.height,
    heading: Cesium.Math.toDegrees(viewer.camera.heading),
    pitch: Cesium.Math.toDegrees(viewer.camera.pitch),
  };
  const start = performance.now();
  const stops = [];
  const stop = () => {
    while (stops.length) stops.pop()?.();
  };
  const lerpDeg = (a, b, t) => a + shortestDelta(a, b) * t;
  const applied = new Cesium.Cartesian3();
  let hasApplied = false;
  const tick = () => {
    if (viewer.trackedEntity || shell.reveal.getState()?.reveal !== 'rest')
      return stop();
    // Si otro actor movió la cámara desde la última aplicación (API directa,
    // arneses, restauración), la deriva cede y se apaga.
    if (
      hasApplied &&
      Cesium.Cartesian3.distance(viewer.camera.position, applied) > 1
    )
      return stop();
    const t = Math.min(
      1,
      (performance.now() - start) / (AMBIENT_SECONDS * 1000),
    );
    const k = 0.5 - Math.cos(Math.PI * t) / 2;
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        lerpDeg(from.lon, to.lon, k),
        from.lat + (to.lat - from.lat) * k,
        from.alt + (to.alt - from.alt) * k,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(lerpDeg(from.heading, to.heading, k)),
        pitch: Cesium.Math.toRadians(from.pitch + (to.pitch - from.pitch) * k),
        roll: 0,
      },
    });
    Cesium.Cartesian3.clone(viewer.camera.position, applied);
    hasApplied = true;
    viewer.scene.requestRender();
    if (t >= 1) stop();
  };
  stops.push(viewer.scene.preUpdate.addEventListener(tick));
  // Cualquier navegación explícita (APUNTAR, sector, Centrar, seguir un
  // objetivo) también corta la deriva, aunque no venga de un gesto.
  const nav = shell.styleManager._navigation;
  for (const name of ['runCameraPlan', 'interruptCameraMotion']) {
    const original = nav[name];
    if (typeof original !== 'function') continue;
    nav[name] = function stopAmbientThen(...args) {
      stop();
      return original.apply(this, args);
    };
    stops.push(() => {
      if (nav[name]?.name === 'stopAmbientThen') nav[name] = original;
    });
  }
  for (const type of ['pointerdown', 'wheel', 'keydown', 'touchstart']) {
    document.addEventListener(type, stop, { capture: true, passive: true });
    stops.push(() =>
      document.removeEventListener(type, stop, { capture: true }),
    );
  }
}

function shortestDelta(a, b) {
  return ((((b - a) % 360) + 540) % 360) - 180;
}
