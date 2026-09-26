/**
 * Piel Editorial (fase visual T1): las hojas `eyeinsky-editorial*.css` se
 * cargan las últimas, declaran los tokens §10 del sistema de diseño, viven
 * enteras bajo `body[data-eye-skin='editorial']` (con `?skin=legacy` no pintan
 * nada), ganan por especificidad y orden (todo `!important` cita la regla que
 * vence) y sirven sus fuentes en local.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const SHEETS = [
  'eyeinsky-editorial.css',
  'eyeinsky-editorial-panel.css',
  // Fase visual T3: jerarquía y revelación (titular, pie, panel, capas).
  'eyeinsky-editorial-reveal.css',
  'eyeinsky-editorial-mobile.css',
];
const readSheet = (name) => {
  const url = new URL(`./styles/${name}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};
const raw = SHEETS.map(readSheet).join('\n');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
const SKIN = "body[data-eye-skin='editorial']";

/** Selectores de nivel superior y dentro de @media/@supports. */
function selectors(text) {
  const out = [];
  // Prelude de cada bloque: lo que va desde el delimitador anterior hasta `{`.
  const re = /(?<=^|[{};])\s*([^{};]+)\{/g;
  let match;
  while ((match = re.exec(text))) {
    const selector = match[1].trim();
    if (!selector || selector.startsWith('@')) continue;
    if (/^(from|to|\d+%)(\s*,\s*(from|to|\d+%))*$/.test(selector)) continue;
    out.push(selector);
  }
  return out;
}

test('las hojas existen (< 800 líneas) y se enlazan las últimas, en orden', () => {
  for (const name of SHEETS) {
    const text = readSheet(name);
    assert.ok(text.length > 0, `${name} existe`);
    assert.ok(text.split('\n').length < 800, `${name} < 800 líneas`);
  }
  const html = readFileSync(new URL('index.html', root), 'utf8');
  const links = [
    ...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g),
  ].map((m) => m[1]);
  assert.deepEqual(
    links.slice(-SHEETS.length),
    SHEETS.map((name) => `/src/ui/styles/${name}`),
  );
});

test('tokens §10: paleta, familias, radios, tiempos y suelos', () => {
  const tokens = {
    '--ei-space': '#020505',
    '--ei-bg': '#071110',
    '--ei-paper': '#eef1e9',
    '--ei-ink': '#0b1413',
    '--ei-muted': '#b2c4b9',
    '--ei-faint': '#8fa398',
    '--ei-live': '#a6d7c2',
    '--ei-amber': '#e6b46d',
    '--ei-target': '44px',
    '--ei-t': '180ms',
    '--ei-t-reveal': '600ms',
  };
  for (const [name, value] of Object.entries(tokens))
    assert.match(css, new RegExp(`${name}:\\s*${value};`), name);
  assert.match(css, /--ei-f-display:\s*'Instrument Serif'/);
  assert.match(css, /--ei-f-ui:\s*'Space Grotesk'/);
  assert.match(css, /--ei-f-mono:\s*'IBM Plex Mono'/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*--ei-t:\s*0ms/,
  );
});

test('foco visible ámbar de 2 px con 3 px de separación bajo la piel', () => {
  const rule = new RegExp(
    `${SKIN.replace(/[[\]']/g, (c) => `\\${c}`)} :focus-visible\\s*\\{[^}]*outline:\\s*2px solid var\\(--ei-amber\\)[^}]*outline-offset:\\s*3px`,
  );
  assert.match(css, rule);
});

test('toda regla vive bajo la piel editorial (legacy no pinta nada)', () => {
  const all = selectors(css);
  assert.ok(all.length > 40, 'la hoja tiene reglas');
  const topLevel = (selector) => {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of selector) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) {
        parts.push(current);
        current = '';
      } else current += char;
    }
    return [...parts, current];
  };
  const leaks = all
    .flatMap(topLevel)
    .map((s) => s.trim())
    .filter((s) => s && s !== ':root' && !s.startsWith(SKIN));
  assert.deepEqual(leaks, []);
});

test('cada !important cita en su línea la regla !important que vence', () => {
  const lines = raw.split('\n').filter((line) => line.includes('!important'));
  const uncited = lines.filter(
    (line) => !/\/\*\s*vence\s+\S+\.css:\d+/.test(line),
  );
  assert.deepEqual(uncited, []);
});

test('fuentes locales con swap: Instrument Serif regular e itálica, Plex Mono 500', () => {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const want = [
    ['Instrument Serif', 'normal', 'InstrumentSerif-Regular.ttf'],
    ['Instrument Serif', 'italic', 'InstrumentSerif-Italic.ttf'],
    ['IBM Plex Mono', 'normal', 'IBMPlexMono-Medium.ttf'],
  ];
  for (const [family, style, file] of want) {
    const face = faces.find(
      (body) =>
        body.includes(`'${family}'`) &&
        body.includes(file) &&
        body.includes(`font-style: ${style}`),
    );
    assert.ok(face, `${family} ${style}`);
    assert.match(face, /font-display:\s*swap/);
    assert.match(face, /url\('\/identity\/fonts\//);
    assert.ok(
      existsSync(new URL(`public/identity/fonts/${file}`, root)),
      `${file} está en public/identity/fonts`,
    );
  }
  assert.ok(
    existsSync(new URL('public/identity/fonts/instrumentserif-OFL.txt', root)),
  );
  assert.doesNotMatch(raw, /fonts\.googleapis|fonts\.gstatic/);
});
