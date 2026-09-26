/**
 * Marcado de la jerarquía de la fase visual T3 (plan §3, V-01…V-05):
 * titular de entrada, pie global con TIEMPO y telemetría, sin paneles de
 * reposo (USGS bajo demanda, D3), sin lecturas estáticas (CAMPO, sparkline)
 * y el dock presente pero oculto hasta que haya objetivo (D1-A).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(
  new URL('../templates/eyeinsky.html', import.meta.url),
  'utf8',
);
const block = (pattern) => html.match(pattern)?.[0] ?? '';

test('titular de entrada .eye-story con región viva educada', () => {
  assert.match(
    html,
    /<section[^>]*class="eye-story"[^>]*aria-live="polite"[^>]*>/,
  );
});

test('pie global: TIEMPO y telemetría en una sola línea (.eye-foot)', () => {
  const foot = block(/<footer class="eye-foot"[\s\S]*?<\/footer>/);
  assert.ok(foot, 'existe .eye-foot');
  assert.match(foot, /data-eye-time-host/);
  assert.match(foot, /class="eye-telemetry[^"]*"/);
  assert.match(foot, /id="eye-map-label"/);
  // T3 paso 8: Compartir no vive en la línea de telemetría (en el teléfono
  // se desplaza bajo una máscara y el foco quedaba fuera de la vista).
  assert.doesNotMatch(foot, /id="eye-share"/);
});

test('Compartir vive en Más (y en la paleta de acciones), con su id', () => {
  const more = block(/<section data-eye-panel="more"[\s\S]*?<\/section>/);
  assert.match(more, /<button id="eye-share"/);
  assert.equal(html.match(/id="eye-share"/g)?.length, 1);
  const commands = readFileSync(
    new URL('./shellCommands.js', import.meta.url),
    'utf8',
  );
  assert.match(commands, /\['Compartir vista pública', shell\.share\]/);
});

test('telemetría sin redundancias: una altura con datum, un rumbo, sin CAMPO', () => {
  const telemetry = block(/<aside[^>]*class="eye-telemetry[\s\S]*?<\/aside>/);
  assert.equal(telemetry.match(/id="eye-camera-altitude"/g)?.length, 1);
  assert.equal(telemetry.match(/id="eye-camera-heading"/g)?.length, 1);
  assert.match(telemetry, /Altura · elipsoide/);
  assert.doesNotMatch(html, /eye-sector-name|eye-sector-readout|CAMPO/);
});

test('USGS bajo demanda (D3): sin panel de reposo ni sparkline sin denominador', () => {
  assert.doesNotMatch(html, /eye-signal-glance/);
  assert.doesNotMatch(html, /eye-source-trend/);
  assert.doesNotMatch(html, /eye-active-layer-count/);
  const signals = block(/<section data-eye-panel="signals"[\s\S]*?<\/section>/);
  assert.match(signals, /id="eye-source-state"[^>]*role="status"/);
});

test('D1-A: el dock existe pero nace oculto', () => {
  assert.match(
    html,
    /<section\s+id="eye-mission-dock"[^>]*hidden[^>]*>|<section\s+id="eye-mission-dock"[\s\S]*?hidden\s*><\/section>/,
  );
});

test('buscador §6.2: lupa, ⌘K en mono y acciones dentro de la píldora', () => {
  const search = block(
    /<div\s+class="eye-search[\s\S]*?<\/div>\s*<\/div>|<div\s+class="eye-search[\s\S]*?<\/kbd>/,
  );
  assert.match(search, /<svg[^>]*class="eye-search-icon"/);
  assert.match(search, /<kbd[^>]*>⌘K<\/kbd>/);
  assert.doesNotMatch(search, /⌖/);
});

test('capas: «Capas en escena · N» con «+ Agregar»', () => {
  const layers = block(/<aside\s+id="eye-active-layers"[\s\S]*?<\/aside>/);
  assert.match(layers, /Capas en escena · <b data-eye-active-count>0<\/b>/);
  assert.match(layers, /data-eye-active-add[^>]*>\+ Agregar</);
  assert.match(layers, /data-eye-moon-menu/);
});
