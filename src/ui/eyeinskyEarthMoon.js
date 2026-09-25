import * as Cesium from 'cesium';
import { getViewerSceneClock } from '../time/sceneClock.js';
import { bindSceneShortcuts } from './applicationShortcuts.js';
import {
  LIVE_TOLERANCE_MS,
  isSceneOffLive,
  parseUtcDateField,
  resolveResume,
  resolveTimeStrip,
} from './eyeinskyMissionDockModel.js';
import { mountEyeEarthLabel, resolveEarthLabel } from './eyeinskySystemView.js';
import {
  MOON_CONTEXT_KEY,
  buildMoonContext,
  resolveMoonActions,
  resolveMoonReticle,
} from './eyeinskyMoonDockModel.js';
import { createLiveSuspension } from './eyeinskyLiveSuspension.js';
import { mountEyeTimeStrip } from './eyeinskyTimeStrip.js';
import {
  mountEyeMoonActions,
  mountEyeMoonReticle,
} from './eyeinskyMoonDock.js';
import {
  MOON_AIM_SECONDS,
  aimPose,
  captureReturnState,
  freeAreaFit,
  moveCamera,
  restoreReturnState,
  systemPose,
  targetsInFrame,
} from './eyeinskyMoonCamera.js';

/**
 * Tierra–Luna en el Mission Dock (P5 T8): compone la tira TIEMPO (reloj
 * único), la suspensión de capas en vivo, las acciones de la Luna, el panel
 * OBJETIVO Luna (expediente P3) y la retícula. El shell solo aporta sus
 * autoridades (expediente, dock, seguimiento, navegación) por callbacks.
 */

const TICK_MS = 1_000;
const RETICLE_MARGIN_PX = 28;
const OFF_FRAME_NOTICE =
  'Fuera de cuadro en esta pantalla: repliega el panel o gira el teléfono.';
/** Cabecera compacta: pantalla estrecha, baja o con zoom (viewport visual). */
const COMPACT_MAX_WIDTH = 700;
const COMPACT_MAX_HEIGHT = 600;
const DISABLED_MOON = Object.freeze({ enabled: false, status: 'disabled' });
const EARTH_RADIUS_M = 6_371_000;

function dockBandPx(doc) {
  const raw = doc.documentElement.style.getPropertyValue('--eye-dock-band');
  return Number.parseFloat(raw) || 0;
}

/** Retícula de un fotograma: proyección o dirección en el plano de la cámara. */
function reticleFor(scene, moonFixedM) {
  const camera = scene.camera;
  const target = new Cesium.Cartesian3(
    moonFixedM.x,
    moonFixedM.y,
    moonFixedM.z,
  );
  const to = Cesium.Cartesian3.subtract(
    target,
    camera.positionWC,
    new Cesium.Cartesian3(),
  );
  const ahead = Cesium.Cartesian3.dot(to, camera.directionWC) > 0;
  const point = ahead
    ? Cesium.SceneTransforms.worldToWindowCoordinates(scene, target)
    : null;
  return resolveMoonReticle({
    width: scene.canvas.clientWidth,
    height: scene.canvas.clientHeight,
    margin: RETICLE_MARGIN_PX,
    point: point ?? null,
    dx: Cesium.Cartesian3.dot(to, camera.rightWC),
    dy: -Cesium.Cartesian3.dot(to, camera.upWC),
  });
}

/** Órdenes de la tira TIEMPO sobre el reloj único. */
const RUNNING_LIVE = Object.freeze({ mode: 'live', multiplier: 1 });

/** Memoria de la tira: el último modo EN MARCHA (de ahí viene una pausa). */
export const createTimeMemory = () => ({ running: RUNNING_LIVE });

/**
 * Recuerda vivo o simulación ×N; la pausa no borra de dónde se vino. Al
 * ENTRAR en pausa guarda la deriva de ese instante: una pausa hecha en vivo
 * empieza en ≈0; un salto de FECHA empieza lejos.
 */
