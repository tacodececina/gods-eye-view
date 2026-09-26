/**
 * El pie reserva el ancho REAL de la telemetría (reparación T5).
 *
 * En Simulación ×3600 la tira TIEMPO crecía hasta 1043 px porque solo
 * reservaba 420 px para una telemetría que mide 607: 182 px de solape.
 * `mountFootMetrics` publica el ancho medido en `--eye-telemetry-width` y el
 * CSS de la tira lo descuenta.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountFootMetrics, TELEMETRY_WIDTH_VAR } from './footMetrics.js';

function fakeDom(width) {
  const props = new Map();
  const telemetry = {
    rect: { width },
    getBoundingClientRect() {
      return this.rect;
    },
  };
  const doc = {
    body: {
      style: {
        setProperty: (name, value) => props.set(name, value),
        removeProperty: (name) => props.delete(name),
      },
    },
    querySelector: (selector) =>
      selector === '.eye-telemetry' ? telemetry : null,
  };
  const observers = [];
  class FakeObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = [];
      observers.push(this);
    }
    observe(target) {
      this.targets.push(target);
    }
    disconnect() {
      this.targets = [];
    }
  }
  return { doc, props, telemetry, observers, FakeObserver };
}

test('publica el ancho medido de la telemetría al montar y al cambiar', () => {
  const dom = fakeDom(606.4);
  const metrics = mountFootMetrics({
    doc: dom.doc,
    ResizeObserverImpl: dom.FakeObserver,
  });
  assert.equal(TELEMETRY_WIDTH_VAR, '--eye-telemetry-width');
  assert.equal(dom.props.get(TELEMETRY_WIDTH_VAR), '607px');
  assert.deepEqual(dom.observers[0].targets, [dom.telemetry]);
  dom.telemetry.rect = { width: 480 };
  dom.observers[0].callback();
  assert.equal(dom.props.get(TELEMETRY_WIDTH_VAR), '480px');
  metrics.destroy();
  assert.equal(dom.props.has(TELEMETRY_WIDTH_VAR), false);
  assert.deepEqual(dom.observers[0].targets, []);
});

test('sin telemetría o sin ResizeObserver no publica nada ni lanza', () => {
  const dom = fakeDom(500);
  dom.doc.querySelector = () => null;
  mountFootMetrics({
    doc: dom.doc,
    ResizeObserverImpl: dom.FakeObserver,
  }).destroy();
  assert.equal(dom.props.size, 0);
  const other = fakeDom(500);
  const metrics = mountFootMetrics({
    doc: other.doc,
    ResizeObserverImpl: undefined,
  });
  assert.equal(other.props.get(TELEMETRY_WIDTH_VAR), '500px');
  metrics.destroy();
});
