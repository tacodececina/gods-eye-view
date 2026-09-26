/**
 * Restaurar una operación o un enlace (hallazgo de la fase visual T3/T5,
 * arnés mobile «reload restores … camera»): encender o apagar una capa pasa
 * por el director (`stopScene`), que cancela cualquier vuelo de cámara en
 * curso. La cámara restaurada debe pedirse DESPUÉS de aplicar las capas, o
 * el vuelo se cancela a los pocos milisegundos y la vista no se restaura.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewState } from './shellViewState.js';

function stubShell(order) {
  const layers = [
    { id: 'earthquakes', enabled: false },
    { id: 'satellites', enabled: true },
  ];
  return {
    state: { generation: 0, filters: {}, selection: null, rows: [] },
    signal: new AbortController().signal,
    styleManager: { getCameraState: () => ({}) },
    dataManager: {
      layers: new Map(layers.map((l) => [l.id, {}])),
      getAll: () => layers,
      setEnabled: async (id, on) => {
        order.push(`layer:${id}:${on}`);
        return true;
      },
      refreshLayer: async () => order.push('refresh'),
    },
    camera: (pose) => order.push(`camera:${pose.alt}`),
    syncFilters: () => {},
    paintFeed: () => order.push('paint'),
    layer: () => null,
  };
}

test('la cámara restaurada se pide después de aplicar las capas', async () => {
  const order = [];
  const shell = stubShell(order);
  const { restoreView } = createViewState(shell);
  await restoreView({
    camera: {
      lat: 20,
      lon: 170,
      alt: 21_000_000,
      heading: 0,
      pitch: -90,
      roll: 0,
    },
    layers: ['satellites'],
    filters: { magnitude: 2.5, hours: 24, sector: 'all' },
    selection: null,
  });
  const camera = order.findIndex((entry) => entry.startsWith('camera:'));
  const lastLayer = order.findLastIndex((entry) => entry.startsWith('layer:'));
  assert.ok(camera > lastLayer, order.join(' → '));
});
