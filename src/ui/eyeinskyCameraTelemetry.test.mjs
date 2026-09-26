/**
 * Telemetría del pie (V-04/V-05, «sin datos falsos»): la altura, el rumbo y
 * las coordenadas siguen a la cámara real también mientras un EntityView la
 * gobierna (objetivo fijado), cuando `camera.moveEnd` no se dispara.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mountCameraTelemetry } from './eyeinskyCameraTelemetry.js';

const RAD = Math.PI / 180;

function event() {
  const listeners = new Set();
  return {
    addEventListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    raise() {
      for (const fn of [...listeners]) fn();
    },
    get size() {
      return listeners.size;
    },
  };
}

function stubWorld() {
  const nodes = new Map(
    ['eye-camera-position', 'eye-camera-altitude', 'eye-camera-heading'].map(
      (id) => [id, { textContent: '—' }],
    ),
  );
  const props = new Map();
  const doc = {
    hidden: false,
    getElementById: (id) => nodes.get(id) ?? null,
    body: {
      style: {
        setProperty: (k, v) => props.set(k, v),
        removeProperty: (k) => props.delete(k),
      },
    },
  };
  const camera = {
    positionCartographic: {
      latitude: 20 * RAD,
      longitude: -121.56 * RAD,
      height: 20_917_500,
    },
    heading: 317.6 * RAD,
    pitch: -90 * RAD,
    moveEnd: event(),
  };
  const viewer = {
    camera,
    scene: { postRender: event() },
    trackedEntity: null,
  };
  return { doc, viewer, camera, nodes, props };
}

test('pinta la pose al montar', () => {
  const { doc, viewer, nodes } = stubWorld();
  const telemetry = mountCameraTelemetry({ viewer, doc, now: () => 0 });
  assert.equal(nodes.get('eye-camera-altitude').textContent, '20,917.5 km');
  telemetry.destroy();
});

test('con un objetivo fijado, postRender actualiza la telemetría sin moveEnd', () => {
  const { doc, viewer, camera, nodes } = stubWorld();
  let clock = 0;
  const telemetry = mountCameraTelemetry({ viewer, doc, now: () => clock });
  // El EntityView lleva la cámara a 815 km de la ISS: no hay moveEnd.
  viewer.trackedEntity = { id: '25544' };
  camera.positionCartographic = {
    latitude: 12.3 * RAD,
    longitude: 45.6 * RAD,
    height: 815_000,
  };
  camera.heading = 49.8 * RAD;
  camera.pitch = -33.9 * RAD;
  clock = 1_000;
  viewer.scene.postRender.raise();
  assert.match(nodes.get('eye-camera-altitude').textContent, /^815 km$/);
  // Fase visual T3 (V-04): RUMBO es solo el rumbo; la inclinación no es rumbo.
  assert.equal(nodes.get('eye-camera-heading').textContent, '49.8°');
  assert.equal(nodes.get('eye-camera-position').textContent, '12.30° / 45.60°');
  telemetry.destroy();
});

test('postRender se limita a 4 Hz y no escribe si nada cambia', () => {
  const { doc, viewer, camera, nodes } = stubWorld();
  let clock = 0;
  const telemetry = mountCameraTelemetry({ viewer, doc, now: () => clock });
  camera.positionCartographic = {
    ...camera.positionCartographic,
    height: 900_000,
  };
  clock = 100;
  viewer.scene.postRender.raise();
  assert.notEqual(nodes.get('eye-camera-altitude').textContent, '900 km');
  clock = 300;
  viewer.scene.postRender.raise();
  assert.equal(nodes.get('eye-camera-altitude').textContent, '900 km');
  telemetry.destroy();
});

test('destroy retira los oyentes y las propiedades del cuerpo', () => {
  const { doc, viewer, props } = stubWorld();
  const telemetry = mountCameraTelemetry({ viewer, doc, now: () => 0 });
  assert.equal(viewer.scene.postRender.size, 1);
  assert.equal(viewer.camera.moveEnd.size, 1);
  assert.ok(props.has('--eye-altitude-level'));
  telemetry.destroy();
  assert.equal(viewer.scene.postRender.size, 0);
  assert.equal(viewer.camera.moveEnd.size, 0);
  assert.ok(!props.has('--eye-altitude-level'));
});

test('T3: #eye-north no gira con el rumbo (sin --eye-heading-turn)', () => {
  const { doc, viewer, props } = stubWorld();
  const telemetry = mountCameraTelemetry({ viewer, doc, now: () => 0 });
  assert.ok(!props.has('--eye-heading-turn'));
  telemetry.destroy();
});
