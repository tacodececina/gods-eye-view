import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  HEIGHT,
  WIDTH,
  encodeGrayPng,
  placeholderPixels,
} from './eyeinsky-moon-placeholder.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const COMMITTED = new URL(
  '../public/models/moon/placeholder.png',
  import.meta.url,
);

test('el placeholder lunar es determinista y el del repo es exactamente el generado', () => {
  const a = encodeGrayPng(placeholderPixels());
  const b = encodeGrayPng(placeholderPixels());
  assert.equal(sha(a), sha(b));
  assert.equal(sha(readFileSync(COMMITTED)), sha(a));
});

test('PNG gris 512×256 con el meridiano 0° en el centro (s = 0,5) y retícula', () => {
  const png = encodeGrayPng(placeholderPixels());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), WIDTH);
  assert.equal(png.readUInt32BE(20), HEIGHT);
  assert.equal(png[24], 8, '8 bits');
  assert.equal(png[25], 0, 'gris');
  const pixels = placeholderPixels();
  const at = (x, y) => pixels[y * WIDTH + x];
  assert.equal(at(WIDTH / 2, 10), 222, 'meridiano 0°');
  assert.equal(at(10, HEIGHT / 2), 222, 'ecuador');
  assert.equal(at(Math.round(WIDTH / 12), 10), 104, 'meridiano 150°W');
  assert.equal(at(100, 100), 138, 'fondo');
});
