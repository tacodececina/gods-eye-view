/**
 * Modelo puro de la Luna en el Mission Dock (P5 T8).
 *
 * Compone lo que publica la capa Luna (`layers/moon` getState()): no calcula
 * efemérides ni inventa un valor ausente. Tres piezas:
 *   - acciones (APUNTAR, SISTEMA TIERRA–LUNA, ESCALA, VOLVER A TIERRA), cada
 *     una deshabilitada CON motivo cuando no puede ejecutarse;
 *   - el contexto del panel OBJETIVO Luna para el expediente P3;
 *   - la retícula de tamaño fijo (px), que NO representa el tamaño de la Luna.
 */

export const MOON_CONTEXT_KEY = 'moon:eyeinsky-moon';
export const RETICLE_LEGEND = 'RETÍCULA ≠ TAMAÑO';
const DE441_LINE = 'JPL DE441 · geométrico · ICRF→ITRF';
const FALLBACK_LINE = 'astronomy-engine ≤20 km · modelo analítico';
const J2000_UNIX_S = Date.UTC(2000, 0, 1, 12) / 1000;
const SECONDS_PER_YEAR = 365.25 * 86_400;

/** Motivo por el que la Luna no se puede apuntar/encuadrar, o null. */
function unavailableReason(moon) {
  if (!moon?.enabled) return 'Capa Luna apagada';
  if (moon.status === 'ok') return null;
  if (moon.status === 'out-of-range') return 'Fecha fuera de rango';
  if (moon.reason === 'frame') return 'Marco no disponible';
  if (moon.reason === 'loading') return 'Cargando efeméride';
  return 'Efeméride no disponible';
}

/** Rótulo corto para pantallas estrechas o con zoom (el nombre accesible es el largo). */
const SHORT_LABELS = Object.freeze({
  'aim-moon': 'APUNTAR',
  'earth-moon-system': 'SISTEMA',
  'return-to-earth': 'VOLVER',
});

const action = (id, label, enabled, hint, pressed = false) =>
  Object.freeze({
    id,
    label,
    short:
      SHORT_LABELS[id] ?? (label === 'ESCALA FÍSICA' ? 'FÍSICA' : 'LUNA ×10'),
    enabled,
    pressed,
    hint,
  });

/**
 * @param {{moon: object, returnPending?: boolean}} options
 * @returns {ReadonlyArray<Readonly<object>>} Acciones en su orden fijo.
 */
export function resolveMoonActions({ moon, returnPending = false } = {}) {
  const reason = unavailableReason(moon);
  const didactic = moon?.scaleMode === 'didactic';
  return Object.freeze([
    action(
      'aim-moon',
      'APUNTAR A LA LUNA',
      !reason,
      reason ?? 'Reorienta la cámara hacia la Luna sin moverla',
    ),
    action(
      'earth-moon-system',
      'SISTEMA TIERRA–LUNA',
      !reason,
      reason ?? 'Encuadra la Tierra y la Luna con el FOV mínimo',
    ),
    action(
      'moon-scale',
      didactic ? 'ESCALA FÍSICA' : 'ESCALA DIDÁCTICA',
      Boolean(moon?.enabled),
      didactic
        ? 'Vuelve a la escala real (la única medible)'
        : 'Luna ×10: no es real, solo para verla',
      didactic,
    ),
    action(
      'return-to-earth',
      'VOLVER A TIERRA',
      returnPending,
      returnPending
        ? 'Restaura cámara, capas, selección y seguimiento'
        : 'Nada que restaurar',
    ),
  ]);
}

/** Número con coma decimal y espacio de miles (sin depender del locale). */
function formatNumber(value, digits) {
  const [whole, fraction] = Math.abs(value).toFixed(digits).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = value < 0 ? '−' : '';
  return fraction ? `${sign}${grouped},${fraction}` : `${sign}${grouped}`;
}

/** Año UTC aproximado de s TDB desde J2000 (para rótulos de validez). */
const yearOf = (tdbSeconds) =>
  new Date((J2000_UNIX_S + tdbSeconds) * 1000).getUTCFullYear();

function validityText(validity) {
  if (!Number.isFinite(validity?.validFrom)) return null;
  return `válido ${yearOf(validity.validFrom)}–${yearOf(validity.validTo - SECONDS_PER_YEAR / 2)} TDB`;
}

function epochText(moon) {
  if (!moon?.epochIso) return null;
  const utc = `${moon.epochIso.slice(0, 10)} ${moon.epochIso.slice(11, 19)} UTC`;
  return Number.isFinite(moon.tdbMinusUtcS)
    ? `${utc} · TDB = UTC + ${formatNumber(moon.tdbMinusUtcS, 2)} s`
    : utc;
}

