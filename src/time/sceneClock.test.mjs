import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import {
  LIVE_MAX_SLEW_S,
  LIVE_RESYNC_INTERVAL_MS,
  SCENE_CLOCK_MAX_MULTIPLIER,
  createSceneClock,
  julianDateToUnixMs,
} from './sceneClock.js';

const WALL0 = Date.UTC(2026, 8, 25, 18, 45, 0);
const FRAME_MS = 1000 / 60;

/**
 * Reloj de pared y `performance.now` falsos: Cesium.Clock.tick mide con
 * performance.now (getTimestamp), la escena con `now` inyectado.
 */
function fakeTime(t) {
  const original = Object.getOwnPropertyDescriptor(performance, 'now');
  const time = { perf: 1_000, wall: WALL0 };
  performance.now = () => time.perf;
  t.after(() => {
    if (original) Object.defineProperty(performance, 'now', original);
    else delete performance.now;
  });
  return time;
}

function setup(t, options = {}) {
  const time = fakeTime(t);
  const clock = new Cesium.Clock();
  const listenersBefore = clock.onTick.numberOfListeners;
  const scene = createSceneClock({ clock, now: () => time.wall, ...options });
  t.after(() => scene.destroy());
  clock.tick();
  /** Avanza pared y monotónico `ms` en fotogramas de 60 Hz, con tick. */
  const run = (ms, { wallExtraMs = 0 } = {}) => {
    const frames = Math.round(ms / FRAME_MS);
    for (let i = 0; i < frames; i += 1) {
      time.perf += FRAME_MS;
      time.wall += FRAME_MS + (i === 0 ? wallExtraMs : 0);
      clock.tick();
    }
  };
  const sceneMs = () => julianDateToUnixMs(clock.currentTime);
  return { time, clock, scene, run, sceneMs, listenersBefore };
}

test('arranca EN VIVO: shouldAnimate, SYSTEM_CLOCK_MULTIPLIER ×1, sin límites y en «ahora»', (t) => {
  const { clock, scene, sceneMs } = setup(t);
  assert.equal(clock.shouldAnimate, true);
  assert.equal(clock.clockStep, Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER);
  assert.equal(clock.multiplier, 1);
  assert.equal(clock.clockRange, Cesium.ClockRange.UNBOUNDED);
  assert.ok(Math.abs(sceneMs() - WALL0) < 1);
  const state = scene.getState();
  assert.equal(Object.isFrozen(state), true);
  assert.deepEqual(
    { mode: state.mode, multiplier: state.multiplier, isLive: state.isLive },
    { mode: 'live', multiplier: 1, isLive: true },
  );
  assert.equal(state.currentIso, '2026-09-25T18:45:00.000Z');
  assert.ok(Math.abs(state.driftMs) < 1);
});

test('en vivo el reloj avanza con la pared (5 s → 5 s)', (t) => {
  const { run, sceneMs, time } = setup(t);
  run(5_000);
  assert.ok(Math.abs(sceneMs() - time.wall) < 1, `${sceneMs() - time.wall} ms`);
});

test('en vivo se resincroniza cada intervalo sin saltos mayores de un fotograma', (t) => {
  const { run, sceneMs, time, scene } = setup(t);
  // La pared salta +1 s respecto al monotónico (p. ej. ajuste NTP).
  run(FRAME_MS, { wallExtraMs: 1_000 });
  const lagBefore = time.wall - sceneMs();
  assert.ok(lagBefore > 999, 'la escena queda 1 s atrás');
  let previous = sceneMs();
  let maxStepMs = 0;
  for (let i = 0; i < 400; i += 1) {
    run(FRAME_MS);
    const step = sceneMs() - previous - FRAME_MS;
    maxStepMs = Math.max(maxStepMs, Math.abs(step));
    previous = sceneMs();
  }
  assert.ok(
    maxStepMs <= LIVE_MAX_SLEW_S * 1000 + 0.01,
    `salto máx. ${maxStepMs} ms`,
  );
  const corrected = lagBefore - (time.wall - sceneMs());
  const resyncs = Math.floor((400 * FRAME_MS) / LIVE_RESYNC_INTERVAL_MS);
  assert.ok(resyncs >= 1);
  assert.ok(
    Math.abs(corrected - resyncs * LIVE_MAX_SLEW_S * 1000) < 1,
    `corregido ${corrected} ms en ${resyncs} resincronías`,
  );
  assert.ok(scene.getState().driftMs < 0, 'la deriva publicada sigue visible');
});

test('AHORA (setNow) es el único salto grande: deriva a 0 en el acto', (t) => {
  const { run, sceneMs, time, scene } = setup(t);
  run(FRAME_MS, { wallExtraMs: 30_000 });
  scene.setNow();
  assert.ok(Math.abs(sceneMs() - time.wall) < 1);
  assert.ok(Math.abs(scene.getState().driftMs) < 1);
});

