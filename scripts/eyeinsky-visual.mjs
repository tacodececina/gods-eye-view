/**
 * Arnés visual Editorial (fase visual, T0): convierte los principios de diseño
 * en comprobaciones medibles sobre la app viva.
 *
 *   node scripts/eyeinsky-visual.mjs <url> <directorio-de-salida>
 *
 * Nunca arranca servidor y rechaza un directorio con result.json. Mide en
 * reposo (sin interacción) a 1600×900 y 390×844, y aparte con movimiento
 * reducido. El día/noche del disco sale del lienzo de Cesium; el cielo y el
 * halo, de la captura COMPUESTA (lo que ve la persona: lienzo más cualquier
 * capa encima, como #scope-mask), sin los rectángulos de UI; y el contraste
 * del texto, de una captura SIN texto (fondo real bajo cada rótulo), nunca de
 * un fondo supuesto.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  createRecorder,
  finishRun,
  launchBrowser,
  prepareRun,
  sleep,
} from './lib/eyeinsky-p4-run.mjs';
import { openApp, trackById } from './lib/eyeinsky-p4-page.mjs';
import { readGlobeFlags } from '../src/ui/eyeinskyGlobeFlags.js';
import {
  compositeOver,
  creditOverflow,
  diskDayNight,
  fontFaceLoaded,
  haloRing,
  luminanceContrast,
  overlaps,
  parseCssColor,
  regionLuminances,
  relativeLuminance,
  restSurfaceCount,
  skyStats,
  skyTint,
  telemetryAltitudeKm,
  terminatorAngleFromSun,
  textFloorViolations,
  worstCaseBackground,
} from './lib/eyeinsky-visual-checks.mjs';

const VIEWPORTS = [
  { width: 1600, height: 900 },
  { width: 390, height: 844 },
];
/** Familias del sistema Editorial (DESIGN-SYSTEM-EDITORIAL §3). */
const FONT_FAMILIES = ['Instrument Serif', 'Space Grotesk', 'IBM Plex Mono'];
const FONT_PROBES = [
  '16px "Instrument Serif"',
  'italic 16px "Instrument Serif"',
  '16px "Space Grotesk"',
  '400 16px "IBM Plex Mono"',
  '500 16px "IBM Plex Mono"',
];
/** Umbrales del cielo sobrio (V-14): p99 y densidad de píxeles brillantes. */
const SKY_P99_MAX = 0.45;
const SKY_BRIGHT_LUM = 0.2;
const SKY_BRIGHT_FRACTION_MAX = 0.001;
/** Terminador en pantalla para la pose solar (plan §2.3). */
const TERMINATOR_RANGE = [25, 35];
const DAY_NIGHT_RATIO_MAX = 0.3;
/** Cielo compuesto sin velo: G−R mediano < 3 y sin escalón de ojo de cerradura. */
const SKY_GREEN_CAST_MAX = 3;
const SKY_KEYHOLE_STEP_MAX = 0.003;
/** Telemetría con objetivo fijado: altura dentro de 2 km o 0,5 %. */
const TELEMETRY_ALT_TOLERANCE_KM = 2;
const TELEMETRY_ALT_TOLERANCE_REL = 0.005;
const TRACK_SETTLE_MS = 6000;
const HEADLINE_WINDOW_MS = 3000;

const { baseUrl, out, resultPath } = await prepareRun('eyeinsky-visual');
const { result, check } = createRecorder({
  url: baseUrl,
  harness: 'eyeinsky-visual',
  viewports: VIEWPORTS,
});

const suffixOf = ({ width, height }) => `${width}x${height}`;
const pageViewport = (viewport) => ({
  ...viewport,
  deviceScaleFactor: 1,
  isMobile: viewport.width <= 430,
  hasTouch: viewport.width <= 430,
});

async function decodePng(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: 4, data };
}

/** Espera la entrada (si existe), el vuelo y las teselas; luego asienta. */
async function waitForRest(page) {
  await page
    .waitForFunction(
      () =>
        document.body.dataset.eyeIntro !== 'running' &&
        !window.__godsEyeView.viewer.camera._currentFlight,
      { timeout: 12_000, polling: 100 },
    )
    .catch(() => {});
  await page
    .waitForFunction(
      () => window.__godsEyeView.viewer.scene.globe.tilesLoaded,
      { timeout: 25_000, polling: 250 },
    )
    .catch(() => {});
  await sleep(1500);
}

