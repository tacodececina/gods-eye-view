/**
 * Tira TIEMPO del Mission Dock (P5 T8): lógica pura en
 * `eyeinskyMissionDockModel.js`. Fija los tres estados del reloj único, los
 * botones con su motivo, el campo de fecha UTC validado y las notas honestas
 * (capas en vivo suspendidas, SGP4 en hora real).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';
import { createSceneClock } from '../time/sceneClock.js';

import {
  TIME_ADVANCE_STEPS,
  isSceneOffLive,
  nextAdvanceMultiplier,
  parseUtcDateField,
  resolveTimeStrip,
  utcDateFieldValue,
} from './eyeinskyMissionDockModel.js';

const clock = (patch = {}) => ({
  mode: 'live',
  multiplier: 1,
  currentIso: '2026-09-25T14:32:05.250Z',
  isLive: true,
  driftMs: 0,
  reason: null,
  ...patch,
});

test('D5 · vivo: «● Reloj en vivo hh:mm:ss UTC», tono vivo y AHORA deshabilitado con motivo', () => {
  const strip = resolveTimeStrip(clock());
  assert.equal(strip.text, '● Reloj en vivo 14:32:05 UTC');
  assert.equal(strip.label, 'Reloj en vivo');
  assert.equal(strip.tone, 'live');
  assert.equal(strip.announcement, 'Reloj en vivo');
  assert.equal(strip.now.enabled, false);
  assert.equal(strip.now.hint, 'Ya estás en la hora real');
  assert.equal(strip.pause.label, 'PAUSA');
  assert.equal(
    'pressed' in strip.pause,
    false,
    'PAUSA/REANUDAR cambia de rótulo: no es un conmutador aria-pressed',
  );
  // AVANCE muestra el ritmo ACTUAL (vivo = ×1) y aplica el siguiente.
  assert.equal(strip.advance.label, 'AVANCE ×1');
  assert.equal(strip.advance.short, '×1', 'rótulo corto en cabecera compacta');
  assert.equal(strip.advance.current, 1);
  assert.equal(strip.pause.short, 'PAUSA');
  assert.equal(strip.advance.multiplier, 60);
  assert.equal(
    strip.advance.ariaLabel,
    'AVANCE, ritmo actual ×1 (hora real). Pulsa para simular a ×60',
  );
  assert.deepEqual(strip.notes, []);
  assert.ok(Object.isFrozen(strip));
});

test('D5 · simulación: «◆ Simulación ×N <fecha> UTC» en ámbar; AVANCE recorre 1→60→600→3600', () => {
  const strip = resolveTimeStrip(
    clock({
      mode: 'simulated',
      multiplier: 3600,
      isLive: false,
      currentIso: '2027-03-14T06:00:59.900Z',
      driftMs: 1e10,
    }),
  );
  assert.equal(strip.text, '◆ Simulación ×3600 2027-03-14 06:00 UTC');
  assert.equal(strip.label, 'Simulación ×3600');
  assert.equal(strip.tone, 'sim');
  assert.equal(strip.announcement, 'Simulación ×3600');
  assert.equal(strip.now.enabled, true);
  assert.deepEqual(TIME_ADVANCE_STEPS, [1, 60, 600, 3600]);
  assert.equal(
    strip.advance.label,
    'AVANCE ×3600',
    'el ritmo actual, no el siguiente',
  );
  assert.equal(strip.advance.short, '×3600');
  assert.equal(strip.advance.current, 3600);
  assert.equal(strip.advance.multiplier, 1, 'tras ×3600 vuelve a ×1');
  assert.equal(
    strip.advance.ariaLabel,
    'AVANCE, ritmo actual ×3600. Pulsa para simular a ×1',
  );
  const cycle = [1, 60, 600, 3600].map((m) =>
    nextAdvanceMultiplier(clock({ mode: 'simulated', multiplier: m })),
  );
  assert.deepEqual(cycle, [60, 600, 3600, 1]);
  assert.equal(nextAdvanceMultiplier(clock({ mode: 'paused' })), 60);
});

test('D5 · pausa: «❚❚ En pausa · <motivo>» y, sin motivo, la época; el botón pasa a REANUDAR', () => {
  const reasoned = resolveTimeStrip(
    clock({ mode: 'paused', isLive: false, reason: 'fuera de efemérides' }),
  );
  assert.equal(reasoned.text, '❚❚ En pausa · fuera de efemérides');
  assert.equal(reasoned.label, 'En pausa');
  assert.equal(reasoned.announcement, 'En pausa: fuera de efemérides');
  assert.equal(reasoned.tone, 'paused');
  assert.equal(reasoned.pause.label, 'REANUDAR');
  assert.equal('pressed' in reasoned.pause, false);
  assert.equal(reasoned.advance.label, 'AVANCE ×0', 'en pausa el ritmo es 0');
  assert.equal(reasoned.advance.multiplier, 60);
  const plain = resolveTimeStrip(
    clock({
      mode: 'paused',
      isLive: false,
      currentIso: '2027-03-14T06:00:00.000Z',
    }),
  );
  assert.equal(plain.text, '❚❚ En pausa · 2027-03-14 06:00:00 UTC');
  assert.equal(plain.announcement, 'En pausa');
});

test('fuera de «vivo»: simulado siempre; pausa solo si se aleja > 60 s de la pared', () => {
  assert.equal(isSceneOffLive(clock()), false);
  assert.equal(isSceneOffLive(clock({ mode: 'simulated', driftMs: 0 })), true);
  assert.equal(
    isSceneOffLive(clock({ mode: 'paused', driftMs: -30_000 })),
    false,
  );
  assert.equal(
    isSceneOffLive(clock({ mode: 'paused', driftMs: -61_000 })),
    true,
  );
  assert.equal(isSceneOffLive(null), false);
});

test('notas honestas: capas en vivo suspendidas y satélites SGP4 en hora real', () => {
  const sim = clock({ mode: 'simulated', multiplier: 600, isLive: false });
  const strip = resolveTimeStrip(sim, {
    suspendedCount: 3,
    satellitesEnabled: true,
  });
  assert.deepEqual(strip.notes, [
    'Sin histórico: solo hora real · 3 capas en vivo suspendidas',
    'Satélites: puntos SGP4 en hora real, no simulados',
  ]);
  const live = resolveTimeStrip(clock(), {
    suspendedCount: 0,
    satellitesEnabled: true,
  });
  assert.deepEqual(live.notes, []);
});

test('campo de fecha UTC: valida formato y rango; nunca interpreta hora local', () => {
  assert.deepEqual(parseUtcDateField('2027-03-14T06:00'), {
    ok: true,
    iso: '2027-03-14T06:00:00Z',
  });
  assert.deepEqual(parseUtcDateField('2027-03-14T06:00:30'), {
    ok: true,
    iso: '2027-03-14T06:00:30Z',
  });
  for (const bad of ['', 'ayer', '2027-02-30T00:00', '2027-13-01T00:00', null])
    assert.deepEqual(
      parseUtcDateField(bad),
      { ok: false, error: 'Fecha inválida: usa AAAA-MM-DD hh:mm (UTC)' },
      String(bad),
    );
  assert.deepEqual(parseUtcDateField('1850-01-01T00:00'), {
    ok: false,
    error: 'Fecha fuera de 1900–2100 UTC',
  });
  assert.equal(
    utcDateFieldValue('2027-03-14T06:00:59.900Z'),
    '2027-03-14T06:00:59',
  );
  assert.equal(utcDateFieldValue(null), '');
});

test('P5-17 §6: chip móvil «SIM 07-OCT 03:12» con el modo, la fecha corta y el ritmo', () => {
  const sim = resolveTimeStrip(
    clock({
      mode: 'simulated',
      multiplier: 3600,
      currentIso: '2026-10-07T03:12:59.000Z',
      driftMs: 1e9,
    }),
  );
  assert.equal(sim.chip.text, '◆ SIM 07-OCT 03:12 ×3600');
  assert.equal(sim.chip.tone, 'sim');
  const live = resolveTimeStrip(clock());
  assert.equal(live.chip.text, '● VIVO 14:32 UTC');
  const paused = resolveTimeStrip(
    clock({ mode: 'paused', currentIso: '2027-03-14T06:00:00.000Z' }),
  );
  assert.equal(paused.chip.text, '❚❚ PAUSA 14-MAR 06:00');
  assert.match(sim.chip.label, /Simulación ×3600.*controles de tiempo/);
  assert.ok(Object.isFrozen(sim.chip));
});

/** Reloj único real con la pared inyectada (sin esperar 60 s de verdad). */
function wallClock(t) {
  const original = Object.getOwnPropertyDescriptor(performance, 'now');
  const time = { perf: 1_000, wall: Date.UTC(2026, 8, 25, 18, 45, 0) };
  performance.now = () => time.perf;
  t.after(() => {
    if (original) Object.defineProperty(performance, 'now', original);
    else delete performance.now;
  });
  const sceneClock = createSceneClock({
    clock: new Cesium.Clock(),
    now: () => time.wall,
  });
  t.after(() => sceneClock.destroy());
  const advance = (ms) => {
    time.wall += ms;
    time.perf += ms;
  };
  return { sceneClock, advance };
}

