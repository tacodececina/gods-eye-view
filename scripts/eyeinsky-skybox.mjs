/**
 * SkyBox sobrio de EYEINSKY (fase visual T2, decisión D4): cielo VERDADERO
 * generado offline desde el Yale Bright Star Catalogue, 5.ª ed. (Hoffleit &
 * Warren 1991, CDS V/50, preparado por el NSSDC/ADC de NASA).
 *
 *   node scripts/eyeinsky-skybox.mjs --catalog <catalog.gz> [--out public/sky]
 *
 * - Solo estrellas con Vmag ≤ 5 (~1 600): cielo a simple vista, sin Vía Láctea
 *   inventada ni puntos aleatorios.
 * - Posición J2000 precesada (IAU 1976) a la época de generación: el SkyBox
 *   de Cesium usa ejes TEME de la fecha, y 2000→2026 son ~0,36° (≈ 4 px de
 *   cara). Sin nutación (< 20″) ni movimiento propio (< 0,03° en 26 años).
 * - Brillo comprimido (medio paso de magnitud por escala) con pico de
 *   luminancia relativa .45 (Sirio) y huella bilineal de ≤ 2×2 px.
 * - Salida determinista: mismas filas → mismos píxeles; PNG gris de 8 bits.
 *
 * Convención de caras: Cesium muestrea el cubo con la dirección TEME cruda y
 * sube cada imagen con flipY (loadCubeMap), así que valen las tablas GL del
 * cubo con la fila 0 de la imagen en t = 1.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, gunzipSync } from 'node:zlib';

/** SHA-256 de https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz (2026-09-25). */
export const CATALOG_SHA256 =
  '3dc44b1e90be8fbe5bcc7656032560f51275f985c7e3f783c9028e1838ec7bed';
export const CATALOG_URL = 'https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz';
export const FACE_NAMES = Object.freeze(['px', 'nx', 'py', 'ny', 'pz', 'nz']);
export const MAX_MAGNITUDE = 5;
/** Luminancia relativa máxima de un píxel (V-14: p99 del cielo < .45). */
export const PEAK_LUMINANCE = 0.45;
const BRIGHTEST_MAG = -1.46;
/** Escala comprimida: 10^(-0.2·Δm) en vez de 10^(-0.4·Δm). */
const MAG_COMPRESSION = 0.2;

const deg = Math.PI / 180;
const arcsec = deg / 3600;
/** Época de generación (año juliano): la deriva hasta 2036 es < 0,14°. */
export const EPOCH_YEAR = 2026;

/**
 * Precesión IAU 1976 de un vector ecuatorial J2000 al equinoccio medio de
 * `year` (P = R3(−z)·R2(θ)·R3(−ζ)).
 */
export function precessJ2000([x, y, z], year = EPOCH_YEAR) {
  const t = (year - 2000) / 100;
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * arcsec;
  const zz = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * arcsec;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * arcsec;
  const r3 = (a, [u, v, w]) => [
    Math.cos(a) * u + Math.sin(a) * v,
    -Math.sin(a) * u + Math.cos(a) * v,
    w,
  ];
  const r2 = (a, [u, v, w]) => [
    Math.cos(a) * u - Math.sin(a) * w,
    v,
    Math.sin(a) * u + Math.cos(a) * w,
  ];
  return r3(-zz, r2(theta, r3(-zeta, [x, y, z])));
}

/** Filas del ReadMe V/50: RA J2000 (76-83), Dec J2000 (84-90), Vmag (103-107). */
export function parseBsc5(text) {
  const stars = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (line.length < 107) continue;
    const hr = Number(line.slice(0, 4));
    const raH = Number(line.slice(75, 77));
    const raM = Number(line.slice(77, 79));
    const raS = Number(line.slice(79, 83));
    const sign = line.slice(83, 84) === '-' ? -1 : 1;
    const decD = Number(line.slice(84, 86));
    const decM = Number(line.slice(86, 88));
    const decS = Number(line.slice(88, 90));
    const vmagText = line.slice(102, 107).trim();
    if (!vmagText || !line.slice(75, 90).trim()) continue;
    const vmag = Number(vmagText);
    const values = [hr, raH, raM, raS, decD, decM, decS, vmag];
    if (!values.every(Number.isFinite)) continue;
    stars.push({
      hr,
      raDeg: (raH + raM / 60 + raS / 3600) * 15,
      decDeg: sign * (decD + decM / 60 + decS / 3600),
      vmag,
    });
  }
  return stars;
}

/** Vector unitario ecuatorial (x hacia el equinoccio, z al polo norte). */
export function starDirection(raDeg, decDeg) {
  const ra = raDeg * deg;
  const dec = decDeg * deg;
  return [
    Math.cos(dec) * Math.cos(ra),
    Math.cos(dec) * Math.sin(ra),
    Math.sin(dec),
  ];
}

/** Cara y píxel (centros en .5) de una dirección, convención GL + flipY. */
export function faceCoords([x, y, z], size) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let face;
  let sc;
  let tc;
  let ma;
  if (ax >= ay && ax >= az) {
    face = x > 0 ? 'px' : 'nx';
    ma = ax;
    sc = x > 0 ? -z : z;
    tc = -y;
  } else if (ay >= az) {
    face = y > 0 ? 'py' : 'ny';
    ma = ay;
    sc = x;
    tc = y > 0 ? z : -z;
  } else {
    face = z > 0 ? 'pz' : 'nz';
    ma = az;
    sc = z > 0 ? x : -x;
    tc = -y;
  }
  const s = (sc / ma + 1) / 2;
  const t = (tc / ma + 1) / 2;
  return { face, x: s * size - 0.5, y: (1 - t) * size - 0.5 };
}

