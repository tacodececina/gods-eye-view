import assert from 'node:assert/strict';
import test from 'node:test';
import { createMoonPosition } from './position.js';

const VALID_FROM = 662_731_200;
const VALID_TO = 1_293_883_200;

/** Tabla falsa con el mismo contrato que loadMoonEphemeris. */
const fakeTable = () => ({
  source: 'DE441',
  validFrom: VALID_FROM,
  validTo: VALID_TO,
  moonPositionIcrf(t, result) {
    if (t < VALID_FROM || t > VALID_TO)
      return {
        status: 'out-of-range',
        validFrom: VALID_FROM,
        validTo: VALID_TO,
        source: 'DE441',
      };
    result.x = 1;
    return {
      status: 'ok',
      position: result,
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      source: 'DE441',
    };
  },
});
const fakeFallback = () => ({
  source: 'astronomy-engine',
  toleranceKm: 14,
  moonPositionIcrf(t, result) {
    result.x = 2;
    return {
      status: 'ok',
      position: result,
      source: 'astronomy-engine',
      toleranceKm: 14,
    };
  },
});

test('dentro del rango manda la tabla DE441, incluida la frontera validTo exacta', () => {
  const moonPosition = createMoonPosition({
    table: fakeTable(),
    fallback: fakeFallback(),
  });
  for (const t of [VALID_FROM, (VALID_FROM + VALID_TO) / 2, VALID_TO]) {
    const out = moonPosition(t, { x: 0, y: 0, z: 0 });
    assert.equal(out.source, 'DE441');
    assert.equal(out.position.x, 1);
  }
});

test('conmutación en la frontera: 1 s fuera → respaldo rotulado, con el rango de la tabla', () => {
  const moonPosition = createMoonPosition({
    table: fakeTable(),
    fallback: fakeFallback(),
  });
  for (const t of [VALID_FROM - 1, VALID_TO + 1]) {
    const out = moonPosition(t, { x: 0, y: 0, z: 0 });
    assert.equal(out.status, 'ok');
    assert.equal(out.source, 'astronomy-engine');
    assert.equal(out.toleranceKm, 14);
    assert.equal(out.position.x, 2);
    assert.deepEqual(out.tableRange, {
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      source: 'DE441',
    });
  }
});

test('sin respaldo, fuera de rango se devuelve out-of-range (opción a)', () => {
  const moonPosition = createMoonPosition({
    table: fakeTable(),
    fallback: null,
  });
  const out = moonPosition(VALID_TO + 1, { x: 0, y: 0, z: 0 });
  assert.equal(out.status, 'out-of-range');
  assert.equal(out.position, undefined);
});

test('sin tabla (no cargó) usa el respaldo; sin ninguno, unavailable', () => {
  assert.equal(
    createMoonPosition({ table: null, fallback: fakeFallback() })(VALID_FROM, {
      x: 0,
      y: 0,
      z: 0,
    }).source,
    'astronomy-engine',
  );
  assert.deepEqual(
    createMoonPosition({ table: null, fallback: null })(VALID_FROM, {
      x: 0,
      y: 0,
      z: 0,
    }),
    {
      status: 'unavailable',
    },
  );
});
