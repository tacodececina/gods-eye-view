/**
 * Chequeos T8 del arnés P5 (Mission Dock Tierra–Luna) sobre la pestaña
 * principal. Cada función recibe `{page, result, check, shot}` y registra sus
 * ids con la matriz P5-xx. Los que abren pestaña propia están en
 * eyeinsky-p5-dock-tabs.mjs.
 */
import { sleep } from './eyeinsky-p4-run.mjs';
import {
  FLIGHT_MS,
  MIN_TARGET_PX,
  aimProbe,
  diffEarthState,
  earthStateProbe,
  layersProbe,
  readHeaderTargets,
  moonAction,
  settle,
  stripProbe,
  timeCmd,
} from './eyeinsky-p5-dock.mjs';

/** La Luna apuntada queda centrada en horizontal (px) en el área libre. */
const AIM_CENTER_PX = 3;
const centered = (probe) =>
  probe.ok &&
  probe.moonPx &&
  Math.abs(probe.moonPx.x - probe.canvas.width / 2) <= AIM_CENTER_PX &&
  probe.lastFraming?.inFrame === true;
const SUSPENDED_LABEL = 'Sin histórico: solo hora real';
// D5 (fase visual): el rótulo describe el reloj, no los datos.
const LIVE_TEXT = /^● Reloj en vivo \d{2}:\d{2}:\d{2} UTC$/;

import { targetsOk } from './eyeinsky-p5-dock-tabs.mjs';

const setLayers = (page, ids, on) =>
  page.evaluate(
    async (list, value) => {
      for (const id of list)
        await window.__godsEyeView.dataManager.setEnabled(id, value, {
          origin: 'user',
        });
    },
    ids,
    on,
  );

export async function checkTimeStripLive({ page, result, check }) {
  await page.evaluate(() => window.__godsEyeView.sceneClock.setNow());
  await settle(page);
  const strip = await page.evaluate(stripProbe);
  result.snapshots.timeStrip = strip;
  check(
    'time-strip-present',
    strip.present &&
      LIVE_TEXT.test(strip.text) &&
      strip.tone === 'live' &&
      strip.ariaLive === 'polite' &&
      strip.announce === 'Reloj en vivo',
    strip.present
      ? `«${strip.text}» tono ${strip.tone}; aria-live=${strip.ariaLive} «${strip.announce}»`
      : 'no hay [data-eye-time-strip]',
    ['P5-04', 'P5-05'],
  );
}

/** P5-11: simular suspende las capas en vivo; AHORA restaura el conjunto. */
export async function checkSuspension({ page, result, check }) {
  await setLayers(page, ['earthquakes', 'local-dams'], true);
  await settle(page);
  const before = await page.evaluate(layersProbe);
  await timeCmd(page, 'advance');
  await settle(page);
  const sim = {
    strip: await page.evaluate(stripProbe),
    ...(await page.evaluate(layersProbe)),
  };
  await timeCmd(page, 'now');
  await settle(page, 1_200);
  const after = {
    strip: await page.evaluate(stripProbe),
    ...(await page.evaluate(layersProbe)),
  };
  result.snapshots.suspension = { before, sim, after };
  check(
    'sim-suspends-live-layers',
    sim.strip.tone === 'sim' &&
      /^◆ Simulación ×60 \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/.test(
        sim.strip.text,
      ) &&
      !sim.enabled.includes('earthquakes') &&
      sim.enabled.includes('local-dams') &&
      sim.suspended.includes('earthquakes') &&
      sim.suspendedRows.some(
        ([id, text]) => id === 'earthquakes' && text.includes(SUSPENDED_LABEL),
      ) &&
      sim.strip.notes.some((n) => n.startsWith(SUSPENDED_LABEL)),
    `«${sim.strip.text}»; encendidas [${sim.enabled}]; suspendidas [${sim.suspended}]; notas ${JSON.stringify(sim.strip.notes)}`,
    ['P5-11'],
  );
  check(
    'ahora-restores-layers',
    JSON.stringify(after.enabled) === JSON.stringify(before.enabled) &&
      after.suspended.length === 0 &&
      after.strip.tone === 'live',
    `antes [${before.enabled}] → después [${after.enabled}]; «${after.strip.text}»`,
    ['P5-11', 'P5-05'],
  );
  await setLayers(page, ['earthquakes'], false);
}

