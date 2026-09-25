import { parseUtcIso, tdbMinusUtcSeconds } from '../../time/timeScales.js';
import { getViewerSceneClock } from '../../time/sceneClock.js';
import { celestialFor } from './celestialService.js';
import { createMoonLifecycle } from './lifecycle.js';
import { MOON_ORIENTATION_LABEL, computeMoonModelMatrix } from './pose.js';
import { MOON_PLACEHOLDER_URI, createMoonPrimitive } from './primitive.js';
import { createScaleBand } from './scaleBand.js';
import { resolveMoonScaleMode } from './scaleMode.js';
import { createMoonTexture } from './texture.js';
import { moonDiameterPx } from './textureBudget.js';

/**
 * Capa «Luna» de P5 (T6): host al estilo de satellites/modelsHost. Une el
 * servicio celeste compartido (DE441, marco XYS), la pose por fotograma en
 * `scene.preUpdate` (con el `time` del evento), el ciclo de vida medido y la
 * escala física/didáctica. No es un feed: nada en vivo, sin sondeo.
 */

/** Atribución en el panel de créditos mientras la Luna está encendida. */
export const MOON_CREDIT = Object.freeze({
  key: 'jpl-horizons-de441',
  html: 'Moon position: NASA/JPL Horizons, DE441 (computed ephemeris, not live).',
});

const NO_CREDITS = Object.freeze({ register() {}, unregister() {} });

/** Motivo de la PAUSA al cruzar el rango sin respaldo (P5-09). */
export const MOON_OUT_OF_RANGE_PAUSE = 'fuera de efemérides';

/**
 * P5-09: simulando, una época fuera de la tabla que el respaldo tampoco cubre
 * pausa el reloj con motivo (la ausencia se ve; nunca se avanza a ciegas).
 */
function guardRange(host, state) {
  if (state.status !== 'out-of-range' || state.reason !== 'no-fallback') return;
  if (host.sceneClock?.getState().mode === 'simulated')
    host.sceneClock.pause(MOON_OUT_OF_RANGE_PAUSE);
}

const plain = (v) => ({ x: v.x, y: v.y, z: v.z });
const MOON_RADIUS_M = 1_737_400;

/** Campos escalares del estado celeste que la capa publica. */
const FRAME_FIELDS = Object.freeze([
  'epochIso',
  'source',
  'distanceKm',
  'lightSeconds',
  'phaseFraction',
  'phaseName',
  'apparentDiameterDeg',
]);

/** Registro PROPIO del último fotograma (el del servicio es compartido). */
function createFrameRecord() {
  return {
    ...Object.fromEntries(FRAME_FIELDS.map((key) => [key, null])),
    validity: null,
    subLunarLonLat: { lonDeg: Number.NaN, latDeg: Number.NaN },
  };
}

/**
 * Copia en `frame` lo que publica getState(): el resultado del servicio
 * celeste es UN objeto compartido que cualquier otra lectura (HUD, anillo,
 * debugAt) reescribe. Sin asignaciones por fotograma.
 */
function copyFrame(frame, state) {
  for (const key of FRAME_FIELDS) frame[key] = state[key];
  frame.validity = state.validity;
  frame.subLunarLonLat.lonDeg = state.subLunarLonLat.lonDeg;
  frame.subLunarLonLat.latDeg = state.subLunarLonLat.latDeg;
}

function createHostState() {
  return {
    viewer: null,
    lifecycle: null,
    celestial: null,
    band: null,
    sceneClock: null,
    texture: null,
    mode: resolveMoonScaleMode(),
    last: {
      status: 'disabled',
      reason: null,
      position: null,
      frame: createFrameRecord(),
    },
  };
}

