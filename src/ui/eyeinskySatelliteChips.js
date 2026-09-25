/**
 * Lectura honesta del satélite seguido (EYEINSKY P4 T5/T6), pura.
 *
 * Compone, desde los campos que la capa ya publicó (`key`/`code`), tres cosas
 * que el expediente y el dock pintan: los chips de procedencia del panel
 * OBJETIVO, el riel compacto ALT · ÉPOCA · MODELO y la acción INSPECCIONAR /
 * ÓRBITA. No inventa nada: sin campo no hay chip, y una acción imposible se
 * devuelve deshabilitada con su motivo.
 */

/** Familias de geometría con nombre legible (id del activo del manifiesto). */
const FAMILY_NAMES = Object.freeze({ 'nasa-cubesat-1u': 'CUBESAT 1U' });

const AGE_TONES = Object.freeze({
  vigente: 'ok',
  envejecida: 'warn',
  futura: 'warn',
  caducada: 'danger',
});

/**
 * @param {object|null} context Contexto normalizado.
 * @returns {boolean} True para el satélite seguido con campos P4.
 */
export function isSatelliteContext(context) {
  return (
    context?.layerId === 'satellites' &&
    (context?.fields ?? []).some((field) => field.key === 'framing')
  );
}

/** Valor crudo (`code`) de un campo, o null. */
function codeOf(context, key) {
  const field = (context?.fields ?? []).find((entry) => entry.key === key);
  return field?.code ?? field?.value ?? null;
}

/** Valor visible de un campo, o null. */
function valueOf(context, key) {
  return (context?.fields ?? []).find((entry) => entry.key === key)?.value;
}

const chip = (id, text, tone = 'info') => Object.freeze({ id, text, tone });

/** Procedencia de la caché del proxy, en español (código crudo → chip). */
const CACHE_CHIPS = Object.freeze({
  HIT: ['ACIERTO', 'info'],
  MISS: ['FALLO', 'info'],
  'STALE-ERROR': ['OBSOLETA', 'warn'],
  NONE: ['SIN INFORME', 'muted'],
});

/** Chip CACHÉ; un código desconocido se muestra tal cual, sin inventar. */
function cacheChip(code) {
  const [text, tone] = CACHE_CHIPS[code] ?? [code, 'info'];
  return chip('cache', `CACHÉ · ${text}`, tone);
}

/** SGP4 no dio posición para el seguido (P4-20): no hay pose ni modelo. */
const propagationFailed = (context) => context?.status === 'propagation-failed';

/** Chip MODELO: específico, familia o punto; la órbita caducada manda. */
function modelChip(context) {
  if (propagationFailed(context))
    return chip('model', 'SIN MODELO — propagación falló', 'danger');
  if (codeOf(context, 'elementAge') === 'caducada')
    return chip('model', 'SIN MODELO — órbita caducada', 'danger');
  const fidelity = codeOf(context, 'geometryFidelity');
  const assetId = codeOf(context, 'modelAsset') ?? '';
  if (fidelity === 'specific')
    return chip(
      'model',
      assetId.startsWith('nasa-')
        ? 'MODELO · ESPECÍFICO · NASA'
        : 'MODELO · ESPECÍFICO',
    );
  if (fidelity === 'family')
    return chip(
      'model',
      `MODELO · FAMILIA ${FAMILY_NAMES[assetId] ?? ''}`.trim(),
    );
  return chip('model', 'SIN MODELO — punto SGP4', 'muted');
}

/** Chip de actitud: siempre rótulo, nunca número. */
function attitudeChip(context) {
  const attitude = codeOf(context, 'attitude');
  if (attitude === 'lvlh-nominal-aprox') return chip('attitude', 'ACT. APROX.');
  if (attitude === 'desconocida')
    return chip('attitude', 'ACT. DESCONOCIDA', 'muted');
  return null;
}

/**
 * Chips monoespaciados del panel OBJETIVO.
 * @param {object|null} context Contexto normalizado.
 * @returns {ReadonlyArray<Readonly<{id:string, text:string, tone:string}>>}
 */
