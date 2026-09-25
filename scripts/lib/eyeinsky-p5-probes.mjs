/**
 * Sondas de navegador del arnés P5 (Tierra–Luna). Cada una es una función que
 * corre en la página con `page.evaluate`; no importan nada del repo: leen la
 * app por `window.__godsEyeView` y Cesium por `window.__CESIUM__`.
 */

/** Contador de texturas/búferes WebGL (antes de cargar la app). */
export function installGlCounter() {
  const counts = { tex: 0, texDel: 0, buf: 0, bufDel: 0 };
  window.__eyeGl = counts;
  const wrap = (proto, name, key, isDelete) => {
    const original = proto[name];
    proto[name] = function counted(...args) {
      if (!isDelete || args[0]) counts[key] += 1;
      return original.apply(this, args);
    };
  };
  for (const Context of [
    window.WebGL2RenderingContext,
    window.WebGLRenderingContext,
  ]) {
    if (!Context) continue;
    wrap(Context.prototype, 'createTexture', 'tex', false);
    wrap(Context.prototype, 'deleteTexture', 'texDel', true);
    wrap(Context.prototype, 'createBuffer', 'buf', false);
    wrap(Context.prototype, 'deleteBuffer', 'bufDel', true);
  }
}

/** Estado de la Luna 3D (o su ausencia) tal como lo publica la app. */
export const moonState = () => window.__godsEyeView.moon.getState();

/**
 * Gate P5-03 en el navegador: con el marco y la fuente lunar DE LA APP,
 * dirección ECEF Tierra(t−τ)→Luna(t) con tiempo de luz sin aberración
 * (`lightTimeModel` del fixture). El punto sublunar se compara en Node.
 */
export async function frameGateProbe(rows) {
  const C = window.__CESIUM__;
  const g = window.__godsEyeView;
  const lightSeconds = (au) => (au * 149_597_870.7) / 299_792.458;
  const out = [];
  for (const row of rows) {
    const tau = lightSeconds(row.deltaAu);
    const t = C.JulianDate.fromIso8601(row.utcIso);
    const epoch = C.JulianDate.addSeconds(t, -tau, new C.JulianDate());
    const frame = await g.frames.ensure(epoch);
    const state = g.moon.debugAt(row.utcIso);
    if (frame.status !== 'ok' || state?.status !== 'ok') {
      out.push({ utcIso: row.utcIso, status: state?.status ?? 'sin-luna' });
      continue;
    }
    const [vx, vy, vz] = row.earthBarycentricVelocityKmS;
    const m = state.moonIcrfKm;
    const vec = new C.Cartesian3(
      m.x + vx * tau,
      m.y + vy * tau,
      m.z + vz * tau,
    );
    const { matrix } = g.frames.icrfToFixed(epoch);
    const fixed = C.Matrix3.multiplyByVector(matrix, vec, new C.Cartesian3());
    out.push({ utcIso: row.utcIso, status: 'ok', source: state.source, fixed });
  }
  return out;
}

/** Marcador del anillo frente a la Luna 3D con el reloj en pausa (mismo instante). */
export function ringMoonProbe() {
  const g = window.__godsEyeView;
  const moon = g.moon.getState();
  const ring = g.celestialRing?.getDebugState?.();
  if (moon.status !== 'ok' || !moon.positionFixedM)
    return { ok: false, reason: `Luna 3D en estado ${moon.status}` };
  if (!ring?.moonFixed)
    return {
      ok: false,
      reason: `el anillo no da moonFixed (visible=${ring?.visible})`,
    };
  const p = moon.positionFixedM;
  const q = ring.moonFixed;
  // atan2(|p×q|, p·q): acos pierde resolución cerca de 0 (su mínimo es ~1,5e-8).
  const cross = Math.hypot(
    p.y * q.z - p.z * q.y,
    p.z * q.x - p.x * q.z,
    p.x * q.y - p.y * q.x,
  );
  const dot = p.x * q.x + p.y * q.y + p.z * q.z;
  return {
    ok: true,
    angleRad: Math.atan2(cross, dot),
    moonEpoch: moon.epochIso,
    ringEpoch: ring.epochIso,
  };
}

/**
 * Cámara a `altitudeM` sobre el punto sublunar mirando a la Luna, con
 * `fovDeg` horizontal; renderiza y devuelve la geometría esperada.
 */
