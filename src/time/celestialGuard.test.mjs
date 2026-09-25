import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Guarda P5 (propuesta §7): la Luna nunca sale de Simon1994 y el paso
 * inercial→fijo nunca cae a TEME. Busca los identificadores prohibidos en el
 * código de `src/` (los tests quedan fuera: pueden nombrarlos para prohibirlos).
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const FORBIDDEN = Object.freeze([
  'computeMoonPositionInEarthInertialFrame',
  'computeTemeToPseudoFixedMatrix',
]);

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.m?js$/.test(entry.name) && !entry.name.endsWith('.test.mjs')
      ? [absolute]
      : [];
  });
}

test('P5: src/ no usa Simon1994 para la Luna ni la matriz TEME', () => {
  const hits = sourceFiles(SRC).flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    return FORBIDDEN.filter((name) => text.includes(name)).map(
      (name) =>
        `${path.relative(SRC, file).split(path.sep).join('/')}: ${name}`,
    );
  });
  assert.deepEqual(hits, []);
});
