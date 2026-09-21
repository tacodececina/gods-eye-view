import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOperationStore,
  publicView,
  validateOperation,
} from './operations.js';

const camera = {
  lat: 23,
  lon: -102,
  alt: 12000000,
  heading: 0,
  pitch: -90,
  roll: 0,
};
const draft = () => ({
  name: 'Pacífico',
  camera,
  layers: ['earthquakes'],
  filters: { magnitude: 2.5, hours: 24, sector: 'all' },
  selection: 'us-fixture-a',
  notes: [
    {
      text: 'Nota privada <script>alert(1)</script>',
      createdAt: 1700000000000,
    },
  ],
});

test('corrupt note objects and out-of-range dates report validation errors before rendering', () => {
  const input = { ...draft(), id: 'fixture', createdAt: 1, updatedAt: 2 };
  for (const note of [null, { text: 'x', createdAt: 1e100 }])
    assert.throws(
      () => validateOperation({ ...input, notes: [note] }),
      /Fecha inválida/,
    );
  assert.throws(
    () => validateOperation({ ...input, createdAt: -1 }),
    /Fecha inválida/,
  );
});
const memory = () => {
  let value = null;
  return {
    getItem: () => value,
    setItem: (_k, v) => {
      value = v;
    },
  };
};
test('explicit local recovery only removes the operation key and reports denial', () => {
  let key;
  const store = createOperationStore({
    getItem: () => '{bad',
    removeItem: (k) => {
      key = k;
    },
  });
  store.reset();
  assert.equal(key, 'eyeinsky.operations.v1');
  assert.throws(
    () =>
      createOperationStore({
        removeItem() {
          throw new Error('denied');
        },
      }).reset(),
    /deneg/i,
  );
});
test('operation survives a fresh store, rename preserves original note time, delete is explicit', () => {
  const storage = memory();
  const a = createOperationStore(storage);
  const saved = a.save(draft());
  const b = createOperationStore(storage);
  assert.deepEqual(b.list(), [saved]);
  b.rename(saved.id, 'Revisión');
  assert.equal(b.list()[0].notes[0].createdAt, 1700000000000);
  assert.equal(b.list()[0].name, 'Revisión');
  b.remove(saved.id);
  assert.deepEqual(b.list(), []);
});
test('public view is an allowlist, never includes names, notes, tokens or provider URLs', () => {
  const view = publicView({
    ...draft(),
    token: 'secret',
    url: 'https://evil.invalid',
  });
  assert.deepEqual(Object.keys(view).sort(), [
    'camera',
    'filters',
    'layers',
    'selection',
    'version',
  ]);
  assert.ok(!JSON.stringify(view).includes('privada'));
});
test('corrupt or incompatible storage is reported without overwriting the bytes', () => {
  for (const raw of [
    'null',
    '{bad',
    JSON.stringify({ version: 9, records: [] }),
    JSON.stringify({ version: 1, records: [{ bad: true }] }),
  ]) {
    let writes = 0;
    const store = createOperationStore({
      getItem: () => raw,
      setItem: () => writes++,
    });
    assert.throws(() => store.list(), /dañado|versión|inválid/i);
    assert.throws(() => store.save(draft()));
    assert.equal(writes, 0);
  }
});
test('denied storage and quota failures are actionable and do not claim saved', () => {
  assert.throws(
    () =>
      createOperationStore({
        getItem() {
          throw new Error('denied');
        },
      }).list(),
    /almacenamiento/i,
  );
  assert.throws(
    () =>
      createOperationStore({
        getItem: () => null,
        setItem() {
          throw new Error('quota');
        },
      }).save(draft()),
    /espacio|almacenamiento/i,
  );
});
test('bounded validation strips unknown properties and rejects invalid camera, oversized data', () => {
  const input = {
    ...draft(),
    id: 'fixture',
    createdAt: 1,
    updatedAt: 2,
    token: 'secret',
  };
  assert.ok(!('token' in validateOperation(input)));
  assert.throws(() =>
    validateOperation({ ...input, camera: { ...camera, lon: 200 } }),
  );
  assert.throws(() => validateOperation({ ...input, name: 'x'.repeat(81) }));
  assert.throws(() =>
    validateOperation({
      ...input,
      notes: [{ text: 'x'.repeat(2001), createdAt: 1 }],
    }),
  );
  assert.throws(() =>
    publicView({
      ...input,
      filters: { ...input.filters, sector: 'https://evil.invalid' },
    }),
  );
});
