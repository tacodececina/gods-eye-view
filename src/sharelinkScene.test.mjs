/**
 * P5 T9 — el enlace compartido lleva el reloj de escena (modo y época) y la
 * escala de la Luna con tokens NUEVOS (`t`, `tr`, `lm`); la capa Luna ya viaja
 * en `l` (token de capa «l»). Una fecha inválida se rechaza; fuera del rango
 * DE441 se abre en PAUSA con la ausencia visible; sin `lm`, escala física.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SCENE_SHARE_KEYS,
  applySharedScene,
  bindSceneShare,
  decodeSceneParams,
  encodeSceneParams,
} from './sharelinkScene.js';

const live = {
  mode: 'live',
  multiplier: 1,
  currentIso: '2026-09-25T18:45:00.000Z',
};
const sim = {
  mode: 'simulated',
  multiplier: 600,
  currentIso: '2027-03-14T06:00:30.250Z',
};
const paused = {
  mode: 'paused',
  multiplier: 1,
  currentIso: '2030-06-21T12:00:00.000Z',
};
const encode = (clock, moonScale = 'physical') => {
  const params = new URLSearchParams();
  encodeSceneParams(params, { clock, moonScale });
  return params;
};

test('tokens nuevos: t, tr y lm', () => {
  assert.deepEqual([...SCENE_SHARE_KEYS], ['t', 'tr', 'lm']);
});

test('codifica vivo, simulado y pausa; la escala siempre explícita', () => {
  assert.equal(encode(live).toString(), 't=live&lm=f');
  assert.equal(
    encode(sim, 'didactic').toString(),
    't=2027-03-14T06%3A00%3A30Z&tr=600&lm=d',
  );
  assert.equal(
    encode(paused).toString(),
    't=2030-06-21T12%3A00%3A00Z&tr=0&lm=f',
  );
  const none = new URLSearchParams('t=live&tr=5&lm=d');
  encodeSceneParams(none, null);
  assert.equal(none.toString(), '', 'sin proveedor no queda nada viejo');
});

test('ida y vuelta: decode(encode(x)) conserva modo, época, ritmo y escala', () => {
  for (const [clock, scale] of [
    [live, 'physical'],
    [sim, 'didactic'],
    [paused, 'physical'],
  ]) {
    const decoded = decodeSceneParams(encode(clock, scale));
    assert.equal(decoded.moonScale, scale);
    assert.equal(decoded.time.mode, clock.mode);
    if (clock.mode !== 'live')
      assert.equal(decoded.time.iso, `${clock.currentIso.slice(0, 19)}Z`);
    if (clock.mode === 'simulated') assert.equal(decoded.time.multiplier, 600);
  }
});

test('sin t ni lm: enlace antiguo → sin cambio de reloj y escala física', () => {
  const decoded = decodeSceneParams(new URLSearchParams('lat=1&lon=2'));
  assert.deepEqual(decoded, {
    time: null,
    timeInvalid: false,
    moonScale: 'physical',
  });
});

test('fecha inválida o ritmo inválido: se rechaza (no se aplica) y se dice', () => {
  for (const bad of [
    't=ayer',
    't=2027-13-01T00:00:00Z',
    't=2027-03-14',
    't=2027-03-14T06:00:00Z&tr=7',
    't=2027-03-14T06:00:00Z&tr=-60',
    't=1850-01-01T00:00:00Z&tr=0',
  ]) {
    const decoded = decodeSceneParams(new URLSearchParams(bad));
    assert.equal(decoded.time, null, bad);
    assert.equal(decoded.timeInvalid, true, bad);
  }
  assert.equal(
    decodeSceneParams(new URLSearchParams('lm=x10')).moonScale,
    'physical',
  );
});

/** Reloj falso que registra las órdenes. */
function fakeClock() {
  const calls = [];
  return {
    calls,
    setNow: () => calls.push(['setNow']),
    setTime: (iso) => calls.push(['setTime', iso]),
    simulate: (m) => calls.push(['simulate', m]),
    pause: (why) => calls.push(['pause', why ?? null]),
  };
}

test('aplicar: vivo → AHORA; simulado → época + ritmo; pausa → época en pausa; escala', () => {
  const scales = [];
  const setMoonScale = (s) => scales.push(s);
  const a = fakeClock();
  applySharedScene(decodeSceneParams(encode(live)), {
    sceneClock: a,
    setMoonScale,
  });
  assert.deepEqual(a.calls, [['setNow']]);
  const b = fakeClock();
  const out = applySharedScene(decodeSceneParams(encode(sim, 'didactic')), {
    sceneClock: b,
    setMoonScale,
  });
  assert.deepEqual(b.calls, [
    ['setTime', '2027-03-14T06:00:30Z'],
    ['simulate', 600],
  ]);
  assert.equal(out.time, 'applied');
  const c = fakeClock();
  applySharedScene(decodeSceneParams(encode(paused)), {
    sceneClock: c,
    setMoonScale,
  });
  assert.deepEqual(c.calls, [
    ['setTime', '2030-06-21T12:00:00Z'],
    ['pause', null],
  ]);
  assert.deepEqual(scales, ['physical', 'didactic', 'physical']);
});

