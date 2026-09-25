import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  ISS,
  VIEW_HEIGHT_PX,
  FOVY,
  modelsHarness,
} from '../../testSupport/satelliteModelHarness.mjs';
import { SAT_HULL_HIT_MIN_COARSE_PX, SAT_HULL_HIT_MIN_PX } from './policy.js';

const CENTER_PX = Object.freeze({ x: 500, y: 400 });
const TAN = Math.tan(FOVY / 2);

/**
 * ISS tracked `distanceM` in front of the camera; the injected projector puts
 * the model centre at CENTER_PX (production uses SceneTransforms).
 */
async function trackedIss({ distanceM, coarse = false, sphere = null }) {
  const projected = [];
  const h = modelsHarness({
    rows: [{ noradId: ISS, group: 'stations', distanceM }],
    extra: {
      toWindow: (scene, position, result) => {
        projected.push(Cesium.Cartesian3.clone(position));
        return Cesium.Cartesian2.fromElements(CENTER_PX.x, CENTER_PX.y, result);
      },
      isCoarsePointer: () => coarse,
    },
  });
  h.tick({ trackedNorad: ISS });
  const call = h.loader.calls[0];
  if (sphere) call.model.boundingSphere = sphere;
  await call.resolve();
  const position = h.state._points.get(ISS).position;
  h.models.updatePoses({
    trackedNorad: ISS,
    trackedPosition: position,
    trackedDateMs: Date.now(),
  });
  return { ...h, projected, position };
}

const at = (dx, dy = 0) =>
  new Cesium.Cartesian2(CENTER_PX.x + dx, CENTER_PX.y + dy);

test('screenHit covers the projected hull of the tracked model', async () => {
  const h = await trackedIss({ distanceM: 1000 });
  // radiusM 72.068 at 1 km projects to ≈ 124.8 px across: 62.4 px radius.
  const radiusPx = (72.068 * VIEW_HEIGHT_PX) / (1000 * TAN) / 2;
  assert.equal(h.models.screenHit(at(52), ISS), true, '52 px off the dot');
  assert.equal(h.models.screenHit(at(0, radiusPx - 1), ISS), true);
  assert.equal(h.models.screenHit(at(0, radiusPx + 2), ISS), false);
  assert.ok(
    Cesium.Cartesian3.equals(h.projected.at(-1), h.position),
    'projects the model centre (pose translation)',
  );
});

test('screenHit prefers the real bounding sphere of the Model', async () => {
  const center = new Cesium.Cartesian3(7_001_000, 0, 0);
  const h = await trackedIss({
    distanceM: 1000,
    sphere: new Cesium.BoundingSphere(center, 10),
  });
  // 10 m at 1 km ≈ 17.3 px across: the 12 px floor applies, 52 px is out.
  assert.equal(h.models.screenHit(at(52), ISS), false);
  assert.equal(h.models.screenHit(at(11), ISS), true);
  assert.ok(Cesium.Cartesian3.equals(h.projected.at(-1), center));
});

test('a tiny model still gets 12 px (24 px on a coarse pointer)', async () => {
  assert.equal(SAT_HULL_HIT_MIN_PX, 12);
  assert.equal(SAT_HULL_HIT_MIN_COARSE_PX, 24);
  // 12.5 km: ≈ 10 px across, above the 6 px admission band, below the floor.
  const fine = await trackedIss({ distanceM: 12_500 });
  assert.equal(fine.models.screenHit(at(11), ISS), true);
  assert.equal(fine.models.screenHit(at(13), ISS), false);
  const coarse = await trackedIss({ distanceM: 12_500, coarse: true });
  assert.equal(coarse.models.screenHit(at(23), ISS), true);
  assert.equal(coarse.models.screenHit(at(25), ISS), false);
});

test('no ready model, no hull: nothing to hit', () => {
  const h = modelsHarness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 1000 }],
    extra: { toWindow: () => new Cesium.Cartesian2(500, 400) },
  });
  h.tick({ trackedNorad: ISS });
  assert.equal(h.models.screenHit(at(0), ISS), false, 'still loading');
  assert.equal(h.models.screenHit(at(0), 99999), false, 'unknown id');
  assert.equal(h.models.screenHit(undefined, ISS), false);
});