/** Todo lo que se mide del DOM y de la escena en reposo, en un solo frame. */
function readRestState() {
  const ZONES = [
    [
      'topbar',
      '.eye-orbit-brand,.eye-function-dock,.eye-utility-cluster,.eye-topbar',
    ],
    ['search', '.eye-search'],
    ['telemetry', '.eye-telemetry'],
    ['camera', '.eye-instruments,#eye-clean-exit'],
    ['attribution', '#cesium-credits,.cesium-widget-credits'],
  ];
  const NAMED = [
    '.eye-orbit-brand',
    '.eye-search',
    '.eye-function-dock',
    '.eye-utility-cluster',
    '.eye-instruments',
    '.eye-telemetry',
    '#eye-active-layers',
    '.eye-signal-glance',
    '.eye-hud-details',
    '#eye-mission-dock',
    '#eye-workspace',
    '#eye-notice',
    '#cesium-credits',
    '.eye-story',
    '[data-eye-time-host]',
  ];
  const opacityChain = (element) => {
    let value = 1;
    for (let node = element; node && node !== document; node = node.parentNode)
      if (node.nodeType === 1)
        value *= Number(getComputedStyle(node).opacity || 1);
    return value;
  };
  const visible = (element) => {
    if (!element?.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const r = element.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.bottom <= 0) return false;
    if (r.left >= innerWidth || r.top >= innerHeight) return false;
    return opacityChain(element) > 0.05;
  };
  const rectOf = (element) => {
    const r = element.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const keyOf = (element) =>
    element.id
      ? `#${element.id}`
      : `${element.tagName.toLowerCase()}${[...element.classList]
          .slice(0, 2)
          .map((c) => `.${c}`)
          .join('')}`;
  const alpha = (color) => {
    const m = /rgba?\(([^)]+)\)/.exec(color || '');
    if (!m) return 0;
    const parts = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return parts.length > 3 ? parts[3] : 1;
  };
  const boxed = (element) => {
    const s = getComputedStyle(element);
    if (alpha(s.backgroundColor) >= 0.08) return true;
    if (s.backdropFilter && s.backdropFilter !== 'none') return true;
    if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(
      (side) =>
        Number.parseFloat(s[`border${side}Width`]) > 0.5 &&
        alpha(s[`border${side}Color`]) >= 0.12,
    );
    return sides.length >= 3;
  };
  const cesium = document.querySelector('.cesium-widget');
  const boxes = [];
  const boxedSet = new Set();
  for (const element of document.body.querySelectorAll('*')) {
    if (cesium?.contains(element) || element.tagName === 'CANVAS') continue;
    if (element.closest('#loading-screen')) continue;
    if (!visible(element) || !boxed(element)) continue;
    const r = element.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) continue;
    boxedSet.add(element);
    let parent = null;
    for (let n = element.parentElement; n; n = n.parentElement)
      if (boxedSet.has(n)) {
        parent = keyOf(n);
        break;
      }
    const zone =
      ZONES.find(([, selector]) => element.closest(selector))?.[0] ?? null;
    boxes.push({ key: keyOf(element), zone, parent, rect: rectOf(element) });
  }
  const named = NAMED.map((selector) => ({
    selector,
    element: document.querySelector(selector),
  }))
    .filter(({ element }) => visible(element))
    .map(({ selector, element }) => ({ key: selector, ...rectOf(element) }));

  const texts = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') continue;
    if (element.closest('[aria-hidden="true"]')) continue;
    const own = [...element.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .trim();
    const isField =
      (element.tagName === 'INPUT' && element.type !== 'hidden') ||
      element.tagName === 'SELECT';
    if (!own && !isField) continue;
    if (!visible(element)) continue;
    const r = element.getBoundingClientRect();
    if (r.width * r.height < 16) continue;
    const s = getComputedStyle(element);
    texts.push({
      text: (own || element.value || element.placeholder || '').slice(0, 60),
      key: keyOf(element),
      size: Number.parseFloat(s.fontSize),
      weight: Number.parseFloat(s.fontWeight) || 400,
      color: s.color,
      opacity: opacityChain(element),
      attribution: Boolean(
        element.closest('#cesium-credits,.cesium-widget-credits'),
      ),
      // WCAG 1.4.3: el texto de un control inactivo no tiene requisito.
      disabled: Boolean(
        element.closest('button:disabled,[aria-disabled="true"]'),
      ),
      rect: rectOf(element),
    });
  }

  const credits = [...document.querySelectorAll('#cesium-credits *')].flatMap(
    (element) => {
      if (!visible(element)) return [];
      const r = element.getBoundingClientRect();
      return [
        {
          key: `${keyOf(element)} ${element.textContent.trim().slice(0, 30)}`,
          left: r.left,
          right: r.right,
          width: r.width,
        },
      ];
    },
  );
  const dock = document.getElementById('eye-mission-dock');
  const story = document.querySelector('.eye-story');
  const C = window.__CESIUM__;
  const viewer = window.__godsEyeView.viewer;
  const scene = viewer.scene;
  const camera = viewer.camera;
  const canvas = scene.canvas;
  const scale = canvas.width / canvas.clientWidth;
  const center = C.SceneTransforms.worldToWindowCoordinates(
    scene,
    C.Cartesian3.ZERO,
  );
  const range = C.Cartesian3.magnitude(camera.positionWC);
  const angular = Math.asin(Math.min(1, 6_378_137 / range));
  const radiusCss =
    ((canvas.clientHeight / 2) * Math.tan(angular)) /
    Math.tan(camera.frustum.fovy / 2);
  const sun = scene.context.uniformState.sunPositionWC;
  const sunDir = C.Cartesian3.normalize(sun, new C.Cartesian3());
  const sx = C.Cartesian3.dot(sunDir, camera.rightWC);
  const sy = C.Cartesian3.dot(sunDir, camera.upWC);
  const layers = [];
  for (let i = 0; i < viewer.imageryLayers.length; i += 1) {
    const layer = viewer.imageryLayers.get(i);
    layers.push({
      show: layer.show,
      alpha: layer.alpha,
      dayAlpha: layer.dayAlpha,
      nightAlpha: layer.nightAlpha,
      brightness: layer.brightness,
    });
  }
  let graticule = null;
  for (let i = 0; i < viewer.dataSources.length; i += 1) {
    const source = viewer.dataSources.get(i);
    if (source.name === 'eyeinsky-graticule')
      graticule = {
        show: source.show,
        entities: source.entities.values.length,
      };
  }
  return {
    viewport: { width: innerWidth, height: innerHeight },
    boxes,
    named,
    texts,
    credits,
    overflowX:
      Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) - innerWidth,
    dock: {
      visible: visible(dock),
      contextKind: dock?.dataset.contextKind ?? null,
      contextKey: dock?.dataset.contextKey ?? null,
    },
    glanceVisible: visible(document.querySelector('.eye-signal-glance')),
    advancedVisible: visible(document.querySelector('.eye-hud-details')),
    storyVisible: visible(story),
    camera: {
      pitch: C.Math.toDegrees(camera.pitch),
      heading: C.Math.toDegrees(camera.heading),
      height: camera.positionCartographic.height,
      flying: Boolean(camera._currentFlight),
    },
    homePose: document.body.dataset.eyeHomePose ?? null,
    intro: document.body.dataset.eyeIntro ?? null,
    skin: document.body.dataset.eyeSkin ?? null,
    disk: center
      ? { cx: center.x * scale, cy: center.y * scale, r: radiusCss * scale }
      : null,
    diskCss: center ? { cx: center.x, cy: center.y, r: radiusCss } : null,
    sun: { sx, sy, terminatorDeg: null },
    scene: {
      skyBoxShow: scene.skyBox?.show ?? null,
      skyBoxSources: scene.skyBox?.sources
        ? Object.values(scene.skyBox.sources).map(String)
        : null,
      background: scene.backgroundColor.toCssColorString(),
      globeShow: scene.globe.show,
      enableLighting: scene.globe.enableLighting,
      showGroundAtmosphere: scene.globe.showGroundAtmosphere,
      skyAtmosphere: scene.skyAtmosphere
        ? {
            show: scene.skyAtmosphere.show,
            lightIntensity: scene.skyAtmosphere.atmosphereLightIntensity,
            brightnessShift: scene.skyAtmosphere.brightnessShift,
          }
        : null,
      layers,
    },
    grid: {
      pressed: document
        .getElementById('eye-grid')
        ?.getAttribute('aria-pressed'),
      graticule,
    },
  };
}

