/**
 * P5-12: VOLVER A TIERRA restaura cámara, capas, selección, seguimiento,
 * anillo y pestaña del dock; el reloj queda como esté.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';

import {
  captureReturnState,
  readCameraPose,
  restoreReturnState,
} from './eyeinskyMoonCamera.js';

function fakeCamera() {
  const camera = {
    positionWC: new Cesium.Cartesian3(7e6, 1e5, 2e6),
    directionWC: Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(-1, 0, -0.2),
      new Cesium.Cartesian3(),
    ),
    upWC: new Cesium.Cartesian3(0, 0, 1),
    frustum: { fov: Math.PI / 3 },
    setView({ destination, orientation }) {
      camera.positionWC = Cesium.Cartesian3.clone(destination);
      camera.directionWC = Cesium.Cartesian3.clone(orientation.direction);
      camera.upWC = Cesium.Cartesian3.clone(orientation.up);
    },
    flyTo(options) {
      camera.setView(options);
      options.complete();
    },
  };
  return camera;
}

function fakeWorld() {
  const layers = new Map([
    ['flights', true],
    ['moon', true],
    ['local-dams', false],
  ]);
  const log = [];
  const dataManager = {
    getAll: () => [...layers].map(([id, enabled]) => ({ id, enabled })),
    async setEnabled(id, enabled, { origin }) {
      log.push([id, enabled, origin]);
      layers.set(id, enabled);
    },
  };
  const world = {
    layers,
    log,
    dataManager,
    viewer: { camera: fakeCamera() },
    ring: {
      on: false,
      get: () => world.ring.on,
      set: (on) => (world.ring.on = on),
    },
    dossier: {
      context: { key: 'flights:ae1', layerId: 'flights', stableId: 'ae1' },
    },
    dock: { pane: 'ops', expanded: true },
    following: true,
    refocused: [],
    clock: { mode: 'simulated', multiplier: 600 },
  };
  world.shell = {
    getDossier: () => world.dossier,
    getDockState: () => world.dock,
    isFollowing: () => world.following,
    select: (context) => (world.dossier = { context }),
    refocus: (context) => {
      world.refocused.push(context.stableId);
      world.following = true;
      return true;
    },
    restoreDock: (dock) => (world.dock = dock),
  };
  return world;
}

const readAll = (world) => ({
  camera: readCameraPose(world.viewer.camera),
  layers: world.dataManager.getAll(),
  selection: world.dossier.context.key,
  following: world.following,
  ring: world.ring.get(),
  dock: world.dock,
  clock: { ...world.clock },
});

test('P5-12: ir a la Luna y volver deja cámara, capas, selección, seguimiento, anillo y pestaña como estaban', async () => {
  const world = fakeWorld();
  world.following = false;
  const before = readAll(world);
  const snapshot = captureReturnState({ ...world, ring: world.ring });
  // Excursión: se apunta a la Luna, cambian capas, objetivo, anillo, dock y reloj.
  world.viewer.camera.setView({
    destination: new Cesium.Cartesian3(1, 2, 3e8),
    orientation: {
      direction: new Cesium.Cartesian3(0, 1, 0),
      up: new Cesium.Cartesian3(0, 0, 1),
    },
  });
  world.viewer.camera.frustum.fov = 0.2;
  world.layers.set('local-dams', true);
  world.layers.set('flights', false);
  world.dossier = { context: { key: 'moon:eyeinsky-moon' } };
  world.ring.on = true;
  world.dock = { pane: 'objetivo', expanded: false };
  world.clock.multiplier = 3600;
  await restoreReturnState(snapshot, {
    ...world,
    reduced: true,
    offLive: false,
  });
  const after = readAll(world);
  assert.deepEqual({ ...after, clock: null }, { ...before, clock: null });
  assert.equal(after.clock.multiplier, 3600, 'el reloj queda como esté');
  assert.ok(world.log.every(([, , origin]) => origin === 'user'));
});

test('con seguimiento, el retorno devuelve la cámara al contacto por su capa', async () => {
  const world = fakeWorld();
  const snapshot = captureReturnState({ ...world, ring: world.ring });
  world.following = false;
  await restoreReturnState(snapshot, {
    ...world,
    reduced: false,
    offLive: false,
  });
  assert.deepEqual(world.refocused, ['ae1']);
  assert.equal(world.following, true);
});

test('fuera de vivo, las capas en vivo no las toca el retorno: vuelven con AHORA', async () => {
  const world = fakeWorld();
  const snapshot = captureReturnState({ ...world, ring: world.ring });
  world.layers.set('flights', false);
  world.layers.set('local-dams', true);
  await restoreReturnState(snapshot, {
    ...world,
    reduced: true,
    offLive: true,
  });
  assert.equal(world.layers.get('flights'), false, 'sigue suspendida');
  assert.equal(world.layers.get('local-dams'), false);
});

test('SISTEMA encuadra con el FOV por defecto (60°) aunque la cámara venga con 2°', async () => {
  const { SYSTEM_FOV_RAD, systemPose } =
    await import('./eyeinskyMoonCamera.js');
  assert.equal(SYSTEM_FOV_RAD, Math.PI / 3);
  const canvas = { clientWidth: 1280, clientHeight: 800 };
  const pose = systemPose({ x: 3.1e8, y: -2.2e8, z: 4e7 }, canvas, 0);
  assert.equal(pose.fov, Math.PI / 3);
  const distance = Math.hypot(
    pose.position.x,
    pose.position.y,
    pose.position.z,
  );
  assert.ok(distance < 5e9, `dentro del plano lejano (1e10 m): ${distance}`);
});

test('simular → APUNTAR → AHORA → VOLVER no apaga las capas en vivo que AHORA devolvió', async () => {
  const world = fakeWorld();
  // Simulando: la suspensión ya apagó (programmatic) la capa en vivo.
  world.layers.set('flights', false);
  const snapshot = captureReturnState({
    ...world,
    ring: world.ring,
    suspended: ['flights'],
  });
  // AHORA: la suspensión la devuelve.
  world.layers.set('flights', true);
  await restoreReturnState(snapshot, {
    ...world,
    reduced: true,
    offLive: false,
  });
  assert.equal(world.layers.get('flights'), true, 'sigue encendida');
  assert.deepEqual(
    world.log.filter(([id]) => id === 'flights'),
    [],
    'el retorno no toca la capa (ni sus preferencias)',
  );
});

test('la foto de retorno cuenta las suspendidas como deseadas', () => {
  const world = fakeWorld();
  world.layers.set('flights', false);
  const snapshot = captureReturnState({
    ...world,
    ring: world.ring,
    suspended: ['flights'],
  });
  assert.deepEqual(snapshot.layers, ['flights', 'moon']);
});