export function trackClock(memory, clock) {
  if (clock?.mode === 'paused' && memory.lastMode !== 'paused')
    memory.pauseStartDriftMs = Number(clock.driftMs) || 0;
  memory.lastMode = clock?.mode ?? null;
  if (clock?.mode === 'live') memory.running = RUNNING_LIVE;
  else if (clock?.mode === 'simulated')
    memory.running = Object.freeze({
      mode: 'simulated',
      multiplier: clock.multiplier,
    });
}

/** ¿Esta pausa se hizo en vivo (no en otra época ni simulando)? */
export function isPausedFromLive(
  memory,
  clock,
  toleranceMs = LIVE_TOLERANCE_MS,
) {
  return (
    clock?.mode === 'paused' &&
    memory.running?.mode === 'live' &&
    Math.abs(Number(memory.pauseStartDriftMs) || 0) <= toleranceMs
  );
}

/** REANUDAR: a vivo si la pausa venía de vivo sin derivar; si no, al ritmo pausado. */
function resume(sceneClock, memory) {
  const target = resolveResume(sceneClock.getState(), memory.running);
  if (target.type === 'now') sceneClock.setNow();
  else sceneClock.simulate(target.multiplier);
}

/** Órdenes de la tira TIEMPO sobre el reloj único. */
export function timeCommands({ sceneClock, strip, memory }) {
  return (command) => {
    const state = sceneClock.getState();
    trackClock(memory, state);
    strip.setError(null);
    if (command.type === 'pause') {
      if (state.mode === 'paused') resume(sceneClock, memory);
      else sceneClock.pause();
    } else if (command.type === 'advance')
      sceneClock.simulate(resolveTimeStrip(state).advance.multiplier);
    else if (command.type === 'now') sceneClock.setNow();
    else if (command.type === 'seek') {
      const parsed = parseUtcDateField(command.value);
      if (!parsed.ok) strip.setError(parsed.error);
      else {
        sceneClock.setTime(parsed.iso);
        strip.closeSeek();
      }
    }
    trackClock(memory, sceneClock.getState());
  };
}

/**
 * @param {object} options
 * @param {object} options.viewer Viewer de Cesium.
 * @param {object} options.dataManager DataManager.
 * @param {{time: HTMLElement, moon: HTMLElement}} options.hosts Cabecera del dock.
 * @param {object} options.shell Autoridades del shell (ver eyeinskyShell).
 * @param {{get: () => boolean, set: (on: boolean) => void}} options.ring Anillo.
 * @param {() => boolean} options.reduced reduced-motion.
 */
export function mountEyeEarthMoon(options) {
  const { viewer, dataManager, hosts, shell } = options;
  const sceneClock = getViewerSceneClock(viewer);
  if (!sceneClock || !hosts?.time) return { debug: null, destroy() {} };
  const ctx = createContext(options, sceneClock);
  ctx.strip = mountEyeTimeStrip({
    host: hosts.time,
    onCommand: (command) => timeCommands(ctx)(command),
  });
  ctx.actions = mountEyeMoonActions({
    host: hosts.moon,
    onAction: (id) => void runMoonAction(ctx, id),
  });
  ctx.reticle = mountEyeMoonReticle(ctx.doc);
  ctx.earthLabel = mountEyeEarthLabel(ctx.doc);
  const shortcuts = bindSceneShortcuts({
    documentRef: ctx.doc,
    run: sceneShortcutRunner(ctx),
  });
  const view = ctx.doc.defaultView;
  const compact = () => syncCompact(ctx, view);
  view?.visualViewport?.addEventListener('resize', compact);
  view?.addEventListener('resize', compact);
  compact();
  const teardown = [
    () => view?.visualViewport?.removeEventListener('resize', compact),
    () => view?.removeEventListener('resize', compact),
    sceneClock.subscribe(ctx.render),
    dataManager.subscribe?.(ctx.render) ?? (() => {}),
    viewer.scene.postRender.addEventListener(() => paintReticle(ctx)),
  ];
  const timer = globalThis.setInterval(() => {
    if (!ctx.doc.hidden) ctx.render();
  }, TICK_MS);
  ctx.render();
  return {
    debug: createDebug(ctx),
    destroy() {
      globalThis.clearInterval(timer);
      for (const off of teardown) off();
      shortcuts.destroy();
      setSystemPose(ctx, false);
      ctx.suspension.destroy();
      ctx.strip.destroy();
      ctx.actions.destroy();
      ctx.reticle.destroy();
      ctx.earthLabel.destroy();
      shell.onSuspensionChange?.();
    },
  };
}

