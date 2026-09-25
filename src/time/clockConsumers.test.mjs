import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as Cesium from 'cesium';
import { trackedDisplayPositionForCamera } from '../data/trackedCamera.js';
import { readCameraTargetFrame } from '../ui/cameraOrientationControls.js';
import { createSceneClock } from './sceneClock.js';

/**
 * P5 T4 — consumidores de `viewer.clock.currentTime` (propuesta §8 T4).
 *
 * Hoy el reloj está congelado (viewer.js no anima). Con el reloj único
 * animado (vivo o simulado ×3600) estos consumidores deben seguir dando lo
 * mismo: sus propiedades de posición son CallbackProperty que ignoran el
 * tiempo y leen la caché de pantalla (pared), así que la cámara que sigue a
 * un avión o satélite no depende del reloj de escena. SGP4 y los feeds siguen
 * en Date.now(). El control negativo (SampledPositionProperty) muestra lo que
 * rompería un consumidor que sí dependiera del tiempo de escena.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(path.join(SRC, file), 'utf8').split('\n');

/** Consumidores conocidos: archivo → líneas (1-based) que leen currentTime. */
export const CLOCK_CONSUMERS = Object.freeze({
  'data/trackedCamera.js': [197, 211],
  'layers/flights/motion.js': [347],
  'layers/military/motion.js': [253],
  'ui/cockpitCamera.js': [65],
  'ui/cameraOrientationControls.js': [10],
});
/**
 * Lecturas permitidas fuera de la lista: el propio reloj, un comentario y los
 * lectores de TIEMPO DE ESCENA que añade P5 (marco precargado en cada tick,
 * anillo con el time del fotograma y SUN EL del HUD).
 */
const OTHER_READERS = Object.freeze({
  'cameraVerbs.js': [1081],
  'time/sceneClock.js': null,
  'app/sceneTime.js': [42],
  'celestialRing.js': [706],
  'hud.js': [495],
});
const READ_PATTERN = /clock\??\.currentTime/;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.m?js$/.test(entry.name) && !entry.name.endsWith('.test.mjs')
      ? [path.relative(SRC, absolute).split(path.sep).join('/')]
      : [];
  });
}

test('las líneas de la propuesta siguen siendo las que leen clock.currentTime', () => {
  for (const [file, lines] of Object.entries(CLOCK_CONSUMERS)) {
    const text = read(file);
    for (const line of lines)
      assert.match(text[line - 1], READ_PATTERN, `${file}:${line}`);
  }
});

