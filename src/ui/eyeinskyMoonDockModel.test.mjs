/**
 * Modelo puro de la Luna en el Mission Dock (P5 T8): acciones con motivo,
 * panel OBJETIVO Luna (sin inventar lo ausente) y retícula de tamaño fijo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MOON_CONTEXT_KEY,
  RETICLE_LEGEND,
  buildMoonContext,
  resolveMoonActions,
  resolveMoonReticle,
} from './eyeinskyMoonDockModel.js';

const OK_MOON = Object.freeze({
  enabled: true,
  status: 'ok',
  reason: null,
  epochIso: '2026-09-25T18:45:00.000Z',
  tdbMinusUtcS: 69.1843,
  source: 'DE441',
  validity: { validFrom: 662_731_200, validTo: 1_293_796_800 },
  distanceKm: 372_104.4,
  lightSeconds: 1.2412,
  phaseFraction: 0.9876,
  phaseName: 'luna llena',
  subLunarLonLat: { lonDeg: -101.25, latDeg: -18.5 },
  apparentDiameterDeg: 0.5351,
  scaleMode: 'physical',
  measurable: true,
  orientation: 'aproximada · IAU WGCCRE (rotación síncrona), no ME/PA',
});

const byId = (actions) =>
  Object.fromEntries(actions.map((action) => [action.id, action]));

test('acciones con la Luna lista: apuntar, sistema, escala y volver (solo si hay algo que volver)', () => {
  const actions = byId(resolveMoonActions({ moon: OK_MOON }));
  assert.deepEqual(Object.keys(actions), [
    'aim-moon',
    'earth-moon-system',
    'moon-scale',
    'return-to-earth',
  ]);
  assert.equal(actions['aim-moon'].label, 'APUNTAR A LA LUNA');
  assert.deepEqual(
    Object.values(actions).map((a) => a.short),
    ['APUNTAR', 'SISTEMA', 'LUNA ×10', 'VOLVER'],
  );
  assert.equal(actions['aim-moon'].enabled, true);
  assert.equal(actions['earth-moon-system'].label, 'SISTEMA TIERRA–LUNA');
  assert.equal(actions['moon-scale'].label, 'ESCALA DIDÁCTICA');
  assert.equal(actions['moon-scale'].pressed, false);
  assert.equal(actions['return-to-earth'].enabled, false);
  assert.equal(actions['return-to-earth'].hint, 'Nada que restaurar');
  const back = byId(
    resolveMoonActions({
      moon: { ...OK_MOON, scaleMode: 'didactic' },
      returnPending: true,
    }),
  );
  assert.equal(back['moon-scale'].label, 'ESCALA FÍSICA');
  assert.equal(back['moon-scale'].short, 'FÍSICA');
  assert.equal(back['moon-scale'].pressed, true);
  assert.equal(back['return-to-earth'].enabled, true);
});

test('deshabilitadas con motivo: fecha fuera de rango, marco no disponible, cargando, capa apagada', () => {
  const cases = [
    [{ status: 'out-of-range', reason: 'no-fallback' }, 'Fecha fuera de rango'],
    [{ status: 'unavailable', reason: 'frame' }, 'Marco no disponible'],
    [{ status: 'unavailable', reason: 'loading' }, 'Cargando efeméride'],
    [{ status: 'unavailable', reason: 'no-source' }, 'Efeméride no disponible'],
    [{ enabled: false, status: 'disabled' }, 'Capa Luna apagada'],
  ];
  for (const [patch, reason] of cases) {
    const actions = byId(
      resolveMoonActions({ moon: { ...OK_MOON, ...patch } }),
    );
    for (const id of ['aim-moon', 'earth-moon-system'])
      assert.deepEqual(
        [actions[id].enabled, actions[id].hint],
        [false, reason],
        `${id} ${reason}`,
      );
  }
  const scale = byId(
    resolveMoonActions({
      moon: { ...OK_MOON, status: 'unavailable', reason: 'frame' },
    }),
  )['moon-scale'];
  assert.equal(scale.enabled, true, 'la escala no depende de la época');
});

test('panel OBJETIVO Luna: distancia km y s-luz, fase, diámetro, sublunar, fuente, época UTC/TDB y orientación aproximada', () => {
  const context = buildMoonContext(OK_MOON);
  assert.equal(context.key, MOON_CONTEXT_KEY);
  assert.equal(context.kind, 'moon');
  assert.equal(context.layerId, 'moon');
  assert.equal(context.title, 'Luna');
  assert.equal(context.status, 'computed');
  assert.equal(context.source, 'JPL DE441 · geométrico · ICRF→ITRF');
  const fields = Object.fromEntries(
    context.fields.map((f) => [f.label, [f.value, f.unit ?? null]]),
  );
  assert.deepEqual(fields.DISTANCIA, ['372 104', 'km']);
  assert.deepEqual(fields['LUZ'], ['1,241', 's-luz']);
  assert.deepEqual(fields.FASE, ['luna llena · 98,8 %', null]);
  assert.deepEqual(fields['DIÁMETRO APARENTE'], ['0,535° · 32,1′', null]);
  assert.deepEqual(fields['PUNTO SUBLUNAR'], [
    '18,50° S · 101,25° O (con tiempo de luz)',
    null,
  ]);
  assert.deepEqual(fields['ÉPOCA'], [
    '2026-09-25 18:45:00 UTC · TDB = UTC + 69,18 s',
    null,
  ]);
  assert.deepEqual(fields['ORIENTACIÓN'], [
    'aproximada · IAU WGCCRE (rotación síncrona), no ME/PA',
    null,
  ]);
  assert.deepEqual(fields.ESCALA, ['física (medible)', null]);
  assert.equal(context.fields.length, 8, 'límite del expediente');
});

test('respaldo y ausencias: astronomy-engine ≤20 km rotulado; sin efemérides nada inventado', () => {
  const fallback = buildMoonContext({
    ...OK_MOON,
    source: 'astronomy-engine',
    validity: { toleranceKm: 20 },
  });
  assert.equal(fallback.source, 'astronomy-engine ≤20 km · modelo analítico');
  const out = buildMoonContext({
    ...OK_MOON,
    status: 'out-of-range',
    distanceKm: null,
    validity: { validFrom: 662_731_200, validTo: 1_293_796_800 },
  });
  assert.equal(out.title, 'Luna · SIN EFEMÉRIDES');
  assert.equal(out.status, 'missing');
  assert.deepEqual(
    out.fields.map((f) => f.label),
    ['VALIDEZ', 'ÉPOCA'],
  );
  assert.equal(out.fields[0].value, 'válido 2021–2040 TDB');
  const frame = buildMoonContext({
    ...OK_MOON,
    status: 'unavailable',
    reason: 'frame',
  });
  assert.equal(frame.title, 'Luna · SIN MARCO');
  assert.equal(
    frame.fields.some((f) => f.label === 'DISTANCIA'),
    false,
  );
  const didactic = buildMoonContext({
    ...OK_MOON,
    scaleMode: 'didactic',
    measurable: false,
  });
  assert.equal(
    didactic.fields.find((f) => f.label === 'ESCALA').value,
    'DIDÁCTICA ×10 · NO ES REAL (no medible)',
  );
});

test('retícula: tamaño fijo en px dentro del cuadro; flecha al borde fuera o detrás de la cámara', () => {
  assert.equal(RETICLE_LEGEND, 'RETÍCULA ≠ TAMAÑO');
  const view = { width: 1280, height: 800, margin: 28 };
  const on = resolveMoonReticle({
    ...view,
    point: { x: 640, y: 300 },
    dx: 0,
    dy: -1,
  });
  assert.deepEqual(on, {
    mode: 'on',
    x: 640,
    y: 300,
    angleDeg: 0,
    legendAlign: 'center',
  });
  const nearEdge = resolveMoonReticle({
    ...view,
    point: { x: 20, y: 300 },
    dx: -1,
    dy: 0,
  });
  assert.deepEqual(
    [nearEdge.mode, nearEdge.legendAlign],
    ['on', 'start'],
    'dentro del lienzo aunque esté cerca del borde; la leyenda no se corta',
  );
  const nearRight = resolveMoonReticle({
    ...view,
    point: { x: 1270, y: 300 },
    dx: 1,
    dy: 0,
  });
  assert.equal(nearRight.legendAlign, 'end');
  const right = resolveMoonReticle({ ...view, point: null, dx: 1, dy: 0 });
  assert.equal(right.mode, 'edge');
  assert.equal(right.x, 1280 - 28);
  assert.equal(right.y, 400);
  assert.equal(right.angleDeg, 90);
  const up = resolveMoonReticle({
    ...view,
    point: { x: 640, y: -50 },
    dx: 0,
    dy: -1,
  });
  assert.deepEqual([up.mode, up.x, up.y, up.angleDeg], ['edge', 640, 28, 0]);
  assert.equal(
    resolveMoonReticle({ ...view, point: null, dx: 0, dy: 0 }).mode,
    'hidden',
  );
});

test('el dock rotula el objetivo Luna y su estado «calculada», nunca «observada»', async () => {
  const { buildMissionDockView } =
    await import('./eyeinskyMissionDockModel.js');
  const { createDossierState } = await import('./eyeinskyDossierModel.js');
  const view = buildMissionDockView({
    dossier: createDossierState(buildMoonContext(OK_MOON)),
    activity: { tasks: [], history: [] },
  });
  assert.equal(view.kicker, 'Objetivo · Luna');
  assert.equal(view.status, 'computed');
  assert.deepEqual(
    view.keyValues.map((f) => f.label),
    ['DISTANCIA', 'LUZ', 'FASE'],
  );
  const { MISSION_DOCK_STATUS_LABELS } =
    await import('./eyeinskyMissionDock.js');
  assert.equal(
    MISSION_DOCK_STATUS_LABELS.computed,
    'Posición calculada (efeméride, no observada)',
  );
});