/** Luminancia relativa lineal → gris sRGB de 8 bits. */
function encodeSrgb(luminance) {
  const c =
    luminance <= 0.0031308
      ? 12.92 * luminance
      : 1.055 * luminance ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

const PEAK_GRAY = (() => {
  let v = encodeSrgb(PEAK_LUMINANCE);
  const lum = (g) => ((g / 255 + 0.055) / 1.055) ** 2.4;
  while (lum(v) > PEAK_LUMINANCE) v -= 1;
  return v;
})();

/** Luminancia de una estrella: pico .45 para Sirio, escala comprimida. */
export const starLuminance = (vmag) =>
  PEAK_LUMINANCE * 10 ** (-MAG_COMPRESSION * (vmag - BRIGHTEST_MAG));

/**
 * Pinta las caras. Cada estrella se reparte bilinealmente en ≤ 2×2 píxeles y
 * su píxel más fuerte lleva su luminancia; los solapes toman el máximo.
 * @returns {{faces: Record<string, Uint8Array>, stats: object}}
 */
export function renderFaces(
  stars,
  { size = 1024, maxMag = MAX_MAGNITUDE, epoch = EPOCH_YEAR } = {},
) {
  const faces = Object.fromEntries(
    FACE_NAMES.map((name) => [name, new Uint8Array(size * size)]),
  );
  let drawn = 0;
  let maxFootprint = 0;
  const sorted = [...stars].sort((a, b) => a.hr - b.hr);
  for (const star of sorted) {
    if (!(star.vmag <= maxMag)) continue;
    const direction = precessJ2000(
      starDirection(star.raDeg, star.decDeg),
      epoch,
    );
    const { face, x, y } = faceCoords(direction, size);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const taps = [
      [x0, y0, (1 - fx) * (1 - fy)],
      [x0 + 1, y0, fx * (1 - fy)],
      [x0, y0 + 1, (1 - fx) * fy],
      [x0 + 1, y0 + 1, fx * fy],
    ];
    const strongest = Math.max(...taps.map(([, , w]) => w));
    const lum = starLuminance(star.vmag);
    const lit = [];
    for (const [px, py, w] of taps) {
      if (px < 0 || py < 0 || px >= size || py >= size) continue;
      const gray = Math.min(PEAK_GRAY, encodeSrgb((lum * w) / strongest));
      if (gray <= 0) continue;
      const i = py * size + px;
      faces[face][i] = Math.max(faces[face][i], gray);
      lit.push([px, py]);
    }
    if (!lit.length) continue;
    drawn += 1;
    const span = (axis) =>
      Math.max(...lit.map((p) => p[axis])) -
      Math.min(...lit.map((p) => p[axis])) +
      1;
    maxFootprint = Math.max(maxFootprint, span(0), span(1));
  }
  return { faces, stats: { drawn, maxFootprint, peakGray: PEAK_GRAY } };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** PNG gris de 8 bits (sin filtros, deflate nivel 9). */
export function encodeGrayPng(gray, size) {
  const raw = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y += 1)
    Buffer.from(gray.buffer, gray.byteOffset + y * size, size).copy(
      raw,
      y * (size + 1) + 1,
    );
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 0; // gris
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function argValue(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

/** Genera public/sky/{px,nx,py,ny,pz,nz}.png e imprime hashes y conteos. */
export async function main(argv = process.argv.slice(2)) {
  const catalogPath = argValue(argv, '--catalog', null);
  const outDir = argValue(argv, '--out', 'public/sky');
  if (!catalogPath)
    throw new Error(
      `uso: eyeinsky-skybox --catalog <catalog.gz> (descárgalo de ${CATALOG_URL})`,
    );
  const gz = await readFile(catalogPath);
  if (sha256(gz) !== CATALOG_SHA256)
    throw new Error(
      `catálogo inesperado: SHA-256 ${sha256(gz)} ≠ ${CATALOG_SHA256}`,
    );
  const stars = parseBsc5(gunzipSync(gz).toString('latin1'));
  const { faces, stats } = renderFaces(stars);
  await mkdir(outDir, { recursive: true });
  const files = {};
  for (const name of FACE_NAMES) {
    const png = encodeGrayPng(faces[name], 1024);
    const file = path.join(outDir, `${name}.png`);
    await writeFile(file, png);
    files[name] = { file, bytes: png.length, sha256: sha256(png) };
  }
  const pixels = sha256(
    Buffer.concat(FACE_NAMES.map((n) => Buffer.from(faces[n]))),
  );
  const report = {
    catalog: { url: CATALOG_URL, sha256: CATALOG_SHA256, rows: stars.length },
    stars: stats.drawn,
    maxMagnitude: MAX_MAGNITUDE,
    epoch: EPOCH_YEAR,
    maxFootprintPx: stats.maxFootprint,
    peakGray: stats.peakGray,
    pixelSha256: pixels,
    totalBytes: Object.values(files).reduce((s, f) => s + f.bytes, 0),
    files,
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  await main();