/** Pose de un fotograma: la Luna física solo si el estado es «ok». */
function poseFrame(host, primitive, time) {
  const state = host.celestial.at(time);
  host.last.status = state.status;
  host.last.reason = state.reason;
  copyFrame(host.last.frame, state);
  if (state.status !== 'ok') {
    primitive.show = false;
    host.last.position = null;
    guardRange(host, state);
    return;
  }
  computeMoonModelMatrix(
    {
      julianDate: time,
      icrfToFixed: state.icrfToFixed,
      moonFixedM: state.moonFixedM,
      scale: host.mode.radiusFactor,
    },
    primitive.modelMatrix,
  );
  primitive.show = true;
  host.last.position = plain(state.moonFixedM);
  host.texture?.frame(primitive, screenDiameterPx(host, state.moonFixedM));
}

/** Diámetro de la Luna en px CSS desde la cámara (NaN sin cámara). */
function screenDiameterPx(host, moonFixedM) {
  const camera = host.viewer?.camera;
  const canvas = host.viewer?.scene?.canvas;
  if (!camera?.positionWC || !canvas) return Number.NaN;
  const p = camera.positionWC;
  return moonDiameterPx({
    distanceM: Math.hypot(
      moonFixedM.x - p.x,
      moonFixedM.y - p.y,
      moonFixedM.z - p.z,
    ),
    radiusM: MOON_RADIUS_M * host.mode.radiusFactor,
    fovyRad: camera.frustum.fovy,
    heightPx: canvas.clientHeight,
  });
}

function snapshot(host) {
  const enabled = host.lifecycle?.isEnabled() === true;
  const s = enabled && host.last.status === 'ok' ? host.last.frame : null;
  return {
    enabled,
    status: enabled ? host.last.status : 'disabled',
    reason: enabled ? host.last.reason : null,
    positionFixedM: enabled ? host.last.position : null,
    epochIso: s?.epochIso ?? null,
    tdbMinusUtcS: s?.epochIso
      ? tdbMinusUtcSeconds(parseUtcIso(s.epochIso))
      : null,
    source: s?.source ?? null,
    validity: enabled ? (host.last.frame.validity ?? null) : null,
    distanceKm: s?.distanceKm ?? null,
    lightSeconds: s?.lightSeconds ?? null,
    phaseFraction: s?.phaseFraction ?? null,
    phaseName: s?.phaseName ?? null,
    subLunarLonLat: s ? { ...s.subLunarLonLat } : null,
    apparentDiameterDeg: s?.apparentDiameterDeg ?? null,
    scaleMode: host.mode.id,
    radiusFactor: host.mode.radiusFactor,
    measurable: host.mode.measurable,
    validatedAgainst: host.mode.validatedAgainst,
    band: enabled ? host.mode.band : null,
    orientation: MOON_ORIENTATION_LABEL,
    texture: host.texture?.state() ?? 'placeholder',
  };
}

/**
 * Banda didáctica. Antes de init (p. ej. `lm` de un enlace restaurado con la
 * capa aún sin montar) no hay banda: el modo se recuerda y enable la pinta.
 */
function syncBand(host) {
  if (!host.band) return;
  const text = host.lifecycle?.isEnabled() ? host.mode.band : null;
  if (text) host.band.show(text);
  else host.band.hide();
}

/** Una sola Luna mientras esta está encendida: la nativa, apagada. */
function nativeMoonOff(scene) {
  return () => {
    const previous = scene.moon?.show;
    if (scene.moon) scene.moon.show = false;
    return () => {
      if (scene.moon && previous !== undefined) scene.moon.show = previous;
    };
  };
}

function initHost(host, viewer, deps) {
  if (host.viewer) throw new Error('La capa Luna ya está inicializada');
  host.viewer = viewer;
  host.celestial = deps.celestialOf(viewer);
  host.band = createScaleBand(deps.documentRef);
  host.sceneClock = deps.sceneClockOf(viewer);
  host.texture = createMoonTexture({
    resolveAsset: deps.resolveAsset,
    loadImage: deps.loadImage,
    env: deps.textureEnv,
    credits: {
      register: (credit) => deps.credits.register(viewer, credit),
      unregister: (credit) => deps.credits.unregister(viewer, credit),
    },
    onChange: () => deps.render.request('moon-texture'),
  });
  host.lifecycle = createMoonLifecycle({
    scene: viewer.scene,
    createPrimitive: () =>
      deps.createPrimitive({ image: deps.resolveAsset(MOON_PLACEHOLDER_URI) }),
    onFrame: (primitive, time) => poseFrame(host, primitive, time),
    render: deps.render,
    sceneClock: host.sceneClock,
    applyScenePolicy: nativeMoonOff(viewer.scene),
  });
}

