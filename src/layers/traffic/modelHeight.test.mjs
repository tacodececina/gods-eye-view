import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { createModel } from './model.js';

test('traffic rejects implausible scene sample heights before materializing road waypoints', () => {
  const state = {
    _viewer: {
      scene: {
        sampleHeightSupported: true,
        sampleHeight: () => -6_345_000,
      },
    },
  };
  const model = createModel({ state, services: {}, parts: {}, source: {} });
  const [road] = model.parseRoads({
    roads: [
      {
        coordinates: [
          [-99.1332, 19.4326],
          [-99.1328, 19.433],
        ],
        type: 'primary',
        oneway: 0,
      },
    ],
  });

  const waypoint = Cesium.Cartographic.fromCartesian(road.waypoints[0]);
  assert.ok(
    Math.abs(Cesium.Math.toDegrees(waypoint.latitude) - 19.4326) < 1e-6,
  );
  assert.ok(
    Math.abs(Cesium.Math.toDegrees(waypoint.longitude) + 99.1332) < 1e-6,
  );
  assert.ok(waypoint.height > -1000 && waypoint.height < 10_000);
});