/**
 * Piel Editorial (T1): tokens, tipografía por rol, barra sin caja, sin
 * colores neón y mono solo para números, sobre nodos visibles.
 */
function readSkinState() {
  const NEON = [
    [0, 212, 255],
    [0, 255, 80],
    [54, 220, 255],
    [143, 224, 176],
    [255, 68, 68],
  ];
  const rgb = (color) => {
    const m = /rgba?\(([^)]+)\)/.exec(color || '');
    if (!m) return null;
    const p = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  const isNeon = (color) => {
    const v = rgb(color);
    return Boolean(
      v &&
      v.a > 0.05 &&
      NEON.some((n) => n.every((x, i) => Math.abs(x - v.c[i]) <= 2)),
    );
  };
  const chain = (el) => {
    let value = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement)
      value *= Number(getComputedStyle(n).opacity || 1);
    return value;
  };
  const visible = (el) => {
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return (
      st.display !== 'none' &&
      st.visibility !== 'hidden' &&
      chain(el) > 0.05 &&
      r.width > 1 &&
      r.height > 1 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < innerHeight &&
      r.left < innerWidth
    );
  };
  const family = (el) => (el ? getComputedStyle(el).fontFamily : null);
  const neon = [];
  const monoText = [];
  const cesium = document.querySelector('.cesium-widget');
  for (const el of document.body.querySelectorAll('*')) {
    if (cesium?.contains(el) || !visible(el)) continue;
    const st = getComputedStyle(el);
    const painted = [
      ['color', st.color],
      ['backgroundColor', st.backgroundColor],
      ...['Top', 'Right', 'Bottom', 'Left']
        .filter((side) => Number.parseFloat(st[`border${side}Width`]) > 0)
        .map((side) => [`border${side}Color`, st[`border${side}Color`]]),
    ];
    for (const [prop, value] of painted)
      if (isNeon(value))
        neon.push({
          key: el.id || String(el.className).slice(0, 40) || el.tagName,
          prop,
          value,
        });
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join('')
      .trim();
    if (own && /mono/i.test(st.fontFamily) && !/\d/.test(own) && own.length > 3)
      monoText.push({ text: own.slice(0, 40), key: el.id || el.tagName });
  }
  const dock = document.querySelector('.eye-function-dock');
  const dockStyle = dock ? getComputedStyle(dock) : null;
  const labels = [
    ...document.querySelectorAll(
      '.eye-kicker,.eye-dock-kicker,.eye-dock-keyvalue dt,.eye-dock-tab,.eye-telemetry span',
    ),
  ]
    .filter(visible)
    .map((el) => ({
      text: el.textContent.trim().slice(0, 30),
      family: family(el),
    }))
    .filter(({ family: f }) => !/^"?Space Grotesk/.test(f));
  const titles = [
    '#eye-mission-dock-title',
    '.eye-dock-title',
    '#eye-panel-title',
  ]
    .map((sel) => ({ sel, family: family(document.querySelector(sel)) }))
    .filter(({ family: f }) => f !== null && !/^"?Instrument Serif/.test(f));
  return {
    skin: document.body.dataset.eyeSkin ?? null,
    paper: getComputedStyle(document.documentElement)
      .getPropertyValue('--ei-paper')
      .trim(),
    functionDock: dockStyle
      ? {
          backgroundImage: dockStyle.backgroundImage,
          backgroundAlpha: rgb(dockStyle.backgroundColor)?.a ?? 0,
          borderAlpha:
            Number.parseFloat(dockStyle.borderTopWidth) > 0
              ? (rgb(dockStyle.borderTopColor)?.a ?? 0)
              : 0,
        }
      : null,
    labels,
    titles,
    neon: neon.slice(0, 20),
    neonTotal: neon.length,
    monoText: monoText.slice(0, 20),
    monoTotal: monoText.length,
  };
}

/** Lienzo de Cesium recién pintado, como PNG. */
const canvasPng = async (page) =>
  Buffer.from(
    await page.evaluate(() => {
      const viewer = window.__godsEyeView.viewer;
      viewer.render();
      return viewer.scene.canvas.toDataURL('image/png').split(',')[1];
    }),
    'base64',
  );

/** Captura sin texto: el fondo real bajo cada rótulo. */
async function textlessShot(page) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = '__vis-notext';
    style.textContent =
      '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;transition:none!important;caret-color:transparent!important}::placeholder{color:transparent!important}';
    document.head.append(style);
  });
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const shot = await page.screenshot();
  await page.evaluate(() => document.getElementById('__vis-notext')?.remove());
  return shot;
}

