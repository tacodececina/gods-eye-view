/**
 * Franja del dock (`--eye-dock-band`) con el panel contextual a la DERECHA
 * (fase visual T3, §6.4): la franja es lo que el panel tapa por ABAJO a lo
 * ancho del centro del lienzo. Un panel lateral que no cruza el centro no
 * empuja la Luna ni el satélite seguido hacia arriba; la hoja del teléfono,
 * que sí lo cruza, publica su franja como antes (p4-ux móvil).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDockBand } from '../eyeinskyMissionDock.js';

const viewport = { innerWidth: 1280, innerHeight: 800 };

test('panel oculto: sin franja', () => {
  assert.equal(resolveDockBand({ hidden: true, rect: null, ...viewport }), 0);
});

test('panel lateral a la derecha, sin cruzar el centro: sin franja', () => {
  const rect = { left: 804, right: 1184, top: 250, bottom: 672 };
  assert.equal(resolveDockBand({ hidden: false, rect, ...viewport }), 0);
});

test('hoja inferior que cruza el centro: franja desde su borde superior', () => {
  const rect = { left: 16, right: 314, top: 393, bottom: 690 };
  assert.equal(
    resolveDockBand({ hidden: false, rect, innerWidth: 390, innerHeight: 844 }),
    451,
  );
});

test('dock inferior anclado a la izquierda (piel legacy): franja como siempre', () => {
  // A 1600 px el dock legacy (14–774) no cruza el centro y aun así tapa el
  // borde inferior: la telemetría legacy se aparta por encima (medido T3).
  const rect = { left: 14, right: 774, top: 732, bottom: 870 };
  assert.equal(
    resolveDockBand({
      hidden: false,
      rect,
      innerWidth: 1600,
      innerHeight: 900,
    }),
    168,
  );
});
