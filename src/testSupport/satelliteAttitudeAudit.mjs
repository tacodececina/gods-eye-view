/**
 * P4-21 — auditoría de actitud sobre lo que la capa PUBLICA (no una copia):
 * el registro del store de contexto, lo que la voz compacta de él y el
 * contexto que el expediente/dock construye. La actitud es un rótulo; ningún
 * número, cuaternión ni ángulo puede colarse bajo ninguna clave.
 *
 * Devuelve la lista de violaciones en lugar de afirmar, para que las pruebas
 * puedan comprobar también que un número inyectado SÍ se detecta.
 */
import * as Cesium from 'cesium';
import { SATELLITE_CONTEXT_KEYS } from '../layers/satellites/contextFields.js';
import { summarizeContextRecord } from '../voice/gevActions.js';

export const ATTITUDE_LABELS = Object.freeze([
  'lvlh-nominal-aprox',
  'desconocida',
  'n/a',
]);
const ATTITUDE_KEY =
  /attitude|actitud|quaternion|orientation|pitch|yaw|roll|euler/i;
const FORBIDDEN_KEY = /quaternion|pitch|yaw|roll|euler/i;
const QUATERNION_TEXT = /-?\d+(?:\.\d+)?(?:\s*[, ]\s*-?\d+(?:\.\d+)?){3}/;
const ANGLE_TEXT = /-?\d+(?:[.,]\d+)?\s*(?:°|deg|rad)\b/i;

/** Satélites de la escena: con activo específico, de familia y sin modelo. */
export const ATTITUDE_SUBJECTS = Object.freeze([
  { noradId: 25544, name: 'ISS (ZARYA)', group: 'stations', asset: true },
  { noradId: 20580, name: 'HST', group: 'visual', asset: true },
  { noradId: 43000, name: 'CUBE-1U', group: 'cubesat', asset: true },
  { noradId: 24876, name: 'GPS BIIR-2', group: 'gps-ops', asset: false },
]);

/** Filas `others` de la escena para todos los sujetos salvo la ISS. */
export function attitudeSubjectRows() {
  return ATTITUDE_SUBJECTS.filter((row) => row.noradId !== 25544).map(
    (row) => ({
      ...row,
      point: {
        position: Cesium.Cartesian3.fromDegrees(-97.6, 30.2, 540_000),
        show: true,
      },
    }),
  );
}

/** Pares clave/valor con número de actitud o clave prohibida. */
function entryViolations(where, entries) {
  const out = [];
  for (const [key, value] of entries) {
    const text = String(value ?? '');
    if (FORBIDDEN_KEY.test(String(key))) out.push(`${where}: clave ${key}`);
    if (ATTITUDE_KEY.test(String(key)) && /\d/.test(text))
      out.push(`${where}: ${key}=${text}`);
    if (QUATERNION_TEXT.test(text) && ATTITUDE_KEY.test(String(key)))
      out.push(`${where}: cuaternión en ${key}`);
  }
  return out;
}

/**
 * @param {string} where Etiqueta del caso.
 * @param {object|null} record Registro del store de contexto.
 * @param {object|null} [dossierContext] Contexto que publicó el expediente.
 * @returns {string[]} Violaciones (vacío = limpio).
 */
export function attitudeViolations(where, record, dossierContext = null) {
  if (!record?.properties) return [`${where}: sin registro publicado`];
  const out = [];
  const keys = Object.keys(record.properties);
  if (keys.join('|') !== SATELLITE_CONTEXT_KEYS.join('|'))
    out.push(`${where}: claves fuera de la lista blanca (${keys})`);
  if (!ATTITUDE_LABELS.includes(record.properties.attitude))
    out.push(`${where}: actitud no es rótulo (${record.properties.attitude})`);
  out.push(
    ...entryViolations(`${where}/store`, Object.entries(record.properties)),
  );
  const voice = summarizeContextRecord(record, { includeProperties: true });
  out.push(
    ...entryViolations(`${where}/voz`, Object.entries(voice.properties)),
  );
  if (ANGLE_TEXT.test(JSON.stringify(record.properties)))
    out.push(`${where}: texto de ángulo en el registro`);
  if (dossierContext) {
    const fields = (dossierContext.fields ?? []).flatMap((field) => [
      [field.key, field.value],
      [field.label, field.value],
      [field.key, field.code],
    ]);
    out.push(...entryViolations(`${where}/expediente`, fields));
    if (ANGLE_TEXT.test(JSON.stringify(dossierContext)))
      out.push(`${where}: texto de ángulo en el expediente`);
  }
  return out;
}

/**
 * Recorre un sujeto por órbita/inspección × estados del modelo con la capa
 * real y entrega cada lectura a `onRead(label, record)`.
 * @param {object} s Escena (satelliteTrackingScene.scene()).
 * @param {object} layer Módulo de la capa.
 * @param {object} subject Fila de ATTITUDE_SUBJECTS.
 * @param {'resolve'|'reject'} settle Cómo termina la carga del modelo.
 * @param {(label: string) => void} onRead Lectura tras cada paso.
 * @param {() => void} frame Avanza un frame de la capa.
 */
export async function walkAttitudeSubject(
  s,
  layer,
  subject,
  settle,
  onRead,
  frame,
) {
  const loadsBefore = s.loads.length;
  if (!layer.trackById(subject.noradId, { origin: 'user' }))
    throw new Error(`no se pudo seguir ${subject.noradId}`);
  await onRead('selected');
  frame();
  for (const framing of ['orbit', 'inspect']) {
    layer.setTrackedFraming(framing, { reducedMotion: true });
    await onRead(`${framing}/antes`);
  }
  for (const load of s.loads.slice(loadsBefore)) await load[settle]();
  frame();
  for (const framing of ['inspect', 'orbit']) {
    layer.setTrackedFraming(framing, { reducedMotion: true });
    await onRead(`${framing}/${settle}`);
  }
}