/** Contraste AA de cada texto visible contra su fondo real (peor caso). */
function contrastFailures(texts, background) {
  const failures = [];
  for (const item of texts) {
    if (item.disabled) continue;
    const lums = regionLuminances(background, item.rect, 1);
    if (!lums.length) continue;
    const [r, g, b, a] = parseCssColor(item.color);
    const bgLum = lums.reduce((s, v) => s + v, 0) / lums.length;
    const grey = Math.round(255 * bgLum ** (1 / 2.2));
    const rgb = compositeOver([r, g, b, a * item.opacity], [grey, grey, grey]);
    const textLum = relativeLuminance(rgb);
    const worst = worstCaseBackground(lums, textLum);
    const ratio = luminanceContrast(textLum, worst);
    const large = item.size >= 24 || (item.size >= 18.66 && item.weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need)
      failures.push({
        text: item.text,
        key: item.key,
        size: item.size,
        ratio: Number(ratio.toFixed(2)),
        need,
      });
  }
  return failures;
}

async function measureViewport(browser, viewport) {
  const suffix = suffixOf(viewport);
  const mobile = viewport.width <= 430;
  const page = await openApp(browser, result, baseUrl, pageViewport(viewport), {
    enableSatellites: false,
    requireNorad: null,
  });
  const readyAt = Date.now();
  let storySeenAt = null;
  while (Date.now() - readyAt < HEADLINE_WINDOW_MS && storySeenAt === null) {
    const seen = await page.evaluate(() => {
      const story = document.querySelector('.eye-story');
      if (!story) return false;
      const s = getComputedStyle(story);
      return (
        s.display !== 'none' && s.visibility !== 'hidden' && s.opacity > 0.5
      );
    });
    if (seen) storySeenAt = Date.now() - readyAt;
    else await sleep(150);
  }
  await waitForRest(page);
  const state = await page.evaluate(readRestState);
  const shot = await page.screenshot({
    path: path.join(out, `rest-${suffix}.png`),
  });
  result.screenshots.push(`rest-${suffix}.png`);
  const bare = await textlessShot(page);
  await fs.writeFile(path.join(out, `rest-${suffix}-notext.png`), bare);
  const canvasBuffer = await canvasPng(page);
  await fs.writeFile(path.join(out, `canvas-${suffix}.png`), canvasBuffer);
  const background = await decodePng(bare);
  const globe = await decodePng(canvasBuffer);
  const composite = await decodePng(shot);
  // Lo que no es escena en la captura compuesta: cajas, textos y superficies.
  const uiRects = [
    ...state.boxes.map(({ rect }) => rect),
    ...state.texts.map(({ rect }) => rect),
    ...state.named,
  ].map(({ left, top, right, bottom }) => ({
    left: left - 2,
    top: top - 2,
    right: right + 2,
    bottom: bottom + 2,
  }));

  // 1 · Una sola superficie de reposo fuera de las zonas permitidas.
  const rest = restSurfaceCount(state.boxes);
  check(`vis-01-rest-surfaces-${suffix}`, rest.count <= 1, {
    allowedOutsideZones: 1,
    ...rest,
    boxes: state.boxes,
  });
  // 2 · Sin objetivo no hay Mission Dock (D1-A).
  check(`vis-02-no-dock-at-rest-${suffix}`, !state.dock.visible, state.dock);
  // 3 · USGS bajo demanda (D3).
  check(`vis-03-usgs-hidden-${suffix}`, !state.glanceVisible, {
    glanceVisible: state.glanceVisible,
  });
  // 4 · «Datos avanzados de vista» oculto en reposo (D2).
  check(`vis-04-advanced-hidden-${suffix}`, !state.advancedVisible, {
    advancedVisible: state.advancedVisible,
  });
  // 5 · Suelo de texto (14 px móvil / 12 px escritorio), atribuciones aparte.
  const small = textFloorViolations(state.texts, { mobile });
  const credits = state.texts.filter((t) => t.attribution);
  check(`vis-05-text-floor-${suffix}`, small.length === 0, {
    floor: mobile ? 14 : 12,
    violations: small
      .slice(0, 25)
      .map(({ text, key, size }) => ({ text, key, size })),
    total: small.length,
    attributionSizes: [...new Set(credits.map((t) => t.size))],
  });
  // 6 · Contraste AA contra el fondo real (captura sin texto).
  const lowContrast = contrastFailures(state.texts, background);
  check(`vis-06-contrast-aa-${suffix}`, lowContrast.length === 0, {
    measured: state.texts.length,
    exemptDisabled: state.texts.filter((t) => t.disabled).map((t) => t.text),
    failures: lowContrast.slice(0, 25),
    total: lowContrast.length,
    method: 'p90/p10 de luminancia bajo el rectángulo en captura sin texto',
  });
  // 7 · Sin scroll horizontal ni solapes entre superficies.
  const pairs = overlaps(state.named);
  // §6.10 / V-06: ningún crédito queda fuera de pantalla (ni el «no en vivo»).
  const creditsOut = creditOverflow(state.credits, state.viewport.width);
  check(
    `vis-07-no-hscroll-no-overlap-${suffix}`,
    state.overflowX <= 0 && pairs.length === 0 && creditsOut.length === 0,
    {
      overflowX: state.overflowX,
      overlaps: pairs,
      creditsOutside: creditsOut,
      credits: state.credits,
      surfaces: state.named,
    },
  );
  // 8 · Pose inicial: pitch esperado y terminador visible (día y noche).
  const dayNight = state.disk ? diskDayNight(globe, state.disk) : null;
  const terminatorDeg = terminatorAngleFromSun(state.sun.sx, state.sun.sy);
  const expectedPitch = state.homePose === 'tilt' ? -70 : -90;
  const angleOk =
    state.homePose !== 'solar' ||
    (terminatorDeg >= TERMINATOR_RANGE[0] &&
      terminatorDeg <= TERMINATOR_RANGE[1]);
  check(
    `vis-08-camera-terminator-${suffix}`,
    Math.abs(state.camera.pitch - expectedPitch) <= 2 &&
      dayNight &&
      dayNight.ratio < DAY_NIGHT_RATIO_MAX &&
      angleOk,
    {
      camera: state.camera,
      homePose: state.homePose,
      expectedPitch,
      terminatorDeg,
      dayNight,
      disk: state.disk,
    },
  );
  // 9 · Cielo: skyBox visible y sobrio.
  const sky = state.diskCss
    ? skyStats(composite, state.diskCss, {
        bright: SKY_BRIGHT_LUM,
        exclude: uiRects,
      })
    : null;
  check(
    `vis-09-sky-sober-${suffix}`,
    state.scene.skyBoxShow === true &&
      state.scene.background === 'rgb(0,0,0)' &&
      // D4: cielo propio generado desde catálogo real (public/sky/).
      Boolean(
        state.scene.skyBoxSources?.some((src) => src.includes('/sky/')),
      ) &&
      sky &&
      sky.p99 < SKY_P99_MAX &&
      sky.brightFraction < SKY_BRIGHT_FRACTION_MAX,
    {
      skyBoxShow: state.scene.skyBoxShow,
      skyBoxSources: state.scene.skyBoxSources,
      background: state.scene.background,
      sky,
      source: 'captura compuesta (page.screenshot) sin rectángulos de UI',
      thresholds: {
        p99: SKY_P99_MAX,
        brightLum: SKY_BRIGHT_LUM,
        brightFraction: SKY_BRIGHT_FRACTION_MAX,
      },
    },
  );
  // 9b · La Tierra es lo único que brilla: sin velo ni ojo de cerradura.
  const tint = state.diskCss
    ? skyTint(composite, state.diskCss, { exclude: uiRects })
    : null;
  check(
    `vis-09b-sky-no-veil-${suffix}`,
    tint &&
      tint.greenCast < SKY_GREEN_CAST_MAX &&
      (tint.keyholeStep === null || tint.keyholeStep < SKY_KEYHOLE_STEP_MAX),
    {
      tint,
      source: 'captura compuesta (page.screenshot) sin rectángulos de UI',
      thresholds: {
        greenCast: SKY_GREEN_CAST_MAX,
        keyholeStep: SKY_KEYHOLE_STEP_MAX,
      },
    },
  );
  // 10 · Iluminación solar y capa nocturna.
  const night = state.scene.layers.find(
    (l) => l.show && l.nightAlpha >= 0.99 && l.dayAlpha <= 0.01,
  );
  check(
    `vis-10-lighting-night-${suffix}`,
    state.scene.globeShow &&
      state.scene.enableLighting === true &&
      state.scene.layers.length >= 2 &&
      Boolean(night),
    { scene: state.scene },
  );
  // 11 · Halo atmosférico: anillo de luminancia intermedia fuera del limbo.
  // El casquete de la atmósfera de Cesium es 1,025 R: el anillo se mide
  // entre el borde antialias (+2 px) y ese casquete (≈ 9 px en escritorio,
  // ≈ 4,5 px en teléfono). Fuera de él solo hay cielo.
  const halo = state.diskCss
    ? haloRing(composite, state.diskCss, {
        inner: 2,
        outer: 2 + state.diskCss.r * 0.025,
        exclude: uiRects,
      })
    : null;
  const skyFloor = Math.max(halo?.skyMedian ?? 0, 0.002);
  check(
    `vis-11-halo-${suffix}`,
    halo &&
      halo.ringMax > 2 * skyFloor &&
      halo.ringMax >= 0.02 &&
      halo.ringMax <= 0.8,
    {
      halo,
      source: 'captura compuesta (page.screenshot) sin rectángulos de UI',
      skyAtmosphere: state.scene.skyAtmosphere,
    },
  );
  // 12 · Retícula lat/lon apagada al arrancar.
  check(
    `vis-12-grid-off-${suffix}`,
    state.grid.pressed === 'false' &&
      (!state.grid.graticule ||
        !state.grid.graticule.show ||
        state.grid.graticule.entities === 0),
    state.grid,
  );
  // 16 · Piel Editorial: tokens, tipografía por rol, sin neón, mono = números.
  const skin = await page.evaluate(readSkinState);
  check(
    `vis-16-editorial-skin-${suffix}`,
    skin.skin === 'editorial' &&
      skin.paper === '#eef1e9' &&
      skin.functionDock &&
      skin.functionDock.backgroundImage === 'none' &&
      // §7: en teléfono la navegación es la barra inferior con fondo propio;
      // «sin caja» es la barra superior de escritorio (§6.1).
      (mobile || skin.functionDock.backgroundAlpha <= 0.08) &&
      skin.functionDock.borderAlpha <= 0.2 &&
      skin.labels.length === 0 &&
      skin.titles.length === 0 &&
      skin.neonTotal === 0 &&
      skin.monoTotal === 0,
    skin,
  );
  // 14 · Fuentes del sistema declaradas y cargadas.
  const fonts = await page.evaluate(async (probes) => {
    await Promise.allSettled(probes.map((probe) => document.fonts.load(probe)));
    await document.fonts.ready;
    return [...document.fonts].map((face) => ({
      family: face.family,
      style: face.style,
      weight: face.weight,
      status: face.status,
    }));
  }, FONT_PROBES);
  const missing = FONT_FAMILIES.filter(
    (family) => !fontFaceLoaded(fonts, family),
  );
  check(`vis-14-fonts-loaded-${suffix}`, missing.length === 0, {
    missing,
    faces: fonts,
  });
  // 13 · Titular ≤3 s y desvanecido tras la primera interacción (T3).
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.wheel({ deltaY: 40 });
  await sleep(900);
  const storyAfter = await page.evaluate(() => {
    const story = document.querySelector('.eye-story');
    if (!story) return null;
    const s = getComputedStyle(story);
    return {
      opacity: Number(s.opacity),
      visibility: s.visibility,
      display: s.display,
    };
  });
  const faded =
    storyAfter &&
    (storyAfter.display === 'none' ||
      storyAfter.visibility === 'hidden' ||
      storyAfter.opacity < 0.05);
  check(`vis-13-headline-${suffix}`, storySeenAt !== null && faded, {
    storySeenAtMs: storySeenAt,
    windowMs: HEADLINE_WINDOW_MS,
    storyAfter,
  });
  result.snapshots[suffix] = {
    skin: state.skin,
    intro: state.intro,
    camera: state.camera,
    homePose: state.homePose,
    terminatorDeg,
  };
  await page.close();
}

