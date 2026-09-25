/**
 * Generador DETERMINISTA del placeholder de textura lunar de P5 (T6).
 *
 * NO es una imagen de la Luna: es un mapa equirectangular gris 512×256 con
 * retícula cada 30°, el meridiano 0° al centro (s = 0,5), el ecuador, marcas
 * «0», «90E», «90W», «180» y el rótulo «PLACEHOLDER SIN TEXTURA». Sirve para
 * comprobar la orientación en pantalla hasta que la textura NASA SVS pase su
 * ledger. Obra propia generada por código (sin fuente externa).
 *
 * PNG gris de 8 bits, sin metadatos, zlib nivel 9: mismos bytes en cada
 * corrida. Uso: node scripts/eyeinsky-moon-placeholder.mjs [salida]
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const WIDTH = 512;
export const HEIGHT = 256;
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUT = 'public/models/moon/placeholder.png';
const BASE = 138;
const GRID = 104;
const AXIS = 222;
const INK = 32;

/** Fuente de 5×7 píxeles, solo los glifos del rótulo. */
const FONT = Object.freeze({
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
});

function drawText(pixels, text, x0, y0, scale) {
  [...text].forEach((char, index) => {
    const glyph = FONT[char];
    if (!glyph) throw new Error(`Glifo sin definir: ${char}`);
    glyph.forEach((row, gy) =>
      [...row].forEach((bit, gx) => {
        if (bit !== '1') return;
        for (let dy = 0; dy < scale; dy += 1)
          for (let dx = 0; dx < scale; dx += 1) {
            const x = x0 + (index * 6 + gx) * scale + dx;
            const y = y0 + gy * scale + dy;
            if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT)
              pixels[y * WIDTH + x] = INK;
          }
      }),
    );
  });
}

/** Píxeles en gris: fondo, retícula 30°, meridiano 0° y ecuador, rótulos. */
export function placeholderPixels() {
  const pixels = new Uint8Array(WIDTH * HEIGHT).fill(BASE);
  const lonLines = new Set(
    Array.from({ length: 12 }, (_, k) => Math.round((k * WIDTH) / 12)),
  );
  const latLines = new Set(
    Array.from({ length: 6 }, (_, k) => Math.round((k * HEIGHT) / 6)),
  );
  for (let y = 0; y < HEIGHT; y += 1)
    for (let x = 0; x < WIDTH; x += 1) {
      if (lonLines.has(x) || latLines.has(y)) pixels[y * WIDTH + x] = GRID;
      if (x === WIDTH / 2 || x === WIDTH / 2 - 1) pixels[y * WIDTH + x] = AXIS;
      if (y === HEIGHT / 2) pixels[y * WIDTH + x] = AXIS;
    }
  drawText(pixels, 'PLACEHOLDER SIN TEXTURA', 256 - 69 * 2, 52, 2);
  drawText(pixels, '0', 260, 136, 2);
  drawText(pixels, '90E', 388, 136, 2);
  drawText(pixels, '90W', 132, 136, 2);
  drawText(pixels, '180', 4, 136, 2);
  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PNG gris 8 bits sin metadatos (bytes deterministas). */
export function encodeGrayPng(pixels, width = WIDTH, height = HEIGHT) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8);
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y += 1)
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]);
if (invoked === fileURLToPath(import.meta.url)) {
  const target = path.resolve(ROOT, process.argv[2] ?? DEFAULT_OUT);
  const png = encodeGrayPng(placeholderPixels());
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, png);
  const sha = createHash('sha256').update(png).digest('hex');
  console.log(`${path.relative(ROOT, target)} ${png.length} B sha256 ${sha}`);
}
