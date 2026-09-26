/**
 * Sondas de página del arnés visual Editorial (scripts/eyeinsky-visual.mjs).
 * Cada función se pasa a `page.evaluate`: es autocontenida y solo lee la app
 * por `window.__godsEyeView`, `window.__eyeinsky` y el DOM.
 */

/** Titular de entrada `.eye-story` (T3): visible, texto y estado publicado. */
export function readStory() {
  const story = document.querySelector('.eye-story');
  if (!story) return null;
  const s = getComputedStyle(story);
  const opacity = Number(s.opacity);
  const shown =
    s.display !== 'none' && s.visibility !== 'hidden' && opacity > 0.5;
  const clock = window.__godsEyeView?.sceneClock?.getState?.() ?? null;
  const title = story.querySelector('.eye-story-title');
  return {
    shown,
    faded: s.display === 'none' || s.visibility === 'hidden' || opacity < 0.05,
    state: document.body.dataset.eyeStory ?? null,
    text: story.innerText,
    lede: story.querySelector('.eye-story-lede')?.textContent ?? '',
    ariaLive: story.getAttribute('aria-live'),
    serif: title
      ? /Instrument Serif/.test(getComputedStyle(title).fontFamily)
      : false,
    transition: s.transitionDuration,
    clockLive:
      clock?.mode === 'live' && Math.abs(Number(clock.driftMs) || 0) < 5000,
  };
}

/** Todo lo que se mide del DOM y de la escena en reposo, en un solo frame. */
export function readRestState() {
  const ZONES = [
    [
      'topbar',
      '.eye-orbit-brand,.eye-function-dock,.eye-utility-cluster,.eye-topbar',
    ],
    ['search', '.eye-search'],
    // V-01: en reposo solo barra, titular y tira (telemetría y carril de
    // cámara esperan a la primera interacción; ya no son zonas permitidas).
    ['story', '.eye-story'],
    ['time', '[data-eye-time-host]'],
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
      present: Boolean(dock),
      hidden: Boolean(dock?.hidden),
      dataVisible: dock?.dataset.visible ?? null,
      visible: visible(dock),
      contextKind: dock?.dataset.contextKind ?? null,
      contextKey: dock?.dataset.contextKey ?? null,
    },
    reveal: document.body.dataset.eyeReveal ?? null,
    // Lecturas de cámara VISIBLES (V-04): cada una una sola vez.
    readings: (() => {
      const count = (re) =>
        [...document.querySelectorAll('dt, span, strong, b')].filter(
          (el) => visible(el) && re.test(el.textContent.trim()),
        ).length;
      return {
        altitude: count(/^altura\b/i),
        heading: count(/^rumbo\b/i),
        map: count(/^mapa( activo)?$/i),
        sectorStatic: Boolean(
          [...document.querySelectorAll('span, strong')].find(
            (el) => visible(el) && /^campo$/i.test(el.textContent.trim()),
          ),
        ),
      };
    })(),
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
export function readSkinState() {
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

/** Anatomía del panel contextual con objetivo (vis-20). */
export function readTargetPanel() {
  const dock = document.getElementById('eye-mission-dock');
  const box = dock.getBoundingClientRect();
  const title = dock.querySelector('.eye-dock-title');
  const facts = dock.querySelector('.eye-dock-keyvalues');
  const columns = facts
    ? getComputedStyle(facts).gridTemplateColumns.split(' ').filter(Boolean)
        .length
    : 0;
  const actions = [...dock.querySelectorAll('.eye-dock-actions button')]
    .filter((b) => b.getClientRects().length)
    .map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.dataset.eyeDockAction, width: r.width, height: r.height };
    });
  const inspectEl = dock.querySelector('[data-eye-dock-action="inspect"]');
  const group = dock
    .querySelector('.eye-dock-actions')
    ?.getBoundingClientRect();
  const inspect = inspectEl
    ? {
        primary:
          getComputedStyle(inspectEl).backgroundColor ===
            'rgb(238, 241, 233)' || inspectEl.disabled,
        fullRow:
          Math.abs(inspectEl.getBoundingClientRect().width - group.width) < 2,
      }
    : null;
  return {
    visible: !dock.hidden && dock.dataset.visible === 'true',
    reveal: document.body.dataset.eyeReveal,
    story: document.body.dataset.eyeStory,
    storyText: document.querySelector('.eye-story')?.textContent ?? '',
    title: title?.textContent ?? '',
    titleFont: title ? getComputedStyle(title).fontFamily : '',
    kicker: dock.querySelector('.eye-dock-kicker')?.textContent ?? '',
    tabs: [...dock.querySelectorAll('[role="tab"]')].map((t) => t.id),
    factColumns: columns,
    actions,
    inspect,
    gapRight: Math.round(innerWidth - box.right),
    gapBottom: Math.round(innerHeight - box.bottom),
  };
}

/** Estado de satélites y del pie en un solo frame (vis-17 y vis-18). */
export function readSatelliteState() {
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