/** Estado de satélites y del pie en un solo frame (vis-17 y vis-18). */
function readSatelliteState() {
  const { viewer, dataManager } = window.__godsEyeView;
  const module = dataManager.layers.get('satellites')?.module;
  const camera = viewer.camera;
  const deg = (v) => (v * 180) / Math.PI;
  const tracked = viewer.trackedEntity;
  const model = tracked?.gevLabelModel ?? null;
  const color = tracked?.point?.color?.getValue?.(viewer.clock.currentTime);
  const overlay = window.__gevWorldOverlay?.getDiagnostics?.() ?? null;
  return {
    footer: {
      altitude: document.getElementById('eye-camera-altitude')?.textContent,
      heading: document.getElementById('eye-camera-heading')?.textContent,
      position: document.getElementById('eye-camera-position')?.textContent,
    },
    camera: {
      heightM: camera.positionCartographic.height,
      headingDeg: deg(camera.heading),
      pitchDeg: deg(camera.pitch),
    },
    tracked: Boolean(tracked),
    detectable: module?.getDetectableObjects?.().length ?? null,
    paintedBySource: overlay?.paintedBySource ?? null,
    trackedPointCss: color?.toCssHexString?.() ?? null,
    card: model
      ? {
          accent: model.accent,
          typeface: model.typeface ?? null,
          details: model.details,
        }
      : null,
  };
}