function debugAt(host, iso) {
  const state = host.celestial.at(parseUtcIso(iso));
  return {
    status: state.status,
    source: state.source,
    moonIcrfKm: state.status === 'ok' ? plain(state.moonIcrfKm) : null,
    moonFixedM: state.status === 'ok' ? plain(state.moonFixedM) : null,
    sunFixedM: state.sun === 'ok' ? plain(state.sunFixedM) : null,
    phaseFraction: state.status === 'ok' ? state.phaseFraction : null,
    subLunarLonLat: state.status === 'ok' ? { ...state.subLunarLonLat } : null,
  };
}

/**
 * Arnés: 'placeholder' pone el albedo uniforme (medir la luz sin mares);
 * 'auto' vuelve al presupuesto LROC. Sin Luna encendida, nada.
 */
function debugTexture(host, deps, mode) {
  const primitive = host.lifecycle?.primitive();
  if (!primitive) return;
  host.texture.stop();
  if (mode === 'placeholder')
    primitive.appearance.material.uniforms.image =
      deps.resolveAsset(MOON_PLACEHOLDER_URI);
  else host.texture.start(primitive);
  deps.render.request('moon-texture');
}

function enableHost(host, deps) {
  host.lifecycle.enable();
  host.texture.start(host.lifecycle.primitive());
  deps.credits.register(host.viewer, MOON_CREDIT);
  syncBand(host);
  deps.render.request('moon-enable');
}

function disableHost(host, deps) {
  host.texture?.stop();
  host.lifecycle?.disable();
  if (host.viewer) deps.credits.unregister(host.viewer, MOON_CREDIT);
  host.last = { ...host.last, status: 'disabled', position: null };
  syncBand(host);
  deps.render.request('moon-disable');
}

function destroyHost(host) {
  host.texture?.stop();
  host.lifecycle?.destroy();
  host.band?.remove();
  host.viewer = null;
}

/**
 * @param {{render: {hold: Function, release: Function, request: Function},
 *   resolveAsset?: Function, documentRef?: object, createPrimitive?: Function,
 *   celestialOf?: Function, sceneClockOf?: Function,
 *   credits?: {register: Function, unregister: Function}}} options
 */
export function createMoonLayer(options) {
  const deps = {
    resolveAsset: (uri) => uri,
    documentRef: globalThis.document,
    createPrimitive: createMoonPrimitive,
    celestialOf: (viewer) => celestialFor(viewer),
    sceneClockOf: getViewerSceneClock,
    credits: NO_CREDITS,
    ...options,
  };
  const host = createHostState();
  return {
    id: 'moon',
    name: 'Luna (efeméride DE441)',
    icon: '◐',
    source: 'NASA/JPL Horizons DE441 · calculada, no en vivo',
    updateInterval: 0,
    init: (viewer) => initHost(host, viewer, deps),
    enable: () => enableHost(host, deps),
    disable: () => disableHost(host, deps),
    update: () => true,
    setScaleMode(id) {
      host.mode = resolveMoonScaleMode(id);
      syncBand(host);
      deps.render.request('moon-scale');
    },
    getState: () => snapshot(host),
    /** Rango de la tabla CARGADA y estado del respaldo (enlace compartido). */
    getEphemerisCoverage: () => host.celestial?.coverage?.() ?? null,
    debugAt: (iso) => debugAt(host, iso),
    debugTexture: (mode) => debugTexture(host, deps, mode),
    getStats: () => ({
      count: host.lifecycle?.isEnabled() ? 1 : 0,
      lastUpdate: null,
    }),
    destroy: () => destroyHost(host),
  };
}
