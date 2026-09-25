/**
 * Tira TIEMPO del Mission Dock (P5 T8): lógica pura en
 * `eyeinskyMissionDockModel.js`. Fija los tres estados del reloj único, los
 * botones con su motivo, el campo de fecha UTC validado y las notas honestas
 * (capas en vivo suspendidas, SGP4 en hora real).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

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

test('EN VIVO: «● EN VIVO hh:mm:ss UTC», tono vivo y AHORA deshabilitado con motivo', () => {
  const strip = resolveTimeStrip(clock());
  assert.equal(strip.text, '● EN VIVO 14:32:05 UTC');
  assert.equal(strip.tone, 'live');
  assert.equal(strip.announcement, 'En vivo');
  assert.equal(strip.now.enabled, false);
  assert.equal(strip.now.hint, 'Ya estás en la hora real');
  assert.equal(strip.pause.label, 'PAUSA');
  assert.equal(strip.pause.pressed, false);
  assert.equal(strip.advance.label, 'AVANCE ×60');
  assert.equal(strip.advance.short, '×60', 'rótulo corto en cabecera compacta');
  assert.equal(strip.pause.short, 'PAUSA');
  assert.equal(strip.advance.multiplier, 60);
  assert.deepEqual(strip.notes, []);
  assert.ok(Object.isFrozen(strip));
});

test('SIMULACIÓN: «◆ SIMULACIÓN <fecha> UTC ×N» en ámbar; AVANCE recorre 1→60→600→3600', () => {
  const strip = resolveTimeStrip(
    clock({
      mode: 'simulated',
      multiplier: 3600,
      isLive: false,
      currentIso: '2027-03-14T06:00:59.900Z',
      driftMs: 1e10,
    }),
  );
  assert.equal(strip.text, '◆ SIMULACIÓN 2027-03-14 06:00 UTC ×3600');
  assert.equal(strip.tone, 'sim');
  assert.equal(strip.announcement, 'Simulación ×3600');
  assert.equal(strip.now.enabled, true);
  assert.deepEqual(TIME_ADVANCE_STEPS, [1, 60, 600, 3600]);
  assert.equal(strip.advance.multiplier, 1, 'tras ×3600 vuelve a ×1');
  const cycle = [1, 60, 600, 3600].map((m) =>
    nextAdvanceMultiplier(clock({ mode: 'simulated', multiplier: m })),
  );
  assert.deepEqual(cycle, [60, 600, 3600, 1]);
  assert.equal(nextAdvanceMultiplier(clock({ mode: 'paused' })), 60);
});

test('PAUSA: «❚❚ PAUSA · <motivo>» y, sin motivo, la época; el botón pasa a REANUDAR', () => {
  const reasoned = resolveTimeStrip(
    clock({ mode: 'paused', isLive: false, reason: 'fuera de efemérides' }),
  );
  assert.equal(reasoned.text, '❚❚ PAUSA · fuera de efemérides');
  assert.equal(reasoned.announcement, 'Pausa: fuera de efemérides');
  assert.equal(reasoned.tone, 'paused');
  assert.equal(reasoned.pause.label, 'REANUDAR');
  assert.equal(reasoned.pause.pressed, true);
  const plain = resolveTimeStrip(
    clock({
      mode: 'paused',
      isLive: false,
      currentIso: '2027-03-14T06:00:00.000Z',
    }),
  );
  assert.equal(plain.text, '❚❚ PAUSA · 2027-03-14 06:00:00 UTC');
  assert.equal(plain.announcement, 'Pausa');
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
