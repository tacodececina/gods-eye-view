/**
 * Recorrido canónico P4 · escenas de estrés y de entorno: A→B con evicción,
 * caída de la fuente, fallos de GLB (404, corrupto), restauración del enlace
 * del fixture 123456, catálogo dense, viewports y zoom 200 %, teléfono,
 * escena E (disable/destroy) y activos con hash.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { screenshot, sleep } from './eyeinsky-p4-run.mjs';
import {
  clickAction,
  dockTargets,
  layerProbe,
  modelEvents,
  modelStats,
  openApp,
  orphanScan,
  probe,
  targetsOk,
  trackById,
  waitForCatalog,
  waitForDock,
  waitModelReady,
} from './eyeinsky-p4-page.mjs';
import { sampleCommands } from './eyeinsky-p4-measure.mjs';
import { FIXTURE_NORAD, installInterception } from './eyeinsky-p4-network.mjs';
import { trackedOnCanvas } from '../eyeinsky-p4-ux-probes.mjs';
import { HST, ISS } from './eyeinsky-p4-walk-core.mjs';

const shot = (ctx, page, name) => screenshot(ctx.result, ctx.out, page, name);

/** P4-10/P4-08: A→B evicta A en el acto y carga B dentro del tope. */
export async function targetSwitch(ctx, page) {
  await trackById(page, ISS);
  await waitForDock(page, ISS);
  await clickAction(page, 'inspect');
  const issReady = await waitModelReady(page, ISS);
  await trackById(page, HST);
  await waitForDock(page, HST);
  await clickAction(page, 'inspect');
  const hstReady = await waitModelReady(page, HST);
  const events = await modelEvents(page);
  const stats = await modelStats(page);
  const evicted = events.find(
    (e) => e.type === 'model-evicted' && e.noradId === ISS,
  );
  ctx.check(
    'a-b-evicta-a-y-carga-b',
    issReady &&
      hstReady &&
      evicted?.reason === 'target-change' &&
      stats.ids.includes(HST) &&
      !stats.ids.includes(ISS) &&
      stats.active + stats.pending <= 2,
    { evicted, stats },
    ['P4-10', 'P4-08'],
  );
  await shot(ctx, page, 'p4-05-hubble-after-iss.png');
}

/** Caída de la fuente: CelesTrak abortado → catálogo previo conservado. */
export async function sourceDown(ctx, page) {
  const count = () =>
    page.evaluate(
      () =>
        window.__godsEyeView.dataManager.layers
          .get('satellites')
          .module.getAllPositions(20000).length,
    );
  const before = { count: await count(), probe: await layerProbe(page) };
  ctx.rules.abortCelestrak = true;
  const refreshed = await page.evaluate(() =>
    window.__godsEyeView.dataManager.refreshLayer('satellites'),
  );
  await sleep(800);
  const after = { count: await count(), probe: await layerProbe(page) };
  ctx.rules.abortCelestrak = false;
  const aborted = ctx.rules.log.filter((entry) => entry.kind === 'abort');
  ctx.check(
    'caida-de-fuente-conserva-catalogo',
    aborted.length > 0 &&
      after.count === before.count &&
      after.probe.selected === before.probe.selected &&
      after.probe.following === before.probe.following,
    {
      refreshed,
      aborted: aborted.length,
      countBefore: before.count,
      countAfter: after.count,
      selected: after.probe.selected,
    },
    'P4-09',
  );
}

/** P4-23: el catálogo dense (Starlink) nunca recibe modelo. */
export async function denseNeverModel(ctx, page) {
  const starlink = await page.evaluate(async () => {
    const text = await (await fetch('/api/celestrak/starlink')).text();
    const line = text.split('\n').find((row) => row.startsWith('1 '));
    return line ? Number(line.slice(2, 7)) : null;
  });
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setLayerParams(
      'satellites',
      { catalog: 'dense' },
      { origin: 'user' },
    ),
  );
  const ready = await page
    .waitForFunction(
      (id) =>
        window.__godsEyeView.dataManager.layers
          .get('satellites')
          .module._catalogGroupForTest(id) === 'dense',
      { timeout: 90_000, polling: 500 },
      starlink,
    )
    .then(() => true)
    .catch(() => false);
  const tracked = ready ? await trackById(page, starlink) : false;
  await sleep(2500);
  const state = await probe(page);
  ctx.result.snapshots.dense = { starlink, ready, tracked, state };
  ctx.check(
    'dense-nunca-recibe-modelo',
    ready &&
      tracked &&
      state.selected === starlink &&
      state.properties?.geometryFidelity === 'none' &&
      !state.stats.ids.includes(starlink) &&
      state.stats.pending === 0,
    {
      starlink,
      fidelity: state.properties?.geometryFidelity,
      stats: state.stats,
    },
    'P4-23',
  );
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setLayerParams(
      'satellites',
      { catalog: 'core' },
      { origin: 'user' },
    ),
  );
  await sleep(1500);
}

