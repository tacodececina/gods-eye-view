/**
 * Arnés visual Editorial · marcadores (T4) y móvil (T5).
 *
 * vis-19 marcadores sin rojo (satélites + sismos de FIXTURE etiquetado),
 * vis-22 flecha de borde del objetivo fijado, vis-23…26 teléfono 390×844
 * (barra visible con panel, una sola hoja, pie en una línea con #eye-map-label
 * alcanzable y Compartir fuera del carril, zoom 200 % CDP) y vis-27…29 en
 * teléfono (cerrar suelta el objetivo, valores Luna enteros, foco visible en
 * Compartir en 390 y 360). Solo lee la app por
 * `window.__godsEyeView`, `window.__eyeinsky` y el DOM.
 */
import { sleep } from './eyeinsky-p4-run.mjs';
import { openApp, trackById } from './eyeinsky-p4-page.mjs';
import {
  checkCloseReleases,
  checkMoonValues,
  checkShareFocus,
} from './eyeinsky-visual-reveal.mjs';

const USGS_FEED =
  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
/** FIXTURE (no son datos en vivo): tres sismos a tres profundidades. */
const QUAKE_FIXTURE = [
  ['fixture-vis-a', 2.6, 23, -102, 10],
  ['fixture-vis-b', 4.5, 35, 140, 120],
  ['fixture-vis-c', 6.1, -20, -70, 500],
];
const AMBER = '#e6b46d';
const LIVE = '#a6d7c2';
const HUBBLE_NORAD = 20580;

function fixtureBody() {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: QUAKE_FIXTURE.map(([id, mag, lat, lon, depth]) => ({
      type: 'Feature',
      id,
      properties: {
        mag,
        place: `FIXTURE ${id}`,
        time: Date.now() - 60_000,
        updated: Date.now(),
        url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
      },
      geometry: { type: 'Point', coordinates: [lon, lat, depth] },
    })),
  });
}

async function interceptUsgs(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url() !== USGS_FEED) return void request.continue();
    void request.respond({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: fixtureBody(),
    });
  });
}

/** Colores de los puntos de satélite y de los sismos en un fotograma. */
function readMarkers({ issId, hubbleId }) {
  const C = window.__CESIUM__;
  const { viewer } = window.__godsEyeView;
  const time = viewer.clock.currentTime;
  const hex = (c) => (c ? c.toCssHexString().slice(0, 7) : null);
  const red = (c) => c && c.red > 0.8 && c.green < 0.4 && c.blue < 0.4;
  const points = [];
  const walk = (p) => {
    if (!p || p.isDestroyed?.()) return;
    if (p instanceof C.PointPrimitiveCollection)
      for (let i = 0; i < p.length; i += 1) points.push(p.get(i));
    else if (p instanceof C.PrimitiveCollection)
      for (let i = 0; i < p.length; i += 1) walk(p.get(i));
  };
  walk(viewer.scene.primitives);
  const byId = (id) => points.find((p) => p.id === id);
  const quakes = [];
  for (let i = 0; i < viewer.dataSources.length; i += 1) {
    const source = viewer.dataSources.get(i);
    if (source.name !== 'earthquakes') continue;
    for (const entity of source.entities.values)
      quakes.push({
        id: entity.id,
        mag: entity.properties?.mag?.getValue?.(time),
        ellipse: Boolean(entity.ellipse),
        pixelSize: entity.point?.pixelSize?.getValue?.(time) ?? null,
        color: hex(entity.point?.color?.getValue?.(time)),
        red: red(entity.point?.color?.getValue?.(time)),
      });
  }
  const overlay = window.__gevWorldOverlay?.getDiagnostics?.() ?? null;
  return {
    satellitePoints: points.length,
    redSatellitePoints: points.filter((p) => red(p.color)).length,
    iss: hex(byId(issId)?.color),
    hubble: hex(byId(hubbleId)?.color),
    quakes,
    painted: overlay?.paintedBySource ?? null,
  };
}

