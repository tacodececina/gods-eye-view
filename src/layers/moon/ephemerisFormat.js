/**
 * Formato binario de la tabla Chebyshev de la Luna (P5, «EYMOON1»).
 *
 * Cabecera de 144 bytes, little-endian:
 *
 * | off | tipo      | campo                                          |
 * | --- | --------- | ---------------------------------------------- |
 * | 0   | char[8]   | magic `EYMOON1\0`                              |
 * | 8   | u32       | versión (1)                                    |
 * | 12  | u32       | bytes de cabecera (144)                        |
 * | 16  | char[16]  | fuente (`DE441`)                               |
 * | 32  | f64       | t0, s TDB desde J2000                          |
 * | 40  | f64       | t1, s TDB desde J2000                          |
 * | 48  | f64       | segmento, s                                    |
 * | 56  | u32       | orden Chebyshev                                |
 * | 60  | u32       | número de segmentos                            |
 * | 64  | char[32]  | marco, UTF-8 (`ICRF geocéntrico`)              |
 * | 96  | char[8]   | unidades (`km`)                                |
 * | 104 | u32       | bytes de la carga                              |
 * | 108 | u32       | reservado (0)                                  |
 * | 112 | u8[32]    | sha256 de la carga                             |
 *
 * Carga: float32 LE, por segmento X[0..n], Y[0..n], Z[0..n] (n = orden).
 * Segmento s cubre [t0 + s·L, t0 + (s+1)·L]; x = 2(t − ts)/L − 1.
 */

export const MOON_TABLE_MAGIC = 'EYMOON1';
export const MOON_TABLE_VERSION = 1;
export const MOON_TABLE_HEADER_BYTES = 144;
export const MOON_TABLE_MAX_ORDER = 32;

export const HEADER_FIELDS = Object.freeze({
  magic: [0, 8],
  version: 8,
  headerBytes: 12,
  source: [16, 16],
  t0: 32,
  t1: 40,
  segmentSeconds: 48,
  order: 56,
  segmentCount: 60,
  frame: [64, 32],
  units: [96, 8],
  payloadBytes: 104,
  reserved: 108,
  sha256: [112, 32],
});

/** Error tipado de formato: `code` dice qué falló. */
export class MoonEphemerisFormatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MoonEphemerisFormatError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new MoonEphemerisFormatError(code, message);
};

function readText(bytes, [offset, length]) {
  const slice = bytes.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return new TextDecoder().decode(end === -1 ? slice : slice.subarray(0, end));
}

const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return fail('bad-input', 'Se esperaba ArrayBuffer o Uint8Array');
}

function readHeader(bytes) {
  if (bytes.length < MOON_TABLE_HEADER_BYTES)
    fail('truncated', `Cabecera truncada (${bytes.length} B)`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset) => view.getUint32(offset, true);
  const f64 = (offset) => view.getFloat64(offset, true);
  return {
    magic: readText(bytes, HEADER_FIELDS.magic),
    version: u32(HEADER_FIELDS.version),
    headerBytes: u32(HEADER_FIELDS.headerBytes),
    source: readText(bytes, HEADER_FIELDS.source),
    t0: f64(HEADER_FIELDS.t0),
    t1: f64(HEADER_FIELDS.t1),
    segmentSeconds: f64(HEADER_FIELDS.segmentSeconds),
    order: u32(HEADER_FIELDS.order),
    segmentCount: u32(HEADER_FIELDS.segmentCount),
    frame: readText(bytes, HEADER_FIELDS.frame),
    units: readText(bytes, HEADER_FIELDS.units),
    payloadBytes: u32(HEADER_FIELDS.payloadBytes),
    payloadSha256: toHex(bytes.subarray(112, 144)),
  };
}

function checkHeader(header, totalBytes) {
  if (header.magic !== MOON_TABLE_MAGIC)
    fail('bad-magic', `Magic inválido: ${JSON.stringify(header.magic)}`);
  if (header.version !== MOON_TABLE_VERSION)
    fail('bad-version', `Versión no soportada: ${header.version}`);
  if (header.headerBytes !== MOON_TABLE_HEADER_BYTES)
    fail('bad-header', `Cabecera de ${header.headerBytes} B`);
  const { t0, t1, segmentSeconds, order, segmentCount } = header;
  if (!(Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0))
    fail('bad-header', 'Rango t0/t1 inválido');
  if (!(segmentSeconds > 0) || !Number.isFinite(segmentSeconds))
    fail('bad-header', 'Segmento inválido');
  if (!(order >= 1 && order <= MOON_TABLE_MAX_ORDER))
    fail('bad-header', `Orden inválido: ${order}`);
  if (segmentCount !== Math.ceil((t1 - t0) / segmentSeconds))
    fail('bad-header', 'Número de segmentos incoherente con el rango');
  const expected = segmentCount * 3 * (order + 1) * 4;
  if (header.payloadBytes !== expected)
    fail(
      'bad-header',
      `Carga declarada ${header.payloadBytes} B ≠ ${expected}`,
    );
  if (totalBytes !== MOON_TABLE_HEADER_BYTES + expected)
    fail(
      'truncated',
      `Archivo de ${totalBytes} B, se esperaban ${MOON_TABLE_HEADER_BYTES + expected}`,
    );
  if (header.units !== 'km') fail('bad-header', `Unidades ${header.units}`);
}

/**
 * Decodifica y valida la cabecera; no verifica el hash (eso es asíncrono,
 * en ephemeris.js). Los coeficientes float32 se copian a Float64Array.
 */
export function decodeMoonTable(input) {
  const bytes = asBytes(input);
  const header = readHeader(bytes);
  checkHeader(header, bytes.length);
  const payload = bytes.subarray(MOON_TABLE_HEADER_BYTES);
  const view = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  );
  const coefficients = new Float64Array(payload.byteLength / 4);
  for (let i = 0; i < coefficients.length; i += 1)
    coefficients[i] = view.getFloat32(i * 4, true);
  return Object.freeze({ ...header, payload, coefficients });
}

/** Clenshaw de una serie Chebyshev c[base..base+order] en x ∈ [−1, 1]. */
function clenshaw(c, base, order, x) {
  let b1 = 0;
  let b2 = 0;
  const twoX = 2 * x;
  for (let k = order; k >= 1; k -= 1) {
    const b0 = twoX * b1 - b2 + c[base + k];
    b2 = b1;
    b1 = b0;
  }
  return x * b1 - b2 + c[base];
}

/**
 * Posición (km, ICRF geocéntrico) en `tdbSeconds`, escrita en `out`
 * (array o {x,y,z}). No comprueba el rango: el llamador lo hace.
 */
export function evaluateMoonTableKm(table, tdbSeconds, out) {
  const { t0, segmentSeconds, order, segmentCount, coefficients } = table;
  const span = (tdbSeconds - t0) / segmentSeconds;
  const segment = Math.min(segmentCount - 1, Math.max(0, Math.floor(span)));
  const x = 2 * (span - segment) - 1;
  const stride = order + 1;
  const base = segment * 3 * stride;
  const px = clenshaw(coefficients, base, order, x);
  const py = clenshaw(coefficients, base + stride, order, x);
  const pz = clenshaw(coefficients, base + 2 * stride, order, x);
  if (Array.isArray(out)) {
    out[0] = px;
    out[1] = py;
    out[2] = pz;
  } else {
    out.x = px;
    out.y = py;
    out.z = pz;
  }
  return out;
}