/** Lo que un fallo de GLB NO debe tocar. */
const invariantOf = (state) => ({
  selected: state.selected,
  framing: state.framing,
  following: state.following,
  cameraOwner: state.cameraOwner,
  dockKey: state.dockKey,
  hasPoint: state.hasPoint,
  pointShown: state.pointShown,
});

async function faultCase(ctx, page, id, fault) {
  await trackById(page, id);
  await waitForDock(page, id);
  // El modelo sólo se pide cerca: INSPECCIONAR dispara la carga que falla.
  await clickAction(page, 'inspect');
  await sleep(100);
  const before = await probe(page);
  const orbitBefore = await orbitPathCount(page);
  await page
    .waitForFunction(
      (norad) =>
        window.__p4ModelEvents.some(
          (e) => e.type === 'model-failed' && e.noradId === norad,
        ),
      { timeout: 30_000, polling: 250 },
      id,
    )
    .catch(() => null);
  await sleep(600);
  const after = await probe(page);
  const orbitAfter = await orbitPathCount(page);
  // Desde 'inspect' el dock ofrece ÓRBITA; ya en órbita, INSPECCIONAR queda
  // deshabilitado con su motivo visible (modelo no disponible).
  await clickAction(page, 'inspect');
  await sleep(1200);
  const orbit = await probe(page);
  const same =
    JSON.stringify(invariantOf(before)) === JSON.stringify(invariantOf(after));
  ctx.check(
    `glb-${fault}-conserva-norad-punto-orbita-camara-expediente`,
    same &&
      orbitBefore > 0 &&
      orbitAfter === orbitBefore &&
      after.properties?.modelStatus === 'fallido' &&
      after.chips.includes('MODELO NO DISPONIBLE') &&
      orbit.framing === 'orbit' &&
      orbit.selected === id &&
      orbit.inspect?.disabled === true &&
      /no disponible/i.test(orbit.reason ?? ''),
    {
      before: invariantOf(before),
      after: invariantOf(after),
      orbitPaths: [orbitBefore, orbitAfter],
    },
    'P4-09',
  );
}

/** Trazas de órbita (polilíneas de la capa) presentes en la escena. */
const orbitPathCount = (page) =>
  page.evaluate(() => {
    const C = window.__CESIUM__;
    let count = 0;
    const walk = (p) => {
      if (!p || p.isDestroyed?.()) return;
      if (p instanceof C.PrimitiveCollection) {
        for (let i = 0; i < p.length; i += 1) walk(p.get(i));
        return;
      }
      if (p.appearance instanceof C.PolylineColorAppearance && p.show)
        count += 1;
    };
    walk(window.__godsEyeView.viewer.scene.primitives);
    return count;
  });

/** P4-09: 404 en el GLB de la ISS y bytes corruptos en el de Hubble. */
export async function glbFaults(ctx, baseUrl) {
  ctx.rules.glbFaults.set('/models/satellites/iss-', '404');
  ctx.rules.glbFaults.set('/models/satellites/hubble-', 'corrupt');
  const page = await openApp(
    ctx.browser,
    ctx.result,
    baseUrl,
    {
      width: 1280,
      height: 800,
    },
    { beforeGoto: (p) => installInterception(p, ctx.rules) },
  );
  try {
    await faultCase(ctx, page, ISS, '404');
    await faultCase(ctx, page, HST, 'corrupto');
    await shot(ctx, page, 'p4-06-glb-fault.png');
  } finally {
    ctx.rules.glbFaults.clear();
    await page.close();
  }
}

