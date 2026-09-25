import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVE_RENDER_INTERVAL_MS,
  SCENE_CLOCK_CHANGE_REASON,
  SCENE_CLOCK_RENDER_OWNER,
  bindSceneClockRender,
} from './sceneClockRender.js';

/** Reloj de escena falso con suscripción, y gobernador/temporizadores espía. */
function setup(mode = 'live') {
  const listeners = new Set();
  let state = { mode };
  const sceneClock = {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit: (next) => {
      state = next;
      for (const fn of listeners) fn(state);
    },
    listeners,
  };
  const holds = new Set();
  const log = { requests: 0, reasons: [] };
  const timers = new Map();
  let nextId = 1;
  const governor = {
    hold: (id) => holds.add(id),
    release: (id) => holds.delete(id),
    request: (reason) => {
      log.requests += 1;
      log.reasons.push(reason);
    },
  };
  const clockTimers = {
    setInterval: (fn, ms) => {
      timers.set(nextId, { fn, ms });
      return nextId++;
    },
    clearInterval: (id) => timers.delete(id),
  };
  return { sceneClock, holds, log, timers, governor, clockTimers };
}

test('simulado: hold continuo mientras avanza; pausa y vivo lo sueltan', () => {
  const { sceneClock, holds, governor, clockTimers } = setup('live');
  const unbind = bindSceneClockRender({ sceneClock, governor, clockTimers });
  assert.equal(holds.has(SCENE_CLOCK_RENDER_OWNER), false);
  sceneClock.emit({ mode: 'simulated' });
  assert.equal(holds.has(SCENE_CLOCK_RENDER_OWNER), true);
  sceneClock.emit({ mode: 'paused' });
  assert.equal(holds.has(SCENE_CLOCK_RENDER_OWNER), false);
  sceneClock.emit({ mode: 'simulated' });
  sceneClock.emit({ mode: 'live' });
  assert.equal(holds.size, 0);
  unbind();
});

test('en vivo, sin hold: un requestRender de baja frecuencia (solo mientras vivo)', () => {
  const { sceneClock, log, timers, governor, clockTimers } = setup('live');
  const unbind = bindSceneClockRender({ sceneClock, governor, clockTimers });
  assert.equal(timers.size, 1);
  const [timer] = timers.values();
  assert.equal(timer.ms, LIVE_RENDER_INTERVAL_MS);
  timer.fn();
  assert.equal(log.requests, 1);
  sceneClock.emit({ mode: 'paused' });
  assert.equal(timers.size, 0, 'en pausa no hay temporizador');
  sceneClock.emit({ mode: 'live' });
  sceneClock.emit({ mode: 'live' });
  assert.equal(timers.size, 1, 'un solo temporizador aunque se repita vivo');
  unbind();
});

test('unbind suelta el hold, para el temporizador, se desuscribe y es idempotente', () => {
  const { sceneClock, holds, timers, governor, clockTimers } = setup('live');
  const unbind = bindSceneClockRender({ sceneClock, governor, clockTimers });
  sceneClock.emit({ mode: 'simulated' });
  unbind();
  unbind();
  assert.equal(holds.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(sceneClock.listeners.size, 0);
});

test('en pausa, un setTime (o cualquier cambio del reloj) pide un fotograma', () => {
  const { sceneClock, log, holds, governor, clockTimers } = setup('paused');
  const unbind = bindSceneClockRender({ sceneClock, governor, clockTimers });
  assert.equal(log.requests, 0, 'enlazar no pide fotograma por sí solo');
  sceneClock.emit({ mode: 'paused', currentIso: '2026-09-25T08:39:00.000Z' });
  assert.equal(holds.size, 0, 'en pausa sigue sin hold');
  assert.equal(log.requests, 1, 'seek en pausa: un requestRender');
  assert.deepEqual(log.reasons, [SCENE_CLOCK_CHANGE_REASON]);
  sceneClock.emit({ mode: 'simulated' });
  sceneClock.emit({ mode: 'live' });
  assert.equal(log.requests, 3, 'cada notificación pide fotograma');
  unbind();
});