test('ningún otro módulo de src/ lee clock.currentTime (SGP4 y feeds siguen en Date.now)', () => {
  const unexpected = [];
  for (const file of sourceFiles(SRC)) {
    const allowed = { ...CLOCK_CONSUMERS, ...OTHER_READERS }[file];
    if (allowed === null) continue;
    read(file).forEach((text, index) => {
      if (READ_PATTERN.test(text) && !allowed?.includes(index + 1))
        unexpected.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(unexpected, []);
});

test('SGP4 y los relojes «hora real» usan la pared, no el reloj de escena', () => {
  const sites = {
    'layers/satellites/rendering.js': [150, 183],
    'layers/satellites/tracking.js': [242],
    'layers/satellites/modelsHost.js': [231],
    'layers/satellites/orbits.js': [188, 262],
    'ui/cockpitInstruments.js': [118],
  };
  for (const [file, lines] of Object.entries(sites)) {
    const text = read(file);
    for (const line of lines)
      assert.match(
        text[line - 1],
        /Date\.now\(\)|new Date\(\)/,
        `${file}:${line}`,
      );
  }
});

/** Reloj real gobernado por sceneClock, con performance.now falso. */
function drivenClock(t) {
  const original = Object.getOwnPropertyDescriptor(performance, 'now');
  let perf = 0;
  performance.now = () => perf;
  const clock = new Cesium.Clock();
  const scene = createSceneClock({ clock, now: () => 1_790_000_000_000 });
  t.after(() => {
    scene.destroy();
    if (original) Object.defineProperty(performance, 'now', original);
    else delete performance.now;
  });
  clock.tick();
  const advance = (ms) => {
    for (let i = 0; i < 60; i += 1) {
      perf += ms / 60;
      clock.tick();
    }
  };
  return { clock, scene, advance };
}

/** Entidad seguida como las de flights/military/satellites tracking. */
function wallTrackedEntity(wallPosition) {
  return new Cesium.Entity({
    position: new Cesium.CallbackProperty(() => wallPosition, false),
  });
}

const EARTH_POINT = Cesium.Cartesian3.fromDegrees(-99.13, 19.43, 10_000);

test('cámara seguida (trackedCamera:197,211): la posición no cambia al avanzar ×3600', (t) => {
  const { clock, scene, advance } = drivenClock(t);
  const entity = wallTrackedEntity(EARTH_POINT);
  scene.pause();
  const frozen = trackedDisplayPositionForCamera(
    entity,
    clock.currentTime,
    new Cesium.Cartesian3(),
  );
  scene.simulate(3600);
  advance(5_000);
  const live = trackedDisplayPositionForCamera(
    entity,
    clock.currentTime,
    new Cesium.Cartesian3(),
  );
  assert.ok(Cesium.Cartesian3.equals(frozen, EARTH_POINT));
  assert.ok(Cesium.Cartesian3.equals(live, frozen), 'misma posición de pared');
  const offset = new Cesium.ConstantProperty(new Cesium.Cartesian3(0, -1, 1));
  assert.ok(
    Cesium.Cartesian3.equals(
      offset.getValue(clock.currentTime),
      new Cesium.Cartesian3(0, -1, 1),
    ),
  );
});

test('órbita de cámara (cameraOrientationControls:10) invariante con el reloj vivo', (t) => {
  const { clock, scene, advance } = drivenClock(t);
  const viewer = {
    clock,
    trackedEntity: wallTrackedEntity(EARTH_POINT),
    camera: {
      heading: 0,
      positionWC: Cesium.Cartesian3.fromDegrees(-99.13, 19.3, 60_000),
    },
  };
  scene.pause();
  const frozen = readCameraTargetFrame(viewer);
  scene.simulate(3600);
  advance(5_000);
  assert.deepEqual(readCameraTargetFrame(viewer), frozen);
  assert.ok(frozen.range > 1);
});

test('tamaño del icono seguido (flights:347, military:253) y cabina (cockpitCamera:65)', (t) => {
  const { clock, scene, advance } = drivenClock(t);
  const billboard = new Cesium.BillboardGraphics({
    width: 28,
    height: 28,
    scale: 1.2,
    scaleByDistance: new Cesium.NearFarScalar(1e3, 1, 1e7, 0.4),
  });
  const cockpitTarget = wallTrackedEntity(EARTH_POINT);
  scene.pause();
  const read = () => ({
    width: billboard.width.getValue(clock.currentTime),
    scale: billboard.scale.getValue(clock.currentTime),
    near: billboard.scaleByDistance.getValue(clock.currentTime).near,
    target: cockpitTarget.position.getValue(clock.currentTime),
  });
  const frozen = read();
  scene.simulate(3600);
  advance(5_000);
  assert.deepEqual(read(), frozen);
});

test('control negativo: una posición muestreada en el tiempo SÍ se pierde al avanzar', (t) => {
  const { clock, scene, advance } = drivenClock(t);
  const sampled = new Cesium.SampledPositionProperty();
  sampled.addSample(clock.currentTime, EARTH_POINT);
  sampled.addSample(
    Cesium.JulianDate.addSeconds(
      clock.currentTime,
      60,
      new Cesium.JulianDate(),
    ),
    EARTH_POINT,
  );
  const entity = new Cesium.Entity({ position: sampled });
  scene.pause();
  assert.ok(trackedDisplayPositionForCamera(entity, clock.currentTime));
  scene.simulate(3600);
  advance(5_000);
  assert.equal(
    trackedDisplayPositionForCamera(entity, clock.currentTime),
    undefined,
    'por eso ningún feed en vivo usa SampledPositionProperty con el reloj de escena',
  );
});