/** P4-02: el enlace compartido del 123456 restaura y sigue ese NORAD. */
export async function restoreShared(ctx) {
  if (!ctx.shareUrl) {
    ctx.check('omm-6-digitos-restaurar-exacto', false, 'sin enlace', 'P4-02');
    return;
  }
  const page = await openApp(
    ctx.browser,
    ctx.result,
    ctx.shareUrl,
    {
      width: 1280,
      height: 800,
    },
    {
      beforeGoto: (p) => installInterception(p, ctx.rules),
      enableSatellites: false,
      requireNorad: null,
    },
  );
  try {
    await waitForCatalog(page, FIXTURE_NORAD, 90_000);
    const restored = await page
      .waitForFunction(
        (id) =>
          window.__godsEyeView.dataManager.layers
            .get('satellites')
            .module.getParams().selectedSatTrackingId === id,
        { timeout: 30_000, polling: 250 },
        FIXTURE_NORAD,
      )
      .then(() => true)
      .catch(() => false);
    await sleep(800);
    const state = await layerProbe(page);
    ctx.check(
      'omm-6-digitos-restaurar-exacto',
      restored &&
        state.selected === FIXTURE_NORAD &&
        state.cameraOwner === `satellites:${FIXTURE_NORAD}`,
      { restored, selected: state.selected, owner: state.cameraOwner },
      'P4-02',
    );
  } finally {
    await page.close();
  }
}

/** P4-13: cinco viewports y zoom 200 % (CDP) con el dock operativo. */
export async function viewports(ctx, page) {
  const sizes = [
    [768, 1024],
    [1024, 768],
    [1366, 768],
    [1920, 1080],
  ];
  await trackById(page, ISS);
  await waitForDock(page, ISS);
  for (const [width, height] of sizes) {
    await page.setViewport({ width, height });
    await sleep(900);
    const layout = await dockTargets(page);
    ctx.check(
      `viewport-${width}x${height}-dock-operativo`,
      targetsOk(layout) &&
        layout.buttons.some((b) => /Inspeccionar/.test(b.label)),
      {
        overflowX: layout.overflowX,
        rail: layout.railValues,
        truncated: layout.railTruncated,
      },
      'P4-13',
    );
  }
  await page.setViewport({ width: 1280, height: 800 });
  await sleep(600);
  const client = await page.createCDPSession();
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  await sleep(500);
  const zoomed = await dockTargets(page);
  ctx.check(
    'zoom-200-dock-alcanzable-y-legible',
    zoomed.scale === 2 && targetsOk(zoomed),
    { scale: zoomed.scale, overflowX: zoomed.overflowX },
    'P4-13',
  );
  await shot(ctx, page, 'p4-07-zoom-200.png');
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await client.detach();
}

