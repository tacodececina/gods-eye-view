/**
 * P5-11: la tira TIEMPO sobre el reloj único. REANUDAR vuelve a donde estaba
 * la escena antes de la PAUSA: a vivo si la pausa se hizo en vivo (y no ha
 * derivado), o al ritmo de la simulación pausada. Nunca a un ritmo viejo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { createSceneClock } from '../time/sceneClock.js';
import {
  createTimeMemory,
  ensureReturnPoint,
  isPausedFromLive,
  returnToEarth,
  sceneShortcutRunner,
  setSystemPose,
  timeCommands,
  trackClock,
} from './eyeinskyEarthMoon.js';

const WALL0 = Date.UTC(2026, 8, 25, 18, 45, 0);

function setup(t) {
  const original = Object.getOwnPropertyDescriptor(performance, 'now');
  const time = { perf: 1_000, wall: WALL0 };
  performance.now = () => time.perf;
  t.after(() => {
    if (original) Object.defineProperty(performance, 'now', original);
    else delete performance.now;
  });
  const clock = new Cesium.Clock();
  const sceneClock = createSceneClock({ clock, now: () => time.wall });
  t.after(() => sceneClock.destroy());
  const memory = createTimeMemory();
  const strip = { setError() {}, closeSeek() {} };
  const run = timeCommands({ sceneClock, strip, memory });
  const press = (type) => run({ type });
  return { time, sceneClock, press };
}

test('PAUSA en vivo → REANUDAR vuelve a EN VIVO', (t) => {
  const { sceneClock, press } = setup(t);
  press('pause');
  assert.equal(sceneClock.getState().mode, 'paused');
  press('pause');
  assert.equal(sceneClock.getState().mode, 'live');
});

test('AVANCE ×3600 → AHORA → PAUSA → REANUDAR no resucita el ×3600', (t) => {
  const { sceneClock, press } = setup(t);
  press('advance');
  press('advance');
  press('advance');
  assert.equal(sceneClock.getState().multiplier, 3600);
  press('now');
  press('pause');
  press('pause');
  const state = sceneClock.getState();
  assert.equal(state.mode, 'live');
  assert.notEqual(state.multiplier, 3600);
});

test('PAUSA en simulación ×600 → REANUDAR sigue a ×600', (t) => {
  const { sceneClock, press } = setup(t);
  press('advance');
  press('advance');
  press('pause');
  press('pause');
  const state = sceneClock.getState();
  assert.equal(state.mode, 'simulated');
  assert.equal(state.multiplier, 600);
});

test('PAUSA en vivo que ya derivó más de la tolerancia reanuda como simulación ×1, no salta a ahora', (t) => {
  const { time, sceneClock, press } = setup(t);
  press('pause');
  time.wall += 120_000;
  press('pause');
  const state = sceneClock.getState();
  assert.equal(state.mode, 'simulated');
  assert.equal(state.multiplier, 1);
});

test('una pausa ajena (sin pasar por la tira) desde vivo también reanuda a vivo', (t) => {
  const { sceneClock, press } = setup(t);
  press('advance');
  press('now');
  sceneClock.pause();
  press('pause');
  assert.equal(sceneClock.getState().mode, 'live');
});

/** Mundo mínimo para la foto de retorno y VOLVER A TIERRA. */
function returnWorld({ flight = 'complete' } = {}) {
  const layers = new Map([
    ['earthquakes', false],
    ['moon', true],
  ]);
  const log = [];
  const view = {
    destination: new Cesium.Cartesian3(7e6, 0, 0),
    orientation: {
      direction: new Cesium.Cartesian3(-1, 0, 0),
      up: new Cesium.Cartesian3(0, 0, 1),
    },
  };
  const camera = {
    positionWC: view.destination,
    directionWC: view.orientation.direction,
    upWC: view.orientation.up,
    frustum: { fov: Math.PI / 3 },
    setView() {},
    flyTo: (options) =>
      flight === 'complete' ? options.complete() : options.cancel(),
  };
  const ctx = {
    viewer: { camera, scene: { requestRender() {} } },
    dataManager: {
      getAll: () => [...layers].map(([id, enabled]) => ({ id, enabled })),
      async setEnabled(id, enabled, { origin }) {
        log.push([id, enabled, origin]);
        layers.set(id, enabled);
      },
    },
    shell: {
      getDossier: () => ({ context: { key: 'view' } }),
      isFollowing: () => false,
      getDockState: () => ({ pane: 'ops', expanded: true }),
      select() {},
      refocus: () => false,
      restoreDock() {},
    },
    ring: { get: () => false, set() {} },
    reduced: () => false,
    actions: { setNotice() {} },
    suspension: {
      getSuspended: () => ['earthquakes'],
      isOffLive: () => false,
    },
    memory: { snapshot: null },
  };
  return { ctx, layers, log };
}