/** Estado compartido del montaje (sin superficies todavía). */
function createContext(options, sceneClock) {
  const { dataManager, hosts, shell } = options;
  const moonModule = () => dataManager.layers?.get?.('moon')?.module ?? null;
  const ctx = {
    ...options,
    sceneClock,
    doc: hosts.time.ownerDocument,
    moonModule,
    moonState: () => moonModule()?.getState() ?? DISABLED_MOON,
    memory: {
      ...createTimeMemory(),
      snapshot: null,
      busy: false,
      focusFrom: null,
      lastFraming: null,
      systemPose: false,
    },
    /** Tolerancia de «ahora» en pausa (60 s; el arnés la baja). */
    liveToleranceMs: LIVE_TOLERANCE_MS,
    suspension: createLiveSuspension({
      dataManager,
      onChange: () => shell.onSuspensionChange?.(),
    }),
  };
  ctx.render = () => renderAll(ctx);
  return ctx;
}

/** Marca la cabecera como compacta según el viewport VISUAL (zoom incluido). */
function syncCompact(ctx, view) {
  const header = ctx.hosts.time.parentElement;
  if (!header || !view) return;
  const width = view.visualViewport?.width ?? view.innerWidth;
  const height = view.visualViewport?.height ?? view.innerHeight;
  const short = height < COMPACT_MAX_HEIGHT;
  header.dataset.compact = String(width < COMPACT_MAX_WIDTH || short);
  // Viewport visual bajo (zoom 200 %, teléfono apaisado): ver el CSS.
  header.dataset.short = String(short);
}

function renderAll(ctx) {
  const clock = ctx.sceneClock.getState();
  trackClock(ctx.memory, clock);
  const toleranceMs = ctx.liveToleranceMs;
  void ctx.suspension.sync(isSceneOffLive(clock, { toleranceMs }));
  const moon = ctx.moonState();
  if (!moon.enabled) setSystemPose(ctx, false);
  const view = resolveTimeStrip(clock, {
    suspendedCount: ctx.suspension.getSuspended().length,
    satellitesEnabled: ctx.dataManager.isEnabled?.('satellites') === true,
    pausedFromLive: isPausedFromLive(ctx.memory, clock, toleranceMs),
    liveToleranceMs: toleranceMs,
    moonSource: moon.enabled ? moon.source : null,
  });
  ctx.strip.update(view, clock.currentIso);
  const returnPending = Boolean(ctx.memory.snapshot);
  ctx.actions.update(
    resolveMoonActions({ moon, returnPending }),
    moon.enabled === true || returnPending,
  );
  syncMoonContext(ctx, moon);
}

/** Mantiene vivo el panel OBJETIVO Luna mientras es el objetivo. */
function syncMoonContext(ctx, moon) {
  if (ctx.shell.getDossier().context.key !== MOON_CONTEXT_KEY) return;
  if (!moon.enabled) ctx.shell.selectView();
  else ctx.shell.refresh(buildMoonContext(moon));
}

function paintReticle(ctx) {
  const moon = ctx.moonState();
  const visible = moon.enabled && moon.status === 'ok' && moon.positionFixedM;
  ctx.reticle.update(
    visible ? reticleFor(ctx.viewer.scene, moon.positionFixedM) : null,
  );
  ctx.earthLabel.update(moon.enabled ? earthLabelFor(ctx.viewer.scene) : null);
}

/** Rótulo TIERRA de un fotograma: centro proyectado y diámetro aparente. */
function earthLabelFor(scene) {
  const camera = scene.camera;
  const distance = Cesium.Cartesian3.magnitude(camera.positionWC);
  const toCenter = Cesium.Cartesian3.negate(
    camera.positionWC,
    new Cesium.Cartesian3(),
  );
  const ahead = Cesium.Cartesian3.dot(toCenter, camera.directionWC) > 0;
  const point = ahead
    ? Cesium.SceneTransforms.worldToWindowCoordinates(
        scene,
        Cesium.Cartesian3.ZERO,
      )
    : null;
  const angular = 2 * Math.asin(Math.min(1, EARTH_RADIUS_M / distance));
  return resolveEarthLabel({
    width: scene.canvas.clientWidth,
    height: scene.canvas.clientHeight,
    point: point ?? null,
    diameterPx: (angular / camera.frustum.fovy) * scene.canvas.clientHeight,
  });
}