/**
 * 17 · Telemetría con objetivo fijado (V-04/V-05): el pie sigue a la cámara
 * real mientras la gobierna el EntityView. 18 · Satélites Editorial (solo con
 * satStyle=editorial): 0 rótulos y 0 objetos de detección en Global, punto y
 * ficha fijados en ámbar y Grotesk, sin jerga en mayúsculas.
 */
async function measureTrackedTelemetry(browser) {
  const viewport = VIEWPORTS[0];
  const flags = readGlobeFlags(new URL(baseUrl).search);
  const page = await openApp(browser, result, baseUrl, pageViewport(viewport), {
    enableSatellites: true,
    requireNorad: 25544,
  });
  await waitForRest(page);
  await sleep(2000);
  const global = await page.evaluate(readSatelliteState);
  await trackById(page, 25544);
  await sleep(TRACK_SETTLE_MS);
  const iss = await page.evaluate(readSatelliteState);
  await page.screenshot({ path: path.join(out, 'tracked-iss-1600x900.png') });
  result.screenshots.push('tracked-iss-1600x900.png');
  const shownKm = telemetryAltitudeKm(iss.footer.altitude);
  const realKm = iss.camera.heightM / 1000;
  const headingShown = Number.parseFloat(iss.footer.heading);
  const headingDelta = Math.abs(
    ((headingShown - iss.camera.headingDeg + 540) % 360) - 180,
  );
  check(
    'vis-17-telemetry-follows-tracked-camera',
    iss.tracked &&
      shownKm !== null &&
      Math.abs(shownKm - realKm) <=
        Math.max(
          TELEMETRY_ALT_TOLERANCE_KM,
          realKm * TELEMETRY_ALT_TOLERANCE_REL,
        ) &&
      headingDelta <= 1,
    { shownKm, realKm, headingShown, headingDelta, global: global.footer, iss },
  );
  if (flags.satStyle === 'editorial') {
    const shouting = (iss.card?.details ?? []).filter((line) =>
      /^(STATION|NAV|GEO|CUBESAT|VISUAL|COMMS|DOCKED)/.test(line),
    );
    check(
      'vis-18-satellites-editorial',
      global.detectable === 0 &&
        (global.paintedBySource?.['satellites-iss'] ?? 0) === 0 &&
        iss.trackedPointCss === '#e6b46d' &&
        iss.card?.accent === '#e6b46d' &&
        iss.card?.typeface === 'editorial' &&
        shouting.length === 0,
      { flags, global, iss, shouting },
    );
  }
  await page.close();
}

