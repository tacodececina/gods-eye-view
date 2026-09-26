/**
 * Acciones de la Luna sin dock en reposo (fase visual T3, D1-A): en el panel
 * de la Luna cuando está fijada; si no, en el menú de su fila de capa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { moonActionsPlace } from './moonActionsHost.js';
import { MOON_CONTEXT_KEY } from '../eyeinskyMoonDockModel.js';

test('con la Luna fijada y el panel visible, las acciones van al panel', () => {
  assert.equal(
    moonActionsPlace({ dockVisible: true, contextKey: MOON_CONTEXT_KEY }),
    'dock',
  );
});

test('sin la Luna fijada (reposo, otro objetivo o panel cerrado) van a la fila', () => {
  assert.equal(
    moonActionsPlace({ dockVisible: false, contextKey: null }),
    'menu',
  );
  assert.equal(
    moonActionsPlace({ dockVisible: true, contextKey: 'satellites:25544' }),
    'menu',
  );
  assert.equal(
    moonActionsPlace({ dockVisible: false, contextKey: MOON_CONTEXT_KEY }),
    'menu',
  );
});
