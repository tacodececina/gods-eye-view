import * as Cesium from 'cesium';
import {
  aimOrientation,
  earthMoonFraming,
  tiltTowardFreeArea,
  viewportFit,
} from '../layers/moon/framing.js';
import { LIVE_LAYER_IDS } from './eyeinskyLiveSuspension.js';

/**
 * Cámara y retorno de la Luna (P5 T8). APUNTAR reorienta sin mover; SISTEMA
 * TIERRA–LUNA encuadra ambas con el FOV mínimo; VOLVER A TIERRA restaura
 * cámara, capas, selección, seguimiento, anillo y pestaña del dock con el
 * patrón de cameraRestore (pose exacta, no redondeada a grados) y de
 * shareRestoration (capas por el DataManager). El reloj NO se toca.
 */

const FLIGHT_S = 1.2;
const AIM_S = 0.8;
const plain = (v) => ({ x: v.x, y: v.y, z: v.z });
const cartesian = (v) => new Cesium.Cartesian3(v.x, v.y, v.z);
const LIVE = new Set(LIVE_LAYER_IDS);

/** Pose exacta de la cámara (posición, dirección, up y fov). */
export function readCameraPose(camera) {
  return Object.freeze({
    position: plain(camera.positionWC),
    direction: plain(camera.directionWC),
    up: plain(camera.upWC),
    fov: camera.frustum.fov,
  });
}

/** Lleva la cámara a `pose`: corte con reduced-motion, vuelo si no. */
export function moveCamera(camera, pose, { reduced, duration = FLIGHT_S }) {
  const view = {
    destination: cartesian(pose.position),
    orientation: {
      direction: cartesian(pose.direction),
      up: cartesian(pose.up),
    },
  };
  if (Number.isFinite(pose.fov)) camera.frustum.fov = pose.fov;
  if (reduced) {
    camera.setView(view);
    return Promise.resolve('cut');
  }
  return new Promise((resolve) => {
    camera.flyTo({
      ...view,
      duration,
      complete: () => {
        camera.setView(view);
        resolve('flown');
      },
      cancel: () => resolve('cancelled'),
    });
  });
}

/** FOV de Cesium por defecto: SISTEMA encuadra con él (no con un zoom previo). */
export const SYSTEM_FOV_RAD = Math.PI / 3;

/** FOV útil y giro del área libre sobre la franja del dock. */
export function freeAreaFit(fovRad, canvas, bottomBandPx) {
  return viewportFit({
    fovRad,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    bottomBandPx,
  });
}

/**
 * Pose para APUNTAR A LA LUNA: MISMA posición; la Luna queda en el centro del
 * área libre (sobre el dock), no debajo de él.
 */
export function aimPose(camera, moonFixedM, fit) {
  const oriented = aimOrientation({
    cameraPosition: camera.positionWC,
    target: moonFixedM,
    currentUp: camera.upWC,
  });
  return {
    position: plain(camera.positionWC),
    ...tiltTowardFreeArea(oriented, fit.tiltRad),
  };
}

/**
 * Pose para SISTEMA TIERRA–LUNA con el FOV por defecto y el área libre: un
 * FOV estrecho heredado alejaría la cámara más allá del plano lejano.
 */
export function systemPose(moonFixedM, canvas, bottomBandPx) {
  const fit = freeAreaFit(SYSTEM_FOV_RAD, canvas, bottomBandPx);
  const framing = earthMoonFraming({ moonFixedM, minFovRad: fit.minFovRad });
  return {
    position: framing.destination,
    ...tiltTowardFreeArea(framing, fit.tiltRad),
    fov: SYSTEM_FOV_RAD,
  };
}

/** ¿Se proyecta `point` (m, ECEF) delante de la cámara y en el área libre? */
function inFreeArea(scene, point, bottomBandPx) {
  const window = Cesium.SceneTransforms.worldToWindowCoordinates(
    scene,
    cartesian(point),
  );
  const to = Cesium.Cartesian3.subtract(
    cartesian(point),
    scene.camera.positionWC,
    new Cesium.Cartesian3(),
  );
  if (!window || Cesium.Cartesian3.dot(to, scene.camera.directionWC) <= 0)
    return false;
  const { clientWidth: width, clientHeight: height } = scene.canvas;
  return (
    window.x >= 0 &&
    window.x <= width &&
    window.y >= 0 &&
    window.y <= height - bottomBandPx
  );
}

/**
 * ¿Se ven la Luna (y, para SISTEMA, también la Tierra) en el área libre del
 * lienzo, sin la franja del dock?
 */
export function targetsInFrame(scene, moonFixedM, { bottomBandPx, withEarth }) {
  const moon = inFreeArea(scene, moonFixedM, bottomBandPx);
  return withEarth
    ? moon && inFreeArea(scene, { x: 0, y: 0, z: 0 }, bottomBandPx)
    : moon;
}

/**
 * Capas deseadas al volver: las encendidas MÁS las en vivo suspendidas (fuera
 * de vivo están apagadas solo por la suspensión; AHORA las devuelve).
 */
function wantedLayers(dataManager, suspended) {
  const enabled = dataManager
    .getAll()
    .filter((entry) => entry.enabled)
    .map((entry) => String(entry.id));
  return Object.freeze(
    [...new Set([...enabled, ...suspended.map(String)])].sort(),
  );
}

/** Instantánea de retorno: todo lo que VOLVER A TIERRA restaura. */
export function captureReturnState({
  viewer,
  dataManager,
  shell,
  ring,
  suspended = [],
}) {
  return Object.freeze({
    camera: readCameraPose(viewer.camera),
    layers: wantedLayers(dataManager, suspended),
    context: shell.getDossier().context,
    following: shell.isFollowing(),
    ring: ring.get(),
    dock: shell.getDockState(),
  });
}

/**
 * Capas de la instantánea. Fuera de vivo, las capas en vivo las gobierna la
 * suspensión (vuelven con AHORA), no el retorno.
 */
async function restoreLayers(dataManager, layers, offLive) {
  const wanted = new Set(layers);
  for (const entry of dataManager.getAll()) {
    const id = String(entry.id);
    if (offLive && LIVE.has(id)) continue;
    const enabled = wanted.has(id);
    if (entry.enabled !== enabled)
      await dataManager.setEnabled(id, enabled, { origin: 'user' });
  }
}

/**
 * VOLVER A TIERRA: capas, selección, seguimiento o cámara y, con la cámara ya
 * en su sitio, anillo (se apaga solo lejos del globo completo) y dock.
 */
export async function restoreReturnState(snapshot, deps) {
  const { viewer, dataManager, shell, ring, reduced, offLive } = deps;
  await restoreLayers(dataManager, snapshot.layers, offLive);
  shell.select(snapshot.context);
  const refocused = snapshot.following && shell.refocus(snapshot.context);
  if (refocused) viewer.camera.frustum.fov = snapshot.camera.fov;
  const camera = refocused
    ? 'followed'
    : await moveCamera(viewer.camera, snapshot.camera, { reduced });
  ring.set(snapshot.ring);
  shell.restoreDock(snapshot.dock);
  return camera;
}

export const MOON_AIM_SECONDS = AIM_S;