test('simular → APUNTAR → AHORA → VOLVER: los sismos suspendidos siguen encendidos', async () => {
  const { ctx, layers, log } = returnWorld();
  ensureReturnPoint(ctx);
  assert.deepEqual(ctx.memory.snapshot.layers, ['earthquakes', 'moon']);
  layers.set('earthquakes', true); // AHORA los devuelve.
  await returnToEarth(ctx);
  assert.equal(layers.get('earthquakes'), true);
  assert.deepEqual(log, []);
  assert.equal(ctx.memory.snapshot, null, 'retorno resuelto: foto consumida');
});

test('un VOLVER cancelado conserva la foto de retorno', async () => {
  const { ctx } = returnWorld({ flight: 'cancel' });
  ensureReturnPoint(ctx);
  const snapshot = ctx.memory.snapshot;
  await returnToEarth(ctx);
  assert.equal(ctx.memory.snapshot, snapshot);
});

test('SISTEMA activa el despeje de etiquetas; VOLVER A TIERRA lo restaura', async () => {
  const { ctx } = returnWorld();
  const declutter = [];
  ctx.shell.declutter = (on) => declutter.push(on);
  setSystemPose(ctx, true);
  setSystemPose(ctx, true);
  assert.deepEqual(declutter, [true], 'solo en el cambio');
  assert.equal(ctx.memory.systemPose, true);
  ensureReturnPoint(ctx);
  await returnToEarth(ctx);
  assert.deepEqual(declutter, [true, false]);
  assert.equal(ctx.memory.systemPose, false);
});

test('pausa hecha en vivo frente a una pausa en otra época (FECHA)', (t) => {
  const { time, sceneClock, press } = setup(t);
  const memory = createTimeMemory();
  press('pause');
  trackClock(memory, sceneClock.getState());
  time.wall += 61_000;
  assert.equal(isPausedFromLive(memory, sceneClock.getState()), true);
  const seek = createTimeMemory();
  trackClock(seek, sceneClock.getState()); // vivo
  sceneClock.setNow();
  trackClock(seek, sceneClock.getState());
  sceneClock.setTime('2031-01-01T00:00:00Z');
  trackClock(seek, sceneClock.getState());
  assert.equal(sceneClock.getState().mode, 'paused');
  assert.equal(
    isPausedFromLive(seek, sceneClock.getState()),
    false,
    'un salto de FECHA no es «la pausa supera 60 s»',
  );
});

/** Contexto mínimo para los atajos de escena. */
function shortcutWorld(t, moon = { enabled: true, status: 'ok' }) {
  const { sceneClock, press } = setup(t);
  const ran = [];
  const notices = [];
  let seekOpen = false;
  const ctx = {
    sceneClock,
    memory: { ...createTimeMemory(), snapshot: null },
    moonState: () => moon,
    strip: {
      setError() {},
      closeSeek: ({ refocus } = {}) => {
        const was = seekOpen;
        seekOpen = false;
        return was && refocus === true;
      },
    },
    shell: { notice: (text) => notices.push(text) },
    doc: { querySelector: () => null },
  };
  const run = sceneShortcutRunner(ctx, { runAction: (id) => ran.push(id) });
  return { ctx, run, ran, notices, press, openSeek: () => (seekOpen = true) };
}

test('atajos: L apunta, Shift+L encuadra, P pausa/reanuda, N vuelve a AHORA', (t) => {
  const { ctx, run, ran } = shortcutWorld(t);
  assert.equal(run('aim-moon'), true);
  assert.equal(run('earth-moon-system'), true);
  assert.deepEqual(ran, ['aim-moon', 'earth-moon-system']);
  assert.equal(run('toggle-pause'), true);
  assert.equal(ctx.sceneClock.getState().mode, 'paused');
  assert.equal(run('toggle-pause'), true);
  assert.equal(ctx.sceneClock.getState().mode, 'live');
  assert.equal(run('now'), false, 'ya en vivo: N no consume la tecla');
  ctx.sceneClock.simulate(600);
  assert.equal(run('now'), true);
  assert.equal(ctx.sceneClock.getState().mode, 'live');
});

test('atajos: L con la Luna apagada no vuela y dice el motivo', (t) => {
  const { run, ran, notices } = shortcutWorld(t, {
    enabled: false,
    status: 'disabled',
  });
  assert.equal(run('aim-moon'), true);
  assert.deepEqual(ran, []);
  assert.deepEqual(notices, [
    'APUNTAR A LA LUNA no disponible: Capa Luna apagada',
  ]);
});

test('atajos: Esc solo se consume si cerró el campo FECHA; con un diálogo abierto, nada', (t) => {
  const { ctx, run, openSeek, ran } = shortcutWorld(t);
  assert.equal(run('close-date-field'), false);
  openSeek();
  assert.equal(run('close-date-field'), true);
  ctx.doc.querySelector = (selector) =>
    selector === 'dialog[open]' ? {} : null;
  assert.equal(run('aim-moon'), false);
  assert.deepEqual(ran, []);
});