test('PAUSA desde vivo > 60 s: se anuncia la suspensión y se ofrecen REANUDAR y AHORA', (t) => {
  const { sceneClock, advance } = wallClock(t);
  sceneClock.pause();
  advance(59_000);
  const early = resolveTimeStrip(sceneClock.getState(), {
    suspendedCount: 0,
    pausedFromLive: true,
  });
  assert.equal(early.suspensionNotice, null, 'a los 59 s sigue siendo «ahora»');
  advance(2_000);
  const state = sceneClock.getState();
  assert.equal(isSceneOffLive(state), true);
  const strip = resolveTimeStrip(state, {
    suspendedCount: 2,
    pausedFromLive: true,
  });
  assert.deepEqual(strip.suspensionNotice, {
    text: 'Capas en vivo suspendidas: la pausa supera 60 s',
    actions: ['pause', 'now'],
  });
  assert.equal(
    strip.announcement,
    'En pausa. Capas en vivo suspendidas: la pausa supera 60 s',
    'aria-live polite dice el cambio',
  );
  assert.ok(Object.isFrozen(strip.suspensionNotice));
});

test('el aviso de la pausa larga solo si la pausa viene de vivo y hay capas suspendidas', (t) => {
  const { sceneClock, advance } = wallClock(t);
  sceneClock.pause();
  advance(61_000);
  const state = sceneClock.getState();
  assert.equal(
    resolveTimeStrip(state, { suspendedCount: 2, pausedFromLive: false })
      .suspensionNotice,
    null,
    'una pausa en otra época (FECHA, simulación) ya lo dicen las notas',
  );
  assert.equal(
    resolveTimeStrip(state, { suspendedCount: 0, pausedFromLive: true })
      .suspensionNotice,
    null,
  );
});

