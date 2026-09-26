/**
 * Flags de escena y piel de la fase visual (plan §2.1). Un único parser puro:
 * `?skin=editorial|legacy` y `?globe=editorial|legacy`, que resuelve las
 * piezas del globo salvo que la URL fije una pieza concreta. Valores
 * desconocidos caen al defecto; nunca lanza y no expone claves ajenas.
 */

export const GLOBE_FLAG_DEFAULTS = Object.freeze({
  skin: 'editorial',
  globe: 'legacy',
  lighting: null,
  nightLights: null,
  stars: null,
  homePose: null,
  intro: null,
  satStyle: null,
  satLabels: null,
});

/** Valores válidos y la resolución de cada pieza según el interruptor maestro. */
const PIECES = Object.freeze({
  lighting: { values: ['0', '1'], editorial: '1', legacy: '0' },
  nightLights: { values: ['0', '1'], editorial: '1', legacy: '0' },
  stars: { values: ['sober', 'tycho'], editorial: 'sober', legacy: 'tycho' },
  homePose: {
    values: ['solar', 'tilt', 'legacy'],
    editorial: 'solar',
    legacy: 'legacy',
  },
  intro: { values: ['0', '1'], editorial: '1', legacy: '0' },
  satStyle: {
    values: ['editorial', 'legacy'],
    editorial: 'editorial',
    legacy: 'legacy',
  },
  satLabels: {
    values: ['intent', 'legacy'],
    editorial: 'intent',
    legacy: 'legacy',
  },
});
const SWITCHES = Object.freeze(['editorial', 'legacy']);

function parseSearch(search) {
  try {
    return new URLSearchParams(String(search ?? ''));
  } catch {
    return new URLSearchParams();
  }
}

const pick = (params, key, values, fallback) => {
  const value = params.get(key);
  return values.includes(value) ? value : fallback;
};

/**
 * @param {string} [search] `location.search` (con o sin `?`).
 * @param {typeof GLOBE_FLAG_DEFAULTS} [defaults] Defectos (promoción T6).
 * @returns {Readonly<Record<string,string>>} Flags resueltos, sin null.
 */
export function readGlobeFlags(search = '', defaults = GLOBE_FLAG_DEFAULTS) {
  const params = parseSearch(search);
  const skin = pick(params, 'skin', SWITCHES, defaults.skin ?? 'editorial');
  const globe = pick(params, 'globe', SWITCHES, defaults.globe ?? 'legacy');
  const pieces = Object.fromEntries(
    Object.entries(PIECES).map(([key, piece]) => {
      const inherited = params.has('globe')
        ? piece[globe]
        : (defaults[key] ?? piece[globe]);
      return [key, pick(params, key, piece.values, inherited)];
    }),
  );
  return Object.freeze({ skin, globe, ...pieces });
}

/**
 * Apariencia de `#scope-mask` para cada piel: la Editorial no pinta velo ni
 * ojo de cerradura (§9, «la Tierra es lo único que brilla»); legacy conserva
 * el velo mineral Iris.
 * @param {string} [skin]
 * @returns {'editorial'|'iris'}
 */
export function scopeAppearanceForSkin(skin) {
  return skin === 'legacy' ? 'iris' : 'editorial';
}
