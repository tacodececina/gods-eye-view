import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { MOON_CREDIT, createMoonLayer } from './index.js';
import { DIDACTIC_BAND_TEXT } from './scaleMode.js';

const TIME = Cesium.JulianDate.fromIso8601('2026-09-25T18:45:00Z');
const MOON_M = new Cesium.Cartesian3(3.5e8, 1.2e8, -4e7);

/** Documento mínimo: crea nodos con dataset/atributos y los cuelga. */
function fakeDocument() {
  const nodes = [];
  const make = () => {
    const node = {
      dataset: {},
      attributes: {},
      hidden: false,
      textContent: '',
      setAttribute(k, v) {
        this.attributes[k] = v;
      },
      remove() {
        nodes.splice(nodes.indexOf(this), 1);
      },
    };
    return node;
  };
  return {
    nodes,
    createElement: () => make(),
    body: { append: (node) => nodes.push(node) },
  };
}

function fakeViewer() {
  const list = [];
  return {
    clock: new Cesium.Clock(),
    scene: {
      moon: { show: false },
      preUpdate: new Cesium.Event(),
      primitives: {
        get length() {
          return list.length;
        },
        add: (p) => list.push(p),
        remove: (p) => {
          const i = list.indexOf(p);
          if (i === -1) return false;
          list.splice(i, 1);
          p.destroy();
          return true;
        },
      },
    },
    list,
  };
}