/** Teléfono 390×844 (perfil low): riel sin recortes, objetivo sobre canvas. */
export async function phone(ctx, baseUrl) {
  const page = await openApp(ctx.browser, ctx.result, baseUrl, {
    width: 390,
    height: 844,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  try {
    const stats = await modelStats(page);
    await trackById(page, ISS);
    await waitForDock(page, ISS);
    const layout = await dockTargets(page);
    ctx.result.snapshots.phone = layout;
    ctx.check(
      'movil-390-riel-sin-recortes-y-44px',
      stats.profile === 'low' &&
        layout.rail.length === 3 &&
        /^MODELO/.test(layout.rail[2]) &&
        targetsOk(layout),
      {
        profile: stats.profile,
        rail: layout.railValues,
        truncated: layout.railTruncated,
      },
      ['P4-13', 'P4-08'],
    );
    await page.tap('[data-eye-dock-action="inspect"]');
    const ready = await waitModelReady(page, ISS);
    await sleep(1200);
    const hit = await trackedOnCanvas(page, ISS);
    const after = await layerProbe(page);
    ctx.check(
      'movil-inspeccionar-modelo-low-sobre-canvas',
      ready &&
        after.framing === 'inspect' &&
        after.stats.active + after.stats.pending <= 1 &&
        hit.ok &&
        hit.hitTag === 'CANVAS' &&
        hit.y < hit.freeBottomPx,
      { ready, stats: after.stats, hit },
      ['P4-13', 'P4-08'],
    );
    await shot(ctx, page, 'p4-08-mobile-390.png');
  } finally {
    await page.close();
  }
}

/**
 * P4-10: disable/enable no deja modelos ni cargas; la escena E frente a A se
 * registra como dato (P4-24 se juzga fuera del arnés, en la medición).
 */
export async function sceneE(ctx, page, sceneA) {
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('satellites', false, {
      origin: 'user',
    }),
  );
  await sleep(1000);
  const disabled = {
    stats: await modelStats(page),
    orphans: await orphanScan(page),
  };
  await page.evaluate(() =>
    window.__godsEyeView.dataManager.setEnabled('satellites', true, {
      origin: 'user',
    }),
  );
  await waitForCatalog(page, ISS);
  await page.evaluate(() => {
    const C = window.__CESIUM__;
    window.__godsEyeView.viewer.camera.setView({
      destination: C.Cartesian3.fromDegrees(-30, 20, 20_000_000),
    });
  });
  await sleep(6000);
  const sceneE = await sampleCommands(page, 3000);
  ctx.result.snapshots.sceneAE = {
    sceneA,
    sceneE,
    disabled,
    literal: literalSceneAE(sceneA, sceneE),
  };
  ctx.check(
    'disable-no-deja-modelos-ni-pendientes',
    disabled.stats.active === 0 &&
      disabled.stats.pending === 0 &&
      disabled.orphans.length === 0,
    disabled,
    'P4-10',
  );
}

/**
 * P4-24 NO se decide en el arnés: su criterio literal es «E vuelve a los
 * comandos y a la memoria (heap tras GC) de A-off» y «A con modelos no cambia
 * frente a off». Este recorrido corre con ?satModels=std (no hay A-off en la
 * misma página) y el +2 de la PointPrimitiveCollection del EntityCluster sólo
 * puede excluirse como excepción aprobada por Alex, no por el arnés. La
 * lectura literal queda como dato; la matriz remite a scripts/eyeinsky-p4-perf.mjs.
 */
const literalSceneAE = (sceneA, sceneE) => ({
  note: 'dato, no veredicto: P4-24 se juzga en la medición de rendimiento',
  modelCommandsInE: sceneE.lastFrameOwners?.satelliteModel ?? 0,
  commandsP50: [sceneA.p50 ?? null, sceneE.p50 ?? null],
  commandsEqual: sceneA.p50 === sceneE.p50,
  heapMiB: [sceneA.heapMiB ?? null, sceneE.heapMiB ?? null],
});

/** P4-25/P4-05: activos servidos con hash en el nombre y en los ledgers. */
export async function assetLedgers(ctx, baseUrl) {
  const manifestUrl = new URL('/models/satellites/manifest.json', baseUrl);
  const manifest = await (await fetch(manifestUrl)).json();
  const ledgers = {};
  for (const file of [
    'docs/eyeinsky/p4/ASSET-LEDGER.md',
    'docs/eyeinsky/planning/asset-manifest.json',
    'docs/eyeinsky/planning/sources-ledger.json',
    'public/models/README.md',
  ])
    ledgers[file] = await fs.readFile(file, 'utf8');
  const rows = [];
  for (const asset of manifest) {
    const bytes = Buffer.from(
      await (await fetch(new URL(asset.uri, baseUrl))).arrayBuffer(),
    );
    const sha = createHash('sha256').update(bytes).digest('hex');
    const name = asset.uri.split('/').pop();
    rows.push({
      id: asset.id,
      nameHasSha8: name.includes(sha.slice(0, 8)),
      servedShaMatches: sha === asset.sha256 && bytes.length === asset.bytes,
      assetLedger: ledgers['docs/eyeinsky/p4/ASSET-LEDGER.md'].includes(sha),
      planningManifest:
        ledgers['docs/eyeinsky/planning/asset-manifest.json'].includes(sha),
      sourcesLedger: ledgers[
        'docs/eyeinsky/planning/sources-ledger.json'
      ].includes(asset.sourceRevision),
      modelsReadme: ledgers['public/models/README.md'].includes(name),
      termsAndCredit: Boolean(asset.termsUrl && asset.credit),
    });
  }
  ctx.check(
    'activos-hash-en-nombre-y-cuatro-ledgers',
    rows.length === 3 && rows.every((row) => Object.values(row).every(Boolean)),
    rows,
    ['P4-25', 'P4-05'],
  );
}
