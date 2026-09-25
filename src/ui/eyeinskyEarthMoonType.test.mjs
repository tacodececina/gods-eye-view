/**
 * P5 · tipografía de la tira TIEMPO y las acciones Tierra–Luna (regresión P3-11).
 *
 * El arnés P3 exige texto ≥ 14 px en teléfono (ancho ≤ 650 px o alto ≤ 520 px
 * en horizontal) y ≥ 13 px en escritorio. Toda declaración de tamaño de la
 * hoja Tierra–Luna pasa por una sola variable, que la consulta de teléfono
 * sube a 14 px.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  new URL('./styles/eyeinsky-earth-moon.css', import.meta.url),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

const TEXT_VAR = '--eye-earth-moon-text';
const PHONE_QUERY =
  /@media \(max-width: 650px\), \(max-height: 520px\) and \(orientation: landscape\) \{([\s\S]*?)\n\}/;

const pxOf = (value) => Number.parseFloat(value);

test('toda declaración font/font-size usa la variable o es ≥ 14 px', () => {
  const declarations = [...css.matchAll(/\bfont(?:-size)?:\s*([^;]+);/g)].map(
    (match) => match[1].trim(),
  );
  assert.ok(declarations.length > 10, 'la hoja declara tipografía');
  const literal = declarations
    .filter((value) => !value.includes(`var(${TEXT_VAR})`))
    .flatMap((value) => value.match(/(\d+(?:\.\d+)?)px/g) ?? [])
    .map(pxOf)
    .filter((size) => size < 14);
  assert.deepEqual(literal, [], 'sin tamaños literales < 14 px');
});

test('la variable vale 13 px en escritorio y 14 px en teléfono', () => {
  const root = css.match(/:root\s*\{([^}]*)\}/);
  assert.ok(root, 'la hoja define la variable en :root');
  const desktop = root[1].match(new RegExp(`${TEXT_VAR}:\s*([^;]+);`));
  assert.equal(desktop?.[1].trim(), '13px');
  const phone = css.match(PHONE_QUERY);
  assert.ok(phone, 'consulta de teléfono (estrecho o apaisado bajo)');
  const size = phone[1].match(new RegExp(`${TEXT_VAR}:\s*([^;]+);`));
  assert.ok(size, 'la consulta de teléfono sube la variable');
  assert.ok(pxOf(size[1]) >= 14, `teléfono ≥ 14 px (${size[1]})`);
});

test('la etiqueta FECHA UTC gana a `.eyeinsky label` (13 px global)', () => {
  // `.eyeinsky label` (0,1,1) fija 13 px en todo <label>; la etiqueta del
  // campo de fecha necesita la misma especificidad para usar la variable.
  const rule = css.match(/\.eyeinsky \.eye-time-field\s*\{([^}]*)\}/);
  assert.ok(rule, 'regla `.eyeinsky .eye-time-field`');
  assert.ok(rule[1].includes(`font: var(${TEXT_VAR})`), 'usa la variable');
});
