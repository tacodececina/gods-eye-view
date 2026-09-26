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

/**
 * Consumidores conocidos: archivo → un patrón del identificador por cada
 * lectura de `clock.currentTime`. Sin números de línea: una edición ajena que
 * desplace el archivo no rompe el test; una lectura NUEVA sí.
 */
export const CLOCK_CONSUMERS = Object.freeze({
  'data/trackedCamera.js': [
    /^\s*viewer\.clock\.currentTime,$/,
    /viewFrom\.getValue\(viewer\.clock\.currentTime/,
  ],
  'layers/flights/motion.js': [
    /const time = flightState\._viewer\.clock\.currentTime/,
  ],
  'layers/military/motion.js': [
    /const time = flightState\._viewer\.clock\.currentTime/,
  ],
  'ui/cockpitCamera.js': [/^\s*this\.viewer\.clock\.currentTime,$/],
  'ui/cameraOrientationControls.js': [
    /entity\?\.position\?\.getValue\(viewer\.clock\?\.currentTime\)/,
  ],
});
/**
 * Lecturas permitidas fuera de la lista: el propio reloj (sin límite), un
 * comentario y los lectores de TIEMPO DE ESCENA que añade P5 (marco precargado
 * en cada tick, anillo con el time del fotograma y SUN EL del HUD) y la fase
 * visual (pose de inicio con el Sol de escena).
 */
const OTHER_READERS = Object.freeze({
  'cameraVerbs.js': [/^\s*\/\/ Wall-clock dt: clock\.currentTime FREEZES/],
  'time/sceneClock.js': null,
  'app/sceneTime.js': [/frames\.check\(clock\.currentTime\)/],
  'celestialRing.js': [/_draw\(time = this\.viewer\.clock\.currentTime\)/],
  'hud.js': [/const time = this\.viewer\?\.clock\?\.currentTime;/],
  // Fase visual T2: la pose Global sale del Sol del tiempo de ESCENA (P5).
  'ui/shell/homeView.js': [/^\s*viewer\.clock\.currentTime,$/],
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

/** Cada patrón casa con exactamente una lectura, y no sobra ninguna. */
function unmatchedReads(file, lines, patterns) {
  const reads = lines.filter((text) => READ_PATTERN.test(text));
  const problems = patterns.flatMap((pattern) => {
    const hits = reads.filter((text) => pattern.test(text)).length;
    return hits === 1 ? [] : [`${file}: ${pattern} casa ${hits}×`];
  });
  const extra = reads.filter((text) => !patterns.some((p) => p.test(text)));
  return [...problems, ...extra.map((text) => `${file}: ${text.trim()}`)];
}

test('los consumidores de la propuesta siguen leyendo clock.currentTime (por identificador)', () => {
  for (const [file, patterns] of Object.entries(CLOCK_CONSUMERS))
    assert.deepEqual(unmatchedReads(file, read(file), patterns), [], file);
});

test('una edición ajena que desplaza líneas no rompe la lista de consumidores', () => {
  const shifted = (file) => ['// línea ajena', ...read(file)];
  for (const [file, patterns] of Object.entries(CLOCK_CONSUMERS))
    assert.deepEqual(unmatchedReads(file, shifted(file), patterns), [], file);
  const added = [...read('hud.js'), 'const t = viewer.clock.currentTime;'];
  assert.equal(
    unmatchedReads('hud.js', added, OTHER_READERS['hud.js']).length,
    1,
    'una lectura nueva sí se detecta',
  );
});

test('ningún otro módulo de src/ lee clock.currentTime (SGP4 y feeds siguen en Date.now)', () => {
  const allowed = { ...CLOCK_CONSUMERS, ...OTHER_READERS };
  const unexpected = sourceFiles(SRC).flatMap((file) =>
    allowed[file] === null
      ? []
      : unmatchedReads(file, read(file), allowed[file] ?? []),
  );
  assert.deepEqual(unexpected, []);
});

test('SGP4 y los relojes «hora real» usan la pared, no el reloj de escena', () => {
  const sites = {
    'layers/satellites/rendering.js': [
      /const now = new Date\(\);/,
      /const now = focusNowMs\(Date\.now\(\)\);/,
    ],
    'layers/satellites/tracking.js': [/^\s*: new Date\(\);$/],
    'layers/satellites/modelsHost.js': [/nowMs: Date\.now\(\),/],
    'layers/satellites/orbits.js': [
      /fromMs: Date\.now\(\),/,
      /const referenceDate = new Date\(\);/,
    ],
    'ui/cockpitInstruments.js': [
      /this\.clock\.textContent = new Date\(\)\.toISOString\(\)/,
    ],
  };
  for (const [file, patterns] of Object.entries(sites)) {
    const lines = read(file);
    for (const pattern of patterns)
      assert.ok(
        lines.some((line) => pattern.test(line)),
        `${file}: ${pattern}`,
      );
    assert.deepEqual(unmatchedReads(file, lines, []), [], file);
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

test('cámara seguida (trackedCamera): la posición no cambia al avanzar ×3600', (t) => {
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

test('órbita de cámara (cameraOrientationControls) invariante con el reloj vivo', (t) => {
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

test('tamaño del icono seguido (flights, military) y cabina (cockpitCamera)', (t) => {
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