test('simulado ×600: 10 s de pared → 6000 s de escena (±1 %), sin resincronía', (t) => {
  const { run, sceneMs, scene, clock } = setup(t);
  scene.simulate(600);
  const start = sceneMs();
  run(10_000);
  const advanced = (sceneMs() - start) / 1000;
  assert.ok(Math.abs(advanced - 6000) / 6000 < 0.01, `${advanced} s`);
  assert.equal(clock.clockStep, Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER);
  assert.equal(clock.multiplier, 600);
  const state = scene.getState();
  assert.deepEqual(
    { mode: state.mode, multiplier: state.multiplier, isLive: state.isLive },
    { mode: 'simulated', multiplier: 600, isLive: false },
  );
  assert.ok(state.driftMs > 5_900_000, 'la deriva es el adelanto simulado');
});

test('multiplicador fuera de ×1…×3600 → RangeError y el estado no cambia', (t) => {
  const { scene } = setup(t);
  for (const bad of [0, 0.5, -60, SCENE_CLOCK_MAX_MULTIPLIER + 1, Number.NaN])
    assert.throws(() => scene.simulate(bad), RangeError, String(bad));
  assert.equal(scene.getState().mode, 'live');
  scene.simulate(SCENE_CLOCK_MAX_MULTIPLIER);
  assert.equal(scene.getState().multiplier, 3600);
});

test('pausa congela el reloj; simulate lo reanuda', (t) => {
  const { run, sceneMs, scene, clock } = setup(t);
  scene.pause();
  assert.equal(clock.shouldAnimate, false);
  const frozen = sceneMs();
  run(3_000);
  assert.equal(sceneMs(), frozen);
  assert.equal(scene.getState().mode, 'paused');
  scene.simulate(60);
  run(1_000);
  assert.ok(Math.abs(sceneMs() - frozen - 60_000) < 700);
});

test('setTime(ISO) fija la época: desde vivo queda en pausa; ISO inválida → TypeError', (t) => {
  const { scene, sceneMs, run } = setup(t);
  scene.setTime('2027-03-14T06:00:00Z');
  assert.equal(sceneMs(), Date.UTC(2027, 2, 14, 6));
  assert.equal(scene.getState().mode, 'paused');
  run(1_000);
  assert.equal(sceneMs(), Date.UTC(2027, 2, 14, 6));
  scene.simulate(3600);
  scene.setTime('2030-01-01T00:00:00Z');
  assert.equal(scene.getState().mode, 'simulated', 'simulado conserva ritmo');
  for (const bad of ['2027-03-14', '2027-13-01T00:00:00Z', 'ayer', 42])
    assert.throws(() => scene.setTime(bad), TypeError, String(bad));
  assert.equal(scene.getState().currentIso, '2030-01-01T00:00:00.000Z');
});

test('los suscriptores reciben cada cambio de modo y se pueden quitar', (t) => {
  const { scene } = setup(t);
  const seen = [];
  const off = scene.subscribe((state) => seen.push(state.mode));
  scene.simulate(60);
  scene.pause();
  scene.setNow();
  off();
  scene.pause();
  assert.deepEqual(seen, ['simulated', 'paused', 'live']);
});

test('un solo gobernador por reloj; destroy quita su listener y es idempotente', (t) => {
  const { clock, scene, listenersBefore, time } = setup(t);
  assert.equal(clock.onTick.numberOfListeners, listenersBefore + 1);
  assert.throws(
    () => createSceneClock({ clock, now: () => time.wall }),
    /ya tiene gobernador/,
  );
  scene.destroy();
  scene.destroy();
  assert.equal(clock.onTick.numberOfListeners, listenersBefore);
  const again = createSceneClock({ clock, now: () => time.wall });
  assert.equal(clock.onTick.numberOfListeners, listenersBefore + 1);
  again.destroy();
  assert.throws(() => scene.simulate(60), /destruido/);
});

test('fuera de «simulated» el multiplicador del reloj vuelve a ×1 (pausa, AHORA, setTime)', (t) => {
  const { scene, clock } = setup(t);
  scene.simulate(600);
  assert.equal(clock.multiplier, 600);
  scene.pause();
  assert.equal(clock.multiplier, 1, 'pausa');
  assert.equal(scene.getState().multiplier, 1);
  scene.simulate(3600);
  scene.setNow();
  assert.equal(clock.multiplier, 1, 'AHORA');
  assert.equal(scene.getState().multiplier, 1);
  scene.simulate(60);
  scene.pause();
  scene.setTime('2027-03-14T06:00:00Z');
  assert.equal(clock.multiplier, 1, 'setTime en pausa');
});