/** 19 · Marcadores sin rojo; sismos ámbar por magnitud, sin rótulo en reposo. */
export async function measureMarkers({ browser, result, check, baseUrl, out }) {
  const page = await openApp(
    browser,
    result,
    baseUrl,
    { width: 1600, height: 900, deviceScaleFactor: 1 },
    { enableSatellites: true, requireNorad: 25544, beforeGoto: interceptUsgs },
  );
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('earthquakes', true, {
      origin: 'user',
    }),
  );
  await page
    .waitForFunction(() => window.__eyeinsky.rows.length >= 3, {
      timeout: 20_000,
    })
    .catch(() => {});
  await sleep(2500);
  const markers = await page.evaluate(readMarkers, {
    issId: 25544,
    hubbleId: HUBBLE_NORAD,
  });
  await page.screenshot({ path: `${out}/markers-1600x900.png` });
  result.screenshots.push('markers-1600x900.png');
  const expectedPx = (mag) => Math.max(4, 4 + (mag - 2.5) * 3);
  check(
    'vis-19-markers-without-red',
    markers.satellitePoints > 0 &&
      markers.redSatellitePoints === 0 &&
      markers.iss === LIVE &&
      (markers.hubble === null || markers.hubble !== '#ff4444') &&
      markers.quakes.length === QUAKE_FIXTURE.length &&
      markers.quakes.every(
        (q) =>
          !q.ellipse &&
          !q.red &&
          q.color === AMBER &&
          Math.abs(q.pixelSize - expectedPx(q.mag)) < 0.01,
      ) &&
      (markers.painted?.earthquakes ?? 0) === 0,
    { fixture: 'USGS FIXTURE (3 sismos), no en vivo', ...markers },
  );
  await measureEdgeArrow(page, check, out, result);
  await page.close();
}

/** Estado de la flecha de borde y de su texto en el panel. */
function readEdgeArrow() {
  const arrow = document.querySelector('.eye-edge-arrow');
  const line = document.querySelector('.eye-dock-offscreen');
  return {
    present: Boolean(arrow),
    visible: Boolean(arrow && !arrow.hidden),
    mode: arrow?.dataset.mode ?? null,
    ariaHidden: arrow?.getAttribute('aria-hidden') ?? null,
    text: arrow?.textContent ?? '',
    lineVisible: Boolean(line && !line.hidden),
    line: line?.textContent ?? '',
  };
}