test('umbral por parámetro (arnés): 2 s en vez de 60 s, y el texto lo dice', (t) => {
  const { sceneClock, advance } = wallClock(t);
  sceneClock.pause();
  advance(2_500);
  const state = sceneClock.getState();
  assert.equal(isSceneOffLive(state), false);
  assert.equal(isSceneOffLive(state, { toleranceMs: 2_000 }), true);
  const strip = resolveTimeStrip(state, {
    suspendedCount: 1,
    pausedFromLive: true,
    liveToleranceMs: 2_000,
  });
  assert.equal(
    strip.suspensionNotice.text,
    'Capas en vivo suspendidas: la pausa supera 2 s',
  );
});

test('D5 · honestidad: en modo vivo con deriva ≥ 5 s no dice «en vivo» hasta resincronizar', () => {
  const drifting = resolveTimeStrip(clock({ driftMs: -7_000 }));
  assert.equal(drifting.tone, 'live');
  assert.equal(drifting.label, 'Reloj resincronizando');
  assert.equal(drifting.text, '● Reloj resincronizando 14:32:05 UTC');
  assert.doesNotMatch(drifting.text, /en vivo/i);
  const edge = resolveTimeStrip(clock({ driftMs: 4_999 }));
  assert.equal(edge.label, 'Reloj en vivo');
});