/**
 * Pose SISTEMA activa o no: mientras lo está, el shell aparta las etiquetas
 * que tapan la Tierra diminuta; al salir (VOLVER, APUNTAR, Luna apagada) las
 * devuelve. Solo avisa en el cambio.
 */
export function setSystemPose(ctx, on) {
  const next = on === true;
  if (ctx.memory.systemPose === next) return;
  ctx.memory.systemPose = next;
  ctx.shell.declutter?.(next);
}

/** Motivo por el que una acción de la Luna no puede ejecutarse, o null. */
function moonActionRefusal(ctx, id) {
  const action = resolveMoonActions({
    moon: ctx.moonState(),
    returnPending: Boolean(ctx.memory.snapshot),
  }).find((item) => item.id === id);
  return action && !action.enabled
    ? `${action.label} no disponible: ${action.hint}`
    : null;
}

/**
 * Atajos de escena (P5 §7) sobre las mismas órdenes que los botones. Devuelve
 * `run(id)` → true si atendió la tecla. Con un diálogo abierto, nada (salvo
 * lo que el diálogo haga con Esc).
 */
export function sceneShortcutRunner(
  ctx,
  { runAction = (id) => void runMoonAction(ctx, id) } = {},
) {
  return (id) => {
    if (ctx.doc.querySelector?.('dialog[open]')) return false;
    if (id === 'close-date-field')
      return ctx.strip.closeSeek({ refocus: true });
    if (id === 'aim-moon' || id === 'earth-moon-system') {
      const refusal = moonActionRefusal(ctx, id);
      if (refusal) ctx.shell.notice?.(refusal);
      else runAction(id);
      return true;
    }
    if (id === 'now' && ctx.sceneClock.getState().mode === 'live') return false;
    if (id === 'toggle-pause' || id === 'now') {
      timeCommands(ctx)({ type: id === 'now' ? 'now' : 'pause' });
      return true;
    }
    return false;
  };
}

/** Guarda la instantánea de retorno la PRIMERA vez que se va a la Luna. */
export function ensureReturnPoint(ctx) {
  if (ctx.memory.snapshot) return;
  ctx.memory.snapshot = captureReturnState({
    viewer: ctx.viewer,
    dataManager: ctx.dataManager,
    shell: ctx.shell,
    ring: ctx.ring,
    suspended: ctx.suspension.getSuspended(),
  });
}

const usable = (el) =>
  Boolean(el?.isConnected) && !el.disabled && el.getClientRects().length > 0;

/**
 * WCAG 2.4.3: si la acción dejó el foco sin sitio (botón oculto al replegar
 * el dock compacto, o deshabilitado), vuelve al botón, a otra acción de la
 * Luna o a MÁS, que despliega el dock de nuevo.
 */
function rescueFocus(ctx) {
  const from = ctx.memory.focusFrom;
  const active = ctx.doc.activeElement;
  if (!from || (active && active !== ctx.doc.body && usable(active))) return;
  const dock = ctx.hosts.time.closest?.('#eye-mission-dock');
  const candidates = [
    from,
    ...(ctx.hosts.moon?.querySelectorAll?.('button') ?? []),
    dock?.querySelector?.('[data-eye-dock-action="more"]'),
  ];
  candidates.find(usable)?.focus({ preventScroll: true });
}

/** Pose de APUNTAR o de SISTEMA para el área libre sobre el dock. */
function moonPose(ctx, kind, moonFixedM) {
  const { camera, canvas } = ctx.viewer.scene;
  const band = dockBandPx(ctx.doc);
  return kind === 'aim'
    ? aimPose(camera, moonFixedM, freeAreaFit(camera.frustum.fov, canvas, band))
    : systemPose(moonFixedM, canvas, band);
}

