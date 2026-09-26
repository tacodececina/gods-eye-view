/**
 * Reglas de la revelación y del pie (fase visual T3, reparación T5):
 *  - V-01: en reposo (`data-eye-reveal="rest"`) se ocultan instrumentos,
 *    telemetría, capas vacías y el chip de proveedores con opacity/visibility
 *    (nunca `hidden` ni `display:none`: destinos de foco e hit-tests siguen);
 *  - V-02: aparecen con `--ei-t-reveal` al explorar;
 *  - la tira TIEMPO reserva el ancho REAL de la telemetría (sin solape en
 *    Simulación ×3600);
 *  - los valores del panel no se recortan con elipsis (un dato oculto).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) =>
  readFileSync(new URL(`../styles/${name}`, import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
const reveal = read('eyeinsky-editorial-reveal.css');
const mobile = read('eyeinsky-editorial-mobile.css');

/** Cuerpo del primer bloque cuyo selector contiene todas las piezas. */
function ruleBody(css, pieces) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(css)))
    if (pieces.every((piece) => match[1].includes(piece))) return match[2];
  return null;
}

const REST_HIDDEN = [
  '.eye-instruments',
  '.eye-telemetry',
  "#eye-active-layers[data-empty='true']",
  '#key-setup-chip',
];

test('V-01: en reposo se ocultan instrumentos, telemetría, capas vacías y chip', () => {
  const body = ruleBody(reveal, ["[data-eye-reveal='rest']", ...REST_HIDDEN]);
  assert.ok(body, 'regla de reposo con las cuatro regiones');
  assert.match(body, /opacity:\s*0/);
  assert.match(body, /visibility:\s*hidden/);
  assert.doesNotMatch(body, /display:\s*none/);
});

test('V-02: al explorar se revelan con --ei-t-reveal (visibilidad inmediata)', () => {
  const body = ruleBody(reveal, [
    "[data-eye-reveal='explore']",
    ...REST_HIDDEN,
  ]);
  assert.ok(body, 'regla de revelación');
  assert.match(body, /opacity\s+var\(--ei-t-reveal\)/);
  assert.match(body, /visibility\s+0s/);
});

test('la tira TIEMPO reserva el ancho medido de la telemetría', () => {
  const body = ruleBody(reveal, [
    "body[data-eye-skin='editorial'] .eye-time-host",
  ]);
  assert.match(body, /max-width:[^;]*var\(--eye-telemetry-width/);
  assert.doesNotMatch(body, /-\s*420px/);
});

test('valores del panel sin elipsis ni nowrap: se parten, no se esconden', () => {
  const body = ruleBody(reveal, [
    "body[data-eye-skin='editorial'] .eye-dock-keyvalue dd",
  ]);
  assert.ok(body);
  assert.doesNotMatch(body, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(body, /white-space:\s*nowrap/);
  assert.match(body, /overflow-wrap:\s*anywhere/);
});

test('teléfono: 3 columnas que caben (hueco 12 px, etiqueta menos espaciada), sin elipsis', () => {
  // Con 2 columnas la hoja crecía una fila e Inspeccionar salía de su área
  // visible (p4 movil-390-riel-sin-recortes-y-44px). Con 3 columnas estrechas
  // se exige que cada valor quepa entero: lo mide vis-28 (scrollWidth).
  const grid = ruleBody(mobile, ['.eye-mission-dock .eye-dock-keyvalues']);
  assert.match(grid, /repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(grid, /gap:\s*12px/);
  const label = ruleBody(mobile, ['.eye-mission-dock .eye-dock-keyvalue dt']);
  assert.match(label, /letter-spacing:\s*0\.04em/);
  assert.doesNotMatch(mobile, /keyvalue[^{]*\{[^}]*text-overflow:\s*ellipsis/);
});