/** 22 · Objetivo fijado fuera de cuadro: flecha al borde; clic = Centrar. */
async function measureEdgeArrow(page, check, out, result) {
  await trackById(page, 25544);
  await sleep(4000);
  await page.evaluate(() => {
    const module =
      window.__godsEyeView.dataManager.layers.get('satellites').module;
    module.releaseCameraOwnership?.({ origin: 'user' });
  });
  await sleep(400);
  await page.evaluate(() => {
    const C = window.__CESIUM__;
    const { viewer } = window.__godsEyeView;
    const at = viewer.camera.positionCartographic;
    viewer.camera.setView({
      destination: C.Cartesian3.fromRadians(
        at.longitude + Math.PI,
        -at.latitude,
        20_000_000,
      ),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    viewer.scene.requestRender();
  });
  await sleep(900);
  const away = await page.evaluate(readEdgeArrow);
  await page.screenshot({ path: `${out}/edge-arrow-1600x900.png` });
  result.screenshots.push('edge-arrow-1600x900.png');
  await page.evaluate(() => document.querySelector('.eye-edge-arrow')?.click());
  await sleep(3500);
  const centered = await page.evaluate(readEdgeArrow);
  check(
    'vis-22-edge-arrow-for-offscreen-target',
    away.visible &&
      ['edge', 'behind'].includes(away.mode) &&
      away.ariaHidden === 'true' &&
      away.lineVisible &&
      /Fuera de vista|Tras la Tierra/.test(away.line) &&
      /Centrar/.test(away.line) &&
      !centered.visible &&
      !centered.lineVisible,
    { away, centered },
  );
}

/** Barra, hojas, pie y créditos del teléfono en un fotograma. */
function readPhone() {
  const box = (el) => {
    if (!el || el.hidden || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const hits = (el) => {
    const r = el?.getBoundingClientRect();
    if (!r || !r.width) return false;
    const top = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    return Boolean(top && (top === el || el.contains(top)));
  };
  const nav = [...document.querySelectorAll('.eye-function-dock button')];
  const telemetry = document.querySelector('.eye-telemetry');
  const readings = [
    ...(telemetry?.querySelectorAll('[data-eye-reading]') ?? []),
  ];
  const dock = document.getElementById('eye-mission-dock');
  const workspace = document.getElementById('eye-workspace');
  const visible = (el) =>
    Boolean(box(el)) &&
    getComputedStyle(el).display !== 'none' &&
    getComputedStyle(el).visibility !== 'hidden';
  return {
    nav: nav.map((b) => ({
      label: b.textContent.trim(),
      hit: hits(b),
      opacity: Number(
        getComputedStyle(b.closest('.eye-function-dock')).opacity,
      ),
      height: b.getBoundingClientRect().height,
      font: Number.parseFloat(
        getComputedStyle(b.querySelector('strong')).fontSize,
      ),
    })),
    sheets: { dock: visible(dock), workspace: visible(workspace) },
    telemetry: box(telemetry),
    readingTops: readings.map((r) => Math.round(r.getBoundingClientRect().top)),
    mapInTelemetry: Boolean(
      telemetry?.contains(document.getElementById('eye-map-label')),
    ),
    shareInTelemetry: Boolean(
      telemetry?.contains(document.getElementById('eye-share')),
    ),
    chip: box(document.querySelector('[data-eye-time-chip]')),
    overflowX: document.documentElement.scrollWidth - innerWidth,
  };
}

/** ¿#eye-map-label se alcanza desplazando la línea de telemetría? */
function mapReachable() {
  const label = document.getElementById('eye-map-label');
  label.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = label.getBoundingClientRect();
  const top = document.elementFromPoint(
    r.left + r.width / 2,
    r.top + r.height / 2,
  );
  return {
    hit: Boolean(top && (top === label || label.contains(top))),
    inside: r.left >= 0 && r.right <= innerWidth,
  };
}

/**
 * 25 · Pie del teléfono en una línea, ya revelado (V-02: la telemetría
 * aparece con la primera interacción, lejos del centro).
 */
async function checkPhoneFoot(page, check, viewport) {
  await page.mouse.move(viewport.width * 0.3, viewport.height * 0.35);
  await page.mouse.wheel({ deltaY: 1 });
  await sleep(900);
  const rest = await page.evaluate(readPhone);
  const map = await page.evaluate(mapReachable);
  // T3 paso 8 / reparación T5: Compartir ya no vive en el carril desplazable
  // (con máscara, el foco quedaba fuera de la vista; WCAG 2.4.7/2.4.11). Su
  // alcance y su foco visible los exige vis-29 en Más.
  check(
    'vis-25-phone-foot-one-line',
    rest.telemetry &&
      rest.telemetry.bottom - rest.telemetry.top <= 52 &&
      new Set(rest.readingTops.map((t) => Math.round(t / 8))).size <= 1 &&
      rest.mapInTelemetry &&
      map.hit &&
      map.inside &&
      !rest.shareInTelemetry &&
      rest.chip &&
      rest.chip.bottom - rest.chip.top >= 44 &&
      rest.overflowX <= 0,
    { rest, map },
  );
}

/** 23–26 · El móvil se diseña (390×844). */
export async function measurePhone({ browser, result, check, baseUrl, out }) {
  const viewport = {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  };
  const page = await openApp(browser, result, baseUrl, viewport, {
    enableSatellites: false,
    requireNorad: null,
  });
  await page
    .waitForFunction(() => document.body.dataset.eyeIntro === 'done', {
      timeout: 15_000,
    })
    .catch(() => {});
  await sleep(1200);
  await checkPhoneFoot(page, check, viewport);
  // Un panel abierto: la barra inferior sigue visible y pulsable.
  await page.tap('.eye-function-dock [data-eye-view="instruments"]');
  await sleep(700);
  const panel = await page.evaluate(readPhone);
  await page.screenshot({ path: `${out}/phone-panel-390x844.png` });
  result.screenshots.push('phone-panel-390x844.png');
  check(
    'vis-23-phone-nav-visible-with-panel',
    panel.nav.length === 4 &&
      panel.nav.every(
        (b) => b.hit && b.opacity === 1 && b.height >= 44 && b.font >= 14,
      ),
    panel.nav,
  );
  await checkSingleSheet(page, check);
  await measurePhoneZoom(page, check);
  await checkPhoneRepairs({ page, check, out, result, suffix: '390x844' });
  await page.close();
  await measureNarrowPhone({ browser, result, check, baseUrl, out });
}

/** 29 y 28 en el teléfono: foco en Compartir y valores de la Luna. */
async function checkPhoneRepairs(where) {
  await checkShareFocus(where);
  await where.page.keyboard.press('Escape');
  await sleep(600);
  await checkMoonValues(where);
}

/** 360×800: foco visible en Compartir y × suelta la ISS fijada. */
async function measureNarrowPhone({ browser, result, check, baseUrl, out }) {
  const page = await openApp(
    browser,
    result,
    baseUrl,
    {
      width: 360,
      height: 800,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
    { enableSatellites: true, requireNorad: 25544 },
  );
  await page
    .waitForFunction(() => document.body.dataset.eyeIntro === 'done', {
      timeout: 15_000,
    })
    .catch(() => {});
  await sleep(1200);
  const where = { page, check, out, result, suffix: '360x800' };
  await checkShareFocus(where);
  await page.keyboard.press('Escape');
  await sleep(600);
  await trackById(page, 25544);
  await sleep(6000);
  await checkCloseReleases(where);
  await page.close();
}

/**
 * 24 · Una sola hoja: pedir el panel de misión desde Instrumentos cierra el
 * espacio de trabajo; volver a abrir un panel suspende el de misión.
 */
async function checkSingleSheet(page, check) {
  await page.tap('#eye-instrument-dossier');
  await sleep(800);
  const mission = await page.evaluate(readPhone);
  await page.tap('.eye-function-dock [data-eye-view="more"]');
  await sleep(800);
  const both = await page.evaluate(readPhone);
  check(
    'vis-24-phone-single-sheet',
    mission.sheets.dock &&
      !mission.sheets.workspace &&
      both.sheets.workspace &&
      !both.sheets.dock,
    { mission: mission.sheets, workspaceAgain: both.sheets },
  );
}

/** 26 · Zoom 200 % (CDP) en el teléfono: carril, reloj y barra alcanzables. */
async function measurePhoneZoom(page, check) {
  await page.tap('#eye-panel-close').catch(() => {});
  await sleep(500);
  const client = await page.createCDPSession();
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await sleep(600);
  const zoomed = await page.evaluate(() => {
    const viewport = window.visualViewport;
    const targets = [
      ...document.querySelectorAll(
        '.eye-instruments button, [data-eye-time-chip], .eye-function-dock button',
      ),
    ]
      .filter(
        (el) =>
          el.getClientRects().length &&
          getComputedStyle(el).visibility !== 'hidden',
      )
      .map((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return {
          label:
            el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20),
          inside:
            r.left >= -1 &&
            r.top >= -1 &&
            r.right <= viewport.width + 1 &&
            r.bottom <= viewport.height + 1,
          hit: Boolean(top && (top === el || el.contains(top))),
          width: r.width,
          height: r.height,
        };
      });
    return {
      scale: viewport.scale,
      viewport: { width: viewport.width, height: viewport.height },
      targets,
    };
  });
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await client.detach();
  const reachable = zoomed.targets.filter((t) => t.inside && t.hit);
  check(
    'vis-26-phone-zoom-200',
    zoomed.scale === 2 &&
      reachable.some((t) => /Tiempo/.test(t.label)) &&
      reachable.some((t) => /Explorar/.test(t.label)) &&
      reachable.filter((t) => /Acercar|Alejar|Vista global/.test(t.label))
        .length >= 1 &&
      reachable.every((t) => t.width >= 44 && t.height >= 44),
    zoomed,
  );
}
