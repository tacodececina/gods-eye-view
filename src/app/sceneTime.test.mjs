import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { mountSceneTime } from './sceneTime.js';
import {
  bindViewerSceneClock,
  unbindViewerSceneClock,
} from '../time/sceneClock.js';

function setup() {
  const viewer = { clock: new Cesium.Clock() };
  bindViewerSceneClock(viewer);
  const holds = new Set();
  const requests = [];
  const governor = {
    hold: (id) => holds.add(id),
    release: (id) => holds.delete(id),
    request: (reason) => requests.push(reason),
  };
  const checks = [];
  const keeper = {
    check: (jd) => checks.push(jd),
    status: () => 'ok',
    icrfToFixed: () => ({ status: 'ok' }),
    destroy: () => {
      keeper.destroyed = true;
    },
  };
  const timers = new Set();
  const clockTimers = {
    setInterval: (fn) => {
      const id = { fn };
      timers.add(id);
      return id;
    },
    clearInterval: (id) => timers.delete(id),
  };
  return {
    viewer,
    holds,
    requests,
    governor,
    checks,
    keeper,
    timers,
    clockTimers,
  };
}

test('monta el tiempo de escena: marco precargado en cada tick y render del reloj', () => {
  const s = setup();
  const listeners = s.viewer.clock.onTick.numberOfListeners;
  const sceneTime = mountSceneTime({
    viewer: s.viewer,
    governor: s.governor,
    createKeeper: () => s.keeper,
    clockTimers: s.clockTimers,
  });
  assert.equal(s.viewer.clock.onTick.numberOfListeners, listeners + 1);
  s.viewer.clock.tick();
  s.viewer.clock.tick();
  assert.equal(s.checks.length, 2, 'check barato en cada tick');
  assert.equal(s.checks[1], s.viewer.clock.currentTime);
  assert.equal(s.timers.size, 1, 'vivo: requestRender periódico');
  sceneTime.sceneClock.simulate(600);
  assert.ok(s.holds.has('scene-clock'));
  assert.equal(sceneTime.frames.status(), 'ok');
  sceneTime.destroy();
  unbindViewerSceneClock(s.viewer);
});

test('destroy suelta hold, temporizador, listener del reloj y el keeper (idempotente)', () => {
  const s = setup();
  const listeners = s.viewer.clock.onTick.numberOfListeners;
  const sceneTime = mountSceneTime({
    viewer: s.viewer,
    governor: s.governor,
    createKeeper: () => s.keeper,
    clockTimers: s.clockTimers,
  });
  sceneTime.sceneClock.simulate(60);
  sceneTime.destroy();
  sceneTime.destroy();
  assert.equal(s.viewer.clock.onTick.numberOfListeners, listeners);
  assert.equal(s.holds.size, 0);
  assert.equal(s.timers.size, 0);
  assert.equal(s.keeper.destroyed, true);
  s.viewer.clock.tick();
  unbindViewerSceneClock(s.viewer);
});

test('un marco que queda listo pide un fotograma al gobernador', () => {
  const s = setup();
  let onChange;
  const sceneTime = mountSceneTime({
    viewer: s.viewer,
    governor: s.governor,
    createKeeper: (options) => {
      onChange = options.onChange;
      return s.keeper;
    },
    clockTimers: s.clockTimers,
  });
  onChange('ok');
  assert.deepEqual(s.requests, ['icrf-frame']);
  sceneTime.destroy();
  unbindViewerSceneClock(s.viewer);
});

test('sin reloj de escena ligado al viewer no monta nada a medias', () => {
  assert.throws(
    () =>
      mountSceneTime({
        viewer: { clock: new Cesium.Clock() },
        governor: setup().governor,
      }),
    /reloj de escena/,
  );
});