/** Estado de partida no trivial para el retorno: pose, anillo y dock OPS. */
async function prepareEarthState(page) {
  await page.evaluate(() => {
    const g = window.__godsEyeView;
    const C = window.__CESIUM__;
    g.viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(-100, 20, 2.2e7),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    g.styleManager.setCelestialRingEnabled(true);
    document.querySelector('[data-eye-dock-pane="ops"]')?.click();
    const dock = document.getElementById('eye-mission-dock');
    if (dock.dataset.expanded !== 'true')
      dock.querySelector('[data-eye-dock-action="more"]')?.click();
  });
  await settle(page, 1_000);
}

async function checkAim(page, result, check, before) {
  await moonAction(page, 'aim-moon');
  await sleep(FLIGHT_MS);
  const aim = await page.evaluate(aimProbe);
  result.snapshots.aim = aim;
  const moved = Math.hypot(
    aim.position.x - before.camera.position.x,
    aim.position.y - before.camera.position.y,
    aim.position.z - before.camera.position.z,
  );
  check(
    'aim-moon',
    centered(aim) &&
      aim.lastFraming.kind === 'aim' &&
      moved <= 1 &&
      aim.reticle === 'on' &&
      aim.kicker === 'Objetivo · Luna',
    `Luna en ${JSON.stringify(aim.moonPx)} (centro x ${aim.canvas.width / 2}, sobre el dock: ${aim.lastFraming?.inFrame}); desvío de la mirada ${aim.angleDeg?.toFixed(3)}° (giro al área libre); la cámara se movió ${moved.toFixed(3)} m; «${aim.kicker}»; retícula ${aim.reticle}`,
    ['P5-12'],
  );
  check(
    'moon-panel-fields',
    /DISTANCIA.*km/.test(aim.panel) &&
      /s-luz/.test(aim.panel) &&
      /FASE/.test(aim.panel) &&
      /DIÁMETRO APARENTE/.test(aim.panel) &&
      /PUNTO SUBLUNAR/.test(aim.panel) &&
      /JPL DE441 · geométrico · ICRF→ITRF/.test(aim.panel) &&
      /UTC · TDB = UTC \+ 69,18 s/.test(aim.panel) &&
      /ORIENTACIÓN.*aproximada/.test(aim.panel),
    aim.panel.slice(0, 400),
    ['P5-03', 'P5-14'],
  );
}

async function checkSystem(page, result, check, shot) {
  await moonAction(page, 'earth-moon-system');
  await sleep(FLIGHT_MS);
  const sys = await page.evaluate(aimProbe);
  result.snapshots.system = sys;
  const inside = (p) =>
    p &&
    p.x >= 0 &&
    p.y >= 0 &&
    p.x <= sys.canvas.width &&
    p.y <= sys.canvas.height;
  check(
    'earth-moon-system-frames-both',
    inside(sys.moonPx) &&
      inside(sys.earthPx) &&
      sys.lastFraming?.inFrame === true,
    `Luna ${JSON.stringify(sys.moonPx)}; Tierra ${JSON.stringify(sys.earthPx)}; lienzo ${sys.canvas.width}×${sys.canvas.height}; ${JSON.stringify(sys.lastFraming)}`,
    ['P5-12'],
  );
  await shot('p5-t8-earth-moon-system.png');
}

async function checkDidacticToggle(page, result, check) {
  await moonAction(page, 'moon-scale');
  await settle(page, 400);
  const on = await page.evaluate(aimProbe);
  await moonAction(page, 'moon-scale');
  await settle(page, 400);
  const off = await page.evaluate(aimProbe);
  result.snapshots.didacticToggle = { on: on.scaleMode, off: off.scaleMode };
  check(
    'didactic-toggle',
    on.scaleMode === 'didactic' &&
      on.band === false &&
      off.scaleMode === 'physical' &&
      off.band === true,
    `ESCALA → ${on.scaleMode} (banda ${on.band ? 'oculta' : 'visible'}) → ${off.scaleMode} (banda ${off.band ? 'oculta' : 'visible'})`,
    ['P5-07'],
  );
}