test('handoff input reports the ready model and its projected size', async () => {
  const h = await trackedIss({ distanceM: 4000 });
  const input = h.models.handoffInput(ISS);
  assert.equal(input.modelReady, true);
  const expected = (2 * 72.068 * VIEW_HEIGHT_PX) / (2 * 4000 * TAN);
  assert.ok(Math.abs(input.modelPx - expected) < 1e-6, `${input.modelPx}`);
  assert.ok(input.anchorPx >= input.modelPx, 'clearance holds the hull');
  assert.deepEqual(h.models.handoffInput(99999), {
    modelReady: false,
    modelPx: 0,
    anchorPx: 0,
  });
});

test('statusOf: inactive, loading, failed, then ready', async () => {
  const h = modelsHarness({
    rows: [{ noradId: ISS, group: 'stations', distanceM: 1000 }],
  });
  assert.equal(h.models.statusOf(ISS), 'inactivo');
  h.tick({ trackedNorad: ISS });
  assert.equal(h.models.statusOf(ISS), 'cargando');
  await h.loader.calls[0].reject();
  assert.equal(h.models.statusOf(ISS), 'fallido');
  h.clock.t += 5000;
  h.tick({ trackedNorad: ISS });
  await h.loader.calls[1].resolve();
  assert.equal(h.models.statusOf(ISS), 'listo', 'a later success clears it');
});

// Production wiring of the pointer floor: without an injected
// `isCoarsePointer`, models.js asks matchMedia('(pointer: coarse)').
async function issWithMedia(coarse) {
  const queries = [];
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = (query) => {
    queries.push(query);
    return { matches: coarse && query === '(pointer: coarse)' };
  };
  try {
    const h = modelsHarness({
      rows: [{ noradId: ISS, group: 'stations', distanceM: 12_500 }],
      extra: {
        toWindow: (scene, position, result) =>
          Cesium.Cartesian2.fromElements(CENTER_PX.x, CENTER_PX.y, result),
      },
    });
    h.tick({ trackedNorad: ISS });
    await h.loader.calls[0].resolve();
    h.models.updatePoses({
      trackedNorad: ISS,
      trackedPosition: h.state._points.get(ISS).position,
      trackedDateMs: Date.now(),
    });
    const hits = [11, 13, 23, 25].map((dx) => h.models.screenHit(at(dx), ISS));
    return { hits, queries };
  } finally {
    if (previous === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previous;
  }
}

test('default wiring: a coarse pointer (matchMedia) gets 24 px, a fine one 12 px', async () => {
  const fine = await issWithMedia(false);
  assert.deepEqual(fine.hits, [true, false, false, false], 'fine: 12 px');
  const coarse = await issWithMedia(true);
  assert.deepEqual(coarse.hits, [true, true, true, false], 'coarse: 24 px');
  assert.ok(
    coarse.queries.length > 0 &&
      coarse.queries.every((query) => query === '(pointer: coarse)'),
    `asks for the coarse pointer (${coarse.queries})`,
  );
});

test('handoff input: the card clearance encloses the hull around the DRAWN origin', async () => {
  // The card anchors to the model translation; Cesium's sphere centre sits
  // 20 m off it. The clearance sphere around the origin is r + 20 m.
  const origin = new Cesium.Cartesian3(7_004_000, 0, 0);
  const center = new Cesium.Cartesian3(7_004_000, 20, 0);
  const h = await trackedIss({
    distanceM: 4000,
    sphere: new Cesium.BoundingSphere(center, 72),
  });
  assert.ok(Cesium.Cartesian3.equals(h.position, origin), 'precondition');
  const input = h.models.handoffInput(ISS);
  const px = (radiusM, distanceM) =>
    (2 * radiusM * VIEW_HEIGHT_PX) / (2 * distanceM * TAN);
  const distance = Cesium.Cartesian3.distance(h.camera, center);
  assert.ok(Math.abs(input.modelPx - px(72, distance)) < 1e-6, 'hull size');
  assert.ok(
    Math.abs(input.anchorPx - px(92, distance)) < 1e-6,
    `clearance ${input.anchorPx} encloses the offset hull`,
  );
});
