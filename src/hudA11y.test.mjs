import { expandApplicationHtml } from '../build/application-html.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = expandApplicationHtml(
  readFileSync(new URL('../index.html', import.meta.url), 'utf8'),
);
const parameters = readFileSync(
  new URL('./ui/styleParameters.js', import.meta.url),
  'utf8',
);

// Focused markup guards; actual computed names are checked in Chromium.
// Native labels and hidden inputs must not be treated as missing aria-labels.
test('HUD sliders and location search have descriptive explicit names', () => {
  for (const [id, name] of [
    ['scope-feather-slider', 'Suavizado del borde del visor'],
    ['bloom-intensity-slider', 'Intensidad del resplandor'],
    ['sharpen-intensity-slider', 'Intensidad de nitidez'],
    ['location-search', 'Buscar lugar por nombre o coordenadas'],
  ]) {
    const input = html.match(
      new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`),
    )?.[0];
    assert.ok(input, `${id} exists`);
    assert.ok(
      input.includes(`aria-label="${name}"`),
      `${id} has its descriptive name`,
    );
  }
});

test('the first-run checkbox keeps its native visible label', () => {
  const welcome = expandApplicationHtml('<!-- gev:template welcome -->\n');
  assert.match(
    welcome,
    /<label\b[^>]*class="first-run-suppress"[^>]*>\s*<input type="checkbox" data-first-run-suppress \/>\s*<span>Don't show this again<\/span>\s*<\/label>/,
  );
  assert.match(
    html,
    /<label\s*>\s*Nombre de operación[\s\S]*?<input\s+id="eye-operation-name"/,
  );
  assert.match(
    html,
    /<label\s*>\s*Nota privada[\s\S]*?<textarea\s+id="eye-operation-note"/,
  );
});

test('generated style sliders use the visible parameter label as their name', () => {
  assert.match(parameters, /label\.textContent\s*=\s*metadata\.label;/);
  assert.match(
    parameters,
    /slider\.setAttribute\(['"]aria-label['"],\s*metadata\.label\)/,
  );
});
