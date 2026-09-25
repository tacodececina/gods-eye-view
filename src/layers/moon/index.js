import { parseUtcIso } from '../../time/timeScales.js';
import { getViewerSceneClock } from '../../time/sceneClock.js';
import { celestialFor } from './celestialService.js';
import { createMoonLifecycle } from './lifecycle.js';
import { MOON_ORIENTATION_LABEL, computeMoonModelMatrix } from './pose.js';
import { MOON_PLACEHOLDER_URI, createMoonPrimitive } from './primitive.js';
import { createScaleBand } from './scaleBand.js';
import { resolveMoonScaleMode } from './scaleMode.js';

/**
 * Capa «Luna» de P5 (T6): host al estilo de satellites/modelsHost. Une el
 * servicio celeste compartido (DE441, marco XYS), la pose por fotograma en
 * `scene.preUpdate` (con el `time` del evento), el ciclo de vida medido y la
 * escala física/didáctica. No es un feed: nada en vivo, sin sondeo.
 */

/** Atribución en el panel de créditos mientras la Luna está encendida. */
export const MOON_CREDIT = Object.freeze({
  key: 'jpl-horizons-de441',
  html: 'Moon position: NASA/JPL Horizons, DE441 (computed ephemeris, not live). Moon texture: grey placeholder.',
});

const NO_CREDITS = Object.freeze({ register() {}, unregister() {} });

const plain = (v) => ({ x: v.x, y: v.y, z: v.z });

function createHostState() {
  return {
    viewer: null,
    lifecycle: null,
    celestial: null,
    band: null,
    mode: resolveMoonScaleMode(),
    last: { status: 'disabled', reason: null, position: null, state: null },
  };
}

/** Pose de un fotograma: la Luna física solo si el estado es «ok». */
function poseFrame(host, primitive, time) {
  const state = host.celestial.at(time);
  host.last.state = state;
  host.last.status = state.status;
  host.last.reason = state.reason;
  if (state.status !== 'ok') {
    primitive.show = false;
    host.last.position = null;
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
}

function snapshot(host) {
  const enabled = host.lifecycle?.isEnabled() === true;
  const s = enabled && host.last.status === 'ok' ? host.last.state : null;
  return {
    enabled,
    status: enabled ? host.last.status : 'disabled',
    reason: enabled ? host.last.reason : null,
    positionFixedM: enabled ? host.last.position : null,
    epochIso: s?.epochIso ?? null,
    source: s?.source ?? null,
    validity: s?.validity ?? null,
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
    texture: 'placeholder',
  };
}

function syncBand(host) {
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
  host.lifecycle = createMoonLifecycle({
    scene: viewer.scene,
    createPrimitive: () =>
      deps.createPrimitive({ image: deps.resolveAsset(MOON_PLACEHOLDER_URI) }),
    onFrame: (primitive, time) => poseFrame(host, primitive, time),
    render: deps.render,
    sceneClock: deps.sceneClockOf(viewer),
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
  };
}

function enableHost(host, deps) {
  host.lifecycle.enable();
  deps.credits.register(host.viewer, MOON_CREDIT);
  syncBand(host);
  deps.render.request('moon-enable');
}

function disableHost(host, deps) {
  host.lifecycle?.disable();
  if (host.viewer) deps.credits.unregister(host.viewer, MOON_CREDIT);
  host.last = { ...host.last, status: 'disabled', position: null };
  syncBand(host);
  deps.render.request('moon-disable');
}

function destroyHost(host) {
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
    debugAt: (iso) => debugAt(host, iso),
    getStats: () => ({
      count: host.lifecycle?.isEnabled() ? 1 : 0,
      lastUpdate: null,
    }),
    destroy: () => destroyHost(host),
  };
}