export function aimAtMoon({ fovDeg, altitudeM }) {
  const C = window.__CESIUM__;
  const v = window.__godsEyeView.viewer;
  const st = window.__godsEyeView.moon.getState();
  const moon = new C.Cartesian3(
    st.positionFixedM.x,
    st.positionFixedM.y,
    st.positionFixedM.z,
  );
  const hat = C.Cartesian3.normalize(moon, new C.Cartesian3());
  const cam = C.Cartesian3.multiplyByScalar(
    hat,
    6_378_137 + altitudeM,
    new C.Cartesian3(),
  );
  const dir = C.Cartesian3.normalize(
    C.Cartesian3.subtract(moon, cam, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const right = C.Cartesian3.normalize(
    C.Cartesian3.cross(dir, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const up = C.Cartesian3.cross(right, dir, new C.Cartesian3());
  v.camera.setView({ destination: cam, orientation: { direction: dir, up } });
  v.camera.frustum.fov = C.Math.toRadians(fovDeg);
  for (let i = 0; i < 4; i += 1) v.render();
  const canvas = v.scene.canvas;
  const focalPx = canvas.width / 2 / Math.tan(v.camera.frustum.fov / 2);
  const distanceM = C.Cartesian3.distance(cam, moon);
  const radiusM = 1_737_400 * (st.radiusFactor ?? 1);
  const angularDeg = C.Math.toDegrees(2 * Math.asin(radiusM / distanceM));
  const expectedPx = 2 * focalPx * Math.tan(Math.asin(radiusM / distanceM));
  const center = C.SceneTransforms.worldToWindowCoordinates(v.scene, moon);
  const scale = canvas.width / canvas.clientWidth;
  return {
    fovDeg,
    focalPx,
    distanceKm: distanceM / 1000,
    angularDeg,
    expectedPx,
    center: center ? { x: center.x * scale, y: center.y * scale } : null,
    canvas: { width: canvas.width, height: canvas.height },
  };
}

/** Luminancia de un recuadro del lienzo WebGL (preserveDrawingBuffer). */
export function readLuminance({ x0, y0, size }) {
  const v = window.__godsEyeView.viewer;
  v.render();
  const src = v.scene.canvas;
  const copy = document.createElement('canvas');
  copy.width = size;
  copy.height = size;
  const ctx = copy.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, -x0, -y0);
  const { data } = ctx.getImageData(0, 0, size, size);
  const lum = new Array(size * size);
  for (let i = 0; i < size * size; i += 1)
    lum[i] =
      0.2126 * data[i * 4] +
      0.7152 * data[i * 4 + 1] +
      0.0722 * data[i * 4 + 2];
  return lum;
}

/** Proyección en pantalla (px de lienzo) del punto del limbo hacia el Sol. */
export function sunLimbOnScreen() {
  const C = window.__CESIUM__;
  const g = window.__godsEyeView;
  const v = g.viewer;
  const st = g.moon.getState();
  const at = g.moon.debugAt(st.epochIso.replace(/\.\d+Z$/, 'Z'));
  const moon = new C.Cartesian3(
    st.positionFixedM.x,
    st.positionFixedM.y,
    st.positionFixedM.z,
  );
  const sun = new C.Cartesian3(at.sunFixedM.x, at.sunFixedM.y, at.sunFixedM.z);
  const toSun = C.Cartesian3.normalize(
    C.Cartesian3.subtract(sun, moon, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const view = C.Cartesian3.normalize(
    C.Cartesian3.subtract(moon, v.camera.positionWC, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const perp = C.Cartesian3.subtract(
    toSun,
    C.Cartesian3.multiplyByScalar(
      view,
      C.Cartesian3.dot(toSun, view),
      new C.Cartesian3(),
    ),
    new C.Cartesian3(),
  );
  C.Cartesian3.normalize(perp, perp);
  const limb = C.Cartesian3.add(
    moon,
    C.Cartesian3.multiplyByScalar(perp, 1_737_400, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const a = C.SceneTransforms.worldToWindowCoordinates(v.scene, moon);
  const b = C.SceneTransforms.worldToWindowCoordinates(v.scene, limb);
  const scale = v.scene.canvas.width / v.scene.canvas.clientWidth;
  return {
    dx: (b.x - a.x) * scale,
    dy: (b.y - a.y) * scale,
    phaseFraction: at.phaseFraction,
  };
}

/** Recuento de primitivas, listeners y holds para el ciclo enable/disable. */
export function sceneLedger() {
  const g = window.__godsEyeView;
  const scene = g.viewer.scene;
  return {
    primitives: scene.primitives.length,
    preUpdate: scene.preUpdate.numberOfListeners,
    holds: g.getRenderGovernorDiagnostics().holds,
    gl: { ...window.__eyeGl },
  };
}

/** Banda didáctica visible y su texto. */
export function scaleBandProbe() {
  const band = document.querySelector('[data-eye-moon-scale-band]');
  return band
    ? { present: true, hidden: band.hidden, text: band.textContent }
    : { present: false };
}

/** Número de fotograma, holds, reloj y época lunar, sin pedir render. */
export function repaintProbe() {
  const g = window.__godsEyeView;
  const C = window.__CESIUM__;
  return {
    frameNumber: g.viewer.scene.frameState.frameNumber,
    holds: g.getRenderGovernorDiagnostics().holds,
    shouldAnimate: g.viewer.clock.shouldAnimate,
    clockIso: C.JulianDate.toIso8601(g.viewer.clock.currentTime, 0),
    moonEpochIso: g.moon.getState().epochIso ?? null,
  };
}

/**
 * Punto sublunar que PUBLICA la app (con tiempo de luz, layers/moon/subLunar.js)
 * para las épocas del fixture; la separación frente a Horizons se mide en Node.
 */
export async function subLunarProbe(rows) {
  const C = window.__CESIUM__;
  const g = window.__godsEyeView;
  const out = [];
  for (const row of rows) {
    const frame = await g.frames.ensure(C.JulianDate.fromIso8601(row.utcIso));
    const state = g.moon.debugAt(row.utcIso);
    out.push(
      frame.status === 'ok' && state?.status === 'ok'
        ? { utcIso: row.utcIso, status: 'ok', lonLat: state.subLunarLonLat }
        : { utcIso: row.utcIso, status: state?.status ?? 'sin-luna' },
    );
  }
  return out;
}
