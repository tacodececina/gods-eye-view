/**
 * Composición de la posición lunar de P5: la tabla DE441 manda dentro de su
 * rango; fuera, el respaldo analítico (rotulado, con `toleranceKm` y el rango
 * de la tabla en `tableRange`); sin respaldo, `out-of-range` (opción a); sin
 * nada cargado, `unavailable`.
 */

const UNAVAILABLE = Object.freeze({ status: 'unavailable' });

/**
 * @param {{table: object|null, fallback: object|null}} sources Tabla de
 *   loadMoonEphemeris y respaldo de createMoonFallback (cualquiera puede faltar).
 * @returns {(tdbSeconds: number, result: {x,y,z}) => object}
 */
export function createMoonPosition({ table = null, fallback = null } = {}) {
  const tableRange = table
    ? Object.freeze({
        validFrom: table.validFrom,
        validTo: table.validTo,
        source: table.source,
      })
    : null;
  return (tdbSeconds, result) => {
    if (table) {
      const sample = table.moonPositionIcrf(tdbSeconds, result);
      if (sample.status === 'ok' || !fallback) return sample;
    }
    if (!fallback) return UNAVAILABLE;
    const sample = fallback.moonPositionIcrf(tdbSeconds, result);
    return tableRange ? { ...sample, tableRange } : sample;
  };
}
