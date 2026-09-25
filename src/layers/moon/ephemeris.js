import {
  MoonEphemerisFormatError,
  decodeMoonTable,
  evaluateMoonTableKm,
} from './ephemerisFormat.js';

/**
 * Efeméride lunar de P5: tabla Chebyshev EYMOON1 generada desde JPL Horizons
 * DE441 (scripts/eyeinsky-moon-ephemeris.mjs). Posición geocéntrica ICRF,
 * geométrica, en km, en función de segundos TDB desde J2000.
 */

export { MoonEphemerisFormatError };

/** Fallo de transporte al pedir la tabla (HTTP, red). */
export class MoonEphemerisLoadError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = 'MoonEphemerisLoadError';
  }
}

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');

async function fetchBytes(url, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url);
  } catch (error) {
    throw new MoonEphemerisLoadError(`No se pudo pedir ${url}`, {
      cause: error,
    });
  }
  if (!response.ok)
    throw new MoonEphemerisLoadError(`HTTP ${response.status} al pedir ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function verifyPayload(table, subtle) {
  if (!subtle?.digest)
    throw new MoonEphemerisFormatError(
      'no-crypto',
      'Sin crypto.subtle para verificar el hash',
    );
  const digest = toHex(await subtle.digest('SHA-256', table.payload));
  if (digest !== table.payloadSha256)
    throw new MoonEphemerisFormatError(
      'bad-hash',
      'El sha256 de la carga no coincide con la cabecera',
    );
}

function createEphemeris(table) {
  const { t0: validFrom, t1: validTo, source } = table;
  const outOfRange = Object.freeze({
    status: 'out-of-range',
    validFrom,
    validTo,
    source,
  });
  /**
   * Posición ICRF (km) en `result` ({x,y,z}) para `tdbSeconds` s TDB desde J2000.
   * @returns {{status:'ok', position, validFrom, validTo, source} | {status:'out-of-range', validFrom, validTo, source}}
   */
  const moonPositionIcrf = (tdbSeconds, result) => {
    if (!Number.isFinite(tdbSeconds))
      throw new TypeError('tdbSeconds debe ser finito');
    if (tdbSeconds < validFrom || tdbSeconds > validTo) return outOfRange;
    evaluateMoonTableKm(table, tdbSeconds, result);
    return { status: 'ok', position: result, validFrom, validTo, source };
  };
  return Object.freeze({
    source,
    frame: table.frame,
    units: table.units,
    validFrom,
    validTo,
    segmentSeconds: table.segmentSeconds,
    order: table.order,
    payloadSha256: table.payloadSha256,
    moonPositionIcrf,
  });
}

/**
 * Pide, decodifica y verifica (sha256 con crypto.subtle) la tabla.
 * Lanza MoonEphemerisLoadError (transporte) o MoonEphemerisFormatError
 * (`code`: bad-magic, bad-version, bad-header, truncated, bad-hash...).
 */
export async function loadMoonEphemeris(
  url,
  {
    fetch: fetchImpl = globalThis.fetch,
    subtle = globalThis.crypto?.subtle,
  } = {},
) {
  const bytes = await fetchBytes(url, fetchImpl);
  const table = decodeMoonTable(bytes);
  await verifyPayload(table, subtle);
  return createEphemeris(table);
}
