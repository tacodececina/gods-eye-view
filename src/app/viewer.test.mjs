import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { createApplicationViewer } from './viewer.js';
import {
  getViewerSceneClock,
  unbindViewerSceneClock,
} from '../time/sceneClock.js';

/** Viewer falso con el Cesium.Clock real (no hace falta WebGL). */
class FakeViewer {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.clock = new Cesium.Clock();
    this.allowDataSourcesToSuspendAnimation = true;
    this.destroyed = false;
    this.scene = {
      globe: { show: true },
      skyAtmosphere: {},
    };
  }
  destroy() {
    this.destroyed = true;
  }
}

const make = () =>
  createApplicationViewer({
    container: 'c',
    creditContainer: {},
    Viewer: FakeViewer,
  });

test('P5-05: el viewer arranca con el reloj único EN VIVO (sin widget de animación)', () => {
  const viewer = make();
  assert.equal(viewer.options.animation, false, 'animation:false intacto');
  assert.equal(viewer.options.timeline, false);
  assert.equal(viewer.clock.shouldAnimate, true);
  assert.equal(
    viewer.clock.clockStep,
    Cesium.ClockStep.SYSTEM_CLOCK_MULTIPLIER,
  );
  assert.equal(
    viewer.allowDataSourcesToSuspendAnimation,
    false,
    'una fuente de datos cargando no puede congelar el reloj de escena',
  );
  const sceneClock = getViewerSceneClock(viewer);
  assert.equal(sceneClock.getState().mode, 'live');
  unbindViewerSceneClock(viewer);
});

test('unbind quita el gobernador del reloj una vez (sin listeners huérfanos)', () => {
  const viewer = make();
  const before = viewer.clock.onTick.numberOfListeners;
  unbindViewerSceneClock(viewer);
  unbindViewerSceneClock(viewer);
  assert.equal(viewer.clock.onTick.numberOfListeners, before - 1);
  assert.equal(getViewerSceneClock(viewer), null);
});

test('si la configuración falla, el viewer se destruye y el reloj se suelta', () => {
  class BrokenViewer extends FakeViewer {
    constructor(...args) {
      super(...args);
      Object.defineProperty(this.scene, 'skyAtmosphere', {
        get() {
          throw new Error('sin atmósfera');
        },
      });
    }
  }
  let built = null;
  assert.throws(
    () =>
      createApplicationViewer({
        container: 'c',
        creditContainer: {},
        Viewer: class extends BrokenViewer {
          constructor(...args) {
            super(...args);
            built = this;
          }
        },
      }),
    /sin atmósfera/,
  );
  assert.equal(built.destroyed, true);
  assert.equal(getViewerSceneClock(built), null);
  assert.equal(built.clock.onTick.numberOfListeners, 0);
});
