import assert from 'node:assert/strict';
import test from 'node:test';
import satellitesLayer, {
  _catalogGroupForTest,
  _clearDenseCatalogStateForTest,
  _setDenseCatalogStateForTest,
  findSatelliteOrbitTrackInTle,
} from './satellites.js';

// P4-19 regression: `Number(satrec.satnum)` turned every Alpha-5 catalogue
// number into NaN, and Map/Set treat all NaN keys as one, so the second
// Alpha-5 object vanished silently and a NaN id leaked into the catalog.
const ISS_LINES = [
  '1 25544U 98067A   26267.14191496  .00009634  00000+0  18116-3 0  9999',
  '2 25544  51.6318 170.3464 0004691 174.6338 185.4701 15.49258637587098',
];
const HST_LINES = [
  '1 20580U 90037B   26266.94713825  .00005513  00000+0  16734-3 0  9992',
  '2 20580  28.4727 125.0661 0001663 151.6515 208.4172 15.31734421803723',
];

/** ISS element lines re-labelled with another catalogue number. */
const tleAs = (satnum, name) =>
  [
    name,
    ISS_LINES[0].replace('25544U', `${satnum}U`),
    ISS_LINES[1].replace('2 25544', `2 ${satnum}`),
  ].join('\n');

const CORE_VISUAL = [
  ['ISS (ZARYA)', ...ISS_LINES].join('\n'),
  tleAs('T0001', 'ALPHA ONE'),
  tleAs('T0002', 'ALPHA TWO'),
  ['HST', ...HST_LINES].join('\n'),
].join('\n');

const DENSE = [
  tleAs('T0003', 'ALPHA THREE'),
  tleAs('T0004', 'ALPHA FOUR'),
  tleAs('44444', 'STARLINK-TEST'),
].join('\n');

const pathOf = (url) => new URL(String(url), 'http://fixture.invalid').pathname;

function quietConsole(t) {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
}

async function settleChip(maxTicks = 50) {
  for (let i = 0; i < maxTicks; i++) {
    const chip = satellitesLayer.getRowControls().chips[0];
    if (chip && !chip.busy) return chip;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  return satellitesLayer.getRowControls().chips[0];
}

test('core ingestion keeps every numbered object and never stores a NaN id', async (t) => {
  quietConsole(t);
  t.mock.method(globalThis, 'fetch', async (url) => ({
    ok: true,
    status: 200,
    text: async () =>
      pathOf(url) === '/api/celestrak/visual' ? CORE_VISUAL : '',
  }));
  try {
    _setDenseCatalogStateForTest({});
    const viewer = { scene: { primitives: { add: (p) => p, remove() {} } } };
    await satellitesLayer.update(viewer);
    assert.equal(_catalogGroupForTest(NaN), undefined, 'no NaN catalog key');
    assert.equal(_catalogGroupForTest(25544), 'visual');
    assert.equal(_catalogGroupForTest(20580), 'visual');
    const ids = satellitesLayer
      .getDetectableObjects()
      .map((object) => object.sourceId);
    assert.deepEqual([...ids].sort(), [20580, 25544]);
  } finally {
    _clearDenseCatalogStateForTest();
  }
});

test('dense loading skips Alpha-5 records without collapsing them into NaN', async (t) => {
  quietConsole(t);
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    status: 200,
    text: async () => DENSE,
  }));
  try {
    _setDenseCatalogStateForTest({});
    satellitesLayer.setParams({ catalog: 'dense' });
    const chip = await settleChip();
    assert.equal(chip.state, 'active');
    assert.equal(_catalogGroupForTest(NaN), undefined, 'no NaN catalog key');
    assert.equal(_catalogGroupForTest(44444), 'dense');
  } finally {
    _clearDenseCatalogStateForTest();
  }
});

test('an Alpha-5 mission track reports an absent id, not NaN', () => {
  const track = findSatelliteOrbitTrackInTle(
    tleAs('T0005', 'ALPHA FIVE'),
    'ALPHA FIVE',
  );
  assert.ok(track, 'the orbit itself still propagates');
  assert.equal(track.noradId, null);
  assert.ok(Number.isFinite(track.current.altitude));
});
