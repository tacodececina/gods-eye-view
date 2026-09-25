/**
 * Escala de la Luna 3D (P5 T6, propuesta §5). El modo físico es el de por
 * defecto y el único medible. El didáctico SOLO multiplica el radio ×10:
 * posición, dirección, distancia y fase siguen saliendo de la efeméride. Lleva
 * banda rotulada, `measurable=false` y `validatedAgainst=null`.
 */

export const DEFAULT_MOON_SCALE_MODE = 'physical';
export const DIDACTIC_BAND_TEXT = 'ESCALA DIDÁCTICA · LUNA ×10 · NO ES REAL';

export const MOON_SCALE_MODES = Object.freeze({
  physical: Object.freeze({
    id: 'physical',
    radiusFactor: 1,
    measurable: true,
    validatedAgainst: 'NASA/JPL Horizons DE441',
    band: null,
  }),
  didactic: Object.freeze({
    id: 'didactic',
    radiusFactor: 10,
    measurable: false,
    validatedAgainst: null,
    band: DIDACTIC_BAND_TEXT,
  }),
});

/** Modo por id ('physical' si no se da); TypeError si no existe. */
export function resolveMoonScaleMode(id = DEFAULT_MOON_SCALE_MODE) {
  const mode = Object.hasOwn(MOON_SCALE_MODES, id)
    ? MOON_SCALE_MODES[id]
    : null;
  if (!mode) throw new TypeError(`Modo de escala lunar desconocido: ${id}`);
  return mode;
}