/** 15 · Movimiento reducido: sin vuelo de entrada, pose final directa. */
async function measureReducedMotion(browser) {
  const viewport = VIEWPORTS[0];
  const page = await openApp(browser, result, baseUrl, pageViewport(viewport), {
    enableSatellites: false,
    requireNorad: null,
    beforeGoto: (p) =>
      p.emulateMediaFeatures([
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ]),
  });
  await sleep(40);
  const read = () =>
    page.evaluate(() => ({
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      flying: Boolean(window.__godsEyeView.viewer.camera._currentFlight),
      intro: document.body.dataset.eyeIntro ?? null,
      height: window.__godsEyeView.viewer.camera.positionCartographic.height,
    }));
  const first = await read();
  await sleep(1500);
  const later = await read();
  const drift = Math.abs(later.height - first.height) / first.height;
  check(
    'vis-15-reduced-motion-no-intro-flight',
    first.reduced &&
      !first.flying &&
      first.intro !== 'running' &&
      drift < 0.01 &&
      later.height >= 17_000_000,
    { first, later, drift },
  );
  await page.close();
}

const { browser, close } = await launchBrowser('eye-visual-');
try {
  for (const viewport of VIEWPORTS) await measureViewport(browser, viewport);
  await measureReducedMotion(browser);
  await measureTrackedTelemetry(browser);
} catch (error) {
  result.fatal = String(error?.stack || error);
  console.error(result.fatal);
} finally {
  await close();
  await finishRun(result, resultPath);
}