/** P5-12: APUNTAR, SISTEMA, ESCALA y VOLVER A TIERRA con diff de estado. */
export async function checkMoonActions({ page, result, check, shot }) {
  await prepareEarthState(page);
  const before = await page.evaluate(earthStateProbe);
  await checkAim(page, result, check, before);
  await checkSystem(page, result, check, shot);
  await checkDidacticToggle(page, result, check);
  await moonAction(page, 'return-to-earth');
  await sleep(FLIGHT_MS + 600);
  const after = await page.evaluate(earthStateProbe);
  const diffs = diffEarthState(before, after);
  const pending = await page.evaluate(() =>
    window.__eyeinsky.earthMoon.returnPending(),
  );
  result.snapshots.returnToEarth = { before, after, diffs };
  check(
    'return-to-earth-restores-state',
    diffs.length === 0 && !pending && after.clockMode === before.clockMode,
    diffs.length
      ? diffs.join('; ')
      : `igual: cámara, capas [${after.layers}], objetivo ${after.contextKey}, anillo ${after.ring}, pestaña ${after.pane}/${after.expanded}`,
    ['P5-12'],
  );
}

/** Motivo visible: sin marco IAU2006 (época > 2100) → «Marco no disponible». */
export async function checkFrameReason({ page, result, check }) {
  await page.evaluate(() =>
    window.__godsEyeView.sceneClock.setTime('2150-06-01T00:00:00Z'),
  );
  await settle(page, 2_500);
  const state = await page.evaluate(() => {
    const aim = document.querySelector('[data-eye-moon-action="aim-moon"]');
    return {
      status: window.__godsEyeView.moon.getState().status,
      reasonCode: window.__godsEyeView.moon.getState().reason,
      reason: document.querySelector('.eye-moon-reason')?.textContent ?? '',
      disabled: aim?.disabled,
      label: aim?.getAttribute('aria-label'),
    };
  });
  result.snapshots.frameReason = state;
  await page.evaluate(() => window.__godsEyeView.sceneClock.setNow());
  check(
    'disabled-reasons-frame',
    state.status === 'unavailable' &&
      state.disabled === true &&
      state.reason === 'No disponible: Marco no disponible' &&
      /Marco no disponible/.test(state.label),
    `${state.status}/${state.reasonCode}; «${state.reason}»; aria-label «${state.label}»`,
    ['P5-10'],
  );
}

/** reduced-motion: APUNTAR y VOLVER son cortes, no vuelos. */
export async function checkReducedMotion({ page, result, check }) {
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ]);
  const before = await page.evaluate(earthStateProbe);
  await moonAction(page, 'aim-moon');
  await sleep(150);
  const aim = await page.evaluate(aimProbe);
  await moonAction(page, 'return-to-earth');
  await sleep(150);
  const after = await page.evaluate(earthStateProbe);
  const diffs = diffEarthState(before, after);
  result.snapshots.reducedMotion = { aim, diffs };
  check(
    'reduced-motion-cuts',
    centered(aim) && aim.lastFraming.outcome === 'cut' && diffs.length === 0,
    `a 150 ms: Luna en ${JSON.stringify(aim.moonPx)} (${aim.lastFraming?.outcome}); retorno ${diffs.length ? diffs.join('; ') : 'exacto'}`,
    ['P5-17'],
  );
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'no-preference' },
  ]);
}

/** Zoom del navegador al 200 % (CDP): la cabecera sigue alcanzable y legible. */
export async function checkZoom200({ page, result, check, shot }) {
  const client = await page.createCDPSession();
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await settle(page, 600);
  const zoomed = await readHeaderTargets(page);
  result.snapshots.zoom200 = zoomed;
  check(
    'zoom-200-time-strip',
    zoomed.scale === 2 && targetsOk(zoomed),
    `escala ${zoomed.scale}; ${zoomed.targets.length} objetivos; fuera/sin impacto: ${JSON.stringify(zoomed.targets.filter((t) => !t.inside || !t.hit || t.width < MIN_TARGET_PX || t.height < MIN_TARGET_PX).map((t) => t.label))}`,
    ['P5-17'],
  );
  await shot('p5-t8-zoom-200.png');
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await client.detach();
}