function fakePrimitive() {
  return {
    show: false,
    modelMatrix: Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY),
    appearance: {
      material: {
        destroyed: false,
        isDestroyed() {
          return this.destroyed;
        },
        destroy() {
          this.destroyed = true;
        },
      },
    },
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

/** Servicio celeste falso: estado fijo «ok» o una ausencia. */
function fakeCelestial(status = 'ok') {
  const state = {
    status,
    reason: status === 'ok' ? null : 'frame',
    epochIso: '2026-09-25T18:45:00.000Z',
    icrfToFixed: Cesium.Matrix3.clone(Cesium.Matrix3.IDENTITY),
    moonFixedM: MOON_M,
    moonIcrfKm: new Cesium.Cartesian3(3.5e5, 1.2e5, -4e4),
    source: 'DE441',
    validity: { validFrom: 0, validTo: 1 },
    distanceKm: 372_000,
    lightSeconds: 1.24,
    phaseFraction: 0.99,
    phaseName: 'luna llena',
    subLunarLonLat: { lonDeg: 10, latDeg: -5 },
    apparentDiameterDeg: 0.535,
  };
  return { at: () => state, subscribe: () => () => {}, state };
}

function setup({ status = 'ok' } = {}) {
  const viewer = fakeViewer();
  const document = fakeDocument();
  const holds = new Set();
  const requests = [];
  const sceneClock = {
    getState: () => ({ mode: 'live' }),
    subscribe: () => () => {},
  };
  const celestial = fakeCelestial(status);
  const layer = createMoonLayer({
    render: {
      hold: (id) => holds.add(id),
      release: (id) => holds.delete(id),
      request: (r) => requests.push(r),
    },
    documentRef: document,
    createPrimitive: fakePrimitive,
    celestialOf: () => celestial,
    sceneClockOf: () => sceneClock,
  });
  layer.init(viewer);
  return { viewer, document, holds, requests, layer, celestial };
}

test('capa de catálogo honesta: id moon, fuente DE441 calculada, sin sondeo ni datos live', () => {
  const { layer } = setup();
  assert.equal(layer.id, 'moon');
  assert.equal(layer.updateInterval, 0);
  assert.match(layer.source, /DE441/);
  assert.match(layer.source, /no en vivo/i);
  assert.equal(layer.update(), true);
});

test('enable coloca la Luna con el time de preUpdate y publica getState()', () => {
  const { viewer, layer } = setup();
  assert.equal(layer.getState().status, 'disabled');
  layer.enable(viewer);
  viewer.scene.preUpdate.raiseEvent(viewer.scene, TIME);
  const [primitive] = viewer.list;
  assert.equal(primitive.show, true);
  const translation = Cesium.Matrix4.getTranslation(
    primitive.modelMatrix,
    new Cesium.Cartesian3(),
  );
  assert.ok(Cesium.Cartesian3.equals(translation, MOON_M));
  const state = layer.getState();
  assert.equal(state.status, 'ok');
  assert.deepEqual(state.positionFixedM, { x: 3.5e8, y: 1.2e8, z: -4e7 });
  assert.equal(state.scaleMode, 'physical');
  assert.equal(state.measurable, true);
  assert.equal(state.texture, 'placeholder');
  assert.match(state.orientation, /aproximada/);
  assert.equal(layer.getStats().count, 1);
});

test('sin marco o sin efeméride no se dibuja la Luna física y la ausencia se publica', () => {
  const { viewer, layer } = setup({ status: 'unavailable' });
  layer.enable(viewer);
  viewer.scene.preUpdate.raiseEvent(viewer.scene, TIME);
  assert.equal(viewer.list[0].show, false);
  const state = layer.getState();
  assert.equal(state.status, 'unavailable');
  assert.equal(state.positionFixedM, null);
});

test('P5-07: didáctico ×10 escala solo el radio, muestra la banda y no es medible', () => {
  const { viewer, layer, document } = setup();
  layer.enable(viewer);
  layer.setScaleMode('didactic');
  viewer.scene.preUpdate.raiseEvent(viewer.scene, TIME);
  const [primitive] = viewer.list;
  const scale = Cesium.Matrix4.getScale(
    primitive.modelMatrix,
    new Cesium.Cartesian3(),
  );
  assert.ok(Math.abs(scale.x - 10) < 1e-9);
  assert.ok(
    Cesium.Cartesian3.equals(
      Cesium.Matrix4.getTranslation(
        primitive.modelMatrix,
        new Cesium.Cartesian3(),
      ),
      MOON_M,
    ),
    'la posición no cambia',
  );
  const band = document.nodes.find(
    (n) => n.dataset.eyeMoonScaleBand !== undefined,
  );
  assert.equal(band.hidden, false);
  assert.equal(band.textContent, DIDACTIC_BAND_TEXT);
  assert.equal(band.attributes['aria-live'], 'polite');
  const state = layer.getState();
  assert.equal(state.measurable, false);
  assert.equal(state.validatedAgainst, null);
  layer.setScaleMode('physical');
  assert.equal(band.hidden, true);
  assert.throws(() => layer.setScaleMode('x10'), TypeError);
});

test('disable/destroy: sin primitivas, listeners, holds ni banda', () => {
  const { viewer, layer, holds, document } = setup();
  layer.enable(viewer);
  layer.setScaleMode('didactic');
  layer.disable(viewer);
  assert.equal(viewer.list.length, 0);
  assert.equal(viewer.scene.preUpdate.numberOfListeners, 0);
  assert.equal(holds.size, 0);
  const band = document.nodes.find(
    (n) => n.dataset.eyeMoonScaleBand !== undefined,
  );
  assert.equal(band.hidden, true, 'la banda solo se ve con la Luna encendida');
  layer.destroy();
  assert.equal(document.nodes.length, 0);
});

test('debugAt(ISO) expone el estado celeste de una época para el arnés', () => {
  const { layer } = setup();
  const out = layer.debugAt('2026-09-25T18:45:00Z');
  assert.equal(out.status, 'ok');
  assert.deepEqual(out.moonIcrfKm, { x: 3.5e5, y: 1.2e5, z: -4e4 });
  assert.throws(() => layer.debugAt('ayer'), TypeError);
});

test('crédito «NASA/JPL Horizons, DE441» solo mientras la Luna está encendida', () => {
  const viewer = fakeViewer();
  const credits = [];
  const layer = createMoonLayer({
    render: { hold() {}, release() {}, request() {} },
    documentRef: null,
    createPrimitive: fakePrimitive,
    celestialOf: () => fakeCelestial(),
    sceneClockOf: () => ({
      getState: () => ({ mode: 'paused' }),
      subscribe: () => () => {},
    }),
    credits: {
      register: (v, credit) => credits.push(['+', v === viewer, credit.key]),
      unregister: (v, credit) => credits.push(['-', v === viewer, credit.key]),
    },
  });
  layer.init(viewer);
  layer.enable();
  layer.disable();
  assert.deepEqual(credits, [
    ['+', true, MOON_CREDIT.key],
    ['-', true, MOON_CREDIT.key],
  ]);
  assert.match(MOON_CREDIT.html, /NASA\/JPL Horizons, DE441/);
  assert.match(MOON_CREDIT.html, /placeholder/i);
});