/** Segundos TDB desde J2000 de un ISO (sin la diferencia TDB−UTC: margen). */
const tdb = (iso) => (Date.parse(iso) - Date.UTC(2000, 0, 1, 12)) / 1000;
/** Cobertura de la efeméride CARGADA (cabecera del .bin vía moonSource). */
const coverage =
  (fallback, from = '2021-01-01', to = '2041-01-01') =>
  () => ({
    tableRange: {
      validFrom: tdb(`${from}T00:00:00Z`),
      validTo: tdb(`${to}T00:00:00Z`),
    },
    fallback,
  });
const apply = (query, ephemerisCoverage) => {
  const clock = fakeClock();
  const out = applySharedScene(decodeSceneParams(new URLSearchParams(query)), {
    sceneClock: clock,
    setMoonScale() {},
    ephemerisCoverage,
  });
  return { calls: clock.calls, out };
};

test('fuera de rango SIN respaldo: el enlace abre en PAUSA con la ausencia visible', () => {
  const { calls, out } = apply(
    't=2045-01-01T00:00:00Z&tr=3600&lm=f',
    coverage('failed'),
  );
  assert.deepEqual(calls, [
    ['setTime', '2045-01-01T00:00:00Z'],
    ['pause', 'fuera de efemérides'],
  ]);
  assert.equal(out.time, 'out-of-range');
});

test('fuera de rango CON respaldo: no pausa; abre en simulación rotulada «astronomy-engine ≤20 km»', () => {
  for (const fallback of ['idle', 'loading', 'ready']) {
    const { calls, out } = apply(
      't=2045-01-01T00:00:00Z&tr=3600&lm=f',
      coverage(fallback),
    );
    assert.deepEqual(
      calls,
      [
        ['setTime', '2045-01-01T00:00:00Z'],
        ['simulate', 3600],
      ],
      fallback,
    );
    assert.equal(out.time, 'fallback');
    assert.equal(out.label, 'astronomy-engine ≤20 km');
  }
});

test('el rango sale de la efeméride cargada, no de 2021–2040 fijado en código', () => {
  // Una tabla 2030–2031: 2027 queda FUERA (con 2021–2040 fijos, dentro).
  const narrow = apply(
    't=2027-03-14T06:00:00Z&tr=600',
    coverage('failed', '2030-01-01', '2031-01-01'),
  );
  assert.equal(narrow.out.time, 'out-of-range');
  // Una tabla 2041–2060: 2045 queda DENTRO (con 2021–2040 fijos, fuera).
  const later = apply(
    't=2045-01-01T00:00:00Z&tr=600',
    coverage('failed', '2041-01-01', '2060-01-01'),
  );
  assert.equal(later.out.time, 'applied');
  assert.deepEqual(later.calls.at(-1), ['simulate', 600]);
});

test('tabla aún sin cargar: se aplica lo pedido; la capa Luna pausa solo si no hay respaldo', () => {
  for (const ephemerisCoverage of [
    undefined,
    () => null,
    () => ({ tableRange: null, fallback: 'idle' }),
  ]) {
    const { calls, out } = apply(
      't=2045-01-01T00:00:00Z&tr=60',
      ephemerisCoverage,
    );
    assert.deepEqual(calls, [
      ['setTime', '2045-01-01T00:00:00Z'],
      ['simulate', 60],
    ]);
    assert.equal(out.time, 'applied');
  }
});

test('fecha inválida: el reloj no se toca y se informa', () => {
  const clock = fakeClock();
  const out = applySharedScene(
    decodeSceneParams(new URLSearchParams('t=ayer')),
    {
      sceneClock: clock,
      setMoonScale() {},
    },
  );
  assert.deepEqual(clock.calls, []);
  assert.equal(out.time, 'invalid');
});

test('bindSceneShare: proveedor desde reloj y Luna; aplicador; aviso de cambios de modo', () => {
  const listeners = new Set();
  const clock = {
    ...fakeClock(),
    getState: () => sim,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  let scale = 'physical';
  const moon = {
    getState: () => ({ scaleMode: scale }),
    setScaleMode: (s) => (scale = s),
  };
  const manager = {
    setSceneStateProvider(fn) {
      this.provider = fn;
    },
    setSceneApplier(fn) {
      this.applier = fn;
    },
    changes: 0,
    onSceneStateChange() {
      this.changes += 1;
    },
  };
  const unbind = bindSceneShare(manager, {
    sceneClock: clock,
    moonModule: () => moon,
  });
  assert.deepEqual(manager.provider(), { clock: sim, moonScale: 'physical' });
  manager.applier(decodeSceneParams(new URLSearchParams('t=live&lm=d')));
  assert.equal(scale, 'didactic');
  assert.deepEqual(clock.calls, [['setNow']]);
  for (const fn of listeners) fn(live);
  assert.equal(manager.changes, 1);
  unbind();
  assert.equal(listeners.size, 0);
  assert.equal(manager.provider, null);
});