export function resolveSatelliteChips(context) {
  if (!isSatelliteContext(context)) return Object.freeze([]);
  const chips = [modelChip(context)];
  // Sin pose válida (P4-20) no hay modelo dibujado: ni escala ni actitud.
  const posed = !propagationFailed(context);
  if (posed && codeOf(context, 'visualScale') === 'real')
    chips.push(chip('scale', 'ESCALA REAL'));
  const attitude = posed ? attitudeChip(context) : null;
  if (attitude) chips.push(attitude);
  const age = codeOf(context, 'elementAge');
  if (age)
    chips.push(
      chip('epoch', `ÉPOCA · ${age.toUpperCase()}`, AGE_TONES[age] ?? 'info'),
    );
  const cache = codeOf(context, 'cacheStatus');
  if (cache) chips.push(cacheChip(cache));
  if (codeOf(context, 'modelStatus') === 'fallido')
    chips.push(chip('model-failed', 'MODELO NO DISPONIBLE', 'danger'));
  return Object.freeze(chips);
}

/**
 * Palabra corta del modelo para el riel compacto: abreviada (≤ 10 signos)
 * para que en un teléfono de 390 px nunca se recorte con puntos suspensivos.
 */
function railModel(context) {
  if (propagationFailed(context)) return 'SIN MODELO';
  if (codeOf(context, 'modelStatus') === 'fallido') return 'NO DISP.';
  if (codeOf(context, 'elementAge') === 'caducada') return 'SIN MODELO';
  const fidelity = codeOf(context, 'geometryFidelity');
  if (fidelity === 'specific') return 'ESPECÍF.';
  if (fidelity === 'family') return 'FAMILIA';
  return 'SIN MODELO';
}

/**
 * Riel compacto del satélite: ALT · ÉPOCA · MODELO, con lo que se sabe.
 * @param {object|null} context Contexto normalizado.
 * @returns {ReadonlyArray<Readonly<{label:string, value:string, unit:null}>>|null}
 *   Null fuera del satélite seguido.
 */
export function resolveSatelliteRail(context) {
  if (!isSatelliteContext(context)) return null;
  const items = [
    ['ALT', valueOf(context, 'altitude')],
    ['ÉPOCA', codeOf(context, 'elementAge')],
    ['MODELO', railModel(context)],
  ]
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([label, value]) => Object.freeze({ label, value, unit: null }));
  return Object.freeze(items);
}

/**
 * Acción INSPECCIONAR / ÓRBITA del satélite seguido.
 * @param {object|null} context Contexto normalizado.
 * @returns {Readonly<{label:string, enabled:boolean, pressed:boolean, hint:string}>|null}
 *   Null fuera del satélite seguido (la acción no existe para otras capas).
 */
export function resolveInspectAction(context) {
  if (context?.kind !== 'tracked' || !isSatelliteContext(context)) return null;
  const make = (label, enabled, hint) =>
    Object.freeze({ label, enabled, pressed: false, hint });
  if (codeOf(context, 'framing') === 'inspect')
    return make(
      'Órbita',
      true,
      'Vuelve al encuadre orbital sin soltar el objetivo',
    );
  if (propagationFailed(context))
    return make(
      'Inspeccionar',
      false,
      'Propagación falló: sin posición ni modelo',
    );
  if (codeOf(context, 'elementAge') === 'caducada')
    return make(
      'Inspeccionar',
      false,
      'Órbita caducada: sin modelo, solo punto SGP4',
    );
  if (
    codeOf(context, 'geometryFidelity') !== 'specific' &&
    codeOf(context, 'geometryFidelity') !== 'family'
  )
    return make('Inspeccionar', false, 'Sin modelo curado: solo punto');
  if (codeOf(context, 'modelStatus') === 'fallido')
    return make(
      'Inspeccionar',
      false,
      'Modelo no disponible: se conserva el punto',
    );
  return make('Inspeccionar', true, 'Acerca la cámara al modelo a escala real');
}