async function goToMoon(ctx, kind) {
  const moon = ctx.moonState();
  if (moon.status !== 'ok' || !moon.positionFixedM) return;
  ensureReturnPoint(ctx);
  ctx.shell.releaseFollow();
  ctx.shell.select(buildMoonContext(moon));
  // El globo manda: el cuerpo desplegado del dock se repliega para que la
  // Luna (y la Tierra) queden a la vista; VOLVER A TIERRA lo restaura.
  ctx.shell.collapseDock();
  rescueFocus(ctx);
  const camera = ctx.viewer.camera;
  const pose = moonPose(ctx, kind, moon.positionFixedM);
  const duration = kind === 'aim' ? MOON_AIM_SECONDS : undefined;
  let flight = Promise.resolve('refused');
  ctx.shell.navigate('Luna', () => {
    flight = moveCamera(camera, pose, { reduced: ctx.reduced(), duration });
  });
  const outcome = await flight;
  setSystemPose(
    ctx,
    kind === 'system' && (outcome === 'cut' || outcome === 'flown'),
  );
  ctx.viewer.scene.requestRender();
  const inFrame = targetsInFrame(ctx.viewer.scene, moon.positionFixedM, {
    bottomBandPx: dockBandPx(ctx.doc),
    withEarth: kind === 'system',
  });
  ctx.actions.setNotice(inFrame ? '' : OFF_FRAME_NOTICE);
  ctx.memory.lastFraming = { kind, inFrame, outcome };
}

/** Retornos que dejan la escena donde estaba: solo ellos consumen la foto. */
const RETURN_DONE = new Set(['cut', 'flown', 'followed']);

export async function returnToEarth(ctx) {
  const snapshot = ctx.memory.snapshot;
  if (!snapshot) return;
  ctx.actions.setNotice('');
  const outcome = await restoreReturnState(snapshot, {
    viewer: ctx.viewer,
    dataManager: ctx.dataManager,
    shell: ctx.shell,
    ring: ctx.ring,
    reduced: ctx.reduced(),
    offLive: ctx.suspension.isOffLive(),
  });
  if (RETURN_DONE.has(outcome)) setSystemPose(ctx, false);
  if (RETURN_DONE.has(outcome) && ctx.memory.snapshot === snapshot)
    ctx.memory.snapshot = null;
  ctx.viewer.scene.requestRender();
}

async function runMoonAction(ctx, id) {
  if (ctx.memory.busy) return;
  ctx.memory.busy = true;
  const active = ctx.doc.activeElement;
  ctx.memory.focusFrom = ctx.hosts.moon?.contains?.(active) ? active : null;
  try {
    if (id === 'aim-moon') await goToMoon(ctx, 'aim');
    else if (id === 'earth-moon-system') await goToMoon(ctx, 'system');
    else if (id === 'return-to-earth') await returnToEarth(ctx);
    else if (id === 'moon-scale') {
      const didactic = ctx.moonState().scaleMode === 'didactic';
      ctx.moonModule()?.setScaleMode(didactic ? 'physical' : 'didactic');
    }
  } catch (error) {
    ctx.shell.notice?.(
      `La acción de la Luna falló: ${error?.message || error}`,
    );
  } finally {
    ctx.memory.busy = false;
    ctx.render();
    rescueFocus(ctx);
    ctx.memory.focusFrom = null;
  }
}

/** Vista de depuración para los arneses (`__eyeinsky.earthMoon`). */
function createDebug(ctx) {
  return Object.freeze({
    returnPending: () => Boolean(ctx.memory.snapshot),
    suspended: () => ctx.suspension.getSuspended(),
    lastFraming: () => ctx.memory.lastFraming ?? null,
    settled: () => ctx.suspension.settled(),
    run: (id) => runMoonAction(ctx, id),
    systemPose: () => ctx.memory.systemPose,
    /** Solo arnés: baja la tolerancia de «ahora» (no esperar 60 s reales). */
    setLiveToleranceMs(ms) {
      ctx.liveToleranceMs = Number(ms) > 0 ? Number(ms) : LIVE_TOLERANCE_MS;
      ctx.render();
    },
  });
}
