import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { MOON_RENDER_OWNER, createMoonLifecycle } from './lifecycle.js';

/** Material y primitiva falsos que cuentan texturas en `gpu` y anotan en `log`. */
function fakeGpuClasses(gpu, log) {
  class FakeMaterial {
    constructor() {
      gpu.textures += 1;
      this.destroyed = false;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      log.push('material.destroy');
      gpu.textures -= 1;
      this.destroyed = true;
    }
  }
  class FakePrimitive {
    constructor() {
      this.appearance = { material: new FakeMaterial() };
      this.destroyed = false;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return FakePrimitive;
}

/** Evento preUpdate real que anota cuándo se quita un listener. */
function loggedEvent(log) {
  const event = new Cesium.Event();
  const add = event.addEventListener.bind(event);
  event.addEventListener = (fn) => {
    const remove = add(fn);
    return () => {
      log.push('listener.remove');
      remove();
    };
  };
  return event;
}

/**
 * Contexto falso que cuenta texturas como la GPU del prototipo
 * (scene-perf/result3-leak.json): el material crea su textura y solo
 * material.destroy() la libera; Primitive.destroy() no toca el material.
 */
function fakeContext() {
  const gpu = { textures: 0 };
  const log = [];
  const list = [];
  const scene = {
    moon: { show: true },
    preUpdate: loggedEvent(log),
    primitives: {
      get length() {
        return list.length;
      },
      add: (p) => list.push(p),
      remove: (p) => {
        const i = list.indexOf(p);
        if (i === -1) return false;
        list.splice(i, 1);
        log.push('primitives.remove');
        p.destroy();
        return true;
      },
    },
  };
  return { gpu, log, scene, list, FakePrimitive: fakeGpuClasses(gpu, log) };
}

function fakeSceneClock(mode = 'live') {
  const listeners = new Set();
  let state = { mode };
  return {
    listeners,
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit: (next) => {
      state = next;
      for (const fn of listeners) fn(state);
    },
  };
}

function setup({ mode = 'live', createPrimitive } = {}) {
  const ctx = fakeContext();
  const holds = new Set();
  const frames = [];
  const sceneClock = fakeSceneClock(mode);
  const render = {
    hold: (id) => holds.add(id),
    release: (id) => {
      if (holds.delete(id)) ctx.log.push('release');
    },
  };
  const lifecycle = createMoonLifecycle({
    scene: ctx.scene,
    createPrimitive: createPrimitive ?? (() => new ctx.FakePrimitive()),
    onFrame: (primitive, time) => frames.push({ primitive, time }),
    render,
    sceneClock,
    applyScenePolicy: () => {
      const previous = ctx.scene.moon.show;
      ctx.scene.moon.show = false;
      return () => {
        ctx.log.push('policy.restore');
        ctx.scene.moon.show = previous;
      };
    },
  });
  return { ...ctx, holds, frames, sceneClock, lifecycle };
}

test('enable: primitiva en escena, un listener preUpdate con el time del evento y hold si el reloj corre', () => {
  const s = setup();
  s.lifecycle.enable();
  s.lifecycle.enable();
  assert.equal(s.list.length, 1, 'enable es idempotente');
  assert.equal(s.scene.preUpdate.numberOfListeners, 1);
  assert.equal(s.scene.moon.show, false, 'una sola Luna');
  assert.ok(s.holds.has(MOON_RENDER_OWNER));
  const time = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');
  s.scene.preUpdate.raiseEvent(s.scene, time);
  assert.equal(s.frames.length, 1);
  assert.equal(s.frames[0].time, time);
  assert.equal(s.frames[0].primitive, s.list[0]);
});

test('disable en el orden medido: listener → material → remove → destroy → hold → política', () => {
  const s = setup();
  s.lifecycle.enable();
  s.log.length = 0;
  s.lifecycle.disable();
  assert.deepEqual(s.log, [
    'listener.remove',
    'primitives.remove',
    'material.destroy',
    'release',
    'policy.restore',
  ]);
  s.lifecycle.disable();
  assert.equal(s.log.length, 5, 'disable es idempotente');
});

test('P5-13: 20 ciclos enable/disable sin fuga de texturas, primitivas, listeners ni holds', () => {
  const s = setup();
  const before = {
    preUpdate: s.scene.preUpdate.numberOfListeners,
    clock: s.sceneClock.listeners.size,
  };
  for (let i = 0; i < 20; i += 1) {
    s.lifecycle.enable();
    s.lifecycle.disable();
  }
  assert.equal(s.gpu.textures, 0, 'texLeak = 0');
  assert.equal(s.list.length, 0);
  assert.equal(s.scene.preUpdate.numberOfListeners, before.preUpdate);
  assert.equal(s.sceneClock.listeners.size, before.clock);
  assert.equal(s.holds.size, 0);
  assert.equal(s.scene.moon.show, true, 'política restaurada');
});

test('control: sin material.destroy() el mismo contexto falso fuga 20 texturas', () => {
  const s = setup();
  for (let i = 0; i < 20; i += 1) {
    const primitive = new s.FakePrimitive();
    s.scene.primitives.add(primitive);
    s.scene.primitives.remove(primitive);
  }
  assert.equal(s.gpu.textures, 20);
});

test('el hold sigue al reloj: en pausa se suelta, al reanudar vuelve', () => {
  const s = setup({ mode: 'paused' });
  s.lifecycle.enable();
  assert.equal(s.holds.size, 0);
  s.sceneClock.emit({ mode: 'simulated' });
  assert.ok(s.holds.has(MOON_RENDER_OWNER));
  s.sceneClock.emit({ mode: 'paused' });
  assert.equal(s.holds.size, 0);
  s.lifecycle.disable();
  s.sceneClock.emit({ mode: 'live' });
  assert.equal(s.holds.size, 0, 'deshabilitada no vuelve a pedir hold');
});

test('si crear la primitiva falla, enable no deja nada a medias', () => {
  const s = setup({
    createPrimitive: () => {
      throw new Error('sin WebGL');
    },
  });
  assert.throws(() => s.lifecycle.enable(), /sin WebGL/);
  assert.equal(s.lifecycle.isEnabled(), false);
  assert.equal(s.scene.preUpdate.numberOfListeners, 0);
  assert.equal(s.sceneClock.listeners.size, 0);
  assert.equal(s.holds.size, 0);
  assert.equal(s.scene.moon.show, true);
});

test('P5-08: WGS84 intacto tras 5 ciclos (la Luna usa su propio modelMatrix)', () => {
  const s = setup();
  const radii = Cesium.Cartesian3.clone(Cesium.Ellipsoid.WGS84.radii);
  for (let i = 0; i < 5; i += 1) {
    s.lifecycle.enable();
    s.lifecycle.disable();
  }
  assert.equal(Cesium.Ellipsoid.default, Cesium.Ellipsoid.WGS84);
  assert.ok(Cesium.Cartesian3.equals(Cesium.Ellipsoid.WGS84.radii, radii));
});

test('destroy apaga y no admite más enable', () => {
  const s = setup();
  s.lifecycle.enable();
  s.lifecycle.destroy();
  s.lifecycle.destroy();
  assert.equal(s.gpu.textures, 0);
  assert.throws(() => s.lifecycle.enable(), /destruida/);
});