function subLunarText({ lonDeg, latDeg }) {
  const lat = `${formatNumber(Math.abs(latDeg), 2)}° ${latDeg < 0 ? 'S' : 'N'}`;
  const lon = `${formatNumber(Math.abs(lonDeg), 2)}° ${lonDeg < 0 ? 'O' : 'E'}`;
  return `${lat} · ${lon} (con tiempo de luz)`;
}

function scaleText(moon) {
  return moon.scaleMode === 'didactic'
    ? 'DIDÁCTICA ×10 · NO ES REAL (no medible)'
    : 'física (medible)';
}

/** Campos medidos (solo con estado «ok»). */
function measuredFields(moon) {
  return [
    {
      label: 'DISTANCIA',
      value: formatNumber(moon.distanceKm, 0),
      unit: 'km',
    },
    { label: 'LUZ', value: formatNumber(moon.lightSeconds, 3), unit: 's-luz' },
    {
      label: 'FASE',
      value: `${moon.phaseName} · ${formatNumber(moon.phaseFraction * 100, 1)} %`,
    },
    {
      label: 'DIÁMETRO APARENTE',
      value: `${formatNumber(moon.apparentDiameterDeg, 3)}° · ${formatNumber(moon.apparentDiameterDeg * 60, 1)}′`,
    },
    { label: 'PUNTO SUBLUNAR', value: subLunarText(moon.subLunarLonLat) },
    { label: 'ÉPOCA', value: epochText(moon) },
    { label: 'ORIENTACIÓN', value: moon.orientation },
    { label: 'ESCALA', value: scaleText(moon) },
  ];
}

const ABSENT_TITLES = Object.freeze({
  'out-of-range': 'Luna · SIN EFEMÉRIDES',
  frame: 'Luna · SIN MARCO',
  loading: 'Luna · CARGANDO',
});

/** Contexto de la ausencia: lo que se sabe, nada más. */
function absentContext(moon) {
  const title =
    ABSENT_TITLES[moon?.status] ??
    ABSENT_TITLES[moon?.reason] ??
    'Luna · SIN EFEMÉRIDE';
  const fields = [
    { label: 'VALIDEZ', value: validityText(moon?.validity) },
    { label: 'ÉPOCA', value: epochText(moon) },
  ].filter((field) => field.value);
  return { title, status: 'missing', fields };
}

/**
 * Contexto crudo del panel OBJETIVO Luna (lo normaliza el expediente).
 * @param {object} moon Estado de la capa Luna.
 * @returns {object} Contexto.
 */
export function buildMoonContext(moon) {
  const ok = moon?.status === 'ok' && Number.isFinite(moon.distanceKm);
  const body = ok
    ? { title: 'Luna', status: 'computed', fields: measuredFields(moon) }
    : absentContext(moon);
  return {
    key: MOON_CONTEXT_KEY,
    kind: 'moon',
    layerId: 'moon',
    stableId: 'eyeinsky-moon',
    source: moon?.source === 'astronomy-engine' ? FALLBACK_LINE : DE441_LINE,
    ...body,
  };
}

/** Punto del borde (con margen) en la dirección (dx, dy) desde el centro. */
function edgePoint({ width, height, margin, dx, dy }) {
  const cx = width / 2;
  const cy = height / 2;
  const sx = dx === 0 ? Infinity : (cx - margin) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (cy - margin) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: Math.round(cx + dx * s), y: Math.round(cy + dy * s) };
}

/**
 * Retícula de TAMAÑO FIJO: sobre la Luna si se proyecta dentro del lienzo; si
 * no (fuera o detrás de la cámara), flecha en el borde (con `margin`) hacia
 * (dx, dy). La leyenda se alinea hacia dentro cerca de un borde.
 * @param {{width:number, height:number, margin:number,
 *   point:{x:number,y:number}|null, dx:number, dy:number}} input
 */
/** Media anchura de la leyenda: cerca de un borde se alinea hacia dentro. */
const LEGEND_HALF_PX = 90;

function legendAlign(x, width) {
  if (x < LEGEND_HALF_PX) return 'start';
  return x > width - LEGEND_HALF_PX ? 'end' : 'center';
}

export function resolveMoonReticle({ width, height, margin, point, dx, dy }) {
  const inside =
    point &&
    point.x >= 0 &&
    point.x <= width &&
    point.y >= 0 &&
    point.y <= height;
  if (inside) {
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    return {
      mode: 'on',
      x,
      y,
      angleDeg: 0,
      legendAlign: legendAlign(x, width),
    };
  }
  if (!dx && !dy) return { mode: 'hidden', x: 0, y: 0, angleDeg: 0 };
  const edge = edgePoint({ width, height, margin, dx, dy });
  const angleDeg = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
  return { mode: 'edge', ...edge, angleDeg };
}
